# Manual queue-to-GitHub saved-build connection

November 26, 2026. The adapter/workflow are prepared locally. They have not been pushed, installed or run against GitHub yet. The two existing live queue entries and earlier successful cloud/hardware checks remain preserved. This stage tests the saved heart build only: no new model request, publication, acknowledgment email, trigger or board update.

## 1. Push the prepared source

From this repository in Terminal:

```sh
git push origin main
git rev-parse HEAD
```

Keep the full 40-character commit ID for the private setup property below. Do not manually start the workflow in Actions: the Apps Script request must supply the queue binding. Setup requires GitHub main to equal that exact commit and checks the exact workflow/helper file hashes. Future main changes stop new dispatch until deliberately reviewed; they do not prevent polling the pinned original run.

## 2. Install the prepared Apps Script files

In the existing private Lightboard Inbox project:

1. Replace only **Queue.gs** with the updated local `email/Queue.gs`; Save. This preserves stored queue/receipts. The adapter refuses the older Queue file before any GitHub request.
2. Add a Script named **GitHub** and paste all of `email/GitHub.gs`; Save.
3. Replace **appsscript.json** with local `email/appsscript.json`; Save. It retains Gmail read-only and adds `https://www.googleapis.com/auth/script.external_request` for GitHub HTTP calls. No Gmail send/modify or trigger scope is added. Google may ask you to authorize the new external-request capability when you run setup.

Keep Code.gs, Diagnose.gs, LB_CONFIG, LB_ACTIVE_CONFIG, LB_MSG_ receipts and LB_QUEUE_ records. Do not reset setupInbox/setupQueue, delete records, or create a trigger. Installing files and saving the manifest starts no request.

## 3. Store a narrowly scoped credential privately

In the repository owner's GitHub account, use **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Name it `Lightboard Apps Script`, choose an expiration, resource owner `pmartin5-gif`, **Only select repositories → HelloWorld**, and repository permission **Actions: Read and write**. Leave other optional permissions off; Metadata read is implicit. This permission is repository-scoped, not restricted by GitHub to one workflow. The adapter enforces the exact repository/workflow/main branch.

In Apps Script **Project Settings → Script Properties**, add:

| Property | Private value |
| --- | --- |
| `LB_GITHUB_TOKEN` | The generated fine-grained token. Paste it only here, never chat/source/terminal/logs. |
| `LB_GITHUB_SETUP` | `{"sourceCommit":"YOUR_FULL_PUSHED_COMMIT_ID"}` |

Save the properties. Keep existing properties unchanged. The source contains no credential. Source-file checks use public unauthenticated reads; Actions requests use the token only at api.github.com. Log-storage redirects never receive that bearer token. Setup verifies source/read access, not write permission; the subsequent manual dispatch tests write access.

GitHub's [token setup guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) describes the repository and permission selection; [workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) requires Actions write. No billing or subscription change is needed by this implementation.

## 4. Configure without dispatching

Select **setupGitHubConnection**, Run, and review/complete any Google authorization. Expected `status:configured`, `mode:saved_build_only`, the existing heart approvedJobId, exact source commit, `automaticDispatchEnabled:false` and `dispatchSent:false`.

It performs read-only GitHub checks and saves LB_GITHUB_ACTIVE, including the workflow's numeric ID and the one approved queue job. Re-running preserves that configuration; editing LB_GITHUB_SETUP alone does not silently replace it. Verify the expected job/source in the result before continuing with the manual build below. Share only execution results, never token/configuration contents. No new email is required.

## 5. Manually dispatch and poll one saved-response build

After configuration has passed, select **dispatchNextSavedBuild** and Run once. This sends one manual workflow request for the saved heart, publish=false and reuse_saved_generation=true, with queue job ID, unique reservation ID and exact prompt SHA. It does not send the vessel prompt or enable automatic processing. Use the returned runUrl for progress; do not click GitHub Re-run jobs.

Expected `building` with run ID/URL, or `dispatch_unknown` if GitHub's response/read is inconclusive. **Both mean use pollSavedBuild next, never reset/delete/re-dispatch a reservation.** Re-running dispatch cannot send another request once reserved. If an execution stops, the saved reservation still prevents duplicate delivery. A crash before the actual HTTP request may leave a reservation with no run; that requires deliberate reconciliation, not an automatic retry.

Select **pollSavedBuild** manually after the workflow finishes. It validates the exact workflow, public repository, branch, source commit, attempt1 and reservation-specific run title. If the dispatch response was lost, it searches at most three pages of matching-workflow runs by exact title; it never chooses the latest unrelated run. The search starts five minutes before reservation, rounded to seconds, to tolerate API timestamp precision/clock skew. An unmatched attempt stays held.

When complete, it reads only the **Record queue result** step log, capped at64KiB, and validates exactly one structured result: queue job/reservation/prompt hash/run/commit, saved generation provenance, modelRequests0, publishedfalse, automaticUpdatesfalse and deviceConfirmedfalse. A successful result additionally validates OTA foundation/version/image hash/size. The source workflow independently blocks model-generation and publication for any queued binding, even if a caller supplies conflicting switches. Manual builds without queue inputs retain their earlier behavior.

Expected terminal status **built**, original heart prompt hash, run ID, result checksum, modelRequests0, publishedfalse/deviceConfirmedfalse. Queue metadata stores run ID, source commit, workflow job ID and result checksum. The vessel remains received/attempt0; it cannot silently use the heart response or start a new model request. inspectQueue shows progress; inspectIntake remains the immutable receipt view.

Failed builds need a matching structured nonpublication result before becoming failed. Missing/incorrect result, unsupported redirect, deleted logs, unknown run or rerun mismatch retains the active job. No blind retry/cleanup, paid fallback or installed claim. There is no automatic timeout sweep; uncertain states stay blocked. A previously placed review hold can be reconciled only by the same verified run/result; publication holds are not cleared. If a pre-dispatch rate limit pauses the head, resumeSavedBuildQueue rechecks source and resumes it without dispatching. Any quota/error after POST is treated as uncertain and reconciled first.

Step log access follows the current [workflow jobs API](https://docs.github.com/en/rest/actions/workflow-jobs#download-step-logs-for-a-workflow-run-job); explicit redirect handling follows [UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app). Those live response shapes have not yet been verified in this private project. Credentials grant no billing setting changes, and the adapter exposes no such operation. API quotas pause/hold work instead of purchasing more capacity.

## Local verification and remaining work

Only focused infrastructure checks are required for this change:

```sh
node --test tests/test_github_queue.cjs tests/test_persistent_queue.cjs
python3 -m unittest discover -s tests -p test_queue_binding.py -v
```

These exercise actual adapter/queue/binding source with mocked HTTP/storage and synthetic manifests. They cover exact source/input/result bindings, one POST, crash/restart and lost-response recovery, rate limits, wrong/duplicate/oversized results, redirect credential isolation, no model/publication authorization, FIFO and unchanged receipts. One test uses the real existing manifest validator; no compiler or firmware suite runs. Remote response fixtures do not establish live GitHub success.

Live source push, private installation/credential/OAuth, manual dispatch/result verification are pending. Arbitrary-prompt generation, publication/feed/device delivery, authenticated device confirmation, durable truthful email replies and scheduling are subsequent work. Do not describe this build-only connection as the complete email-to-board system.
