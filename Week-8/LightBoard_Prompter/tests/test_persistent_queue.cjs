'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const scripts = ['Inbox.gs', 'Queue.gs'].map(f => readFileSync(join(__dirname, '../email', f), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const account = 'owner@example.test', sender = 'artist@example.test';
const base = () => ({LB_ACTIVE_CONFIG: JSON.stringify({schemaVersion: 1, account,
  allowedSenders: [sender], labelId: 'Label_1', startMs: 1})});
const plain = value => JSON.parse(JSON.stringify(value));
const id = messageId => 'lb-' + hash(account).slice(0, 12) + '-' + messageId;
const key = messageId => 'LB_QUEUE_JOB_' + id(messageId);
function receipt(messageId, prompt, receivedAt = '2026-11-26T17:00:00.000Z') {
  return JSON.stringify({schemaVersion: 1, messageId, recordedAt: '2026-11-26T18:00:00.000Z',
    outcome: 'received', job: {id: id(messageId), messageId, threadId: 'thread-' + messageId,
      sender, designMessageId: null, status: 'received', prompt, promptSha256: hash(prompt),
      receivedAt, buildDispatched: false, published: false, deviceConfirmed: false}});
}
function env(data = base(), options = {}) {
  const logs = [], calls = [];
  let failAfter = options.failAfter;
  const store = {getProperty: k => data[k] || null, getProperties: () => ({...data}),
    setProperty(k, v) {
      calls.push(['write', k]);
      if (options.failBefore === k) throw new Error('private provider detail');
      data[k] = v;
      if (failAfter === k) { failAfter = null; throw new Error('private provider detail'); }
    }, deleteProperty: k => { calls.push(['delete', k]); delete data[k]; }};
  const context = vm.createContext({console: {log: line => logs.push(line)},
    PropertiesService: {getScriptProperties: () => store},
    LockService: {getScriptLock: () => ({tryLock: () => options.busy !== true,
      releaseLock: () => calls.push(['unlock'])})},
    Utilities: {DigestAlgorithm: {SHA_256: 'sha256'}, Charset: {UTF_8: 'utf8'},
      newBlob: value => ({getBytes: () => [...Buffer.from(value)],
        getDataAsString: () => Buffer.from(value).toString('utf8')}),
      computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()],
      base64DecodeWebSafe: value => [...Buffer.from(value, 'base64url')]},
    Gmail: {Users: {getProfile: () => { calls.push(['gmail']); return {emailAddress: account}; },
      Messages: {list: () => ({messages: (options.messages || []).map(m => ({id: m.id}))}),
        get: (_, messageId) => options.messages.find(m => m.id === messageId)}}},
    UrlFetchApp: {fetch: () => { calls.push(['http']); throw new Error('No HTTP allowed'); }},
    ScriptApp: {newTrigger: () => { calls.push(['trigger']); throw new Error('No trigger allowed'); }},
    MailApp: {sendEmail: () => { calls.push(['mail']); throw new Error('No mail allowed'); }}});
  scripts.forEach(source => vm.runInContext(source, context));
  return {context, data, logs, calls};
}
function prepared(options = {}) {
  const data = {...base(), LB_MSG_b2: receipt('b2', 'Second prompt', '2026-11-26T17:01:00.000Z'),
    LB_MSG_a1: receipt('a1', 'First ♥\n  exact  prompt')};
  const e = env(data); e.context.setupQueue(); e.context.syncQueue();
  return options.reload ? env(data) : e;
}
function item(e, messageId) { return JSON.parse(e.data[key(messageId)]); }
let sequence = 0;
function apply(e, messageId, type, extra = {}) {
  return e.context.lbqApplyEvent_(id(messageId), {id: 'event-' + (++sequence),
    expectedRevision: item(e, messageId).revision, type, ...extra});
}
function reserve(e) { apply(e, 'a1', 'reserve_dispatch'); return item(e, 'a1').dispatch.id; }
function bind(e) {
  const dispatchId = reserve(e);
  apply(e, 'a1', 'bind_run', {dispatchId, promptSha256: item(e, 'a1').promptSha256,
    runId: '1234', commitSha: 'a'.repeat(40)});
}
function buildResult(e, extra) {
  return apply(e, 'a1', 'build_result', {runId: '1234', commitSha: 'a'.repeat(40),
    promptSha256: item(e, 'a1').promptSha256, ...extra});
}
const publication = {version: 'ota-pilot-' + 'b'.repeat(24), foundation: 'c'.repeat(64),
  sha256: 'd'.repeat(64), bytes: 1012016};

