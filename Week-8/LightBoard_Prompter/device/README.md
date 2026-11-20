# Wi-Fi/OTA pilot foundation

The v5 pilot is installed and user-confirmed to animate normally. Physical checks passed for the actual 4 MB/two-slot layout, boot health, Wi-Fi, certificate-verified HTTPS feed retrieval, offline frame/refresh continuity and manual reconnect. After moving to stronger reception, the final signal was -64 dBm; final free/min heap was 218,184/143,512 bytes and maximum observed frame gap was 55 ms. These are observed pilot results, not guarantees for every scene/network.

Running version: `ota-pilot-b381c408b6db4e91ba307920`. Foundation: `737b7d0e5f8d6a21c65c5f9e3aee6a126f46e732b79a61aff2b0713e47419309`. Controlled OTA installation of two known scenes and rollback/recovery are still required. Follow [the OTA publication guide](../cloud/ota-publication.md). Automatic checking/installing remains disabled; there is no network-listening configuration or update server.

## Preserved display and isolated builds

The original Desktop recovery source remains unchanged. Generated scenes can only replace `restState`. GPIOs (RGB 13/27/26, LAT 22, OE 16, A 19/B 23/C 18/D 5), brightness 255, double buffering, 1,000 microsecond timer alarm, `display.display(10)` and 33 ms frame scheduling parameters are retained. A timer ISR only notifies a core-1 refresh task; SPI transfers and buffer swaps share a task-context mutex. The earlier v2 pilot kept blocking SPI in the ISR and asserted at startup; v5 uses the physically tested task approach. Failed v2 folders are marked `DO_NOT_UPLOAD.txt`.

The builder verifies all 84 pinned baseline/library inputs plus the sealed runtime and build profile. It uses CLI 1.5.1, ESP32 2.0.17, PxMatrix 1.8.2, GFX 1.13.0 and BusIO 1.17.4. No package upgrades or direct serial uploads are permitted. The baseline v5 app is 1,010,240 bytes, leaving 300,480 bytes in a 1,310,720-byte slot; reported static DRAM is 47,352 bytes and excludes dynamic task/network memory. The saved-heart build is 1,010,480 bytes. Do not equate compile results with physical installation.

A new isolated preparation can be made with `python3 cloud/ota_build.py --work .build/NEW-DIRECTORY`. Preserve existing work/artifacts; the builder refuses to overwrite them. The optional `--candidate` accepts only a validated replacement function. It never invokes an API model, device command or upload. New artifacts retain exact public source inputs and checksums for publication validation, but release assets are limited separately.

## USB recovery

The installed v5 source is staged at `/Users/pmartin5/Documents/Arduino/LightboardOTA_pilot_v5/LightboardOTA/LightboardOTA.ino`, byte-matching the sealed source. Its actual IDE images, ELF/map/options/preprocessed source and observed flash/reset output are under `.build/ota-pilot-2026-11-19-v5/hardware-evidence/`. The old unchanged Desktop sketch and earlier verified recovery evidence remain preserved separately. Prefer the v5 sketch when retaining networking support.

For a required recovery, use Arduino IDE native Upload with the rediscovered USB adapter, **ESP32 Dev Module**, the original full profile and **2.0.17**. Never use a direct serial CLI or Terminal UI workaround. Verify current source/board/port before one upload, then record fresh byte count/hash/reset and the actual IDE-built image. Do not accept board/library upgrades. IDE can retain stale 3.x metadata (`ZigbeeMode`) even though 2.0.17 is installed: reload board data, wait for correct metadata and explicitly reselect the board if needed; verify the resulting cached build options. A compile rejection before flash leaves the running firmware unchanged.

The Desktop animation helper still tracks the old foundation. Do not use its deploy/restore/`%%%` path or the old cloud builder to overwrite retained v5. Adopt the proven foundation into routine generation/delivery before using those paths again. The first USB installation alone does not establish a valid previous OTA slot.

## Private provisioning

Use Arduino IDE Serial Monitor at **115200 baud / New Line**. The user enters credentials locally while agent observation is stopped:

