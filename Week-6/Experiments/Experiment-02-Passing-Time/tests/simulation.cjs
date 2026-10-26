// Test the real simulation with synthetic raster data. This does not test
// browser text rendering, Canvas painting performance, or artistic legibility.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
let bounds = { width: 1200, height: 700 };
let scheduled;
const attributes = {};
const drawing = new Proxy({}, { get: (obj, name) => obj[name] ?? (() => {}),
  set: (obj, name, value) => { obj[name] = value; return true; } });
const canvas = { width: 0, getContext: () => drawing,
  getBoundingClientRect: () => bounds, setAttribute: (key, value) => { attributes[key] = value; } };
const document = {
  getElementById: id => { assert.equal(id, 'sky'); return canvas; },
  addEventListener() {},
  createElement: tag => {
    assert.equal(tag, 'canvas');
    const image = { width: 0, height: 0 };
    image.getContext = () => ({
      measureText: () => ({ actualBoundingBoxAscent: 50, actualBoundingBoxDescent: 1 }),
      fillText() {},
      getImageData: () => {
        const data = new Uint8ClampedArray(image.width * image.height * 4);
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          if (x >= image.width * .25 && x < image.width * .75 && y >= image.height * .25 && y < image.height * .75)
            data[(y * image.width + x) * 4 + 3] = 255;
        }
        return { data };
      }
    });
    return image;
  }
};
let seed = 816;
const math = Object.create(Math);
math.random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
let hour = 17, minute = 30;
class MockDate { getHours() { return hour; } getMinutes() { return minute; } }
let source = fs.readFileSync(path.join(__dirname, '..', 'passing-time.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'return { state, settings, grid, step, resize, updateClock, clockText, readMask, influenceAt, recycle, angleDelta }; })();');
function loadSimulation(overrides = {}) {
if (typeof overrides === 'number') overrides = { affectedPercentage: overrides };
let configuredSource = source;
for (const [key, value] of Object.entries(overrides)) {
  configuredSource = configuredSource.replace(new RegExp(`(${key}: )[-0-9.]+`), `$1${value}`);
}
return new Function('document', 'devicePixelRatio', 'matchMedia', 'ResizeObserver', 'requestAnimationFrame', 'Math', 'Date',
  'return ' + configuredSource.slice(configuredSource.indexOf('(() =>')))(document, 1, () => ({ matches: false }),
  class { observe() {} }, callback => { scheduled = callback; }, math, MockDate);
}
const api = loadSimulation({ heading: -.38 * 180 / Math.PI, bend: 0 });
const { state, settings, step, resize, updateClock, clockText, influenceAt } = api;
assert.equal(state.birds.length, 8000);
assert.equal(clockText(), '5:30');
assert(attributes['aria-label'].includes('5:30'));
hour = 0; minute = 5; assert.equal(clockText(), '12:05');
assert.equal(influenceAt(600, 350, 1), 1);
assert.equal(influenceAt(10, 10, 1), 0);

const affectedBirds = state.birds.filter(b => b.affected);
assert(Math.abs(affectedBirds.length / state.birds.length - settings.affectedPercentage / 100) < .03);
const unaffectedBirds = state.birds.filter(b => !b.affected);
assert(unaffectedBirds.every(b => b.slowdown === 0));
const inside = affectedBirds.filter(b => influenceAt(b.x, b.y, 1) > .99).length;
const densityRatio = (inside / .25) / ((affectedBirds.length - inside) / .75);
const unaffectedInside = unaffectedBirds.filter(b => influenceAt(b.x, b.y, 1) > .99).length;
const unaffectedDensity = (unaffectedInside / .25) / ((unaffectedBirds.length - unaffectedInside) / .75);
assert(Math.abs(unaffectedDensity - 1) < .12, 'Unaffected birds start uniformly distributed');
assert(densityRatio > 1.1 && densityRatio < 1.45, `Initial residence-time density: ${densityRatio}`);
console.log(`PASS: 8,000 birds; 12-hour clock; clock mask sampled; initial inside/outside density ratio ${densityRatio.toFixed(2)}.`);

// Drive the actual animation callback without any UI elements besides canvas.
scheduled(0); scheduled(16);
const start = performance.now();
for (let i = 0; i < 600; i++) {
  state.elapsed += 1 / 30; step(1 / 30);
  if (i % 30 === 0) for (const b of state.birds) {
    assert(Number.isFinite(b.x + b.y + b.vx + b.vy));
    assert(b.vx > 0 && b.vy < 0, 'Every bird must continue in the common direction');
    assert(b.x >= -settings.margin && b.x <= state.width + settings.margin);
    assert(b.y >= -settings.margin && b.y <= state.height + settings.margin);
  }
}
assert.equal(state.birds.length, 8000);
console.log(`PASS: 20 seconds of 8,000-bird flight, forward-only motion and bounded recycling (${((performance.now() - start) / 600).toFixed(2)} ms/step in Node; no browser painting).`);

