"""Run the production read-only probe with bounded, failing and hostile responses."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[1]


class HttpsProbeTests(unittest.TestCase):
    def test_production_probe_bounds_failures_and_redaction(self):
        runtime = (PROJECT / 'device/runtime/LightboardRuntime.cpp').read_text()
        function = runtime[runtime.index('void probeFirmware('):runtime.index('bool downloadManifest(')]
        harness = (PROJECT / 'tests/https_probe.cpp').read_text()
        compiler = shutil.which('clang++') or shutil.which('c++')
        self.assertIsNotNone(compiler)
        with tempfile.TemporaryDirectory() as temporary:
            source, program = [Path(temporary) / name for name in ('probe.cpp', 'probe')]
            source.write_text(harness.replace('// PRODUCTION_PROBE', function))
            subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror',
                            '-I', str(PROJECT / 'device/runtime'), str(source), '-o', str(program)],
                           check=True, capture_output=True)
            subprocess.run([str(program)], check=True, capture_output=True)
