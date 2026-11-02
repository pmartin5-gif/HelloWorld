const assert = require('node:assert/strict');
const { createSimulation } = require('./piling-harness.cjs');
const round = Number(process.argv[2] || 0);
if (!round || round === 1) {
  let landings = 0, maxLandingJump = 0;
  const sim = createSimulation({ overrides: { particles: 0, windStrength: 0 }, observe(type, e) {
    if (type === 'deposit' && e.mode === 'falling') { landings++; maxLandingJump = Math.max(maxLandingJump, Math.abs(e.y - e.targetY)); }
  } });
  const center = sim.state.surfaces[Math.floor(sim.state.surfaces.length / 2)];
  for (let i = 0; i < 2400; i++) {
    if (i % 15 === 0) {
      const f = sim.spawnFlake();
      f.x = center.x + Math.sin(i * .79) * 24;
      f.y = center.y - 65; f.vx = 0;
      sim.state.flakes.push(f);
    }
    sim.tick(1 / 60);
  }
  assert.equal(sim.state.shedCount, 0, 'A gentle, shallow supply must accumulate without premature sloughing');
  assert(landings > 100);
  assert(maxLandingJump < 5, 'Gentle landings must not snap upward');
  const maxDepth = Math.max(...sim.state.surfaces.map(s => s.depth));
  console.log(`ROUND 1 gentle rain: ${landings} landings, ${maxDepth.toFixed(2)}px maximum pile, ${maxLandingJump.toFixed(2)}px maximum landing adjustment, no premature sloughing.`);

  // A flake drifting into a pile's side must not be teleported to its crest.
  const side = createSimulation({ overrides: { particles: 0, windStrength: 0 } });
  const ledge = side.state.surfaces[20];
  for (let i = 0; i < 26; i++) side.add(ledge);
  const f = side.spawnFlake();
  Object.assign(f, { x: ledge.x - 2.1, y: ledge.y - 12, vx: 30, vy: 3 });
  side.state.flakes.push(f);
  const before = f.y;
  side.tick(1 / 60);
  const jump = Math.abs(f.y - before);
  console.log(`ROUND 1 side contact: ${jump.toFixed(2)}px displacement.`);
  assert(jump < 3, 'Side contact must deflect ash without snapping it to the top of a high pile');
}
if (!round || round === 2) {
  const sim = createSimulation({ overrides: { particles: 0, windStrength: 0 } });
  const edge = sim.state.surfaces[0];
  const base = sim.add(edge);
  let firstReleaseHeight = 0;
  while (!firstReleaseHeight) {
    for (const flake of edge.stack) flake.x = edge.x - 1;
    const height = edge.depth;
    const count = sim.shed(edge);
    if (count) {
      firstReleaseHeight = height;
      assert(count < sim.state.flakes.length / 4, 'Only a thin upper layer should fail');
    } else {
      assert(height < sim.settings.pileDepth, 'An excessive exposed edge should actually release');
      sim.add(edge);
    }
  }
  assert.equal(base.mode, 'settled');
  const loose = sim.state.flakes.filter(f => f.mode === 'sliding');
  let maxStep = 0;
  for (let i = 0; i < 180 && loose.some(f => f.mode === 'sliding'); i++) {
    for (const f of loose) if (f.mode === 'sliding') {
      const x = f.x, y = f.y;
      sim.slide(f, 1 / 60);
      maxStep = Math.max(maxStep, Math.hypot(f.x - x, f.y - y));
    }
  }
  assert(loose.every(f => f.mode === 'falling'), 'An excessive edge must clear, not repeatedly stop and redeposit');
  assert(maxStep < 3, 'The release should move continuously');
  console.log(`ROUND 2 edge failure: first release at ${firstReleaseHeight.toFixed(2)}px; base preserved; ${maxStep.toFixed(2)}px maximum slide step.`);

  // An avalanche reaching a higher adjacent mound must stop at its toe, not
  // snap onto the crest of that neighboring mound.
  const bank = createSimulation({ overrides: { particles: 0, windStrength: 0 } });
  const low = bank.state.surfaces[40], high = bank.state.surfaces[41];
  bank.add(low);
  for (let i = 0; i < 30; i++) bank.add(high);
  const grain = bank.startSlide(low, 1);
  grain.x = low.x + 1.95;
  const before = { x: grain.x, y: grain.y };
  bank.slide(grain, 1 / 60);
  const stopJump = Math.hypot(grain.x - before.x, grain.y - before.y);
  console.log(`ROUND 2 uphill runout: ${stopJump.toFixed(2)}px stopping adjustment.`);
  assert(stopJump < 4, 'A sliding grain must not jump up onto an adjacent high pile');
}
if (!round || round === 3) {
  // When an exposed edge is already excessive, outward failure takes priority
  // over shuffling its top grains back toward a lower neighboring column.
  const lip = createSimulation({ overrides: { particles: 0, windStrength: 0 } });
  const edge = lip.state.surfaces[0];
  for (let i = 0; i < 34; i++) lip.add(edge);
  lip.tick(1 / 60);
  console.log(`ROUND 3 overloaded lip: ${lip.state.shedCount} outward failures.`);
  assert(lip.state.shedCount > 0, 'An excessive exposed edge must shed outward even if its inward neighbor is lower');

  for (const [shape, wind] of [['flat', 0], ['curve', 0], ['hollow', 1.7]]) {
    for (const seed of [42, 816]) {
      let maxLandingJump = 0, windReleases = 0;
      const sim = createSimulation({ shape, seed, overrides: { particles: 8000, windStrength: wind }, observe(type, e) {
        if (type === 'deposit' && e.mode === 'falling') maxLandingJump = Math.max(maxLandingJump, Math.abs(e.y - e.targetY));
        if (type === 'windRelease') windReleases++;
      } });
      let maximumDepth = 0, largestSettled = 0;
      const history = [];
      for (let i = 0; i < 3600; i++) {
        sim.tick(1 / 30);
        if (i % 30 === 0) {
          const stacks = sim.state.surfaces.flatMap(s => s.stack);
          largestSettled = Math.max(largestSettled, stacks.length);
          maximumDepth = Math.max(maximumDepth, ...sim.state.surfaces.map(s => s.depth));
          assert.equal(new Set(stacks).size, stacks.length, 'No grain belongs to two piles');
          assert(stacks.every(f => f.mode === 'settled'), 'A released grain cannot remain in its former pile');
          for (const s of sim.state.surfaces) {
            assert(Math.abs(s.depth - s.stack.reduce((sum, f) => sum + f.thickness, 0)) < 1e-7, 'Pile depth must track its actual remaining mass');
          }
          assert(sim.state.flakes.every(f => Number.isFinite(f.x + f.y + f.vx + f.vy)));
        }
        if (i % 900 === 899) history.push({ seconds: (i + 1) / 30, settled: sim.state.flakes.filter(f => f.mode === 'settled').length, sheds: sim.state.shedCount });
      }
      assert.equal(sim.state.flakes.length, 8000);
      assert(largestSettled > 500, 'The scene must retain enough ash to visibly accumulate');
      assert(maxLandingJump < 2.5, 'Long runs must not reintroduce upward landing snaps');
      if (wind === 0) {
        assert(sim.state.shedCount > 2, 'Calm repeated buildup must produce repeated outward failures');
        assert(history.at(-1).sheds > history[1].sheds, 'Calm shedding must continue after the first minute');
      } else {
        assert(windReleases > 100, 'Broad wind must visibly strip piles instead of forcing them to reach the sloughing threshold');
      }
      assert(maximumDepth < sim.state.height * .3, 'Mounds must remain bounded instead of growing into offscreen towers');
      console.log('ROUND 3 long run: ' + JSON.stringify({ shape, seed, wind, windReleases, maximumDepth: +maximumDepth.toFixed(2), maxLandingJump: +maxLandingJump.toFixed(2), history }));
    }
  }
}
