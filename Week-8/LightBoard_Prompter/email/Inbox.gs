/** Manual, read-only Gmail intake. Records jobs; never replies, dispatches or installs. */
const LB = Object.freeze({maxPrompt: 2000, maxBodyBytes: 32768, maxRecordBytes: 8000,
  maxStoreBytes: 400000, batchSize: 25, maxThreadMessages: 50});

function lbRequire(ok, reason) {
  if (!ok) throw new Error(reason);
}

function lbBytes(value) { return Utilities.newBlob(value).getBytes().length; }
function lbReport(value) { console.log(JSON.stringify(value)); return value; }
function lbHash(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value,
    Utilities.Charset.UTF_8).map(x => ('0' + ((x + 256) % 256).toString(16)).slice(-2)).join('');
}

function lbAddress(value) {
  const match = String(value || '').trim().match(/^(?:[^<>\r\n]*<([^<>]+)>|([^<>\s]+))$/);
  const address = match ? (match[1] || match[2]).trim().toLowerCase() : '';
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(address) ? address : null;
}

function lbHeader(message, name) {
  const matches = ((message.payload || {}).headers || [])
    .filter(h => h.name.toLowerCase() === name.toLowerCase());
  lbRequire(matches.length <= 1, 'ambiguous_headers');
  return matches.length ? matches[0].value : '';
}

function lbSubject(message) {
  return lbHeader(message, 'Subject').replace(/^(?:\s*re:\s*)+/i, '').trim() === 'Lightboard';
}

