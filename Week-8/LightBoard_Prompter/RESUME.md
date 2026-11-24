# Resume Lightboard Prompter

**Updated:** November 23, 2026. Controlled OTA hardware checkpoint complete; not paused.

## Current state and next work

**Two known scenes installed over Wi-Fi, deferred boot validation, manual rollback and baseline restoration all passed.** The board is left displaying the normal warm-stone baseline. User's final confirmation: “the stones are back and displaying normally”. No more workflow dispatch, USB upload, provisioning, model request or repeated hardware test is required merely to resume.

**Next engineering task:** Adopt the proven sealed OTA foundation into the regular prompt-build/publication path. That older path and the Desktop helper still build the original non-OTA foundation; known-scene OTA testing is a separate workflow. Reuse the already saved generation record for the first integration test—**zero new model API calls or spending**. Retain exact restState/protected-source/identity/size/hash checks and immutable recovery/history, and keep automatic delivery off. After this integration is verified, proceed to email intake (Step 8), then queue/dispatch and truthful installed acknowledgments. Do not jump to automatic email deployment using the old publisher/helper.

Read `projectPlan.md`, `device/README.md`, `cloud/ota-publication.md` and the machine-readable device/cloud verification files. Chronological work/results are in `documentation.md`, entries84 onward. Notes/evidence have been updated locally after the source push; do not reset unrelated repository work.

## Running firmware and actual results

- **Version:** `ota-pilot-f2e92e43697828ea9cf37401` (baseline stones).
- **Foundation:** `f1244292bbdf180ad5ea8b4ffbf46c72b9772ef8ad2407276ae26e3786132522`.
- **Installed application:** 1,011,840 bytes; SHA `205081b86ce24673b1222e104f7dc156213bb920e2775ad01f5717ea48225807`.
- **Actual slot:** app0 at 65,536, target app1; 4MiB flash, valid layout, slots 1,310,720; SDK OTA state 2 VALID.
- **Final health:** true, `LB_BOOT_HEALTH_PASSED`, RSSI -69dBm, free/min/largest heap219,344/216,280/110,580, worker/refresh stack 22,848/3,452, refresh cycles33,643, frames1,010, max gap 77ms. These are final boot readings, not measurements during the preceding download.
- Wi-Fi **Hello World**, reported/verified2.4GHz; private credentials retained in board NVS. Distinct from Hello World5GHz. No provisioning needed. Mac can use a different network.
- Automatic feed checks/install remain off. Manual rollback is verified; automatic crash/power-cut recovery was **not** tested.

## Cloud and hardware evidence

Remote main/source is verified at **051a334077f4d1db1a5c09cb0115ff6bfccdc802**, “Fix OTA release redirect handling and pin foundation migration”. No further source push needed for the completed tests. Later local notes commits do not change the tested runtime.

