/** Manual saved-heart build only. No model request, publication, mail, trigger or board command. */
const LBGH = Object.freeze({repository: 'pmartin5-gif/HelloWorld', ref: 'main',
  workflow: 'lightboard-prompt-build.yml', workflowPath: '.github/workflows/lightboard-prompt-build.yml',
  configKey: 'LB_GITHUB_ACTIVE', tokenKey: 'LB_GITHUB_TOKEN', apiVersion: '2026-03-10',
  prompt: 'An overflowing heart that keeps giving',
  promptSha256: '738a280e61392c053d167c0ee30656c85712e1a021fab1bc2d1b54dc0718da63',
  responseSha256: 'ca9f5d73467bb02aab6278c8db4c03d5d643c960e5f2ea7221cea7d6263f1171',
  foundation: 'f1244292bbdf180ad5ea8b4ffbf46c72b9772ef8ad2407276ae26e3786132522',
  workflowSha256: 'fa60df4dca19d6a4b53de0457351c7f35d984719f8bc3263bd99beaf0a7d2436', bindingSha256: 'f28b745d8f48f3c5d28b45743015334c57a61825426d40a73dea6eb3364ad884',
  resultStep: 'Record queue result', maxJsonBytes: 2000000, maxLogBytes: 65536});

function lbghRequire_(ok, code) { if (!ok) throw new Error('LB_GH_' + code); }
function lbghHeader_(response, name) {
  const headers = response.getAllHeaders();
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : '';
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function lbghFetch_(url, options) {
  try { return UrlFetchApp.fetch(url, {...options, followRedirects: false, muteHttpExceptions: true}); }
  catch (_) { throw new Error('LB_GH_NETWORK'); }
}
function lbghToken_(snapshot) {
  const token = snapshot[LBGH.tokenKey];
  lbghRequire_(typeof token === 'string' && /^github_pat_[A-Za-z0-9_]{20,300}$/.test(token), 'TOKEN');
  return token;
}
function lbghApi_(snapshot, method, path, body, authenticated = true) {
  lbghRequire_(path.startsWith('/repos/' + LBGH.repository + '/') && !/[\r\n#]/.test(path), 'TARGET');
  const headers = {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': LBGH.apiVersion};
  if (authenticated) headers.Authorization = 'Bearer ' + lbghToken_(snapshot);
  const options = {method, headers};
  if (body !== undefined) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  const response = lbghFetch_('https://api.github.com' + path, options);
  const code = response.getResponseCode();
  if (code === 429 || (code === 403 && (lbghHeader_(response, 'x-ratelimit-remaining') === '0' ||
    lbghHeader_(response, 'retry-after')))) throw new Error('LB_GH_QUOTA');
  return response;
}
function lbghJson_(response) {
  lbghRequire_(response.getResponseCode() === 200, 'HTTP');
  const text = response.getContentText('UTF-8');
  lbghRequire_(lbBytes(text) <= LBGH.maxJsonBytes, 'RESPONSE_SIZE');
  try { return JSON.parse(text); } catch (_) { throw new Error('LB_GH_JSON'); }
}
function lbghGet_(snapshot, path, authenticated = true) {
  return lbghJson_(lbghApi_(snapshot, 'get', '/repos/' + LBGH.repository + path, undefined, authenticated));
}
function lbghLocked_(work) {
  return lbqLocked_((store, snapshot, now) => {
    try { return work(store, snapshot, now); }
    catch (error) {
      if (error.message === 'LB_STORAGE_PAUSED') throw error;
      const known = /^LB_GH_(TOKEN|TARGET|NETWORK|QUOTA|HTTP|RESPONSE_SIZE|JSON|CONFIG|SOURCE|WORKFLOW|JOB|RUN|LOGS|RESULT)$/;
      return lbReport({status: 'stopped', reason: known.test(error.message) ? error.message : 'LB_GH_CONFIG',
        automaticDispatchEnabled: false, published: false, deviceConfirmed: false});
    }
  });
}
function lbghConfig_(snapshot) {
  lbghRequire_(LBQ.githubAdapterVersion === 1, 'CONFIG');
  const queue = lbqConfig_(snapshot);
  const config = JSON.parse(snapshot[LBGH.configKey] || 'null');
  lbghRequire_(config && config.schemaVersion === 1 && config.mode === 'saved_build_only' &&
    config.accountSha256 === queue.accountSha256 && /^[a-f0-9]{40}$/.test(config.sourceCommit || '') &&
    /^[1-9][0-9]{0,19}$/.test(config.workflowId || '') &&
    /^lb-[a-f0-9]{12}-[a-zA-Z0-9]{1,64}$/.test(config.approvedJobId || ''), 'CONFIG');
  lbghToken_(snapshot);
  return {queue, config};
}
function lbghCheckSource_(snapshot, commit, workflowId) {
  const head = lbghGet_(snapshot, '/commits/main', false);
  lbghRequire_(head.sha === commit, 'SOURCE');
  const workflow = lbghGet_(snapshot, '/actions/workflows/' + LBGH.workflow);
  lbghRequire_(Number.isSafeInteger(workflow.id) && workflow.id > 0 && workflow.path === LBGH.workflowPath &&
    workflow.state === 'active' && (!workflowId || String(workflow.id) === workflowId), 'WORKFLOW');
  return String(workflow.id);
}
function lbghCheckFile_(snapshot, path, commit, expected) {
  const file = lbghGet_(snapshot, '/contents/' + path + '?ref=' + commit, false);
  lbghRequire_(file.encoding === 'base64' && typeof file.content === 'string', 'SOURCE');
  const source = Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g, ''))).getDataAsString('UTF-8');
  lbghRequire_(lbHash(source) === expected, 'SOURCE');
}
function lbghSaveEvent_(store, snapshot, queue, jobId, type, extra, now) {
  const rows = lbqRead_(snapshot, queue), q = rows.find(x => x.jobId === jobId);
  lbghRequire_(q, 'JOB');
  const event = {id: 'ev_' + Utilities.getUuid().replace(/-/g, ''), expectedRevision: q.revision, type, ...extra};
  const result = lbqTransition_(rows, jobId, event, now);
  if (result.changed) lbSet(store, snapshot, LBQ.prefix + jobId, result.job);
  return result.job;
}
function lbghJob_(snapshot, queue, config) {
  const rows = lbqRead_(snapshot, queue);
  const q = rows.find(x => x.jobId === config.approvedJobId);
  lbghRequire_(q && q.promptSha256 === LBGH.promptSha256 &&
    JSON.parse(snapshot[q.receiptKey]).job.prompt === LBGH.prompt, 'JOB');
  return {rows, q};
}
function lbghTitle_(q) { return 'Lightboard queue ' + q.jobId + ' ' + q.dispatch.id; }
function lbghRun_(run, q, config) {
  lbghRequire_(run && Number.isSafeInteger(run.id) && run.id > 0 &&
    String(run.workflow_id) === config.workflowId && run.head_sha === config.sourceCommit &&
    run.head_branch === LBGH.ref && run.event === 'workflow_dispatch' && run.run_attempt === 1 &&
    [LBGH.workflowPath, LBGH.workflowPath + '@main', LBGH.workflowPath + '@refs/heads/main'].includes(run.path) &&
    run.repository && run.repository.full_name === LBGH.repository &&
    run.repository.private === false && run.display_title === lbghTitle_(q) &&
    run.html_url === 'https://github.com/' + LBGH.repository + '/actions/runs/' + run.id &&
    (!q.dispatch.runId || String(run.id) === q.dispatch.runId), 'RUN');
  return run;
}

function setupGitHubConnection() {
  return lbghLocked_((store, snapshot, now) => {
    lbghRequire_(LBQ.githubAdapterVersion === 1, 'CONFIG');
    if (snapshot[LBGH.configKey]) {
      const {config} = lbghConfig_(snapshot);
      return lbReport({status: 'already_configured', approvedJobId: config.approvedJobId,
        sourceCommit: config.sourceCommit, automaticDispatchEnabled: false});
    }
    const queue = lbqConfig_(snapshot);
    lbqImport_(store, snapshot, queue, now);
    const rows = lbqRead_(snapshot, queue);
    const q = rows.find(x => x.status === 'received');
    lbghRequire_(!rows.some(x => LBQ.active.includes(x.status)) && q &&
      rows.find(x => ['received', 'quota_paused'].includes(x.status)) === q &&
      q.promptSha256 === LBGH.promptSha256, 'JOB');
    const requested = JSON.parse(snapshot.LB_GITHUB_SETUP || 'null');
    lbghRequire_(requested && /^[a-f0-9]{40}$/.test(requested.sourceCommit || ''), 'CONFIG');
    const workflowId = lbghCheckSource_(snapshot, requested.sourceCommit);
    lbghCheckFile_(snapshot, LBGH.workflowPath, requested.sourceCommit, LBGH.workflowSha256);
    lbghCheckFile_(snapshot, 'Week-8/LightBoard_Prompter/cloud/queue_binding.py',
      requested.sourceCommit, LBGH.bindingSha256);
    const config = {schemaVersion: 1, mode: 'saved_build_only', accountSha256: queue.accountSha256,
      sourceCommit: requested.sourceCommit, workflowId, approvedJobId: q.jobId, createdAt: now};
    lbSet(store, snapshot, LBGH.configKey, config);
    return lbReport({status: 'configured', mode: config.mode, approvedJobId: q.jobId,
      sourceCommit: config.sourceCommit, automaticDispatchEnabled: false, dispatchSent: false});
  });
}

function dispatchNextSavedBuild() {
  return lbghLocked_((store, snapshot, now) => {
    const {queue, config} = lbghConfig_(snapshot);
    lbqImport_(store, snapshot, queue, now);
    let {rows, q} = lbghJob_(snapshot, queue, config);
    if (q.status !== 'received' || rows.some(x => LBQ.active.includes(x.status))) {
      return lbReport({status: 'not_dispatched', jobId: q.jobId, queueStatus: q.status,
        nextAction: 'pollSavedBuild', automaticDispatchEnabled: false});
    }
    lbghRequire_(rows.find(x => ['received', 'quota_paused'].includes(x.status)) === q, 'JOB');
    try { lbghCheckSource_(snapshot, config.sourceCommit, config.workflowId); }
    catch (error) {
      if (error.message !== 'LB_GH_QUOTA') throw error;
      lbghSaveEvent_(store, snapshot, queue, q.jobId, 'quota_pause', {}, now);
      return lbReport({status: 'quota_paused', jobId: q.jobId, dispatchSent: false});
    }
    if (queue.mode !== 'manual_saved_build') {
      queue.mode = 'manual_saved_build'; lbSet(store, snapshot, LBQ.configKey, queue);
    }
    q = lbghSaveEvent_(store, snapshot, queue, q.jobId, 'reserve_dispatch',
      {id: 'gh_' + Utilities.getUuid().replace(/-/g, '')}, now); // Durable BEFORE HTTP.
    let run;
    try {
      const response = lbghApi_(snapshot, 'post', '/repos/' + LBGH.repository + '/actions/workflows/' +
        LBGH.workflow + '/dispatches', {ref: LBGH.ref, inputs: {
          prompt: LBGH.prompt, publish: 'false', reuse_saved_generation: 'true',
          queue_job_id: q.jobId, queue_dispatch_id: q.dispatch.id, queue_prompt_sha256: q.promptSha256}});
      if (response.getResponseCode() === 200) {
        const accepted = lbghJson_(response);
        lbghRequire_(Number.isSafeInteger(accepted.workflow_run_id) && accepted.workflow_run_id > 0, 'RUN');
        run = lbghRun_(lbghGet_(snapshot, '/actions/runs/' + accepted.workflow_run_id), q, config);
      }
    } catch (_) { /* A POST may have succeeded even if any response/read failed. Reconcile only. */ }
    if (run) {
      q = lbghSaveEvent_(store, snapshot, queue, q.jobId, 'bind_run', {dispatchId: q.dispatch.id,
        promptSha256: q.promptSha256, runId: String(run.id), commitSha: run.head_sha}, now);
      return lbReport({status: 'building', jobId: q.jobId, runId: q.dispatch.runId,
        runUrl: run.html_url, automaticDispatchEnabled: false, published: false, deviceConfirmed: false});
    }
    lbghSaveEvent_(store, snapshot, queue, q.jobId, 'dispatch_unknown', {}, now);
    return lbReport({status: 'dispatch_unknown', jobId: q.jobId, nextAction: 'pollSavedBuild',
      automaticDispatchEnabled: false});
  });
}

function lbghFindRun_(snapshot, q, config) {
  if (q.dispatch.runId) return lbghRun_(lbghGet_(snapshot, '/actions/runs/' + q.dispatch.runId), q, config);
  const matches = [];
  for (let page = 1; page <= 3; page++) {
    const data = lbghGet_(snapshot, '/actions/workflows/' + LBGH.workflow +
      '/runs?event=workflow_dispatch&branch=main&per_page=100&page=' + page +
      '&created=' + encodeURIComponent('>=' + new Date(Date.parse(q.dispatch.reservedAt) - 300000)
        .toISOString().replace(/\.\d{3}Z$/, 'Z')));
    lbghRequire_(Array.isArray(data.workflow_runs), 'RUN');
    matches.push(...data.workflow_runs.filter(r => r.display_title === lbghTitle_(q)));
    if (data.workflow_runs.length < 100) break;
  }
  lbghRequire_(matches.length <= 1, 'RUN');
  return matches.length ? lbghRun_(matches[0], q, config) : null;
}
function lbghStepLog_(snapshot, jobId, stepNumber) {
  const path = '/repos/' + LBGH.repository + '/actions/jobs/' + jobId + '/steps/' + stepNumber + '/logs';
  let response = lbghApi_(snapshot, 'get', path);
  if (response.getResponseCode() === 302) {
    const location = lbghHeader_(response, 'location');
    // Signed GitHub log redirect only; bearer token NEVER forwarded to storage.
    lbghRequire_(/^https:\/\/[a-zA-Z0-9.-]+\.(?:blob\.core\.windows\.net|actions\.githubusercontent\.com)\/[^\s#]*$/.test(location), 'LOGS');
    response = lbghFetch_(location, {method: 'get', headers: {Accept: 'text/plain'}});
  }
  lbghRequire_(response.getResponseCode() === 200, 'LOGS');
  const text = response.getContentText('UTF-8');
  lbghRequire_(lbBytes(text) <= LBGH.maxLogBytes, 'LOGS');
  const matches = text.split(/\r?\n/).map(line => line.match(
    /^(?:\d{4}-\d\d-\d\dT[0-9:.]+Z\s+)?LB_QUEUE_RESULT: (\{.*\})$/)).filter(Boolean);
  lbghRequire_(matches.length === 1, 'RESULT');
  try { return JSON.parse(matches[0][1]); } catch (_) { throw new Error('LB_GH_RESULT'); }
}
function lbghResult_(report, q, config, run) {
  lbghRequire_(report && report.schemaVersion === 1 && report.jobId === q.jobId &&
    report.dispatchId === q.dispatch.id && report.promptSha256 === q.promptSha256 &&
    report.runId === String(run.id) && report.runAttempt === 1 && report.commitSha === config.sourceCommit &&
    report.repository === LBGH.repository && report.workflowPath === LBGH.workflowPath &&
    report.savedGenerationRunId === '42735010470' && report.responseSha256 === LBGH.responseSha256 &&
    report.published === false && report.publicationAbsenceVerified === true && report.modelRequests === 0 &&
    report.automaticUpdates === false && report.deviceConfirmed === false, 'RESULT');
  if (run.conclusion === 'success') {
    lbghRequire_(report.result === 'built' && report.foundation === LBGH.foundation &&
      /^ota-pilot-[a-f0-9]{24}$/.test(report.version || '') && /^[a-f0-9]{64}$/.test(report.sha256 || '') &&
      Number.isSafeInteger(report.bytes) && report.bytes > 0 && report.bytes <= 1310720, 'RESULT');
  } else lbghRequire_(['failure', 'cancelled', 'timed_out'].includes(run.conclusion) && report.result === 'failed', 'RESULT');
  return report;
}

function pollSavedBuild() {
  return lbghLocked_((store, snapshot, now) => {
    const {queue, config} = lbghConfig_(snapshot);
    let {q} = lbghJob_(snapshot, queue, config);
    if (!LBQ.active.includes(q.status)) return lbReport({status: q.status, jobId: q.jobId,
      runId: q.dispatch ? q.dispatch.runId : null, published: false, deviceConfirmed: false});
    const run = lbghFindRun_(snapshot, q, config);
    if (!run) return lbReport({status: 'awaiting_run', jobId: q.jobId, dispatchRepeated: false});
    if (!q.dispatch.runId) q = lbghSaveEvent_(store, snapshot, queue, q.jobId, 'bind_run', {
      dispatchId: q.dispatch.id, promptSha256: q.promptSha256, runId: String(run.id), commitSha: run.head_sha}, now);
    if (run.status !== 'completed') return lbReport({status: 'building', jobId: q.jobId,
      runId: String(run.id), runUrl: run.html_url, published: false, deviceConfirmed: false});
    const data = lbghGet_(snapshot, '/actions/runs/' + run.id + '/attempts/1/jobs?per_page=100');
    lbghRequire_(data.total_count === 1 && Array.isArray(data.jobs) && data.jobs.length === 1, 'RESULT');
    const job = data.jobs[0];
    lbghRequire_(Number.isSafeInteger(job.id) && job.id > 0 && String(job.run_id) === String(run.id) &&
      job.name === 'generate-and-compile' && job.status === 'completed' &&
      job.conclusion === run.conclusion && Array.isArray(job.steps), 'RESULT');
    const steps = job.steps.filter(s => s.name === LBGH.resultStep);
    lbghRequire_(steps.length === 1 && steps[0].status === 'completed' && steps[0].conclusion === 'success' &&
      Number.isSafeInteger(steps[0].number) && steps[0].number > 0, 'RESULT');
    const report = lbghResult_(lbghStepLog_(snapshot, job.id, steps[0].number), q, config, run);
    if (q.status === 'review_required') q = lbghSaveEvent_(store, snapshot, queue, q.jobId, 'reconcile_run',
      {runId: String(run.id), commitSha: run.head_sha, promptSha256: q.promptSha256}, now);
    q = lbghSaveEvent_(store, snapshot, queue, q.jobId, 'build_result', {runId: String(run.id),
      commitSha: run.head_sha, promptSha256: q.promptSha256, result: report.result, published: false,
      publicationAbsenceVerified: true, workflowJobId: String(job.id),
      resultSha256: lbHash(JSON.stringify(report))}, now);
    return lbReport({status: q.status, jobId: q.jobId, runId: q.dispatch.runId, runUrl: run.html_url,
      promptSha256: q.promptSha256, resultSha256: q.dispatch.resultSha256,
      modelRequests: 0, published: false, deviceConfirmed: false, automaticDispatchEnabled: false});
  });
}

function resumeSavedBuildQueue() {
  return lbghLocked_((store, snapshot, now) => {
    const {queue, config} = lbghConfig_(snapshot), {q} = lbghJob_(snapshot, queue, config);
    lbghRequire_(q.status === 'quota_paused', 'JOB');
    lbghCheckSource_(snapshot, config.sourceCommit, config.workflowId);
    lbghSaveEvent_(store, snapshot, queue, q.jobId, 'resume', {}, now);
    return lbReport({status: 'received', jobId: q.jobId, dispatchSent: false});
  });
}
