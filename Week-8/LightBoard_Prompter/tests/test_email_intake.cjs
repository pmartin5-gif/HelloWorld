'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const script = readFileSync(join(__dirname, '../email/Inbox.gs'), 'utf8');
const config = {account: 'owner@example.test', allowedSenders: ['artist@example.test'],
  labelId: 'Label_1', startMs: 1};

function message(id, body, overrides = {}) {
  return {id, threadId: 'thread1', internalDate: '1000', sizeEstimate: 500, labelIds: ['Label_1'],
    payload: {mimeType: 'text/plain', headers: [
      {name: 'From', value: 'Artist <artist@example.test>'},
      {name: 'Subject', value: 'Lightboard'}, {name: 'Message-ID', value: '<' + id + '@example.test>'}
    ], body: {data: Buffer.from(body).toString('base64url')}}, ...overrides};
}

function environment(messages = [], options = {}) {
  const data = {LB_ACTIVE_CONFIG: JSON.stringify(config), ...options.properties};
  const logs = [], calls = [];
  let failAfterWrite = options.failAfterWrite;
  const store = {getProperty: k => data[k] || null, getProperties: () => ({...data}),
    setProperty(k,v) { data[k] = v; if (failAfterWrite && k.startsWith('LB_MSG_')) {
      failAfterWrite = false; throw new Error('simulated crash after durable write');
    } }, deleteProperty: k => { delete data[k]; }};
  const lock = {tryLock: () => options.locked !== true, releaseLock: () => calls.push('unlock')};
  const context = vm.createContext({
    console: {log: x => logs.push(x)}, PropertiesService: {getScriptProperties: () => store},
    LockService: {getScriptLock: () => lock}, Utilities: {
      DigestAlgorithm: {SHA_256: 'sha256'}, Charset: {UTF_8: 'utf8'},
      newBlob: value => ({getBytes: () => [...Buffer.from(value)],
        getDataAsString: () => Buffer.from(value).toString('utf8')}),
      computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()],
      base64DecodeWebSafe: value => { calls.push('base64Decode'); return [...Buffer.from(value, 'base64url')]; }
    }, Gmail: {Users: {
      getProfile: () => ({emailAddress: options.account || config.account}),
      Labels: {list: () => ({labels: [{id: 'Label_1', name: 'Lightboard'}]})},
      Messages: {
        list: (_, args) => { calls.push(['list', args]); return options.page || {messages: messages.map(m => ({id: m.id}))}; },
        get: (_, id) => { if (options.apiFailure) throw new Error('quota API private error body');
          return messages.find(m => m.id === id); }
      }, Threads: {get: (_, id) => { calls.push(['thread', id]);
        return {id, messages: options.thread || messages}; }}
    }}
  });
  vm.runInContext(script, context);
  return {context, data, logs, calls};
}
function parse(env, m, thread = []) {
  return JSON.parse(JSON.stringify(env.context.lbInterpret(m, config, () => ({id: m.threadId, messages: thread}))));
}
function storedJobs(env) {
  return Object.keys(env.data).filter(k => k.startsWith('LB_MSG_'))
    .map(k => JSON.parse(env.data[k])).filter(x => x.job);
}

test('the exact prompt survives MIME decoding, boundary trimming and receipt storage', () => {
  const prompt = 'A red heart ♥\n  giving  light';
  const env = environment([message('ab1', ' \r\n' + prompt + '\r\n%%%  \r\n')]);
  const result = env.context.processInbox();
  assert.equal(result.received, 1);
  const job = storedJobs(env)[0].job;
  assert.equal(job.prompt, prompt);
  assert.equal(job.promptSha256, crypto.createHash('sha256').update(prompt).digest('hex'));
  assert.equal(job.status, 'received');
  assert.equal(job.buildDispatched, false); assert.equal(job.deviceConfirmed, false);
  assert.ok(!env.logs.join('').includes(prompt) && !env.logs.join('').includes('artist@example'));
});

