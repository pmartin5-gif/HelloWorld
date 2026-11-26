# Lightboard hardware and software record

**Current November26 hardware result:** Saved email heart published through queue run45891588901/source33e405d, exact initial-build size/SHA, then manually installed over Wi-Fi through native IDE serial. Running heart709f/f124/app1 at1376256,SDK2 VALID,healthtrue,wifi3/RSSI-55,heap free/min218396/211168,maxgap75ms,frames1642/refresh54695. Pending→LB_BOOT_HEALTH_PASSED observed; user says panel resembles heart animation. Prior baseline was app0; no repeat rollback performed. Automatic reporting/install remain off; no creative-quality/independent partition-hash claim. Current evidence supersedes historical baseline checkpoint below.

**Historical hardware result, November 23:** Two-scene Wi-Fi installs, deferred validity/health, SDK manual rollback and baseline restoration passed. Final baseline versionota-pilot-f2e92e43697828ea9cf37401/foundation f1244292… runs app0/state 2 VALID; user confirms normal stones. Actual4MiB/two-slot layout, Wi-Fi/retained credentials, max gap 77ms, free/min heap 219,344/216,280, worker/refresh stack 22,848/3,452. Current application 1,011,840bytes/SHA205081b86ce24673b1222e104f7dc156213bb920e2775ad01f5717ea48225807. Heart app1 was installed/valid, rolled back successfully, and remains the prior image after final reinstallation. Heart clipping is in its saved geometry, not a normal-fit claim. Automatic crash/power-cut recovery was not tested. Read RESUME.md/device verification for exact sequence, evidence and preserved native IDE recovery source.

## Historical identification and earlier measurements

The following records describe earlier stages; current results above supersede their pending statuses.

**Recorded:** November 6, 2026

**Purpose:** Record the Step 1 backup, board identity, current build capacity, and network assessment. Distinguish verified computer-side evidence from physical or runtime checks still to complete.

## Verified information

**November 18 development test:** Failed v2 was recovered through IDE, and the user confirmed the baseline animation. Revised v3 then flashed once with fresh **1,007,728-byte** hash/reset evidence and passed offline boot health. Status verifies **4,194,304-byte flash**, valid layout, app0 at 65,536, 1,310,720-byte slot, target app1; free/min/largest heap **220,692/220,120/110,580 bytes**, max frame gap **60 ms**, worker/refresh stack free **22,196/3,452 bytes**. Frame/refresh counters continue after an offline `check` correctly refuses network access. These measurements are offline only. v3 physical confirmation, Wi-Fi/TLS load, and OTA delivery/recovery remain pending. ESP32 2.0.17/full profile and all visible source bytes were verified. No credentials were entered. The unchanged Desktop source/helper tracks the old foundation and must not overwrite retained v3. See `device/verification.json` and `RESUME.md`.

**Latest network check:** User completed private provisioning and confirmed normal v3 animation. Stored credentials are present, but initial association and one explicit reconnect report `WL_NO_SSID_AVAIL` (status 1). Network choice/2.4 GHz visibility need resolution before HTTPS testing. Post-retry health remains true: free/min heap 220,604/220,032 bytes, max frame gap 70 ms, advancing counters. No credential value was observed or recorded.

**Reconnection check — November 9, 2026:** The user reports the board is accessible again and connected over USB. The existing helper's read-only status rediscovered `/dev/cu.usbserial-0001` with profile `esp32:esp32:esp32`, no pending IDE upload, matching source checkpoint, and matching protected code. Live sketch SHA-256 remains `d90e1b58d47ad841c7ef6c737afac802da1e34e0a4810e43ca7ae7e05173bb46`. No device flash, serial read/write, Wi-Fi test, runtime measurement, or new physical visual confirmation was performed.

