/** Durable queue, installed alongside Code.gs. No network, dispatch, triggers or mail writes. */
const LBQ = Object.freeze({schemaVersion: 1, githubAdapterVersion: 1, publicationAdapterVersion: 1,
  prefix: 'LB_QUEUE_JOB_', configKey: 'LB_QUEUE_CONFIG',
  active: ['dispatch_pending', 'dispatch_unknown', 'building', 'published', 'review_required',
    'publication_pending', 'publication_unknown', 'publishing'],
  statuses: ['received', 'quota_paused', 'dispatch_pending', 'dispatch_unknown', 'building',
    'built', 'published', 'review_required', 'failed', 'publication_pending', 'publication_unknown', 'publishing']});

function lbqRequire_(ok) { lbRequire(ok, 'LB_QUEUE_INVALID'); }
function lbqCopy_(value) { return JSON.parse(JSON.stringify(value)); }
function lbqTime_(value) {
  lbqRequire_(typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value);
  return value;
}

function lbqConfig_(snapshot) {
  const inbox = JSON.parse(snapshot.LB_ACTIVE_CONFIG || 'null');
  lbqRequire_(inbox && lbAddress(inbox.account) === inbox.account);
  const config = JSON.parse(snapshot[LBQ.configKey] || 'null');
  lbqRequire_(config && config.schemaVersion === 1 &&
    ['record_only', 'manual_saved_build', 'manual_saved_publication'].includes(config.mode) &&
    config.accountSha256 === lbHash(inbox.account) && config.board === 'esp32-32x32');
  lbqTime_(config.createdAt);
  return config;
}

function lbqReceipt_(key, raw, config) {
  const record = JSON.parse(raw);
  lbqRequire_(record && record.schemaVersion === 1 && key === 'LB_MSG_' + record.messageId);
  if (record.outcome !== 'received') {
    lbqRequire_(['ignored', 'rejected'].includes(record.outcome) && !record.job); return null;
  }
  const job = record.job;
  lbqRequire_(job && /^[a-z0-9]{1,64}$/i.test(record.messageId) && job.messageId === record.messageId &&
    job.id === 'lb-' + config.accountSha256.slice(0, 12) + '-' + record.messageId &&
    job.status === 'received' && typeof job.prompt === 'string' &&
    lbPrompt(job.prompt) === job.prompt && job.promptSha256 === lbHash(job.prompt) &&
    job.buildDispatched === false && job.published === false && job.deviceConfirmed === false);
  lbqTime_(job.receivedAt); lbqTime_(record.recordedAt);
  return {record, job};
}

function lbqRead_(snapshot, config) {
  const rows = Object.keys(snapshot).filter(k => k.startsWith(LBQ.prefix)).map(key => {
    const q = JSON.parse(snapshot[key]);
    const source = q && snapshot[q.receiptKey];
    lbqRequire_(source);
    const receipt = lbqReceipt_(q.receiptKey, source, config);
    lbqRequire_(receipt && q.schemaVersion === 1 && key === LBQ.prefix + q.jobId &&
      q.jobId === receipt.job.id && q.promptSha256 === receipt.job.promptSha256 &&
      q.receivedAt === receipt.job.receivedAt && q.receiptSha256 === lbHash(source) &&
      LBQ.statuses.includes(q.status) && Number.isSafeInteger(q.revision) && q.revision >= 1 &&
      Number.isSafeInteger(q.attempt) && q.attempt >= 0 && q.deviceConfirmed === false);
    lbqTime_(q.importedAt); lbqTime_(q.updatedAt);
    if (q.status === 'received' || q.status === 'quota_paused') {
      lbqRequire_(q.attempt === 0 && q.dispatch === null && q.publication === null);
    } else {
      lbqRequire_(q.attempt === 1 && q.dispatch && typeof q.dispatch.id === 'string' &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(q.dispatch.id));
      lbqTime_(q.dispatch.reservedAt);
      if (['building', 'built', 'published', 'failed'].includes(q.status)) {
        lbqRequire_(/^[1-9][0-9]{0,19}$/.test(q.dispatch.runId || '') &&
          /^[a-f0-9]{40}$/.test(q.dispatch.commitSha || ''));
      }
      if (q.dispatch.resultSha256 !== undefined || q.dispatch.workflowJobId !== undefined) {
        lbqRequire_(/^[a-f0-9]{64}$/.test(q.dispatch.resultSha256 || '') &&
          /^[1-9][0-9]{0,19}$/.test(q.dispatch.workflowJobId || ''));
      }
    }
    if (q.publicationDispatch) {
      const p = q.publicationDispatch;
      lbqRequire_(['publication_pending', 'publication_unknown', 'publishing', 'published', 'review_required'].includes(q.status) &&
        /^gh_[a-f0-9]{32}$/.test(p.id || '') && /^[a-f0-9]{40}$/.test(p.sourceCommit || '') &&
        p.priorResultSha256 === q.dispatch.resultSha256 && /^[a-f0-9]{64}$/.test(p.priorResultSha256 || '') &&
        /^[1-9][0-9]{0,19}$/.test(q.dispatch.runId || '') &&
        (p.runId === null || /^[1-9][0-9]{0,19}$/.test(p.runId)));
      lbqTime_(p.reservedAt);
      if (['publishing', 'published'].includes(q.status)) lbqRequire_(p.runId !== null);
    } else lbqRequire_(!['publication_pending', 'publication_unknown', 'publishing'].includes(q.status));
    if (q.publication !== null) {
      lbqRequire_(q.status === 'published' || q.status === 'review_required');
      lbqPublication_(q.publication);
    } else lbqRequire_(q.status !== 'published');
    return q;
  }).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.jobId.localeCompare(b.jobId));
  lbqRequire_(rows.filter(q => LBQ.active.includes(q.status)).length <= 1);
  return rows;
}

