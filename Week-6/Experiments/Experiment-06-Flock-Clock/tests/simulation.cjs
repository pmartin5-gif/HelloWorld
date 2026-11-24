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
// Repeatable starting birds and target assignments make regressions reproducible.
let randomState = 417;
const seededMath = Object.create(Math);
seededMath.random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
const sandbox = { document, console, Math: seededMath, Date,
  devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
  ResizeObserver: class { observe() {} }, requestAnimationFrame: callback => { requestedFrame = callback; } };
let source = fs.readFileSync(path.join(__dirname, '..', 'clock.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'globalThis.test = { state, resize, setPopulation, assignTargets, animateBirds, getClock, formationAt, defianceAt, grid, inkGroups }; })();');
vm.runInNewContext(source, sandbox);
const { state, assignTargets, animateBirds, resize, getClock, formationAt, defianceAt, setPopulation, grid, inkGroups } = sandbox.test;
assert.equal(state.birds.length, 8000);
assert.equal(state.birds.filter(b => b.defiant).length, 1600);
const originalDefiers = state.birds.filter(b => b.defiant);
setPopulation();
assert.deepEqual(state.birds.filter(b => b.defiant), originalDefiers, 'A no-op population update must preserve identities');
assignTargets('09:41');
assert.equal(state.birds.filter(b => b.target).length, 2560);
assert.equal(state.birds.filter(b => !b.target).length, 5440);
assert(state.birds.some(b => b.defiant && b.target), 'Clock birds must also be able to defy');
assert(state.birds.some(b => b.defiant && !b.target), 'Free birds must also be able to defy');
assert.deepEqual(state.birds.filter(b => b.defiant), originalDefiers, 'Time assignment must preserve identities');

// Isolate the behavioral promise: during a full departure, clock formation and
// target position cannot change this bird's steering. On rejoining, they can.
const defier = state.birds.find(b => b.defiant && b.target);
const follower = state.birds.find(b => !b.defiant && b.target);
const originalOffset = defier.defianceOffset;
defier.defianceOffset = .4;
state.elapsed = 0;
assert.equal(defianceAt(defier, 0), 1);
assert.equal(defianceAt(defier, defier.defiancePeriod * .5), 0);
assert.equal(defianceAt(follower, 0), 0);
assert.equal(defianceAt(defier, defier.defiancePeriod), 1);
const rampTime = defier.defiancePeriod * .76;
assert(defianceAt(defier, rampTime) > 0 && defianceAt(defier, rampTime) < 1);
const target = defier.target;
animateBirds(0, 0);
const independentAcceleration = [defier.ax, defier.ay];
animateBirds(0, 1);
assert.deepEqual([defier.ax, defier.ay], independentAcceleration, 'Active defiance must ignore clock choreography');
defier.target = { x: defier.x + 100, y: defier.y + 100 };
animateBirds(0, 1);
assert.deepEqual([defier.ax, defier.ay], independentAcceleration, 'Active defiance must ignore numeral destination');
defier.defianceOffset = .02;
animateBirds(0, 1);
assert.equal(defier.defiance, 0);
const rejoinedAcceleration = [defier.ax, defier.ay];
defier.target = { x: defier.x - 100, y: defier.y - 100 };
animateBirds(0, 1);
assert.notDeepEqual([defier.ax, defier.ay], rejoinedAcceleration, 'Rejoined birds must respond to their numeral destination');
defier.target = target;
defier.defianceOffset = originalOffset;

// The independent speed allowance belongs only to eligible, active birds.
defier.defianceOffset = .4;
defier.vx = follower.vx = 500;
defier.vy = follower.vy = 0;
animateBirds(0, 0);
const normalLimit = 100 + state.turbulence * 40;
assert(Math.abs(Math.hypot(defier.vx, defier.vy) - normalLimit * 1.75) < 1e-8);
assert(Math.abs(Math.hypot(follower.vx, follower.vy) - normalLimit) < 1e-8);
defier.defianceOffset = originalOffset;
console.log('PASS: exactly 1,600 persistent defiers; independent steering, clock refusal, smooth rejoining, and faster flight.');
for (let i = 0; i < 90; i++) { state.elapsed = i / 30; animateBirds(1 / 30, 1); }
assert(state.birds.every(b => Number.isFinite(b.x + b.y + b.vx + b.vy)));
assert.equal(new Set(grid.items).size, 8000);
assert.equal(grid.offsets[grid.offsets.length - 1], 8000);
assert.equal(inkGroups.reduce((n, group) => n + group.length, 0), 8000);
console.log('PASS: 8,000-bird default; 2,560 clock birds and 5,440 free birds; dense formation stability.');
state.count = 1000; setPopulation();
assert.equal(state.birds.filter(b => b.defiant).length, 200);
const defiers = state.birds.filter(b => b.defiant);
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
let sawFastDefier = false;
for (let frame = 0; frame < 1800; frame++) {
  const seconds = frame / 30;
  state.elapsed = seconds;
  animateBirds(1 / 30, formationAt(seconds));
  if (frame === 285) {
    const errors = state.birds.filter(b => b.target && !b.defiant).map(b => Math.hypot(b.x - b.target.x, b.y - b.target.y)).sort((a, b) => a - b);
    heldError = errors[Math.floor(errors.length * .95)];
    assert(heldError < 12, `Formation tracking error too large: ${heldError}`);
  }
  for (const b of state.birds) {
    assert(Number.isFinite(b.x + b.y + b.vx + b.vy));
    assert(b.x >= -15 && b.x <= state.width + 15 && b.y >= -15 && b.y <= state.height + 15);
    assert(b.defiance >= 0 && b.defiance <= 1);
    const speed = Math.hypot(b.vx, b.vy);
    // The existing minimum-speed nudge can add at most one timestep of gain.
    assert(speed <= normalLimit * (1 + b.defiance * .75) * (1 + 1 / 30) + 1e-8);
    if (!b.defiant) assert.equal(b.defiance, 0);
    else if (speed > normalLimit * 1.2) sawFastDefier = true;
  }
}
assert(sawFastDefier, 'Independent bursts must occur during actual flight');
assert.deepEqual(state.birds.filter(b => b.defiant), defiers);
console.log(`PASS: 60 seconds / 1,000 birds; obedient formation 95th-percentile error ${heldError.toFixed(2)} px; bounded flight and independent bursts.`);

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
assert.deepEqual(state.birds.filter(b => b.defiant), defiers, 'Resize and minute changes must preserve identities');
for (let i = 0; i < 300; i++) { state.elapsed += 1 / 30; animateBirds(1 / 30, 1); }
for (const b of state.birds) {
  assert(Number.isFinite(b.x + b.y + b.vx + b.vy));
  assert(b.x >= -15 && b.x <= 375 && b.y >= -15 && b.y <= 415);
}
state.count = 17; setPopulation();
assert.equal(state.birds.filter(b => b.defiant).length, Math.round(17 * .2));
console.log('PASS: canvas-only animation frames; local clock; narrow-screen resizing and target bounds.');
