// Runs the production simulation with deterministic raster geometry and RNG.
// No browser painting is emulated; observations capture real physics calls.
const fs = require('node:fs');
const path = require('node:path');
function createSimulation({ width = 800, height = 600, seed = 816, shape = 'flat', overrides = {}, observe = () => {}, trackMath = false, sourcePath = path.join(__dirname, '..', 'falling-ash.js') } = {}) {
  const math = Object.create(Math);
  const mathCalls = { sin: 0, cos: 0, exp: 0 };
  if (trackMath) for (const key of Object.keys(mathCalls)) math[key] = (...args) => { mathCalls[key]++; return Math[key](...args); };
  math.random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  let date = new Date(2026, 9, 26, 5, 30);
  const drawing = new Proxy({}, { get: (obj, key) => obj[key] ?? (() => {}), set: (obj, key, value) => { obj[key] = value; return true; } });
  const canvas = { width: 0, getContext: () => drawing, getBoundingClientRect: () => ({ width, height }), setAttribute() {} };
  const document = {
    getElementById: () => canvas, addEventListener() {},
    createElement: () => {
      const image = { width: 0, height: 0 };
      image.getContext = () => ({
        measureText: text => ({ width: text.length * 30, actualBoundingBoxAscent: 50, actualBoundingBoxDescent: 1 }),
        fillText() {}, getImageData: () => {
          const data = new Uint8ClampedArray(image.width * image.height * 4);
          for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
            const nx = x / image.width, ny = y / image.height;
            const top = shape === 'curve' ? .32 + .28 * ((nx - .5) / .25) ** 2 : .4;
            const solid = shape !== 'empty' && nx >= .25 && nx < .75 && ny >= top && ny < .8
              && (shape !== 'hollow' || !(nx > .35 && nx < .65 && ny > .5 && ny < .65));
            if (solid) data[(y * image.width + x) * 4 + 3] = 255;
          }
          return { data };
        }
      });
      return image;
    }
  };
  let source = fs.readFileSync(sourcePath, 'utf8');
  for (const [key, value] of Object.entries(overrides)) source = source.replace(new RegExp(`(${key}: )[-0-9.]+`), `$1${value}`);
  source = source.replace('function deposit(flake, surface) {', `function deposit(flake, surface) {
    const before = { mode: flake.mode, x: flake.x, y: flake.y };
    placeGrain(flake, surface);
    observe('deposit', { ...before, targetX: flake.x, targetY: flake.y });
  }
  function placeGrain(flake, surface) {`);
  source = source.replace('function blowLoose(flake, field, glyph) {', `function blowLoose(flake, field, glyph) { observe('windRelease', { x: flake.x, y: flake.y });`);
  source = source.replace('    state.shedCount++;', `    observe('shed', { depth: surface.depth, count, time: state.elapsed });\n    state.shedCount++;`);
  source = source.replace(/\}\)\(\);\s*$/, 'return { state, settings, step, deposit, startSlide, slide, relaxPiles, shed, spawnFlake, recycle, updateClock, windAt, advanceWind, erodePiles, neighbor, pileHeightAt: typeof pileHeightAt === "function" ? pileHeightAt : undefined, updatePileGeometry: typeof updatePileGeometry === "function" ? updatePileGeometry : undefined }; })();');
  const MockDate = class { getHours() { return date.getHours(); } getMinutes() { return date.getMinutes(); } };
  const sim = new Function('document', 'devicePixelRatio', 'matchMedia', 'ResizeObserver', 'requestAnimationFrame', 'Math', 'Date', 'observe',
    'return ' + source.slice(source.indexOf('(() =>')))(document, 1, () => ({ matches: false }), class { observe() {} }, () => {}, math, MockDate, observe);
  sim.mathCalls = mathCalls;
  sim.tick = dt => { sim.state.elapsed += dt; sim.step(dt); };
  sim.add = (surface, size = 1.5) => { const f = sim.spawnFlake(); f.size = size; f.x = surface.x; sim.state.flakes.push(f); sim.deposit(f, surface); return f; };
  sim.setTime = newDate => { date = newDate; sim.updateClock(); };
  return sim;
}
module.exports = { createSimulation };
