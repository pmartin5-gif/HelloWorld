#!/usr/bin/env python3
"""Rebuild an explicitly supplied saved response; never load a model credential."""
import base64
import json
import os
from pathlib import Path
import re
import sys
if __package__:
    from . import ota_build, scene
else:
    import ota_build
    import scene


def prepare():
    expected = os.environ.get('LB_RUNTIME_SOURCE_COMMIT', '')
    ota_build.require(re.fullmatch(r'[a-f0-9]{40}', expected) and expected == os.environ.get('GITHUB_SHA') and
                      os.environ.get('GITHUB_REPOSITORY') == 'pmartin5-gif/HelloWorld' and
                      os.environ.get('GITHUB_REF') == 'refs/heads/main' and
                      os.environ.get('GITHUB_RUN_ATTEMPT') == '1', 'Expected original pinned main run')
    encoded = os.environ.get('LB_SAVED_RESPONSE', '')
    ota_build.require(0 < len(encoded) <= 60000, 'Missing or oversized saved response')
    raw = base64.b64decode(encoded, validate=True)
    record = json.loads(raw)
    ota_build.require(record.get('model') == 'gemini-3.5-flash-lite' and record.get('finish_reason') == 'STOP' and
                      record.get('response_sha256') == scene.digest(record.get('response_text', '').encode()) and
                      re.fullmatch(r'[1-9][0-9]*', record.get('run_id', '')) and
                      record['run_id'] != os.environ.get('GITHUB_RUN_ID'), 'Invalid saved generation')
    scene.validate_function(record['response_text'])
    prompt = record.get('creative_prompt', '')
    brief = (ota_build.PROJECT / 'generationBrief.md').read_bytes()
    ota_build.require(isinstance(prompt, str) and 1 <= len(prompt) <= 2000 and prompt == prompt.strip() and
                      record.get('brief_sha256') == scene.digest(brief), 'Saved prompt/standing brief mismatch')
    work = ota_build.PROJECT / '.build/generated'
    work.mkdir(parents=True, exist_ok=False)
    (work / 'generation.json').write_bytes(raw)
    (work / 'creative-prompt.txt').write_text(prompt)
    print(json.dumps({'savedResponseRunId': record['run_id'], 'responseSha256': record['response_sha256'],
                      'modelRequests': 0, 'published': False}))


if __name__ == '__main__':
    try:
        prepare()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print('STOP: ' + (str(error) if type(error) is ValueError else type(error).__name__), file=sys.stderr)
        sys.exit(1)
