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
      measureText: text => ({ width: text.length * 35, actualBoundingBoxAscent: 50, actualBoundingBoxDescent: 1 }),
      fillText() {},
      getImageData: () => {
        const data = new Uint8ClampedArray(image.width * image.height * 4);
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          if (raster !== 'empty' && x >= image.width * .25 && x < image.width * .75 && y >= image.height * .25 && y < image.height * .75
            && (raster !== 'hollow' || !(x > image.width * .35 && x < image.width * .65 && y > image.height * .35 && y < image.height * .6)))
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
let raster = 'block';
let hour = 17, minute = 30;
class MockDate { getHours() { return hour; } getMinutes() { return minute; } }
let source = fs.readFileSync(path.join(__dirname, '..', 'falling-ash.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'return { state, settings, step, resize, updateClock, clockText, readMask, recycle, deposit, shed, buildSurfaces, advanceWind, windAt, relaxPiles, neighbor, startSlide, slide, erodePiles }; })();');
function loadSimulation(overrides = {}) {

let configuredSource = source;
for (const [key, value] of Object.entries(overrides)) {
  configuredSource = configuredSource.replace(new RegExp(`(${key}: )[-0-9.]+`), `$1${value}`);
}
return new Function('document', 'devicePixelRatio', 'matchMedia', 'ResizeObserver', 'requestAnimationFrame', 'Math', 'Date',
  'return ' + configuredSource.slice(configuredSource.indexOf('(() =>')))(document, 1, () => ({ matches: false }),
  class { observe() {} }, callback => { scheduled = callback; }, math, MockDate);
}
// Keep the main buildup test calm; dedicated wind tests follow below.
const api = loadSimulation({ windStrength: 0 });
const { state, settings, step, resize, updateClock, clockText, deposit, shed } = api;
assert.equal(state.flakes.length, 8000);
assert.equal(clockText(), '5:30');
assert(attributes['aria-label'].includes('5:30'));
assert(state.surfaces.length > 100);
const surface = state.surfaces.find(s => s.x > 500);
const probe = state.flakes[0];
Object.assign(probe, { x: surface.x, y: surface.y - probe.size - .5, vy: 40, vx: 0, mode: 'falling' });
step(1 / 30);
assert.equal(probe.mode, 'settled', 'A downward crossing must land on the top');
assert.equal(probe.vy, 0);
const rest = [probe.x, probe.y];
step(1 / 30);
assert.equal(probe.x, rest[0], 'Packing does not cause sideways drift after landing');
assert(Math.abs(probe.y - rest[1]) < probe.size, 'A changing neighboring pile adjusts a settled layer continuously');
assert(probe.y + probe.size <= surface.y);
console.log('PASS: top collision deposits ash above the solid and stops it.');

// A tall middle column spreads into a mound; it must not shed from its middle.
const mound = loadSimulation({ particles: 0, windStrength: 0 });
// This fixture is one connected shelf, not four unrelated synthetic digits.
for (const glyph of mound.state.mask.glyphs) glyph.slot = 0;
mound.buildSurfaces();
function addGrain(sim, surface) {
  const f = { ...probe, x: surface.x, size: 1.5, mode: 'falling', offsetX: 0, offsetY: 0 };
  sim.state.flakes.push(f);
  sim.deposit(f, surface);
  return f;
}
const center = mound.state.surfaces.find(s => s.x >= 650 && s.left && s.right);
for (let i = 0; i < 100; i++) addGrain(mound, center);
assert.equal(mound.shed(center), 0, 'A tall central column cannot eject a patch toward a distant lip');
for (let i = 0; i < 1800; i++) {
  mound.state.elapsed += 1 / 30;
  mound.step(1 / 30);
}
assert.equal(mound.state.shedCount, 0);
assert.equal(mound.state.flakes.filter(f => f.mode === 'settled').length, 100);
const filled = mound.state.surfaces.filter(s => s.depth > 0);
assert(filled.length > 5, 'Top grains spread sideways to form a mound');
assert(center.depth > filled[0].depth && center.depth > filled.at(-1).depth, 'Mound has tapered sides');
for (const s of filled) for (const dir of [-1, 1]) {
  const next = mound.neighbor(s, dir);
  if (next) assert(next.y - next.depth - (s.y - s.depth) <= 4 * mound.settings.reposeSlope + 1.575 + 1.5 + 1e-8);
}
console.log('PASS: a tall central deposit spreads into a stable, tapered mound without shedding from the middle.');

// A shallow exposed edge must remain; a high edge sheds only its upper layer.
const edgeSim = loadSimulation({ particles: 0, windStrength: 0 });
const edge = edgeSim.state.surfaces[0];
for (let i = 0; i < 12; i++) addGrain(edgeSim, edge);
assert.equal(edgeSim.shed(edge), 0);
assert.equal(edge.stack.length, 12);
while (edge.depth < edgeSim.settings.pileDepth + 3) addGrain(edgeSim, edge);
for (const flake of edge.stack) flake.x = edge.x - 1;
const base = edge.stack[0], top = edge.stack.at(-1), before = edge.depth;
const count = edgeSim.shed(edge);
assert(count > 0 && count < (edge.stack.length + count) / 4, 'A small surface layer sloughs off');
assert(before >= edgeSim.settings.pileDepth);
assert.equal(base.mode, 'settled', 'Supporting base stays put');
assert.equal(top.mode, 'sliding', 'Top layer begins a continuous slide');
const initialX = top.x;
for (let i = 0; i < 60 && top.mode === 'sliding'; i++) edgeSim.slide(top, 1 / 60);
assert.equal(top.mode, 'falling');
assert(top.x < initialX);
assert.equal(top.ignoreGlyph, edge.glyph.slot, 'Detached ash clears the numeral without catching each lower ledge');
assert(edge.depth > before * .75);
console.log('PASS: shallow piles remain; an exposed edge over 42px high sheds only its top layer and retains its base.');

// A shallow downhill ramp must produce one uninterrupted moving trajectory,
// rather than a deposit/release cycle at every four-pixel column boundary.
const ramp = loadSimulation({ particles: 0, windStrength: 0 });
for (const glyph of ramp.state.mask.glyphs) glyph.slot = 0;
ramp.buildSurfaces();
const rampSurfaces = ramp.state.surfaces.slice(50, 75);
for (let i = 0; i < rampSurfaces.length; i++) {
  for (let j = 0; j < 30 - i; j++) addGrain(ramp, rampSurfaces[i]);
}
const slider = ramp.startSlide(rampSurfaces[0], 1);
slider.vx = 12; // Test an already moving grain independently of release-speed tuning.
const origin = slider.x;
const visited = new Set();
for (let i = 0; i < 120; i++) {
  const x = slider.x, y = slider.y;
  ramp.slide(slider, 1 / 60);
  assert.equal(slider.mode, 'sliding', 'Momentum continues through grid boundaries');
  assert(slider.x > x, 'Sliding never pauses at a column boundary');
  assert(slider.x - x < 2, 'No horizontal position snaps');
  assert(Math.abs(slider.y - y) < 2, 'No vertical ladder jumps');
  visited.add(slider.surface.col);
}
assert(slider.x - origin > 25);
assert(visited.size > 5);
console.log('PASS: one continuous downhill slide crosses multiple columns with no pauses, redeposits, or position jumps.');

const start = performance.now();
let maxSettled = 0;
const initialSheds = state.shedCount;
for (let i = 0; i < 1800; i++) {
  state.elapsed += 1 / 30; step(1 / 30);
  if (i % 30 === 0) {
    maxSettled = Math.max(maxSettled, state.flakes.filter(f => f.mode === 'settled').length);
    for (const f of state.flakes) {
      assert(Number.isFinite(f.x + f.y + f.vx + f.vy));
      assert(f.x >= -settings.margin && f.x <= state.width + settings.margin);
      assert(f.y <= state.height + settings.margin);
      if (f.mode === 'settled') {
        assert.equal(f.vy, 0);
        assert(f.y + f.size <= f.surface.y + 1e-8);
      } else if (f.mode === 'falling') {
        const col = state.columns[Math.floor(f.x / settings.surfaceCell)] || [];
        assert(!col.some(s => s.glyph.slot !== f.ignoreGlyph && f.y > s.y + .01 && f.y < s.bottom - .01), 'Airborne ash must not pass through a solid: ' + JSON.stringify({ i, x: f.x, y: f.y, vx: f.vx, vy: f.vy, size: f.size, ignored: f.ignoreGlyph, col: col.map(s => ({ y:s.y, bottom:s.bottom, depth:s.depth, slot:s.glyph.slot })) }));
      }
    }
    for (const s of state.surfaces) {
      assert(Math.abs(s.depth - s.stack.reduce((sum, f) => sum + f.thickness, 0)) < 1e-7);
      assert(s.stack.every(f => f.mode === 'settled' && f.surface === s), JSON.stringify(s.stack.filter(f => f.mode !== 'settled' || f.surface !== s).map(f => ({ mode: f.mode, here: s.col, there: f.surface?.col, x:f.x, y:f.y, ignore:f.ignoreGlyph }))));
    }
  }
}
assert.equal(state.flakes.length, 8000);
assert(maxSettled > 100, 'Ash builds up naturally from the falling supply');
assert(state.shedCount > initialSheds, 'Natural buildup causes additional shedding');
console.log(`PASS: 60 seconds, ${maxSettled} deposited flakes, ${state.shedCount - initialSheds} natural slides; no solid penetration or particle loss (${((performance.now() - start) / 1800).toFixed(2)} ms/step).`);

// A changed digit clears its entire pile even where its old and new contours
// happen to coincide; unchanged digits retain theirs.
const changedAsh = state.surfaces.filter(s => s.glyph.slot === 0).flatMap(s => s.stack);
const retainedAsh = state.surfaces.filter(s => s.glyph.slot !== 0).flatMap(s => s.stack);
assert(changedAsh.length > 0 && retainedAsh.length > 0);
minute++; updateClock();
assert(changedAsh.every(f => f.mode === 'falling' && f.passThrough));
assert(retainedAsh.every(f => f.mode === 'settled' && !f.passThrough));
const stacked = state.surfaces.flatMap(s => s.stack);
assert.equal(new Set(stacked).size, stacked.length, 'A particle belongs to only one pile');
assert(state.surfaces.filter(s => s.glyph.slot === 0).every(s => s.depth === 0));
console.log('PASS: changed digit clears all its piles; unchanged digits retain theirs; no duplicate ash.');

const fallingAsh = changedAsh[0];
const clearedSurface = state.surfaces.find(s => s.glyph.slot === 0);
Object.assign(fallingAsh, { x: clearedSurface.x, y: clearedSurface.y - fallingAsh.size - .1, vx: 0, vy: 40 });
step(1 / 30);
assert.equal(fallingAsh.mode, 'falling');
assert(fallingAsh.passThrough);
assert(fallingAsh.y + fallingAsh.size > clearedSurface.y, 'Released ash crosses the new digit surface');
minute++; updateClock();
assert.equal(fallingAsh.mode, 'falling', 'Another clock update cannot redeposit pass-through ash');
assert(fallingAsh.passThrough);
api.recycle(fallingAsh);
assert.equal(fallingAsh.passThrough, false, 'Re-entry restores normal accumulation');
assert.equal(fallingAsh.y, -settings.margin);
const freshSurface = state.surfaces.find(s => s.glyph.slot === 0);
Object.assign(fallingAsh, { x: freshSurface.x, y: freshSurface.y - fallingAsh.size - .1, vx: 0, vy: 40 });
step(1 / 30);
assert.equal(fallingAsh.mode, 'settled', 'Recycled fresh ash can accumulate on the cleared digit');
console.log('PASS: released ash passes through until top re-entry, survives another minute change, and then accumulates afresh.');

// A clock change to empty space releases all deposits; no obsolete supports remain.
raster = 'empty'; minute++; updateClock();
assert.equal(state.surfaces.length, 0);
assert(state.flakes.every(f => f.mode === 'falling'));
console.log('PASS: removing clock support releases all accumulated ash.');

raster = 'hollow'; minute++; updateClock();
assert(state.columns.some(col => col.length === 2), 'Numeral holes have their own lower ledges');
const inner = state.columns.find(col => col.length === 2)[1];
Object.assign(probe, { passThrough: false, x: inner.x, y: inner.y - probe.size - .5, vy: 40, vx: 0, mode: 'falling' });
step(1 / 30);
assert.equal(probe.mode, 'settled');
assert.equal(probe.surface, inner);
console.log('PASS: ash can collect on the lower inside edge of a numeral hole.');

bounds = { width: 390, height: 844 }; resize();
for (let i = 0; i < 300; i++) { state.elapsed += 1 / 30; step(1 / 30); }
assert(state.flakes.every(f => Number.isFinite(f.x + f.y)));
assert.equal(state.width, 390);
assert.equal(state.height, 844);
scheduled(0); scheduled(16);
console.log('PASS: portrait resize and the real animation/render callback run successfully.');

// Wind has local influence, two circulation directions, and smooth endpoints.
const windSim = loadSimulation({ particles: 0 });
const windState = windSim.state;
const event = { kind: 'eddy', x: 150, y: 150, rx: 100, ry: 100,
  strength: 100, direction: 1, age: 2, duration: 4, driftX: 0, driftY: 0, tilt: 0 };
windState.wind = event;
assert(windSim.windAt(195, 150).y > 0);
assert(windSim.windAt(105, 150).y < 0);
assert(windSim.windAt(150, 195).x > 0, 'An eddy remains carried downwind');
assert(windSim.windAt(150, 195).x < windSim.windAt(150, 105).x, 'Eddies bend and shear the prevailing flow');
assert.deepEqual(windSim.windAt(300, 150), { x: 0, y: 0 });
event.direction = -1;
assert(windSim.windAt(105, 150).y > 0);
event.age = 0;
assert.deepEqual(windSim.windAt(105, 150), { x: 0, y: 0 });
event.age = event.duration;
assert(Math.hypot(...Object.values(windSim.windAt(105, 150))) < 1e-10);
windSim.advanceWind(.01);
assert.equal(windState.wind, null);
assert(windState.windWait >= 14 && windState.windWait <= 28);
windSim.advanceWind(windState.windWait - .1);
assert.equal(windState.wind, null, 'Quiet intervals contain no wind events');
const events = [];
for (let i = 0; i < 40; i++) {
  windState.windWait = 0;
  windSim.advanceWind(.01);
  events.push({ ...windState.wind });
  windSim.advanceWind(windState.wind.duration);
}
assert(events.some(e => e.kind === 'gust') && events.some(e => e.kind === 'eddy'));
assert(new Set(events.map(e => e.x)).size === 40);
assert(Math.max(...events.map(e => e.strength)) - Math.min(...events.map(e => e.strength)) > 40);
assert(events.every(e => e.duration >= 6 && e.duration <= 10));
assert(events.every(e => e.strength >= 38 * .85 && e.strength <= 105 * .85));
for (const packet of events) {
  const startX = packet.x;
  const endX = packet.x + packet.driftX * packet.duration;
  if (packet.travel > 0) {
    assert(startX < 0 && endX > windState.width);
  } else {
    assert(startX > windState.width && endX < 0);
  }
  for (const fraction of [.1, .5, .9]) {
    const x = windState.width * fraction;
    const progress = (x - packet.x) / (packet.driftX * packet.duration);
    windState.wind = { ...packet, age: progress * packet.duration };
    const centerY = packet.y + packet.driftY * windState.wind.age
      + packet.meander * (Math.sin(packet.phase + progress * Math.PI * 2) - Math.sin(packet.phase));
    const flow = windSim.windAt(x, centerY + packet.ry * .3);
    assert(Math.hypot(flow.x, flow.y) > 1, 'Moving wind reaches the entry, middle, and exit regions');
  }
}
windState.wind = null;
console.log('PASS: wind packets enter offscreen, cross the full viewport, and exit beyond the opposite edge.');
console.log('PASS: localized eddies circulate both ways; wind fades, expires, waits, and varies in location, kind, and strength.');

// A sufficiently strong updraft can lift ash; ordinary eddies mainly bend its fall.
const liftSim = loadSimulation({ particles: 1 });
const lifted = liftSim.state.flakes[0];
lifted.speed = 30; lifted.vy = 30;
liftSim.state.wind = { ...event, kind: 'gust', age: 2, direction: 1, strength: 140, tilt: -1, duration: 20 };
for (let i = 0; i < 60; i++) {
  Object.assign(lifted, { x: 105, y: 150, mode: 'falling' });
  liftSim.state.wind.age = 10;
  liftSim.step(1 / 30);
}
assert(lifted.vy < 0, 'A sufficiently strong updraft can temporarily reverse the fall');
liftSim.state.wind = null;
liftSim.state.windWait = Infinity;
const ceiling = liftSim.state.surfaces[0];
Object.assign(lifted, { x: ceiling.x, y: ceiling.bottom + lifted.size + .2, vy: -70, vx: 0, mode: 'falling' });
liftSim.step(1 / 30);
assert(lifted.y - lifted.size >= ceiling.bottom - 1e-8);
assert(lifted.vy >= 0, 'An upward collision deflects ash back down');
const disabled = loadSimulation({ particles: 0, windStrength: 0 });
disabled.state.windWait = 0;
disabled.advanceWind(100);
assert.equal(disabled.state.wind, null);
console.log('PASS: strong updrafts lift ash; numeral undersides block updrafts; wind can be disabled.');

// Strip exposed pile layers locally, with more erosion under stronger wind.
function erosionTrial(kind, strength) {
  const sim = loadSimulation({ particles: 0 });
  const source = sim.state.surfaces[0];
  const distant = sim.state.surfaces.at(-1);
  for (let i = 0; i < 30; i++) { addGrain(sim, source); addGrain(sim, distant); }
  const top = source.stack.at(-1), base = source.stack[0];
  sim.state.wind = { kind, x: top.x + (kind === 'eddy' ? 36 : 0), y: top.y,
    rx: 80, ry: 80, strength, direction: 1, age: 2, duration: 4,
    driftX: 0, driftY: 0, tilt: 0 };
  const position = [top.x, top.y];
  sim.erodePiles(.5);
  assert.equal(distant.stack.length, 30, 'Piles outside the wind footprint are unchanged');
  assert.equal(base.mode, 'settled', 'The underlying layer stays in place');
  const removed = 30 - source.stack.length;
  assert(Math.abs(source.depth - source.stack.reduce((sum, f) => sum + f.thickness, 0)) < 1e-8);
  if (removed) {
    assert.equal(top.mode, 'falling');
    assert(top.vy < 0, 'Stripped ash is lofted into the airflow');
    assert.equal(top.ignoreGlyph, source.glyph.slot);
    assert.deepEqual([top.x, top.y], position, 'Wind releases ash without teleporting it');
  }
  return { sim, source, removed };
}
assert.equal(erosionTrial('gust', 15).removed, 0, 'A weak breeze cannot detach settled ash');
const mild = erosionTrial('gust', 55);
const strong = erosionTrial('gust', 145);
assert(mild.removed > 0 && strong.removed > mild.removed);
assert(erosionTrial('eddy', 145).removed > 0, 'An eddy strips exposed ash too');
const sliderInWind = strong.sim.startSlide(strong.source, 1);
strong.sim.step(1 / 60);
assert.equal(sliderInWind.mode, 'falling', 'Wind also lifts sliding ash');
assert.equal(sliderInWind.ignoreGlyph, strong.source.glyph.slot);
console.log('PASS: gusts and eddies erode only exposed local ash; stronger wind strips more, bases stay, and sliding ash lifts off.');
