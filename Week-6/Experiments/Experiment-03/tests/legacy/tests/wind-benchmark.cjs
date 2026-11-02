// Native Node timing of production physics. Canvas painting is not included.
// Optional argument: source snapshot to compare against the current version.
const { performance } = require('node:perf_hooks');
const { createSimulation } = require('./piling-harness.cjs');
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: +sorted[Math.floor(sorted.length / 2)].toFixed(4), p95: +sorted[Math.floor(sorted.length * .95)].toFixed(4) };
};
function steadyWind(sim) {
  sim.state.wind = { kind: 'eddy', x: 600, y: 350, rx: 900, ry: 800,
    strength: 130, travel: 1, direction: 1, tilt: -.04, age: 4, duration: 8,
    driftX: 0, driftY: 0, meander: 0, phase: .7, shear: .12 };
}
function fieldRun(sourcePath) {
  const sim = createSimulation({ sourcePath, width: 1200, height: 700, overrides: { particles: 0 } });
  steadyWind(sim);
  const out = { x: 0, y: 0 };
  let checksum = 0;
  for (let i = 0; i < 30000; i++) { sim.windAt((i * 17) % 1200, (i * 13) % 700, out); checksum += out.x; }
  const start = performance.now();
  for (let i = 0; i < 200000; i++) { sim.windAt((i * 17) % 1200, (i * 13) % 700, out); checksum += out.x; }
  return { ms: performance.now() - start, checksum };
}
function stepRun(sourcePath) {
  const sim = createSimulation({ sourcePath, width: 1200, height: 700, shape: 'hollow', seed: 42, overrides: { particles: 8000 } });
  steadyWind(sim);
  const times = [];
  for (let i = 0; i < 660; i++) {
    sim.state.wind.age = 2 + (i % 180) / 60;
    const start = performance.now();
    sim.tick(1 / 60);
    if (i >= 180) times.push(performance.now() - start);
  }
  return times;
}
const variants = process.argv[2] ? [['beforeCache', process.argv[2]], ['optimized', undefined]] : [['optimized', undefined]];
const measurements = Object.fromEntries(variants.map(([name]) => [name, { field: [], steps: [] }]));
// Alternate order between repeats to reduce warmup and thermal ordering bias.
for (let repeat = 0; repeat < 3; repeat++) {
  for (const [name, file] of repeat % 2 ? [...variants].reverse() : variants) {
    measurements[name].field.push(fieldRun(file).ms);
    measurements[name].steps.push(...stepRun(file));
  }
}
const report = { node: process.version, platform: process.platform, architecture: process.arch,
  particles: 8000, viewport: '1200x700', fieldSamplesPerRun: 200000,
  note: 'Headless production physics in Node; excludes browser Canvas painting and display frame rate.', variants: {} };
for (const [name, m] of Object.entries(measurements)) report.variants[name] = { fieldMilliseconds: summary(m.field), simulationStepMilliseconds: summary(m.steps) };
console.log(JSON.stringify(report, null, 2));