function lbqImport_(store, snapshot, config, now) {
  lbqRead_(snapshot, config); // Validate all existing state before importing anything.
  const incoming = Object.keys(snapshot).filter(k => k.startsWith('LB_MSG_'))
    .map(key => ({key, raw: snapshot[key], receipt: lbqReceipt_(key, snapshot[key], config)}))
    .filter(x => x.receipt)
    .sort((a, b) => a.receipt.job.receivedAt.localeCompare(b.receipt.job.receivedAt) ||
      a.receipt.job.id.localeCompare(b.receipt.job.id));
  let imported = 0;
  for (const item of incoming) {
    const key = LBQ.prefix + item.receipt.job.id;
    if (snapshot[key]) continue;
    const q = {schemaVersion: 1, jobId: item.receipt.job.id, receiptKey: item.key,
      receiptSha256: lbHash(item.raw), promptSha256: item.receipt.job.promptSha256,
      receivedAt: item.receipt.job.receivedAt, importedAt: now, updatedAt: now,
      status: 'received', revision: 1, attempt: 0, dispatch: null, publication: null,
      deviceConfirmed: false, lastEvent: null};
    lbSet(store, snapshot, key, q); // One atomic record, no separately updated queue index.
    imported++;
  }
  return imported;
}

function lbqSummary_(rows, config) {
  const active = rows.find(q => LBQ.active.includes(q.status));
  const head = active || rows.find(q => ['received', 'quota_paused'].includes(q.status));
  const mode = config ? config.mode : 'record_only';
  return {mode, dispatchEnabled: mode !== 'record_only', automaticDispatchEnabled: false, jobs: rows.length,
    headJobId: head ? head.jobId : null, inFlightJobId: active ? active.jobId : null,
    items: rows.map((q, index) => ({jobId: q.jobId, position: index + 1, status: q.status,
      promptSha256: q.promptSha256, revision: q.revision, attempt: q.attempt,
      runId: q.dispatch ? q.dispatch.runId : null,
      commitSha: q.dispatch ? q.dispatch.commitSha : null,
      resultSha256: q.dispatch ? (q.dispatch.resultSha256 || null) : null,
      publicationRunId: q.publicationDispatch ? q.publicationDispatch.runId : null,
      published: q.publication !== null, deviceConfirmed: false}))};
}

function lbqLocked_(work) {
  const lock = LockService.getScriptLock(); // Same lock as processInbox.
  if (!lock.tryLock(1000)) return lbReport({status: 'busy', dispatchEnabled: false});
  try {
    const store = PropertiesService.getScriptProperties();
    return work(store, store.getProperties(), new Date().toISOString());
  } catch (error) {
    if (error.message === 'LB_STORAGE_PAUSED') {
      return lbReport({status: 'storage_paused', dispatchEnabled: false});
    }
    // Never leak property values, prompts, sender addresses or future API credentials.
    throw new Error('Queue stopped; saved history retained. Check inbox setup, queue state and storage.');
  } finally { lock.releaseLock(); }
}

