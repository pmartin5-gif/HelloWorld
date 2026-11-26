# One email to the Lightboard

The immediate milestone is one **new email → Gemini → compile → publish → automatic ESP32 installation**, without per-email commands. Device reporting, queue release, replies, general recovery and creative review are backlog items. The existing saved-heart queue and all its historical receipts remain unchanged.

**Current handoff, November 26:** Board bootstrap and `auto-on` are already complete; do not repeat step 2. Wi-Fi and healthy boot were observed. GitHub push, Apps Script installation/authorization and the first fresh email remain pending. No new generation request has been sent yet.

## One-time setup

1. Push the implementation commit to `main`. There is no new secret or token to create. The existing private `GEMINI_API_KEY` remains the Gemini free-project key with billing disabled, and `LB_GITHUB_TOKEN` remains in Apps Script. Keep billing disabled; there is no retry or paid fallback.
2. Bootstrap the automatic-capable firmware once with native Arduino IDE from `/Users/pmartin5/Documents/Arduino/LightboardEmailAuto_20261126/LightboardOTA/LightboardOTA.ino`. The stage preserves the saved heart and the pinned core/profile/libraries/partition layout. Do not open an old pilot sketch for this step. Serial Monitor is 115200 / New Line. Enable `auto-on` once; `auto-off` disables automatic installation. Both persist through reboot. Never put a password or API key in the sketch.
3. In the existing **Lightboard Inbox** Apps Script project, add **one new script file named Automatic**, using [Automatic.gs](Automatic.gs). Keep Code, Diagnose, Queue and Github unchanged. Do not add the local backup as a script file.
4. Replace only `appsscript.json` with [the updated manifest](appsscript.json). Its new `script.scriptapp` scope allows creating/removing this project's minute timer; Gmail stays read-only and no mail-send scope is added. Save all files.
5. Select and run **startEmailPilot** once. Complete Google's authorization if prompted. Expected status: `waiting_for_new_email`, `automaticEmailProcessing:true`, `deviceConfirmed:false`. It pins the current main commit, checks the exact workflow/foundation lock, records a fresh-email cutoff and creates one minute trigger. Repeating start preserves the same cutoff/reservation; it does not rearm a completed run.
6. **After activation**, send one new email from the configured sender `pmartin5@sva.edu` to `ixdbot.beepboop@gmail.com`, subject **Lightboard**, with the new creative description followed by `%%%`. Example:

   ```text
   A bright blue wave slowly crossing a black background%%%
   ```

There should be no need to run processInbox, syncQueue, a build, publication, check, arm-update or install for that email. The existing Gmail filter must label it Lightboard and deliver it outside Spam, as in the intake checks. Google timers and GitHub scheduling add delay; allow several minutes for generation/build/publication, then about a minute for the board to notice the feed.

## What happens automatically

- The minute timer uses the existing intake reader, accepting the first valid email received **after startEmailPilot**. Old test emails and the old queue are not dispatched. Intake receipts still prevent duplicates.
- A single durable reservation is saved **before** the GitHub POST. Lost responses are reconciled with the unique run title; the POST is never repeated. One email pilot is active at a time, without building a broader queue system.
- `lightboard-email-pilot.yml` binds the exact prompt hash and source commit. It uses the existing free Gemini key, requests one new function without automatic corrections/retries/fallback, checks the code boundary, compiles, and uses the existing publisher's asset/hash/feed checks. There is no full test suite, visual preview, artwork scoring or Actions artifact/cache in each run. Re-running the GitHub run does not generate a second response (attempt 1 only).
- The feed marks this package `automatic_updates:true`. A board explicitly set to `auto-on` polls every 60 seconds after boot health passes. It requires the same sealed foundation, checks the candidate twice, verifies TLS/size/SHA-256/image integrity, writes the inactive slot and reboots. Health validation stays in the firmware. A saved attempted image hash prevents a reset/rollback/download failure from causing an endless reinstall loop. `auto-on` deliberately clears that attempt hold if a manual retry is needed.
- The Apps Script timer stops after this one publication (or a terminal workflow failure). It does not release the historical queue or claim device confirmation. The board keeps its saved auto setting and can finish installing even after the script timer stops.

The first new runtime publication permits only the exact previous heart manifest SHA `d67c09c2900be711160f05f588f7f384a896dba4e7c8f16ed4c3c1036934a667` as a foundation transition. Its full immutable manifest and assets remain preserved. The old runtime rejects the new foundation, so the one-time IDE bootstrap is necessary; no compatibility bypass is used. The old feed's image is not labeled compatible with the new runtime.

## Observe or stop

`inspectEmailPilot` shows metadata and the run URL without prompt/credentials. Success is `published_awaiting_visual_confirmation`; `deviceConfirmed` stays false because device reporting is deferred. GitHub success is publication evidence; the actual new image appearing on the panel establishes this milestone. `stopEmailPilot` removes only this pilot's timer and retains its receipt/reservation. It cannot cancel an already dispatched build or disable the board's saved auto setting; use `auto-off` in Serial Monitor for the latter.

If Gemini quota, generation, compilation, publication or installation fails, stop and inspect that specific stage. There is no second generation request or hidden paid fallback. After a lost dispatch response, wait for reconciliation; never dispatch again just because the POST response was missing. The timer holds after 30 minutes without a final result. This first-email mode does not automatically process another email after completion. Continuous intake, rearming, reporting/queue acknowledgment and recovery automation can follow after the milestone is observed.

References: [Google installable time triggers](https://developers.google.com/apps-script/guides/triggers/installable), [GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [ESP-IDF nonvolatile storage](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/storage/nvs_flash.html), [Gemini 3.5 Flash-Lite free-tier pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite) (rechecked November 26; account billing remains the existing disabled setup).
