'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');

function env(options = {}) {
  const account = 'owner@example.test', sender = 'artist@example.test';
  const config = {account, allowedSenders: [sender], labelId: 'Label_1', startMs: 1};
  const data = {LB_ACTIVE_CONFIG: JSON.stringify(config), LB_MSG_ab1: JSON.stringify({messageId: 'ab1',
    outcome: 'rejected', reason: 'missing_inline_text'}), ...(options.properties || {})};
  const original = JSON.stringify(data), calls = [], logs = [];
  const message = {id: 'ab1', threadId: 'thread1', internalDate: '1000', labelIds: ['Label_1'],
    payload: {mimeType: 'multipart/alternative', headers: [{name: 'Subject', value: 'Lightboard'},
      {name: 'From', value: sender}], parts: options.parts || []}};
  const context = vm.createContext({console: {log: s => logs.push(s)},
    PropertiesService: {getScriptProperties: () => ({getProperty: k => data[k], getProperties: () => ({...data})})},
    Gmail: {Users: {getProfile: () => ({emailAddress: options.account || account}),
      Messages: {get: (_, id, args) => { calls.push({id, args});
        if (options.apiError) throw new Error('private provider failure: secret');
        return message;
      }}}}});
  for (const file of ['Inbox.gs', 'Diagnose.gs']) {
    vm.runInContext(readFileSync(join(__dirname, '../email', file), 'utf8'), context);
  }
  return {context, calls, logs, data, original};
}

test('diagnosis reports inline, empty and externally stored body shapes without body/IDs/addresses', () => {
  const secretText = Buffer.from('Private prompt%%%').toString('base64url');
  const e = env({parts: [
    {mimeType: 'text/plain', filename: '', body: {size: 17, data: secretText}},
    {mimeType: 'text/plain', filename: '', body: {size: 17, attachmentId: 'private-attachment-reference'}},
    {mimeType: 'text/plain', filename: '', body: {size: 0}}
  ]});
  const result = e.context.diagnoseIntake();
  assert.equal(result.status, 'diagnostic_only');
  assert.equal(result.parts[1].dataType, 'string');
  assert.equal(result.parts[2].externalBodyPresent, true);
  assert.equal(result.parts[3].dataType, 'undefined');
  assert.equal(e.calls.length, 1); assert.equal(e.calls[0].id, 'ab1');
  assert.equal(JSON.stringify(e.data), e.original);
  for (const value of ['Private prompt', secretText, 'private-attachment-reference', 'artist@', 'owner@', 'ab1']) {
    assert.ok(!e.logs.join('').includes(value));
  }
});

test('wrong mailbox or multiple matching rejections stop before reading a message', () => {
  for (const options of [{account: 'other@example.test'}, {properties: {LB_MSG_ab2:
    JSON.stringify({messageId: 'ab2', outcome: 'rejected', reason: 'missing_inline_text'})}}]) {
    const e = env(options);
    assert.throws(() => e.context.diagnoseIntake(), /no message or receipt was changed/);
    assert.equal(e.calls.length, 0); assert.equal(e.logs.length, 0);
    assert.equal(JSON.stringify(e.data), e.original);
  }
});

test('provider errors and excess MIME depth stop with sanitized output and unchanged receipts', () => {
  let nested = {mimeType: 'text/plain', body: {}};
  for (let i = 0; i < 12; i++) nested = {mimeType: 'multipart/mixed', parts: [nested]};
  for (const options of [{apiError: true}, {parts: [nested]}]) {
    const e = env(options);
    assert.throws(() => e.context.diagnoseIntake(), error => !error.message.includes('secret') &&
      error.message.startsWith('Metadata diagnosis stopped'));
    assert.equal(e.logs.length, 0); assert.equal(JSON.stringify(e.data), e.original);
  }
});
