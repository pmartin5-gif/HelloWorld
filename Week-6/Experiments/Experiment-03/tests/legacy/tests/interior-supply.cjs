const assert = require('node:assert/strict');
const { createSimulation } = require('./piling-harness.cjs');
for (const shape of ['hollow', 'double-hollow']) {
  const sim = createSimulation({ shape, overrides: { particles: 0, windStrength: 0, interiorSupply: 1 } });
  const { state } = sim;
  assert(state.interiorSources.length > 0);
  const floors = [...new Set(state.interiorSources.map(s => s.floor.y))];
  assert.equal(floors.length, shape === 'hollow' ? 1 : 2);
  // Start with no ash in any opening, and bring fresh flakes through recycle.
  for (let i = 0; i < 80; i++) {
    const f = sim.spawnFlake(); state.flakes.push(f); sim.recycle(f);
    assert(f.y > 0 && f.y < state.height, 'Fresh supply enters beneath an inner upper lip');
    const col = state.columns[Math.floor(f.x / sim.settings.surfaceCell)];
    assert(!col.some(s => f.y + f.size > s.y && f.y - f.size < s.bottom));
  }
  for (let i = 0; i < 900; i++) sim.tick(1 / 60);
  for (const y of floors) assert(state.surfaces.some(s => s.y === y && s.stack.length > 0), 'Every interior floor collects falling ash');
  assert.equal(state.flakes.length, 80);
  const stacks = state.surfaces.flatMap(s => s.stack);
  assert.equal(new Set(stacks).size, stacks.length);
  assert(stacks.every(f => f.mode === 'settled' && f.surface.stack.includes(f)));
  // A second supply cycle reaches the interior after all initial ash has settled.
  const fresh = sim.spawnFlake(); state.flakes.push(fresh);
  const entries = state.interiorEntries; sim.recycle(fresh);
  assert(state.interiorEntries > entries);
  // Changed-digit material must still return from above, without shortcutting.
  fresh.passThrough = true; sim.recycle(fresh);
  assert.equal(fresh.y, -sim.settings.margin);
  assert.equal(fresh.passThrough, false);
  sim.setTime(new Date(2026, 9, 26, 5, 31));
  assert(state.interiorSources.every(s => state.surfaces.includes(s.floor)), 'Clock changes rebuild sources against current surfaces');
  // Stop feeding gaps that no longer have enough free air above the pile.
  for (const source of state.interiorSources) source.floor.depth = source.floor.y - source.roof;
  sim.recycle(fresh);
  assert.equal(fresh.y, -sim.settings.margin);
  console.log(`PASS: ${shape}: renewed inner supply, ${floors.length} interior floor(s), conservation, released ash and full-gap fallback.`);
}
for (const shape of ['empty', 'flat']) {
  const sim = createSimulation({ shape, overrides: { particles: 0, interiorSupply: 1 } });
  assert.equal(sim.state.interiorSources.length, 0);
  const f = sim.spawnFlake(); sim.recycle(f);
  assert.equal(f.y, -sim.settings.margin);
}
const disabled = createSimulation({ shape: 'hollow', overrides: { particles: 0, interiorSupply: 0 } });
const f = disabled.spawnFlake(); disabled.recycle(f);
assert.equal(f.y, -disabled.settings.margin);
console.log('PASS: empty/solid shapes retain exterior entry; interior supply can be disabled.');
