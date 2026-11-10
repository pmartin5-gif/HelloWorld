# Manual prompt-to-firmware pipeline

**Scope updated November 9, 2026:** The user deferred animation appearance and creative tuning. No preview or aesthetic approval is required. Technical validation, compilation, pinned inputs, and accurate device status remain required.

## Behavior

The manual **Lightboard prompt build** workflow accepts a creative prompt of 1–2,000 characters. It loads `generationBrief.md`, sends one request to the existing free-project Gemini 3.5 Flash-Lite API, validates the returned function, and compiles it against the preserved ESP32 foundation. It does not publish or install a device update.

Prompt text passes through an environment variable and is written as data; it is never interpolated into shell code. The private API secret is available only to the generation step. Generated C++ is never executed on the runner; Arduino CLI compiles it for the ESP32.

Generation uses minimal thinking, an 8,192-token output cap, and a 120-second timeout. There are no retries, correction calls, model switches, paid fallbacks, grounding tools, schedules, or Actions caches. Quota/capacity failure stops the run. Durable queuing is a later stage; GitHub workflow concurrency alone does not provide it.

## Technical gates

- All 84 preserved source/library files must match `build-lock.json` before and after compilation. CLI 1.5.1, ESP32 core 2.0.17, full board options, and drawing libraries stay pinned.
- A complete model response must match its saved SHA-256. One conventional code fence can be removed; the function is not repaired or rewritten.
- Exactly one `void restState(unsigned long now)` is allowed. Checks reject known hardware/global-state access, unsupported calls, directives, dynamic allocation, and unconditional loops. Display access is limited to supported drawing methods. Per-pixel brightness remains in RGB drawing values.
- Composition changes only that function in an isolated sketch. Protected bytes must match the pinned foundation, including wiring, hardware brightness, buffers, frame interval, and timer setup.
- Compilation must pass and the application must fit the 1,310,720-byte configured slot. A failed check removes this candidate's old bundle and cannot produce a successful download. Baseline artifacts remain separate.

The parser derives from the existing local helper. These checks do not formally prove arbitrary C++ behavior, runtime timing, or heap use. Actual flash capacity, networked runtime, installation, and recovery remain hardware checks before OTA is enabled.

## Run after publication

1. Recheck that the repository is public, the Google project remains Free tier with billing disabled, and the model allowance is available.
2. Open **Actions → Lightboard prompt build → Run workflow** and enter a non-sensitive creative prompt. This explicit build form needs no `%%%` suffix; that convention still applies to the planned email intake and existing chat deployment workflow.
3. **Save firmware** defaults off. Enable it only after checking free Actions storage and the existing $0 spending stop. The job uses standard Ubuntu 24.04, skips private repositories, and creates no cache.
4. Wait for **Compile against the pinned foundation** to pass. No preview or creative-approval step is present.
5. If enabled, download `lightboard-candidate-<run>-<attempt>` and verify `SHA256SUMS`. Retention is one day.

The repository/workflow is public. Saved downloads include source and the submitted prompt in `generation.json`. Keep credentials out of prompts and firmware. [GitHub's input-handling guidance](https://docs.github.com/en/actions/concepts/security/script-injections) and [Actions billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions) explain safe prompt handling and the distinction between free public runners and storage billing.

## Bundle

Output is `.build/candidate-artifact/`, separate from the baseline's `.build/artifact/`. It contains three firmware binaries, the composed `.ino`, `restState.cpp`, actual compile log, build report, manifest, and checksums. API-generated builds also retain the exact submitted brief, prompt, response, usage metadata, and provenance in `generation.json`.

The manifest gives a source-derived version and application filename, size, and SHA-256. It records `published: false` and `ota_enabled: false`; no device URL is configured yet. Board-accessible publication is Step 6. Compilation or download does not establish installation.

## Local check without a model request

```bash
python3 cloud/build.py \
  --cli '/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli' \
  --data-dir /Users/pmartin5/Library/Arduino15 \
  --candidate experiments/model-verification/2026-11-06/overflowing-heart/candidate.cpp
```

This reads the installed toolchain and preserved libraries and writes isolated outputs. Its report records no new model API call. API-generated builds also pass `--generation-record` to bind the function to the response.

## Current checkpoint

The integrated pipeline passed a local compile using the archived heart function: 292,064-byte application, no new API call or device operation. Unit tests cover editing boundaries, response binding, failure isolation, slot limits, and bundle checksums. The first integrated cloud run is pending publication through the user's existing SSH route. The GitHub connection rejected Git-tree writes with HTTP 403; the assistant shell cannot reach GitHub.

Next come cloud verification, board-accessible publication, separately provisioned Wi-Fi/OTA support, and email intake with a durable queue. Creative tuning can happen later.