test('setup is idempotent, account-bound and performs no Gmail/HTTP/mail/trigger operation', () => {
  const e = env(); assert.equal(e.context.setupQueue().status, 'configured');
  const config = e.data.LB_QUEUE_CONFIG;
  assert.equal(e.context.setupQueue().status, 'already_configured');
  assert.equal(e.data.LB_QUEUE_CONFIG, config);
  assert.equal(e.context.inspectQueue().dispatchEnabled, false);
  assert.equal(e.calls.filter(c => ['gmail', 'http', 'mail', 'trigger'].includes(c[0])).length, 0);
  const wrong = JSON.parse(e.data.LB_ACTIVE_CONFIG); wrong.account = 'different@example.test';
  e.data.LB_ACTIVE_CONFIG = JSON.stringify(wrong);
  assert.throws(() => e.context.syncQueue(), /Queue stopped/);
  assert.equal(e.data.LB_QUEUE_CONFIG, config);
});

test('receipt import survives fresh runtimes, preserves exact source bytes and emits no prompt/address', () => {
  const e = prepared(); const receipts = [e.data.LB_MSG_a1, e.data.LB_MSG_b2];
  const reloaded = env(e.data); const result = reloaded.context.syncQueue();
  assert.equal(result.imported, 0); assert.equal(result.jobs, 2);
  assert.equal(result.headJobId, id('a1'));
  assert.deepEqual(plain(result.items.map(x => x.jobId)), [id('a1'), id('b2')]);
  assert.deepEqual([e.data.LB_MSG_a1, e.data.LB_MSG_b2], receipts);
  const text = reloaded.logs.join('');
  for (const secret of ['First', 'Second', 'exact', sender, account]) assert.equal(text.includes(secret), false);
  assert.equal(item(e, 'a1').promptSha256, hash('First ♥\n  exact  prompt'));
});

test('actual processInbox receipts synchronize automatically on the next sync without changing history', () => {
  const messages = [{id: 'a1', threadId: 'thread1', internalDate: '1000', sizeEstimate: 100,
    labelIds: ['Label_1'], payload: {mimeType: 'text/plain',
      headers: [{name: 'From', value: sender}, {name: 'Subject', value: 'Lightboard'}],
      body: {data: [...Buffer.from('A new prompt%%%')]}}}];
  const e = env(base(), {messages}); e.context.setupQueue();
  assert.equal(e.context.processInbox().received, 1);
  const original = e.data.LB_MSG_a1;
  assert.equal(e.context.syncQueue().imported, 1);
  assert.equal(e.context.processInbox().duplicates, 1);
  assert.equal(e.context.syncQueue().imported, 0);
  assert.equal(e.data.LB_MSG_a1, original);
});

test('ignored and rejected outcomes never enter the queue', () => {
  const e = env({...base(), LB_MSG_a1: receipt('a1', 'Prompt'),
    LB_MSG_c3: JSON.stringify({schemaVersion: 1, messageId: 'c3', outcome: 'ignored', reason: 'missing_marker'}),
    LB_MSG_d4: JSON.stringify({schemaVersion: 1, messageId: 'd4', outcome: 'rejected', reason: 'design_missing'})});
  e.context.setupQueue(); assert.equal(e.context.syncQueue().jobs, 1);
});

test('crash after first durable import resumes without duplicates or source rewrites', () => {
  const e = prepared(); delete e.data[key('a1')]; delete e.data[key('b2')];
  const interrupted = env(e.data, {failAfter: key('a1')});
  assert.throws(() => interrupted.context.syncQueue(), /Queue stopped/);
  assert.ok(e.data[key('a1')]); assert.equal(e.data[key('b2')], undefined);
  const restarted = env(e.data); const result = restarted.context.syncQueue();
  assert.equal(result.imported, 1); assert.equal(result.jobs, 2); assert.equal(result.headJobId, id('a1'));
});

