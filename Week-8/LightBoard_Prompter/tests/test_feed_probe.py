"""Exercise the real feed function with rate exhaustion and bounded responses."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PROJECT=Path(__file__).resolve().parents[1]


class FeedProbeTests(unittest.TestCase):
    def test_api_fallback_backoff_and_response_bounds(self):
        runtime=(PROJECT/'device/runtime/LightboardRuntime.cpp').read_text()
        function=runtime[runtime.index('bool downloadManifest('):runtime.index('const cJSON* field(')]
        harness=(PROJECT/'tests/feed_probe.cpp').read_text()
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'feed.cpp';program=Path(folder)/'feed'
            source.write_text(harness.replace('// PRODUCTION_FEED',function))
            subprocess.run([shutil.which('clang++') or 'c++','-std=c++11','-Wall','-Wextra','-Werror',
                            '-I',str(PROJECT/'device/runtime'),str(source),'-o',str(program)],check=True,capture_output=True)
            subprocess.run([str(program)],check=True,capture_output=True)