function lbPlainBody(message) {
  lbRequire(Number(message.sizeEstimate || 0) <= 100000, 'message_too_large');
  const bodies = [];
  function visit(part) {
    if (part.filename) return; // An attached text file is never a prompt.
    if (part.mimeType === 'text/plain') {
      const contentType = (part.headers || []).find(h => h.name.toLowerCase() === 'content-type');
      const charset = contentType && contentType.value.match(/charset\s*=\s*["']?([^\s;"']+)/i);
      lbRequire(!charset || /^(utf-8|us-ascii)$/i.test(charset[1]), 'unsupported_charset');
      lbRequire(part.body && !part.body.attachmentId, 'missing_inline_text');
      const data = part.body.data;
      lbRequire(typeof data === 'string' || Array.isArray(data), 'missing_inline_text');
      let bytes;
      if (Array.isArray(data)) {
        // Observed Advanced Gmail service representation: bytes are already decoded.
        lbRequire(data.length <= LB.maxBodyBytes, 'body_too_large');
        lbRequire(Array.from(data).every(n => Number.isInteger(n) && n >= -128 && n <= 255),
          'invalid_body_bytes');
        bytes = data.map(n => n > 127 ? n - 256 : n); // Apps Script Byte[] uses signed bytes.
      } else {
        // REST-shaped fixtures/clients provide base64url strings instead.
        lbRequire(data.length <= 45000, 'body_too_large');
        bytes = Utilities.base64DecodeWebSafe(data);
      }
      lbRequire(bytes.length <= LB.maxBodyBytes, 'body_too_large');
      bodies.push(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
    }
    (part.parts || []).forEach(visit);
  }
  visit(message.payload || {});
  lbRequire(bodies.length === 1, 'plain_text_required');
  return bodies[0];
}

function lbNewText(body) {
  // Conservative plain-text boundaries, not a universal email/signature parser.
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const end = lines.findIndex(line => /^\s*>/.test(line) ||
    /^\s*On .+wrote:\s*$/i.test(line) || /^\s*-{2,}\s*(Original Message|Forwarded message)/i.test(line) ||
    /^-- ?$/.test(line) || /^Sent from my (iPhone|iPad|Android)/i.test(line));
  return (end < 0 ? lines : lines.slice(0, end)).join('\n').trim();
}

function lbPrompt(text) {
  lbRequire(text && Array.from(text).length <= LB.maxPrompt && lbBytes(text) <= 6000,
    'prompt_length');
  lbRequire(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text), 'unsupported_text');
  return text; // Preserve interior spaces, line breaks, punctuation and Unicode.
}

function lbEnvelope(message, config) {
  lbRequire(message && /^[a-z0-9]{1,64}$/i.test(message.id || '') && message.threadId, 'invalid_message');
  lbRequire(lbSubject(message), 'wrong_subject');
  const sender = lbAddress(lbHeader(message, 'From'));
  lbRequire(sender && config.allowedSenders.includes(sender), 'sender_not_allowed');
  lbRequire(!['SPAM', 'TRASH', 'DRAFT'].some(label => (message.labelIds || []).includes(label)), 'excluded_message');
  lbRequire((message.labelIds || []).includes(config.labelId), 'label_required');
  lbRequire(Number.isFinite(Number(message.internalDate)) && Number(message.internalDate) >= config.startMs,
    'before_start');
  return sender;
}

function lbInterpret(message, config, getThread) {
  const sender = lbEnvelope(message, config);
  const text = lbNewText(lbPlainBody(message));
  if (!text.endsWith('%%%')) return {outcome: 'ignored', reason: 'missing_marker'};
  let prompt = text.slice(0, -3).trim();
  let designMessageId = null;
  if (!prompt) {
    // A standalone marker must reply directly to one earlier design by this sender.
    const parent = lbHeader(message, 'In-Reply-To').trim();
    lbRequire(/^<[^<>\s]+>$/.test(parent), 'design_missing');
    const thread = getThread(message.threadId);
    lbRequire(thread.id === message.threadId && Array.isArray(thread.messages) &&
      thread.messages.length <= LB.maxThreadMessages, 'ambiguous_thread');
    const matches = thread.messages.filter(m => lbHeader(m, 'Message-ID').trim() === parent &&
      Number(m.internalDate) < Number(message.internalDate));
    lbRequire(matches.length === 1, 'design_missing');
    const design = matches[0];
    lbRequire(design.threadId === message.threadId && lbEnvelope(design, config) === sender, 'design_missing');
    prompt = lbNewText(lbPlainBody(design));
    lbRequire(prompt && !prompt.includes('%%%'), 'design_missing');
    designMessageId = design.id;
  }
  lbRequire(!prompt.includes('%%%'), 'ambiguous_marker');
  return {outcome: 'received', job: {id: 'lb-' + lbHash(config.account).slice(0, 12) + '-' + message.id,
    status: 'received', sender: sender, threadId: message.threadId, messageId: message.id,
    designMessageId: designMessageId, receivedAt: new Date(Number(message.internalDate)).toISOString(),
    prompt: lbPrompt(prompt), promptSha256: lbHash(prompt), buildDispatched: false,
    published: false, deviceConfirmed: false}};
}

function lbSet(store, snapshot, key, value) {
  const encoded = typeof value === 'string' ? value : JSON.stringify(value);
  lbRequire(lbBytes(encoded) <= LB.maxRecordBytes, 'LB_STORAGE_PAUSED');
  const next = Object.assign({}, snapshot, {[key]: encoded});
  const bytes = Object.keys(next).reduce((sum, k) => sum + lbBytes(k) + lbBytes(next[k]), 0);
  lbRequire(bytes <= LB.maxStoreBytes, 'LB_STORAGE_PAUSED');
  store.setProperty(key, encoded); // One message record is also its deduplication marker.
  snapshot[key] = encoded;
}

function lbConfig(store) {
  const raw = store.getProperty('LB_ACTIVE_CONFIG');
  lbRequire(raw, 'Run setupInbox first');
  return JSON.parse(raw);
}

function setupInbox() {
  const lock = LockService.getScriptLock();
  lbRequire(lock.tryLock(1000), 'Another intake execution is active');
  try {
    const store = PropertiesService.getScriptProperties();
    if (store.getProperty('LB_ACTIVE_CONFIG')) return lbReport({status: 'already_configured'});
    const raw = store.getProperty('LB_CONFIG');
    lbRequire(raw, 'Add private LB_CONFIG in Script Properties; see email/README.md');
    const requested = JSON.parse(raw);
    lbRequire(Array.isArray(requested.allowedSenders) && requested.allowedSenders.length >= 1 &&
      requested.allowedSenders.length <= 20, 'Configure 1 to 20 allowed senders');
    const allowed = requested.allowedSenders.map(lbAddress);
    lbRequire(allowed.every(Boolean), 'Invalid allowed sender');
    lbRequire(typeof requested.labelName === 'string' && requested.labelName.trim(), 'Configure an existing Gmail label');
    const label = (Gmail.Users.Labels.list('me').labels || []).find(x => x.name === requested.labelName);
    lbRequire(label, 'Create the chosen Gmail label first');
    const account = lbAddress(Gmail.Users.getProfile('me').emailAddress);
    lbRequire(account, 'Cannot identify the mailbox');
    const config = {schemaVersion: 1, account: account, allowedSenders: Array.from(new Set(allowed)),
      labelId: label.id, labelName: requested.labelName, startMs: Date.now()};
    lbSet(store, store.getProperties(), 'LB_ACTIVE_CONFIG', config);
    return lbReport({status: 'configured', startAt: new Date(config.startMs).toISOString(),
      mode: 'record_only', triggersCreated: 0});
  } finally { lock.releaseLock(); }
}

function processInbox() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return lbReport({status: 'busy'});
  const result = {status: 'record_only', received: 0, ignored: 0, rejected: 0, duplicates: 0};
  try {
    const store = PropertiesService.getScriptProperties();
    const config = lbConfig(store), snapshot = store.getProperties();
    lbRequire(lbAddress(Gmail.Users.getProfile('me').emailAddress) === config.account, 'Wrong mailbox account');
    const options = {labelIds: [config.labelId], q: 'subject:Lightboard after:' + Math.floor(config.startMs / 1000),
      maxResults: LB.batchSize, includeSpamTrash: false};
    if (snapshot.LB_PAGE_TOKEN) options.pageToken = snapshot.LB_PAGE_TOKEN;
    const page = Gmail.Users.Messages.list('me', options);
    for (const summary of (page.messages || [])) {
      lbRequire(/^[a-z0-9]{1,64}$/i.test(summary.id || ''), 'invalid_message');
      const key = 'LB_MSG_' + summary.id;
      if (snapshot[key]) { result.duplicates++; continue; }
      const message = Gmail.Users.Messages.get('me', summary.id, {format: 'full'});
      let outcome;
      try {
        outcome = lbInterpret(message, config, id => Gmail.Users.Threads.get('me', id, {format: 'full'}));
      } catch (error) {
        // API failures must retry; only explicit parser decisions become durable rejections.
        const expected = /^(ambiguous_headers|message_too_large|unsupported_charset|missing_inline_text|invalid_body_bytes|body_too_large|plain_text_required|prompt_length|unsupported_text|invalid_message|wrong_subject|sender_not_allowed|excluded_message|label_required|before_start|design_missing|ambiguous_thread|ambiguous_marker)$/;
        if (!expected.test(error.message)) throw error;
        outcome = {outcome: 'rejected', reason: error.message};
      }
      lbSet(store, snapshot, key, {schemaVersion: 1, messageId: message.id,
        recordedAt: new Date().toISOString(), ...outcome});
      result[outcome.outcome]++;
    }
    // Move the cursor only after all message writes; interrupted pages safely replay.
    if (page.nextPageToken) lbSet(store, snapshot, 'LB_PAGE_TOKEN', page.nextPageToken);
    else store.deleteProperty('LB_PAGE_TOKEN');
    return lbReport(result);
  } catch (error) {
    if (error.message === 'LB_STORAGE_PAUSED') return lbReport({...result, status: 'storage_paused'});
    // Do not print API error bodies, email addresses, prompts or credentials in execution logs.
    throw new Error('Intake stopped; no build or email sent. Check configuration, access and service quotas.');
  } finally { lock.releaseLock(); }
}

function inspectIntake() {
  const store = PropertiesService.getScriptProperties();
  const config = lbConfig(store);
  lbRequire(lbAddress(Gmail.Users.getProfile('me').emailAddress) === config.account, 'Wrong mailbox account');
  const jobs = Object.entries(store.getProperties()).filter(([k]) => k.startsWith('LB_MSG_'))
    .map(([, raw]) => JSON.parse(raw)).filter(r => r.job)
    .map(r => ({jobId: r.job.id, status: r.job.status, promptSha256: r.job.promptSha256,
      receivedAt: r.job.receivedAt, published: false, deviceConfirmed: false}));
  return lbReport(jobs);
}
