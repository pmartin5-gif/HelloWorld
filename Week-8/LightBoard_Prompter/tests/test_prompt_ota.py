"""Routine prompt OTA integration: exact provenance, sealed source and immutable history."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud import build, ota_build, ota_publish as ota, prompt_build, scene
from test_ota_publication import bundle, checksums, FakeGitHub, ENV


class PromptOtaTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.record = self.root / 'generation.json'
        self.record.write_bytes(ota.RECORD.read_bytes())
        self.prompt = self.root / 'prompt.txt'
        self.prompt.write_text('An overflowing heart that keeps giving\n')
        self.candidate, self.baseline, self.output = [self.root / n for n in ('candidate', 'baseline', 'package')]
        bundle(self.baseline, 'baseline')

    def generated_bundle(self, folder, record=None):
        record = record or self.record
        bundle(folder, 'saved-heart')
        lock, source, foundation, version, data, _ = ota_build.generation_source(record)
        (folder / 'LightboardOTA.ino').write_text(source)
        (folder / 'BuildIdentity.h').write_text(f'#pragma once\n#define LB_FOUNDATION_ID "{foundation}"\n#define LB_FIRMWARE_VERSION "{version}"\n')
        # These are synthetic bytes for publisher policy tests, never flashable firmware.
        image = b'\xe9' + b'x' * 512 + b'\0' + foundation.encode() + b'\0' + version.encode() + b'\0'
        (folder / ota.APP).write_bytes(image)
        shutil.copyfile(record, folder / 'generation.json')
        report = json.loads((folder / 'build-report.json').read_text())
        requested = data['run_id'] == os.environ.get('GITHUB_RUN_ID')
        report.update(firmware_version=version, source_sha256=scene.digest(source.encode()),
                      generation=ota_build.generation_metadata(data, requested), model_requests=int(requested))
        report['binaries'][ota.APP] = {'bytes': len(image), 'sha256': ota.sha(image)}
        report['application_headroom_bytes'] = lock['application_slot_bytes'] - len(image)
        (folder / 'build-report.json').write_bytes(ota.encoded(report))
        manifest = json.loads((folder / 'manifest.json').read_text())
        manifest['current']['version'] = version
        manifest['current'].update(bytes=len(image), sha256=ota.sha(image))
        (folder / 'manifest.json').write_bytes(ota.encoded(manifest))
        checksums(folder)

    def prepare(self):
        with patch.dict(os.environ, ENV, clear=True):
            return ota.prepare(self.candidate, self.baseline, self.output, 'generated', '123', '1')

    def test_saved_response_package_keeps_exact_runtime_recovery_and_provenance(self):
        self.generated_bundle(self.candidate)
        m = self.prepare()
        self.assertEqual(m['generation']['run_id'], '42735010470')
        self.assertFalse(m['generation']['model_request_in_this_run'])
        self.assertEqual(m['current']['version'], ota.known_source('saved-heart')[3])
        self.assertEqual(m['foundation_id'], ota.known_source('baseline')[2])
        self.assertEqual(set(p.name for p in self.output.iterdir()), set(ota.ASSETS))
        self.assertEqual((self.output / 'recovery.bin').read_bytes(), (self.baseline / ota.APP).read_bytes())
        self.assertNotIn('creative_prompt', (self.output / 'manifest.json').read_text())

    def test_routine_path_supports_other_validated_responses_and_historical_readback(self):
        data = json.loads(self.record.read_text())
        data['response_text'] = 'void restState(unsigned long now) { display.fillScreen(0); }'
        data['response_sha256'] = scene.digest(data['response_text'].encode())
        data['run_id'] = '122'
        self.record.write_text(json.dumps(data))
        self.generated_bundle(self.candidate)
        m = self.prepare()
        self.assertNotEqual(m['current']['version'], ota.known_source('saved-heart')[3])
        self.record.unlink()
        shutil.rmtree(self.candidate)
        m['published'] = True
        ota.validate_manifest(m, True)  # Historic generated source/record need not be in checkout.
        m['generation']['response_sha256'] = 'edited'
        with self.assertRaisesRegex(ValueError, 'provenance'):
            ota.validate_manifest(m, True)

    def test_rehashed_record_function_runtime_identity_and_report_tampering_stop(self):
        self.generated_bundle(self.candidate)
        for name, content in [('generation.json', b'{}'), ('LightboardOTA.ino', b'void setup() {}'),
                              ('LightboardRuntime.cpp', b'changed'), ('BuildIdentity.h', b'changed')]:
            with self.subTest(name=name):
                path = self.candidate / name
                original = path.read_bytes()
                path.write_bytes(content)
                checksums(self.candidate)
                with self.assertRaises((ValueError, KeyError)):
                    self.prepare()
                self.assertFalse(self.output.exists())
                path.write_bytes(original)
                checksums(self.candidate)
        path = self.candidate / 'build-report.json'
        data = json.loads(path.read_text()); data['generation']['run_id'] = '999'
        path.write_text(json.dumps(data)); checksums(self.candidate)
        with self.assertRaisesRegex(ValueError, 'provenance'):
            self.prepare()

    def test_generated_history_preserved_and_readback_failure_never_moves_feed(self):
        self.generated_bundle(self.candidate)
        prior = self.prepare(); prior['published'] = True
        prior['build']['run_id'] = '122'
        for key, filename in (('current', 'firmware.bin'), ('usb_recovery', 'recovery.bin')):
            prior[key]['release_tag'] = 'lightboard-ota-122-1'
            prior[key]['url'] = ota.asset_url('lightboard-ota-122-1', filename)
        original = copy.deepcopy(prior)
        for fail in (True, False):
            api = FakeGitHub(prior)
            api.prior_data[prior['current']['url']] = (self.candidate / ota.APP).read_bytes()
            api.bad_digest = fail
            with patch.dict(os.environ, ENV, clear=True):
                if fail:
                    with self.assertRaisesRegex(ValueError, 'upload verification'):
                        ota.publish(self.output, api, api.download)
                    self.assertIsNone(api.feed)
                    self.prepare_again()
                else:
                    m = ota.publish(self.output, api, api.download)
                    self.assertEqual(m['previous'], original['current'])
                    self.assertFalse(m['automatic_updates'])
                    self.assertEqual(set(api.assets), set(ota.ASSETS))
            self.assertFalse(any(c[0] == 'DELETE' for c in api.calls))

    def prepare_again(self):
        shutil.rmtree(self.output)
        return self.prepare()

    def test_compile_rejects_different_record_before_running_toolchain(self):
        with patch.object(ota_build.subprocess, 'check_output') as metadata:
            with self.assertRaisesRegex(ValueError, 'differs'):
                ota_build.compile_pilot(self.root / 'build', Path('arduino-cli'), self.root,
                    'void restState(unsigned long now) { display.fillScreen(0); }', generation_record=self.record)
            metadata.assert_not_called()

    def test_compile_failure_oversize_and_changed_staged_input_never_make_artifact(self):
        _, function = scene.load_generation(self.record)
        def metadata(command):
            if 'version' in command: return b'{"VersionString":"1.5.1"}'
            return b'{"platforms":[{"id":"esp32:esp32","installed_version":"2.0.17"}]}'
        for mode in ('failure', 'oversize', 'tamper', 'success'):
            with self.subTest(mode=mode):
                work = self.root / mode
                def compiler(command, **kwargs):
                    export = Path(command[command.index('--output-dir') + 1]); export.mkdir()
                    for suffix in ('bin', 'bootloader.bin', 'partitions.bin'):
                        size = 1310721 if mode == 'oversize' and suffix == 'bin' else 512
                        image = b'\xe9' + b'x' * (size - 1)
                        if suffix == 'bin':
                            _, _, foundation, version, _, _ = ota_build.generation_source(self.record)
                            image += b'\0' + foundation.encode() + b'\0' + version.encode() + b'\0'
                        (export / ('LightboardOTA.ino.' + suffix)).write_bytes(image)
                    if mode == 'tamper':
                        (work / 'LightboardOTA/BuildIdentity.h').write_text('changed')
                    return subprocess.CompletedProcess(command, 1 if mode == 'failure' else 0, stdout='compiler output')
                with patch.object(ota_build.subprocess, 'check_output', side_effect=metadata), \
                        patch.object(ota_build.subprocess, 'run', side_effect=compiler):
                    if mode == 'success':
                        report = ota_build.compile_pilot(work, Path('arduino-cli'), self.root,
                                                       function, generation_record=self.record)
                        self.assertEqual(report['model_requests'], 0)
                        ota.checked_bundle(work / 'artifact', 'generated')
                    else:
                        with self.assertRaises(ValueError):
                            ota_build.compile_pilot(work, Path('arduino-cli'), self.root,
                                                    function, generation_record=self.record)
                        self.assertFalse((work / 'artifact').exists())
                        self.assertTrue((work / 'compile.log').exists())

    def test_new_generation_request_provenance_is_distinct_from_saved_reuse(self):
        data = json.loads(self.record.read_text()); data['run_id'] = ENV['GITHUB_RUN_ID']
        self.record.write_text(json.dumps(data))
        with patch.dict(os.environ, ENV, clear=True):
            self.generated_bundle(self.candidate)
            m = self.prepare()
        self.assertTrue(m['generation']['model_request_in_this_run'])
        self.assertEqual(m['generation']['run_id'], m['build']['run_id'])

    def test_changed_prepared_version_stops_before_any_network_access(self):
        self.generated_bundle(self.candidate)
        m = self.prepare(); m['current']['version'] = 'ota-pilot-' + '0' * 24
        ota.write_manifest(self.output, m)
        api = FakeGitHub({})
        with patch.dict(os.environ, ENV, clear=True):
            with self.assertRaisesRegex(ValueError, 'sealed identity'):
                ota.publish(self.output, api, api.download)
        self.assertEqual(api.calls, [])

    def test_orchestrator_rejects_existing_work_and_wrong_prompt_before_compiler(self):
        # Use a temporary project root so the work containment check is exercised too.
        with patch.object(ota_build, 'PROJECT', self.root), patch.object(ota_build, 'compile_pilot') as compile:
            work = self.root / '.build/existing'; work.mkdir(parents=True)
            marker = work / 'keep'; marker.write_text('immutable')
            with self.assertRaisesRegex(ValueError, 'already exists'):
                prompt_build.prepare(work, self.record, self.prompt, build.ROOT.parent / 'generationBrief.md',
                                     Path('arduino-cli'), self.root, '123', '1')
            self.prompt.write_text('different prompt')
            with self.assertRaisesRegex(ValueError, 'different prompt'):
                prompt_build.prepare(self.root / '.build/new', self.record, self.prompt,
                                     build.ROOT.parent / 'generationBrief.md', Path('arduino-cli'), self.root, '123', '1')
            compile.assert_not_called()
            self.assertEqual(marker.read_text(), 'immutable')
