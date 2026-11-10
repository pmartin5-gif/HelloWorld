"""Offline pipeline checks: editing boundary, provenance, and failed-build isolation."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud import build, scene

FUNCTION = "void restState(unsigned long now) { display.fillScreen(0); display.drawPixel(2, 3, display.color565(255, 0, 0)); }"


class SceneTests(unittest.TestCase):
    def test_saved_model_functions_remain_supported(self):
        root = Path(__file__).resolve().parents[1]
        cases = list((root / "experiments/model-verification/2026-11-06").glob("*/candidate.cpp"))
        self.assertEqual(len(cases), 3)
        for case in cases:
            with self.subTest(scene=case.parent.name):
                scene.validate_function(case.read_text())

    def test_composition_preserves_every_protected_byte(self):
        lock = json.loads((build.ROOT / "build-lock.json").read_text())
        original = (build.ROOT / lock["sketch"] / "LightboardBaseline.ino").read_text()
        updated = scene.compose(original, FUNCTION, lock["baseline"]["protected_sha256"])
        a, b = scene.function_span(original)
        c, d = scene.function_span(updated)
        self.assertEqual(original[:a], updated[:c])
        self.assertEqual(original[b:], updated[d:])
        self.assertEqual(scene.protected_hash(original), scene.protected_hash(updated))

    def test_braces_in_comments_strings_and_fence(self):
        code = 'void restState(unsigned long now) { /* } */ const char* label = R"tag({ })tag"; display.fillScreen(0); }'
        self.assertEqual(scene.validate_function('```cpp\n' + code + '\n```'), code)

    def test_forbidden_operations_and_extra_definitions(self):
        bodies = [
            'delay(1000);', 'display.showBuffer();', 'display.setBrightness(0);',
            'auto& other = display;', 'lastFrame = now;', 'timerMux = {};',
            'WiFi.disconnect();', 'new int[10];', 'malloc(10);',
            'Serial.println("test");', '#include <WiFi.h>\n',
            'while (true) {}', 'for (;;) {}', 'system("x");',
            'asm("nop");', 'int* ptr = (int*)0x1000;',
            '// hidden splice \\\n delay(2);',
        ]
        for body in bodies:
            with self.subTest(body=body):
                with self.assertRaises(ValueError):
                    scene.validate_function('void restState(unsigned long now) {\n' + body + '\n}')
        for extra in ['int extra = 1;\n' + FUNCTION, FUNCTION + '\nvoid setup() {}']:
            with self.assertRaises(ValueError):
                scene.validate_function(extra)

    def test_response_provenance_is_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "generation.json"
            path.write_text(json.dumps({"model": "gemini-3.5-flash-lite", "finish_reason": "STOP", "response_text": FUNCTION, "response_sha256": "wrong"}))
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                scene.load_generation(path)


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name)
        self.candidate = self.work / "candidate.cpp"
        self.candidate.write_text(FUNCTION)
        self.artifact = self.work / "candidate-artifact"
        self.baseline_artifact = self.work / "artifact"
        self.baseline_artifact.mkdir()
        (self.baseline_artifact / "keep.txt").write_text("previous baseline")
        self.args = ["build.py", "--candidate", str(self.candidate), "--data-dir", str(self.work / "installed")]

    def invoke(self, compiler):
        def metadata(command):
            if "version" in command:
                return b'{"VersionString":"1.5.1"}'
            return b'{"platforms":[{"id":"esp32:esp32","installed_version":"2.0.17"}]}'
        with patch.object(build, "WORK", self.work), patch.object(sys, "argv", self.args), patch.object(build.subprocess, "check_output", side_effect=metadata), patch.object(build, "run", side_effect=compiler), contextlib.redirect_stdout(io.StringIO()):
            return build.main()

    def export(self, command, capture=False, size=1024):
        output = Path(command[command.index("--output-dir") + 1])
        output.mkdir(parents=True)
        for suffix in ("bin", "bootloader.bin", "partitions.bin"):
            (output / ("LightboardBaseline.ino." + suffix)).write_bytes(b"x" * (size if suffix == "bin" else 8))
        # Check that compilation targets a composed copy, never the baseline itself.
        sketch = Path(command[-1])
        self.assertNotEqual(sketch, build.ROOT / "firmware/LightboardBaseline")
        self.assertIn(FUNCTION, (sketch / "LightboardBaseline.ino").read_text())
        return "Sketch uses 1024 bytes.\nGlobal variables use 21,984 bytes.\n"

    def test_success_creates_checksummed_bundle_and_manifest(self):
        self.assertEqual(self.invoke(self.export), 0)
        report = json.loads((self.artifact / "build-report.json").read_text())
        manifest = json.loads((self.artifact / "manifest.json").read_text())
        self.assertEqual(report["static_dram_bytes_reported"], 21984)
        self.assertFalse(report["model_api_used"])
        self.assertFalse(report["creative_review_required"])
        self.assertFalse(report["published"])
        self.assertFalse(report["uploaded_to_board"])
        self.assertFalse(manifest["ota_enabled"])
        self.assertEqual(manifest["firmware"]["sha256"], build.sha256(self.artifact / manifest["firmware"]["filename"]))
        for line in (self.artifact / "SHA256SUMS").read_text().splitlines():
            digest, name = line.split("  ", 1)
            self.assertEqual(build.sha256(self.artifact / name), digest)
        self.assertEqual((self.baseline_artifact / "keep.txt").read_text(), "previous baseline")

    def test_invalid_candidate_clears_stale_candidate_bundle_before_compiler(self):
        self.artifact.mkdir()
        (self.artifact / "stale.bin").write_bytes(b"old")
        self.candidate.write_text("void setup() {}")
        def compiler(*args, **kwargs):
            self.fail("Invalid code must not reach compilation")
        with self.assertRaises(ValueError):
            self.invoke(compiler)
        self.assertFalse(self.artifact.exists())
        self.assertTrue(self.baseline_artifact.exists())

    def test_generated_build_retains_exact_prompt_and_response(self):
        record = self.work / "generation.json"
        data = {
            "model": "gemini-3.5-flash-lite", "finish_reason": "STOP",
            "response_text": FUNCTION, "response_sha256": scene.digest(FUNCTION.encode()),
            "creative_prompt": "A heartbeat", "submitted_prompt": "Saved brief plus A heartbeat",
        }
        record.write_text(json.dumps(data))
        self.args += ["--generation-record", str(record)]
        self.assertEqual(self.invoke(self.export), 0)
        saved = json.loads((self.artifact / "generation.json").read_text())
        report = json.loads((self.artifact / "build-report.json").read_text())
        self.assertEqual(saved, data)
        self.assertTrue(report["model_api_used"])
        self.assertEqual(report["generation_response_sha256"], data["response_sha256"])

    def test_failed_compile_retains_log_without_eligible_bundle(self):
        def failed(command, capture=False):
            raise subprocess.CalledProcessError(1, command, output="real compiler failure")
        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke(failed)
        self.assertFalse(self.artifact.exists())
        self.assertEqual((self.work / "candidate-compile.log").read_text(), "real compiler failure")

    def test_oversized_image_is_not_bundled(self):
        def oversized(command, capture=False):
            return self.export(command, capture, size=1310721)
        with self.assertRaisesRegex(ValueError, "exceeds"):
            self.invoke(oversized)
        self.assertFalse(self.artifact.exists())

    def test_changed_response_cannot_build_as_model_output(self):
        record = self.work / "generation.json"
        different = "void restState(unsigned long now) { display.fillScreen(0); }"
        record.write_text(json.dumps({"model": "gemini-3.5-flash-lite", "finish_reason": "STOP", "response_text": different, "response_sha256": scene.digest(different.encode())}))
        self.args += ["--generation-record", str(record)]
        with self.assertRaisesRegex(ValueError, "differs"):
            self.invoke(lambda *args, **kwargs: self.fail("Mismatched record must stop before compilation"))


if __name__ == "__main__":
    unittest.main()
