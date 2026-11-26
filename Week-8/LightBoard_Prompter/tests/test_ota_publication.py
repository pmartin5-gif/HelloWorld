"""Offline tests of real source/bundle validation and ordered OTA publication."""
import base64
import copy
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud import build, ota_build, ota_publish as ota, publish as delivery

ENV = {"GITHUB_REPOSITORY": delivery.REPOSITORY, "GITHUB_REF": "refs/heads/main",
       "GITHUB_SHA": "1" * 40, "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1"}
LOCK = json.loads((build.ROOT / 'build-lock.json').read_text())


def checksums(folder):
    (folder / 'SHA256SUMS').write_text(''.join(
        f'{ota.sha(p.read_bytes())}  {p.name}\n' for p in sorted(folder.iterdir()) if p.name != 'SHA256SUMS'))


def bundle(folder, name):
    lock, source, foundation, version, _ = ota.known_source(name)
    folder.mkdir()
    (folder / 'LightboardOTA.ino').write_text(source)
    for filename in ota_build.RUNTIME_FILES:
        shutil.copy2(ota_build.DEVICE / 'runtime' / filename, folder / filename)
    shutil.copy2(build.ROOT / lock['sketch'] / 'partitions.csv', folder / 'partitions.csv')
    (folder / 'BuildIdentity.h').write_text(f'#pragma once\n#define LB_FOUNDATION_ID "{foundation}"\n#define LB_FIRMWARE_VERSION "{version}"\n')
    binaries = {}
    for filename in (ota.APP, 'LightboardOTA.ino.bootloader.bin', 'LightboardOTA.ino.partitions.bin'):
        data = b'\xe9' + (name + filename).encode() * 30
        if filename == ota.APP:
            data += b'\0' + foundation.encode() + b'\0' + version.encode() + b'\0'
        (folder / filename).write_bytes(data)
        binaries[filename] = {'bytes': len(data), 'sha256': ota.sha(data)}
    report = {'build_lock_sha256': build.sha256(build.ROOT / 'build-lock.json'),
              'foundation_lock_sha256': build.sha256(ota_build.DEVICE / 'foundation-lock.json'),
              'foundation_id': foundation, 'firmware_version': version,
              'source_sha256': ota.sha(source.encode()), 'ota_protected_sha256': ota.scene.protected_hash(source),
              'baseline_source_sha256': lock['baseline']['source_sha256'], 'fqbn': lock['fqbn'],
              'arduino_cli': lock['arduino_cli_version'], 'core': 'esp32:esp32@2.0.17',
              'model_requests': 0, 'uploaded_to_board': False, 'automatic_updates': False,
              'application_slot_bytes': lock['application_slot_bytes'],
              'application_headroom_bytes': lock['application_slot_bytes'] - binaries[ota.APP]['bytes'],
              'binaries': binaries}
    (folder / 'build-report.json').write_bytes(ota.encoded(report))
    (folder / 'manifest.json').write_bytes(ota.encoded({'schema_version': 2, 'published': False,
        'ota_enabled': True, 'foundation_id': foundation,
        'current': {'version': version, 'bytes': binaries[ota.APP]['bytes'], 'sha256': binaries[ota.APP]['sha256']}}))
    checksums(folder)


class FakeGitHub:
    def __init__(self, prior):
        self.prior = prior
        self.calls, self.assets, self.prior_data = [], {}, {}
        self.feed = None
        self.fail, self.existing, self.bad_digest, self.move_main = None, False, False, False

    def request(self, method, path, data=None, binary=None):
        self.calls.append((method, path, copy.deepcopy(data)))
        if self.fail == (method, path):
            raise ValueError('Simulated API failure')
        if method == 'GET':
            if path == '': return {'private': False}
            if path == '/git/ref/heads/main':
                return {'object': {'sha': '2' * 40 if self.move_main and self.assets else ENV['GITHUB_SHA']}}
            if path == '/git/ref/heads/lightboard-feed': return {'object': {'sha': 'old'}}
            if path.startswith('/contents/'):
                raw = ota.encoded(self.prior)
                return {'type': 'file', 'size': len(raw), 'encoding': 'base64', 'sha': 'old-blob',
                        'content': base64.b64encode(raw).decode()}
            return {'id': 99} if self.existing and '/releases/tags/' in path else None
        if method == 'POST' and path == '/releases': return {'id': 44}
        if method == 'POST' and '/assets?' in path:
            name = path.split('=')[-1]; self.assets[name] = binary
            return {'name': name, 'state': 'uploaded', 'size': len(binary),
                    'digest': 'sha256:' + ('0' * 64 if self.bad_digest else ota.sha(binary))}
        if method == 'PUT':
            self.feed = base64.b64decode(data['content'])
            return {'commit': {'sha': 'a' * 40}}
        return {}

    def download(self, url, maximum):
        if 'raw.githubusercontent.com' in url: return self.feed
        if url in self.prior_data: return self.prior_data[url]
        return self.assets[url.split('/')[-1]]


class OtaPublicationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.candidate, self.baseline, self.output = [self.root / n for n in ('heart', 'baseline', 'output')]
        bundle(self.candidate, 'saved-heart'); bundle(self.baseline, 'baseline')

    def prepare(self, name='saved-heart'):
        with patch.dict(os.environ, ENV, clear=True):
            return ota.prepare(self.candidate if name == 'saved-heart' else self.baseline,
                               self.baseline, self.output, name, '123', '1')

    def legacy(self):
        data = b'\xe9' + b'legacy-image' * 40
        def old_entry(filename):
            return {'version': 'baseline-' + '1' * 16 + '-' + '2' * 16,
                    'release_tag': 'lightboard-test-122-1',
                    'url': delivery.asset_url('lightboard-test-122-1', filename),
                    'bytes': len(data), 'sha256': ota.sha(data), 'source_sha256': '1' * 64, 'ota_enabled': False}
        prior = {'schema_version': 1, 'repository': delivery.REPOSITORY, 'channel': 'delivery-test',
                 'fqbn': LOCK['fqbn'], 'ota_enabled': False, 'current': old_entry('firmware.bin'),
                 'previous': old_entry('recovery.bin'), 'usb_recovery': old_entry('recovery.bin')}
        api = FakeGitHub(prior)
        api.prior_data = {prior[k]['url']: data for k in ('current', 'previous', 'usb_recovery')}
        return api

    def run_publish(self, api, download=None):
        with patch.dict(os.environ, ENV, clear=True):
            return ota.publish(self.output, api, download or api.download)

    def test_package_contains_only_allowlisted_assets_and_exact_foundation(self):
        m = self.prepare()
        self.assertEqual({p.name for p in self.output.iterdir()}, set(ota.ASSETS))
        self.assertFalse(m['published']); self.assertTrue(m['ota_enabled'])
        self.assertFalse(m['automatic_updates']); self.assertFalse(m['generation']['model_request_in_this_run'])
        self.assertEqual((self.output / 'recovery.bin').read_bytes(), (self.baseline / ota.APP).read_bytes())
        self.assertNotIn('creative_prompt', (self.output / 'manifest.json').read_text())

    def test_baseline_scene_preparation_retains_same_ota_foundation(self):
        m = self.prepare('baseline')
        self.assertIsNone(m['generation'])
        self.assertEqual(m['current']['version'], m['usb_recovery']['version'])

    def test_corruption_and_rehashed_source_or_identity_tampering_are_rejected(self):
        for filename, content in (('LightboardOTA.ino', b'void setup() {}'),
                                  ('BuildIdentity.h', b'wrong-foundation'),
                                  ('LightboardRuntime.cpp', b'network tampered')):
            with self.subTest(filename=filename):
                path = self.candidate / filename; original = path.read_bytes(); path.write_bytes(content)
                checksums(self.candidate)
                with self.assertRaises(ValueError): self.prepare()
                self.assertFalse(self.output.exists())
                path.write_bytes(original); checksums(self.candidate)

    def test_bad_report_or_checksum_never_prepares(self):
        path = self.candidate / 'build-report.json'; report = json.loads(path.read_text())
        report['model_requests'] = 1; path.write_bytes(ota.encoded(report)); checksums(self.candidate)
        with self.assertRaisesRegex(ValueError, 'build report'): self.prepare()
        self.assertFalse(self.output.exists())

    def test_legacy_migration_preserves_snapshot_and_assets_feed_is_last_mutation(self):
        self.prepare(); api = self.legacy(); m = self.run_publish(api)
        self.assertEqual(m['legacy_delivery_test'], api.prior); self.assertIsNone(m['previous'])
        self.assertTrue(m['published']); self.assertEqual(set(api.assets), set(ota.ASSETS))
        mutations = [c for c in api.calls if c[0] != 'GET']
        self.assertEqual(mutations[-1][:2], ('PUT', '/contents/manifest.json'))
        self.assertEqual(mutations[-1][2]['sha'], 'old-blob')
        self.assertFalse(any(c[0] == 'DELETE' for c in api.calls))
        self.assertLessEqual(len(ota.encoded(m)), 8192)

    def test_next_ota_publication_keeps_previous_compatible_release(self):
        prior = self.prepare(); prior['published'] = True
        prior['build']['run_id'] = '122'
        for key, filename in (('current', 'firmware.bin'), ('usb_recovery', 'recovery.bin')):
            prior[key]['release_tag'] = 'lightboard-ota-122-1'
            prior[key]['url'] = ota.asset_url('lightboard-ota-122-1', filename)
        api = FakeGitHub(prior)
        api.prior_data[prior['current']['url']] = (self.candidate / ota.APP).read_bytes()
        m = self.run_publish(api)
        self.assertEqual(m['previous'], prior['current'])

    def test_incompatible_prior_foundation_stops_before_mutation(self):
        prior = self.prepare(); prior.update(published=True, foundation_id='0' * 64)
        api = FakeGitHub(prior)
        with self.assertRaisesRegex(ValueError, 'manifest'): self.run_publish(api)
        self.assertFalse(any(c[0] != 'GET' for c in api.calls))

    def reviewed_prior(self):
        return json.loads((build.ROOT / 'ota-foundation-history/45307022021-1.json').read_text())

    def test_exact_reviewed_foundation_transition_preserves_immutable_history(self):
        self.prepare(); prior = self.reviewed_prior(); api = FakeGitHub(prior)
        reference = ota.superseded_reference()
        api.prior_data[reference['manifest_url']] = ota.encoded(prior)
        # Old binary readback has its own real verifier tests; assert both are required here.
        with patch.object(delivery, 'verify_download') as verify:
            m = self.run_publish(api)
        self.assertEqual(verify.call_count, 2)
        self.assertEqual([c.args[0] for c in verify.call_args_list],
                         [prior['current'], prior['usb_recovery']])
        self.assertEqual(m['superseded_ota'], reference)
        self.assertFalse(m['superseded_ota']['compatible_for_ota'])
        self.assertIsNone(m['previous'])
        self.assertEqual(m['legacy_delivery_test'], prior['legacy_delivery_test'])
        self.assertLessEqual(len(ota.encoded(m)), 8192)
        self.assertFalse(any(c[0] == 'DELETE' for c in api.calls))

    def test_edited_reviewed_prior_or_wrong_destination_stops_before_mutation(self):
        self.prepare()
        for field in ('current', 'legacy_delivery_test', 'build'):
            prior = self.reviewed_prior(); prior[field]['tampered'] = True
            api = FakeGitHub(prior)
            with self.assertRaisesRegex(ValueError, 'transition'): self.run_publish(api)
            self.assertFalse(any(c[0] != 'GET' for c in api.calls))
        with patch.object(ota, 'TRANSITION_FOUNDATION', '0' * 64):
            api = FakeGitHub(self.reviewed_prior())
            with self.assertRaisesRegex(ValueError, 'transition'): self.run_publish(api)
            self.assertFalse(any(c[0] != 'GET' for c in api.calls))

    def test_transition_manifest_readback_failure_leaves_feed_and_releases_untouched(self):
        self.prepare(); api = FakeGitHub(self.reviewed_prior())
        api.prior_data[ota.superseded_reference()['manifest_url']] = b'changed'
        with self.assertRaisesRegex(ValueError, 'Prior OTA manifest'): self.run_publish(api)
        self.assertFalse(any(c[0] != 'GET' for c in api.calls))

    def test_compatible_publication_retains_superseded_reference(self):
        prior = self.prepare(); prior.update(published=True, superseded_ota=ota.superseded_reference())
        api = FakeGitHub(prior)
        api.prior_data[prior['current']['url']] = (self.candidate / ota.APP).read_bytes()
        m = self.run_publish(api)
        self.assertEqual(m['superseded_ota'], prior['superseded_ota'])
        self.assertEqual(m['previous'], prior['current'])

    def test_prepared_binary_tampering_stops_before_api(self):
        self.prepare(); (self.output / 'firmware.bin').write_bytes(b'bad'); api = self.legacy()
        with self.assertRaisesRegex(ValueError, 'binary changed'): self.run_publish(api)
        self.assertEqual(api.calls, [])

    def test_prepared_source_commit_must_match_actions_before_api_access(self):
        m = self.prepare(); m['build']['commit_sha'] = '2' * 40
        ota.write_manifest(self.output, m); api = self.legacy()
        with self.assertRaisesRegex(ValueError, 'Matching main-branch'): self.run_publish(api)
        self.assertEqual(api.calls, [])

    def test_server_digest_failure_never_advances_feed(self):
        self.prepare(); api = self.legacy(); api.bad_digest = True
        with self.assertRaisesRegex(ValueError, 'upload verification'): self.run_publish(api)
        self.assertFalse(any(c[0] == 'PUT' for c in api.calls))

    def test_anonymous_readback_failure_never_advances_feed(self):
        self.prepare(); api = self.legacy()
        def download(url, maximum):
            return api.download(url, maximum) if url in api.prior_data else b'corrupt'
        with self.assertRaisesRegex(ValueError, 'readback mismatch'): self.run_publish(api, download)
        self.assertFalse(any(c[0] == 'PUT' for c in api.calls))

    def test_feed_conflict_and_main_change_do_not_delete_prior_assets(self):
        for mode in ('conflict', 'moved'):
            with self.subTest(mode=mode):
                if self.output.exists(): shutil.rmtree(self.output)
                self.prepare(); api = self.legacy()
                if mode == 'conflict': api.fail = ('PUT', '/contents/manifest.json')
                else: api.move_main = True
                with self.assertRaises(ValueError): self.run_publish(api)
                self.assertIsNone(api.feed); self.assertFalse(any(c[0] == 'DELETE' for c in api.calls))

    def test_existing_release_cannot_be_overwritten(self):
        self.prepare(); api = self.legacy(); api.existing = True
        with self.assertRaisesRegex(ValueError, 'already exists'): self.run_publish(api)
        self.assertFalse(any(c[0] != 'GET' for c in api.calls))

    def test_existing_feed_cannot_overflow_device_size_or_nesting(self):
        for mode in ('size', 'depth'):
            with self.subTest(mode=mode):
                if self.output.exists(): shutil.rmtree(self.output)
                self.prepare(); api = self.legacy()
                if mode == 'size': api.prior['extra'] = 'x' * 9000
                else:
                    value = {}
                    for _ in range(14): value = {'nested': value}
                    api.prior['extra'] = value
                with self.assertRaises(ValueError): self.run_publish(api)
                self.assertFalse(any(c[0] != 'GET' for c in api.calls))

    def test_install_only_preserves_artifacts_and_never_invokes_compiler(self):
        work = self.root / 'toolchain'; (work / 'artifact').mkdir(parents=True)
        marker = work / 'artifact/preserve'; marker.write_text('retained')
        def output(command):
            if 'version' in command: return json.dumps({'VersionString': LOCK['arduino_cli_version']}).encode()
            return json.dumps({'platforms': [{'id': LOCK['core'], 'installed_version': LOCK['core_version']}]}).encode()
        with patch.object(build, 'WORK', work), patch.object(sys, 'argv', ['build.py', '--install-core', '--install-only']), \
                patch.object(build.subprocess, 'check_output', side_effect=output), patch.object(build, 'run') as run:
            self.assertEqual(build.main(), 0)
        self.assertTrue(marker.exists())
        self.assertEqual(run.call_count, 2)
        self.assertFalse(any('compile' in call.args[0] for call in run.call_args_list))
