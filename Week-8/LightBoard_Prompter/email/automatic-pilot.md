# Automatic email to the Lightboard

**Current intake policy, November26:** Any sender may submit with subject **Lightboard** and a plain-text creative body. No `%%%` marker or Gmail label is required. Live activation5:14:26PM returned acceptsAnySendertrue/markerRequiredfalse/labelRequiredfalse; continuous inspection5:14:58PM confirms active and waiting with original cutoff/history. Code.gs and Automatic.gs are already saved live; no setup, push, new permission or board upload is needed. Old ignored/rejected receipts are preserved. Terminal `%%%` remains optional for compatibility.

**Continuous intake is live.** On November 26, `startContinuousEmail` returned `waiting_for_new_email`, `automaticEmailProcessing:true`, `mode:"continuous"`, with a fresh-email cutoff of **2026-11-26T21:37:15.039Z**. The existing first-email pilot was preserved. No new board firmware, cloud workflow, key, token, permissions or billing setup was needed for this upgrade.

The first unattended email completed [run45895333330](https://github.com/pmartin5-gif/HelloWorld/actions/runs/45895333330), installed a new image automatically, passed boot health/SDK VALID, and the user confirmed “it changed”. A later normal-use email published in [run45901920176](https://github.com/pmartin5-gif/HelloWorld/actions/runs/45901920176), and the scheduler returned to waiting; that later image was not separately physically inspected. The current any-sender/markerless policy passed23 focused intake/scheduler checks. No repeat live test/model request is required to begin using it.

## Send a prompt

Send a new email from **any address** to **ixdbot.beepboop@gmail.com**, subject **Lightboard**, with your creative description in the body:

```text
A bright blue wave slowly crossing a black background
```

The email must arrive after the existing continuous cutoff and be outside Spam/Trash/Drafts. Intake searches subject-matching messages directly, so the old sender-specific Gmail label/filter cannot block new senders. Exact subject and existing plain-text/body limits remain. No processInbox, syncQueue, workflow dispatch, publication or install commands are needed for each email.

**Email → Gemini writes animation code → compile → publish → ESP32 installs it.** Gmail polling runs about once a minute; generation and compilation take additional time, and the board polls about once a minute. A stale older raw feed delayed the first installation by several minutes. Allow for that delay. Mac and Arduino IDE need not stay open; the ESP32 needs power and Wi-Fi.

The same existing Gemini free-project key is reused with billing disabled. Each new email generates one response without automatic retries, corrective generations or paid fallback. The current public GitHub workflow carries the creative prompt; use ordinary creative descriptions, without private data or credentials. The standing creative instructions are [generationBrief.md](../generationBrief.md).

## When more emails arrive

New email receipts are recorded while an earlier build runs. The oldest unhandled eligible receipt starts next, with only one build dispatched at a time. After each successful publication, the timer stays active and waits **six minutes before starting another build** to allow for feed propagation/download/boot. Emails sent during that interval wait automatically. A durable publication marker prevents that same email from generating again if a timer repeats or a status update is interrupted. Original receipts and the historical saved-heart queue remain unchanged.

This delivery interval is not a report from the board. Device reporting is deferred, so an offline board may miss an intermediate image if later images are published before it reconnects. Compilation and existing code/TLS/image-size/hash/slot checks remain essential stages. There is no full test suite, visual preview or artwork assessment per prompt.

If generation, compilation or publication fails, quota is exhausted, or a dispatch result stays uncertain for 30 minutes, processing pauses with the reservation intact. Do not resend the POST or reset receipts. Inspect that specific failure before resuming. No autonomous retries or paid upgrade will occur. Property/service capacity is bounded by the existing Apps Script storage guard; broader recovery and retention are backlog items.

## Progress and controls

- [GitHub workflow](https://github.com/pmartin5-gif/HelloWorld/actions/workflows/lightboard-email-pilot.yml): open the latest run and **email-to-panel** to inspect generation, compile and publication logs. The old workflow name still says pilot; it is reused unchanged.
- **inspectEmailProcessing** in Apps Script: logs metadata only, including active job/run URL, `lastPublished`, or `nextBuildAfter` during the delivery interval. `deviceConfirmed` remains false because no device reporting channel is implemented. Green GitHub status confirms publication; the panel changing confirms actual delivery.
- **stopEmailProcessing**: stops this handler's timer and preserves all receipts/reservations. It cannot cancel an already dispatched build or turn off the board's saved automatic setting.
- **startContinuousEmail**: starts/resumes intake and ensures one minute timer. Repeating it preserves the continuous cutoff and completed markers. An unresolved/failed reserved job is held for inspection rather than discarded or resent.
- **auto-off** / **auto-on** in native Arduino Serial Monitor: control the board's persistent automatic setting. Already ON; do not repeat for normal use.

The first continuous activation archived the completed old pilot under private `LB_EMAIL_FIRST_PILOT`; completed new publications use `LB_EMAIL_PUBLISHED_<jobId>`. The handler configuration remains `LB_EMAIL_PILOT` for compatibility. These keys contain provenance, not installed acknowledgment. Do not delete them to restart processing.

## Source updates and restoration

The current handler is already saved in live Apps Script **Automatic.gs** and activated. No push was necessary because the cloud workflow and sealed runtime are unchanged. Canonical local files can be committed normally. If deliberately pushing later changes to remote main, do not push during an active build; afterward run **startContinuousEmail** when no job is reserved. It verifies the same workflow/foundation lock and refreshes its source pin without resetting the cutoff or completed receipts. Otherwise a changed main source pauses fresh dispatch.

For restoration only: live **Code.gs** comes from [Inbox.gs](Inbox.gs), and live **Automatic.gs** from [Automatic.gs](Automatic.gs). Save both matching versions. Run **enableSubjectOnlyIntake** to apply the current sender/marker policy; use **startContinuousEmail** if the timer needs starting. Keep Diagnose, Queue, Github and [appsscript.json](appsscript.json) unchanged. Existing script.scriptapp/Gmail-readonly/external-request permissions suffice. Do not add the local GitHub backup as another live script. Do not rerun setupInbox or wipe script properties.

**Do not upload the visible Arduino sketch:** it is the preserved heart bootstrap at `/Users/pmartin5/Documents/Arduino/LightboardEmailAuto_20261126/LightboardOTA/LightboardOTA.ino`, not the current emailed image. It was installed once to enable automatic updates. The last physically confirmed scene was `ota-pilot-f502bdd7ce31e531e7b2a28f`, foundation `a529d5f9a72ca4858e0ab09ae66ec5eaecff656fdeb6d6a4f040e40633959ec1`; a later scene f656554c1ddf5347d84eb397 has since been published, without a separate board observation in this policy change.

Authenticated reports, fuller queue/release machinery, replies, general failure recovery, comprehensive regression and creative review remain deferred. Existing publisher safeguards, exact foundation transition history, pinned toolchain and download verification remain in place. The Node20 setup-action annotation in the successful run was nonfatal; no toolchain upgrade is needed to address the first-delivery result.

References: [Google installable time triggers](https://developers.google.com/apps-script/guides/triggers/installable), [GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [Gemini free-tier pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite).
