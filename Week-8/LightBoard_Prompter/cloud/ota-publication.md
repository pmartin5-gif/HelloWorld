# Controlled OTA publication

**Hardware sequence verified November 23:** Corrected heart run 45312083895 and baseline run 45313009678/source 051a334 published successfully, including 29 OTA tests each, pinned builds, release server digests, anonymous asset/feed rereads. Actual heart/app1 and baseline/app0 installs passed deferred validation; SDK manual rollback returned heart, then baseline reinstallation restored user-confirmed normal stones. Final live current is baseline f2e92e43…/1,011,840bytes/SHA205081b8…, previous compatible heart 709f1f9c…; foundation f1244292bbdf180ad5ea8b4ffbf46c72b9772ef8ad2407276ae26e3786132522. Feed4,620bytes.79 offline tests passed. Manual recovery is verified; general automatic crash/power-loss recovery is untested. Automatic updates remain off. No repeated run/upload/provisioning is needed merely to resume.

The4096-byte HTTP receive buffer fixed the observed truncated release redirect; actual full download/SHA and physical installs now pass. Earlier1024-byte diagnostic/fresh-query experiments are history, not upload targets. Current run/evidence links are in ../RESUME.md.

Publisher migration is pinned to the exact reviewed old manifest (SHA 67a5d7db82b007d8afa9466740cac3c6a3bea24790d3ea63a739aaf37911b0e6) and exact f124 destination. Before mutation it anonymously rereads that immutable manifest and its firmware/recovery. It preserves the old schema1 legacy snapshot, references the immutable old OTA manifest under superseded_ota with compatible_for_ota false, and leaves previous null. Subsequent same-foundation publications retain the compatible previous image and reference. Any edited/unknown history or other transition requires explicit review. No assets are overwritten/deleted. The full old manifest is also preserved under ota-foundation-history/.

The sealed foundation also passed physical Wi-Fi, verified feed retrieval, offline animation continuity and manual reconnect. This workflow uses only two preserved scenes and no model request. The regular prompt/publication integration passes locally and in saved-response cloud run45858227133 through the same foundation; new routine publication and physical confirmation remain pending. See [prompt-build.md](prompt-build.md). Email delivery remains later work.

Use **Lightboard OTA test**, on **main**. Its choices are `saved-heart` (the preserved response from generation run 42735010470) and `baseline` (the original scene with the same networking foundation). The first-heart/second-baseline sequence below has already passed on this board. Do not reinstall an already-current version; the firmware refuses it. Heart source clipping is documented and unchanged.

The public runner uses pinned CLI 1.5.1, ESP32 2.0.17 and the locked libraries. It validates the sealed runtime and exact known-scene source, retains source inputs/checksums for local validation on the runner, and releases only `firmware.bin`, `recovery.bin`, `manifest.json` and `SHA256SUMS`. No source, prompts, API credentials, private Wi-Fi credentials or compiler logs become release assets. Wi-Fi credentials remain in device NVS.

## Prepare versus publish

The **Publish** checkbox defaults off. With it off, the workflow builds and validates an unpublished package, then discards its runner files. No Actions artifact/cache is stored. With it on, the workflow uses its temporary Actions token to create a unique `lightboard-ota-RUN-ATTEMPT` prerelease, verify server digests and anonymous byte-for-byte downloads, then advance the existing `lightboard-feed/manifest.json` with an expected blob SHA. Main must still match the checked-out commit. Upload/readback failures leave the feed unchanged; feed conflicts do not delete prior releases. Inspect partial releases before retrying—existing tags/assets are never overwritten.

The first OTA publication preserves the entire old schema-1 delivery-test manifest under `legacy_delivery_test`, and leaves all old release assets intact. Its initial OTA `previous` is null: the old non-OTA binaries are not eligible recovery candidates for the updater. Later compatible publications retain the previous OTA `current`. Manifest size and nesting stay within the device's bounds. The old Step 6 publisher rejects a schema-2 feed instead of downgrading it.

Schema 2 records `published: true`, `ota_enabled: true`, channel `ota-pilot`, exact device/foundation IDs, the compiled version/size/SHA-256 and a repository `lightboard-ota-.../firmware.bin` URL. `automatic_updates` remains false. Publication does not send a device command or install firmware.

Keep zero additional spending. Before dispatch, verify the public standard runner/free-use settings and existing $0 spending stop. Do not add billing, paid hosting, artifacts, caches, model calls or paid fallback.

## Physical sequence

1. Publish **saved-heart** and inspect the successful run's exact commit, foundation, version, size, release/feed verification and zero-model-request provenance. Compare the foundation to the running v5 status. Keep the USB recovery sketch available.
2. In Arduino IDE Serial Monitor (115200/New Line), send `check`. It must report the intended compatible update. Send `arm-update`, then `install` within 60 seconds. The firmware rechecks an unchanged candidate before download, validates size/hash/image, and only then selects the boot partition. Flash writes may briefly blank the panel.
3. Record fresh boot/version/partition/status, wait for the deferred boot health confirmation, and confirm physical behavior. A publication or verified download is not an installed-image result. Stop on a startup fault; use the preserved v5 IDE source for USB recovery.
4. Publish **baseline** with the same workflow/foundation. Repeat the controlled check/arm/install sequence, recording the second slot/version and boot health. Both installed scenes must retain networking/update support.
5. Once the SDK reports a valid prior slot, test the local `rollback` command and verify its actual boot/version/health and physical scene. The first USB installation alone does not establish a verified rollback slot. If rollback is unavailable, retain USB recovery and investigate rather than claiming automatic crash recovery.

The `recovery.bin` release asset is the sealed baseline **application only**; it is not a full bare-flash image and its URL is not accepted by the OTA updater. The preserved v5 IDE sketch supplies the controlled USB recovery path with matching bootloader/partitions. The revised routine workflow uses this foundation locally and passed saved-response cloud run45858227133 without publishing or installing. Do not use the Desktop animation helper or the historical cloud candidate builder to overwrite the pilot; those still use the old foundation. Keep email automation off until routine delivery and truthful acknowledgments are verified.

Trust remains GitHub HTTPS/account access plus expected image SHA-256. Independent firmware signing, Secure Boot and eFuse anti-rollback are not implemented. The observed sequence establishes manual rollback for the tested images, not general automatic crash/power-loss recovery.

## Local preparation evidence

The local publication package is under `.build/ota-publication-local-2026-11-19/package/`, with `published: false` and a hypothetical run-123 URL; it must not be treated as a live release. The preserved-scene build is 1,010,240 bytes; the saved-heart build is 1,010,480 bytes, with 300,240 bytes of configured slot headroom. Both retain foundation `737b7d0e5f8d6a21c65c5f9e3aee6a126f46e732b79a61aff2b0713e47419309`. Real CI binaries may differ by build path; publication verifies its own exact images. See `ota-publication-verification.json` for tested versus pending states.