test('capacity pauses without cleanup and later resumes with original FIFO order', () => {
  const e = prepared(); delete e.data[key('a1')]; delete e.data[key('b2')];
  e.data.padding = 'x'.repeat(399000);
  const paused = env(e.data); assert.equal(paused.context.syncQueue().status, 'storage_paused');
  assert.equal(e.data.padding.length, 399000);
  assert.ok(!paused.calls.some(c => c[0] === 'delete'));
  delete e.data.padding; const result = env(e.data).context.syncQueue();
  assert.equal(result.jobs, 2); assert.equal(result.headJobId, id('a1'));
});

test('concurrent execution refuses work using the shared script lock', () => {
  const e = prepared(); const before = JSON.stringify(e.data);
  const busy = env(e.data, {busy: true});
  for (const name of ['setupQueue', 'syncQueue', 'inspectQueue']) assert.equal(busy.context[name]().status, 'busy');
  assert.equal(JSON.stringify(e.data), before); assert.equal(busy.calls.length, 0);
});

test('invalid config, altered receipt/prompt/hash and forged confirmed state stop before writes', () => {
  for (const alter of [
    d => {const q = JSON.parse(d.LB_QUEUE_CONFIG); q.mode = 'live'; d.LB_QUEUE_CONFIG = JSON.stringify(q);},
    d => {d.LB_MSG_a1 += ' ';},
    d => {const r = JSON.parse(d.LB_MSG_a1); r.job.prompt += '!'; d.LB_MSG_a1 = JSON.stringify(r);},
    d => {const q = JSON.parse(d[key('a1')]); q.deviceConfirmed = true; d[key('a1')] = JSON.stringify(q);},
    d => {const q = JSON.parse(d[key('a1')]); q.status = 'unknown'; d[key('a1')] = JSON.stringify(q);},
    d => {delete d.LB_MSG_a1;}
  ]) {
    const original = prepared(); alter(original.data); const e = env(original.data);
    const before = JSON.stringify(e.data);
    assert.throws(() => e.context.syncQueue(), /Queue stopped/);
    assert.equal(JSON.stringify(e.data), before); assert.ok(!e.calls.some(c => c[0] === 'write'));
    assert.equal(e.logs.join('').includes('First'), false);
  }
});

test('FIFO and quota pause block later jobs across restarts; ties use stable job IDs', () => {
  const e = prepared(); assert.throws(() => apply(e, 'b2', 'reserve_dispatch'), /Queue stopped/);
  apply(e, 'a1', 'quota_pause'); const restarted = env(e.data);
  assert.equal(restarted.context.inspectQueue().headJobId, id('a1'));
  assert.throws(() => apply(restarted, 'b2', 'reserve_dispatch'), /Queue stopped/);
  apply(restarted, 'a1', 'resume'); reserve(restarted);
  assert.throws(() => apply(restarted, 'b2', 'reserve_dispatch'), /Queue stopped/);
  const tie = env({...base(), LB_MSG_b2: receipt('b2', 'B'), LB_MSG_a1: receipt('a1', 'A')});
  tie.context.setupQueue(); assert.equal(tie.context.syncQueue().headJobId, id('a1'));
});

test('reservation persisted before a crash cannot be reissued or start a second job', () => {
  const e = prepared(); const event = {id: 'reserve-1', type: 'reserve_dispatch', expectedRevision: 1};
  const interrupted = env(e.data, {failAfter: key('a1')});
  assert.throws(() => interrupted.context.lbqApplyEvent_(id('a1'), event), /Queue stopped/);
  const restarted = env(e.data);
  assert.equal(restarted.context.lbqApplyEvent_(id('a1'), event).changed, false);
  assert.equal(item(restarted, 'a1').attempt, 1);
  assert.throws(() => apply(restarted, 'b2', 'reserve_dispatch'), /Queue stopped/);
  assert.equal(restarted.calls.filter(c => c[0] === 'http').length, 0);
});

