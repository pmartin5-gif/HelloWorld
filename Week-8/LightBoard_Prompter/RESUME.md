# Resume Lightboard Prompter

**Status:** Paused at the user's request on November 6, 2026.

Resume only when the user asks. No background work is scheduled for this project.

## Project and objective

Working folder: `/Users/pmartin5/Documents/GitHub/HelloWorld/Week-8/LightBoard_Prompter`.

Repository: `pmartin5-gif/HelloWorld`; this project is a folder under `Week-8`, not a separate repository.

Build a workflow where someone submits a creative prompt, a free model generates a replacement `restState`, cloud tooling compiles firmware, and the ESP32 downloads it over Wi-Fi. Normal operation should work with the user's computer off. Email is the proposed first input; a form remains an alternative.

**Budget is zero additional spending.** No paid API use, billing activation, payment method, subscription upgrade, paid hosting, or paid fallback. Pause when free allowances are exhausted. API keys must remain outside Git.

## Completed work

- Saved the original skill and supporting instructions in `lightBoardAgent.md`. This is a November 2 snapshot and describes the earlier button-based firmware.
- Wrote and maintained `projectPlan.md` as a ten-step checklist and `documentation.md` as the conversation record.
- Created and hash-verified the full backup in `backups/2026-11-06/`.
- Preserved the newer recorded uploaded source and firmware separately in `backups/2026-11-06-current-baseline/`.
- Completed Step 1 preservation and identification records in `hardwareRecord.md`. The user confirmed the display is powered and the current animation looks correct.
- Recorded physical label ESP32 DEVKITV1, Arduino profile `esp32:esp32:esp32`, and installed/build-used core 2.0.17.
- Verified the archived partition layout has two 1,310,720-byte application slots and OTA metadata. The baseline binary is 290,560 bytes; static DRAM is 21,984 bytes. Actual flash capacity and networked runtime memory are not independently verified.
- Generated three candidate animations in Google AI Studio using `gemini-3.8-flash`, with no API key selected and optional tools off. Initial attempts used Medium thinking; corrections used Low.
- All three corrected candidates pass function-boundary checks, preserve protected source bytes, produce previews, and compile locally with the pinned ESP32 toolchain. No test candidate was uploaded to the board.

## Model results to review

Detailed results: `modelVerification.md`.

Artifacts: `experiments/model-verification/2026-11-06/`.

| Example | Model corrections | Technical result | Creative observation |
| --- | --- | --- | --- |
| Lighthouse | 1 | Passed | Beam is dim or absent in most sampled frames; muted scenery |
| Overflowing heart | 1 | Passed | Strongest match for readable saturated shapes and black space |
| Vulnerable figure | 2 | Passed | Reaching/waiting/bracing are visible; strokes may be too thin on real LEDs |

The initial attempts were not accepted unchanged. Preserve validation and bounded correction attempts. User creative approval is still pending; the model has not been selected for unattended operation. Previews are simplified desktop renders, not physical panel tests.

## Exact stopping point

The user explicitly approved creating a free Google AI Studio project named `lightboard-prompter` and one Gemini API key, with billing disabled and key storage outside Git.

The attempted project creation in the current SVA Google account failed with:

> Failed to create project, Project creation is disabled. Please try again later.

No project or API key was created. No credential file was written. No billing or paid services were enabled. The error does not establish whether account policy or a temporary service issue caused the failure.

The user has not chosen between trying a personal Google account and staying with SVA to resolve the restriction. That question is deferred until the user resumes; do not switch accounts or retry creation during the pause.

## Remote work option discussed on November 7

The user asked how much can be done while away from the ESP32 and panel. This was a planning question; the pause remains in effect. The software pipeline can be prepared through downloadable firmware, with simulated device acknowledgments for queue tests. The cloud/API account blocker is independent of hardware access. The Wi-Fi/OTA candidate can be written and compiled separately before installation.

Live flash capacity, networking, memory, physical appearance, update delivery, and recovery still need the real hardware. If the board remains USB-connected to the accessible Mac, a later authorized initial upload may be operable remotely; an onsite helper may still be required for physical observation or recovery. Whether it is still USB-connected has not been confirmed in this discussion.

## First actions when resuming

1. Read this note, `projectPlan.md`, and `modelVerification.md`. Use `documentation.md` for the decision history.
2. Ask which account route the user wants: personal Google account, or SVA after resolving the restriction. Existing resource-creation approval does not choose a different account.
3. Recheck the relevant service's current free-tier terms and observed account state. Do not assume that playground access proves free API access.
4. If the selected account allows setup without billing, create the approved project/key, store the key privately outside Git, verify the project is on the free tier, and record actual API quotas. Stop if payment, unavailable free access, new legal terms, or additional account/admin permissions require user involvement.
5. Ask the user to review the saved previews before selecting the model for automation.
6. Continue to the cloud-build step only after the necessary free API and creative checks pass. No cloud workflows, email processor, or OTA firmware have been implemented yet.

## Hardware and source of truth

The live sketch and helper remain at:

- `/Users/pmartin5/Desktop/Play_Test.Working_Code/Play_Test.Working_Code.ino`
- `/Users/pmartin5/Desktop/Lightboard_Automation/`

Read the live sketch folder's `AGENTS.md` and the live helper README before touching firmware. The live foundation now renders `restState` continuously; buttons and happy/sad face effects were removed in a separate authorized maintenance change. Preserve the current foundation rather than restoring those older features from the November 2 snapshot.

Only routine creative updates may replace `restState`. Wi-Fi/OTA requires a separately reviewed foundation extension and an initial physical USB setup. Use the archived backup as recovery evidence, not as a silently migrated deployment configuration.

Target Wi-Fi SSID is `MFA IxD`. The user supplied a password in the conversation; it was deliberately omitted from all project files. Provision it privately later. Compatible 2.4 GHz access, the network's actual security/login requirements, HTTPS connectivity, physical flash capacity, runtime heap, and actual OTA/recovery behavior still need controlled hardware testing.

## Conversation scope and storage

The user originally scoped the documentation and collaboration experiments to this conversation. This handoff preserves their results and the project state; it does not install a new skill or make the experiments permanent instructions for future work.

Files are saved locally in the GitHub working folder. They have not been committed or pushed by the assistant. No paid services were enabled, no firmware was uploaded during this project work, and no continuation is scheduled.

## Suggested message to resume

> Resume the LightBoard_Prompter project. Read RESUME.md first and continue from the Google AI Studio account decision. Keep the zero additional spending constraint.
