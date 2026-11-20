# Controlled OTA publication

The v5 foundation passed physical Wi-Fi, certificate-verified feed access, offline animation continuity and manual reconnect checks. This workflow prepares two known scenes without another model request. Actual OTA installation and rollback are separate hardware checks.

Use **Lightboard OTA test**, on **main**. Its choices are `saved-heart` (the preserved response from generation run 42735010470) and `baseline` (the original scene with the same networking foundation). Select **saved-heart first**; baseline has the same source-derived version as the USB-installed pilot and will be treated as already current.

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

The `recovery.bin` release asset is the sealed baseline **application only**; it is not a full bare-flash image and its URL is not accepted by the OTA updater. The preserved v5 IDE sketch supplies the controlled USB recovery path with matching bootloader/partitions. Do not use the Desktop animation helper or the old cloud candidate builder to overwrite the running pilot; those still use the old foundation. Adopt the proven foundation into routine delivery before enabling email/model automation.

Trust remains GitHub HTTPS/account access plus expected image SHA-256. Independent firmware signing, Secure Boot and eFuse anti-rollback are not implemented. No boot-health/rollback claim is established until the physical sequence succeeds.

## Local preparation evidence

The local publication package is under `.build/ota-publication-local-2026-11-19/package/`, with `published: false` and a hypothetical run-123 URL; it must not be treated as a live release. The preserved-scene build is 1,010,240 bytes; the saved-heart build is 1,010,480 bytes, with 300,240 bytes of configured slot headroom. Both retain foundation `737b7d0e5f8d6a21c65c5f9e3aee6a126f46e732b79a61aff2b0713e47419309`. Real CI binaries may differ by build path; publication verifies its own exact images. See `ota-publication-verification.json` for tested versus pending states.
