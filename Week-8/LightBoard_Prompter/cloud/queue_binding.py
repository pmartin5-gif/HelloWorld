#!/usr/bin/env python3
"""Bind a saved-response-only queue request/result to one Actions run. No network."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys

PROJECT = Path(__file__).resolve().parents[1]
REPOSITORY = 'pmartin5-gif/HelloWorld'
WORKFLOW = '.github/workflows/lightboard-prompt-build.yml'
SAVED = PROJECT / 'experiments/flash-lite/2026-11-09/cloud-run-42735010470/generation.json'


def require(ok):
    if not ok:
        raise ValueError('Queue binding rejected; no queue build or publication authorized')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def binding(env, prompt):
    fields = [env.get(k, '') for k in ('LB_QUEUE_JOB_ID', 'LB_QUEUE_DISPATCH_ID', 'LB_QUEUE_PROMPT_SHA256')]
    if not any(fields):
        return None
    job, dispatch, prompt_hash = fields
    require(bool(re.fullmatch(r'lb-[a-f0-9]{12}-[a-zA-Z0-9]{1,64}', job)) and
            bool(re.fullmatch(r'gh_[a-f0-9]{32}', dispatch)) and
            prompt_hash == sha(prompt.encode('utf-8')))
    require(env.get('LB_PUBLISH') == 'false' and env.get('LB_REUSE') == 'true')
    require(env.get('GITHUB_REPOSITORY') == REPOSITORY and env.get('GITHUB_REF') == 'refs/heads/main' and
            env.get('GITHUB_WORKFLOW_REF') == f'{REPOSITORY}/{WORKFLOW}@refs/heads/main' and
            env.get('GITHUB_RUN_ATTEMPT') == '1' and
            bool(re.fullmatch(r'[1-9][0-9]*', env.get('GITHUB_RUN_ID', ''))) and
            bool(re.fullmatch(r'[a-f0-9]{40}', env.get('GITHUB_SHA', ''))))
    saved = json.loads(SAVED.read_text())
    require(prompt == saved['creative_prompt'] and saved['run_id'] == '42735010470' and
            saved['response_sha256'] == sha(saved['response_text'].encode()))
    return dict(schemaVersion=1, jobId=job, dispatchId=dispatch, promptSha256=prompt_hash,
                runId=env['GITHUB_RUN_ID'], runAttempt=1, commitSha=env['GITHUB_SHA'],
                repository=REPOSITORY, workflowPath=WORKFLOW, savedGenerationRunId=saved['run_id'],
                responseSha256=saved['response_sha256'])


def prepare(folder, env):
    prompt = env.get('CREATIVE_PROMPT', '').strip()
    require(1 <= len(prompt) <= 2000)
    request = binding(env, prompt)  # Before toolchain setup, generation or compilation.
    folder.mkdir(parents=True, exist_ok=True)
    prompt_file = folder / 'creative-prompt.txt'
    require(not prompt_file.exists() and not (folder / 'queue-request.json').exists())
    prompt_file.write_text(prompt + '\n', encoding='utf-8')
    if request:
        (folder / 'queue-request.json').write_text(json.dumps(request, sort_keys=True) + '\n')
    return request


def result(folder, package, env):
    prompt = (folder / 'creative-prompt.txt').read_text(encoding='utf-8').strip()
    expected = binding(env, prompt)
    require(expected is not None and json.loads((folder / 'queue-request.json').read_text()) == expected)
    outcome = env.get('LB_BUILD_OUTCOME')
    require(outcome in ('success', 'failure', 'cancelled'))
    report = expected | dict(result='failed', published=False, modelRequests=0,
                            publicationAbsenceVerified=True, automaticUpdates=False, deviceConfirmed=False)
    if outcome == 'success':
        if __package__:
            from . import ota_publish
        else:
            import ota_publish
        manifest = json.loads((package / 'manifest.json').read_text())
        ota_publish.validate_manifest(manifest, False)
        generation = json.loads((folder / 'generation.json').read_text())
        require(generation['creative_prompt'] == prompt and
                generation['response_sha256'] == expected['responseSha256'] and
                generation['run_id'] == expected['savedGenerationRunId'] and
                manifest['build'] == dict(run_id=expected['runId'], attempt='1', commit_sha=expected['commitSha']) and
                manifest['generation'] == dict(run_id=expected['savedGenerationRunId'],
                    response_sha256=expected['responseSha256'], model_request_in_this_run=False) and
                manifest['published'] is False and manifest['automatic_updates'] is False)
        report.update(result='built', foundation=manifest['foundation_id'], version=manifest['current']['version'],
                      sha256=manifest['current']['sha256'], bytes=manifest['current']['bytes'])
    print('LB_QUEUE_RESULT: ' + json.dumps(report, sort_keys=True, separators=(',', ':')))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('prepare', 'result'))
    parser.add_argument('--folder', type=Path, default=PROJECT / '.build/generated')
    parser.add_argument('--package', type=Path, default=PROJECT / '.build/prompt-ota/package')
    args = parser.parse_args()
    if args.operation == 'prepare':
        prepare(args.folder, os.environ)
    else:
        result(args.folder, args.package, os.environ)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError):
        print('STOP: Queue request/result verification failed.', file=sys.stderr)
        sys.exit(1)
