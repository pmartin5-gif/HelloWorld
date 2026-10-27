const assert = require('node:assert/strict');
const { createSimulation } = require('./piling-harness.cjs');

// Rain onto one point gradually, then let the bed reach a stable mound.
const sim = createSimulation({ overrides: { particles: 0, windStrength: 0 } });
const center = sim.state.surfaces[50];
let maximumCreepStep = 0;
for (let i = 0; i < 120; i++) {
  sim.add(center);
  for (let j = 0; j < 10; j++) {
    const positions = new Map(sim.state.flakes.map(f => [f, f.x]));
    sim.tick(1 / 60);
    for (const f of sim.state.flakes) {
      if (f.mode === 'settled') maximumCreepStep = Math.max(maximumCreepStep, Math.abs(f.x - positions.get(f)));
    }
  }
}
for (let i = 0; i < 1800; i++) sim.tick(1 / 60);
const filled = sim.state.surfaces.filter(s => s.depth > 1e-8);
assert.equal(sim.state.flakes.length, 120);
assert.equal(sim.state.flakes.filter(f => f.mode === 'settled').length, 120);
assert.equal(filled.at(-1).col - filled[0].col + 1, filled.length, 'The mound has no empty strips between its sides');
assert(center.depth > filled[0].depth * 3 && center.depth > filled.at(-1).depth * 3, 'A concentrated supply builds a broad, tapered mound');
assert(maximumCreepStep <= 72 / 60 + 1e-8, 'Surface transport cannot teleport grains between samples');
let maximumStep = 0;
for (const s of sim.state.surfaces) {
  assert(Math.abs(s.depth - s.stack.reduce((sum, f) => sum + f.thickness, 0)) < 1e-7);
  assert(s.stack.every(f => f.surface === s && f.mode === 'settled'));
  if (!s.right) continue;
  const boundary = (s.x + s.right.x) / 2;
  assert(Math.abs(sim.pileHeightAt(s, boundary) - sim.pileHeightAt(s.right, boundary)) < 1e-8, 'Landing and sliding see a continuous boundary');
  maximumStep = Math.max(maximumStep, Math.abs(s.y - s.depth - (s.right.y - s.right.depth)));
}
assert(maximumStep <= sim.settings.surfaceCell * sim.settings.reposeSlope + .3 + 1e-7, 'A stable pile respects the intended slope with only small hysteresis');
assert.equal(new Set(sim.state.surfaces.flatMap(s => s.stack)).size, 120);
console.log(`PASS: ${filled.length} connected samples; ${maximumStep.toFixed(2)}px largest stable height step; ${maximumCreepStep.toFixed(2)}px largest creep movement per frame; all 120 grains conserved.`);

// A larger grain contributes area, not the same vertical stack increment scaled
// only by height. The test uses a fresh bed so no redistribution obscures it.
const packing = createSimulation({ overrides: { particles: 0, windStrength: 0 } });
const shelf = packing.state.surfaces[30];
const small = packing.add(shelf, 1), large = packing.add(shelf, 2);
assert(Math.abs(large.thickness / small.thickness - 4) < 1e-8);

// On a narrow viewport, curved shelves can differ by over 10px between samples.
// Solid-run topology must keep those slopes connected without crossing a hole.
const steep = createSimulation({ width: 200, height: 1000, shape: 'curve', overrides: { particles: 0 } });
assert(steep.state.surfaces.some(s => s.right && Math.abs(s.y - s.right.y) > 10));
const hollow = createSimulation({ shape: 'hollow', overrides: { particles: 0 } });
for (const s of hollow.state.surfaces) {
  for (const next of [s.left, s.right]) {
    if (!next) continue;
    assert(Math.min(s.bottom, next.bottom) > Math.max(s.y, next.y), 'A connection has supporting solid in common');
    assert(next.left === s || next.right === s, 'Connections are reciprocal');
  }
}
console.log('PASS: area-based packing, connected steep curves, and separate numeral-hole ledges.');
