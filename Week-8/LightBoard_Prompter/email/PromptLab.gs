/** Private owner web app. Deploy with access Only myself; no credentials in HTML. */
const LBLAB = Object.freeze({settings: 'LB_PROMPT_LAB', prefix: 'LB_LAB_RECEIPT_',
  notePrefix: 'LB_LAB_NOTE_', maxBriefBytes: 4000, maxPromptBytes: 2000});

function lblOwner_(store) {
  const config = lbConfig(store);
  lbaRequire_(lbAddress(Gmail.Users.getProfile('me').emailAddress) === config.account, 'MAILBOX');
  lbaRequire_(LBAUTO.labVersion === 1, 'LAB_UPDATE_REQUIRED');
  return config;
}
function lblRows_(snapshot) {
  return Object.keys(snapshot).filter(k => k.startsWith(LBLAB.prefix)).map(k => JSON.parse(snapshot[k]))
    .sort((a, b) => b.job.receivedAt.localeCompare(a.job.receivedAt));
}
function lblFinished_(snapshot, id) {
  return !!(snapshot[LBAUTO.completedPrefix + id] || snapshot[LBAUTO.rejectedPrefix + id]);
}
function lblSummary_(record, snapshot, state) {
  const job = record.job;
  const done = JSON.parse(snapshot[LBAUTO.completedPrefix + job.id] || 'null');
  const rejected = JSON.parse(snapshot[LBAUTO.rejectedPrefix + job.id] || 'null');
  const active = state && state.jobId === job.id;
  return {id: job.id, title: job.title, prompt: job.prompt, brief: job.generationBrief,
    createdAt: job.receivedAt, promptSha256: job.promptSha256, briefSha256: job.briefSha256,
    status: done ? 'published' : rejected ? 'rejected' : active ? state.status : 'waiting',
    runUrl: done ? 'https://github.com/' + LBGH.repository + '/actions/runs/' + done.result.runId :
      rejected ? rejected.runUrl : active && state.runId ? 'https://github.com/' + LBGH.repository + '/actions/runs/' + state.runId : null,
    version: done ? done.result.version : null,
    note: snapshot[LBLAB.notePrefix + job.id] ? JSON.parse(snapshot[LBLAB.notePrefix + job.id]).note : '',
    deviceConfirmed: false};
}
function lblBrief_(snapshot, commit) {
  const file = lbghGet_(snapshot, '/contents/Week-8/LightBoard_Prompter/generationBrief.md?ref=' + commit);
  lbaRequire_(file.encoding === 'base64' && typeof file.content === 'string', 'BRIEF');
  const document = Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g, ''))).getDataAsString('UTF-8');
  lbaRequire_(document.split('```text\n').length === 2, 'BRIEF');
  return document.split('```text\n')[1].split('```')[0].trim();
}
function doGet() {
  lblOwner_(PropertiesService.getScriptProperties());
  return HtmlService.createHtmlOutputFromFile('PromptLabPage').setTitle('Lightboard Prompt Lab')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function getPromptLab(includeBrief) {
  return lbaLocked_((store, snapshot) => {
    lblOwner_(store);
    const state = lbaState_(snapshot);
    const mode = JSON.parse(snapshot[LBLAB.settings] || '{"active":false}');
    return {labActive: mode.active === true, processingActive: !!(state && state.active),
      status: state ? state.status : 'not_started', activeJobId: state ? state.jobId || null : null,
      activeRunUrl: state && state.runId ? 'https://github.com/' + LBGH.repository + '/actions/runs/' + state.runId : null,
      nextBuildAfter: state && state.notBeforeMs > Date.now() ? new Date(state.notBeforeMs).toISOString() : null,
      sourceCommit: state ? state.sourceCommit : null,
      ...(includeBrief && state ? {defaultBrief: lblBrief_(snapshot, state.sourceCommit)} : {}),
      experiments: lblRows_(snapshot).slice(0, 30).map(r => lblSummary_(r, snapshot, state))};
  });
}
function submitLabExperiment(input) {
  return lbaLocked_((store, snapshot) => {
    const config = lblOwner_(store), state = lbaState_(snapshot);
    lbaRequire_(state && state.mode === 'continuous' && state.active, 'PROCESSING_PAUSED');
    lbaRequire_(input && /^[a-f0-9]{32}$/.test(input.requestId || ''), 'EXPERIMENT');
    const prompt = lbPrompt(String(input.prompt || '').replace(/\r\n?/g, '\n').trim());
    const brief = String(input.brief || '').replace(/\r\n?/g, '\n').trim();
    const title = String(input.title || 'Untitled experiment').trim();
    lbaRequire_(title.length <= 64 && lbBytes(prompt) <= LBLAB.maxPromptBytes &&
      lbBytes(brief) <= LBLAB.maxBriefBytes && brief.split('{{creative_prompt}}').length === 2 &&
      !brief.includes('```') && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(brief), 'BRIEF');
    const id = 'lb-' + lbHash(config.account).slice(0, 12) + '-lab' + input.requestId;
    const key = LBLAB.prefix + id;
    const briefSha256 = lbHash('```text\n' + brief + '\n```\n');
    if (snapshot[key]) {
      const previous = JSON.parse(snapshot[key]);
      lbaRequire_(previous.job.promptSha256 === lbHash(prompt) && previous.job.briefSha256 === briefSha256, 'EXPERIMENT');
      return {accepted: true, experiment: lblSummary_(previous, snapshot, state)};
    }
    // One explicit experiment at a time. A lost browser reply reuses requestId.
    lbaRequire_(!lblRows_(snapshot).some(r => !lblFinished_(snapshot, r.job.id)), 'EXPERIMENT_PENDING');
    lbghCheckSource_(snapshot, state.sourceCommit, state.workflowId, LBAUTO);
    lbghCheckFile_(snapshot, LBAUTO.workflowPath, state.sourceCommit, LBAUTO.workflowSha256);
    const record = {schemaVersion: 1, outcome: 'received', job: {id, origin: 'prompt_lab', title,
      sender: config.account, prompt, promptSha256: lbHash(prompt), generationBrief: brief, briefSha256,
      receivedAt: new Date(Date.now()).toISOString()}};
    lbaRequire_(lbBytes(JSON.stringify(record)) <= 8000, 'EXPERIMENT_TOO_LARGE');
    lbSet(store, snapshot, LBLAB.settings, {schemaVersion: 1, active: true});
    lbSet(store, snapshot, key, record);
    return {accepted: true, experiment: lblSummary_(record, snapshot, state)};
  });
}
function resumeEmailFromLab() {
  return lbaLocked_((store, snapshot) => {
    lblOwner_(store);
    lbaRequire_(!lblRows_(snapshot).some(r => !lblFinished_(snapshot, r.job.id)), 'EXPERIMENT_PENDING');
    lbSet(store, snapshot, LBLAB.settings, {schemaVersion: 1, active: false});
    return {labActive: false};
  });
}
function continueAfterRejectedBuild() {
  const resolved = lbaLocked_((store, snapshot) => {
    lblOwner_(store);
    const state = lbaState_(snapshot);
    lbaRequire_(state && !state.active && state.dispatchId && state.runId, 'HELD_JOB');
    const run = lbaRun_(lbghGet_(snapshot, '/actions/runs/' + state.runId), state);
    lbaRequire_(run.status === 'completed' && run.conclusion === 'failure', 'HELD_JOB');
    const data = lbghGet_(snapshot, '/actions/runs/' + run.id + '/attempts/1/jobs?per_page=100');
    lbaRequire_(data.total_count === 1 && Array.isArray(data.jobs) && data.jobs.length === 1, 'PUBLICATION_UNCERTAIN');
    const job = data.jobs[0], steps = job.steps || [];
    const publication = steps.filter(s => s.name === 'Publish firmware for automatic installation');
    const failedCode = steps.filter(s => ['Validate animation code boundary', 'Compile firmware and recovery'].includes(s.name) && s.conclusion === 'failure');
    lbaRequire_(String(job.run_id) === state.runId && job.name === 'email-to-panel' &&
      job.conclusion === 'failure' && publication.length === 1 && publication[0].conclusion === 'skipped' &&
      failedCode.length === 1, 'PUBLICATION_UNCERTAIN');
    const rejected = {schemaVersion: 1, jobId: state.jobId, runId: state.runId, runUrl: run.html_url,
      promptSha256: state.promptSha256, commitSha: state.sourceCommit, failedStep: failedCode[0].name,
      published: false, deviceConfirmed: false};
    lbSet(store, snapshot, LBAUTO.rejectedPrefix + state.jobId, rejected); // Save BEFORE release.
    state.lastRejected = rejected;
    ['jobId', 'promptSha256', 'dispatchId', 'dispatchMs', 'runId', 'result', 'briefSha256'].forEach(k => delete state[k]);
    state.status = 'rejected_build_recorded';
    lbaSave_(store, snapshot, state);
    return {resolved: true};
  });
  return resolved && resolved.resolved ? startContinuousEmail() : resolved;
}
function saveLabObservation(id, note) {
  return lbaLocked_((store, snapshot) => {
    lblOwner_(store);
    lbaRequire_(typeof id === 'string' && snapshot[LBLAB.prefix + id] &&
      typeof note === 'string' && note.length <= 500 && lbBytes(note) <= 2000, 'EXPERIMENT');
    lbSet(store, snapshot, LBLAB.notePrefix + id, {note});
    return {saved: true}; // A personal observation, never an authenticated device report.
  });
}
