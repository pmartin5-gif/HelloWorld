# Lightboard remote prompting step by step

## First unattended email milestone achieved; continuous intake next

Run45895333330/sourceb941500 generated one new Gemini scene and published it successfully. ESP32 automatically installed `ota-pilot-f502bdd7ce31e531e7b2a28f`, app1/SDK2VALID/healthy/Wi-Fi connected, and user confirmed “it changed”. No per-email install/upload/build intervention. Arduino IDE/Mac are not required for normal operation; ESP32 needs power and Wi-Fi. First-email handler stops after one result, so **sending further emails whenever desired is not yet enabled**. Next is persistent one-at-a-time intake; reporting, fuller queues and creative/broad tests remain backlog. See [automatic email guide](email/automatic-pilot.md). Older bootstrap/manual statuses below are historical.

## Immediate milestone — one new email to automatic panel installation

User prioritizes one unattended email → Gemini → compile → publish → ESP32 install. The new opt-in automatic runtime is already compiled/USB-installed and healthy with retained Wi-Fi; auto-on was enabled. Current heart bootstrap version `ota-pilot-10044853bfa1d68ef156ecf2`, foundation `a529d5f9a72ca4858e0ab09ae66ec5eaecff656fdeb6d6a4f040e40633959ec1`, app0. The first new emailed image is **not yet verified**. Next push the implementation, add Automatic.gs and the updated manifest to Apps Script, run startEmailPilot once, then send one fresh prompt. Device reporting, continuous queues, replies and broad/creative tests are backlog. See [automatic email guide](email/automatic-pilot.md) and [resume](RESUME.md). Historical results below remain historical.

**Updated:** November 26, 2026

**Status:** Controlled Step 7 hardware tests passed: heart and baseline installed over Wi-Fi, deferred validity/health, SDK manual rollback, baseline reinstallation and final normal stones confirmed. Source051a334 is remote. All 79 offline tests and both 29-test corrected cloud runs passed. Automatic updates remain off. Heart clipping is a saved-scene geometry issue; creative refinement remains deferred. Routine prompt/publication integration passes locally and in saved-response cloud run45858227133. Record-only email intake and queue simulation pass15 focused checks; private inbox setup is complete and live inline-prompt exact hash and stable single-job replay are verified; unmarked-message nonacceptance also passed after Spam recovery; direct-reply exact prior-prompt hash also passed; no-context marker rejection also passed; durable queue/workflow integration is next. New martin apple Wi-Fi is privately provisioned and verified connected; dedicated Gmail is configured and inline prompt/hash/replay are verified; unmarked-message nonacceptance also passed after Spam recovery; direct-reply exact prior-prompt hash also passed; no-context marker rejection also passed; durable queue/workflow integration is next.

**Goal:** Email a prompt, generate and compile an animation in the cloud, and have the ESP32 install it over Wi-Fi while your computer is off.

**Budget:** Zero additional spending. Stay on verified free allowances. When a limit is reached, pause or queue requests. Do not enable paid fallback or use a time-limited paid trial as the long-term solution.

**Starting point:** Cloud saved-response generation/compilation, public delivery and the separate sealed known-scene OTA workflow are verified. Current board is baseline f2e92e43…/foundation f124…/app0/VALID with saved credentials. The revised routine builder/publisher passes the saved-response cloud build with the sealed foundation; new routine publication/physical confirmation are pending. The Desktop helper still uses non-OTA source and must not overwrite the OTA board. New martin apple Wi-Fi is verified connected; dedicated Gmail is configured and inline prompt/hash/replay are verified; unmarked-message nonacceptance also passed after Spam recovery; direct-reply exact prior-prompt hash also passed; no-context marker rejection also passed; durable queue/workflow integration is next. Read RESUME.md for exact evidence and current next action.

## How to use this plan

Work through the technical checkpoints in order. On November 9 the user asked to prioritize infrastructure and defer animation appearance. No additional preview, quality comparison, or aesthetic approval is required before continuing. Keep source protection, compile checks, and physical installation/recovery verification.

**Check scope, November26:** Routine scenes run the prompt/response binding, protected-source/foundation checks, candidate compilation and package/publication size/hash/readback gates. Full regression tests are reserved for infrastructure changes or a relevant failure; do not rerun them for every scene or ordinary chat message. No animation preview, aesthetic assessment, clipping repair or creative iteration is required at this stage. The explicit known-scene OTA infrastructure-test workflow retains its tests. Recovery compilation remains in the package builder for now; this change removes repeated regression tests only.

