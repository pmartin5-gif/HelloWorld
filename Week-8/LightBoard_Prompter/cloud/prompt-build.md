# Manual prompt-to-OTA pipeline

**Updated November 26, 2026.** Routine prompt build and the saved-response publication test now use the physically proven sealed OTA foundation. Local integration passed; the revised workflows have not yet run on GitHub. New Wi-Fi setup is pending and does not block compilation or public package verification.

## Behavior

**Lightboard prompt build** accepts a 1–2,000-character creative prompt. **Reuse saved generation** defaults on: leave the default heart prompt to reuse the exact response from run `42735010470`, with no API request. A different prompt or brief stops reuse. A new generation requires explicitly disabling reuse; it is outside the current zero-model-call integration test.

The workflow uses `cloud/prompt_build.py` to compile both the recovery baseline and the recorded function against foundation `f1244292bbdf180ad5ea8b4ffbf46c72b9772ef8ad2407276ae26e3786132522`. It prepares schema-2 OTA metadata through the same publisher as the controlled known-scene tests. **Publish** defaults off. There are no Actions artifacts, caches, schedules, serial commands or automatic device updates.

The saved-response **Lightboard publication test** workflow calls the same builder/publisher. The original non-OTA `cloud/build.py` and `cloud/publish.py` remain for historical baseline tests and legacy metadata checks. They are no longer the routine prompt/publication entry points. The Desktop USB helper still uses the old foundation: do not deploy it onto the OTA board; migrating that helper remains separate work.

## Validation and publication

- Exact prompt/brief, complete response SHA-256, supported `restState` function and generation origin are checked before compilation. Saved reuse and a request in the current Actions run have distinct provenance.
- All 84 preserved source/library files, pinned CLI 1.5.1/core 2.0.17, full board profile, and sealed runtime/partitions/protected sketch remain checked before and after builds. Generated scenes replace only `restState`.
- The builder writes a new isolated work directory and preserves existing work. Failed compilation, oversize images, or changed staged inputs cannot create an eligible package. Source/identity/checksums are revalidated before package preparation; expected foundation/version strings must also exist in the actual application bytes.
- Only `firmware.bin`, `recovery.bin`, `manifest.json` and `SHA256SUMS` enter the publication package. The exact generation record stays in the internal build evidence, outside the release assets. It is never added to the feed.
- Optional publication requires the matching main-branch Actions commit/run/attempt, server asset digests, anonymous exact-byte readbacks and a feed update guarded by the previous blob SHA. Compatible previous images and immutable recovery/history are retained; unknown foundation transitions stop. Existing releases/assets are never overwritten or deleted.
- Historical generated manifests retain compact provenance and immutable image/source hashes; their prompts/source need not remain in the checkout. Exact source composition is validated when preparing their bundle, rather than inferred from a historical manifest.

Publication is separate from installation. The board still requires manual `check`, `arm-update`, and `install`; only fresh running-version/boot-health evidence establishes installation. Credentials stay in board NVS, outside the firmware package. Changing Wi-Fi requires private provisioning through native Arduino IDE, not a new firmware build.

## Local saved-response check

Use a new work directory each time. Prepare `PROMPT_FILE` containing the exact saved prompt, `An overflowing heart that keeps giving`, then run from this project:

```bash
python3 cloud/prompt_build.py \
  --work .build/NEW-PROMPT-CHECK \
  --generation-record experiments/flash-lite/2026-11-09/cloud-run-42735010470/generation.json \
  --prompt-file PROMPT_FILE --run-id 123 --attempt 1
```

This uses the installed pinned toolchain and never calls the model, publishes, opens serial or uploads. Its hypothetical run-123 URLs are not live releases. Evidence is under the new work directory: `baseline/artifact/`, `candidate/artifact/`, and the four-file `package/`. The recovery binary is an application only; preserve the existing IDE recovery source, bootloader and partitions.

## Current verification and next cloud check

November 26 local routine-path build: heart **1,012,080 bytes**, headroom **298,640 bytes**, SHA `2dec6e1a896f2a1bd6cd4cab5cb46397c74cde90942cfdb7561fbd49369bd3d1`; baseline **1,011,872 bytes**. Source/foundation/version match the tested scenes; binary hashes can vary with build path. All **88 offline tests** pass and both workflow YAML files parse. See `prompt-ota-verification.json` and `.build/prompt-ota-integration-2026-11-26/`. No publication, device operation or new model call occurred. The saved heart's existing growth clipping remains unchanged.

After reviewing/pushing the scoped changes, verify the public standard runner/free-use settings and existing $0 spending stop. Run **Lightboard prompt build** on **main**, with the default prompt, **Reuse saved generation on**, **Publish off**. Inspect the exact commit, foundation, version, size/hash and `model_request_in_this_run: false`. A local compile is not a cloud-run result. Keep publication and installation separate until that check passes. The new network can be configured later; actual association and physical checks remain pending.

Earlier non-OTA runs and their evidence remain in `prompt-build-reuse-verification.json`, `publication-verification.json` and `documentation.md`; they do not verify the revised workflow.
