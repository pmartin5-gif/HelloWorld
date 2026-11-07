# Lightboard remote prompting step by step

**Updated:** November 6, 2026

**Status:** Paused at the user's request. Read `RESUME.md` before continuing. The next decision is which Google account to use after AI Studio rejected project creation in the SVA account.

**Goal:** Email a prompt, generate and compile an animation in the cloud, and have the ESP32 install it over Wi-Fi while your computer is off.

**Budget:** Zero additional spending. Stay on verified free allowances. When a limit is reached, pause or queue requests. Do not enable paid fallback or use a time-limited paid trial as the long-term solution.

**Starting point:** We have a working Lightboard and saved instructions. The new cloud scripts, GitHub workflow, email processor, and OTA firmware still need to be written. This guide tells you which steps you can do yourself and gives you a specific request to bring back for each coding step. Checkmarks reflect recorded progress; later implementation steps remain unchecked.

## How to use this plan

Work through the steps in order. Finish the stated checkpoint before continuing. Start with Steps 1–3; those establish whether the replacement model is worth using before we connect the full system.

Email is the proposed first interface for this walkthrough. A form can replace the email portion later. Normal operation will be wireless, but initial Wi-Fi and update provisioning requires a USB connection.

Working folder:

`/Users/pmartin5/Documents/GitHub/HelloWorld/Week-8/LightBoard_Prompter`

Repository root:

`/Users/pmartin5/Documents/GitHub/HelloWorld`

## Work possible without being at the board

**Planning update:** November 7, 2026. The project remains paused until the user asks to resume implementation.

The next software milestone can be an email or form prompt producing a validated, compiled, downloadable firmware update while the ESP32 is unavailable. Account access and free service allowances must still be verified before enabling any service.

- Resolve free API account access and quotas, and review the saved model previews remotely.
- Prepare and test the cloud compiler and generation integration from Steps 4–5.
- Prepare firmware publication and its version manifest from Step 6.
- Write and compile a separate Wi-Fi/OTA firmware candidate from Step 7, measuring its compiled size without flashing it.
- Build and test email intake, deduplication, queuing, acknowledgments, and workflow dispatch from Steps 8–9. Use a simulated device for version checks, offline behavior, timeouts, and acknowledgment tests; keep real deployment disabled.

Physical hardware is required to verify flash capacity and installed partitions, Wi-Fi association and authentication, runtime heap and frame timing, the displayed animation, actual OTA installation, and recovery. A simulated acknowledgment must never be reported as installation on the real board.

The user's personal presence is not always required. If the ESP32 is already connected by USB to the accessible Mac, an initial upload could technically be operated remotely through Arduino IDE when authorized. Someone onsite may still be needed to connect cables, provision or troubleshoot networking, observe the LEDs, reset power, or recover a failed installation. If no USB or previously installed OTA path is available, initial installation requires physical access.

The current Google project-creation rejection is an account/service blocker, independent of physical access to the Lightboard. Baseline compilation and local component development can be prepared while that blocker is resolved. Steps 7's live tests and Step 10's physical pilot remain hardware-dependent.

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
- [ ] Tested **Gemini 3.8 Flash** (`gemini-3.8-flash`) in the playground and checked published free-tier pricing. User approved free project/key creation, but Google rejected it in the current SVA account: “Project creation is disabled.” API eligibility and quotas await resolution or an approved account change. See `modelVerification.md`.
- [x] Playground tests used **No API key selected**, with optional tools off. No billing, payment method, upgrade, paid key, project, or credential was enabled or created. Any later API project must have paid billing disabled.
- [x] Checked published free-tier data-use information and used only the generic brief, non-sensitive creative examples, and correction feedback. No Wi-Fi password or live project files were uploaded.
- [x] Submitted the brief in a text/code playground chat and generated C++ drawing code.
- [x] Saved the three final functions, exact prompts, settings, rejected attempts, and correction records under `experiments/model-verification/2026-11-06/`. Live sketch unchanged.

### Generation brief to copy

```text
Generate Arduino C++ drawing code for an existing physical 32x32 ESP32 LED panel.

Return exactly one function:
void restState(unsigned long now)

An existing global PxMatrix display object named display is available. Use now for animation timing. Put all additional constants, arrays, structs, persistent state, and lambdas inside this function. Do not add includes, other global declarations, setup, or loop.

Use basic Adafruit GFX style drawing operations on display, such as fillScreen, drawPixel, drawLine, fillRect, drawCircle, fillCircle, and color565.

Interpret the prompt through ONE central visual or emotional idea. Use bold readable shapes, saturated colors, pronounced movement, and intentional black space. Design for a physical LED grid and its glow. Avoid tiny detail, muted gradients, clutter, and illustrating every phrase. Preserve the requested emotional tone; an unresolved feeling should stay unresolved.

The animation runs indefinitely. Keep per-frame work bounded and state modest and fixed-size. Avoid long-running floating-point time drift. The current firmware renders this scene continuously. Clear and paint the hidden drawing buffer each frame.

Do not use delay, dynamic allocation, serial, networking, filesystem access, hardware initialization, refresh changes, brightness changes, timer changes, or buffer swapping. The existing loop handles display refresh and buffer swaps. Do not call showBuffer.

The existing firmware uses ESP32 Arduino core 2.0.17. Keep the code compatible with that foundation. Return only the function code.

Creative prompt: A lighthouse sweeping one clear beam across a dark sea.
```