Email is the proposed first interface for this walkthrough. A form can replace the email portion later. Normal operation will be wireless, but initial Wi-Fi and update provisioning requires a USB connection.

Working folder:

`/Users/pmartin5/Documents/GitHub/HelloWorld/Week-8/LightBoard_Prompter`

Repository root:

`/Users/pmartin5/Documents/GitHub/HelloWorld`

## Work possible without being at the board

**Planning update:** November 7, 2026, retained as a remote-work option. The user resumed onsite on November 9.

The next software milestone can be an email or form prompt producing a validated, compiled, downloadable firmware update while the ESP32 is unavailable. Account access and free service allowances must still be verified before enabling any service.

- Recheck free API eligibility and quotas; creative tuning is deferred.
- Prepare and test the cloud compiler and generation integration from Steps 4–5.
- Prepare firmware publication and its version manifest from Step 6.
- Write and compile a separate Wi-Fi/OTA firmware candidate from Step 7, measuring its compiled size without flashing it.
- Build and test email intake, deduplication, queuing, acknowledgments, and workflow dispatch from Steps 8–9. Use a simulated device for version checks, offline behavior, timeouts, and acknowledgment tests; keep real deployment disabled.

Physical hardware is required to verify flash capacity and installed partitions, Wi-Fi association and authentication, runtime heap and frame timing, the displayed animation, actual OTA installation, and recovery. A simulated acknowledgment must never be reported as installation on the real board.

The user's personal presence is not always required. If the ESP32 is already connected by USB to the accessible Mac, an initial upload could technically be operated remotely through Arduino IDE when authorized. Someone onsite may still be needed to connect cables, provision or troubleshoot networking, observe the LEDs, reset power, or recover a failed installation. If no USB or previously installed OTA path is available, initial installation requires physical access.

The earlier SVA project-creation rejection was bypassed through the user-selected personal account; free API access is now verified. Steps 7's live tests and Step 10's physical pilot remain hardware-dependent.

## Step 1 — Preserve the working board and check the network

**You can do this now.**

- [x] Created and verified copies of `Desktop/Play_Test.Working_Code` and `Desktop/Lightboard_Automation` in `backups/2026-11-06/` inside this project, as requested on November 6. This includes hidden skill files, the helper, configuration, history, firmware, and caches. See `backup-manifest.json` for per-file SHA-256 verification. The copies are local; they have not been committed or pushed.
- [x] The user confirmed on November 6 that the board is powered and the current animation looks correct. Recorded in `hardwareRecord.md`; the current firmware renders continuously with buttons and face effects removed.
- [x] Recorded the user-reported physical label **ESP32 DEVKITV1**, front radio marking, selected **ESP32 Dev Module** profile (`esp32:esp32:esp32`), and installed/build-used ESP32 core **2.0.17** in `hardwareRecord.md`.
- [x] Identified target Wi-Fi **MFA IxD** and recorded that a shared password was supplied, omitting the credential itself. Actual 2.4 GHz availability, security mode, any extra browser/enterprise login, and successful connection must be verified during Step 7.
- [x] Completed the archive-based capacity assessment in `hardwareRecord.md`: two 1.25 MiB OTA slots and OTA metadata are present; the 290,560-byte image leaves 1,020,160 bytes in a slot; static DRAM is 21,984 bytes. Preserved the latest baseline in `backups/2026-11-06-current-baseline/`. Actual flash capacity, networked firmware size, and runtime heap remain mandatory checks before enabling OTA in Step 7.

**Step 1 status:** Preservation, user-observed behavior, hardware identity, network identification, and the preliminary artifact-based capacity assessment are complete. Actual network compatibility/association, physical flash capacity, and networked-firmware runtime validation remain Step 7 checks before enabling wireless deployment.

## Step 2 — Try a free model in Google AI Studio

**You can do this now.**

