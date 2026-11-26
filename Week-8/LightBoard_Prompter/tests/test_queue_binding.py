"""Focused Actions queue request/result contract tests; no model, compiler or network."""
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud import queue_binding as qb


class QueueBindingTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name) / 'generated'
        self.package = Path(temporary.name) / 'package'
        self.prompt = 'An overflowing heart that keeps giving'
        self.env = dict(CREATIVE_PROMPT=self.prompt, LB_QUEUE_JOB_ID='lb-' + 'a' * 12 + '-abc123',
            LB_QUEUE_DISPATCH_ID='gh_' + 'b' * 32, LB_QUEUE_PROMPT_SHA256=qb.sha(self.prompt.encode()),
            LB_PUBLISH='false', LB_REUSE='true', GITHUB_REPOSITORY=qb.REPOSITORY,
            GITHUB_REF='refs/heads/main', GITHUB_WORKFLOW_REF=f'{qb.REPOSITORY}/{qb.WORKFLOW}@refs/heads/main',
            GITHUB_RUN_ID='1234', GITHUB_RUN_ATTEMPT='1', GITHUB_SHA='c' * 40)

    def test_manual_prompt_still_saves_exact_normalized_data_without_queue_record(self):
        prompt = '  Blue ♥\n  interior  spacing  '
        self.assertIsNone(qb.prepare(self.folder, dict(CREATIVE_PROMPT=prompt)))
        self.assertEqual((self.folder / 'creative-prompt.txt').read_text(), prompt.strip() + '\n')
        self.assertFalse((self.folder / 'queue-request.json').exists())
        qb.prepare(self.folder / 'unicode', dict(CREATIVE_PROMPT='♥' * 2000))
        qb.prepare(self.folder / 'astral', dict(CREATIVE_PROMPT='🌊' * 2000))

    def test_complete_request_binds_exact_prompt_identity_and_preserves_existing_work(self):
        record = qb.prepare(self.folder, self.env)
        self.assertEqual(record['promptSha256'], self.env['LB_QUEUE_PROMPT_SHA256'])
        self.assertEqual(record['commitSha'], self.env['GITHUB_SHA'])
        self.assertEqual(record['runId'], '1234')
        saved = (self.folder / 'queue-request.json').read_bytes()
        with self.assertRaises(ValueError):
            qb.prepare(self.folder, self.env)
        self.assertEqual((self.folder / 'queue-request.json').read_bytes(), saved)

    def test_partial_binding_bad_identity_rerun_and_prompt_substitution_stop_before_output(self):
        for field, value in [('LB_QUEUE_JOB_ID', ''), ('LB_QUEUE_DISPATCH_ID', 'bad'),
                ('LB_QUEUE_PROMPT_SHA256', '0' * 64), ('GITHUB_SHA', 'bad'),
                ('GITHUB_RUN_ATTEMPT', '2'), ('GITHUB_REPOSITORY', 'other/repo'),
                ('GITHUB_REF', 'refs/heads/other'), ('GITHUB_WORKFLOW_REF', 'other.yml'),
                ('CREATIVE_PROMPT', 'A warm light in a blue vessel')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                qb.prepare(self.folder, self.env | {field: value})
            self.assertFalse(self.folder.exists())

    def test_queue_can_never_authorize_new_generation_or_publication(self):
        for overrides in [dict(LB_PUBLISH='true'), dict(LB_REUSE='false'), dict(LB_REUSE='')]:
            with self.assertRaises(ValueError):
                qb.prepare(self.folder, self.env | overrides)
            self.assertFalse(self.folder.exists())

    def test_failed_build_reports_bound_nonpublication_without_claiming_compilation(self):
        qb.prepare(self.folder, self.env)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            report = qb.result(self.folder, self.package, self.env | dict(LB_BUILD_OUTCOME='failure'))
        self.assertEqual(report['result'], 'failed')
        self.assertFalse(report['published'])
        self.assertTrue(report['publicationAbsenceVerified'])
        self.assertEqual(report['modelRequests'], 0)
        self.assertNotIn('bytes', report)
        self.assertEqual(len(stdout.getvalue().splitlines()), 1)
        self.assertEqual(json.loads(stdout.getvalue().split('LB_QUEUE_RESULT: ')[1]), report)
        self.assertNotIn(self.prompt, stdout.getvalue())

    def test_success_requires_eligible_manifest_exact_generation_and_same_run_commit(self):
        request = qb.prepare(self.folder, self.env)
        generation = json.loads(qb.SAVED.read_text())
        (self.folder / 'generation.json').write_text(json.dumps(generation))
        self.package.mkdir()
        manifest = dict(published=False, automatic_updates=False, foundation_id='d' * 64,
            build=dict(run_id='1234', attempt='1', commit_sha='c' * 40),
            generation=dict(run_id='42735010470', response_sha256=request['responseSha256'],
                model_request_in_this_run=False), current=dict(version='ota-pilot-' + 'e' * 24,
                sha256='f' * 64, bytes=1012016))
        (self.package / 'manifest.json').write_text(json.dumps(manifest))
        # The existing OTA validator owns package eligibility; this test isolates queue bindings.
        with patch('cloud.ota_publish.validate_manifest') as validate, contextlib.redirect_stdout(io.StringIO()):
            report = qb.result(self.folder, self.package, self.env | dict(LB_BUILD_OUTCOME='success'))
        validate.assert_called_once_with(manifest, False)
        self.assertEqual(report['result'], 'built')
        self.assertEqual(report['bytes'], 1012016)
        for field, value in [('run_id', '5678'), ('commit_sha', 'a' * 40), ('attempt', '2')]:
            changed = manifest | {'build': manifest['build'] | {field: value}}
            (self.package / 'manifest.json').write_text(json.dumps(changed))
            with patch('cloud.ota_publish.validate_manifest'), self.assertRaises(ValueError):
                qb.result(self.folder, self.package, self.env | dict(LB_BUILD_OUTCOME='success'))

    def test_altered_request_and_generation_never_emit_a_success_marker(self):
        qb.prepare(self.folder, self.env)
        path = self.folder / 'queue-request.json'
        record = json.loads(path.read_text()); record['jobId'] += '1'; path.write_text(json.dumps(record))
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout), self.assertRaises(ValueError):
            qb.result(self.folder, self.package, self.env | dict(LB_BUILD_OUTCOME='failure'))
        self.assertNotIn('LB_QUEUE_RESULT:', stdout.getvalue())

    def test_real_manifest_validator_accepts_bound_build_and_refuses_ineligible_result(self):
        from cloud import ota_publish as ota
        request = qb.prepare(self.folder, self.env)
        (self.folder / 'generation.json').write_bytes(qb.SAVED.read_bytes())
        lock, baseline, foundation, baseline_version, _ = ota.known_source('baseline')
        _, heart, _, heart_version, _ = ota.known_source('saved-heart')
        tag = ota.tag_name('1234', '1')
        def entry(filename, version, source):
            return dict(version=version, release_tag=tag, url=ota.asset_url(tag, filename),
                        bytes=1012016, sha256='f' * 64, source_sha256=qb.sha(source.encode()))
        manifest = dict(schema_version=2, repository=qb.REPOSITORY, channel='ota-pilot',
            device='esp32-32x32', foundation_id=foundation, fqbn=lock['fqbn'], ota_enabled=True,
            published=False, automatic_updates=False, scene='generated',
            generation=dict(run_id='42735010470', response_sha256=request['responseSha256'],
                            model_request_in_this_run=False),
            build=dict(run_id='1234', attempt='1', commit_sha='c' * 40),
            current=entry('firmware.bin', heart_version, heart),
            usb_recovery=entry('recovery.bin', baseline_version, baseline),
            usb_recovery_scope=ota.RECOVERY_SCOPE, previous=None, legacy_delivery_test=None, superseded_ota=None)
        self.package.mkdir()
        path = self.package / 'manifest.json'; path.write_text(json.dumps(manifest))
        with contextlib.redirect_stdout(io.StringIO()):
            report = qb.result(self.folder, self.package, self.env | dict(LB_BUILD_OUTCOME='success'))
        self.assertEqual(report['foundation'], foundation)
        self.assertEqual(report['promptSha256'], qb.sha(self.prompt.encode()))
        manifest['current']['bytes'] = 1310721; path.write_text(json.dumps(manifest))
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout), self.assertRaises(ValueError):
            qb.result(self.folder, self.package, self.env | dict(LB_BUILD_OUTCOME='success'))
        self.assertNotIn('LB_QUEUE_RESULT:', stdout.getvalue())

    def test_workflow_keeps_queue_model_and_publication_guards_outside_preflight(self):
        workflow = (qb.PROJECT.parents[1] / '.github/workflows/lightboard-prompt-build.yml').read_text()
        guard = "inputs.queue_job_id == '' && inputs.queue_dispatch_id == '' && inputs.queue_prompt_sha256 == ''"
        self.assertIn('!inputs.reuse_saved_generation && ' + guard, workflow)
        self.assertIn('success() && inputs.publish && ' + guard, workflow)
        self.assertLess(workflow.index('queue_binding.py prepare'), workflow.index('Install the pinned Arduino CLI'))
        self.assertIn('name: Record queue result', workflow)
        self.assertNotIn('upload-artifact', workflow)


if __name__ == '__main__':
    unittest.main()
