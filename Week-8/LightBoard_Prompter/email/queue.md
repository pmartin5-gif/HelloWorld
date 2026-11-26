# Persistent queue checkpoint

November 26, 2026: `Queue.gs` implements durable queue storage and transitions. Fifteen focused checks of the actual Apps Script source pass locally. Installation and live persistence in the private Google project passed at1:25:37PM: second sync imported0 with two correct received jobs, original hashes/order, revision1/attempt0 and dispatch disabled. First sync output was not captured; it does not need repeating. This is separate from the older offline `queue-simulation.cjs` contract.

## Completed installation and persistence check

In the existing **Lightboard Inbox** Apps Script project:

1. Use **+ beside Files → Script**, name it **Queue**, and replace its contents with the complete local `email/Queue.gs`. Save.
2. Keep Code.gs, Diagnose.gs, appsscript.json, private configuration and existing receipts. No manifest change, new scope, credential or trigger is needed.
3. Run **setupQueue** once. Expected: `configured`, `mode:record_only`, `dispatchEnabled:false`. Repeating setup preserves the queue/configuration.
4. Run **syncQueue**. With the two existing accepted test jobs, expect `imported:2`, `jobs:2`, both `received`, original prompt hashes, the heart as `headJobId`, and `inFlightJobId:null`.
5. Run **syncQueue** again as a separate execution. Expect `imported:0`, the same two jobs/hashes/head, and no in-flight job. Send no new email for this test.

`inspectQueue` reads the same safe summary without importing anything. This checkpoint has passed; do not reset/repeat it for a missing first-run log. Future manual intake runs can be followed by syncQueue to import new accepted jobs. No queued job starts merely because it was imported. The current two examples are queued test data, not authorization to dispatch them later.

## Storage and ordering

The original `LB_MSG_` email receipts remain immutable. Each accepted receipt has one separate `LB_QUEUE_JOB_<job-id>` property. It stores a reference and a checksum of that exact receipt, prompt checksum, receipt time, status, revision, attempt and bounded progress metadata. It does not duplicate the prompt or sender. Ignored/rejected messages never enter the queue.

Every read validates receipt identity, exact prompt hash, source-record hash, queue schema, account binding and supported states. Edited/missing sources stop processing. FIFO uses receivedAt, then job ID for timestamp ties; property enumeration order is irrelevant. Summary positions include terminal history; headJobId identifies the next eligible item.

Queue operations and processInbox share the script lock. Each job's state is one property write; there is no separate index or active-pointer write that could become inconsistent after interruption. A fresh runtime rebuilds the ordered view from stored records. Importing again skips existing records. Capacity uses the existing 8,000-byte/value and 400,000-byte/store application bounds; it pauses, retains history and performs no automatic cleanup. A partly completed import resumes without creating duplicate entries. This duplicates some metadata and therefore consumes additional finite Script Properties capacity.

## Progress rules prepared for a future adapter

The three public queue functions only configure, import and inspect; they do not contact GitHub. Internal transition helpers now support the separate manual saved-build adapter and focused tests. Generic publication/device delivery remain future work; do not invoke helpers manually to mark progress.

| State | Meaning and scheduling effect |
| --- | --- |
| received | Saved and waiting; dispatch is disabled at this checkpoint. |
| quota_paused | Head job paused before dispatch; later jobs wait. Resume retains FIFO position. |
| dispatch_pending | One attempt reserved durably before a future HTTP request; later jobs wait. |
| dispatch_unknown | Request outcome uncertain; retain reservation and reconcile, never blindly resend. |
| building | Run ID, source commit, dispatch ID and exact prompt hash bound; later jobs wait. |
| built | Verified build-only completion with no publication; next job may become eligible. |
| published | Verified OTA metadata recorded; board installation unconfirmed, later jobs wait. |
| failed | Known finished failure with verified absence of publication; next job may become eligible. |
| review_required | Timeout/uncertainty retained; later jobs stay blocked pending reconciliation. |

State changes use an expected revision and a last-event ID/hash. Replaying the last exact event is a no-op; conflicting/stale events refuse to advance. A persisted dispatch reservation cannot become a second reservation after restart. A future HTTP adapter must send only on the first successful reservation (`changed:true`) and must reconcile a previously reserved attempt. Queue reservation by itself is not proof that a workflow started.

An unsuccessful workflow can have published before failing, and a timed-out request can still finish. Neither automatically releases the board queue. Publication requires matching run/commit/prompt and validated version/foundation/image hash/size supplied by a trusted verification adapter. Those adapter checks are not implemented in this checkpoint. There is no device-confirmed transition; no authenticated device-report channel exists yet. Publication and review states remain blocked, and deviceConfirmed stays false. Finishing that channel and recovery/reconciliation is required before automatic delivery.

`inspectIntake` continues to show original receipt snapshots. `inspectQueue` is the separate progress view. Neither sends status emails. Email replies, scheduling, model requests, publication and board commands remain off.

## GitHub connection prepared locally

The manual saved-build connection now lives in GitHub.gs and the job-bound prompt workflow. Follow [the concrete GitHub setup](github-setup.md): source push, updated Queue file, new GitHub file, manifest external-request scope and privately stored repository-scoped Actions credential, then GET-only setup and one manual saved-heart build. All those latest changes are still local; original Queue live persistence remains passed and stored records remain intact. No new generation, publication, mail, scheduling or device command is enabled. Saved heart reuse cannot process the queued vessel.

Queue mode remains record_only until the explicit manual dispatch function reserves the approved job; it then becomes manual_saved_build. inspectQueue reports that mode and manual dispatchEnabled flag, always automaticDispatchEnabledfalse. It additionally shows run/commit/result checksum when available. setupQueue continues to preserve configuration. Updated Queue.gs has a compatibility flag so the adapter refuses an older copy before HTTP. Same-run late verified results may reconcile an uncertain review hold; published holds are never cleared by this build-only adapter. Generic publication transitions remain future delivery support, not something this adapter invokes.

The adapter verifies pinned workflow/helper source, repository/workflow/ref/run attempt/nonce/exact prompt/commit, and only the result step's bounded log. Signed storage redirects never receive the API bearer token. It persists run/job/result hash and distinguishes built from installed; no device-confirmed transition exists. Tokens are repository-scoped, not single-workflow-scoped; code pins the intended workflow. See the setup guide for credential scope, uncertainty/quotas and actual live work still pending.

Storage and lock operations continue to use Google's [Properties service](https://developers.google.com/apps-script/reference/properties/properties) and [script lock](https://developers.google.com/apps-script/reference/lock/lock). Queue public functions still perform no HTTP; the separate manually invoked GitHub adapter does.

## Focused validation

Run `node --test tests/test_persistent_queue.cjs` when changing this infrastructure. It exercises real Inbox.gs/Queue.gs in fresh mocked Apps Script runtimes backed by the same property store: import and exact hashes, ignored/rejected exclusion, real intake compatibility, restart/crash replay, bounded capacity, busy locks, edited-state refusal, FIFO/quota, one active attempt, ambiguous dispatch/timeout holds, run/prompt/commit binding, stale/conflicting events, build-only versus publication and failure reconciliation. Remote results in these checks are fixtures, not real builds/publications/device evidence. No firmware suite, artwork review or compiler run is involved.
