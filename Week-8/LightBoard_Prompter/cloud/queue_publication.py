#!/usr/bin/env python3
"""Publish only an exact rebuild of one verified saved-heart queue result. Never generate or install."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

if __package__:
    from . import ota_publish, queue_binding as qb
else:
    import ota_publish
    import queue_binding as qb

WORKFLOW = '.github/workflows/lightboard-queue-publish.yml'
ROOT = qb.PROJECT / '.build/queue-publication'
FOUNDATION = 'f1244292bbdf180ad5ea8b4ffbf46c72b9772ef8ad2407276ae26e3786132522'
PROMPT = 'An overflowing heart that keeps giving'


def require(ok):
    if not ok:
        raise ValueError('Queue publication verification stopped')


def digest(value):
    return qb.sha(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url, limit, token=None):
    headers = {'Accept': 'application/vnd.github+json' if token else 'text/plain',
               'User-Agent': 'Lightboard-queue-publication', 'X-GitHub-Api-Version': '2026-03-10'}
    if token:
        require(url.startswith(f'https://api.github.com/repos/{qb.REPOSITORY}/'))
        headers['Authorization'] = 'Bearer ' + token
    opener = urllib.request.build_opener(NoRedirect())
    try:
        response = opener.open(urllib.request.Request(url, headers=headers), timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        status, location = response.code, response.headers.get('Location', '')
        data = response.read(limit + 1)
    require(len(data) <= limit)
    return status, location, data


def prior_result(run_id, token):
    def api(path):
        status, _, data = fetch(f'https://api.github.com/repos/{qb.REPOSITORY}' + path, 2000000, token)
        require(status == 200)
        return json.loads(data)
    run = api('/actions/runs/' + run_id)
    require(run['status'] == 'completed' and run['conclusion'] == 'success' and run['run_attempt'] == 1 and
            run['event'] == 'workflow_dispatch' and run['path'] == qb.WORKFLOW and
            run['head_branch'] == 'main' and run['repository']['full_name'] == qb.REPOSITORY and
            run['repository']['private'] is False)
    jobs = api(f'/actions/runs/{run_id}/attempts/1/jobs?per_page=100')
    require(jobs['total_count'] == 1 and len(jobs['jobs']) == 1)
    job = jobs['jobs'][0]
    require(job['run_id'] == int(run_id) and job['name'] == 'generate-and-compile' and
            job['status'] == 'completed' and job['conclusion'] == 'success')
    steps = [s for s in job['steps'] if s['name'] == 'Record queue result']
    require(len(steps) == 1 and steps[0]['conclusion'] == 'success' and type(steps[0]['number']) is int)
    status, location, data = fetch(f'https://api.github.com/repos/{qb.REPOSITORY}/actions/jobs/'
        f"{job['id']}/steps/{steps[0]['number']}/logs", 65536, token)
    if status == 302:
        require(re.fullmatch(r'https://[a-zA-Z0-9.-]+\.(blob\.core\.windows\.net|actions\.githubusercontent\.com)/[^\s#]*', location))
        status, _, data = fetch(location, 65536)  # Never forward token to log storage.
    require(status == 200)
    matches = re.findall(r'^(?:\d{4}-\d\d-\d\dT[0-9:.]+Z\s+)?LB_QUEUE_RESULT: (\{[^\r\n]*\})\r?$',
                         data.decode('utf-8-sig'), re.MULTILINE)
    require(len(matches) == 1)
    return run, json.loads(matches[0])


def identity(env):
    names = ('QUEUE_JOB_ID', 'QUEUE_DISPATCH_ID', 'PRIOR_BUILD_RUN_ID', 'PRIOR_RESULT_SHA256', 'PROMPT_SHA256')
    job, dispatch, prior, prior_sha, prompt_sha = [env.get(k, '') for k in names]
    require(re.fullmatch(r'lb-[a-f0-9]{12}-[a-zA-Z0-9]{1,64}', job) and
            re.fullmatch(r'gh_[a-f0-9]{32}', dispatch) and re.fullmatch(r'[1-9][0-9]{0,19}', prior) and
            re.fullmatch(r'[a-f0-9]{64}', prior_sha) and prompt_sha == qb.sha(PROMPT.encode()))
    require(env.get('PUBLICATION_APPROVED') == 'true' and env.get('GITHUB_REPOSITORY') == qb.REPOSITORY and
            env.get('GITHUB_REF') == 'refs/heads/main' and env.get('GITHUB_RUN_ATTEMPT') == '1' and
            env.get('GITHUB_WORKFLOW_REF') == f'{qb.REPOSITORY}/{WORKFLOW}@refs/heads/main' and
            re.fullmatch(r'[a-f0-9]{40}', env.get('GITHUB_SHA', '')) and
            re.fullmatch(r'[1-9][0-9]*', env.get('GITHUB_RUN_ID', '')) and prior != env['GITHUB_RUN_ID'])
    return dict(schemaVersion=1, operation='publication', jobId=job, dispatchId=dispatch,
        priorBuildRunId=prior, priorResultSha256=prior_sha, promptSha256=prompt_sha,
        runId=env['GITHUB_RUN_ID'], runAttempt=1, commitSha=env['GITHUB_SHA'],
        repository=qb.REPOSITORY, workflowPath=WORKFLOW)


def validate_prior(run, report, request):
    saved = json.loads(qb.SAVED.read_text())
    require(digest(report) == request['priorResultSha256'] and report['schemaVersion'] == 1 and
            report['jobId'] == request['jobId'] and report['runId'] == request['priorBuildRunId'] and
            report['runId'] == str(run['id']) and report['commitSha'] == run['head_sha'] and
            report['promptSha256'] == request['promptSha256'] and report['result'] == 'built' and
            report['repository'] == qb.REPOSITORY and report['workflowPath'] == qb.WORKFLOW and
            report['runAttempt'] == 1 and report['savedGenerationRunId'] == '42735010470' and
            report['responseSha256'] == saved['response_sha256'] and report['foundation'] == FOUNDATION and
            report['modelRequests'] == 0 and report['published'] is False and
            report['automaticUpdates'] is False and report['deviceConfirmed'] is False and
            run['display_title'] == f"Lightboard queue {request['jobId']} {report['dispatchId']}")
    require(re.fullmatch(r'ota-pilot-[a-f0-9]{24}', report['version']) and
            re.fullmatch(r'[a-f0-9]{64}', report['sha256']) and type(report['bytes']) is int and
            288 <= report['bytes'] <= 1310720)


def prepare(folder, env, reader=prior_result):
    request = identity(env)
    run, report = reader(request['priorBuildRunId'], env['GH_TOKEN'])
    validate_prior(run, report, request)
    require(not folder.exists())
    folder.mkdir(parents=True)
    (folder / 'request.json').write_text(json.dumps(request, sort_keys=True) + '\n')
    (folder / 'prior-result.json').write_text(json.dumps(report, sort_keys=True) + '\n')
    (folder / 'creative-prompt.txt').write_text(PROMPT + '\n')
    return request


def load(folder, env):
    request = identity(env)
    require(json.loads((folder / 'request.json').read_text()) == request)
    prior = json.loads((folder / 'prior-result.json').read_text())
    require(digest(prior) == request['priorResultSha256'])
    return request, prior


def publish(folder, env, publisher=None):
    request, prior = load(folder, env)
    require(not (folder / 'publication-started').exists() and not (folder / 'verified-publication.json').exists())
    package = folder / 'build/package'
    manifest = json.loads((package / 'manifest.json').read_text())
    ota_publish.validate_manifest(manifest, False)
    require(manifest['build'] == dict(run_id=request['runId'], attempt='1', commit_sha=request['commitSha']) and
            manifest['generation'] == dict(run_id='42735010470', response_sha256=prior['responseSha256'],
                                           model_request_in_this_run=False))
    require(manifest['foundation_id'] == prior['foundation'] and
            all(manifest['current'][k] == prior[k] for k in ('version', 'bytes', 'sha256')))
    require((folder / 'creative-prompt.txt').read_text().strip() == PROMPT)
    (folder / 'publication-started').write_text(request['dispatchId'])
    if publisher is None:
        publisher = lambda p: ota_publish.publish(p, ota_publish.delivery.GitHub(env['GH_TOKEN']))
    published = publisher(package)
    ota_publish.validate_manifest(published, True)
    require(published['build'] == manifest['build'] and published['current'] == manifest['current'] and
            published['foundation_id'] == prior['foundation'])
    (folder / 'verified-publication.json').write_text(json.dumps(published, sort_keys=True) + '\n')
    return published


def result(folder, env):
    request, prior = load(folder, env)
    report = request | dict(result='publication_unconfirmed', modelRequests=0,
        published=None if (folder / 'publication-started').exists() else False,
        automaticUpdates=False, deviceConfirmed=False)
    path = folder / 'verified-publication.json'
    if env.get('PUBLICATION_OUTCOME') == 'success' and path.exists():
        manifest = json.loads(path.read_text())
        ota_publish.validate_manifest(manifest, True)
        require(manifest['build'] == dict(run_id=request['runId'], attempt='1', commit_sha=request['commitSha']) and
                manifest['foundation_id'] == prior['foundation'] and
                all(manifest['current'][k] == prior[k] for k in ('version', 'bytes', 'sha256')))
        report.update(result='published', published=True, foundation=manifest['foundation_id'],
            version=manifest['current']['version'], bytes=manifest['current']['bytes'],
            sha256=manifest['current']['sha256'], releaseTag=manifest['current']['release_tag'],
            manifestSha256=qb.sha((folder / 'build/package/manifest.json').read_bytes()),
            firmwareUrl=manifest['current']['url'], feedUrl=ota_publish.delivery.FEED_URL)
        report['assetSha256'] = {name: qb.sha((folder / 'build/package' / name).read_bytes())
                                for name in ota_publish.ASSETS}
        report['assetBytes'] = {name: (folder / 'build/package' / name).stat().st_size
                               for name in ota_publish.ASSETS}
        require(report['assetSha256']['firmware.bin'] == prior['sha256'] and
                report['assetBytes']['firmware.bin'] == prior['bytes'])
    print('LB_QUEUE_RESULT: ' + json.dumps(report, sort_keys=True, separators=(',', ':')))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('prepare', 'publish', 'result'))
    parser.add_argument('--folder', type=Path, default=ROOT)
    args = parser.parse_args()
    globals()[args.operation](args.folder, os.environ)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, urllib.error.URLError):
        print('STOP: Queue publication could not be verified; inspect the same run before any retry.', file=sys.stderr)
        sys.exit(1)
