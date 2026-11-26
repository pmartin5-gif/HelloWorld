# Lightboard inbox prototype

**November 26, 2026:** Local record-only implementation and 15 focused inbox/queue checks pass. Dedicated Gmail setup is now configured/authorized; setupInbox completed at17:01:06Z with record_only and zero triggers. A filter applies only the Lightboard label to the approved sender/subject search. First live prompt receipt/deduplication remains pending. Private mailbox/sender/project details stay in ignored .build evidence and Script Properties. Cloud prompt build 45858227133 passed independently; this inbox does not dispatch it.

`Inbox.gs` reads selected Gmail messages and saves private durable receipts in Script Properties. It never sends email, marks messages read, changes labels, calls a model, starts GitHub Actions or commands the board. There is no trigger or background processing. `queue-simulation.cjs` is a separate offline status contract, not an Apps Script dispatcher.

## Initial setup

1. Choose the Gmail account you control. Create a Gmail label named `Lightboard` (or another dedicated name). Use a dedicated label/filter so test messages and new replies receive that label individually. Gmail labels can differ between messages in one thread.
2. Open [Google Apps Script](https://script.google.com/) in that account. Create a project named **Lightboard Inbox**. Copy `Inbox.gs` into the editor.
3. In the editor's project settings, show `appsscript.json` and replace it with the provided manifest. It enables the Advanced Gmail v1 service and requests only `gmail.readonly`. If using a standard Google Cloud project, enable the Gmail API there as described in [Google's advanced-service setup](https://developers.google.com/apps-script/guides/services/advanced#enable_advanced_services). Do not enable billing or add paid services for this prototype.
4. In **Project Settings → Script Properties**, add `LB_CONFIG` with this JSON, substituting your approved test sender addresses. Keep real configuration in the private project, outside the repository:

   ```json
   {"labelName":"Lightboard","allowedSenders":["your-test-sender@example.com"]}
   ```

5. Select and run `setupInbox` manually. Review Google's requested account permission: Gmail read-only is mailbox-wide; the code restricts reads to the configured label and validates the subject/sender. No send, modify, external-request or trigger scope is requested. The setup records the current account and start time. It does not backfill older messages. Re-running setup preserves the original configuration, cutoff and receipts.
6. Leave triggers empty. Run `processInbox` manually for each test. It processes at most 25 message summaries per invocation; subsequent manual runs continue its saved page cursor. Run `inspectIntake` to view job IDs, status, receipt times and prompt hashes in the execution log. It omits prompt bodies and sender addresses.

To change the initial allowlist/label after setup, stop processing and deliberately review `LB_ACTIVE_CONFIG` in the private project. Editing `LB_CONFIG` alone does not silently reconfigure an active processor. Keep the account/cutoff and existing receipts; do not delete receipts to restart processing. There is no automatic migration or purge.

## Message rules

- Subject: `Lightboard`, also accepting repeated `Re:` prefixes. A different subject is rejected even if Gmail's broader search matched it.
- The canonical single `From` address must exactly match an allowed sender after case normalization. Display names and `Reply-To` do not grant access.
- Send UTF-8 plain text (multipart mail with one plain-text body is supported). HTML-only messages, attached text prompts, ambiguous multiple bodies and unsupported character sets are rejected.
- Put the creative prompt in the new message body, followed by `%%%`. The processor normalizes CRLF to LF and trims outer whitespace/the marker; interior whitespace, line breaks and Unicode remain exact. It saves a SHA-256 of that prompt. Limit: 2,000 Unicode code points and 6,000 UTF-8 bytes, allowing room for private record metadata.
- Common quoted-reply, forwarded-message and standard signature boundaries are removed before looking for the suffix. A marker appearing only in quoted text or a signature cannot trigger a job. An unrecognized signature after the marker causes the message to be ignored rather than guessed. This is a conservative prototype, not a universal signature parser; disable test signatures.
- A standalone `%%%` must directly reply to exactly one earlier labeled `Lightboard` design message from the same allowed sender in the same Gmail thread, received after setup. Its exact `In-Reply-To` must match that design's `Message-ID`; that design must contain a nonempty prompt and no marker. Missing, cross-sender, cross-thread, already-submitted or ambiguous context produces `design_missing`/rejection. Paste the full prompt with the marker if your mail client does not retain that direct reply relationship.
- Without a trailing marker, a message creates no deployment job. A labeled unmarked design can provide the direct-reply context described above.

## Recording, capacity and truthful status

A deterministic account/message job ID, prompt, prompt hash and `received` state share a single Script Properties record. That same write is the deduplication marker. A script lock prevents overlap. Repeating a scan or interrupting it after a durable write cannot create a second job. Rejected/ignored messages also receive durable outcomes; unexpected Gmail/API errors leave pending messages retryable. The page cursor advances only after every message on the page has been handled.

The processor starts no builds and reports no installation. Each accepted job has `buildDispatched: false`, `published: false` and `deviceConfirmed: false`. The `received` status means the prompt was recorded, not that an acknowledgment email was sent.

Each value is capped at 8,000 bytes and the property store at 400,000 bytes, below Google's documented [Properties limits](https://developers.google.com/apps-script/guides/services/quotas). Capacity exhaustion returns `storage_paused`, retains all history and leaves the pending message unconsumed. There is no automatic cleanup, retry loop, extra storage purchase or paid fallback. Other service errors stop processing with a sanitized message. Archive/migration and a production retention design are later work.

## First live acceptance check

After setup, manually label fresh test messages and run `processInbox`:

1. An allowed sender's `A warm light in a blue vessel%%%` records one `received` job with the expected prompt hash.
2. Run again: same job ID, no second receipt.
3. Send an unmarked message: no deployment job.
4. A different sender or wrong subject: no job.
5. In the same thread, send an unmarked design and directly reply from that same sender with only `%%%`: the referenced design records once. A standalone marker without such context is rejected.
6. Check the original emails remain unchanged and no replies/builds/releases/device actions occurred.

Full prompt text can be reviewed privately in the corresponding `LB_MSG_<gmail-id>` Script Property. Do not paste mailbox contents or private configuration into public workflow logs. Live acceptance and Google authorization are still pending; local mocks are not a live Gmail result.

## Offline infrastructure checks

Run only these focused checks when changing the inbox/queue infrastructure:

```sh
node --test tests/test_email_intake.cjs tests/test_queue_simulation.cjs
```

They exercise the actual Apps Script in a sandbox with mocked read-only Gmail and property storage. They cover exact prompt preservation, receipts, interrupted-write deduplication, markers/quotes/signatures, sender/thread bindings, malformed MIME, capacity stops, mailbox binding and safe logs. There is no artwork assessment or firmware build.

The separate queue simulation verifies FIFO, one in-flight job, duplicate event handling, quota pause/resume, build failure, offline timeout and matching version/foundation/hash/VALID/health reports. Its confirmation state is deliberately `device_confirmed_simulated`; every record retains `installedOnRealBoard: false`. A future real dispatcher needs durable queue transitions, a scoped workflow credential, authenticated device reports and late/offline-result handling before any installed acknowledgment or automation.

## API references used

Implementation uses Google's [Advanced Gmail service](https://developers.google.com/apps-script/advanced/gmail), [message listing and label filtering](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [message/MIME representation](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages), [Properties service](https://developers.google.com/apps-script/guides/properties) and [script locks](https://developers.google.com/apps-script/reference/lock/lock-service). These APIs were checked November 26; account access and live behavior remain separate checks.