- [x] Generated the overflowing-heart example in a fresh chat using the same brief.
- [x] Generated the unresolved-figure example in a fresh chat using the same brief.

**Step 2 status:** Playground examples and records are complete. Free project/key creation is approved but blocked by Google in the SVA account. Await the user's account choice; API eligibility and quotas remain unverified. No billing or paid service has been enabled.

## Step 3 — Preview and compile those examples

**Coding and review step with the assistant.**

Bring back this request:

> Review my three Gemini candidates in LightBoard_Prompter. Use the existing preview helper where supported, validate the restState boundaries, and compile against an isolated copy of the pinned working firmware. Keep the live sketch unchanged and do not upload. Show me the previews and compile results.

- [x] Generated and inspected all three contact sheets. Recorded creative concerns in `modelVerification.md`; user creative approval is still pending.
- [x] All three final candidates pass function-boundary and protected-source checks and compile locally using ESP32 core 2.0.17 and the archived board options. No uploads performed.
- [x] Stayed within the correction limit: lighthouse 1, heart 1, figure 2. Preserved the failures and model-generated corrections.
- [ ] Choose a candidate model only when its results are acceptable. Use later physical tests to confirm movement and LED quality on the real board.

**Done when:** The model produces acceptable reviewed examples that compile against the preserved foundation. If it cannot, try another verified free model before building the rest of the integration.

## Step 4 — Build the existing sketch on GitHub

**First prove cloud compilation with a known working scene.**

Bring back this request:

> Create a manual GitHub Actions build for the approved Lightboard baseline. Keep project code under Week-8/LightBoard_Prompter, pin the current ESP32 core and libraries, and compile a known working scene without model generation or deployment. Use a standard Linux runner and keep storage within free allowances. Prepare the files for review before publishing them.

- [ ] Confirm whether the existing `HelloWorld` repository is public or private. Standard hosted runner compute is free for public repositories; private repositories have included allowances. Check storage separately and block paid overages if the account supports them. If a reliable zero-charge setup cannot be established, stop and revise the service choice.
- [ ] Review only the Lightboard changes. Keep unrelated changes elsewhere in `HelloWorld` out of this commit.
- [ ] Put the workflow under the repository root's `.github/workflows/`, not inside the nested LightBoard_Prompter folder. The workflow should target only this project.
- [ ] After the reviewed workflow is committed and pushed to the default branch, open the repository on GitHub, select **Actions**, select the new workflow, and click **Run workflow**.
- [ ] Confirm a successful compile and download the resulting firmware artifact. Give test artifacts short retention and avoid growing caches without a limit.

**Done when:** GitHub builds the known sketch with the pinned toolchain. No board connection is involved.