| Item | Recorded value | Evidence |
| --- | --- | --- |
| Board power | Powered, confirmed by the user | User's message in this conversation |
| Physical animation | Looks correct, confirmed by the user | User's November 6 response |
| Printed board label | `ESP32 DEVKITV1` on the back | Transcribed by the user |
| Front radio/module marking | `wifi esp32 wifi+BT soc inside ism2.4g 802.11/b/g/n` | Transcribed by the user |
| Target Wi-Fi SSID | `MFA IxD` | Specified by the user |
| Intended network credentials | Shared network password supplied privately in conversation; not stored in project files | User's response; full network authentication behavior still to be tested |
| Selected Arduino board profile | ESP32 Dev Module | Current Arduino IDE toolbar and status bar |
| Base board identifier | `esp32:esp32:esp32` | Current IDE, helper configuration, and latest archived build |
| Installed board package | ESP32 Arduino, package ID `esp32:esp32` | Read-only Arduino CLI core list and installed platform file |
| Installed core version | **2.0.17** | CLI core list, installed `platform.txt`, and archived build hardware path agree |
| Arduino IDE version | **2.3.10** | Current application window title |
| Selected USB port | `/dev/cu.usbserial-0001` | Current IDE toolbar and status bar |
| Working sketch | `Play_Test.Working_Code.ino` | Current IDE window and helper configuration |

The generic Arduino profile and the user's reported `ESP32 DEVKITV1` label are recorded separately. The assistant has not independently inspected the board markings or measured the physical flash capacity. The selected USB port is an inspection-time observation; rediscover the adapter after reconnecting it.

## Step 1 confirmations and later hardware tests

- [x] Physical board label recorded from the user's transcription: `ESP32 DEVKITV1`.
- [x] Power and correct physical animation confirmed by the user.
- [x] Target network identified as `MFA IxD`; a shared network password was supplied but is omitted from all project files.
- [x] Existing source/firmware preserved and preliminary build capacity assessed.
- [ ] Before wireless deployment, verify that `MFA IxD` offers a compatible 2.4 GHz connection and establish whether any browser or enterprise login is required beyond the supplied password.
- [ ] At the controlled Step 7 hardware test, verify actual flash capacity and on-device partitions, compile the networked build, and measure runtime memory with Wi-Fi/HTTPS/OTA.

The Step 1 preservation and identification records are complete. Successful network association, internet access, and OTA behavior have not yet been tested.

## Current build settings

The latest archived build inspected uses these options:

| Setting | Configured value |
| --- | --- |
| CPU frequency | 240 MHz |
| Flash frequency | 80 MHz |
| Flash mode | QIO |
| Flash size option | 4 MB |
| Partition scheme | Default |
| PSRAM | Disabled |
| Upload speed | 921600 baud |

The 4 MB value is a configured build option, not an independent measurement of the attached flash chip.

Exact archived board identifier:

```text
esp32:esp32:esp32:UploadSpeed=921600,CPUFreq=240,FlashFreq=80,FlashMode=qio,FlashSize=4M,PartitionScheme=default,DebugLevel=none,PSRAM=disabled,LoopCore=1,EventsCore=1,EraseFlash=none,JTAGAdapter=default
```

## Current animation foundation

The live project instructions and source now describe continuous `restState` rendering with the buttons and happy/sad face effects removed. Preserve that current behavior when extending the firmware. The November 2 `lightBoardAgent.md` document remains a historical snapshot and includes the older button-based design.

The Step 1 work updated project documentation and preserved an additional current-baseline backup. It did not compile, upload, modify the live firmware, or verify physical LED appearance.

## Step 1 capacity and network assessment

**Checked:** November 6, 2026

### Current baseline preservation

The original full backup remains in `backups/2026-11-06/`. A second, smaller snapshot in `backups/2026-11-06-current-baseline/` preserves the latest recorded uploaded source and firmware, current project instructions, configuration, state, upload evidence, decoded partitions, and capacity metrics. It supplements the earlier backup rather than replacing it.

The current source matches the helper checkpoint and archived source. Archived firmware and partition binaries match their corresponding current IDE cache binaries. Copied source and firmware were verified by SHA-256. This is preservation of the recorded upload artifacts; the physical board's flash has not been read back.

### Partition layout decoded from the archived binary

| Name | Role | Offset | Size in bytes |
| --- | --- | --- | --- |
| nvs | Settings storage | `0x9000` | 20,480 |
| otadata | OTA boot selection metadata | `0xE000` | 8,192 |
| app0 | OTA application slot 0 | `0x10000` | 1,310,720 |
| app1 | OTA application slot 1 | `0x150000` | 1,310,720 |
| spiffs | Filesystem | `0x290000` | 1,441,792 |
| coredump | Crash dump storage | `0x3F0000` | 65,536 |

