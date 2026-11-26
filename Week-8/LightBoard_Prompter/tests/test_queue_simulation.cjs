'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {initialState, transition, statusText} = require('../email/queue-simulation.cjs');
const publication = {verified: true, version: 'ota-pilot-' + 'a'.repeat(24),
  foundation: 'b'.repeat(64), sha256: 'c'.repeat(64)};

test('FIFO, one in flight, duplicate events and published-versus-installed separation', () => {
  let s = initialState();
  const event = (type, jobId, rest = {}) => {s = transition(s, {id: String(s.events.length), type, jobId, ...rest});};
  event('receive', 'one'); event('receive', 'two');
  const same = transition(s, {id: '0', type: 'receive', jobId: 'one'});
  assert.deepEqual(same, s);
  assert.throws(() => event('start', 'two'), /FIFO/);
  event('start', 'one');
  assert.throws(() => event('start', 'two'), /in-flight/);
  event('publish', 'one', publication);
  assert.match(statusText(s.jobs[0]), /unconfirmed/);
  assert.throws(() => event('start', 'two'), /in-flight/);
  assert.throws(() => event('report', 'one', {...publication, simulated: true,
    healthPassed: true, otaState: 'VALID', version: 'wrong'}), /Matching/);
  event('report', 'one', {...publication, simulated: true, healthPassed: true, otaState: 'VALID'});
  assert.equal(s.jobs[0].status, 'device_confirmed_simulated');
  assert.equal(s.jobs[0].installedOnRealBoard, false);
  assert.match(statusText(s.jobs[0]), /real device installation is unverified/);
  event('start', 'two');
});

test('quota pause blocks later work until resume; failures and timeouts never report installed', () => {
  let s = initialState(); let id = 0;
  const apply = (type, jobId, rest = {}) => {s = transition(s, {id: String(++id), type, jobId, ...rest});};
  apply('receive', 'one'); apply('receive', 'two'); apply('quota', 'one');
  assert.throws(() => apply('start', 'two'), /FIFO/);
  assert.match(statusText(s.jobs[0]), /no paid fallback/);
  apply('resume', 'one'); apply('start', 'one'); apply('fail', 'one', {reason: 'compile_failed'});
  apply('start', 'two'); apply('publish', 'two', publication);
  apply('timeout', 'two', {reason: 'device_offline'});
  assert.equal(s.jobs[1].status, 'failed'); assert.equal(s.jobs[1].installedOnRealBoard, false);
  assert.throws(() => apply('report', 'two', {...publication, simulated: true, healthPassed: true, otaState: 'VALID'}));
});

test('this reducer refuses live operation and incomplete or unhealthy publication reports', () => {
  assert.throws(() => transition({simulation: false, jobs: [], events: []}, {id: '1'}), /simulation-only/);
  let s = transition(initialState(), {id: '1', type: 'receive', jobId: 'one'});
  s = transition(s, {id: '2', type: 'start', jobId: 'one'});
  assert.throws(() => transition(s, {id: '3', type: 'publish', jobId: 'one', ...publication, verified: false}));
  s = transition(s, {id: '3', type: 'publish', jobId: 'one', ...publication});
  for (const change of [{simulated: false}, {healthPassed: false}, {otaState: 'PENDING_VERIFY'}, {sha256: 'wrong'}]) {
    assert.throws(() => transition(s, {id: '4', type: 'report', jobId: 'one', ...publication,
      simulated: true, healthPassed: true, otaState: 'VALID', ...change}));
  }
});
