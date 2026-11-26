"""Queue publication policy only: synthetic metadata and mocked network/publisher, no compiler."""
import contextlib
import copy
import io
import json
import re
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud import queue_publication as qp


class QueuePublicationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name) / 'publication'
        self.old = json.loads((qp.qb.SAVED).read_text())
        self.image = b'\xe9' + b'x' * 1012015  # Synthetic fixture, never flashable firmware.
        self.prior = dict(schemaVersion=1, jobId='lb-' + 'a' * 12 + '-abc', dispatchId='gh_' + 'b' * 32,
            promptSha256=qp.qb.sha(qp.PROMPT.encode()), result='built', runId='1234', runAttempt=1,
            commitSha='c' * 40, repository=qp.qb.REPOSITORY, workflowPath=qp.qb.WORKFLOW,
            savedGenerationRunId='42735010470', responseSha256=self.old['response_sha256'],
            foundation=qp.FOUNDATION, modelRequests=0, published=False, automaticUpdates=False,
            deviceConfirmed=False, version='ota-pilot-' + 'd' * 24, sha256=qp.qb.sha(self.image), bytes=1012016)
        self.run = dict(id=1234, head_sha='c' * 40,
            display_title=f"Lightboard queue {self.prior['jobId']} {self.prior['dispatchId']}")
        self.env = dict(QUEUE_JOB_ID=self.prior['jobId'], QUEUE_DISPATCH_ID='gh_' + 'f' * 32,
            PRIOR_BUILD_RUN_ID='1234', PRIOR_RESULT_SHA256=qp.digest(self.prior),
            PROMPT_SHA256=self.prior['promptSha256'], PUBLICATION_APPROVED='true',
            GITHUB_REPOSITORY=qp.qb.REPOSITORY, GITHUB_REF='refs/heads/main', GITHUB_RUN_ID='5678',
            GITHUB_RUN_ATTEMPT='1', GITHUB_SHA='1' * 40,
            GITHUB_WORKFLOW_REF=f'{qp.qb.REPOSITORY}/{qp.WORKFLOW}@refs/heads/main', GH_TOKEN='private-token')

    def prepare(self):
        return qp.prepare(self.folder, self.env, lambda *_: (self.run, self.prior))

    def package(self):
        folder = self.folder / 'build/package'; folder.mkdir(parents=True)
        m = dict(build=dict(run_id='5678', attempt='1', commit_sha='1' * 40),
            generation=dict(run_id='42735010470', response_sha256=self.prior['responseSha256'],
                            model_request_in_this_run=False), foundation_id=self.prior['foundation'],
            current={k:self.prior[k] for k in ['version', 'bytes', 'sha256']}, published=False)
        (folder / 'manifest.json').write_text(json.dumps(m))
        return folder, m

    def test_prior_result_and_run_are_bound_before_any_work_or_overwrite(self):
        request = self.prepare()
        self.assertEqual(request['priorResultSha256'], qp.digest(self.prior))
        self.assertEqual((self.folder / 'creative-prompt.txt').read_text(), qp.PROMPT + '\n')
        with self.assertRaises(ValueError): self.prepare()
        self.assertEqual(json.loads((self.folder / 'request.json').read_text()), request)

    def test_wrong_prior_hash_prompt_run_source_identity_or_model_provenance_stop_before_output(self):
        for change in [dict(jobId='wrong'), dict(runId='9999'), dict(commitSha='2' * 40),
            dict(promptSha256='0' * 64), dict(responseSha256='0' * 64), dict(modelRequests=1),
            dict(published=True), dict(deviceConfirmed=True), dict(foundation='0' * 64), dict(bytes=1310721)]:
            report = self.prior | change
            env = self.env | dict(PRIOR_RESULT_SHA256=qp.digest(report))
            with self.subTest(change=change), self.assertRaises(ValueError):
                qp.prepare(self.folder, env, lambda *_:(self.run,report))
            self.assertFalse(self.folder.exists())
        with self.assertRaises(ValueError):
            qp.prepare(self.folder, self.env | dict(PRIOR_RESULT_SHA256='0' * 64),
                       lambda *_:(self.run,self.prior))

    def test_missing_approval_rerun_wrong_workflow_branch_or_self_reference_cannot_publish(self):
        for change in [dict(PUBLICATION_APPROVED='false'), dict(GITHUB_RUN_ATTEMPT='2'),
            dict(GITHUB_REF='refs/heads/other'), dict(GITHUB_WORKFLOW_REF='other'),
            dict(PRIOR_BUILD_RUN_ID='5678')]:
            with self.assertRaises(ValueError): qp.identity(self.env | change)

    def test_rebuild_must_match_original_bytes_version_and_hash_before_publisher(self):
        self.prepare(); folder, manifest = self.package()
        for field,value in [('sha256','0'*64),('bytes',1012017),('version','ota-pilot-'+'0'*24)]:
            changed = copy.deepcopy(manifest); changed['current'][field] = value
            (folder/'manifest.json').write_text(json.dumps(changed))
            with patch.object(qp.ota_publish,'validate_manifest'), self.assertRaises(ValueError):
                qp.publish(self.folder,self.env,lambda _:self.fail('Publisher must not run'))
            self.assertFalse((self.folder/'publication-started').exists())

    def test_success_records_publisher_verified_metadata_and_all_four_asset_checksums(self):
        self.prepare(); folder, manifest = self.package()
        tag = 'lightboard-ota-5678-1'; manifest['current'].update(release_tag=tag,
            url=f'https://github.com/{qp.qb.REPOSITORY}/releases/download/{tag}/firmware.bin')
        (folder/'manifest.json').write_text(json.dumps(manifest))
        def publisher(path):
            self.assertEqual(path,folder)
            self.assertTrue((self.folder/'publication-started').exists())
            m = manifest | dict(published=True)
            (folder/'manifest.json').write_text(json.dumps(m))
            for name in ['firmware.bin','recovery.bin','SHA256SUMS']:(folder/name).write_bytes(b'fixture only')
            (folder/'firmware.bin').write_bytes(self.image)
            return m
        with patch.object(qp.ota_publish,'validate_manifest') as validate:
            qp.publish(self.folder,self.env,publisher)
            with contextlib.redirect_stdout(io.StringIO()):
                report=qp.result(self.folder,self.env | dict(PUBLICATION_OUTCOME='success'))
        self.assertEqual(validate.call_args.args[1],True)
        self.assertTrue(report['published']);self.assertFalse(report['deviceConfirmed'])
        self.assertEqual(report['modelRequests'],0)
        self.assertEqual(set(report['assetSha256']),set(qp.ota_publish.ASSETS))
        self.assertEqual(report['manifestSha256'],qp.qb.sha((folder/'manifest.json').read_bytes()))

    def test_failed_or_partially_successful_publisher_never_reports_unpublished_or_retries(self):
        self.prepare(); self.package(); calls=[]
        def fail(_): calls.append(1); raise ValueError('feed may already have moved')
        with patch.object(qp.ota_publish,'validate_manifest'), self.assertRaises(ValueError):
            qp.publish(self.folder,self.env,fail)
        with contextlib.redirect_stdout(io.StringIO()):
            report=qp.result(self.folder,self.env | dict(PUBLICATION_OUTCOME='failure'))
        self.assertEqual(calls,[1]);self.assertIsNone(report['published'])
        self.assertEqual(report['result'],'publication_unconfirmed');self.assertFalse(report['deviceConfirmed'])
        with self.assertRaises(ValueError):qp.publish(self.folder,self.env,fail)
        self.assertEqual(calls,[1])

    def test_prior_step_log_redirect_never_receives_github_token(self):
        run=self.run | dict(status='completed',conclusion='success',run_attempt=1,event='workflow_dispatch',
            path=qp.qb.WORKFLOW,head_branch='main',repository=dict(full_name=qp.qb.REPOSITORY,private=False))
        jobs=dict(total_count=1,jobs=[dict(id=55,run_id=1234,name='generate-and-compile',status='completed',
            conclusion='success',steps=[dict(name='Record queue result',number=13,conclusion='success')])])
        calls=[]
        def fetch(url,limit,token=None):
            calls.append((url,token))
            if '/steps/' in url:return 302,'https://logs.blob.core.windows.net/log',b''
            if '.blob.' in url:return 200,'',('LB_QUEUE_RESULT: '+json.dumps(self.prior)).encode()
            return 200,'',json.dumps(jobs if '/jobs?' in url else run).encode()
        with patch.object(qp,'fetch',side_effect=fetch):
            _,report=qp.prior_result('1234','private-token')
        self.assertEqual(report,self.prior);self.assertIsNone(calls[-1][1])
        self.assertTrue(all(token=='private-token' for _,token in calls[:-1]))

    def test_dedicated_workflow_has_no_generation_artifact_cache_or_device_operation(self):
        text=(qp.qb.PROJECT.parents[1]/qp.WORKFLOW).read_text()
        for forbidden in ['generate_candidate.py','upload-artifact','cache@','install-to-board']:
            self.assertNotIn(forbidden,text)
        self.assertIn('actions: read',text);self.assertIn('queue_publication.py publish',text)
        self.assertLess(text.index('queue_publication.py prepare'),text.index('Install pinned Arduino CLI'))
        prior=(qp.qb.PROJECT.parents[1]/qp.qb.WORKFLOW).read_text()
        # Exact binary comparison must keep the compiler source path stable (__FILE__, etc.).
        self.assertEqual(re.search(r'--work (\S+)',text)[1],re.search(r'--work (\S+)',prior)[1])


if __name__ == '__main__':unittest.main()
