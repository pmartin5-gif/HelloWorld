#!/usr/bin/env python3
"""Generate one review-only animation candidate; never compile or deploy it."""

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

MODEL = "gemini-3.5-flash-lite"
MAX_RESPONSE_BYTES = 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_key(actions_secret):
    if actions_secret:
        if os.environ.get("GITHUB_ACTIONS") != "true":
            raise ValueError("Actions secret mode requires GitHub Actions")
        key = os.environ.get("GEMINI_API_KEY", "").strip()
    else:
        key = (Path.home() / ".config/lightboard-prompter/gemini-api-key.txt").read_text().strip()
    if not key or len(key.splitlines()) != 1:
        raise ValueError("Missing or malformed private project key; no request sent")
    return key


def load_prompt(brief_path, prompt_path):
    document = brief_path.read_text()
    if document.count("```text\n") != 1:
        raise ValueError("Expected exactly one text brief")
    brief = document.split("```text\n", 1)[1].split("```", 1)[0].strip()
    prompt = prompt_path.read_text().strip()
    if brief.count("{{creative_prompt}}") != 1 or not 1 <= len(prompt) <= 2000:
        raise ValueError("Invalid brief placeholder or creative prompt length")
    return brief.replace("{{creative_prompt}}", prompt), prompt


def generate(key, prompt):
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "candidateCount": 1,
            "maxOutputTokens": 8192,
            "thinkingConfig": {"thinkingLevel": "minimal"},
        },
    }
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    started = time.monotonic()
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=120) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise ValueError("API response exceeded the review limit")
        if key.encode() in raw:
            raise ValueError("API response contains a credential; refusing to save or print it")
        data = json.loads(raw)
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read(MAX_RESPONSE_BYTES)).get("error", {})
            message = str(detail.get("message", "No error details")).replace(key, "[REDACTED]")
        except (ValueError, AttributeError):
            message = "Could not parse error details"
        finally:
            error.close()
        raise ValueError(f"HTTP {error.code}: {message}; no retry or paid fallback") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ValueError("No HTTP success received; no retry or paid fallback") from None
    candidates = data.get("candidates", [])
    if len(candidates) != 1 or candidates[0].get("finishReason") != "STOP":
        raise ValueError("No complete single candidate; do not compile truncated or blocked output")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    if not text.strip() or len(text.encode()) > 65536:
        raise ValueError("Missing or oversized candidate text")
    return {
        "model": MODEL,
        "model_version": data.get("modelVersion"),
        "thinking_level": "minimal",
        "generation_seconds": round(time.monotonic() - started, 3),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "finish_reason": "STOP",
        "usage_metadata": data.get("usageMetadata", {}),
        "response_text": text,
        "response_sha256": hashlib.sha256(text.encode()).hexdigest(),
        "generation_requests": 1,
        "automatic_retries": False,
        "fallback": False,
        "compiled": False,
        "uploaded_to_board": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brief", type=Path, default=Path(__file__).with_name("generationBrief.md"))
    parser.add_argument("--prompt-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="New JSON file; existing results are never overwritten")
    parser.add_argument("--actions-secret", action="store_true")
    parser.add_argument("--log-result", action="store_true", help="Emit the generic review candidate as base64 JSON in public Actions logs")
    args = parser.parse_args()
    # Check every local precondition before loading a key or sending a request.
    if args.output.exists():
        raise ValueError("Output already exists; no request sent")
    prompt, creative = load_prompt(args.brief, args.prompt_file)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    key = load_key(args.actions_secret)
    if key in prompt:
        raise ValueError("Prompt contains a credential; no request sent")
    print(f"Sending one review-only animation request to {MODEL}. No retry or fallback.", flush=True)
    result = generate(key, prompt)
    result.update(
        creative_prompt=creative,
        submitted_prompt=prompt,
        brief_sha256=hashlib.sha256(args.brief.read_bytes()).hexdigest(),
        commit=os.environ.get("GITHUB_SHA"),
        run_id=os.environ.get("GITHUB_RUN_ID"),
    )
    encoded = (json.dumps(result, indent=2) + "\n").encode()
    # A final exact check covers all saved/logged content, including metadata.
    if key.encode() in encoded:
        raise ValueError("Credential detected in result; refusing to save or print it")
    with args.output.open("xb") as output:
        output.write(encoded)
    if args.log_result:
        transport = base64.b64encode(encoded).decode()
        print("LIGHTBOARD_CANDIDATE_BEGIN")
        for start in range(0, len(transport), 3000):
            print("LIGHTBOARD_CANDIDATE_DATA " + transport[start:start + 3000])
        print("LIGHTBOARD_CANDIDATE_END")
    print(f"PASS: CANDIDATE_RECEIVED — {result['generation_seconds']}s; validation, preview, and compilation still required.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"STOP: {error}", file=sys.stderr)
        sys.exit(1)
