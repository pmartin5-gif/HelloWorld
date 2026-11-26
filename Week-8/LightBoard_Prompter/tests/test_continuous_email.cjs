'use strict';
// Focused scheduling checks only; no Gmail/GitHub/model/board requests.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '../email/Automatic.gs'), 'utf8');
const inboxSource = readFileSync(join(__dirname, '../email/Inbox.gs'), 'utf8');
const senderPolicySource = inboxSource.slice(inboxSource.indexOf('function lbSenderAllowed_('),
  inboxSource.indexOf('function lbHeader('));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const commit = 'a'.repeat(40), repository = 'pmartin5-gif/HelloWorld';
const foundation = JSON.parse(readFileSync(join(__dirname, '../device/foundation-lock.json'))).foundation_id;

function harness() {
  let now = Date.parse('2026-11-26T22:00:00Z'), timers = [], uuid = 0, posts = 0, complete = false;
  let conclusion = 'success', crashAfterMarker = false;
  const data = {LB_ACTIVE_CONFIG: JSON.stringify({account: 'bot@example.test', allowedSenders: ['owner@example.test']}),
    LB_QUEUE_JOB_old: 'untouched'};
  const state = () => JSON.parse(data.LB_EMAIL_PILOT || 'null');
  const run = () => ({id: 100 + posts, workflow_id: 7, head_sha: state().sourceCommit, head_branch: 'main',
    event: 'workflow_dispatch', run_attempt: 1, path: '.github/workflows/lightboard-email-pilot.yml',
    repository: {full_name: repository, private: false},
    display_title: 'Lightboard email ' + state().jobId + ' ' + state().dispatchId,
    html_url: 'https://github.com/' + repository + '/actions/runs/' + (100 + posts),
    status: complete ? 'completed' : 'in_progress', conclusion: complete ? conclusion : null});
  const report = () => ({schemaVersion: 1, operation: 'email_pilot', result: 'published',
    jobId: state().jobId, dispatchId: state().dispatchId, promptSha256: state().promptSha256,
    commitSha: state().sourceCommit, runId: String(run().id), runAttempt: 1, repository,
    workflowPath: '.github/workflows/lightboard-email-pilot.yml', foundation, published: true,
    modelRequests: 1, automaticUpdates: true, deviceConfirmed: false,
    version: 'ota-pilot-' + 'b'.repeat(24), sha256: 'c'.repeat(64), bytes: 1000000});
  const store = {getProperties: () => ({...data}), getProperty: k => data[k] || null,
    setProperty: (k, v) => {data[k] = v;}};
  const context = vm.createContext({Date: class extends Date {static now() {return now;}},
    console: {log() {}}, LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})},
    PropertiesService: {getScriptProperties: () => store},
    ScriptApp: {getProjectTriggers: () => timers, deleteTrigger: t => {timers = timers.filter(x => x !== t);},
      newTrigger: name => ({timeBased() {return this;}, everyMinutes() {return this;},
        create() {timers.push({getHandlerFunction: () => name});}})},
    Utilities: {getUuid: () => (++uuid).toString(16).padStart(32, '0')},
    Gmail: {Users: {getProfile: () => ({emailAddress: 'bot@example.test'})}},
    lbReport: x => x, lbHash: hash, lbAddress: x => x, lbConfig: () => JSON.parse(data.LB_ACTIVE_CONFIG),
    lbSet(st, snapshot, key, value) {
      const text = JSON.stringify(value); st.setProperty(key, text); snapshot[key] = text;
      if (crashAfterMarker && key.startsWith('LB_EMAIL_PUBLISHED_')) {
        crashAfterMarker = false; throw new Error('simulated interruption after durable publication receipt');
      }
    },
    LBGH: {repository}, processInbox: () => ({status: 'record_only'}),
    lbghCheckSource_: () => '7', lbghCheckFile_() {},
    lbghApi_() {posts++; throw new Error('lost POST response');},
    lbghStepLog_: () => report(),
    lbghGet_(snapshot, path) {
      if (path === '/commits/main') return {sha: commit};
      if (path.includes('/jobs?')) return {total_count: 1, jobs: [{id: 200, run_id: run().id,
        name: 'email-to-panel', conclusion, steps: [{name: 'Record email publication', conclusion: 'success', number: 11}]}]};
      return path.includes('/runs?') ? {workflow_runs: [run()]} : run();
    }});
  vm.runInContext(senderPolicySource, context);
  vm.runInContext(source, context);
  return {context, data, state, get posts() {return posts;}, get timers() {return timers.length;},
    advance: ms => {now += ms;}, finish: result => {complete = true; conclusion = result || 'success';},
    crashNextMarker: () => {crashAfterMarker = true;},
    receipt(id, offset = 1) {
      const prompt = 'Scene ' + id;
      data['LB_MSG_' + id] = JSON.stringify({outcome: 'received', job: {id: 'lb-123456789abc-' + id,
        sender: 'owner@example.test', prompt, promptSha256: hash(prompt), receivedAt: new Date(now + offset).toISOString()}});
    }};
}

