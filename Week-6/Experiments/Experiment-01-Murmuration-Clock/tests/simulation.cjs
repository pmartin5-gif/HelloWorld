// Headless checks of the actual simulation. Canvas drawing and text rasterization
// are stand-ins; this checks behavior, not browser appearance or font rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let bounds = { width: 1200, height: 650 };
let requestedFrame;
const elements = new Map();
const makeElement = () => ({ hidden: true, value: '', textContent: '', style: {}, dataset: {},
  listeners: {}, attrs: {}, classList: { toggle() {} },
  addEventListener(name, callback) { this.listeners[name] = callback; },
  setAttribute(name, value) { this.attrs[name] = value; },
  getBoundingClientRect() { return { ...bounds, left: 0, top: 0 }; } });
const drawing = new Proxy({}, { get(target, key) {
  if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
  return target[key] ?? (() => {});
}, set(target, key, value) { target[key] = value; return true; } });
// An occupied-cell stencil provides a reproducible mask to test target tracking.
const pixels = new Uint8ClampedArray(1000 * 320 * 4);
for (let y = 65; y < 260; y++) for (let x = 140; x < 860; x++) {
  if (x % 150 < 30 || y < 90 || y > 235 || (y > 150 && y < 175)) pixels[(y * 1000 + x) * 4 + 3] = 255;
}
const maskDrawing = { clearRect() {}, fillText() {}, getImageData: () => ({ data: pixels }) };
const document = { getElementById(id) {
  assert.equal(id, 'sky', 'The canvas must be the only UI element requested');
  if (!elements.has(id)) elements.set(id, makeElement());
  return elements.get(id);
}, createElement: () => ({ getContext: () => maskDrawing }), querySelectorAll: () => [],
  listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } };
document.getElementById('sky').getContext = () => drawing;
const sandbox = { document, console, Math, Date, 
  devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
  ResizeObserver: class { observe() {} }, requestAnimationFrame: callback => { requestedFrame = callback; } };
let source = fs.readFileSync(path.join(__dirname, '..', 'clock.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'globalThis.test = { state, resize, setPopulation, assignTargets, animateBirds, getClock, formationAt, grid, inkGroups }; })();');
vm.runInNewContext(source, sandbox);
const { state, assignTargets, animateBirds, resize, getClock, formationAt, setPopulation, grid, inkGroups } = sandbox.test;
assert.equal(state.birds.length, 8000);
assignTargets('09:41');
assert.equal(state.birds.filter(b => b.target).length, 2560);
assert.equal(state.birds.filter(b => !b.target).length, 5440);
for (let i = 0; i < 90; i++) { state.elapsed = i / 30; animateBirds(1 / 30, 1); }
assert(state.birds.every(b => Number.isFinite(b.x + b.y + b.vx + b.vy)));
assert.equal(new Set(grid.items).size, 8000);
assert.equal(grid.offsets[grid.offsets.length - 1], 8000);
assert.equal(inkGroups.reduce((n, group) => n + group.length, 0), 8000);
console.log('PASS: 8,000-bird default; 2,560 clock birds and 5,440 free birds; dense formation stability.');
state.count = 1000; setPopulation();
assignTargets('09:41');
assert.equal(state.birds.filter(b => b.target).length, 320);

// Simulate the complete physical minute with its actual blending envelope.
assert.equal(formationAt(0), 0);
assert(formationAt(4) > 0 && formationAt(4) < 1);
assert.equal(formationAt(8), 1);
assert.equal(formationAt(10.499), 1);
assert(formationAt(10.501) < 1);
assert.equal(formationAt(17.5), 0);
assert.equal(formationAt(59.999), 0);
console.log('PASS: 2.5-second hold from 08–10.5; release ends at 17.5 seconds.');
let heldError;
for (let frame = 0; frame < 1800; frame++) {
  const seconds = frame / 30;
  state.elapsed = seconds;
  animateBirds(1 / 30, formationAt(seconds));
  if (frame === 285) {
    const errors = state.birds.filter(b => b.target).map(b => Math.hypot(b.x - b.target.x, b.y - b.target.y)).sort((a, b) => a - b);
    heldError = errors[Math.floor(errors.length * .95)];
    assert(heldError < 12, `Formation tracking error too large: ${heldError}`);
  }
  for (const b of state.birds) {
    assert(Number.isFinite(b.x + b.y + b.vx + b.vy));
    assert(b.x >= -15 && b.x <= state.width + 15 && b.y >= -15 && b.y <= state.height + 15);
  }
}
console.log(`PASS: 60 seconds / 1,000 birds; formation 95th-percentile error ${heldError.toFixed(2)} px; finite positions and velocities.`);

// Exercise the actual animation callback with no controls or overlays present.
requestedFrame(24000);
requestedFrame(24016);
assert(elements.get('sky').attrs['aria-label'].includes('local time'));
const clock = getClock();
assert(clock.seconds >= 0 && clock.seconds < 60);
assert(/^(?:[1-9]|1[0-2]):[0-5]\d$/.test(clock.text));
bounds = { width: 360, height: 400 };
resize(); assignTargets('23:59');
assert.equal(state.width, 360); assert.equal(state.height, 400);
for (const point of state.targets) assert(point.x >= 0 && point.x <= 360 && point.y >= 0 && point.y <= 400);
console.log('PASS: canvas-only animation frames; local clock; narrow-screen resizing and target bounds.');
