# Prompt experiments on the actual Lightboard

The lab lets the owner edit Gemini's standing instructions and a creative prompt, send one experiment through the existing generation/build/publication path, and judge it on the real panel. There is no animation preview or separate model-generated substitute for the panel. Model, key, pinned toolchain, sealed runtime and OTA download/boot checks are reused.

## Setup status

Implementation commit `77e702d` is pushed and verified. The matching scheduler, server and HTML are saved in the existing Apps Script project. Web app Version1 is deployed as the bot owner with access **Only myself**. Owner sign-in and the real deployed form check are complete; no new model request or board update has been made while building the lab. The private deployment URL is kept in local ignored evidence and supplied directly to the owner.

- Existing workflow: optional `generation_brief` input. Empty uses the standing file byte-for-byte. An experiment freezes its edited brief and exact SHA before generation and binds the same file at generation, compilation and result recording.
- Existing **Automatic.gs**: updated matching workflow hash, isolated lab receipts and testing-mode selection. Do not install this ahead of the workflow push.
- Add server script **PromptLab.gs** from [PromptLab.gs](PromptLab.gs).
- Add HTML file **PromptLabPage.html** from [PromptLabPage.html](PromptLabPage.html). Use that distinct name; the server loads PromptLabPage.
- Code/Inbox, Queue, Github, Diagnose and the manifest stay unchanged. Existing Gmail-readonly/external-request/timer authorization and stored token/key suffice.
- Deploy as a **Web app**, executing as the bot owner, with access **Only myself**. The lab is an owner control panel. Keep its URL private; do not select public/anonymous access. No credentials are sent to the HTML.
- After a deliberate source update, refresh the scheduler source pin with startContinuousEmail when no job is reserved.

## Existing rejected email

Run45905216109/job140200232089 failed at Validate animation code boundary: unsupported function esp_random. Compile, publish and final result steps were skipped; no publication occurred from that run. On November26 at5:46PM, continueAfterRejectedBuild verified and archived this rejection without retrying the email, refreshed the source pin and restored active continuous processing with no reserved job. The lab's **Continue after rejected build** verifies the original run/binding, a validation or compilation failure and an explicitly skipped publication step, then archives a rejection marker before releasing it. It does not regenerate the old email. A failed/uncertain publication is not released through this control.

## Using the lab

1. Open the private deployed lab while signed into **ixdbot.beepboop@gmail.com**. If a browser with several Google accounts shows Page Not Found, use an Incognito/private window signed into only this account; [Apps Script does not support multi-login](https://developers.google.com/apps-script/guides/support/troubleshooting).
2. Name the version and enter a test prompt. Reuse a prompt while varying instructions to compare interpretation.
3. Edit the standing instructions in the page. Keep one `{{creative_prompt}}` placeholder. **Exact request Gemini will receive** shows the combined text. These edits belong to this experiment; they do not edit the ordinary email brief in GitHub.
4. Click **Send to Lightboard**. This saves one immutable experiment and switches to testing mode. A build already underway finishes first; new email jobs wait while you test. A repeated/lost browser response reuses the same experiment ID, rather than generating twice.
5. Follow **Open build progress**, then watch the actual Lightboard. Compilation/publication and the feed delivery interval take several minutes. A published result means available firmware, not an authenticated installation acknowledgment.
6. Save observations beside that version: tone, shape, color, brightness, timing and movement. Select a past version to load its instructions/prompt; editing it creates a new experiment when explicitly sent. Download an experiment as JSON if useful.
7. Click **Resume email processing** when finished. Testing mode remains selected until this control is used, so outside email does not overwrite experiments while you judge them. An unfinished experiment must be completed or its confirmed pre-publication rejection resolved first.

One experiment may be pending at a time. The existing six-minute interval after publication is retained. Holding/testing mode is not a device acknowledgment. The powered ESP32 needs Wi-Fi; Arduino IDE and the Mac are not required during normal cloud-to-board delivery. Never Upload the visible bootstrap sketch to test an experiment.

## Boundaries

Each explicit experiment sends one Gemini3.5Flash-Lite request through the existing free-project key, with billing disabled/no automatic retry/paid fallback. This does not make generation unlimited; service quota failures pause normally. The public GitHub workflow receives the creative prompt and edited brief, as with existing creative email builds; use ordinary creative material.

Prompts/instructions/observations stay as private experiment records in the Apps Script project; only the existing publisher's firmware assets/feed are released. Existing history/storage limits remain. The HTML receives no API key or GitHub token. UI status never fabricates a device report, and observations are personal notes, not queue installation events. Full regression and creative-quality tests are not run on every experiment.

Focused checks cover brief freezing/default compatibility/tampering, lab/email isolation, duplicate sends, experiment history and notes, and truthful pre-publication rejection release. The interface was inspected locally without dispatching. The private deployment and live form check are complete: standing instructions loaded (2,417 bytes), email processing active, empty experiment history and blank prompt with Send disabled as expected. No experiment was submitted during verification. A live edited-brief generation/install remains unverified until the user sends an experiment.

References: [Apps Script web apps](https://developers.google.com/apps-script/guides/web), [HTML server calls](https://developers.google.com/apps-script/guides/html/communication), [HTML restrictions](https://developers.google.com/apps-script/guides/html/restrictions).
