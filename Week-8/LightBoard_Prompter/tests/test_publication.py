"""Offline delivery tests: corruption, isolation, anonymous readback, and feed failure."""
import base64
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud import build, publish, scene

ROOT = Path(__file__).resolve().parents[1]
LOCK = json.loads((build.ROOT / 'build-lock.json').read_text())
SOURCE = (build.ROOT / LOCK['sketch'] / 'LightboardBaseline.ino').read_text()
RECORD = ROOT / 'experiments/flash-lite/2026-11-09/cloud-run-42735010470/generation.json'
ENV = {'GITHUB_REPOSITORY': publish.REPOSITORY, 'GITHUB_REF': 'refs/heads/main',
       'GITHUB_SHA': '1' * 40, 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1'}


def checksum(folder):
    (folder / 'SHA256SUMS').write_text(''.join(
        f'{publish.sha(p.read_bytes())}  {p.name}\n' for p in sorted(folder.iterdir()) if p.name != 'SHA256SUMS'))


def bundle(folder, candidate):
    folder.mkdir()
    data = b'\xe9' + (b'candidate' if candidate else b'baseline') * 128
    (folder / publish.APP).write_bytes(data)
    record, function = scene.load_generation(RECORD)
    source = scene.compose(SOURCE, function, LOCK['baseline']['protected_sha256']) if candidate else SOURCE
    report = {
        'build_lock_sha256': build.sha256(build.ROOT / 'build-lock.json'),
        'fqbn': LOCK['fqbn'], 'arduino_cli': LOCK['arduino_cli_version'],
        'core': 'esp32:esp32@2.0.17', 'libraries': LOCK['libraries'],
        'application_slot_bytes': LOCK['application_slot_bytes'],
        'application_headroom_bytes': LOCK['application_slot_bytes'] - len(data),
        'ota_enabled': False, 'uploaded_to_board': False,
        'source_sha256': publish.sha(source.encode()),
        'binaries': {publish.APP: {'sha256': publish.sha(data), 'bytes': len(data)}},
        'model_api_used': candidate,
    }
    if candidate:
        report.update(protected_sha256=LOCK['baseline']['protected_sha256'],
                      candidate_sha256=publish.sha(function.encode()),
                      generation_response_sha256=record['response_sha256'],
                      generation_run_id=record['run_id'], model_request_in_this_run=False)
        (folder / 'LightboardBaseline.ino').write_text(source)
        (folder / 'generation.json').write_bytes(RECORD.read_bytes())
    (folder / 'build-report.json').write_bytes(publish.encoded(report))
    checksum(folder)


class FakeGitHub:
    def __init__(self, prior=None, fail=None):
        self.prior = prior
        self.fail = fail
        self.calls = []
        self.assets = {}
        self.feed = None

    def request(self, method, path, data=None, binary=None):
        self.calls.append((method, path, copy.deepcopy(data)))
        if self.fail == (method, path):
            raise ValueError('Simulated API failure')
        if method == 'GET':
            if path == '':
                return {'private': False}
            if path == '/git/ref/heads/main':
                return {'object': {'sha': ENV['GITHUB_SHA']}}
            if path == '/git/ref/heads/lightboard-feed':
                return {'object': {'sha': 'old'}} if self.prior else None
            if path.startswith('/contents/'):
                payload = publish.encoded(self.prior)
                return {'type': 'file', 'size': len(payload), 'encoding': 'base64',
                        'sha': 'old-blob', 'content': base64.b64encode(payload).decode()}
            return None
        if method == 'POST' and path == '/releases':
            return {'id': 44}
        if method == 'POST' and '/assets?' in path:
            name = path.split('=')[-1]
            self.assets[name] = binary
            return {'name': name, 'state': 'uploaded', 'size': len(binary),
                    'digest': 'sha256:' + publish.sha(binary)}
        if method == 'PUT':
            self.feed = base64.b64decode(data['content'])
            return {'commit': {'sha': 'a' * 40}}
        if path == '/git/trees':
            self.feed = data['tree'][0]['content'].encode()
            return {'sha': 'tree'}
        if path == '/git/commits':
            return {'sha': 'a' * 40}
        return {}

    def download(self, url, maximum):
        if 'raw.githubusercontent.com' in url:
            return self.feed
        tag, name = url.split('/')[-2:]
        if tag == 'lightboard-test-122-1':
            return b'old-image'
        return self.assets[name]


class PublicationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.candidate, self.baseline, self.output = [self.root / n for n in ('candidate', 'baseline', 'publication')]
        bundle(self.candidate, True)
        bundle(self.baseline, False)

    def prepare(self):
        return publish.prepare(self.candidate, self.baseline, self.output, '123', '1')

    def run_publish(self, api, download=None):
        with patch.dict(os.environ, ENV, clear=True):
            return publish.publish(self.output, api, download or api.download)

    def test_prepare_has_only_delivery_files_and_preserves_baseline(self):
        m = self.prepare()
        self.assertEqual({p.name for p in self.output.iterdir()}, set(publish.ASSETS))
        self.assertEqual((self.output / 'recovery.bin').read_bytes(), (self.baseline / publish.APP).read_bytes())
        self.assertFalse(m['ota_enabled'])
        self.assertFalse(m['generation']['model_request_in_this_run'])
        self.assertNotIn('creative_prompt', (self.output / 'manifest.json').read_text())
        self.assertEqual(m['generation']['run_id'], '42735010470')

    def test_corrupt_or_incomplete_bundle_cannot_prepare(self):
        (self.candidate / publish.APP).write_bytes(b'corrupted')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_rehashed_protected_source_change_is_rejected(self):
        path = self.candidate / 'LightboardBaseline.ino'
        path.write_text(path.read_text().replace('void setup()', 'void otherSetup()'))
        checksum(self.candidate)
        with self.assertRaisesRegex(ValueError, 'source or saved-generation'):
            self.prepare()

    def test_unknown_file_or_symlink_is_rejected(self):
        (self.candidate / 'private.txt').write_text('do not publish')
        with self.assertRaisesRegex(ValueError, 'inventory'):
            self.prepare()
        (self.candidate / 'private.txt').unlink()
        binary = self.candidate / publish.APP
        binary.unlink()
        binary.symlink_to(self.baseline / publish.APP)
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            self.prepare()

    def test_prepare_never_overwrites_a_previous_package(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.prepare()

    def test_first_publication_has_baseline_recovery_and_feed_is_last(self):
        self.prepare()
        api = FakeGitHub()
        m = self.run_publish(api)
        self.assertEqual(m['previous'], m['usb_recovery'])
        self.assertEqual(api.calls[-1][0:2], ('POST', '/git/refs'))
        self.assertEqual(api.calls[-1][2]['ref'], 'refs/heads/lightboard-feed')
        release = next(c[2] for c in api.calls if c[:2] == ('POST', '/releases'))
        self.assertTrue(release['draft'])
        self.assertTrue(release['prerelease'])
        self.assertEqual(release['make_latest'], 'false')
        self.assertEqual(set(api.assets), set(publish.ASSETS))

    def prior(self):
        m = self.prepare()
        prior = copy.deepcopy(m)
        prior['current'].update(url=publish.asset_url('lightboard-test-122-1', 'firmware.bin'),
                                release_tag='lightboard-test-122-1',
                                sha256=publish.sha(b'old-image'), bytes=len(b'old-image'))
        prior['previous'] = prior['usb_recovery']
        return prior

    def test_next_publication_preserves_previous_and_uses_expected_blob_sha(self):
        prior = self.prior()
        api = FakeGitHub(prior)
        m = self.run_publish(api)
        self.assertEqual(m['previous'], prior['current'])
        update = api.calls[-1]
        self.assertEqual(update[:2], ('PUT', '/contents/manifest.json'))
        self.assertEqual(update[2]['sha'], 'old-blob')
        self.assertEqual(update[2]['branch'], 'lightboard-feed')
        self.assertFalse(any(method == 'DELETE' for method, _, _ in api.calls))

    def test_upload_failure_leaves_feed_untouched(self):
        self.prepare()
        api = FakeGitHub(fail=('POST', '/releases/44/assets?name=recovery.bin'))
        with self.assertRaisesRegex(ValueError, 'Simulated'):
            self.run_publish(api)
        self.assertFalse(any(p.startswith('/git/') or m == 'PUT' for m, p, _ in api.calls if m != 'GET'))

    def test_anonymous_corrupt_download_does_not_advance_feed(self):
        self.prepare()
        api = FakeGitHub()
        with self.assertRaisesRegex(ValueError, 'readback mismatch'):
            self.run_publish(api, lambda *_: b'wrong')
        self.assertFalse(any(m == 'PUT' or p == '/git/refs' for m, p, _ in api.calls))

    def test_feed_write_conflict_does_not_delete_previous_release(self):
        api = FakeGitHub(self.prior(), fail=('PUT', '/contents/manifest.json'))
        with self.assertRaisesRegex(ValueError, 'Simulated'):
            self.run_publish(api)
        self.assertFalse(any(m == 'DELETE' for m, _, _ in api.calls))

    def test_prepared_binary_change_stops_before_api_access(self):
        self.prepare()
        (self.output / 'firmware.bin').write_bytes(b'bad')
        api = FakeGitHub()
        with self.assertRaisesRegex(ValueError, 'binary changed'):
            self.run_publish(api)
        self.assertEqual(api.calls, [])

    def test_missing_previous_binary_stops_before_release_creation(self):
        api = FakeGitHub(self.prior())
        with self.assertRaisesRegex(ValueError, 'checksum verification'):
            self.run_publish(api, lambda *_: b'wrong')
        self.assertFalse(any(method != 'GET' for method, _, _ in api.calls))

    def test_reusing_a_release_tag_never_overwrites_assets(self):
        self.prepare()
        api = FakeGitHub()
        original = api.request
        def existing(method, path, data=None, binary=None):
            if path == '/releases/tags/lightboard-test-123-1':
                return {'id': 10}
            return original(method, path, data, binary)
        api.request = existing
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.run_publish(api)
        self.assertFalse(any(method != 'GET' for method, _, _ in api.calls))

    def test_private_repository_cannot_publish(self):
        self.prepare()
        api = FakeGitHub()
        original = api.request
        def private(method, path, data=None, binary=None):
            if path == '':
                return {'private': True}
            return original(method, path, data, binary)
        api.request = private
        with self.assertRaisesRegex(ValueError, 'Public repository'):
            self.run_publish(api)
        self.assertFalse(any(method != 'GET' for method, _, _ in api.calls))

    def test_main_moved_during_build_stops_publication(self):
        self.prepare()
        api = FakeGitHub()
        original = api.request
        def moved(method, path, data=None, binary=None):
            if path == '/git/ref/heads/main':
                return {'object': {'sha': '2' * 40}}
            return original(method, path, data, binary)
        api.request = moved
        with self.assertRaisesRegex(ValueError, 'Main changed'):
            self.run_publish(api)
        self.assertFalse(any(method != 'GET' for method, _, _ in api.calls))

    def test_publication_requires_matching_main_run_and_public_repo(self):
        self.prepare()
        api = FakeGitHub()
        with patch.dict(os.environ, {**ENV, 'GITHUB_REF': 'refs/heads/other'}, clear=True):
            with self.assertRaisesRegex(ValueError, 'main-branch'):
                publish.publish(self.output, api, api.download)
        self.assertEqual(api.calls, [])

    def test_unsafe_redirect_and_cross_repo_firmware_url_are_rejected(self):
        handler = publish.PublicRedirect()
        for url in ('http://github.com/a', 'https://example.com/file', 'https://github.com:444/file'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                handler.redirect_request(None, None, 302, '', {}, url)
        m = self.prepare()
        m['current']['url'] = 'https://example.com/firmware.bin'
        with self.assertRaisesRegex(ValueError, 'outside'):
            publish.validate_entry(m['current'], LOCK['application_slot_bytes'])


if __name__ == '__main__':
    unittest.main()
