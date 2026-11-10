"""Offline checks for the review-only API client. No real requests."""
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import generate_candidate as client


class CandidateTests(unittest.TestCase):
    def response(self, text="void restState(unsigned long now) {}", finish="STOP"):
        data = {"candidates": [{"finishReason": finish, "content": {"parts": [{"text": text}]}}]}
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(data).encode()
        return response

    def test_one_post_with_fixed_model_and_no_tools(self):
        opener = MagicMock()
        opener.open.return_value = self.response()
        with patch.object(client.urllib.request, "build_opener", return_value=opener):
            result = client.generate("private-test-key", "creative brief")
        opener.open.assert_called_once()
        req = opener.open.call_args.args[0]
        body = json.loads(req.data)
        self.assertTrue(req.full_url.endswith("/gemini-3.5-flash-lite:generateContent"))
        self.assertNotIn("private-test-key", req.full_url)
        self.assertNotIn("private-test-key", req.data.decode())
        self.assertEqual(body["generationConfig"]["thinkingConfig"]["thinkingLevel"], "minimal")
        self.assertEqual(body["generationConfig"]["candidateCount"], 1)
        self.assertNotIn("tools", body)
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 120)
        self.assertFalse(result["compiled"])
        self.assertFalse(result["uploaded_to_board"])

    def test_truncation_is_rejected(self):
        opener = MagicMock()
        opener.open.return_value = self.response(finish="MAX_TOKENS")
        with patch.object(client.urllib.request, "build_opener", return_value=opener):
            with self.assertRaisesRegex(ValueError, "complete single candidate"):
                client.generate("private-test-key", "brief")

    def test_response_containing_actual_key_is_rejected(self):
        opener = MagicMock()
        opener.open.return_value = self.response("AQ-test-modern-secret")
        with patch.object(client.urllib.request, "build_opener", return_value=opener):
            with self.assertRaisesRegex(ValueError, "credential") as error:
                client.generate("AQ-test-modern-secret", "brief")
        self.assertNotIn("AQ-test-modern-secret", str(error.exception))

    def test_capacity_error_is_redacted_and_not_retried(self):
        body = io.BytesIO(json.dumps({"error": {"message": "limit AQ-test-modern-secret"}}).encode())
        opener = MagicMock()
        opener.open.side_effect = urllib.error.HTTPError("https://example.test", 429, "limit", {}, body)
        with patch.object(client.urllib.request, "build_opener", return_value=opener):
            with self.assertRaisesRegex(ValueError, "HTTP 429") as error:
                client.generate("AQ-test-modern-secret", "brief")
        self.assertNotIn("AQ-test-modern-secret", str(error.exception))
        self.assertIn("[REDACTED]", str(error.exception))
        opener.open.assert_called_once()
        self.assertTrue(body.closed)

    def test_redirect_is_refused(self):
        self.assertIsNone(client.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://other.test"))

    def test_actions_key_requires_actions_and_nonempty_secret(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError):
                client.load_key(True)
        with patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}, clear=True):
            with self.assertRaises(ValueError):
                client.load_key(True)

    def test_existing_output_stops_before_key_or_network(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "existing.json"
            output.write_text("preserved")
            with patch.object(sys, "argv", ["generate_candidate.py", "--prompt-file", "unused", "--output", str(output)]):
                with patch.object(client, "load_key") as key, patch.object(client, "generate") as generate:
                    with self.assertRaisesRegex(ValueError, "already exists"):
                        client.main()
                    key.assert_not_called()
                    generate.assert_not_called()
            self.assertEqual(output.read_text(), "preserved")

    def test_current_brief_includes_brightness_and_exact_prompt(self):
        root = Path(__file__).resolve().parents[1]
        prompt, creative = client.load_prompt(
            root / "generationBrief.md",
            root / "experiments/flash-lite/2026-11-09/overflowing-heart/creative-prompt.txt",
        )
        self.assertEqual(creative, "An overflowing heart that keeps giving")
        self.assertIn("scale its red, green, and blue channels together", prompt)
        self.assertIn("Do not change the panel-wide hardware brightness", prompt)
        self.assertNotIn("{{creative_prompt}}", prompt)


if __name__ == "__main__":
    unittest.main()