test('observed 43-byte Advanced Gmail body records the exact saved prompt once without double decoding', () => {
  const prompt = 'An overflowing heart that keeps giving';
  const m = message('ab1', 'unused');
  const bytes = [...Buffer.from(prompt + '%%%\r\n')];
  assert.equal(bytes.length, 43);
  const headers = m.payload.headers;
  m.payload = {mimeType: 'multipart/alternative', headers, body: {size: 0}, parts: [
    {mimeType: 'text/plain', filename: '', body: {size: 43, data: bytes}},
    {mimeType: 'text/html', filename: '', body: {data: [...Buffer.from('<p>ignored</p>')]}}
  ]};
  const env = environment([m]);
  assert.equal(env.context.processInbox().received, 1);
  const job = storedJobs(env)[0].job;
  assert.equal(job.prompt, prompt);
  assert.equal(job.promptSha256, '738a280e61392c053d167c0ee30656c85712e1a021fab1bc2d1b54dc0718da63');
  assert.equal(env.context.processInbox().duplicates, 1);
  assert.equal(storedJobs(env).length, 1);
  assert.equal(env.calls.includes('base64Decode'), false);
});

test('signed and unsigned UTF-8 byte arrays preserve the same Unicode prompt and hash as base64', () => {
  const prompt = 'Blue light ♥\n  静かな海';
  const bytes = [...Buffer.from(prompt + '%%%')];
  const encoded = parse(environment(), message('ab1', prompt + '%%%')).job;
  for (const data of [bytes, bytes.map(n => n > 127 ? n - 256 : n)]) {
    const m = message('ab1', 'unused'); m.payload.body = {size: bytes.length, data};
    const env = environment(); const job = parse(env, m).job;
    assert.equal(job.prompt, prompt); assert.equal(job.promptSha256, encoded.promptSha256);
    assert.equal(env.calls.includes('base64Decode'), false);
  }
});

test('malformed and oversized byte arrays reject without creating a job or changing prior rejection history', () => {
  for (const data of [[256], [-129], [NaN], [1.5], ['65'], [null], Array(2), Array(32769).fill(65)]) {
    const m = message('ab2', 'unused'); m.payload.body = {data};
    const prior = JSON.stringify({messageId: 'ab1', outcome: 'rejected', reason: 'missing_inline_text'});
    const env = environment([m], {properties: {LB_MSG_ab1: prior}});
    const result = env.context.processInbox();
    assert.equal(result.rejected, 1); assert.equal(result.received, 0);
    assert.equal(storedJobs(env).length, 0); assert.equal(env.data.LB_MSG_ab1, prior);
    assert.equal(env.calls.includes('base64Decode'), false);
  }
});

test('reprocessing and interruption after a durable receipt cannot duplicate a job', () => {
  const env = environment([message('ab1', 'Heart%%%')], {failAfterWrite: true});
  assert.throws(() => env.context.processInbox(), /Intake stopped/);
  assert.equal(storedJobs(env).length, 1);
  assert.equal(env.context.processInbox().duplicates, 1);
  assert.equal(storedJobs(env).length, 1);
});

test('quoted markers, forwarded content and signature markers never create a job', () => {
  for (const body of ['Just discussing a heart', 'On Tuesday, A wrote:\n> Heart%%%',
    '> Heart%%%', '-- \nHeart%%%', '---------- Forwarded message ---------\nHeart%%%']) {
    assert.equal(parse(environment(), message('ab1', body)).outcome, 'ignored');
  }
  assert.equal(parse(environment(), message('ab1', 'Heart%%%\n\n-- \nSigned')).job.prompt, 'Heart');
});

test('unrecognized signatures and multiple markers stop instead of guessing a prompt', () => {
  assert.equal(parse(environment(), message('ab1', 'Heart%%%\nThanks, Artist')).outcome, 'ignored');
  assert.throws(() => parse(environment(), message('ab1', 'Heart%%% other%%%')), /ambiguous_marker/);
});

test('subject, allowlist, label, cutoff and ambiguous From headers are enforced', () => {
  const cases = [m => {m.payload.headers[0].value = 'attacker@example.test';},
    m => {m.payload.headers[1].value = 'Other';}, m => {m.labelIds = [];},
    m => {m.internalDate = '0';}, m => {m.labelIds.push('SPAM');},
    m => {m.payload.headers.push({name: 'From', value: 'artist@example.test'});}];
  for (const alter of cases) {
    const m = message('ab1', 'Heart%%%'); alter(m);
    assert.throws(() => parse(environment(), m));
  }
});