GitHub documents the free-runner distinction and the default-branch requirement for manual workflows. [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Running a workflow manually](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## Step 5 — Generate and compile from a manually entered prompt

**Now connect the free model API.**

- [ ] In AI Studio, open the API keys page and create or select a key for the verified free-tier project. Keep paid billing disabled.
- [ ] On GitHub, open the repository's **Settings → Secrets and variables → Actions → New repository secret**. Name it `GEMINI_API_KEY` and paste the key there. Keep the key out of source files, documentation, chat messages, and the board firmware.

Bring back this request:

> Add Gemini generation to the manual Lightboard workflow. Load the saved creative brief, accept a prompt as workflow input, restrict changes to restState, validate and compile the candidate, and retain the original prompt and build result. Limit correction attempts, serialize jobs for one board, and stop on free-tier exhaustion. Do not deploy yet.

- [ ] Run the workflow with one of the three reviewed prompts.
- [ ] Confirm the output includes a compiled candidate and an accurate result.
- [ ] Check that a rejected candidate or failed compile cannot proceed to publication.

**Done when:** A prompt entered in GitHub produces validated, compiled firmware without running anything on your computer.

[GitHub's instructions for repository secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

## Step 6 — Make approved firmware downloadable

**Prepare delivery before changing the board.**

Bring back this request:

> Add a firmware publication step and a small version manifest to the Lightboard workflow. Propose a verified free download route, such as public GitHub release assets if suitable for this repository. Include version, checksum, and firmware location; retain the previous approved version and keep credentials out of published files. Prepare the changes without enabling device updates.

- [ ] Confirm which source, firmware, logs, and prompt contents would be publicly visible with the selected route. If the repository is private, resolve device access without embedding a broad GitHub token in the ESP32.
- [ ] Open the manifest and firmware download link from another device. Confirm the links work with the intended access level and can support ESP32 HTTPS downloads.
- [ ] Confirm failed builds leave the last working publication available.
- [ ] Ensure published firmware will use separately provisioned Wi-Fi credentials rather than compiling the network password into a publicly downloadable binary.

**Done when:** The delivery route is verified, within free allowances, and ready for a controlled device test. Publishing is not yet proof that a board installed anything.

## Step 7 — Add Wi-Fi and install the first OTA-capable firmware

**Hardware step with the assistant. This extends the protected firmware foundation once.**

Bring back this request:

> Prepare a development copy of the Lightboard firmware with Wi-Fi and OTA updates. Preserve the current continuous animation behavior, pins, timing, brightness, and double buffering. Verify flash partitions and memory with the pinned toolchain. Keep networking and update support outside generated restState. Include trusted update verification, version reporting, separately provisioned credentials, and a tested USB recovery procedure. Prepare and review the code before the initial installation.

- [ ] Verify that MFA IxD supports the board's Wi-Fi band and authentication, including any extra browser/enterprise login, then verify actual flash capacity and the installed partition layout. Compile the networked build to measure image size and measure runtime heap during the controlled hardware test before enabling automatic OTA.
- [ ] Connect the ESP32 to your computer by USB for the initial installation and credential provisioning. Arduino IDE may be used for this one-time setup in the current environment.
- [ ] Check that it connects to Wi-Fi, displays the known scene, and reports its current version.
- [ ] Confirm the continuous animation, brightness, refresh, and frame timing are preserved. Buttons and face effects have been removed from the current foundation.
- [ ] Disconnect internet access temporarily and confirm the installed animation continues.
- [ ] Publish a second known scene through the controlled test path. Confirm that the board downloads, installs, restarts, and reports the new version.
- [ ] Restore the previous known scene and confirm recovery works. Do not assume automatic crash rollback exists unless we explicitly configure and test it.

**Done when:** Two known scenes can be delivered over Wi-Fi and the original physical behavior still works. Keep automatic model-generated delivery disabled until this checkpoint passes. All later firmware images must retain OTA support.

[Espressif's OTA guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/ota.html).

## Step 8 — Prepare the email input

**Start with your own test messages.**

- [ ] Choose a dedicated Gmail inbox or a dedicated `Lightboard` label in an account you control.
- [ ] For this prototype, use subject `Lightboard` and put only the creative prompt followed by `%%%` in the message body. Disable automatic signatures in test messages.
- [ ] Open [Google Apps Script](https://script.google.com/) and create a project named `Lightboard Inbox`. The code for it still needs to be written.

Bring back this request:

> Create the Lightboard Apps Script inbox processor. Initially only validate and record matching emails; do not trigger builds. Extract the new body without quoted history or signatures, recognize a trailing %%%, assign a job ID, prevent duplicates, and accept only our initial test senders. Keep the exact prompt. A standalone marker needs a clear prior design in the same sender's conversation; otherwise report that the design is missing.

- [ ] Add the reviewed script, run its initial setup function, and review Google's requested account permissions.
- [ ] Email one test prompt and confirm exactly one job is recorded.
- [ ] Run it again and confirm the same email is not processed twice.
- [ ] Send a message without the marker and confirm it does not become a deployment job.

**Done when:** The inbox processor reliably identifies one intended prompt per job and leaves other messages alone. This step does not trigger firmware builds yet.

## Step 9 — Connect email to the tested cloud workflow

**Complete the automation.**

Bring back this request:

> Connect the tested Apps Script email jobs to the manual Lightboard workflow. Use a narrowly scoped credential to dispatch only the intended repository workflow, store it in Script Properties, and implement a persistent queue with at most one in-flight update for the board. Add received, building, published, device-confirmed, failed, and quota-paused statuses. Keep email replies accurate and prevent duplicate or overlapping delivery.

- [ ] Create the required repository credential with only the permissions the dispatcher needs. Store it through the script's setup process; keep it out of the `.gs` source and the repository.
- [ ] Test dispatch manually from Apps Script with one known prompt.
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

**Done when:** An invited participant's email produces an acceptable animation while your computer is off, the current continuous display behavior is preserved, the recovery path is usable, and the pilot stays within free allowances.

## First session checklist

- [x] Back up the two Desktop folders — verified in `backups/2026-11-06/`.
- [x] Record the board and target Wi-Fi details in `hardwareRecord.md` — physical label, software profile/core, visual behavior, and target SSID are recorded; actual connectivity remains a Step 7 test.
- [x] Open AI Studio and test a published free-tier model — Gemini 3.8 Flash playground works; API account verification pending.
- [x] Generate and save the three examples using the Step 2 brief.
- [x] Complete local preview, code review, and compilation of the saved examples. User review of creative quality remains pending.

The new system is not complete until the final physical test passes. Model selection, service eligibility, firmware capacity, update delivery, and input reliability each have their own checkpoint so a failure can be fixed at the right step.

## Reference for free model access

Google's current getting-started and billing documentation describes API keys and free-tier projects. The exact available models and limits must be checked in your account when you begin. [Get started](https://aistudio.google.com/docs/get-started), [Gemini billing](https://ai.google.dev/gemini-api/docs/billing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).
