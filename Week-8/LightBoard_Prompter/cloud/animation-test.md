# Flash-Lite animation review test

This is the next creative checkpoint after the successful API connection test. It generates one candidate for **An overflowing heart that keeps giving** using the current `generationBrief.md`, including expressive brightness for individual pixels. It does not change or upload the live firmware.

## Prepared behavior

Workflow: `.github/workflows/lightboard-animation-test.yml` at the repository root. Manual only; public repositories only; standard Ubuntu 24.04; four-minute timeout; shares the diagnostic concurrency group so model tests are serialized.

The workflow checks out the generator, saved brief, and fixed generic prompt. It reuses the existing private `GEMINI_API_KEY` Actions secret to send exactly one Gemini 3.5 Flash-Lite request with minimal thinking, an 8,192-token output cap, and a 120-second timeout. There are no retries, correction calls, model/provider fallback, grounding tools, caches, or artifact uploads. Check the actual project's free allowance and disabled billing before dispatching. A free model name alone does not guarantee a free project.

The candidate is returned as base64 JSON in public job logs, with fixed marker lines, so generated text cannot become an Actions workflow command. Only the generic creative prompt and brief are submitted; no live sketch, Wi-Fi credential, or other project files are sent to the model. The key stays in the HTTPS request header. Exact credential checks reject a response containing the saved key before it is saved or printed. Redirects are refused. A blocked, incomplete, or oversized response fails the job.

The runner never executes or compiles generated code. `CANDIDATE_RECEIVED` means a complete API response was received; it is not validation or compilation success.

## Review after the run

1. Retrieve the job log and decode only the `LIGHTBOARD_CANDIDATE_DATA` lines between the begin/end markers. Preserve the exact returned text and submitted prompt in the experiment directory.
2. Review the code, validate its single `restState` boundary and runtime restrictions with the existing helper, and compose it into an isolated copy of the pinned cloud baseline. Compare protected bytes with the baseline. Do not write the live sketch.
3. Use the existing desktop preview and inspect its contact sheet. This approximates composition and pixel colors; it does not reproduce physical LED glow or board timing.
4. Compile only the isolated candidate with the pinned ESP32 2.0.17 core and vendored libraries. Retain the actual log, binary size, source hashes, and result. No serial operation or device upload is part of this test.
5. Record the creative review separately from API/build success. The original accepted scene used 3.8 Flash; Lite needs its own review, and adoption for unattended use is a later decision.

## Local invocation

On a network-capable Mac, the same generator reads the existing private local key file by default:

```bash
python3 generate_candidate.py \
  --prompt-file experiments/flash-lite/2026-11-09/overflowing-heart/creative-prompt.txt \
  --output .build/flash-lite-heart-response.json
```

Check free eligibility before running. An existing output file stops before key access or any request. The local environment's unrelated `GEMINI_API_KEY` is ignored. `--actions-secret` requires GitHub Actions and a nonempty secret. Keep `--log-result` for this non-sensitive cloud review experiment, not future private prompts.

Eight mocked tests cover request configuration, incomplete-output rejection, credential redaction, no retry, redirect refusal, missing-secret handling, preservation of existing results, and loading the current brightness brief. These tests make no API requests.

## Current checkpoint — November 9, 2026

Files and offline checks are prepared. Rechecked AI Studio: Lightboard project Free tier, Set up billing available; Lite displayed peak usage/limits of 1/15 RPM, 10/250K TPM, and 1/500 RPD. No billing setting changed. The GitHub connector rejected tree publication with HTTP 403, Resource not accessible by integration. Publish the scoped local commit through the existing SSH route, then dispatch once. No animation generation, preview, or compile has occurred yet for Lite.