test('two new emails publish serially; repeated starts and ticks never resend; timer stays active', () => {
  const h = harness(), c = h.context;
  c.startContinuousEmail(); const cutoff = h.state().startMs;
  h.receipt('old', -1); h.receipt('first', 1); h.receipt('second', 2);
  c.startContinuousEmail(); assert.equal(h.state().startMs, cutoff); assert.equal(h.timers, 1);
  c.emailPilotTick(); assert.equal(h.posts, 1); assert.equal(h.state().jobId, 'lb-123456789abc-first');
  c.emailPilotTick(); assert.equal(h.posts, 1);
  h.finish(); c.emailPilotTick();
  assert.equal(h.state().status, 'delivery_interval'); assert.equal(h.state().active, true);
  assert.ok(h.data['LB_EMAIL_PUBLISHED_lb-123456789abc-first']);
  c.emailPilotTick(); assert.equal(h.posts, 1);
  h.advance(6 * 60 * 1000); c.emailPilotTick(); assert.equal(h.posts, 2);
  assert.equal(h.state().jobId, 'lb-123456789abc-second');
  c.emailPilotTick(); assert.equal(h.state().active, true); assert.equal(h.timers, 1);
  h.advance(6 * 60 * 1000); c.emailPilotTick(); assert.equal(h.posts, 2);
  assert.equal(h.state().status, 'waiting_for_new_email'); assert.equal(h.data.LB_QUEUE_JOB_old, 'untouched');
  const receipt = JSON.parse(h.data['LB_EMAIL_PUBLISHED_lb-123456789abc-second']);
  assert.equal(receipt.result.deviceConfirmed, false);
});

test('interruption after completion marker resumes without another POST or extending delivery interval', () => {
  const h = harness(), c = h.context; c.startContinuousEmail(); h.receipt('first'); c.emailPilotTick();
  h.finish(); h.crashNextMarker(); c.emailPilotTick();
  const completedMs = JSON.parse(h.data['LB_EMAIL_PUBLISHED_lb-123456789abc-first']).publishedMs;
  assert.ok(h.state().dispatchId); h.advance(60000); c.emailPilotTick();
  assert.equal(h.state().notBeforeMs, completedMs + 6 * 60 * 1000);
  assert.equal(h.state().dispatchId, undefined); assert.equal(h.posts, 1);
});

test('migration archives completed first pilot and excludes all earlier receipts; stop/start preserves cutoff', () => {
  const h = harness(), c = h.context;
  c.startEmailPilot(); h.receipt('pilot'); c.emailPilotTick(); h.finish(); c.emailPilotTick();
  assert.equal(h.state().active, false); const original = h.data.LB_EMAIL_PILOT;
  h.advance(60000); c.startContinuousEmail();
  assert.equal(h.data.LB_EMAIL_FIRST_PILOT, original); assert.equal(h.state().mode, 'continuous');
  c.emailPilotTick(); assert.equal(h.posts, 1); const cutoff = h.state().startMs;
  c.stopEmailProcessing(); assert.equal(h.timers, 0);
  h.advance(60000); c.startContinuousEmail();
  assert.equal(h.state().startMs, cutoff); assert.equal(h.timers, 1);
});

test('failure and ambiguous timeout pause further generation without clearing the reserved email', () => {
  for (const failure of ['failure', 'timeout']) {
    const h = harness(), c = h.context; c.startContinuousEmail(); h.receipt('first'); c.emailPilotTick();
    if (failure === 'failure') h.finish('failure'); else h.advance(31 * 60 * 1000);
    c.emailPilotTick(); assert.equal(h.state().active, false); assert.ok(h.state().dispatchId);
    assert.equal(h.timers, 0); c.startContinuousEmail(); c.emailPilotTick(); assert.equal(h.posts, 1);
  }
});

test('continuous scheduler accepts an intake receipt from an unlisted sender in subject-only mode', () => {
  const h = harness(), c = h.context;
  const config = JSON.parse(h.data.LB_ACTIVE_CONFIG); config.allowAnySender = true; config.requireMarker = false;
  h.data.LB_ACTIVE_CONFIG = JSON.stringify(config);
  c.startContinuousEmail(); h.receipt('guest');
  const receipt = JSON.parse(h.data.LB_MSG_guest); receipt.job.sender = 'guest@another.example';
  h.data.LB_MSG_guest = JSON.stringify(receipt);
  c.emailPilotTick(); assert.equal(h.posts, 1); assert.equal(h.state().jobId, 'lb-123456789abc-guest');
});