test('a standalone marker requires one direct earlier design from the same sender/thread', () => {
  const prior = message('ab1', 'Blue vessel\n  in the dark', {internalDate: '500'});
  const marker = message('ab2', '%%%');
  marker.payload.headers.push({name: 'In-Reply-To', value: '<ab1@example.test>'});
  const job = parse(environment(), marker, [prior, marker]).job;
  assert.equal(job.prompt, 'Blue vessel\n  in the dark'); assert.equal(job.designMessageId, 'ab1');
  const wrongSender = JSON.parse(JSON.stringify(prior)); wrongSender.payload.headers[0].value = 'other@example.test';
  for (const thread of [[], [wrongSender], [prior, prior], [{...prior, threadId: 'other'}],
    [{...prior, internalDate: '2000'}], [message('ab1', 'Already submitted%%%')]]) {
    assert.throws(() => parse(environment(), marker, thread));
  }
  assert.throws(() => parse(environment(), message('ab2', '%%%'), [prior]), /design_missing/);
});

test('HTML-only, attached text, non-UTF8, oversize and duplicate plain parts are rejected', () => {
  const variants = [m => {m.payload.mimeType = 'text/html';}, m => {m.payload.filename = 'prompt.txt';},
    m => {m.payload.headers.push({name: 'Content-Type', value: 'text/plain; charset=iso-8859-1'});},
    m => {m.sizeEstimate = 100001;}, m => {m.payload.body = {attachmentId: 'large'};},
    m => {m.payload = {mimeType: 'multipart/mixed', headers: m.payload.headers,
      parts: [m.payload, {...m.payload}]};}];
  for (const mutate of variants) {
    const m = message('ab1', 'Heart%%%'); mutate(m);
    assert.throws(() => parse(environment(), m));
  }
  assert.throws(() => parse(environment(), message('ab1', 'x'.repeat(2001) + '%%%')), /prompt_length/);
});

test('storage exhaustion preserves earlier jobs, leaves pending message retryable and cursor unmoved', () => {
  const properties = {};
  for (let i = 0; i < 68; i++) properties['reserve' + i] = 'x'.repeat(6000);
  const env = environment([message('ab1', 'Heart%%%')], {properties,
    page: {messages: [{id: 'ab1'}], nextPageToken: 'next'}});
  assert.equal(env.context.processInbox().status, 'storage_paused');
  assert.equal(env.data.LB_MSG_ab1, undefined); assert.equal(env.data.LB_PAGE_TOKEN, undefined);
  assert.equal(env.data.reserve0, properties.reserve0);
});

test('API failure and a busy lock cannot become a successful receipt', () => {
  const fail = environment([message('ab1', 'Heart%%%')], {apiFailure: true});
  assert.throws(() => fail.context.processInbox(), /Intake stopped/);
  assert.equal(storedJobs(fail).length, 0); assert.equal(fail.logs.length, 0);
  const busy = environment([message('ab1', 'Heart%%%')], {locked: true});
  assert.equal(busy.context.processInbox().status, 'busy'); assert.equal(busy.calls.length, 0);
});

test('mailbox binding and setup reruns preserve the private configuration and cutoff', () => {
  const env = environment([], {account: 'different@example.test'});
  assert.throws(() => env.context.processInbox(), /Intake stopped/);
  assert.throws(() => env.context.inspectIntake(), /Wrong mailbox/);
  const setup = environment();
  const original = setup.data.LB_ACTIVE_CONFIG;
  assert.equal(setup.context.setupInbox().status, 'already_configured');
  assert.equal(setup.data.LB_ACTIVE_CONFIG, original);
  const fresh = environment([], {properties: {LB_ACTIVE_CONFIG: '',
    LB_CONFIG: JSON.stringify({allowedSenders: ['Artist <artist@example.test>'], labelName: 'Lightboard'})}});
  assert.equal(fresh.context.setupInbox().status, 'configured');
  assert.equal(JSON.parse(fresh.data.LB_ACTIVE_CONFIG).account, config.account);
});