This table ends at the configured 4 MiB flash boundary. It already contains two OTA application slots and OTA metadata, matching Espressif's documented application-update layout. A partition change is not indicated by this artifact check. The table on the physical board and actual chip capacity have not been independently read back. [Espressif OTA documentation](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/system/ota.html).

### Firmware and memory measurements

| Measurement | Result | Meaning |
| --- | --- | --- |
| Current application binary | 290,560 bytes | Size of the latest archived firmware file |
| Each application slot | 1,310,720 bytes, or 1.25 MiB | Decoded from the archived partition binary |
| Current slot utilization | 22.17% | Application binary size divided by slot size |
| Space remaining in an app slot | 1,020,160 bytes, about 996 KiB | Available for growth in the application image |
| Static DRAM | 21,984 bytes | `.dram0.data` plus `.dram0.bss` and `.noinit` from the matching cached ELF |
| Live free heap | Pending runtime test | Not measured by file inspection |
| RAM and image size with Wi-Fi, HTTPS, and OTA | Pending actual implementation | Current firmware does not include these features |

**Preliminary result:** The current build has an OTA-compatible partition structure and substantial application-image headroom. This supports proceeding with the cloud/model experiments. It does not yet prove physical flash capacity, final networked firmware fit, or sufficient live heap for Wi-Fi and HTTPS. Compile the actual networked build and measure runtime heap before enabling remote updates. ESP-IDF distinguishes static RAM from runtime allocations; Wi-Fi initialization allocates driver resources and tasks. [Memory documentation](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/system/mem_alloc.html), [Wi-Fi documentation](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/network/esp_wifi.html).

The installed ESP32 SDK configuration contains `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y`. Automatic recovery behavior has not been tested. The networked firmware still needs an explicitly reviewed and tested application health-confirmation and recovery policy; the SDK flag alone does not verify it.

### Network assessment

The Mac's Wi-Fi system report returned interface `en0` as inactive with no network name. A separate network-settings query could not obtain authorization in this environment. These observations do not establish whether the intended access point is available or usable by the ESP32.

The user identified the target SSID as `MFA IxD` and supplied a network password. Treat shared-password access as the intended setup, while retaining the need to verify the actual security mode, whether an additional browser/enterprise login is required, and whether a compatible 2.4 GHz access point is available. The board's user-reported marking includes `ism2.4g` and `802.11/b/g/n`; this does not establish the access point's supported bands.

The password is deliberately omitted from the repository, this record, and the conversation log. Provision credentials privately on the device during setup rather than embedding them in published source or firmware. Actual Wi-Fi association and HTTPS reachability are part of the controlled Step 7 hardware test.

### User observations received

The user confirmed that the current animation looks correct, transcribed `ESP32 DEVKITV1` from the board's back and the radio marking from its front, and supplied the target network name. These resolve the Step 1 identification questions. Network operation and physical capacity measurements remain later validation tasks.

## Evidence locations

- Helper configuration: `/Users/pmartin5/Desktop/Lightboard_Automation/config.json`
- Installed core metadata: `/Users/pmartin5/Library/Arduino15/packages/esp32/hardware/esp32/2.0.17/platform.txt`
- Live project instructions: `/Users/pmartin5/Desktop/Play_Test.Working_Code/AGENTS.md`
- Live sketch: `/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino`
- Archived build options inspected: `/Users/pmartin5/Desktop/Lightboard_Automation/history/20261106-175518-253620/ide-firmware/build.options.json`
- Archived upload result: `/Users/pmartin5/Desktop/Lightboard_Automation/history/20261106-175518-253620/result.json`
- Current IDE observation: window `Play_Test.Working_Code | Arduino IDE 2.3.10`, selected `ESP32 Dev Module`, port `/dev/cu.usbserial-0001`.

The archived build references the same working sketch location and core 2.0.17. Its upload record is historical evidence. The user has now confirmed that the current physical animation looks correct.
