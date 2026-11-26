# Controlled queue publication and manual board check

November26: publication source push independently verified on main33e405d67f108627d814fe229ff43efbab73df72; private update/setup and publication now passed live. Run45891588901 succeeded; native-IDE OTA then booted heart in app1/SDK VALID/healthtrue with retained Wi-Fi. User observed heart-like animation. Manual hardware evidence is complete, authenticated queue-device reporting remains pending. Do not repeat these passed steps. The saved heart build45886859649 is verified built, with zero model requests and no publication. This phase publishes only an identical rebuilt image and keeps installation manual.

## Push and install two matching files

Push prepared main from the user's working Terminal (`git push origin main`), then keep the full pushed commit from `git rev-parse HEAD`. Do not start either workflow through GitHub's Run workflow button. The new publication workflow is separate from the completed build workflow and must receive the saved queue binding.

In the existing private Apps Script project, replace these two files completely and Save each:

| Apps Script file | Local canonical source | First declaration |
| --- | --- | --- |
| Queue.gs | email/Queue.gs | const LBQ |
| Github.gs | email/GitHub.gs | const LBGH |

Clearly named copies are also prepared in `.build/email-intake-2026-11-26/restore/Queue.gs` and `restore/Github.gs`. Github also defines LBPUB once for the publication adapter. Code.gs remains the intake source and Diagnose.gs remains the small diagnostic source. Do not paste either update into those files. Keep backup scripts outside the live Apps Script project.

No manifest, token or permission change is needed. Keep all original receipts/queue records and LB_GITHUB_ACTIVE/LB_GITHUB_SETUP intact; the completed build keeps its old source88eac47 pin. Add **LB_PUBLICATION_SETUP** privately in Script Properties:

```json
{"sourceCommit":"THE_FULL_NEW_PUSHED_COMMIT"}
```

The publication pin is separate. Keep GitHub main unchanged through setup/publication because the existing publisher verifies main before modifying the feed.

## Configure, publish once, then poll

Run **setupPublication**. It performs read-only checks: new source/workflow/helper hashes, original successful build run/step result, and exact stored result checksum. It saves separate configuration and returns configured/manual_saved_publication with dispatchSentfalse. It preserves the original build, private credential and immutable email receipt. Re-running preserves its configuration.

After setup succeeds, run **publishApprovedBuild** once. It reserves a separate publication attempt on the same heart job before POST. It never requests new generation. Original build run/commit/result checksum remain unchanged. Expected result is publishing with a URL or publication_unknown/nextActionpollPublication. Both mean use **pollPublication**, never reset/reissue the reservation or click GitHub Re-run jobs. Setup itself does not publish; this explicit manual function launches the controlled publisher.

One fresh compile is necessary because the original job retained no binaries. The new workflow independently fetches the prior verified result, checks its exact digest/job/prompt/run/commit/saved response, reuses the same42735010470 response, and compiles with existing protected-source/toolchain/recovery gates. It retains the original compiler work path before moving the resulting package, avoiding differences from embedded source-file paths. Before any publication, the candidate's version, foundation, byte count and SHA must match that prior build exactly. A mismatch stops rather than silently publishing a different image. No aesthetic check, new model request, Actions artifact/cache or regression suite is added to routine runs.

The unchanged sealed publisher preserves the previous compatible firmware and immutable release history, uploads/verifies four assets, reads exact bytes anonymously, and updates the guarded feed. A dedicated result records prior/new job/run/attempt/source bindings and all asset hashes/sizes. Unknown/partial failure stays unconfirmed and is never described as unpublished just because the workflow failed.

Run **pollPublication** after completion. It matches the exact publication nonce/source/workflow/run, reads one bounded result-step log, compares the image to the verified old build, and independently checks current feed bytes/hash/provenance plus all four server asset digests/sizes/URLs. Expected success is **published**, modelRequests0, automaticDispatchEnabledfalse, deviceConfirmedfalse. Original build trace remains visible; publication run/result are separate. The queue stays held at this job while installation is unconfirmed. The waiting vessel cannot start or silently use the heart response.

Missing/incorrect result, changed feed, bad digest, quota or unknown response retains the reservation. A failed completed publication records review_required when a valid unconfirmed result is available. Missing result leaves the active attempt held. No automatic retry, purge, release overwrite or timeout-based queue advance. Same-run late verified evidence can reconcile a hold; it cannot create a second POST.

## Manual board verification after publication passes

Use the native Arduino IDE Serial Monitor only, existing USB port115200/New Line. Do not upload the older sketch currently open in IDE. No firmware foundation change or new Wi-Fi provisioning is needed.

1. Send `status`; capture current version/foundation/running slot/wifi/layout/health without passwords.
2. Send `check`. Compare LB_UPDATE_AVAILABLE version, bytes and SHA to the newly verified published job. Stop on any mismatch/error; preserve recovery baseline.
3. Send `arm-update`, then `install` within the60-second arm window. Firmware independently rechecks the unchanged candidate and full download hash/size/image before selecting the next boot slot.
4. After reboot and LB_BOOT_HEALTH_PASSED (the health window is at least30seconds), send `status`. Verify expected heart version, f124 foundation, intended running slot, ota_state2 VALID, health_oktrue and wifi_status3.
5. Record observed physical display and serial evidence. Creative geometry/clipping refinement remains deferred. Do not repeat earlier rollback/known-scene tests without a new infrastructure concern.

This phase adds no automatic device reporter or remote authentication channel. Manual serial/display evidence will be recorded separately; deviceConfirmed remains false in the automated queue until a later authenticated confirmation implementation. Published work therefore stays held. Do not send an installed acknowledgment or enable polling/install triggers. This controlled live publication/install/physical check is now complete. These instructions remain recovery/reference guidance, not a request to repeat it. Next implement authenticated device reporting/queue acknowledgment before automatic operation.

## Focused checks

37 Node queue/adapter checks and8 Python publication policy checks pass locally. Tests exercise exact prior-result/rebuild binding, separate durable reservations, restart/lost-response recovery, unchanged receipt/build history, FIFO/one-in-flight, feed/server digest refusal, failure holds and token isolation on log redirects. Publisher/network results are mocked; live publication and hardware are not claimed. Existing publisher tests/foundation remain unchanged.

```sh
node --test tests/test_github_queue.cjs tests/test_persistent_queue.cjs
python3 -m unittest discover -s tests -p test_queue_publication.py -v
```