function setupQueue() {
  return lbqLocked_((store, snapshot, now) => {
    if (snapshot[LBQ.configKey]) {
      const config = lbqConfig_(snapshot);
      return lbReport({status: 'already_configured', mode: config.mode,
        dispatchEnabled: config.mode !== 'record_only', automaticDispatchEnabled: false});
    }
    const config = lbConfig(store);
    lbqRequire_(config && lbAddress(config.account) === config.account);
    lbSet(store, snapshot, LBQ.configKey, {schemaVersion: 1, mode: 'record_only',
      accountSha256: lbHash(config.account), board: 'esp32-32x32', createdAt: now});
    return lbReport({status: 'configured', mode: 'record_only', dispatchEnabled: false});
  });
}

function syncQueue() {
  return lbqLocked_((store, snapshot, now) => {
    const config = lbqConfig_(snapshot);
    const imported = lbqImport_(store, snapshot, config, now);
    return lbReport({status: 'synced', imported, ...lbqSummary_(lbqRead_(snapshot, config), config)});
  });
}

function inspectQueue() {
  return lbqLocked_((store, snapshot) => {
    const config = lbqConfig_(snapshot);
    const rows = lbqRead_(snapshot, config);
    return lbReport({status: 'snapshot', ...lbqSummary_(rows, config)});
  });
}

function lbqPublication_(p) {
  lbqRequire_(p && /^ota-pilot-[a-f0-9]{24}$/.test(p.version || '') &&
    /^[a-f0-9]{64}$/.test(p.foundation || '') && /^[a-f0-9]{64}$/.test(p.sha256 || '') &&
    Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= 1310720);
}