// Isolated birds verify the selected slowdown and an unaffected passage.
const allBirds = state.birds;
const probe = { ...allBirds[0], x: 600, y: 350, speed: 90, slowdown: 0, affected: true };
state.birds = [probe];
for (let i = 0; i < 360; i++) { probe.x = 600; probe.y = 350; step(1 / 30); }
assert(Math.abs(Math.hypot(probe.vx, probe.vy) - 90 * (1 - settings.slowing)) < .01);
for (let i = 0; i < 360; i++) { probe.x = 10; probe.y = 10; step(1 / 30); }
assert(Math.abs(Math.hypot(probe.vx, probe.vy) - 90) < .01);
probe.affected = false; probe.slowdown = 0;
for (let i = 0; i < 90; i++) { probe.x = 600; probe.y = 350; step(1 / 30); }
assert.equal(probe.slowdown, 0);
assert(Math.abs(Math.hypot(probe.vx, probe.vy) - 90) < .01);
assert.equal(probe.affected, false, 'Selection remains stable during a passage');
let selected = 0;
for (let i = 0; i < 2000; i++) {
  api.recycle(probe);
  if (probe.affected) selected++;
  assert.equal(probe.slowdown, 0);
}
assert(Math.abs(selected / 2000 - settings.affectedPercentage / 100) < .04, 'Re-entry makes a fresh random selection');
state.birds = allBirds;
console.log('PASS: selected birds slow by the configured amount; unaffected birds retain speed; re-entry reselects.');

hour = 12; minute = 0; updateClock();
assert.equal(state.key, '12:00'); assert(state.previousMask); assert.equal(state.transition, 0);
step(settings.minuteTransition + .1); assert.equal(state.previousMask, null);
bounds = { width: 390, height: 844 }; resize();
assert.equal(state.width, 390); assert.equal(state.height, 844);
assert.equal(state.mask.width, 130);
for (let i = 0; i < 30; i++) step(1 / 30);
assert(state.birds.every(b => Number.isFinite(b.x + b.y) && b.vx > 0 && b.vy < 0));
console.log('PASS: minute transition retires old mask; portrait resize preserves forward flight.');

for (const percentage of [0, 100]) {
  const simulation = loadSimulation(percentage);
  const expected = percentage === 100;
  assert(simulation.state.birds.every(b => b.affected === expected));
  const bird = simulation.state.birds[0];
  for (let i = 0; i < 100; i++) {
    simulation.recycle(bird);
    assert.equal(bird.affected, expected);
  }
}
console.log('PASS: 0% and 100% apply to initial birds and every re-entry.');

// All cardinal and diagonal headings, including wrapped angles, must keep the
// population bounded and feed the upstream edges at the expected flux ratio.
bounds = { width: 1200, height: 700 };
for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2,
  Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4, 9 * Math.PI]) {
  const sim = loadSimulation({ birds: 160, heading: heading * 180 / Math.PI, bend: 4.5 });
  const { width, height } = sim.state;
  const m = sim.settings.margin;
  const b = sim.state.birds[0];
  const dx = Math.cos(heading), dy = Math.sin(heading);
  let sideEntries = 0;
  for (let i = 0; i < 3000; i++) {
    sim.recycle(b);
    const side = b.x === (dx >= 0 ? -m : width + m);
    if (side) sideEntries++;
    else assert.equal(b.y, dy >= 0 ? -m : height + m);
    assert(Math.abs(sim.angleDelta(heading, b.heading)) < 1e-12);
    assert(Math.abs(b.vx - dx * b.speed) < 1e-10);
    assert(Math.abs(b.vy - dy * b.speed) < 1e-10);
  }
  const sideFlux = Math.abs(dx) * (height + 2 * m);
  const verticalFlux = Math.abs(dy) * (width + 2 * m);
  assert(Math.abs(sideEntries / 3000 - sideFlux / (sideFlux + verticalFlux)) < .04);
  // Every exit side recycles, even when a bend opposes the base heading.
  for (const [x, y] of [[-m - 20, 350], [width + m + 20, 350],
    [600, -m - 20], [600, height + m + 20]]) {
    Object.assign(b, { x, y });
    sim.step(1 / 30);
    assert(b.x >= -m && b.x <= width + m && b.y >= -m && b.y <= height + m);
  }
  for (let i = 0; i < 900; i++) {
    sim.state.elapsed += 1 / 30;
    sim.step(1 / 30);
    for (const bird of sim.state.birds) {
      assert(Number.isFinite(bird.x + bird.y + bird.heading + bird.vx + bird.vy));
      assert(bird.x >= -m && bird.x <= width + m && bird.y >= -m && bird.y <= height + m);
    }
  }
}
console.log('PASS: arbitrary headings and large bends stay bounded; all four exits recycle; upstream flux matches flight direction.');

for (const bend of [-Math.PI, -Math.PI / 2, Math.PI / 2, Math.PI, 8 * Math.PI + .8]) {
  const sim = loadSimulation({ birds: 1, heading: 0, bend });
  const bird = sim.state.birds[0];
  Object.assign(bird, { affected: true, slowdown: 1 });
  for (let i = 0; i < 360; i++) {
    bird.x = 600; bird.y = 350;
    sim.step(1 / 30);
  }
  assert(Math.abs(sim.angleDelta(bend, bird.heading)) < .15, 'Bend reaches its target without an angle clamp');
}
// Opposite numeric signs at the PI seam still describe nearly parallel birds.
const seam = loadSimulation({ birds: 2, heading: 180, bend: 0 });
for (const [i, bird] of seam.state.birds.entries()) {
  Object.assign(bird, { x: 600, y: 350, heading: i ? -Math.PI + .01 : Math.PI - .01 });
}
seam.step(1 / 30);
assert(seam.state.birds.every(b => Math.abs(b.heading) > 3), 'Alignment and turning follow the short path across PI');
console.log('PASS: positive, negative, reversing and multi-turn bends; circular alignment and steering across the PI seam.');