1. [Heart run 45312083895](https://github.com/pmartin5-gif/HelloWorld/actions/runs/45312083895), job 138170029679:29 cloud OTA tests, real sealed builds, pinned transition, four release assets, server SHA/size, anonymous asset/feed readbacks all passed. Heart version`ota-pilot-709f1f9cc6fe30951ccdd977`, 1,012,016 bytes, SHA`5a936c6cdace5fd09e62a9986d8f57c1d56cae415535090e70db78c627475fe6`. Actual app1 boot was observed PENDING_VERIFY then deferred VALID/health. User saw heart.
2. [Baseline run 45313009678](https://github.com/pmartin5-gif/HelloWorld/actions/runs/45313009678), job 138173082040:all 29 cloud tests/build/publication/readbacks passed on same source/foundation. Current baseline metadata above; feed4,620bytes, exact previous heart preserved, incompatible old-manifest reference and legacy metadata retained. Actual app0 boot PENDING→VALID/health; user confirmed normal stones.
3. Sent native Serial Monitor `rollback`; SDK prior-slot gate passed and `LB_MANUAL_ROLLBACK_REQUESTED` appeared. Actual prior heart rebooted in app1/VALID, retained Wi-Fi, passed health (max gap 63ms, min heap215,428). User confirmed heart returned. This used existing local slot, no network download.
4. Fresh check/arm/install reinstalled the already published baseline over Wi-Fi. Actual app0 version/VALID/health and final normal stones confirmed. No new cloud run, USB upload or provisioning needed.

Full logs/manifests/release/jobs/reports: `.build/ota-cloud-run-45312083895/` and `.build/ota-cloud-run-45313009678/`. Each hardware-evidence folder retains observed pending/valid statuses and physical confirmations. The second holds rollback/final restoration evidence and archived prior checkpoint/guide versions.

The saved heart's existing geometry clips during growth: maximum reaches row 33, panel ends31 (20 ideal shape pixels outside). It was delivered unchanged; this source issue is documented and **normal heart fit is not claimed**. User previously prioritized infrastructure/defers aesthetic work. No model request or animation repair is needed to repeat the completed delivery tests.

## Preserved USB recovery and tool constraints

Use native **Arduino IDE only** for USB flashing and serial commands, 115200/New Line. Never use CLI serial/Terminal UI workarounds. Current preserved visible recovery sketch:
`/Users/pmartin5/Documents/Arduino/LightboardOTA_https_large_20261123/LightboardOTA/LightboardOTA.ino`.
It preserves the cobalt-vessel scene with this exact transport foundation, version`ota-pilot-20db910531d2722f73d15821`; a recovery upload returns that vessel, not stones. Actual verified IDE app1,011,248 bytes/SHA`373a5b903fab619b588ee49dfe1bbf6b3780953fb76e6db5be4695477ff7375b`. Native flash/hash/reset and actual binaries/options/source/ELF/map are in `.build/ota-https-large-header-2026-11-23/hardware-evidence/`. The prepared baseline source is separately in `.build/ota-header-fix-2026-11-23/baseline/LightboardOTA/`. Release recovery.bin is application-only, not a bare-flash image and not an allowed OTA URL.

Pinned CLI 1.5.1/core 2.0.17/libraries and full original ESP32 profile remain. Do not accept upgrades. USB `/dev/cu.usbserial-0001`; rediscover on future hardware work. IDE can retain stale ZigbeeMode metadata; only if observed, reload board data/reselect and inspect actual options. Do not use earlier failed v2 sketches or diagnostic experiments that lack the final4096-byte RX buffer. Current opened IDE sketch can differ from installed OTA scene; do not click Upload by default.

## Transport fix and history

At session start, a creative Desktop helper upload had replaced OTA support with a vessel on the old foundation. Preserved exact function and restored vessel+v5 OTA through IDE. Old run 45307022021/source 99b6d37 published but two OTA attempts failed safely despite improved signal. Read-only diagnostics found302→618, redirect758bytes; no-cache/query experiment did not fix it and jwt:expired marker was false. Increasing RX 1024→4096 yielded full907-byte redirect/HTTP 200 and exact full application SHA. Pinned IDF4.4.7 header callback behavior plus these results strongly support split-header truncation. The tested source and lock were adopted unchanged;79 offline tests pass, including actual C++ probe bounds/privacy/failure tests and exact migration tests.

Publisher accepts only old manifest SHA`67a5d7db82b007d8afa9466740cac3c6a3bea24790d3ea63a739aaf37911b0e6` into exact f124 foundation. It rereads immutable old manifest/assets before mutation, retains legacy metadata and hash-bound superseded_ota reference, never offers the incompatible old firmware as previous, never overwrites/deletes assets. Later same-foundation publication retains compatible previous. Unknown/edited histories stop. Old full manifest: `cloud/ota-foundation-history/45307022021-1.json`. Local hypothetical run 123 packages are unpublished test artifacts, never live releases.

GitHub connector reads work; source write attempt failed403, no mutation. User's Terminal SSH push works; shell GitHub DNS fails. Browser attachment is unavailable and workflow dispatch tool is absent; user manually runs workflows. User tends to paste the previous run URL; find the new run through repository actions/runs before requesting another link. Existing $0-stop check was handed to user before dispatch; public standard runner verified, current billing UI was not agent-observed. No billing changes, paid service, new model call, Actions artifact/cache or automatic delivery. No assistant background continuation scheduled. Preserve unrelated Final/ and .DS_Store edits.
