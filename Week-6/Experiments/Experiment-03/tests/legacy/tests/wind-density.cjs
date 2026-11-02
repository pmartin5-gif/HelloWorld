const assert = require('node:assert/strict');
const { createSimulation } = require('./piling-harness.cjs');
// Side exits must preserve height and motion, rather than draining the lower
// parts of the scene by moving every departing grain back to the top.
const sim = createSimulation({ shape: 'empty', overrides: { particles: 0, windStrength: 0 } });
for (const direction of [-1, 1]) {
  const f = sim.spawnFlake();
  Object.assign(f, { x: direction > 0 ? sim.state.width + 27 : -27,
    y: 330, vx: direction * 60, vy: 30, passThrough: true, ignoreGlyph: 3 });
  sim.state.flakes.push(f);
  sim.tick(1 / 60);
  assert(Math.abs(f.y - 330) < 2, 'A side exit must preserve height');
  assert(f.vx * direction > 40, 'A side exit must preserve momentum');
  assert.equal(f.passThrough, true);
  assert.equal(f.ignoreGlyph, 3);
  assert(direction > 0 ? f.x < 0 : f.x > sim.state.width);
}
console.log('PASS: horizontal exits wrap at the same height with momentum and passage state intact.');

const coat = createSimulation({ overrides: { particles: 0 } });
const surface = coat.state.surfaces[20];
for (let i = 0; i < 30; i++) coat.add(surface);
const base = surface.stack[0];
const top = surface.stack.at(-1);
coat.state.wind = { kind: 'gust', x: top.x, y: top.y, rx: 150, ry: 150,
  strength: 145, travel: 1, direction: 1, tilt: 0, age: 4, duration: 8, driftX: 0, driftY: 0 };
for (let i = 0; i < 400; i++) coat.erodePiles(.05);
assert(surface.depth >= coat.settings.windResidue);
assert(surface.depth < coat.settings.windResidue + 1.6);
assert.equal(base.mode, 'settled');
assert.equal(top.mode, 'falling');
console.log(`PASS: prolonged wind strips loose ash but leaves ${surface.depth.toFixed(2)}px of settled dust.`);

// Sustained wind is a stress test: each part of the open sky must remain
// populated, even though the normal scene has much longer calm intervals.
for (const direction of [-1, 1]) {
const cloud = createSimulation({ shape: 'empty', seed: 42, overrides: { particles: 8000 } });
cloud.state.wind = { kind: 'gust', x: 400, y: 300, rx: 650, ry: 650,
  strength: 85, travel: direction, direction, tilt: 0, age: 4, duration: 8, driftX: 0, driftY: 0, shear: .1, phase: 0 };
let minimum = Infinity;
for (let i = 0; i < 900; i++) {
  cloud.state.wind.age = 4;
  cloud.tick(1 / 30);
  if (i % 30 === 0) {
    const bins = new Array(18).fill(0);
    for (const f of cloud.state.flakes) if (f.x >= 0 && f.x < 800 && f.y >= 0 && f.y < 600) {
      bins[Math.floor(f.y / 200) * 6 + Math.floor(f.x / (800 / 6))]++;
    }
    minimum = Math.min(minimum, ...bins);
    assert(bins.every(n => n >= 50), 'No region should be swept bare by sustained wind: ' + JSON.stringify({ seconds: i / 30, bins }));
  }
}
assert.equal(cloud.state.flakes.length, 8000);
console.log(`PASS: 30-second wind stress test (direction ${direction}) retains all 8,000 flakes; sparsest of 18 screen regions contains ${minimum} flakes.`);

}
