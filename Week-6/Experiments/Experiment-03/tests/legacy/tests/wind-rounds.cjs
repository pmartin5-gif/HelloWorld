// Qualitative reference: prevailing horizontal flow + advected, correlated
// gusts/turbulence (NOAA/NWCG). Numeric limits below are scene-design targets,
// not measured atmospheric data or a calibrated CFD model.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { createSimulation } = require('./piling-harness.cjs');
const round = Number(process.argv[2] || 0);
const sourcePath = process.argv[3];
const observations = [];
function packets(width, height) {
  const sim = createSimulation({ width, height, sourcePath, overrides: { particles: 0 } });
  const events = [];
  for (let i = 0; i < 24; i++) {
    sim.state.wind = null; sim.state.windWait = 0;
    sim.advanceWind(.01);
    events.push({ ...sim.state.wind });
  }
  return { sim, events };
}
function sample(sim, event, progress = .5) {
  sim.state.wind = { ...event, age: event.duration * progress };
  const values = [];
  for (let j = 0; j < 16; j++) for (let i = 0; i < 24; i++) {
    const x = (i + .5) / 24 * sim.state.width, y = (j + .5) / 16 * sim.state.height;
    const v = sim.windAt(x, y);
    values.push({ x, y, u: v.x, v: v.y });
  }
  return values;
}
if (!round || round === 1) {
  const results = [];
  for (const [width, height] of [[1200, 700], [390, 844], [1920, 800]]) {
    const { sim, events } = packets(width, height);
    const coverage = events.map(event => sample(sim, event).filter(v => Math.hypot(v.u, v.v) >= 10).length / 384);
    coverage.sort((a, b) => a - b);
    results.push({ viewport: `${width}x${height}`, minimum: coverage[0], median: coverage[12] });
  }
  console.log('ROUND 1 coverage: ' + JSON.stringify(results));
  assert(results.every(r => r.median >= .65 && r.minimum >= .5), 'Peak gusts should visibly affect most of the screen across aspect ratios');
}
if (!round || round === 2) {
  let aligned = 0, active = 0, sumU2 = 0, sumV2 = 0, neighborCos = 0, neighborCount = 0;
  for (const [width, height] of [[1200, 700], [390, 844]]) {
    const { sim, events } = packets(width, height);
    for (const event of events) {
      const values = sample(sim, event);
      for (const v of values) {
        if (Math.hypot(v.u, v.v) < 10) continue;
        active++; if (v.u * event.travel > 0) aligned++;
        sumU2 += v.u * v.u; sumV2 += v.v * v.v;
        const next = sim.windAt(v.x + width / 80, v.y);
        const length = Math.hypot(next.x, next.y) * Math.hypot(v.u, v.v);
        if (length > 1) { neighborCos += (next.x * v.u + next.y * v.v) / length; neighborCount++; }
      }
    }
  }
  const result = { downwindFraction: aligned / active, verticalToHorizontalRMS: Math.sqrt(sumV2 / sumU2), nearbyDirectionCosine: neighborCos / neighborCount };
  console.log('ROUND 2 coherent transport: ' + JSON.stringify(result));
  assert(result.downwindFraction >= .95, 'Eddies should ride within the prevailing wind rather than dominate with closed recirculation');
  assert(result.verticalToHorizontalRMS <= .35, 'Horizontal transport should dominate vertical stirring');
  assert(result.nearbyDirectionCosine >= .98, 'Nearby flakes should experience a shared airflow');
  // Compare identical ash clouds under calm and broad wind conditions.
  const cloud = createSimulation({ sourcePath, width: 1200, height: 700, seed: 42, overrides: { particles: 0 } });
  const calm = createSimulation({ sourcePath, width: 1200, height: 700, seed: 42, overrides: { particles: 0, windStrength: 0 } });
  const starts = [];
  for (let j = 0; j < 10; j++) for (let i = 0; i < 40; i++) {
    const x = 120 + i * 20, y = 40 + j * 10;
    starts.push({ x, y });
    for (const sim of [cloud, calm]) {
      const f = sim.spawnFlake();
      Object.assign(f, { x, y, vx: 0, vy: 30, speed: 30 });
      sim.state.flakes.push(f);
    }
  }
  cloud.state.wind = { kind: 'eddy', x: 600, y: 350, rx: 900, ry: 800, strength: 130,
    travel: 1, direction: 1, tilt: -.04, age: 4, duration: 8, driftX: 0, driftY: 0, phase: .7, shear: .12 };
  for (let i = 0; i < 90; i++) { cloud.state.wind.age = 4; cloud.tick(1 / 60); calm.tick(1 / 60); }
  const extraDrift = cloud.state.flakes.map((f, i) => f.x - calm.state.flakes[i].x).sort((a, b) => a - b);
  const broadlyMoved = extraDrift.filter(x => x > 30).length / extraDrift.length;
  assert(broadlyMoved >= .85, 'Most of a broad ash cloud should be transported, rather than just a small local patch');
  console.log('ROUND 2 ash response: ' + JSON.stringify({ cloudParticles: 400, fractionWithOver30pxExtraDrift: broadlyMoved, medianExtraDrift: +extraDrift[200].toFixed(2) }));

}
if (!round || round === 3) {
  const sim = createSimulation({ sourcePath, trackMath: true, overrides: { particles: 0 } });
  sim.state.windWait = 0; sim.advanceWind(.01);
  sim.state.wind.age = sim.state.wind.duration / 2;
  const before = { ...sim.mathCalls };
  const start = performance.now();
  const out = { x: 0, y: 0 };
  let total = 0;
  for (let i = 0; i < 80000; i++) {
    sim.windAt((i * 17) % 800, (i * 13) % 600, out);
    total += out.x;
  }
  const samplesMs = performance.now() - start;
  const trigCalls = sim.mathCalls.sin - before.sin + sim.mathCalls.cos - before.cos;
  console.log('ROUND 3 field cost: ' + JSON.stringify({ samples: 80000, milliseconds: +samplesMs.toFixed(2), trigCalls, checksum: +total.toFixed(1) }));
  assert(trigCalls < 30, 'Event-wide trigonometry must be evaluated once per frame, not once per particle');
  const full = createSimulation({ sourcePath, trackMath: true, overrides: { particles: 8000 } });
  const oldExp = full.mathCalls.exp;
  full.tick(1 / 60);
  const frameExponentials = full.mathCalls.exp - oldExp;
  assert(frameExponentials <= 5, 'Drag response must be shared, not recomputed for every grain');
  console.log('ROUND 3 shared drag: ' + JSON.stringify({ particles: 8000, exponentialsPerFrame: frameExponentials }));
}
