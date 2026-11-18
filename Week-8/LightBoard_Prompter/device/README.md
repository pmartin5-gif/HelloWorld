# Wi-Fi/OTA development foundation

**Hardware checkpoint, November 18:** The v2 pilot compiled and flashed, but repeatedly asserted at startup (`xQueueSemaphoreTake` with scheduler suspended). The original firmware was recovered through Arduino IDE with verified flash/reset output. Physical confirmation that the original animation looks normal is pending. Do not upload v2 or provision credentials. The revised v3 below is compiled and tested offline but has not been installed.

This is the separate Step 7 pilot. It preserves the current moonstone/ruby `restState` exactly. The original Desktop sketch and the published Step 6 delivery-test feed remain preserved. Automatic update checking/installing is disabled; there is no listening HTTP, OTA, or credential server.

## Prepare and compile

From `Week-8/LightBoard_Prompter`:

```bash
python3 cloud/ota_build.py --work .build/ota-pilot-2026-11-18-v3
```

The command was already run successfully for this directory. Preserve its existing artifact; choose a new work directory for a changed revision. It reads the installed CLI 1.5.1 / ESP32 2.0.17, the 84 locked build inputs, and the sealed runtime files in `foundation-lock.json`. It makes no network request, installs no package, and never invokes an upload or serial command. `--prepare-only` stages the sketch without compiling. An optional `--candidate` accepts only a validated `restState`, preserving the entire new networking foundation.

The generated IDE sketch is `.build/ota-pilot-2026-11-18-v3/LightboardOTA/LightboardOTA.ino`. Runtime source is reviewed under `device/runtime/`; the exact changes to the original sketch are enumerated in `cloud/ota_build.py:source_for`. GPIOs, brightness 255, double buffering, 1,000 µs refresh alarm, `display.display(10)`, and 33 ms animation scheduling parameters are retained. Network work runs in a separate task on core 0. The timer now only signals a dedicated refresh task on core 1; SPI transfer and buffer swaps use a task-context mutex. This changes the refresh mechanism while retaining its 1,000 µs alarm and display parameters. Actual timing/brightness must be verified physically. The frame loop also reports completed frames through a short critical section. The initial pilot kept blocking SPI work inside the interrupt, which the new regression test forbids.

The application is **1,007,728 bytes**, leaving **302,992 bytes** in the configured 1,310,720-byte slot. Reported static DRAM is **47,336 bytes**; this does not measure live Wi-Fi/TLS heap or the dynamically allocated 24 KiB network and 4 KiB refresh task stacks. Runtime limits must be verified on the board. All 58 offline tests pass, including a native C++ harness using the exact production URL/size/foundation policy. The compiled pilot ELF contains the deferred-confirmation override and IDF certificate-bundle verifier.

## Initial USB installation and recovery

Use Arduino IDE with **ESP32 Dev Module**, the rediscovered adapter, the existing full build profile, 4 MB/default partitions, and core 2.0.17. Do not accept core/library upgrades. Open the generated development sketch, verify the selected board/port and source, and click Upload once. Do not use direct serial commands or a Terminal UI workaround.

Wait for the user's baseline recovery confirmation before the next pilot attempt. Record fresh flash verification/reset output and archive the IDE-built image before declaring installation successful. A local CLI compile is preparation evidence, not evidence of flashing. The IDE can produce different binary hashes from its own build path; match its generated source/version to this revision and record its own image size/hash.

The original `/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino` remains the USB recovery source, hash `d90e1b58d47ad841c7ef6c737afac802da1e34e0a4810e43ca7ae7e05173bb46`. Existing baseline binaries/bootloader/partitions and historical helper archives remain preserved. Recover through the IDE using that sketch and the same board profile, then verify fresh reset output and physical behavior. No whole-flash erase or eFuse changes are required. The first USB installation does not establish a second bootable OTA slot; automatic rollback must be tested after controlled OTA delivery creates a valid previous application.

The Desktop animation helper tracks the old source foundation. After the pilot is installed, do not use its routine `deploy`, `restore`, or `%%%` path until the new foundation is deliberately adopted into that helper/cloud pipeline. Such an old build would remove Wi-Fi/OTA support. The separate device verification record must distinguish running firmware from the unchanged Desktop source checkpoint.

## Private Wi-Fi provisioning

Use Arduino IDE Serial Monitor at **115200 baud** with **Newline** selected. The user enters credentials locally; do not paste them into chat, source, prompts, shell history, screenshots, logs, or published firmware. The firmware never echoes its provisioning input.

