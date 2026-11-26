"""Brief binding before generation; no model, build, GitHub or board requests."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud import email_pilot as pilot

PROMPT = 'A blue wave'
ENV = {'GITHUB_SHA': 'a'*40, 'LB_EMAIL_SOURCE_COMMIT': 'a'*40,
       'GITHUB_REPOSITORY': 'pmartin5-gif/HelloWorld', 'GITHUB_REF': 'refs/heads/main',
       'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1', 'CREATIVE_PROMPT': PROMPT,
       'LB_EMAIL_JOB_ID': 'lb-123456789abc-lab123', 'LB_EMAIL_DISPATCH_ID': 'email_'+'b'*32,
       'LB_EMAIL_PROMPT_SHA256': hashlib.sha256(PROMPT.encode()).hexdigest()}


class LabBriefTests(unittest.TestCase):
    def test_default_email_keeps_exact_standing_brief_bytes(self):
        with patch.dict(os.environ, ENV, clear=True), tempfile.TemporaryDirectory() as folder, \
                patch.object(pilot, 'WORK', Path(folder)/'generated'):
            pilot.prepare()
            self.assertEqual((pilot.WORK/'brief.md').read_bytes(),
                             (pilot.ota.ota_build.PROJECT/'generationBrief.md').read_bytes())
            binding = json.loads((pilot.WORK/'email-binding.json').read_text())
            self.assertEqual(binding['briefSha256'], pilot.ota.sha((pilot.WORK/'brief.md').read_bytes()))

    def test_edited_brief_is_frozen_and_hash_bound_before_model_request(self):
        raw = 'Use blue light ♥. Prompt: {{creative_prompt}}'
        with patch.dict(os.environ, dict(ENV, LB_GENERATION_BRIEF=raw), clear=True), \
                tempfile.TemporaryDirectory() as folder, patch.object(pilot, 'WORK', Path(folder)/'generated'):
            pilot.prepare()
            self.assertEqual((pilot.WORK/'brief.md').read_bytes(), ('```text\n'+raw+'\n```\n').encode())
            self.assertEqual(pilot.binding()['briefSha256'], pilot.ota.sha(pilot.brief_document()))
            (pilot.WORK/'brief.md').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'Bound brief changed'):
                pilot.result()

    def test_invalid_override_or_rerun_stops_before_writing_inputs(self):
        for raw in ('missing', '{{creative_prompt}} {{creative_prompt}}', '```{{creative_prompt}}',
                    'x'*4000+'{{creative_prompt}}', 'bad\x01{{creative_prompt}}'):
            with patch.dict(os.environ, dict(ENV, LB_GENERATION_BRIEF=raw), clear=True), \
                    tempfile.TemporaryDirectory() as folder, patch.object(pilot, 'WORK', Path(folder)/'generated'):
                with self.assertRaises(ValueError): pilot.prepare()
                self.assertFalse(pilot.WORK.exists())
        with patch.dict(os.environ, dict(ENV, GITHUB_RUN_ATTEMPT='2'), clear=True):
            with self.assertRaises(ValueError): pilot.binding()


if __name__ == '__main__': unittest.main()
