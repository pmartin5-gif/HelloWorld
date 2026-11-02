// node tests/game.cjs — timing rules plus the real screen/audio orchestration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SongRound, validateChart, LEVEL_RULES } = require('../level.js');
const chart = require('../Songs/pink-panther.chart.json');
const easyChart = {...require('../Songs/happy-birthday.chart.json'), notes: []};
const hardChart = {...require('../Songs/bleeding-the-weak.chart.json'), notes: []};
const catalog = require('../Songs/catalog.json');
let decodedDuration = chart.duration;
validateChart(chart);
const fixture = { audio: 'test.m4a', duration: 5, notes: [1, 1.5, 3] };
assert.throws(() => validateChart({ ...fixture, notes: [1, 1] }));
assert.throws(() => validateChart({ ...fixture, notes: [NaN] }));
// Dense notes have overlapping windows, but one fresh press resolves only one.
const denseChart = { ...fixture, notes: [1, 1.001, 1.0011, 1.001101] };
validateChart(denseChart);
let dense = new SongRound(denseChart);
for (const [index, time] of denseChart.notes.entries()) {
  dense.press(time);
  assert.equal(dense.hits, index + 1);
  assert.equal(dense.misses, 0);
}
dense.update(6); assert.equal(dense.misses, 0);
dense = new SongRound(denseChart);
dense.press(1.0011);
assert.equal(dense.hits, 1);
assert.equal(dense.notes[2].result, 'hit', 'Nearest dense note wins');
assert.equal(dense.notes[0].result, 'pending', 'Neighbors remain independent');
dense.update(2); assert.equal(dense.misses, 3);
dense.update(3); assert.equal(dense.misses, 3, 'Dense misses only count once');
dense = new SongRound({ ...fixture, notes: [1, 1.015625] });
dense.press(1.0078125); assert.equal(dense.notes[0].result, 'hit', 'Exact tie prefers earlier note');
let round = new SongRound(fixture);
round.press(-1);
assert.equal(round.misses, 0, 'Countdown input ignored');
round.update(1);
assert.equal(round.x(round.notes[0]), 98.5, 'Note center meets target center on beat');
assert.equal(round.x(round.notes[1]), 128.5, 'Several bars keep independent positions');
for (const offset of [-0.125, 0, 0.125]) {
  round = new SongRound(fixture);
  round.press(1 + offset);
  assert.equal(round.hits, 1, 'Inclusive overlap boundary');
}
round = new SongRound(fixture);
round.press(0.874);
assert.equal(round.notes[0].result, 'miss', 'Early input consumes next pending note');
round.press(1);
assert.equal(round.hits, 0, 'Miss cannot be rescued');
assert.equal(round.misses, 2, 'Second bad press consumes next note');
round.update(3.126);
assert.equal(round.misses, 3);
round.press(4);
round.update(6);
assert.equal(round.misses, 3, 'No double scoring or penalties after last note');
assert.equal(round.finished, true);
for (const step of [1/60, 0.083, 0.31]) {
  round = new SongRound(fixture);
  for (let t=-3; t<6; t+=step) round.update(t);
  assert.equal(round.misses, 3, 'Misses independent of rendering rate');
}
round = new SongRound({ ...fixture, notes: [5] });
round.update(5);
assert.equal(round.finished, false, 'Final hit window survives audio ending');
round.press(5.1);
assert.equal(round.hits, 1);
assert.equal(round.finished, true);
round = new SongRound(chart);
for (const time of chart.notes) round.press(time);
round.update(chart.duration + LEVEL_RULES.hitWindow);
assert.equal(round.hits, chart.notes.length, 'Every chart note playable');
assert.equal(round.misses, 0);