- [x] Opened Google AI Studio in the existing signed-in account. Used separate test chats and left Google Drive chat saving disabled.
- [x] Tested **Gemini 3.8 Flash** (`gemini-3.8-flash`) in the playground and checked published free-tier pricing. After two SVA rejections, the user selected their personal account. Created the approved project and key on November 9; AI Studio shows Free tier. Observed Gemini 3.8 Flash limits are 5 requests/minute, 250,000 tokens/minute, and 20 requests/day. 3.8 Flash API metadata passed but generation failed. The separately authorized Flash-Lite API test later passed; its animation quality remains unreviewed and was deferred by the user. See `modelVerification.md`.
- [x] Playground tests used **No API key selected**, with optional tools off. No billing, payment method, upgrade, or paid key was enabled during those playground tests. A separate free project/key was created November 9 and stored outside Git; keep its billing disabled.
- [x] Checked published free-tier data-use information and used only the generic brief, non-sensitive creative examples, and correction feedback. No Wi-Fi password or live project files were uploaded.
- [x] Submitted the brief in a text/code playground chat and generated C++ drawing code.
- [x] Saved the three final functions, exact prompts, settings, rejected attempts, and correction records under `experiments/model-verification/2026-11-06/`. Live sketch unchanged.

### Generation brief to copy

Current brief: `generationBrief.md`, updated November 9 to allow expressive brightness changes for individual pixels. The prompts retained with the November 6 experiments remain the exact prompts used then.

```text
Generate Arduino C++ drawing code for an existing physical 32x32 ESP32 LED panel.

Return exactly one function:
void restState(unsigned long now)

An existing global PxMatrix display object named display is available. Use now for animation timing. Put all additional constants, arrays, structs, persistent state, and lambdas inside this function. Do not add includes, other global declarations, setup, or loop.

Use basic Adafruit GFX style drawing operations on display, such as fillScreen, drawPixel, drawLine, fillRect, drawCircle, fillCircle, and color565.

Interpret the prompt through ONE central visual or emotional idea. Use bold readable shapes, saturated colors, pronounced movement, and intentional black space. Treat the brightness of individual pixels as an expressive variable alongside color and motion. Pixels may brighten, dim, fade, or pulse independently when that supports the idea. Design for a physical LED grid and its glow. Avoid tiny detail, incidental washed-out colors, clutter, and illustrating every phrase. Deliberate pixel-brightness changes and fades are allowed; keep the central idea readable. Preserve the requested emotional tone; an unresolved feeling should stay unresolved.

Control individual pixel brightness through the RGB drawing values before packing them with display.color565. For a given hue, scale its red, green, and blue channels together by a brightness factor from 0.0 (off) to 1.0 (full intensity), clamp each resulting channel to 0..255, and convert to integers before color565. This can be applied separately to each pixel. Use intentional brightness contrasts and transitions for expression. Do not change the panel-wide hardware brightness or refresh settings.

The animation runs indefinitely. Keep per-frame work bounded and state modest and fixed-size. Avoid long-running floating-point time drift. The current firmware renders this scene continuously. Clear and paint the hidden drawing buffer each frame.

Do not use delay, dynamic allocation, serial, networking, filesystem access, hardware initialization, refresh changes, panel-wide hardware brightness changes, timer changes, or buffer swapping. The existing loop handles display refresh and buffer swaps. Do not call showBuffer.

The existing firmware uses ESP32 Arduino core 2.0.17. Keep the code compatible with that foundation. Return only the function code.

Creative prompt: A lighthouse sweeping one clear beam across a dark sea.
```

- [x] Generated the overflowing-heart example in a fresh chat using the same brief.
- [x] Generated the unresolved-figure example in a fresh chat using the same brief.

**Step 2 status:** Playground examples and records are complete. The approved project/key were created in the user-selected personal account on November 9, with Free tier observed and model quotas recorded. User-run 3.8 Flash generation tests returned HTTP 503s and timeouts. A later separately authorized Gemini 3.5 Flash-Lite cloud test passed metadata and generation; the user deferred creative review for Lite and asked to continue infrastructure. No billing or paid service has been enabled.

## Step 3 — Preview and compile those examples

**Coding and review step with the assistant.**

Bring back this request:

> Review my three Gemini candidates in LightBoard_Prompter. Use the existing preview helper where supported, validate the restState boundaries, and compile against an isolated copy of the pinned working firmware. Keep the live sketch unchanged and do not upload. Show me the previews and compile results.