test('message-level cursor paging and inspection disclose only status and hashes', () => {
  const env = environment([message('ab1', 'Heart%%%')], {page: {messages: [{id: 'ab1'}], nextPageToken: 'page2'}});
  env.context.processInbox(); assert.equal(env.data.LB_PAGE_TOKEN, 'page2');
  assert.equal(env.context.inspectIntake().length, 1);
  assert.ok(!env.logs.join('').includes('Heart') && !env.logs.join('').includes('artist@'));
});

test('intake retains read-only Gmail and has no sending, dispatch or timer calls', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '../email/appsscript.json'), 'utf8'));
  assert.deepEqual(manifest.oauthScopes.filter(s => s.includes('/auth/gmail')), ['https://www.googleapis.com/auth/gmail.readonly']);
  assert.doesNotMatch(script, /GmailApp|MailApp|UrlFetchApp|ScriptApp|\.send\(|\.modify\(|\.trash\(/);
});

test('subject-only policy accepts an unlisted sender without label or marker, preserving exact prompt and deduplication', () => {
  const m = message('guest1', 'A blue star ♥\n  glowing softly', {labelIds: []});
  m.payload.headers[0].value = 'Guest <guest@another.example>';
  const env = environment([m]);
  const cutoff = JSON.parse(env.data.LB_ACTIVE_CONFIG).startMs;
  assert.equal(env.context.enableSubjectOnlyIntake().status, 'configured');
  assert.equal(JSON.parse(env.data.LB_ACTIVE_CONFIG).startMs, cutoff);
  assert.equal(env.context.processInbox().received, 1);
  const job = storedJobs(env)[0].job;
  assert.equal(job.sender, 'guest@another.example');
  assert.equal(job.prompt, 'A blue star ♥\n  glowing softly');
  assert.equal(env.calls.find(x => Array.isArray(x) && x[0] === 'list')[1].labelIds, undefined);
  assert.equal(env.context.processInbox().duplicates, 1);
  assert.equal(storedJobs(env).length, 1);
});

test('subject-only policy still rejects wrong subject, empty body, Spam, malformed sender and cross-sender marker reply', () => {
  for (const alter of [m => {m.payload.headers[1].value = 'Lightboard extra';},
    m => {m.payload.body.data = '';}, m => {m.labelIds.push('SPAM');},
    m => {m.payload.headers[0].value = 'invalid sender';}]) {
    const m = message('guest1', 'A blue star'); alter(m);
    const env = environment([m]); env.context.enableSubjectOnlyIntake();
    assert.equal(env.context.processInbox().received, 0);
    assert.equal(storedJobs(env).length, 0);
  }
  const prior = message('design1', 'A blue star', {internalDate: '500'});
  const marker = message('reply1', '%%%');
  marker.payload.headers[0].value = 'other@another.example';
  marker.payload.headers.push({name: 'In-Reply-To', value: '<design1@example.test>'});
  const env = environment([prior, marker]); env.context.enableSubjectOnlyIntake();
  const open = JSON.parse(env.data.LB_ACTIVE_CONFIG);
  assert.throws(() => env.context.lbInterpret(marker, open, () => ({id: 'thread1', messages: [prior, marker]})), /design_missing/);
});

test('subject-only activation preserves all receipts and scheduler state, clearing only obsolete query cursor', () => {
  const receipt = JSON.stringify({outcome: 'ignored', reason: 'missing_marker'});
  const active = JSON.stringify({dispatchId: 'already_reserved'});
  const env = environment([], {properties: {LB_MSG_old: receipt, LB_EMAIL_PILOT: active, LB_PAGE_TOKEN: 'old-query-page'}});
  env.context.enableSubjectOnlyIntake(); env.context.enableSubjectOnlyIntake();
  assert.equal(env.data.LB_MSG_old, receipt); assert.equal(env.data.LB_EMAIL_PILOT, active);
  assert.equal(env.data.LB_PAGE_TOKEN, undefined);
  assert.equal(JSON.parse(env.data.LB_ACTIVE_CONFIG).requireMarker, false);
});
