"""Credential-source and fail-closed checks; all HTTP requests are mocked."""

from contextlib import redirect_stdout, redirect_stderr
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_gemini_api as client


class ApiAccessTests(unittest.TestCase):
    def invoke(self, flags, environment, response=None, error=None):
        output = io.StringIO()
        body = io.BytesIO(json.dumps(response or {}).encode())
        with patch.object(sys, "argv", ["test_gemini_api.py", *flags]), \
             patch.dict(os.environ, environment, clear=True), \
             patch.object(client.Path, "read_text", return_value="local-test-placeholder") as file_read, \
             patch.object(client.urllib.request, "build_opener") as opener, \
             redirect_stdout(output):
            if error:
                opener.return_value.open.side_effect = error
            else:
                opener.return_value.open.return_value.__enter__.return_value = body
            result = client.main()
        return result, output.getvalue(), opener, file_read

    def test_missing_actions_secret_stops_before_network_or_file_access(self):
        result, text, opener, file_read = self.invoke(["--actions-secret"], {"GITHUB_ACTIONS": "true"})
        self.assertEqual(result, 1)
        self.assertIn("secret is missing", text)
        opener.assert_not_called()
        file_read.assert_not_called()

    def test_actions_mode_refuses_to_run_as_a_local_command(self):
        result, _, opener, file_read = self.invoke(["--actions-secret"], {"GEMINI_API_KEY": "other-placeholder"})
        self.assertEqual(result, 1)
        opener.assert_not_called()
        file_read.assert_not_called()

    def test_local_mode_ignores_unrelated_environment_key_and_never_logs_keys(self):
        result, text, opener, _ = self.invoke([], {"GEMINI_API_KEY": "unrelated-placeholder"},
            {"candidates": [{"content": {"parts": [{"text": "LIGHTBOARD_API_OK"}]}}]})
        self.assertEqual(result, 0)
        opener.return_value.open.assert_called_once()
        request = opener.return_value.open.call_args.args[0]
        self.assertEqual(request.get_header("X-goog-api-key"), "local-test-placeholder")
        self.assertEqual(json.loads(request.data)["generationConfig"]["thinkingConfig"]["thinkingLevel"], "low")
        self.assertNotIn("local-test-placeholder", text)
        self.assertNotIn("unrelated-placeholder", text)

    def test_actions_metadata_mode_sends_no_generation_body(self):
        result, text, opener, file_read = self.invoke(["--actions-secret", "--check-key"],
            {"GITHUB_ACTIONS": "true", "GEMINI_API_KEY": "actions-test-placeholder"},
            {"name": "models/gemini-3.8-flash"})
        self.assertEqual(result, 0)
        request = opener.return_value.open.call_args.args[0]
        self.assertEqual(request.get_method(), "GET")
        self.assertIsNone(request.data)
        self.assertNotIn(":generateContent", request.full_url)
        self.assertNotIn("actions-test-placeholder", request.full_url + text)
        file_read.assert_not_called()

    def test_api_error_key_is_redacted_and_not_retried(self):
        error = urllib.error.HTTPError("https://generativelanguage.googleapis.com", 503, "busy", {},
            io.BytesIO(json.dumps({"error": {"message": "busy local-test-placeholder"}}).encode()))
        result, text, opener, _ = self.invoke([], {}, error=error)
        self.assertEqual(result, 1)
        self.assertNotIn("local-test-placeholder", text)
        self.assertIn("[REDACTED]", text)
        opener.return_value.open.assert_called_once()

    def test_lite_selection_uses_one_explicit_model_with_supported_thinking(self):
        result, _, opener, _ = self.invoke(["--model", "gemini-3.5-flash-lite"], {},
            {"candidates": [{"content": {"parts": [{"text": "LIGHTBOARD_API_OK"}]}}]})
        self.assertEqual(result, 0)
        opener.return_value.open.assert_called_once()
        request = opener.return_value.open.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/models/gemini-3.5-flash-lite:generateContent"))
        self.assertEqual(json.loads(request.data)["generationConfig"]["thinkingConfig"]["thinkingLevel"], "minimal")

    def test_lite_metadata_matches_the_selected_model_without_generation(self):
        result, text, opener, _ = self.invoke(["--model", "gemini-3.5-flash-lite", "--check-key"], {},
            {"name": "models/gemini-3.5-flash-lite"})
        self.assertEqual(result, 0)
        request = opener.return_value.open.call_args.args[0]
        self.assertEqual(request.get_method(), "GET")
        self.assertIsNone(request.data)
        self.assertTrue(request.full_url.endswith("/models/gemini-3.5-flash-lite"))
        self.assertIn("MODEL_INFO_OK", text)

    def test_unreviewed_model_is_rejected_before_key_or_network_access(self):
        with patch.object(sys, "argv", ["test_gemini_api.py", "--model", "unreviewed-model"]), \
             patch.object(client.Path, "read_text") as file_read, \
             patch.object(client.urllib.request, "build_opener") as opener, \
             redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as result:
                client.main()
        self.assertEqual(result.exception.code, 2)
        file_read.assert_not_called()
        opener.assert_not_called()


if __name__ == "__main__":
    unittest.main()
