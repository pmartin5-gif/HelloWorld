/** Offline queue contract only. No network, credentials, timers or device commands. */
'use strict';

function requireThat(ok, message) { if (!ok) throw new Error(message); }
function initialState() { return {simulation: true, jobs: [], events: []}; }

function transition(input, event) {
  requireThat(input.simulation === true, 'This contract is simulation-only');
  const state = JSON.parse(JSON.stringify(input));
  requireThat(event && typeof event.id === 'string' && event.id, 'Event ID required');
  if (state.events.includes(event.id)) return state;
  const active = () => state.jobs.find(j => ['building', 'published'].includes(j.status));
  if (event.type === 'receive') {
    requireThat(typeof event.jobId === 'string' && event.jobId, 'Job ID required');
    if (!state.jobs.some(j => j.id === event.jobId)) {
      state.jobs.push({id: event.jobId, status: 'received', installedOnRealBoard: false});
    }
  } else {
    const job = state.jobs.find(j => j.id === event.jobId);
    requireThat(job, 'Unknown job');
    if (event.type === 'start') {
      requireThat(!active() && job.status === 'received', 'One in-flight job at a time');
      requireThat(state.jobs.find(j => ['received', 'quota_paused'].includes(j.status)) === job, 'FIFO order required');
      job.status = 'building';
    } else if (event.type === 'publish') {
      requireThat(job.status === 'building' && event.verified === true &&
        /^ota-pilot-[a-f0-9]{24}$/.test(event.version || '') &&
        /^[a-f0-9]{64}$/.test(event.foundation || '') && /^[a-f0-9]{64}$/.test(event.sha256 || ''),
      'Verified publication metadata required');
      Object.assign(job, {status: 'published', version: event.version,
        foundation: event.foundation, sha256: event.sha256});
    } else if (event.type === 'report') {
      requireThat(job.status === 'published' && event.simulated === true && event.healthPassed === true &&
        event.otaState === 'VALID' && event.version === job.version &&
        event.foundation === job.foundation && event.sha256 === job.sha256,
      'Matching healthy simulated device report required');
      job.status = 'device_confirmed_simulated';
    } else if (event.type === 'quota') {
      requireThat(['received', 'building'].includes(job.status), 'Cannot quota-pause an already published job');
      job.status = 'quota_paused';
    } else if (event.type === 'resume') {
      requireThat(job.status === 'quota_paused', 'Job is not quota-paused');
      // Keep its original FIFO position; never choose a paid fallback.
      job.status = 'received';
    } else if (event.type === 'fail' || event.type === 'timeout') {
      requireThat(['received', 'building', 'published', 'quota_paused'].includes(job.status), 'Job is terminal');
      requireThat(typeof event.reason === 'string' && event.reason, 'Failure reason required');
      job.status = 'failed'; job.reason = event.reason;
    } else throw new Error('Unknown event');
  }
  state.events.push(event.id);
  return state;
}

function statusText(job) {
  const text = {received: 'Prompt recorded; waiting.', building: 'Build in progress.',
    published: 'Firmware published; device installation is unconfirmed.',
    quota_paused: 'Paused for service quota; no paid fallback.', failed: 'Job failed.',
    device_confirmed_simulated: 'Simulation passed; real device installation is unverified.'};
  requireThat(text[job.status], 'Unknown status');
  return text[job.status];
}

module.exports = {initialState, transition, statusText};
