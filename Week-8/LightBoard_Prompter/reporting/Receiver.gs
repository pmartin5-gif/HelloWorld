/** Deploy in a SEPARATE Apps Script project. No Gmail, GitHub or mail permissions. */
const LBR = Object.freeze({board: 'lightboard-main', key: 'LB_REPORT_KEY', latest: 'LB_LATEST_REPORT'});
function setupReporting() {
  const store = PropertiesService.getScriptProperties();
  if (!store.getProperty(LBR.key)) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + Utilities.getUuid() + Date.now(), Utilities.Charset.UTF_8);
    store.setProperty(LBR.key, lbrHex_(bytes));
  }
  console.log(JSON.stringify({configured: true, boardId: LBR.board, keyPrinted: false}));
}
function lbrHex_(bytes) { return bytes.map(b => (b & 255).toString(16).padStart(2, '0')).join(''); }
function lbrEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0; for (let i = 0; i < a.length; ++i) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function lbrRequire_(condition) { if (!condition) throw new Error('INVALID_REPORT'); }
function lbrHandle_(envelope, store, now) {
  const key = store.getProperty(LBR.key);
  lbrRequire_(/^[a-f0-9]{64}$/.test(key || '') && envelope &&
    typeof envelope.payload === 'string' && envelope.payload.length <= 2048 &&
    /^[a-f0-9]{64}$/.test(envelope.signature || ''));
  const expected = lbrHex_(Utilities.computeHmacSha256Signature(envelope.payload, key, Utilities.Charset.UTF_8));
  lbrRequire_(lbrEqual_(expected, envelope.signature));
  const value = JSON.parse(envelope.payload);
  lbrRequire_(value.schemaVersion === 1 && value.boardId === LBR.board &&
    Number.isSafeInteger(value.reportedAt) && Math.abs(Math.floor(now / 1000) - value.reportedAt) <= 300 &&
    /^[a-f0-9]{32}$/.test(value.nonce || ''));
  if (value.action === 'status') {
    lbrRequire_(Object.keys(value).sort().join(',') === 'action,boardId,nonce,reportedAt,schemaVersion');
    return {ok: true, report: JSON.parse(store.getProperty(LBR.latest) || 'null')};
  }
  lbrRequire_(value.action === 'installed' && Object.keys(value).sort().join(',') ===
    'action,boardId,bytes,foundation,healthy,nonce,otaState,reportedAt,schemaVersion,sha256,version' &&
    /^ota-pilot-[a-f0-9]{24}$/.test(value.version || '') &&
    /^[a-f0-9]{64}$/.test(value.foundation || '') && /^[a-f0-9]{64}$/.test(value.sha256 || '') &&
    Number.isSafeInteger(value.bytes) && value.bytes >= 288 && value.bytes <= 1310720 &&
    value.healthy === true && value.otaState === 2);
  const previous = JSON.parse(store.getProperty(LBR.latest) || 'null');
  if (previous && value.reportedAt <= previous.reportedAt) {
    // Replays cannot replace a newer boot or make an old report look fresh.
    lbrRequire_(value.reportedAt === previous.reportedAt && value.nonce === previous.nonce &&
      envelope.payload === previous.signedPayload);
    return {ok: true, duplicate: true, receivedAt: previous.receivedAt};
  }
  const saved = {...value, receivedAt: new Date(now).toISOString(), signedPayload: envelope.payload};
  store.setProperty(LBR.latest, JSON.stringify(saved));
  return {ok: true, receivedAt: saved.receivedAt};
}
function doGet() {
  return ContentService.createTextOutput('{"ok":false,"reason":"POST_REQUIRED"}')
    .setMimeType(ContentService.MimeType.JSON);
}
function doPost(event) {
  const lock = LockService.getScriptLock();
  let result = {ok: false, reason: 'REJECTED'};
  if (!lock.tryLock(1000)) result = {ok: false, reason: 'BUSY'};
  else {
    try {
      lbrRequire_(event && event.postData && event.postData.contents.length <= 4096);
      result = lbrHandle_(JSON.parse(event.postData.contents), PropertiesService.getScriptProperties(), Date.now());
    } catch (_) { /* Never return a credential, submitted body or internal exception. */ }
    finally { lock.releaseLock(); }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
