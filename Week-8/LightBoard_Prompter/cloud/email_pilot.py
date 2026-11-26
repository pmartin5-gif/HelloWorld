#!/usr/bin/env python3
"""Bind one fresh email to one generation/build/publication; no device acknowledgment."""
import json
import os
from pathlib import Path
import re
import sys

if __package__:
    from . import ota_publish as ota
else:
    import ota_publish as ota

WORK = ota.ota_build.PROJECT / '.build/generated'
WORKFLOW = '.github/workflows/lightboard-email-pilot.yml'


def brief_document():
    override = os.environ.get('LB_GENERATION_BRIEF', '')
    if not override:
        return (ota.ota_build.PROJECT / 'generationBrief.md').read_bytes()
    ota.require(override == override.strip() and len(override.encode()) <= 4000 and
                override.count('{{creative_prompt}}') == 1 and '```' not in override and
                not re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]', override), 'Invalid prompt-lab brief')
    return ('```text\n' + override + '\n```\n').encode()


def binding():
    email_id = os.environ.get('LB_EMAIL_JOB_ID', '')
    dispatch = os.environ.get('LB_EMAIL_DISPATCH_ID', '')
    prompt = os.environ.get('CREATIVE_PROMPT', '')
    digest = os.environ.get('LB_EMAIL_PROMPT_SHA256', '')
    commit = os.environ.get('LB_EMAIL_SOURCE_COMMIT', '')
    ota.require(re.fullmatch(r'lb-[a-f0-9]{12}-[a-zA-Z0-9]{1,64}', email_id) and
                re.fullmatch(r'email_[a-f0-9]{32}', dispatch), 'Invalid email reservation')
    ota.require(1 <= len(prompt) <= 2000 and len(prompt.encode()) <= 6000 and prompt == prompt.strip() and
                ota.sha(prompt.encode()) == digest, 'Email prompt hash/length mismatch')
    ota.require(re.fullmatch(r'[a-f0-9]{40}', commit) and commit == os.environ.get('GITHUB_SHA') and
                os.environ.get('GITHUB_REPOSITORY') == ota.delivery.REPOSITORY and
                os.environ.get('GITHUB_REF') == 'refs/heads/main' and
                os.environ.get('GITHUB_RUN_ATTEMPT') == '1', 'Expected original main-branch run')
    ota.tag_name(os.environ.get('GITHUB_RUN_ID'), '1')
    return {'schemaVersion': 1, 'operation': 'email_pilot', 'jobId': email_id, 'dispatchId': dispatch,
            'promptSha256': digest, 'commitSha': commit, 'repository': ota.delivery.REPOSITORY,
            'runId': os.environ['GITHUB_RUN_ID'], 'runAttempt': 1, 'workflowPath': WORKFLOW,
            'briefSha256': ota.sha(brief_document())}


def prepare():
    data = binding()  # Before any model request.
    WORK.mkdir(parents=True, exist_ok=True)
    with (WORK / 'creative-prompt.txt').open('x') as out:
        out.write(os.environ['CREATIVE_PROMPT'])
    with (WORK / 'email-binding.json').open('x') as out:
        json.dump(data, out)
    with (WORK / 'brief.md').open('xb') as out:
        out.write(brief_document())
    print('EMAIL_PROMPT_BOUND: ' + json.dumps(data, sort_keys=True))


def result():
    data = binding()
    ota.require(json.loads((WORK / 'email-binding.json').read_text()) == data, 'Email binding changed')
    ota.require(ota.sha((WORK / 'brief.md').read_bytes()) == data['briefSha256'], 'Bound brief changed')
    m = json.loads((ota.ota_build.PROJECT / '.build/prompt-ota/package/manifest.json').read_text())
    ota.validate_manifest(m, True)
    ota.require(m['automatic_updates'] is True and m['build']['run_id'] == data['runId'] and
                m['build']['commit_sha'] == data['commitSha'] and
                m['generation']['run_id'] == data['runId'] and
                m['generation']['model_request_in_this_run'] is True, 'Expected this email generation/publication')
    data.update(result='published', published=True, modelRequests=1, automaticUpdates=True,
                deviceConfirmed=False, foundation=m['foundation_id'], version=m['current']['version'],
                sha256=m['current']['sha256'], bytes=m['current']['bytes'], feedUrl=ota.delivery.FEED_URL)
    print('LB_QUEUE_RESULT: ' + json.dumps(data, sort_keys=True, separators=(',', ':')))
    return data


if __name__ == '__main__':
    try:
        ota.require(len(sys.argv) == 2 and sys.argv[1] in ('prepare', 'result'), 'Use prepare or result')
        prepare() if sys.argv[1] == 'prepare' else result()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print('STOP: ' + (str(error) if type(error) is ValueError else type(error).__name__), file=sys.stderr)
        sys.exit(1)
