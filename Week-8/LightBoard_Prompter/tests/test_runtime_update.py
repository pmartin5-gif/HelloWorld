"""Saved-response maintenance preflight; no network or generation."""
import base64
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from cloud import runtime_update, scene


class RuntimeUpdateTests(unittest.TestCase):
    def test_exact_saved_response_is_retained_and_rerun_cannot_overwrite_it(self):
        with tempfile.TemporaryDirectory() as folder:
            project = Path(folder)
            brief = b'```text\nUse {{creative_prompt}}\n```\n'
            (project/'generationBrief.md').write_bytes(brief)
            function = 'void restState(unsigned long now) { display.fillScreen(0); }'
            record = {'model':'gemini-3.5-flash-lite','finish_reason':'STOP','run_id':'99',
                      'response_text':function,'response_sha256':scene.digest(function.encode()),
                      'creative_prompt':'A blue wave','brief_sha256':scene.digest(brief)}
            raw = json.dumps(record).encode()
            env = {'LB_RUNTIME_SOURCE_COMMIT':'a'*40,'GITHUB_SHA':'a'*40,
                   'GITHUB_REPOSITORY':'pmartin5-gif/HelloWorld','GITHUB_REF':'refs/heads/main',
                   'GITHUB_RUN_ATTEMPT':'1','GITHUB_RUN_ID':'123',
                   'LB_SAVED_RESPONSE':base64.b64encode(raw).decode()}
            with patch.object(runtime_update.ota_build,'PROJECT',project), patch.dict(os.environ,env,clear=True):
                runtime_update.prepare()
                self.assertEqual((project/'.build/generated/generation.json').read_bytes(),raw)
                with self.assertRaises(FileExistsError): runtime_update.prepare()

    def test_source_mismatch_stops_before_saved_record_is_written(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(runtime_update.ota_build,'PROJECT',Path(folder)), \
                patch.dict(os.environ,{'LB_RUNTIME_SOURCE_COMMIT':'a'*40,'GITHUB_SHA':'b'*40},clear=True):
            with self.assertRaisesRegex(ValueError,'pinned main'): runtime_update.prepare()
            self.assertFalse((Path(folder)/'.build').exists())
