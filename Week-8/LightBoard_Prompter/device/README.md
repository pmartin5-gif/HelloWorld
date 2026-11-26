# Wi-Fi/OTA pilot foundation

**Verified November 23,2026:** Two known scenes installed over Wi-Fi, deferred boot validation passed for each, SDK manual rollback returned the prior image, and baseline reinstallation restored normal stones. Automatic checking/installing remains disabled. Regular prompt/publication integration passed locally November 26; revised cloud execution remains pending. Email delivery is later work. Current handoff: [RESUME.md](../RESUME.md).

## Running firmware and evidence

Baseline version `ota-pilot-f2e92e43697828ea9cf37401`, foundation `f1244292bbdf180ad5ea8b4ffbf46c72b9772ef8ad2407276ae26e3786132522`, app0 at 0x10000, SDK state 2 VALID. Actual application 1,011,840 bytes, SHA `205081b86ce24673b1222e104f7dc156213bb920e2775ad01f5717ea48225807`; slots 1,310,720 bytes, headroom298,880. Actual flash4MiB/layout verified. Final boot health: free/min heap 219,344/216,280, worker/refresh stack 22,848/3,452, max gap 77ms, Wi-Fi connected/RSSI-69. User confirms restored stones normal. These are final boot readings; earlier full TLS download probe measured min heap144,360 and max gap 68ms.

Heart run 45312083895/source 051a334 installed app1 version 709f1f9c… (1,012,016bytes). Baseline run 45313009678/same source installed app0. Both observed PENDING_VERIFY→VALID after deferred health. Manual rollback rebooted the prior heart/app1/VALID, retained credentials/Wi-Fi, passed health; user confirmed return. Fresh check/arm/install then restored baseline/app0/VALID and user-confirmed stones. Actual run logs/manifests/release/build reports and pending/valid/rollback/restoration hardware statuses are in `.build/ota-cloud-run-45312083895/` and `.build/ota-cloud-run-45313009678/`. Machine-readable results: [verification.json](verification.json).

The unchanged saved heart grows to row 33 at maximum pulse while panel rows end31; its clipping is a recorded source issue. Runtime/transport passed; normal heart fit is not claimed. Manual rollback was tested. Automatic crash/power-loss recovery was not tested.

## Preserved source and builds

Generated scenes may replace only `restState`. Sealed hooks retain RGB 13/27/26, LAT 22, OE 16, A 19/B 23/C 18/D 5, brightness 255, double buffering, timer 1,000 microseconds, display.display(10) and33ms frame scheduling. Timer ISR only notifies a core1 refresh task; SPI/scan/buffer swaps share a task mutex. Networking runs on core0 with24KiB stack; refresh has 4KiB. Earlier ISR SPI pilot asserted and was recovered; its failed folders remain marked DO_NOT_UPLOAD.

Builder verifies 84 baseline/library files plus sealed runtime/protected sketch/partitions/profile and derives foundation/version. Pins: CLI 1.5.1, ESP32 2.0.17, PxMatrix1.8.2, GFX1.13.0, BusIO1.17.4. All 79 offline tests passed. `python3 cloud/ota_build.py --work .build/NEW-DIRECTORY` prepares/compiles without model call, serial command or upload; `--candidate` accepts only validated function. Existing work is never overwritten. Release assets are restricted separately to four files. Actual IDE images and CLI images are recorded independently; paths can affect binary hashes.

## USB recovery

Preserved visible recovery sketch: `/Users/pmartin5/Documents/Arduino/LightboardOTA_https_large_20261123/LightboardOTA/LightboardOTA.ino`. It has the exact current transport foundation with the cobalt-vessel scene/version 20db9105…; a recovery upload returns the vessel, not baseline stones. Its actual verified IDE app1,011,248bytes/SHA373a5b903fab619b588ee49dfe1bbf6b3780953fb76e6db5be4695477ff7375b, source/options/binaries/ELF/map/output are under `.build/ota-https-large-header-2026-11-23/hardware-evidence/`. Prepared baseline source is separately at `.build/ota-header-fix-2026-11-23/baseline/LightboardOTA/`. Release recovery.bin is application-only, not a bare-flash image or accepted OTA URL.