1. Send `provision`.
2. At `LB_ENTER_WIFI_NAME`, send the Wi-Fi network name as its own line.
3. At `LB_ENTER_WIFI_PASSWORD`, send the network password as its own line. Complete both within 60 seconds. `cancel-provision` abandons the operation.
4. Clear the monitor's input field and any input history/output containing credentials before returning control to the assistant. Send `status` for redacted diagnostics.

Credentials are stored as one versioned blob in the board's `lightboard` NVS namespace. Nothing is compiled into the image or sent to GitHub. This pilot uses existing unencrypted NVS: physical flash access can expose stored credentials. No flash-encryption or eFuse policy is changed. `forget-wifi` removes this namespace's Wi-Fi blob; it does not erase other settings. Supported setup is a 2.4 GHz network using a WPA/WPA2 shared password (8–63 characters or a 64-digit hex key). Enterprise username/certificate login, captive portals, and passwordless networks are not implemented; use an appropriate private test network if needed. A phone hotspot must be set to a compatible band.

`offline` disconnects Wi-Fi while retaining credentials. `reconnect` resumes association attempts, at most once per minute. The animation must continue with internet access unavailable. `status` reports version/foundation, detected flash size, actual running/target partitions, Wi-Fi status, free/minimum/largest heap, worker-stack headroom, frame count and maximum frame gap. It does not report the SSID or password.

## HTTPS and controlled updates

`check` fetches the fixed public manifest through ESP-IDF's certificate bundle with hostname and certificate verification, a synchronized clock, bounded responses/timeouts, and an allowlist for HTTPS redirect hosts. An unset clock or TLS failure stops the operation; there is no insecure fallback. Firmware SHA-256 must match before the boot partition is switched. HTTPS authenticates the GitHub endpoint/account; this pilot does not implement independent signed manifests, Secure Boot, or eFuse anti-rollback.

The existing schema-1 `delivery-test` feed is intentionally **rejected for installation**. A successful `check` against it should report `LB_FEED_REACHABLE: ... OTA explicitly disabled`, establishing feed access only. Do not change that feed's flag to make an old non-OTA image eligible.

Future pilot publications need schema 2, `channel: ota-pilot`, `published: true`, device `esp32-32x32`, an exact foundation ID, `ota_enabled: true`, a bounded image size, and an exact `lightboard-ota-.../firmware.bin` release URL in this repository. A prepared local manifest has `published: false` and a hypothetical local URL. Neither the existing publisher nor existing cloud builds publish this new foundation yet. Adapting those paths and delivering two controlled known scenes remains required before automatic model-generated delivery.

After a valid `check`, local USB command `arm-update` opens a 60-second authorization window; a separate `install` rechecks the feed and requires the same version/URL/size/hash before downloading. Changed feeds, wrong foundations, old delivery-test URLs, incomplete downloads, hash mismatches, failed image validation, or insufficient slot space stop installation. The previous boot selection is not intentionally changed on failure. During explicit flash erase/write and NVS writes, the matrix is blanked under the existing display lock so a paused scan cannot hold one row lit. The normal refresh configuration and animation resume afterward; an OTA update may therefore cause a visible maintenance blank.

Arduino 2.0.17 normally confirms an OTA image before `setup`. The pilot overrides `verifyRollbackLater()` and confirms a pending image only after a 30-second frame/memory/layout check: at least 600 frames, maximum frame gap ≤150 ms, free heap ≥40 KB, network worker stack ≥1 KB, refresh stack ≥512 bytes, at least 10,000 refresh cycles, and expected flash/OTA layout. A pending image that cannot pass within 60 seconds requests rollback once, with USB recovery required if no previous bootable image exists. These thresholds are preliminary test limits, not physical validation or a visual-quality test. Manual `rollback` requests the previous valid slot only if the SDK says one is available. Real power-loss/crash recovery has not been tested.

## Evidence and remaining hardware checks

See `verification.json` for the exact staged version and installation state. Required hardware evidence includes fresh IDE flash/reset success, physical animation confirmation, actual flash/partitions, stable frame timing, runtime heap during association and HTTPS, a disconnected-network test, two known OTA scenes, and recovery to a known working image. Compilation and offline policy tests cannot establish these facts.

References: [ESP-IDF 4.4.7 OTA/rollback](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/system/ota.html), [HTTPS client and bounded streams](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/protocols/esp_http_client.html), [NVS storage/security](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/storage/nvs_flash.html), and installed Arduino 2.0.17 `cores/esp32/esp32-hal-misc.c` (early confirmation and weak override hooks).
