/** Automatic email intake. Independent of the historical saved-scene queue. */
const LBAUTO = Object.freeze({key: 'LB_EMAIL_PILOT', handler: 'emailPilotTick',
  completedPrefix: 'LB_EMAIL_PUBLISHED_', deliveryIntervalMs: 6 * 60 * 1000,
  workflow: 'lightboard-email-pilot.yml', workflowPath: '.github/workflows/lightboard-email-pilot.yml',
  workflowSha256: 'b143bdb89b20bff8a062b88cde032b6bad622cdc7e25259ded05a08116238de3',
  foundation: 'a529d5f9a72ca4858e0ab09ae66ec5eaecff656fdeb6d6a4f040e40633959ec1'});

function lbaLocked_(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return lbReport({status: 'busy'});
  try {
    const store = PropertiesService.getScriptProperties();
    return work(store, store.getProperties());
  } catch (error) {
    // Provider responses, prompts and credentials are never printed here.
    return lbReport({status: 'waiting_or_stopped', reason:
      /^LB_(?:GH|AUTO)_[A-Z_]+$/.test(error.message) ? error.message : 'LB_AUTO_ERROR'});
  } finally { lock.releaseLock(); }
}
function lbaRequire_(condition, code) { if (!condition) throw new Error('LB_AUTO_' + code); }
function lbaState_(snapshot) {
  const state = JSON.parse(snapshot[LBAUTO.key] || 'null');
  if (!state) return null;
  lbaRequire_(state.schemaVersion === 1 && /^[a-f0-9]{40}$/.test(state.sourceCommit || '') &&
    /^[1-9][0-9]*$/.test(state.workflowId || '') && Number.isSafeInteger(state.startMs) &&
    state.accountSha256 === lbHash(JSON.parse(snapshot.LB_ACTIVE_CONFIG || 'null').account), 'CONFIG');
  return state;
}
function lbaReport_(state) {
  return lbReport({status: state ? state.status : 'not_started', automaticEmailProcessing: !!(state && state.active),
    ...(state ? {mode: state.mode || 'single_email', startedAt: new Date(state.startMs).toISOString(), jobId: state.jobId || null,
      runUrl: state.runId ? 'https://github.com/' + LBGH.repository + '/actions/runs/' + state.runId : null,
      ...(state.lastPublished ? {lastPublished: state.lastPublished} : {}),
      ...(state.notBeforeMs > Date.now() ? {nextBuildAfter: new Date(state.notBeforeMs).toISOString()} : {}),
      ...(state.result ? {published: true, version: state.result.version, modelRequests: 1} : {})} : {}),
    deviceConfirmed: false});
}
function lbaSave_(store, snapshot, state) { lbSet(store, snapshot, LBAUTO.key, state); }
function lbaRemoveTriggers_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === LBAUTO.handler)
    .forEach(t => ScriptApp.deleteTrigger(t));
}
function lbaCreateTrigger_() {
  lbaRemoveTriggers_();
  ScriptApp.newTrigger(LBAUTO.handler).timeBased().everyMinutes(1).create();
}

