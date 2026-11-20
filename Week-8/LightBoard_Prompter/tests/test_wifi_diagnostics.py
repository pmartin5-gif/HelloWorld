"""Run the real diagnostic function against simulated radio results; no device access."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[1]


class WifiDiagnosticTests(unittest.TestCase):
    def test_production_diagnostic_redaction_name_matching_and_scan_failures(self):
        runtime = (PROJECT / 'device/runtime/LightboardRuntime.cpp').read_text()
        function = runtime[runtime.index('void diagnoseWifi('):runtime.index('void provision(')]
        harness = (PROJECT / 'tests/wifi_diagnostics.cpp').read_text()
        compiler = shutil.which('clang++') or shutil.which('c++')
        self.assertIsNotNone(compiler)
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'diagnostic.cpp'
            source.write_text(harness.replace('// PRODUCTION_DIAGNOSTIC', function))
            program = Path(temporary) / 'diagnostic'
            subprocess.run([compiler, '-std=c++11', '-Wall', '-Wextra', '-Werror',
                            str(source), '-o', str(program)], check=True, capture_output=True)
            subprocess.run([str(program)], check=True, capture_output=True)