1. Send `provision`.
2. At `LB_ENTER_WIFI_NAME`, send the exact network name as one line, without quotes.
3. At `LB_ENTER_WIFI_PASSWORD`, send its password as one line. Complete both within 60 seconds. `cancel-provision` abandons the operation.
4. Clear the input field and any credential-bearing input/history before returning control to the assistant.

Firmware never echoes provisioning input. Credentials are stored as one versioned blob in the board's `lightboard` NVS namespace; no password is compiled, published or sent to GitHub. Existing NVS is unencrypted, so physical flash access can expose credentials. No flash-encryption/eFuse policy is changed. `forget-wifi` removes only that Wi-Fi blob. Supported setup is 2.4 GHz with a shared WPA/WPA2 password (8–63 characters or a 64-digit hex key). Enterprise credentials, captive-portal login and passwordless provisioning are not implemented. The Mac can remain on another network: provisioning uses USB and the board makes its own HTTPS connections.

Credentials already exist on this pilot. Do not repeat provisioning unless switching networks or correcting an established credential problem.

## Read-only diagnostics and connection controls

`status` reports version/foundation, detected flash/layout/running and target partitions, Wi-Fi state/RSSI, free/minimum/largest heap, worker/refresh stack headroom, frame/refresh counts and maximum frame gap. It omits the network name/password. Arduino accessibility output may truncate each long status line after 512 characters; record only fields actually observed.

`wifi-diagnose` optionally accepts a literal TAB followed by an expected network name. It reports only whether the saved name matches, total scanned 2.4 GHz AP count, configured/expected match counts, up to four matching AP channel/RSSI/auth-mode rows and the prior numeric disconnect reason. It never prints names, passwords, BSSIDs or unrelated AP details. It does not scan/disconnect an already connected interface. When disconnected, it stops unfinished association, scans and frees results, then defers ordinary retry for 60 seconds. The full-scan branch has native simulated-result tests; the physical expected-name comparison passed, and the scan was correctly skipped while connected.

`offline` disconnects while retaining credentials and disables ordinary retries. `reconnect` requests an immediate manual association attempt; normal automatic association retries are at most once per minute. The animation must continue without internet. The physical pilot passed an offline counter/health check, then reconnected and fetched the verified feed again.

## HTTPS, installation and health limits

`check` uses the ESP-IDF certificate bundle, hostname checking, a valid clock, bounded reads/timeouts and allowed HTTPS redirect hosts. There is no insecure fallback. The existing schema-1 delivery-test feed is reachable and correctly rejected for installation, reporting `LB_FEED_REACHABLE: ... OTA explicitly disabled`.

Compatible publications require schema 2, repository/channel/device and exact foundation identifiers, `published: true`, `ota_enabled: true`, bounded image size and the repository's `lightboard-ota-.../firmware.bin` URL. `arm-update` opens a 60-second local window after a valid check; a separate `install` rechecks an unchanged candidate and validates image size/SHA-256/ESP image before selecting the boot partition. Network-generated scenes cannot alter this foundation. During NVS/OTA flash writes the display is blanked under its existing lock rather than holding a lit row.

The pilot overrides Arduino 2.0.17's early OTA confirmation. A pending image is confirmed after a 30-second window with at least 600 frames, max gap ≤150 ms, free heap ≥40 KB, network stack headroom ≥1 KB, refresh stack ≥512 bytes, at least 10,000 refresh cycles and expected flash/partition layout. Pending images that cannot pass within 60 seconds request rollback once; USB recovery may be needed if no prior valid slot exists. `rollback` only requests a previous image if the SDK says one is available. These mechanisms still need physical OTA/rollback testing.

Trust is GitHub HTTPS/account access plus expected image SHA-256. Independent signing, Secure Boot and eFuse anti-rollback are not implemented. See [ESP-IDF OTA](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/system/ota.html), [HTTPS client](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/protocols/esp_http_client.html) and [NVS](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/storage/nvs_flash.html).

Chronological failures, recovery, provisioning and diagnostics are retained in `../documentation.md`, local `verification.json` and hardware-evidence. Current handoff: `../RESUME.md`.