test('uncertain dispatch and elapsed timeout retain the one-in-flight block', () => {
  const e = prepared(); reserve(e); apply(e, 'a1', 'dispatch_unknown');
  const restarted = env(e.data); assert.equal(restarted.context.syncQueue().inFlightJobId, id('a1'));
  assert.throws(() => apply(restarted, 'a1', 'reserve_dispatch'), /Queue stopped/);
  apply(restarted, 'a1', 'timeout');
  assert.equal(env(e.data).context.inspectQueue().items[0].status, 'review_required');
  assert.throws(() => apply(restarted, 'b2', 'reserve_dispatch'), /Queue stopped/);
});

test('run identity/prompt/commit must match; stale or conflicting replay never advances progress', () => {
  const e = prepared(); const dispatchId = reserve(e);
  for (const mismatch of [{dispatchId: 'wrong'}, {promptSha256: '0'.repeat(64)}, {runId: 'bad'}, {commitSha: 'bad'}]) {
    assert.throws(() => apply(e, 'a1', 'bind_run', {dispatchId, promptSha256: item(e, 'a1').promptSha256,
      runId: '1234', commitSha: 'a'.repeat(40), ...mismatch}), /Queue stopped/);
  }
  const event = {id: 'bind-1', expectedRevision: 2, type: 'bind_run', dispatchId,
    promptSha256: item(e, 'a1').promptSha256, runId: '1234', commitSha: 'a'.repeat(40)};
  e.context.lbqApplyEvent_(id('a1'), event);
  assert.equal(env(e.data).context.lbqApplyEvent_(id('a1'), event).changed, false);
  assert.throws(() => e.context.lbqApplyEvent_(id('a1'), {...event, runId: '5678'}), /Queue stopped/);
  assert.throws(() => e.context.lbqApplyEvent_(id('a1'), {...event, id: 'new', expectedRevision: 1}), /Queue stopped/);
  for (const mismatch of [{runId: '5678'}, {commitSha: 'b'.repeat(40)}, {promptSha256: 'f'.repeat(64)}]) {
    assert.throws(() => buildResult(e, {result: 'built', published: false, ...mismatch}), /Queue stopped/);
  }
});

test('verified build-only completion releases next job; publication stays held and unconfirmed', () => {
  const e = prepared(); bind(e); buildResult(e, {result: 'built', published: false});
  assert.equal(item(e, 'a1').status, 'built'); apply(e, 'b2', 'reserve_dispatch');
  const published = prepared(); bind(published);
  buildResult(published, {result: 'published', published: true, publication});
  const result = env(published.data).context.inspectQueue();
  assert.equal(result.items[0].published, true); assert.equal(result.items[0].deviceConfirmed, false);
  assert.throws(() => apply(published, 'b2', 'reserve_dispatch'), /Queue stopped/);
  assert.throws(() => apply(published, 'a1', 'device_confirmed', {healthPassed: true}), /Queue stopped/);
  apply(published, 'a1', 'timeout');
  assert.equal(env(published.data).context.inspectQueue().items[0].published, true);
  assert.throws(() => apply(published, 'b2', 'reserve_dispatch'), /Queue stopped/);
});

test('workflow failure alone cannot release the queue without publication reconciliation', () => {
  const e = prepared(); bind(e);
  assert.throws(() => buildResult(e, {result: 'failed', published: false}), /Queue stopped/);
  assert.equal(item(e, 'a1').status, 'building');
  buildResult(e, {result: 'failed', published: false, publicationAbsenceVerified: true});
  assert.equal(item(e, 'a1').status, 'failed'); apply(e, 'b2', 'reserve_dispatch');
});

test('write failures before reservation retain received state and do not leak private error details', () => {
  const e = prepared(); const failed = env(e.data, {failBefore: key('a1')});
  assert.throws(() => reserve(failed), error => /Queue stopped/.test(error.message) &&
    !error.message.includes('private provider'));
  assert.equal(item(e, 'a1').status, 'received');
  assert.equal(e.context.inspectQueue().inFlightJobId, null);
});