function startEmailPilot() {
  return lbaLocked_((store, snapshot) => {
    const existing = lbaState_(snapshot);
    if (existing) {
      // Idempotent start never resets the cutoff, receipt, or dispatch reservation.
      if (existing.active) lbaCreateTrigger_();
      return lbaReport_(existing);
    }
    const inbox = lbConfig(store);
    lbaRequire_(lbAddress(Gmail.Users.getProfile('me').emailAddress) === inbox.account, 'MAILBOX');
    const head = lbghGet_(snapshot, '/commits/main');
    const workflowId = lbghCheckSource_(snapshot, head.sha, undefined, LBAUTO);
    lbghCheckFile_(snapshot, LBAUTO.workflowPath, head.sha, LBAUTO.workflowSha256);
    lbghCheckFile_(snapshot, 'Week-8/LightBoard_Prompter/device/foundation-lock.json', head.sha,
      '590255d560b163f000b29d6bb274be52fb227bee4962b0a402faf1c23be4b4fa');
    const state = {schemaVersion: 1, active: true, status: 'waiting_for_new_email',
      accountSha256: lbHash(inbox.account), sourceCommit: head.sha, workflowId, startMs: Date.now()};
    lbaSave_(store, snapshot, state); // Reserve mode before creating the timer.
    lbaCreateTrigger_();
    return lbaReport_(state);
  });
}
function inspectEmailPilot() {
  return lbaLocked_((store, snapshot) => lbaReport_(lbaState_(snapshot)));
}
function startContinuousEmail() {
  return lbaLocked_((store, snapshot) => {
    const existing = lbaState_(snapshot);
    const inbox = lbConfig(store);
    lbaRequire_(lbAddress(Gmail.Users.getProfile('me').emailAddress) === inbox.account, 'MAILBOX');
    if (existing && existing.mode === 'continuous' && existing.dispatchId) {
      // A stopped/uncertain dispatch may only be reconciled, never cleared or resent.
      lbaRequire_(!existing.status.startsWith('workflow_') &&
        existing.status !== 'review_required_no_redispatch', 'HELD_JOB');
      existing.active = true;
      lbaSave_(store, snapshot, existing); lbaCreateTrigger_();
      return lbaReport_(existing);
    }
    lbaRequire_(!existing || existing.mode === 'continuous' || !existing.dispatchId || existing.result,
      'PILOT_NOT_FINISHED');
    const head = lbghGet_(snapshot, '/commits/main');
    const workflowId = lbghCheckSource_(snapshot, head.sha, undefined, LBAUTO);
    lbghCheckFile_(snapshot, LBAUTO.workflowPath, head.sha, LBAUTO.workflowSha256);
    lbghCheckFile_(snapshot, 'Week-8/LightBoard_Prompter/device/foundation-lock.json', head.sha,
      '590255d560b163f000b29d6bb274be52fb227bee4962b0a402faf1c23be4b4fa');
    if (existing && existing.mode !== 'continuous' && !snapshot.LB_EMAIL_FIRST_PILOT) {
      lbSet(store, snapshot, 'LB_EMAIL_FIRST_PILOT', existing);
    }
    // First activation starts with NEW emails. Later starts preserve cutoff,
    // publication receipts and delivery interval, including after a manual stop.
    const state = existing && existing.mode === 'continuous' ? existing : {
      schemaVersion: 1, mode: 'continuous', accountSha256: lbHash(inbox.account), startMs: Date.now()};
    state.sourceCommit = head.sha; state.workflowId = workflowId;
    state.active = true; state.status = 'waiting_for_new_email';
    lbaSave_(store, snapshot, state); lbaCreateTrigger_();
    return lbaReport_(state);
  });
}
function inspectEmailProcessing() { return inspectEmailPilot(); }
function stopEmailProcessing() { return stopEmailPilot(); }
function stopEmailPilot() {
  return lbaLocked_((store, snapshot) => {
    const state = lbaState_(snapshot);
    if (state) { state.active = false; state.status = 'stopped'; lbaSave_(store, snapshot, state); }
    lbaRemoveTriggers_();
    return lbaReport_(state);
  });
}
function lbaNext_(snapshot, state) {
  const inbox = JSON.parse(snapshot.LB_ACTIVE_CONFIG);
  return Object.keys(snapshot).filter(k => k.startsWith('LB_MSG_')).map(k => JSON.parse(snapshot[k]))
    .filter(r => r.outcome === 'received' && r.job && Date.parse(r.job.receivedAt) > state.startMs)
    .map(r => r.job).filter(j => inbox.allowedSenders.includes(j.sender) &&
      /^lb-[a-f0-9]{12}-[a-zA-Z0-9]{1,64}$/.test(j.id || '') && lbHash(j.prompt) === j.promptSha256 &&
      !snapshot[LBAUTO.completedPrefix + j.id])
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id))[0];
}
function lbaRun_(run, state) {
  lbaRequire_(run && Number.isSafeInteger(run.id) && run.id > 0 &&
    String(run.workflow_id) === state.workflowId && run.head_sha === state.sourceCommit &&
    run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.run_attempt === 1 &&
    [LBAUTO.workflowPath, LBAUTO.workflowPath + '@main', LBAUTO.workflowPath + '@refs/heads/main'].includes(run.path) &&
    run.repository && run.repository.full_name === LBGH.repository && run.repository.private === false &&
    run.display_title === 'Lightboard email ' + state.jobId + ' ' + state.dispatchId &&
    run.html_url === 'https://github.com/' + LBGH.repository + '/actions/runs/' + run.id &&
    (!state.runId || state.runId === String(run.id)), 'RUN');
  return run;
}
function lbaPoll_(store, snapshot, state) {
  if (Date.now() - state.dispatchMs > 30 * 60 * 1000) {
    state.active = false; state.status = 'review_required_no_redispatch';
    lbaSave_(store, snapshot, state); lbaRemoveTriggers_();
    return lbaReport_(state);
  }
  let run;
  if (state.runId) run = lbaRun_(lbghGet_(snapshot, '/actions/runs/' + state.runId), state);
  else {
    const data = lbghGet_(snapshot, '/actions/workflows/' + LBAUTO.workflow +
      '/runs?event=workflow_dispatch&branch=main&per_page=100&created=' +
      encodeURIComponent('>=' + new Date(state.dispatchMs - 300000).toISOString().replace(/\.\d{3}Z$/, 'Z')));
    lbaRequire_(Array.isArray(data.workflow_runs), 'RUN');
    const matches = data.workflow_runs.filter(r =>
      r.display_title === 'Lightboard email ' + state.jobId + ' ' + state.dispatchId);
    lbaRequire_(matches.length <= 1, 'RUN');
    if (matches.length) run = lbaRun_(matches[0], state);
  }
  if (run) {
    state.runId = String(run.id);
    state.status = run.status === 'completed' ? 'workflow_' + run.conclusion : 'building_and_publishing';
    lbaSave_(store, snapshot, state);
    if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        const data = lbghGet_(snapshot, '/actions/runs/' + run.id + '/attempts/1/jobs?per_page=100');
        lbaRequire_(data.total_count === 1 && Array.isArray(data.jobs) && data.jobs.length === 1, 'RESULT');
        const job = data.jobs[0];
        lbaRequire_(job.name === 'email-to-panel' && job.conclusion === 'success' &&
          String(job.run_id) === String(run.id) && Array.isArray(job.steps), 'RESULT');
        const steps = job.steps.filter(s => s.name === 'Record email publication' && s.conclusion === 'success');
        lbaRequire_(steps.length === 1, 'RESULT');
        const r = lbghStepLog_(snapshot, job.id, steps[0].number);
        lbaRequire_(r.schemaVersion === 1 && r.operation === 'email_pilot' && r.result === 'published' &&
          r.jobId === state.jobId && r.dispatchId === state.dispatchId && r.promptSha256 === state.promptSha256 &&
          r.commitSha === state.sourceCommit && r.runId === state.runId && r.runAttempt === 1 &&
          r.repository === LBGH.repository && r.workflowPath === LBAUTO.workflowPath &&
          r.foundation === LBAUTO.foundation && r.published === true && r.modelRequests === 1 &&
          r.automaticUpdates === true && r.deviceConfirmed === false &&
          /^ota-pilot-[a-f0-9]{24}$/.test(r.version || '') && /^[a-f0-9]{64}$/.test(r.sha256 || '') &&
          Number.isSafeInteger(r.bytes) && r.bytes >= 288 && r.bytes <= 1310720, 'RESULT');
        state.result = r;
        state.status = 'published_awaiting_visual_confirmation';
        if (state.mode === 'continuous') {
          const key = LBAUTO.completedPrefix + state.jobId;
          let completed = snapshot[key] ? JSON.parse(snapshot[key]) : null;
          if (completed) lbaRequire_(lbHash(JSON.stringify(completed.result)) === lbHash(JSON.stringify(r)), 'RESULT');
          else {
            completed = {schemaVersion: 1, publishedMs: Date.now(), result: r};
            lbSet(store, snapshot, key, completed); // Durable before clearing this reservation.
          }
          state.lastPublished = {jobId: state.jobId, runUrl: run.html_url, version: r.version,
            publishedAt: new Date(completed.publishedMs).toISOString()};
          state.notBeforeMs = completed.publishedMs + LBAUTO.deliveryIntervalMs;
          ['jobId', 'promptSha256', 'dispatchId', 'dispatchMs', 'runId', 'result'].forEach(k => delete state[k]);
          state.status = 'delivery_interval';
          lbaSave_(store, snapshot, state);
          return lbaReport_(state); // Keep the minute trigger; never start the next job in this tick.
        }
      }
      state.active = false;
    }
  }
  lbaSave_(store, snapshot, state);
  if (!state.active) lbaRemoveTriggers_();
  return lbaReport_(state);
}

