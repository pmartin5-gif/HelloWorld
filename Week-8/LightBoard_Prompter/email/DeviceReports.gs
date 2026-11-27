/** Authenticated status reader; add only to the existing PRIVATE inbox project. */
const LBDR = Object.freeze({config: 'LB_DEVICE_REPORT_CONNECTION', latest: 'LB_DEVICE_LATEST_REPORT',
  installed: 'LB_DEVICE_INSTALLED_', poll: 'LB_DEVICE_REPORT_POLL', board: 'lightboard-main'});
function lbdrConfig_(snapshot) {
  const config = JSON.parse(snapshot[LBDR.config] || 'null');
  if (!config) return null;
  lbaRequire_(config.schemaVersion === 1 && config.boardId === LBDR.board &&
    /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]{20,200}\/exec$/.test(config.url || '') &&
    /^[a-f0-9]{64}$/.test(config.key || ''), 'REPORT_CONFIG');
  return config;
}
function lbdrFetch_(config) {
  const payload = JSON.stringify({schemaVersion: 1, action: 'status', boardId: config.boardId,
    reportedAt: Math.floor(Date.now() / 1000), nonce: Utilities.getUuid().replace(/-/g, '')});
  const signature = Utilities.computeHmacSha256Signature(payload, config.key, Utilities.Charset.UTF_8)
    .map(b => (b & 255).toString(16).padStart(2, '0')).join('');
  const response = UrlFetchApp.fetch(config.url, {method: 'post', contentType: 'application/json',
    payload: JSON.stringify({payload, signature}), followRedirects: true, muteHttpExceptions: true});
  lbaRequire_(response.getResponseCode() === 200 && response.getContentText().length <= 6000, 'REPORT_CONNECTION');
  const result = JSON.parse(response.getContentText());
  lbaRequire_(result.ok === true && Object.prototype.hasOwnProperty.call(result, 'report'), 'REPORT_CONNECTION');
  const report = result.report;
  if (report) lbaRequire_(report.boardId === config.boardId && report.action === 'installed' &&
    report.healthy === true && report.otaState === 2 && /^ota-pilot-[a-f0-9]{24}$/.test(report.version || '') &&
    /^[a-f0-9]{64}$/.test(report.foundation || '') && /^[a-f0-9]{64}$/.test(report.sha256 || '') &&
    Number.isSafeInteger(report.bytes) && report.bytes >= 288 && report.bytes <= 1310720 &&
    Number.isSafeInteger(report.reportedAt) && Number.isFinite(Date.parse(report.receivedAt)), 'REPORT_CONNECTION');
  return report;
}
function setupDeviceReportingConnection() {
  const input = JSON.parse(PropertiesService.getScriptProperties().getProperty('LB_DEVICE_REPORT_SETUP') || 'null');
  return connectDeviceReporting(input);
}
function connectDeviceReporting(input) {
  return lbaLocked_((store, snapshot) => {
    lbaRequire_(input, 'REPORT_CONFIG');
    const config = {schemaVersion: 1, boardId: LBDR.board, url: input.url, key: input.key};
    lbdrConfig_({[LBDR.config]: JSON.stringify(config)});
    lbdrFetch_(config); // Check authentication before saving; never print the key.
    lbSet(store, snapshot, LBDR.config, config);
    return lbReport({status: 'configured', boardId: config.boardId, credentialsPrinted: false});
  });
}
function lbdrRefresh_(store, snapshot) {
  const config = lbdrConfig_(snapshot);
  if (!config || Number(snapshot[LBDR.poll] || 0) + 60000 > Date.now()) return;
  store.setProperty(LBDR.poll, String(Date.now())); snapshot[LBDR.poll] = String(Date.now());
  try {
    const report = lbdrFetch_(config);
    if (!report) return;
    // Do not trust a new report to overwrite or relabel an unrelated publication.
    lbSet(store, snapshot, LBDR.latest, report);
    for (const key of Object.keys(snapshot).filter(k => k.startsWith(LBAUTO.completedPrefix))) {
      const completed = JSON.parse(snapshot[key]), result = completed.result;
      if (!result || result.version !== report.version || result.foundation !== report.foundation ||
        result.sha256 !== report.sha256 || result.bytes !== report.bytes) continue;
      const installedKey = LBDR.installed + result.jobId;
      if (!snapshot[installedKey]) lbSet(store, snapshot, installedKey, {schemaVersion: 1,
        jobId: result.jobId, boardId: report.boardId, version: report.version, foundation: report.foundation,
        sha256: report.sha256, bytes: report.bytes, installedAt: new Date(report.reportedAt * 1000).toISOString(),
        receivedAt: report.receivedAt, healthy: true, otaState: 2});
    }
  } catch (_) { /* Reporting outage cannot cause another generation or claim installation. */ }
}
function lbdrDelivery_(snapshot, jobId) {
  const installed = jobId && JSON.parse(snapshot[LBDR.installed + jobId] || 'null');
  const latest = JSON.parse(snapshot[LBDR.latest] || 'null');
  return {status: installed ? 'installed' : jobId ? 'published_awaiting_device' : 'no_publication',
    reportingConfigured: !!snapshot[LBDR.config], deviceConfirmed: !!installed,
    installedAt: installed ? installed.installedAt : null,
    lastReportAt: latest ? latest.receivedAt : null, lastReportedVersion: latest ? latest.version : null};
}
function trackRuntimeUpdatePublication() {
  return lbaLocked_((store, snapshot) => {
    const state = lbaState_(snapshot);
    let id = snapshot.LB_RUNTIME_UPDATE_RUN_ID;
    if (!id) {
      const recent = lbghGet_(snapshot, '/actions/workflows/lightboard-runtime-update.yml/runs?event=workflow_dispatch&branch=main&per_page=1');
      lbaRequire_(Array.isArray(recent.workflow_runs) && recent.workflow_runs.length === 1, 'RUNTIME_UPDATE');
      id = String(recent.workflow_runs[0].id);
    }
    lbaRequire_(state && state.mode === 'continuous' && !state.active && !state.dispatchId &&
      /^[1-9][0-9]*$/.test(id || ''), 'RUNTIME_UPDATE');
    const run = lbghGet_(snapshot, '/actions/runs/' + id);
    const head = lbghGet_(snapshot, '/commits/main');
    lbaRequire_(String(run.id) === id && run.status === 'completed' && run.conclusion === 'success' &&
      run.run_attempt === 1 && run.event === 'workflow_dispatch' && run.head_branch === 'main' &&
      run.head_sha === head.sha && run.repository && run.repository.full_name === LBGH.repository &&
      run.path === '.github/workflows/lightboard-runtime-update.yml', 'RUNTIME_UPDATE');
    const file = lbghGet_(snapshot, '/contents/manifest.json?ref=lightboard-feed');
    lbaRequire_(file.encoding === 'base64' && file.size <= 8192 && typeof file.content === 'string', 'RUNTIME_UPDATE');
    const manifest = JSON.parse(Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g, ''))).getDataAsString('UTF-8'));
    const image = manifest.current;
    lbaRequire_(manifest.schema_version === 2 && manifest.repository === LBGH.repository &&
      manifest.published === true && manifest.automatic_updates === true &&
      manifest.foundation_id === LBAUTO.foundation && manifest.build.run_id === id &&
      manifest.build.commit_sha === run.head_sha && image && /^ota-pilot-[a-f0-9]{24}$/.test(image.version || '') &&
      /^[a-f0-9]{64}$/.test(image.sha256 || '') && Number.isSafeInteger(image.bytes) &&
      image.bytes >= 288 && image.bytes <= 1310720 &&
      image.url === 'https://github.com/' + LBGH.repository + '/releases/download/lightboard-ota-' + id + '-1/firmware.bin', 'RUNTIME_UPDATE');
    const jobId = 'lb-runtime-' + id, key = LBAUTO.completedPrefix + jobId;
    if (!snapshot[key]) lbSet(store, snapshot, key, {schemaVersion: 1, publishedMs: Date.now(), result: {
      operation: 'runtime_update', jobId, runId: id, version: image.version, foundation: manifest.foundation_id,
      sha256: image.sha256, bytes: image.bytes, published: true, modelRequests: 0, deviceConfirmed: false}});
    const saved = JSON.parse(snapshot[key]);
    lbaRequire_(saved.result.sha256 === image.sha256 && saved.result.version === image.version, 'RUNTIME_UPDATE');
    state.lastPublished = {jobId, runUrl: run.html_url, version: image.version,
      publishedAt: new Date(saved.publishedMs).toISOString()};
    state.notBeforeMs = saved.publishedMs + LBAUTO.deliveryIntervalMs;
    lbaSave_(store, snapshot, state);
    lbdrRefresh_(store, snapshot);
    return lbaReport_(state);
  });
}