- [x] Generated and inspected all three contact sheets. Recorded creative concerns in `modelVerification.md`. The user accepted the three samples on November 9, with expressive per-pixel brightness added to the future generation brief.
- [x] All three final candidates pass function-boundary and protected-source checks and compile locally using ESP32 core 2.0.17 and the archived board options. No uploads performed.
- [x] Stayed within the correction limit: lighthouse 1, heart 1, figure 2. Preserved the failures and model-generated corrections.
- [x] User accepted Gemini 3.8 Flash’s saved examples for further prototyping on November 9 and requested per-pixel brightness as an expressive element. Flash-Lite passed the API diagnostic and is used for the infrastructure implementation. The user deferred further creative review; technical validation and compilation are still required. Later physical tests verify operation and recovery, with appearance adjustable afterward.

**Historical checkpoint complete:** Three examples compiled against the preserved foundation and were accepted for prototyping. Further creative review is deferred; it does not block infrastructure.

## Step 4 — Build the existing sketch on GitHub

**First prove cloud compilation with a known working scene.**

**Completed November 9:** Published commit `3ee1965` through the user’s existing SSH access. [Cloud run #1](https://github.com/pmartin5-gif/HelloWorld/actions/runs/42720712106) passed in 53 seconds on Ubuntu. Downloaded the firmware and verified the archive digest, all file checksums, source hash, dependency lock, and commit. Cloud application: 290,960 bytes. See `cloud/github-verification.json` and `cloud/README.md`.

**Step 4 scope:** The completed baseline-only build needed no model access or board connection. The zero-charge runner and storage path were verified before running it. No further baseline run is needed without a change or failure. Step 5 is the next software milestone; no device update occurred in Step 4.

Bring back this request:

> Create a manual GitHub Actions build for the approved Lightboard baseline. Keep project code under Week-8/LightBoard_Prompter, pin the current ESP32 core and libraries, and compile a known working scene without model generation or deployment. Use a standard Linux runner and keep storage within free allowances. Prepare the files for review before publishing them.

- [x] Confirmed the repository is public. The account UI on November 9 showed Actions storage 0 GB used / 0.5 GB included and an existing $0 Actions budget marked Usage blocked. No billing settings changed. Standard public hosted compute is free; downloads default off and require free storage plus the spending stop.
- [x] Reviewed and committed only new Lightboard build files, the current generation brief, and project ignore/attribute files in `3ee1965`. Existing conversation/progress records and unrelated repository edits remain uncommitted.
- [x] Prepared `.github/workflows/lightboard-baseline.yml` at the repository root, targeting only this project. It is manual-only, uses standard Ubuntu, skips private repositories, has no cache or model calls, and never deploys to the board.
- [x] Published the reviewed build in commit `3ee1965` on main and manually triggered run `42720712106` after verifying free storage and the existing $0 spending stop. Selected the one-day firmware download.
- [x] Confirmed successful cloud compilation and downloaded artifact `13720520896`. Verified the ZIP digest, all four file checksums, source/build-lock hashes, commit, versions, and image size. The GitHub download expires November 10 at 23:29 UTC; a local copy is saved under `.build/cloud-run-42720712106/`. Retention is one day; no Actions cache is used.

**Done when:** GitHub builds the known sketch with the pinned toolchain. No board connection is involved.

GitHub documents the free-runner distinction and the default-branch requirement for manual workflows. [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Running a workflow manually](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## Step 5 — Generate and compile from a manually entered prompt

**Now connect the free model API.**

**Current diagnostic:** The earlier 3.8 Flash cloud run `42724339342` passed metadata but timed out on generation; its cause remains unresolved. The user authorized a separate free Gemini 3.5 Flash-Lite test and pushed model selection in commit `691f827`. After rechecking the public repository, free Google project, and observed model allowance, [run `42727547923`](https://github.com/pmartin5-gif/HelloWorld/actions/runs/42727547923) passed metadata and its one generation request. It returned `LIGHTBOARD_API_OK` in about 4.04 seconds (13 seconds overall), with no retries or paid fallback. The existing private Actions secret was reused. See `cloud/api-lite-verification.json`; the original failure remains in `cloud/api-verification.json`. Eight mocked diagnostic tests passed before publication. No animation has been generated or reviewed with Lite yet.

- [x] Created the existing `lightboard-prompter` project and key and observed Free tier with billing disabled. Keep using this key; do not create duplicates.
- [x] Complete one successful small API generation test with `test_gemini_api.py`: Gemini 3.5 Flash-Lite returned `LIGHTBOARD_API_OK` from GitHub on November 9.
- [x] Defer creative-quality review and optional previews as requested. Keep the per-pixel brightness brief and technical checks.
- [x] Implement `.github/workflows/lightboard-prompt-build.yml`: manual prompt input → one Flash-Lite request → source validation → isolated pinned compilation → optional one-day firmware bundle. Replaces the unpublished fixed review-only workflow.
- [x] Verify 27 offline tests, manual-workflow YAML/input handling, and a real local compile using the archived heart function (292,064-byte application, 22,760-byte reported static DRAM). Bundle checksums and protected bytes passed. No new API call or upload. See `cloud/prompt-build-verification.json`.
- [x] Published implementation `c8c1947` via the user’s SSH push. Ran cloud test `42733551597`: generation passed in 5.018 seconds; validation rejected an unsupported call; compilation and download skipped. No retry, fallback, artifact, or upload.
- [x] Published diagnostic `d67f3a6` and ran test `42735010470`: generation passed in 4.479 seconds, response retained, validation named `rand`. The installed core provides this standard numeric function; a narrow allowance fixes the false positive. The unchanged source validates/compiles locally (291,216-byte image, 22,600-byte static DRAM). All 32 offline tests pass.
- [x] Published `1cd37ca` via SSH and verified [saved-response cloud run 42742746935](https://github.com/pmartin5-gif/HelloWorld/actions/runs/42742746935): reuse, validation, and compilation passed; model generation skipped; application 291,200 bytes. No download was selected. See `cloud/prompt-build-reuse-verification.json`.
- [ ] Inspect the cloud artifact report provenance and binary checksums when free storage and the spending stop can be freshly verified. Do not regenerate the saved response to obtain that evidence.
- [x] With explicit user approval, saved the existing free-project key as private Actions secret `GEMINI_API_KEY` in `pmartin5-gif/HelloWorld`. GitHub confirmed creation. The value remains outside source, documentation, prompts, screenshots, and firmware.

Bring back this request:

> Add Gemini generation to the manual Lightboard workflow. Load the saved creative brief, accept a prompt as workflow input, restrict changes to restState, validate and compile the candidate, and retain the original prompt and build result. Limit correction attempts, serialize jobs for one board, and stop on free-tier exhaustion. Do not deploy yet.

- [x] Ran **Lightboard prompt build** once with the generic overflowing-heart prompt; no visual review was performed. Generation passed and validation stopped the job. Full pipeline verification remains pending.
- [ ] Confirm the output includes a compiled candidate and an accurate result.
- [x] A rejected candidate prevented compilation/download in the real cloud run; offline tests also verify compile-failure and stale-bundle isolation. Device-publication controls are a later Step 6 checkpoint.

**Done when:** A prompt entered in GitHub produces validated, compiled firmware without running anything on your computer.

[GitHub's instructions for repository secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

## Step 6 — Make compiled firmware downloadable

**Prepare delivery before changing the board.**

**Verified November 9:** Published `7e47654` passed [Lightboard publication test 42746766266](https://github.com/pmartin5-gif/HelloWorld/actions/runs/42746766266). Candidate 291,200 bytes; recovery baseline 290,960 bytes. Four release assets passed server size/SHA-256 and anonymous byte readbacks; stable and commit-addressed feed checks passed. An independent connector read matches the logged manifest. Original saved response reused; no new model request, Actions artifact/cache, billing change, or device operation. See `cloud/publication.md` and `cloud/publication-verification.json`. Physical ESP32 TLS/networking and recovery remain Step 7.

Bring back this request:

> Add a firmware publication step and a small version manifest to the Lightboard workflow. Propose a verified free download route, such as public GitHub release assets if suitable for this repository. Include version, checksum, and firmware location; retain the previous approved version and keep credentials out of published files. Prepare the changes without enabling device updates.

- [x] Prepare a local bundle manifest with source-derived version, application filename, SHA-256, and size. It has no device URL yet and explicitly records no publication or OTA support.
- [x] Document public contents in `cloud/publication.md`: four allowlisted assets; existing public source archives/repository/workflow logs; no attached prompt/source/log record.
- [x] Confirmed actual four-asset publication and anonymous runner readbacks in `42746766266`. If the repository is private, resolve device access without embedding a broad GitHub token in the ESP32.
- [x] The separate Linux runner anonymously downloaded all assets and read the stable feed; the connector independently read the same feed.
- [ ] Verify ESP32 HTTPS compatibility on the physical board in Step 7; successful runner downloads do not establish device TLS behavior.
- [x] Offline tests confirm failed builds/uploads/readbacks do not advance the feed, and a feed conflict never deletes the previous release.
- [x] Verified real publication and current/previous/baseline links/checksums. The first previous entry is the baseline recovery; physical recovery remains Step 7.
- [ ] Ensure published firmware will use separately provisioned Wi-Fi credentials rather than compiling the network password into a publicly downloadable binary.

**Done when:** The delivery route is verified, within free allowances, and ready for a controlled device test. Publishing is not yet proof that a board installed anything.

## Step 7 — Verify the Wi-Fi/OTA foundation

**Controlled hardware checkpoint passed November 23.** Heart run 45312083895 and baseline run 45313009678/source 051a334 published matching sealed foundation f1244292…; actual app1/app0 boots went PENDING_VERIFY→VALID after health. Local SDK rollback rebooted prior heart and passed health/physical confirmation; reinstallation restored baseline/normal stones. Final max gap 77ms, minimum heap 216,280, Wi-Fi connected. Automatic crash/power-loss recovery is not claimed. Heart source clipping at maximum pulse is recorded; normal baseline behavior is confirmed.

- [x] Verify2.4GHz Hello World, real4MiB/two-slot layout, compiled image fit, heap/stack/frame/refresh behavior and verified HTTPS.
- [x] Native IDE initial installation/private provisioning, with retained credentials; no credential values published.
- [x] Preserve GPIO/brightness/double buffer/timer/frame parameters; move blocking SPI work out of timer ISR into refresh task.
- [x] Offline animation continuity, saved-credential reconnect and verified HTTPS.
- [x] Sealed known-scene publisher/workflow;79 offline tests, real builds, server digests/anonymous assets/feed readbacks and immutable history.
- [x] Install saved-heart over Wi-Fi, verify actual app1/version/deferred validity/health; user confirms heart, saved source clipping documented.
- [x] Install baseline over Wi-Fi, verify actual app0/version/deferred validity/health and normal physical stones.
- [x] SDK-gated manual rollback to prior heart; verify actual app1/version/health and physical return.
- [x] Reinstall published baseline after rollback, verify final app0/VALID/health and normal stones. Retain compatible prior heart and USB fallback source/images.

Actual evidence and limitations: device/verification.json, cloud/ota-publication-verification.json, run hardware-evidence directories and documentation.md. No model call/spending/Actions artifact/cache needed for these tests.

## Step 7A — Carry the proven OTA foundation into routine prompt delivery

This bridge is required before Steps 8–10 can deploy new prompts. November 26: the regular prompt and saved-response publication-test workflows now call the sealed builder/publisher. Local baseline/heart builds and package checks pass; earlier88 offline tests pass. Saved-response cloud run45858227133 on289ef02 passed with generation/publication skipped. New routine publication/physical confirmation remain pending. The Desktop helper remains on the old foundation; do not deploy it. New martin apple Wi-Fi is now verified connected; no rebuild was needed.

- [x] Adapt regular prompt build/publication to sealed runtime/protected-source/identity checks and schema2 compatible current/previous/recovery metadata (local implementation; cloud execution pending).
- [x] Use an existing saved response first; zero new model API calls/spending. Exact generation-record/function binding and pinned local compile passed: heart 1,012,080 bytes, headroom 298,640.
- [x] Preserve immutable history/recovery, compatible previous, exact source-commit/size/hash checks and failure behavior in the shared publisher; offline tests pass. No new live publication is claimed.
- [x] Verify a real routine-path package retains the foundation in cloud run45858227133:1,012,016bytes, same source/version/foundation, exact reported hashes and zero new model requests.
- [ ] Separately verify routine publication and controlled install/health when the new network is ready, keeping automatic delivery off. Reuse completed tests where code is unchanged.
- [ ] Keep manual update behavior until an explicit tested automation/acknowledgment design exists. Never report published as installed.

**Network complete, November26:** User privately provisioned martin apple. Fresh actual wifi_status3/RSSI-59, expected-name matchtrue and baseline/app0/SDK VALID/healthtrue verified through native Serial Monitor. No password received by assistant, no rebuild/upload/model call. Separate Gmail inbox selected; setup/live intake test next.

## Step 8 — Prepare the email input

**Start with your own test messages.**

November26: `email/Inbox.gs` and read-only manifest are ready;15 focused inbox/queue tests pass locally. The processor records jobs only and sends no email/build/device command. Live setup/authorization passed with record_only/zero triggers and a label-only approved-sender filter; live inline prompt exact hash and stable single-job replay are verified from user-supplied logs; unmarked-message nonacceptance also passed after Spam recovery; direct-reply exact prior-prompt hash also passed; no-context marker rejection also passed; planned manual intake checks are complete. `email/queue-simulation.cjs` verifies queue/status rules offline; it is not a live dispatcher. See `email/README.md`.

- [x] Implement local record-only intake, prompt/hash preservation, sender/thread binding, stable IDs, deduplication, capacity stops and manual setup guide.
- [x] Run focused offline inbox/queue-contract checks; no animation assessment or full firmware suite.

- [x] Dedicated Gmail inbox chosen; Lightboard label and label-only sender/subject filter created.
- [x] For this prototype, use subject `Lightboard` and put only the creative prompt followed by `%%%` in the message body. Disable automatic signatures in test messages.
- [x] Created Lightboard Inbox Apps Script project, loaded code/manifest and configured private approved sender.

Bring back this request:

> Create the Lightboard Apps Script inbox processor. Initially only validate and record matching emails; do not trigger builds. Extract the new body without quoted history or signatures, recognize a trailing %%%, assign a job ID, prevent duplicates, and accept only our initial test senders. Keep the exact prompt. A standalone marker needs a clear prior design in the same sender's conversation; otherwise report that the design is missing.

- [x] User ran setupInbox and authorized; actual configured/record_only/zero-triggers/completed observed at17:01:06Z November26.
- [x] Email one test prompt and confirm exactly one job is recorded; exact expected prompt hash matches supplied live inspection November26.
- [x] Run it again and confirm the same email is not processed twice; received0/duplicates2 and unchanged sole job ID/hash in before/after inspections November26.
- [x] Send a message without the marker and confirm it does not become a deployment job; after user marked test emails Not spam,1:04:28 run reports ignored3/received0/rejected0/duplicates2 November26.
- [x] Direct reply containing only %%% records the earlier vessel prompt with exact expected hash; supplied1:06:52 process and1:07:15 inspection show one new job, two total.
- [x] A newly composed standalone %%% without direct-reply context creates no job; supplied1:13:40 live result received0/rejected1/duplicates6. Durable reason not separately inspected.

**Step8 planned manual checks complete November26:** inline prompt/hash, replay, unmarked ignore, direct-reply prompt/hash and no-context rejection passed. Wider edge cases remain covered locally; not all envelope cases were live-tested. This step triggers no firmware builds. Continue Step9 with delivery disabled.

## Step 9 — Connect email to the tested cloud workflow

**Latest completed November26:** Manual email→queue→bound build→exact-rebuild publication45891588901→native-IDE Wi-Fi install and app1/SDK VALID/health/heart-like scene all passed. No new model request. Queue remains published/deviceConfirmedfalse until authenticated device reporting and release are implemented; no triggers/replies/automatic install yet. See RESUME.md for current board/source/evidence; do not repeat passed controlled tests.


**Latest publication phase:** Separate queue publication implemented/tested locally (45 focused checks) but not pushed/installed/run. It rebuilds saved heart, refuses any image mismatch with prior verified build, preserves original build/config/receipt, reserves one publication and verifies feed plus four release digests. Holds queue published/unconfirmed; no new generation, automatic device reporting or installation. Next email/queued-publication.md handoff; manual native-IDE OTA/status after publication passes.


**Complete the automation.**

**November26 checkpoint:** Queue.gs now implements durable per-job storage, checksum-bound immutable receipt references, FIFO, shared-lock/capacity controls and one-in-flight/revisioned transitions.15 focused local checks pass; actual Google installation/persistence also passed from supplied second-run log at1:25:37PM (see email/queue.md). No dispatch/trigger/model/publication/device operation has been enabled. Manual saved-heart GitHub adapter and workflow job/attempt/prompt/run/commit/result binding are now implemented/tested locally; source push/private setup/live dispatch remain pending. See email/github-setup.md.

- [x] Implement/test durable queue storage and internal transition rules locally, separately from the older offline simulation.
- [x] Installed separate Queue file; user ran setupQueue and syncQueue twice. Supplied second execution1:25:37 shows imported0/jobs2, same IDs/hashes/order, revision1/attempt0, null in-flight and dispatch disabled. First-run log not captured; no repeat needed.
- [x] Implement/test local workflow inputs/results and manual saved-build adapter bound to queue job ID, dispatch attempt, exact prompt hash, run and source commit;39 focused checks pass.
- [ ] Push source, update private Queue/GitHub files/manifest and run read-only setupGitHubConnection with privately stored credential.


Bring back this request:

> Connect the tested Apps Script email jobs to the manual Lightboard workflow. Use a narrowly scoped credential to dispatch only the intended repository workflow, store it in Script Properties, and implement a persistent queue with at most one in-flight update for the board. Add received, building, published, device-confirmed, failed, and quota-paused statuses. Keep email replies accurate and prevent duplicate or overlapping delivery.

- [ ] Create the required repository credential with only the permissions the dispatcher needs. GitHub fine-grained Actions:write is repository-scoped, not single-workflow-scoped; enforce the workflow allowlist in the adapter. Store the credential privately; keep it out of `.gs`, repository, logs and chat.
- [x] Test dispatch manually from Apps Script with one known saved prompt; run45886859649/source88eac47 passed and poll bound exact job/prompt/result2:54:39 November26, modelRequests0/publishedfalse/deviceConfirmedfalse. Publication/device/acknowledgment remain pending.
- [ ] Confirm the build uses that exact prompt, publishes only a successful candidate, and keeps the one-board queue until device confirmation or a defined failure/timeout.
- [ ] Add a time-driven trigger for the processor in Apps Script. Start with a five-minute polling interval and verify its runtime fits the account's quotas; it is not an instant-arrival email trigger.
- [ ] Send a new test email. Confirm a received acknowledgment, cloud job, publication, and eventual device confirmation.
- [ ] Confirm a queued or published update is described accurately while the board is offline. Do not send an installed-success message until the device reports the running version.

**Done when:** One email completes the full process and produces a truthful result. Quota exhaustion pauses work rather than switching to paid usage.

[Apps Script time-driven triggers](https://developers.google.com/apps-script/guides/triggers/installable), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

## Step 10 — Try it with your computer off

- [ ] Turn your computer off while leaving the board powered and on Wi-Fi.
- [ ] Ask one invited participant to email a new prompt ending in `%%%`.
- [ ] Confirm that their prompt reaches the physical panel, then judge the animation on the actual LEDs.
- [ ] Send two prompts close together and confirm they are processed in sequence.
- [ ] Test a disconnected board, a rejected build, and the previous-scene restore procedure. A failed job must not be reported as installed.
- [ ] Record the observed turnaround time. Include email polling, generation, compilation, download, and restart.
- [ ] Check the service usage dashboards and confirm no extra spending. If limits are reached, wait or reduce the request rate.
- [ ] Write the short operating and recovery instructions. Update the standing agent or skill only when you request that change.

**Done when:** An invited participant's email reaches the physical panel while your computer is off, continuous display behavior is preserved, recovery works, and the pilot stays within free allowances. Creative refinement is separate and can follow the infrastructure work.

## First session checklist

- [x] Back up the two Desktop folders — verified in `backups/2026-11-06/`.
- [x] Record the board and target Wi-Fi details in `hardwareRecord.md` — physical label, software profile/core, visual behavior, and target SSID are recorded; actual connectivity remains a Step 7 test.
- [x] Open AI Studio and test a published free-tier model — Gemini 3.8 Flash playground works; free project/key setup is complete and Flash-Lite API generation passed. Lite creative review remains pending.
- [x] Generate and save the three examples using the Step 2 brief.
- [x] Complete local preview, code review, and compilation of the saved examples. User accepted creative quality on November 9; the future brief now explicitly allows expressive per-pixel brightness.

The new system is not complete until the final physical test passes. Model selection, service eligibility, firmware capacity, update delivery, and input reliability each have their own checkpoint so a failure can be fixed at the right step.

## Reference for free model access

Google's current getting-started and billing documentation describes API keys and free-tier projects. The exact available models and limits must be checked in your account when you begin. [Get started](https://aistudio.google.com/docs/get-started), [Gemini billing](https://ai.google.dev/gemini-api/docs/billing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).
