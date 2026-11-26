"""Offline foundation checks; actual ESP32 TLS/flash/heap/rollback require hardware."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud import build, ota_build, scene

PROJECT = Path(__file__).resolve().parents[1]
LOCK = json.loads((build.ROOT / 'build-lock.json').read_text())
BASELINE = (build.ROOT / LOCK['sketch'] / 'LightboardBaseline.ino').read_text()


class OtaFoundationTests(unittest.TestCase):
    def test_actual_cpp_update_policy_rejects_wrong_targets_and_non_ota_images(self):
        compiler = shutil.which('clang++') or shutil.which('c++')
        self.assertIsNotNone(compiler)
        with tempfile.TemporaryDirectory() as folder:
            program = Path(folder) / 'policy'
            subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror',
                            str(PROJECT / 'tests/ota_policy.cpp'), '-o', str(program)], check=True, capture_output=True)
            subprocess.run([str(program)], check=True, capture_output=True)

    def test_original_animation_and_display_setup_are_preserved(self):
        source = ota_build.source_for(BASELINE)
        a, b = scene.function_span(BASELINE)
        c, d = scene.function_span(source)
        self.assertEqual(BASELINE[a:b], source[c:d])
        start = BASELINE.index('  pinMode(P_OE, OUTPUT);')
        end = BASELINE.index('  Serial.println("Ready: animation");')
        self.assertIn(BASELINE[start:end], source)
        loop = BASELINE[BASELINE.index('void loop()'):].replace('  delay(1);',
               '  lightboard::observeFrame(lastFrame);\n  delay(1);')
        loop = loop.replace('    portENTER_CRITICAL(&timerMux);\n    display.showBuffer();\n    portEXIT_CRITICAL(&timerMux);',
               '    if (xSemaphoreTake(displayAccess, portMAX_DELAY) == pdTRUE) {\n'
               '      display.showBuffer();\n      xSemaphoreGive(displayAccess);\n    }')
        self.assertTrue(source.endswith(loop))

    def test_refresh_interrupt_never_executes_blocking_spi_or_mutex_calls(self):
        source = ota_build.source_for(BASELINE)
        interrupt = source[source.index('void IRAM_ATTR display_updater()'):source.index('void refreshDisplayTask')]
        self.assertIn('vTaskNotifyGiveFromISR', interrupt)
        self.assertNotIn('display.display', interrupt)
        self.assertNotIn('xSemaphoreTake', interrupt)
        self.assertIn('display.display(10)', source[source.index('void refreshDisplayTask'):source.index('void lightboardFlashGuard')])

    def test_unexpected_source_does_not_receive_hooks(self):
        with self.assertRaisesRegex(ValueError, 'Unexpected baseline'):
            ota_build.source_for(BASELINE.replace('  delay(1);', '  delay(2);'))

    def test_locked_foundation_detects_network_code_tampering(self):
        with tempfile.TemporaryDirectory() as temporary:
            device = Path(temporary) / 'device'
            shutil.copytree(PROJECT / 'device', device)
            runtime = device / 'runtime/LightboardRuntime.cpp'
            runtime.write_text(runtime.read_text() + '\n// changed\n')
            with patch.object(ota_build, 'DEVICE', device):
                with self.assertRaisesRegex(ValueError, 'reviewed lock'):
                    ota_build.verify_foundation(LOCK)

    def test_stage_is_complete_and_refuses_overwriting_a_manual_edit(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            folder, _, foundation, version = ota_build.stage(work)
            self.assertEqual(len(foundation), 64)
            self.assertTrue(version.startswith('ota-pilot-'))
            self.assertEqual({p.name for p in folder.iterdir()},
                {'LightboardOTA.ino', 'partitions.csv', 'BuildIdentity.h', *ota_build.RUNTIME_FILES})
            source = folder / 'LightboardOTA.ino'
            source.write_text(source.read_text() + '\n// manual edit\n')
            with self.assertRaisesRegex(ValueError, 'Staged file changed'):
                ota_build.stage(work)

    def test_candidate_preserves_entire_network_foundation(self):
        function = 'void restState(unsigned long now) { display.fillScreen(0); }'
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            folder, _, foundation, _ = ota_build.stage(work, function)
            prepared = (folder / 'LightboardOTA.ino').read_text()
            self.assertEqual(scene.protected_hash(prepared), scene.protected_hash(ota_build.source_for(BASELINE)))
            self.assertIn('lightboard::begin();', prepared)
            self.assertIn('lightboard::observeFrame(lastFrame);', prepared)
            self.assertEqual(len(foundation), 64)

    def test_network_calls_remain_forbidden_in_generated_function(self):
        for code in ('WiFi.disconnect();', 'lightboard::begin();', 'esp_ota_set_boot_partition(0);',
                     'lightboardFlashPaused = true;', 'displayRefreshCount = 0;',
                     'displayAccess = 0;', 'displayRefreshTask = 0;'):
            with self.subTest(code=code), self.assertRaises(ValueError):
                scene.validate_function('void restState(unsigned long now) { ' + code + ' }')

    def test_core_boot_auto_confirmation_is_overridden_and_http_auth_is_not_disabled(self):
        runtime = (PROJECT / 'device/runtime/LightboardRuntime.cpp').read_text()
        self.assertIn('extern "C" bool verifyRollbackLater() { return true; }', runtime)
        self.assertIn('config.crt_bundle_attach = esp_crt_bundle_attach;', runtime)
        self.assertIn('config.skip_cert_common_name_check = false;', runtime)
        self.assertNotIn('setInsecure', runtime)
        self.assertNotIn('nvs_flash_erase', runtime)
        self.assertIn('Preferences store;', runtime)
        self.assertIn('store.putBytes("wifi", &next', runtime)


if __name__ == '__main__':
    unittest.main()