function emailPilotTick() {
  // processInbox owns its own lock; do not nest it inside the dispatch lock.
  const preliminary = lbaLocked_((store, snapshot) => lbaState_(snapshot));
  if (!preliminary || !preliminary.active) return;
  if (preliminary.mode === 'continuous' || preliminary.status === 'waiting_for_new_email') {
    try { processInbox(); } catch (_) { return lbReport({status: 'intake_waiting'}); }
  }
  return lbaLocked_((store, snapshot) => {
    const state = lbaState_(snapshot);
    if (!state || !state.active) return lbaReport_(state);
    if (state.dispatchId) return lbaPoll_(store, snapshot, state); // Never a second POST.
    if (state.notBeforeMs > Date.now()) {
      state.status = 'delivery_interval'; lbaSave_(store, snapshot, state);
      return lbaReport_(state);
    }
    const job = lbaNext_(snapshot, state);
    if (!job) {
      state.status = 'waiting_for_new_email'; lbaSave_(store, snapshot, state);
      return lbaReport_(state);
    }
    try { lbghCheckSource_(snapshot, state.sourceCommit, state.workflowId, LBAUTO); }
    catch (error) {
      if (error.message === 'LB_GH_SOURCE' || error.message === 'LB_GH_WORKFLOW') {
        state.active = false; state.status = 'source_changed_before_dispatch';
        lbaSave_(store, snapshot, state); lbaRemoveTriggers_();
      }
      throw error;
    }
    state.jobId = job.id; state.promptSha256 = job.promptSha256;
    state.dispatchId = 'email_' + Utilities.getUuid().replace(/-/g, '');
    state.dispatchMs = Date.now(); state.status = 'dispatch_reserved';
    lbaSave_(store, snapshot, state); // Durable BEFORE HTTP, even on lost responses.
    try {
      lbghApi_(snapshot, 'post', '/repos/' + LBGH.repository + '/actions/workflows/' + LBAUTO.workflow +
        '/dispatches', {ref: 'main', inputs: {prompt: job.prompt, email_job_id: job.id,
          dispatch_id: state.dispatchId, prompt_sha256: job.promptSha256, source_commit: state.sourceCommit}});
    } catch (_) { /* Unknown delivery: reconcile by unique title, never resend. */ }
    state.status = 'dispatch_sent_or_unknown';
    lbaSave_(store, snapshot, state);
    return lbaReport_(state);
  });
}
