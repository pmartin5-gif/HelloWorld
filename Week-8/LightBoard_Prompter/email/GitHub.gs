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
    lbghHeader_(response, 'retry-after')))) {
    const error = new Error('LB_GH_QUOTA');
    const integer = name => {
      const raw = lbghHeader_(response, name);
      return /^\d{1,10}$/.test(raw) ? Number(raw) : null;
    };
    const reset = integer('x-ratelimit-reset');
    error.rateLimit = {httpStatus: code, authenticated,
      requestType: path.includes('/commits/') ? 'source_head' : path.includes('/contents/') ? 'source_file' : 'actions',
      limit: integer('x-ratelimit-limit'), remaining: integer('x-ratelimit-remaining'),
      resetAt: reset !== null && reset <= 4102444800 ? new Date(reset * 1000).toISOString() : null,
      retryAfterSeconds: integer('retry-after')};
    throw error;
  }
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
        ...(error.message === 'LB_GH_QUOTA' && error.rateLimit ? {rateLimit: error.rateLimit} : {}),
        automaticDispatchEnabled: false, publicationConfirmed: false, deviceConfirmed: false});
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
function lbghCheckSource_(snapshot, commit, workflowId, target = LBGH) {
  const head = lbghGet_(snapshot, '/commits/main');
  lbghRequire_(head.sha === commit, 'SOURCE');
  const workflow = lbghGet_(snapshot, '/actions/workflows/' + target.workflow);
  lbghRequire_(Number.isSafeInteger(workflow.id) && workflow.id > 0 && workflow.path === target.workflowPath &&
    workflow.state === 'active' && (!workflowId || String(workflow.id) === workflowId), 'WORKFLOW');
  return String(workflow.id);
}
function lbghCheckFile_(snapshot, path, commit, expected) {
  const file = lbghGet_(snapshot, '/contents/' + path + '?ref=' + commit);
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
function lbghRun_(run, q, config, target = LBGH) {
  lbghRequire_(run && Number.isSafeInteger(run.id) && run.id > 0 &&
    String(run.workflow_id) === config.workflowId && run.head_sha === config.sourceCommit &&
    run.head_branch === LBGH.ref && run.event === 'workflow_dispatch' && run.run_attempt === 1 &&
    [target.workflowPath, target.workflowPath + '@main', target.workflowPath + '@refs/heads/main'].includes(run.path) &&
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
      return lbReport({status: 'quota_paused', jobId: q.jobId, dispatchSent: false,
        ...(error.rateLimit ? {rateLimit: error.rateLimit} : {})});
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

function lbghFindRun_(snapshot, q, config, target = LBGH) {
  if (q.dispatch.runId) return lbghRun_(lbghGet_(snapshot, '/actions/runs/' + q.dispatch.runId), q, config, target);
  const matches = [];
  for (let page = 1; page <= 3; page++) {
    const data = lbghGet_(snapshot, '/actions/workflows/' + target.workflow +
      '/runs?event=workflow_dispatch&branch=main&per_page=100&page=' + page +
      '&created=' + encodeURIComponent('>=' + new Date(Date.parse(q.dispatch.reservedAt) - 300000)
        .toISOString().replace(/\.\d{3}Z$/, 'Z')));
    lbghRequire_(Array.isArray(data.workflow_runs), 'RUN');
    matches.push(...data.workflow_runs.filter(r => r.display_title === lbghTitle_(q)));
    if (data.workflow_runs.length < 100) break;
  }
  lbghRequire_(matches.length <= 1, 'RUN');
  return matches.length ? lbghRun_(matches[0], q, config, target) : null;
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
    if (q.publicationDispatch) return lbReport({status: q.status, jobId: q.jobId,
      nextAction: 'pollPublication', published: q.publication !== null, deviceConfirmed: false});
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

/** Separate explicit publication phase. Original build/config/receipt are never overwritten. */
const LBPUB = Object.freeze({workflow: 'lightboard-queue-publish.yml',
  workflowPath: '.github/workflows/lightboard-queue-publish.yml',
  workflowSha256: 'fb029ca7d8cdf8aaa0708c24f61a4fe0f7021cc0282f7c80fc377c89d25b7ede', helperSha256: '6878f022db82fb1962bbda68e5eb35cc1a1989a8f0f05506e266d354e5cd8035',
  configKey: 'LB_PUBLICATION_ACTIVE'});

function lbpubContext_(snapshot) {
  lbghRequire_(LBQ.publicationAdapterVersion === 1, 'CONFIG');
  const {queue, config: buildConfig} = lbghConfig_(snapshot);
  const config = JSON.parse(snapshot[LBPUB.configKey] || 'null');
  lbghRequire_(config && config.schemaVersion === 1 && config.mode === 'manual_saved_publication' &&
    config.accountSha256 === queue.accountSha256 && config.approvedJobId === buildConfig.approvedJobId &&
    /^[a-f0-9]{40}$/.test(config.sourceCommit || '') && /^[1-9][0-9]{0,19}$/.test(config.workflowId || ''), 'CONFIG');
  const {rows, q} = lbghJob_(snapshot, queue, buildConfig);
  const p = config.priorResult;
  lbghRequire_(p && p.result === 'built' && p.jobId === q.jobId && p.runId === q.dispatch.runId &&
    p.commitSha === q.dispatch.commitSha && lbHash(JSON.stringify(p)) === q.dispatch.resultSha256 &&
    p.promptSha256 === q.promptSha256 && p.modelRequests === 0 && p.published === false, 'RESULT');
  return {queue, buildConfig, config, rows, q};
}
function lbpubReport_(snapshot, run, expectedJobName) {
  const data = lbghGet_(snapshot, '/actions/runs/' + run.id + '/attempts/1/jobs?per_page=100');
  lbghRequire_(data.total_count === 1 && Array.isArray(data.jobs) && data.jobs.length === 1, 'RESULT');
  const job = data.jobs[0];
  lbghRequire_(job.name === expectedJobName && job.run_id === run.id && job.status === 'completed' &&
    job.conclusion === run.conclusion && Number.isSafeInteger(job.id) && Array.isArray(job.steps), 'RESULT');
  const steps = job.steps.filter(s => s.name === LBGH.resultStep);
  lbghRequire_(steps.length === 1 && steps[0].status === 'completed' && steps[0].conclusion === 'success' &&
    Number.isSafeInteger(steps[0].number) && steps[0].number > 0, 'RESULT');
  return {report: lbghStepLog_(snapshot, job.id, steps[0].number), workflowJobId: String(job.id)};
}
function setupPublication() {
  return lbghLocked_((store, snapshot, now) => {
    lbghRequire_(LBQ.publicationAdapterVersion === 1, 'CONFIG');
    if (snapshot[LBPUB.configKey]) {
      const {config, q} = lbpubContext_(snapshot);
      return lbReport({status: 'already_configured', mode: config.mode, jobId: q.jobId,
        sourceCommit: config.sourceCommit, dispatchSent: false, automaticDispatchEnabled: false});
    }
    const {queue, config: buildConfig} = lbghConfig_(snapshot);
    const {rows, q} = lbghJob_(snapshot, queue, buildConfig);
    lbghRequire_(q.status === 'built' && !q.publicationDispatch && !rows.some(x => LBQ.active.includes(x.status)), 'JOB');
    const requested = JSON.parse(snapshot.LB_PUBLICATION_SETUP || 'null');
    lbghRequire_(requested && /^[a-f0-9]{40}$/.test(requested.sourceCommit || ''), 'CONFIG');
    const workflowId = lbghCheckSource_(snapshot, requested.sourceCommit, null, LBPUB);
    lbghCheckFile_(snapshot, LBPUB.workflowPath, requested.sourceCommit, LBPUB.workflowSha256);
    lbghCheckFile_(snapshot, 'Week-8/LightBoard_Prompter/cloud/queue_publication.py',
      requested.sourceCommit, LBPUB.helperSha256);
    const run = lbghRun_(lbghGet_(snapshot, '/actions/runs/' + q.dispatch.runId), q, buildConfig);
    lbghRequire_(run.status === 'completed' && run.conclusion === 'success', 'RUN');
    const {report} = lbpubReport_(snapshot, run, 'generate-and-compile');
    lbghResult_(report, q, buildConfig, run);
    lbghRequire_(lbHash(JSON.stringify(report)) === q.dispatch.resultSha256, 'RESULT');
    const config = {schemaVersion: 1, mode: 'manual_saved_publication', accountSha256: queue.accountSha256,
      approvedJobId: q.jobId, sourceCommit: requested.sourceCommit, workflowId, priorResult: report, createdAt: now};
    lbSet(store, snapshot, LBPUB.configKey, config);
    return lbReport({status: 'configured', mode: config.mode, jobId: q.jobId, sourceCommit: config.sourceCommit,
      priorBuildRunId: q.dispatch.runId, priorResultSha256: q.dispatch.resultSha256,
      dispatchSent: false, automaticDispatchEnabled: false, deviceConfirmed: false});
  });
}
function lbpubProjection_(q) {
  const p = q.publicationDispatch;
  return {jobId: q.jobId, promptSha256: q.promptSha256,
    dispatch: {id: p.id, reservedAt: p.reservedAt, runId: p.runId, commitSha: p.sourceCommit}};
}
function publishApprovedBuild() {
  return lbghLocked_((store, snapshot, now) => {
    const {queue, config, q} = lbpubContext_(snapshot);
    if (q.publicationDispatch) return lbReport({status: q.status, jobId: q.jobId,
      nextAction: 'pollPublication', dispatchRepeated: false});
    lbghRequire_(q.status === 'built', 'JOB');
    lbghCheckSource_(snapshot, config.sourceCommit, config.workflowId, LBPUB);
    queue.mode = 'manual_saved_publication'; lbSet(store, snapshot, LBQ.configKey, queue);
    let current = lbghSaveEvent_(store, snapshot, queue, q.jobId, 'reserve_publication', {
      id: 'gh_' + Utilities.getUuid().replace(/-/g, ''), sourceCommit: config.sourceCommit,
      priorResultSha256: q.dispatch.resultSha256}, now);
    let run;
    try {
      const response = lbghApi_(snapshot, 'post', '/repos/' + LBGH.repository + '/actions/workflows/' +
        LBPUB.workflow + '/dispatches', {ref: 'main', inputs: {queue_job_id: q.jobId,
          queue_dispatch_id: current.publicationDispatch.id, prior_build_run_id: q.dispatch.runId,
          prior_result_sha256: q.dispatch.resultSha256, prompt_sha256: q.promptSha256, publish: 'true'}});
      if (response.getResponseCode() === 200) {
        const accepted = lbghJson_(response);
        lbghRequire_(Number.isSafeInteger(accepted.workflow_run_id) && accepted.workflow_run_id > 0, 'RUN');
        run = lbghRun_(lbghGet_(snapshot, '/actions/runs/' + accepted.workflow_run_id),
          lbpubProjection_(current), config, LBPUB);
      }
    } catch (_) { /* Preserve reservation after every uncertain POST response. */ }
    if (run) {
      current = lbghSaveEvent_(store, snapshot, queue, q.jobId, 'bind_publication', {
        dispatchId: current.publicationDispatch.id, sourceCommit: config.sourceCommit,
        promptSha256: q.promptSha256, runId: String(run.id)}, now);
      return lbReport({status: 'publishing', jobId: q.jobId, runId: String(run.id), runUrl: run.html_url,
        automaticDispatchEnabled: false, deviceConfirmed: false});
    }
    lbghSaveEvent_(store, snapshot, queue, q.jobId, 'publication_unknown', {}, now);
    return lbReport({status: 'publication_unknown', jobId: q.jobId, nextAction: 'pollPublication',
      automaticDispatchEnabled: false, deviceConfirmed: false});
  });
}
function lbpubVerify_(snapshot, report, q, config, run) {
  const old = config.priorResult, p = q.publicationDispatch;
  lbghRequire_(run.conclusion === 'success' && report && report.schemaVersion === 1 &&
    report.operation === 'publication' && report.jobId === q.jobId && report.dispatchId === p.id &&
    report.priorBuildRunId === q.dispatch.runId && report.priorResultSha256 === q.dispatch.resultSha256 &&
    report.promptSha256 === q.promptSha256 && report.runId === String(run.id) && report.runAttempt === 1 &&
    report.commitSha === config.sourceCommit && report.repository === LBGH.repository &&
    report.workflowPath === LBPUB.workflowPath && report.result === 'published' && report.published === true &&
    report.modelRequests === 0 && report.automaticUpdates === false && report.deviceConfirmed === false &&
    ['foundation', 'version', 'bytes', 'sha256'].every(k => report[k] === old[k]), 'RESULT');
  const tag = 'lightboard-ota-' + run.id + '-1';
  const baseUrl = 'https://github.com/' + LBGH.repository + '/releases/download/' + tag + '/';
  lbghRequire_(report.releaseTag === tag && report.firmwareUrl === baseUrl + 'firmware.bin' &&
    report.feedUrl === 'https://raw.githubusercontent.com/' + LBGH.repository + '/lightboard-feed/manifest.json' &&
    /^[a-f0-9]{64}$/.test(report.manifestSha256 || ''), 'RESULT');
  const file = lbghGet_(snapshot, '/contents/manifest.json?ref=lightboard-feed');
  lbghRequire_(file.encoding === 'base64' && typeof file.content === 'string' && file.size <= 8192, 'RESULT');
  const raw = Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g, ''))).getDataAsString('UTF-8');
  lbghRequire_(lbBytes(raw) === file.size && lbHash(raw) === report.manifestSha256, 'RESULT');
  const m = JSON.parse(raw);
  lbghRequire_(m.schema_version === 2 && m.repository === LBGH.repository && m.device === 'esp32-32x32' &&
    m.channel === 'ota-pilot' && m.foundation_id === old.foundation && m.published === true &&
    m.ota_enabled === true && m.automatic_updates === false && m.scene === 'generated' &&
    m.build.run_id === String(run.id) && m.build.attempt === '1' && m.build.commit_sha === config.sourceCommit &&
    m.generation.run_id === '42735010470' && m.generation.response_sha256 === LBGH.responseSha256 &&
    m.generation.model_request_in_this_run === false && m.current.url === report.firmwareUrl &&
    m.current.release_tag === tag && ['version', 'bytes', 'sha256'].every(k => m.current[k] === old[k]), 'RESULT');
  const release = lbghGet_(snapshot, '/releases/tags/' + tag);
  const names = ['firmware.bin', 'recovery.bin', 'manifest.json', 'SHA256SUMS'];
  lbghRequire_(release.draft === false && release.prerelease === true && Array.isArray(release.assets) &&
    release.assets.length === 4 && report.assetSha256 && report.assetBytes, 'RESULT');
  for (const name of names) {
    const assets = release.assets.filter(a => a.name === name);
    lbghRequire_(assets.length === 1 && /^[a-f0-9]{64}$/.test(report.assetSha256[name] || '') &&
      assets[0].state === 'uploaded' && assets[0].size === report.assetBytes[name] &&
      assets[0].digest === 'sha256:' + report.assetSha256[name] &&
      assets[0].browser_download_url === baseUrl + name, 'RESULT');
  }
  lbghRequire_(report.assetSha256['manifest.json'] === report.manifestSha256 &&
    report.assetSha256['firmware.bin'] === old.sha256 && report.assetBytes['firmware.bin'] === old.bytes &&
    report.assetSha256['recovery.bin'] === m.usb_recovery.sha256 &&
    report.assetBytes['recovery.bin'] === m.usb_recovery.bytes, 'RESULT');
  return {version: old.version, foundation: old.foundation, sha256: old.sha256, bytes: old.bytes,
    releaseTag: tag, firmwareUrl: report.firmwareUrl, manifestSha256: report.manifestSha256,
    runId: String(run.id), sourceCommit: config.sourceCommit};
}
function pollPublication() {
  return lbghLocked_((store, snapshot, now) => {
    const {queue, config, q} = lbpubContext_(snapshot);
    if (!q.publicationDispatch) return lbReport({status: 'not_dispatched', jobId: q.jobId});
    if (q.status === 'published') return lbReport({status: 'published', jobId: q.jobId,
      runId: q.publicationDispatch.runId, publication: q.publication,
      automaticDispatchEnabled: false, deviceConfirmed: false});
    let current = q;
    const run = lbghFindRun_(snapshot, lbpubProjection_(q), config, LBPUB);
    if (!run) return lbReport({status: 'awaiting_publication_run', jobId: q.jobId, dispatchRepeated: false});
    if (!q.publicationDispatch.runId) current = lbghSaveEvent_(store, snapshot, queue, q.jobId,
      'bind_publication', {dispatchId: q.publicationDispatch.id, sourceCommit: config.sourceCommit,
        promptSha256: q.promptSha256, runId: String(run.id)}, now);
    if (run.status !== 'completed') return lbReport({status: 'publishing', jobId: q.jobId,
      runId: String(run.id), runUrl: run.html_url, deviceConfirmed: false});
    const {report, workflowJobId} = lbpubReport_(snapshot, run, 'compile-and-publish');
    if (run.conclusion !== 'success' || report.result !== 'published') {
      if (current.status !== 'review_required') lbghSaveEvent_(store, snapshot, queue, q.jobId, 'timeout', {}, now);
      return lbReport({status: 'review_required', jobId: q.jobId, runId: String(run.id),
        publicationConfirmed: false, deviceConfirmed: false, automaticDispatchEnabled: false});
    }
    const publication = lbpubVerify_(snapshot, report, current, config, run);
    current = lbghSaveEvent_(store, snapshot, queue, q.jobId, 'publication_result', {
      runId: String(run.id), sourceCommit: config.sourceCommit, promptSha256: q.promptSha256,
      publication, resultSha256: lbHash(JSON.stringify(report)), workflowJobId}, now);
    return lbReport({status: 'published', jobId: q.jobId, runId: String(run.id), runUrl: run.html_url,
      publication: current.publication, resultSha256: current.publicationDispatch.resultSha256,
      modelRequests: 0, automaticDispatchEnabled: false, deviceConfirmed: false});
  });
}