class AudioMock {
  constructor() { this.currentTime = 10; this.state = 'suspended'; this.destination = {}; this.sources = []; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async decodeAudioData() { return { duration: decodedDuration }; }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start(at) { this.at = at; }, stop() { this.stopped = true; } };
    this.sources.push(source);
    return source;
  }
}
const elements = new Map();
const callbacks = {};
let failFetch = false;
let deferred = null;
const ctx = vm.createContext({
  console: { log() {}, error() {} }, Math,
  window: { AudioContext: AudioMock, addEventListener(name, fn) { callbacks[name] = fn; } },
  document: {
    hidden: false, hasFocus: () => true,
    addEventListener(name, fn) { callbacks[name] = fn; },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } });
      return elements.get(id);
    }
  },
  fetch: async url => {
    if (deferred) await deferred;
    if (failFetch) throw new Error('offline');
    if (url.endsWith('catalog.json')) return {ok:true,json:async()=>catalog};
    if (url.endsWith('happy-birthday.chart.json')) return {ok:true,json:async()=>easyChart};
    if (url.endsWith('bleeding-the-weak.chart.json')) return {ok:true,json:async()=>hardChart};
    if (url === hardChart.audio) decodedDuration = hardChart.duration;
    else if (url === easyChart.audio) decodedDuration = easyChart.duration;
    else if (url === chart.audio) decodedDuration = chart.duration;
    return { ok: true, json: async () => chart, arrayBuffer: async () => new ArrayBuffer(1) };
  },
  ESCAPE: 27, TWO_PI: Math.PI * 2, deltaTime: 16,
  random: (min, max) => max === undefined ? min / 2 : (min + max) / 2,
  createCanvas: () => ({ parent() {}, attribute() {} }),
});
for (const name of ['noStroke','fill','rect','background','push','pop','scale','translate','stroke','strokeWeight','noFill','triangle','pixelDensity','noSmooth']) ctx[name] = () => {};
for (const file of ['level.js', 'sketch.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
const run = code => vm.runInContext(code, ctx);
const press = (code=32, repeat=false) => run(`keyCode=${code}; keyPressed({repeat:${repeat}})`);
const release = () => run('keyCode=32; keyReleased()');
const flush = () => new Promise(resolve => setImmediate(resolve));
const chooseMedium = async () => {
  release(); press();
  assert.equal(run('screen'), 'difficulty');
  release(); press(); await flush();
};
(async () => {
  run('setup(); draw()');
  assert.equal(run('screen'), 'start');
  elements.get('start-button').listeners.click();
  assert.equal(run('screen'), 'difficulty', 'Start click opens level selection');
  elements.get('difficulty-2').listeners.click();
  await flush();
  assert.equal(run('screen'), 'start', 'Unmapped Hard prompts the player to create a chart');
  assert.equal(run('errorMessage'), 'unmapped');
  press(27);
  assert.equal(elements.get('difficulty-menu').hidden, true);
  press();
  assert.equal(run('screen'), 'difficulty');
  assert.equal(run('selectedDifficulty'), 1, 'Medium is the default');
  run('draw()');
  press(32, true);
  assert.equal(run('screen'), 'difficulty', 'Holding Start does not confirm a level');
  press(38); assert.equal(run('selectedDifficulty'), 0);
  press(38); assert.equal(run('selectedDifficulty'), 2, 'Navigation wraps');
  press(37); assert.equal(run('selectedDifficulty'), 1);
  release(); press(); await flush();
  assert.equal(run('screen'), 'game');
  assert.equal(elements.get('difficulty-menu').hidden, true);
  assert.equal(run('player.time'), -3);
  const firstStart = run('player.source.at');
  assert.equal(firstStart, 13);
  press(32, true);
  assert.equal(run('misses'), 0);
  run('draw()'); // countdown renders
  run('audioContext.currentTime = player.startedAt + 0.1; draw()');
  assert.equal(run('round.time'), 0.09999999999999964);
  // Avoid oscillator rendering in this logic test, but verify feedback callback effects.
  run('playChime = () => {}; playFailure = () => {}');
  release();
  press();
  assert.equal(run('misses'), 1);
  press(32, true);
  assert.equal(run('misses'), 1, 'Held Space does not consume more notes');
  run('audioContext.currentTime = player.startedAt + round.notes[1].time');
  release(); press();
  assert.equal(run('hits'), 1);
  assert.equal(run('particles.length'), 18);
  callbacks.blur(); await flush();
  assert.equal(run('screen'), 'paused');
  assert.equal(run('audioContext.state'), 'suspended');
  run('draw()');
  release(); press(); await flush();
  assert.equal(run('screen'), 'game');
  assert.equal(run('player.source.at'), firstStart, 'Resume retains original song timeline');
  press(27);
  assert.equal(run('screen'), 'start');
  assert.equal(run('player.source'), null);
  assert.equal(elements.get('start-button').hidden, false);
  await chooseMedium();
  assert.equal(run('hits + misses'), 0, 'Replay resets counters');
  run('audioContext.currentTime = player.startedAt + 62; draw()');
  assert.equal(run('screen'), 'results');
  assert.equal(run('hits + misses'), chart.notes.length);
  run('draw()');
  release(); press(); await flush();
  assert.equal(run('screen'), 'game');
  assert.equal(run('round.time'), -3);
  press(27);
  // Escape must invalidate completion of an outstanding load.
  run('player = null');
  let finish;
  deferred = new Promise(resolve => { finish = resolve; });
  await chooseMedium();
  assert.equal(run('screen'), 'loading');
  press(27); finish(); deferred = null; await flush();
  assert.equal(run('screen'), 'start');
  assert.equal(run('player.source'), null);
  run('player = null'); failFetch = true;
  await chooseMedium();
  assert.equal(run('screen'), 'start');
  assert.equal(run('errorMessage'), true);
  run('draw()');
  failFetch = false;
  await chooseMedium();
  assert.equal(run('screen'), 'game', 'Failed loads can be retried');
  ctx.document.hidden = true; callbacks.visibilitychange(); await flush();
  assert.equal(run('screen'), 'paused');
  press(27);
  ctx.document.hidden = false;
  // Easy is connected, but an empty chart asks for mapping instead of inventing notes.
  release(); press(); press(38); release(); press(); await flush();
  assert.equal(run('screen'),'start');
  assert.equal(run('errorMessage'),'unmapped');
  run('draw()');
  easyChart.notes=[1,1.001,2];
  release(); press(); press(38); release(); press(); await flush();
  assert.equal(run('screen'),'game');
  assert.equal(run('player.songId'),'easy');
  assert.equal(run('player.chart.audio'),easyChart.audio);
  run('audioContext.currentTime = player.startedAt + 45; draw()');
  assert.equal(run('screen'),'results');
  release(); press(); await flush();
  assert.equal(run('player.songId'),'easy','Results replay retains Easy');
  press(27); await chooseMedium();
  assert.equal(run('player.songId'),'medium');
  assert.equal(run('player.chart.audio'),chart.audio);
  press(27);
  // A saved Hard chart loads its own MP3 and replays at the same difficulty.
  hardChart.notes=[1,1.001,3];
  release(); press(); press(40); release(); press(); await flush();
  assert.equal(run('screen'),'game');
  assert.equal(run('player.songId'),'hard');
  assert.equal(run('player.chart.audio'),hardChart.audio);
  run('audioContext.currentTime = player.startedAt + 185; draw()');
  assert.equal(run('screen'),'results');
  release(); press(); await flush();
  assert.equal(run('player.songId'),'hard');
  assert.equal(run('round.time'),-3);
  press(27);
  console.log(`Passed timing, all ${chart.notes.length} chart notes, screen rendering, loading/retry/cancellation, fresh input, countdown, pause/resume, Escape, results and replay.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
