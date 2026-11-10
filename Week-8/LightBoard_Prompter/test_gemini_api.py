#!/usr/bin/env python3
"""One Gemini API smoke test; uses the privately saved, no-billing project key.

Run manually from a network-capable Terminal. Requires only Python 3.
Reference: https://ai.google.dev/gemini-api/docs/generate-content/get-started
"""

import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

from check_api_connection import explain

THINKING_LEVELS = {
    "gemini-3.8-flash": "low",
    "gemini-3.5-flash-lite": "minimal",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check-key", action="store_true",
        help="Only retrieve model information with the saved key; do not generate content",
    )
    parser.add_argument(
        "--actions-secret", action="store_true",
        help="In GitHub Actions only, read GEMINI_API_KEY instead of the Mac's private file",
    )
    parser.add_argument(
        "--model", choices=tuple(THINKING_LEVELS), default="gemini-3.8-flash",
        help="Explicit model for this one request; no automatic model switching",
    )
    args = parser.parse_args()
    if args.actions_secret:
        if os.environ.get("GITHUB_ACTIONS") != "true":
            print("STOP: --actions-secret is intended for GitHub Actions. No request sent.")
            return 1
        key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not key:
            print("STOP: GEMINI_API_KEY repository secret is missing. No request sent.")
            return 1
    else:
        # Local tests always use this project's saved key, even if another key is in the environment.
        key_path = Path.home() / ".config/lightboard-prompter/gemini-api-key.txt"
        try:
            key = key_path.read_text().strip()
        except OSError:
            print("STOP: Cannot read the private key file. Do not paste the key into chat.")
            return 1
    if not key or len(key.splitlines()) != 1:
        print("STOP: The private key file is empty or has an unexpected format.")
        return 1

    payload = {
        "contents": [{"parts": [{"text": "Reply with exactly: LIGHTBOARD_API_OK"}]}],
        "generationConfig": {
            "maxOutputTokens": 512,
            "thinkingConfig": {"thinkingLevel": THINKING_LEVELS[args.model]},
        },
    }
    model_url = f"https://generativelanguage.googleapis.com/v1beta/models/{args.model}"
    if args.check_key:
        request = urllib.request.Request(model_url, headers={"x-goog-api-key": key}, method="GET")
        print(f"Checking {args.model} information with the saved key. No generation or retries.", flush=True)
        timeout = 20
    else:
        request = urllib.request.Request(
            model_url + ":generateContent",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
            method="POST",
        )
        print(f"Sending one request to {args.model} with {THINKING_LEVELS[args.model]} thinking. Allow up to two minutes.", flush=True)
        print("No retries or paid fallback.", flush=True)
        timeout = 120
    # Refuse redirects rather than forwarding a credential to another location.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=timeout) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read()).get("error", {})
            message = str(detail.get("message", "No error details returned."))
            message = message.replace(key, "[REDACTED]")
        except (ValueError, AttributeError):
            message = "Could not parse the error details."
        finally:
            error.close()
        print(f"STOP: HTTP {error.code}: {message}")
        print("No retry was made. Do not enable billing to resolve this test.")
        return 1
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        print("STOP: No HTTP response was received from the API.")
        explain(error)
        print("No HTTP success was received; this does not establish that the key is invalid.")
        return 1
    except ValueError:
        print("STOP: The API returned an unreadable response.")
        return 1

    if args.check_key:
        if data.get("name") == f"models/{args.model}":
            print("PASS: MODEL_INFO_OK — the API returned model information using the saved key.")
            print("Generation is still unverified. No generation request was sent.")
            return 0
        print("HTTP success, but the expected model information was not returned.")
        return 2

    candidates = data.get("candidates", [])
    reply = "".join(
        part.get("text", "")
        for candidate in candidates
        for part in candidate.get("content", {}).get("parts", [])
        if not part.get("thought", False)
    ).strip()
    if reply == "LIGHTBOARD_API_OK":
        print(f"PASS: LIGHTBOARD_API_OK — {args.model} completed the API test.")
        return 0
    print("HTTP success, but the expected test reply was not returned.")
    print("Finish reasons:", ", ".join(str(c.get("finishReason", "unknown")) for c in candidates) or "no candidates")
    print("No automatic retry was made. Share this result for review.")
    return 2


if __name__ == "__main__":
    sys.exit(main())