/** Adapter boundary only: caller must verify remote evidence, not accept an email/web payload. */
function lbqTransition_(rows, jobId, event, now) {
  const current = rows.find(q => q.jobId === jobId);
  lbqRequire_(current && event && /^[a-zA-Z0-9_-]{1,100}$/.test(event.id || '') &&
    Number.isSafeInteger(event.expectedRevision));
  lbqTime_(now);
  const eventHash = lbHash(JSON.stringify(event));
  if (current.lastEvent && current.lastEvent.id === event.id) {
    lbqRequire_(current.lastEvent.sha256 === eventHash);
    return {changed: false, job: lbqCopy_(current)};
  }
  lbqRequire_(current.revision === event.expectedRevision);
  const q = lbqCopy_(current);
  const active = rows.find(x => LBQ.active.includes(x.status));
  const head = rows.find(x => ['received', 'quota_paused'].includes(x.status));
  if (event.type === 'reserve_publication') {
    lbqRequire_(!active && q.status === 'built' && !q.publicationDispatch &&
      !rows.slice(0, rows.indexOf(current)).some(x => ['received', 'quota_paused'].includes(x.status)) &&
      /^gh_[a-f0-9]{32}$/.test(event.id) && /^[a-f0-9]{40}$/.test(event.sourceCommit || '') &&
      event.priorResultSha256 === q.dispatch.resultSha256 && /^[a-f0-9]{64}$/.test(event.priorResultSha256 || ''));
    q.publicationDispatch = {id: event.id, reservedAt: now, sourceCommit: event.sourceCommit,
      priorResultSha256: event.priorResultSha256, runId: null};
    q.status = 'publication_pending';
  } else if (event.type === 'publication_unknown') {
    lbqRequire_(q.status === 'publication_pending' && q.publicationDispatch); q.status = 'publication_unknown';
  } else if (event.type === 'bind_publication') {
    const p = q.publicationDispatch;
    lbqRequire_(p && ['publication_pending', 'publication_unknown', 'review_required'].includes(q.status) &&
      p.runId === null && event.dispatchId === p.id && event.sourceCommit === p.sourceCommit &&
      event.promptSha256 === q.promptSha256 && /^[1-9][0-9]{0,19}$/.test(event.runId || ''));
    p.runId = event.runId; q.status = 'publishing';
  } else if (event.type === 'publication_result') {
    const p = q.publicationDispatch;
    lbqRequire_(p && ['publishing', 'review_required'].includes(q.status) && p.runId !== null &&
      event.runId === p.runId && event.sourceCommit === p.sourceCommit &&
      event.promptSha256 === q.promptSha256 && /^[a-f0-9]{64}$/.test(event.resultSha256 || '') &&
      /^[1-9][0-9]{0,19}$/.test(event.workflowJobId || ''));
    lbqPublication_(event.publication);
    q.publication = lbqCopy_(event.publication); q.status = 'published';
    p.resultSha256 = event.resultSha256; p.workflowJobId = event.workflowJobId;
  } else if (event.type === 'reserve_dispatch') {
    lbqRequire_(!active && head === current && q.status === 'received');
    q.status = 'dispatch_pending'; q.attempt = 1;
    q.dispatch = {id: event.id, reservedAt: now, runId: null, commitSha: null};
  } else if (event.type === 'quota_pause') {
    lbqRequire_(!active && head === current && q.status === 'received');
    q.status = 'quota_paused';
  } else if (event.type === 'resume') {
    lbqRequire_(q.status === 'quota_paused'); q.status = 'received';
  } else if (event.type === 'dispatch_unknown') {
    lbqRequire_(q.status === 'dispatch_pending'); q.status = 'dispatch_unknown';
  } else if (event.type === 'bind_run') {
    lbqRequire_(['dispatch_pending', 'dispatch_unknown', 'review_required'].includes(q.status) &&
      q.dispatch.runId === null && q.publication === null &&
      event.dispatchId === q.dispatch.id && event.promptSha256 === q.promptSha256 &&
      /^[1-9][0-9]{0,19}$/.test(event.runId || '') && /^[a-f0-9]{40}$/.test(event.commitSha || ''));
    q.dispatch.runId = event.runId; q.dispatch.commitSha = event.commitSha; q.status = 'building';
  } else if (event.type === 'reconcile_run') {
    lbqRequire_(q.status === 'review_required' && q.publication === null &&
      q.dispatch.runId !== null && event.runId === q.dispatch.runId &&
      event.commitSha === q.dispatch.commitSha && event.promptSha256 === q.promptSha256);
    q.status = 'building';
  } else if (event.type === 'build_result') {
    lbqRequire_(q.status === 'building' && event.runId === q.dispatch.runId &&
      event.commitSha === q.dispatch.commitSha && event.promptSha256 === q.promptSha256);
    if (event.result === 'built') {
      lbqRequire_(event.published === false); q.status = 'built';
    } else if (event.result === 'failed') {
      // A failed workflow does not prove publication never happened: require reconciliation.
      lbqRequire_(event.published === false && event.publicationAbsenceVerified === true);
      q.status = 'failed';
    } else if (event.result === 'published') {
      lbqRequire_(event.published === true); lbqPublication_(event.publication);
      q.publication = lbqCopy_(event.publication); q.status = 'published';
    } else lbqRequire_(false);
    if (event.resultSha256 !== undefined || event.workflowJobId !== undefined) {
      lbqRequire_(/^[a-f0-9]{64}$/.test(event.resultSha256 || '') &&
        /^[1-9][0-9]{0,19}$/.test(event.workflowJobId || ''));
      q.dispatch.resultSha256 = event.resultSha256;
      q.dispatch.workflowJobId = event.workflowJobId;
    }
  } else if (event.type === 'timeout') {
    lbqRequire_(LBQ.active.includes(q.status) && q.status !== 'review_required');
    // Never release an uncertain build/publication/board timeout to a later job.
    q.status = 'review_required';
  } else lbqRequire_(false); // No device-confirmed transition until authenticated reporting exists.
  q.revision++; q.updatedAt = now;
  q.lastEvent = {id: event.id, sha256: eventHash};
  return {changed: true, job: q};
}

/** Future adapter entry: reserve must be durable BEFORE any HTTP request. Not a live dispatcher. */
function lbqApplyEvent_(jobId, event) {
  return lbqLocked_((store, snapshot, now) => {
    const config = lbqConfig_(snapshot);
    lbqImport_(store, snapshot, config, now);
    const rows = lbqRead_(snapshot, config);
    const result = lbqTransition_(rows, jobId, event, now);
    if (result.changed) lbSet(store, snapshot, LBQ.prefix + jobId, result.job);
    return {changed: result.changed, job: result.job};
  });
}