Use native Arduino IDE Upload only when recovery is needed. Rediscover USB (last `/dev/cu.usbserial-0001`), verify source/ESP32 Dev Module, pinned2.0.17 and original full profile: Upload921600, CPU240MHz, flash80MHz/QIO/4MB, default partitions, debugNone, PSRAMoff, loop/events core1, eraseAlloff, JTAGoff. No package upgrades or CLI serial/Terminal UI workaround. If stale ZigbeeMode is actually observed, reload board data, wait and reselect board; inspect actual compiled options. Record flash byte count/hash/reset and fresh boot health. IDE editor scene can differ from installed OTA scene; do not click Upload merely to resume.

The revised routine prompt/publication workflows now use the sealed foundation and pass locally with saved-response reuse; cloud verification is pending. The Desktop helper and historical cloud builder still use non-OTA source. Do not deploy them over this firmware. USB recovery evidence and actual manual OTA rollback are preserved; arbitrary fault/power-cut recovery is not inferred.

## Credentials and connection controls

**November 26 network change:** The user plans to use a different Wi-Fi network, which is not configured yet. New network name, band/security and credentials are unknown. No provisioning/forget/reconnect command has been sent. Keep the existing credentials until the replacement is ready; use the private native IDE provisioning procedure below then verify fresh association/health. The software build and public feed checks can proceed independently. Historical Hello World results below remain the last observed state.

Saved Hello World2.4GHz credentials already exist in board NVS and survived installs/rollback. Hello World5GHz is separate. No repeated provisioning is needed; Mac may use another network. Credentials are never compiled/published/echoed, but NVS is unencrypted and accessible to physical flash reads. No eFuse/flash-encryption policy changed.

If a network change is required, user privately operates Arduino Serial Monitor115200/New Line: provision, exact SSID at name prompt, password at next prompt within60seconds, then clears credential-bearing input/history before agent observes again. cancel-provision abandons. forget-wifi removes the blob. Supported setup is2.4GHz shared WPA/WPA2 password, not enterprise/captive-portal/passwordless provisioning.

status reports redacted version/foundation/slots/flash/layout/Wi-Fi/RSSI/heap/stack/frame/refresh/health; AX may truncate long lines after512characters, so record only seen fields. wifi-diagnose optionally takes TAB plus expected SSID and reports equality/counts/matching-channel/auth/RSSI without names/password/BSSIDs/neighbors. It skips scan if already connected. offline retains credentials and stops retries; reconnect requests association; ordinary retries at most once/minute. Physical offline frame continuity, reconnect and verified feed fetch passed earlier.

## Verified HTTPS and controlled updates

Use [controlled publication guide](../cloud/ota-publication.md). TLS requires IDF certificate bundle, hostname check and valid clock; redirects/hosts/size/read time are bounded. RX 4096 fixed the observed split/truncated GitHub redirect (1024 captured758bytes/HTTP 618;4096 captured907/HTTP 200 and complete matching app SHA). Future arbitrary header fragmentation may still fail safely. Diagnostics print status/length/error codes, never signed URL, token or response body.

probe-firmware followed by literal TAB and an allowlisted repository firmware.bin URL performs a bounded read-only download and reports count/completion/magic/SHA. Paste the TAB in IDE; typeText can change focus. It has no flash/boot calls; compare its SHA to independently verified manifest.

Installation requires schema2, repository/channel/device and exact foundation, publishedtrue/OTAtrue, bounded image and exact repository release firmware URL. check validates candidate; arm-update opens60seconds; separate install rechecks unchanged candidate, then validates exact size/SHA/ESP image before boot selection. FlashGuard blanks matrix during NVS/OTA writes. No network server, automatic feed polling or automatic install.

Arduino early auto-confirm is overridden. Pending image is validated after30seconds with>=600frames, max gap<=150ms, free heap>=40KiB, worker stack>=1KiB, refresh stack>=512bytes, >=10,000refresh cycles and valid layout. Pending images failing by60seconds request rollback once. rollback is gated by SDK prior-valid-slot availability; actual local rollback succeeded. Trust is GitHub HTTPS/account plus expected SHA, without independent signing/SecureBoot/eFuse antirollback. General automatic fault recovery remains untested.
