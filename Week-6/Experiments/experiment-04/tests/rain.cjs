// Exercise the real rain simulation with a deterministic synthetic numeral mask.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
let bounds = { width: 1200, height: 700 };
let scheduled;
const attributes = {};
let raster = 'block';
let hour = 17, minute = 30;
class MockDate { getHours() { return hour; } getMinutes() { return minute; } }
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

let source = fs.readFileSync(path.join(__dirname, '..', 'gentle-rain.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'return { state, settings, step, resize, updateClock, readMask, impact, render }; })();');
const api = new Function('document', 'devicePixelRatio', 'matchMedia', 'ResizeObserver', 'requestAnimationFrame', 'Math', 'Date',
  'return ' + source.slice(source.indexOf('(() =>')))(document, 1, () => ({ matches: false }),
  class { observe() {} }, callback => { scheduled = callback; }, math, MockDate);
const { state, step, readMask, impact, settings, resize, updateClock } = api;
assert.equal(state.drops.length, 1050);
assert(state.edges.length > 100);
assert(state.drops.every(d => readMask(state.mask, d.x, d.y) < .35));
const probe = state.drops[0];
Object.assign(probe, { x: 500, y: 170, speed: 390 });
const before = state.hits;
step(.05);
assert(state.hits > before, 'Fast drops cannot tunnel through the top surface');
assert(probe.y < 0, 'An impact recycles the drop into incoming rain');
assert(state.splashes.length > 0);
assert(state.splashes.every(s => readMask(state.mask, s.x, s.y) < .35));
console.log('PASS: swept rain collision, recycling, exterior splashes.');
// Isolate splash lifetime from the continuous incoming supply.
const drops = state.drops; state.drops = [];
state.splashes = [];
impact(500, 174);
assert.equal(state.splashes.length, 5, 'Each impact emits a fuller fan of five beads');
for (let i = 0; i < 60; i++) step(1 / 60);
assert.equal(state.splashes.length, 0);

state.drops = drops;
const begin = performance.now();
for (let i = 0; i < 3600; i++) {
  step(1 / 60);
  if (i % 60 === 0) {
    assert.equal(state.drops.length, 1050);
    assert(state.splashes.length <= settings.maxSplashes);
    assert(state.drops.every(d => Number.isFinite(d.x + d.y) && readMask(state.mask, d.x, d.y) < .35));
  }
}
console.log(`PASS: 60 seconds, ${state.hits} rain impacts, finite positions, no solid penetration; ${((performance.now()-begin)/3600).toFixed(2)} ms/step.`);
// The clock still updates its invisible collision geometry and accessible label.
minute++; updateClock();
assert(state.drops.every(d => readMask(state.mask, d.x, d.y) < .35));
assert(attributes['aria-label'].includes('5:31'));
console.log('PASS: clock updates preserve exterior drops and update the accessible time.');
raster = 'hollow'; minute++; updateClock();
// Supply rain above a hollow digit; its interior must continue receiving drops
// after the initially seeded rain has gone. No manual interior impact is used.
state.drops = []; state.splashes = []; state.drips = [];
assert(state.cavities.size > 0);
const exteriorHits = state.hits;
for (let i = 0; i < 20; i++) impact(500, 174);
assert(state.drips.length > 0, 'Exterior rain feeds runoff into the numeral opening');
let interiorSplashed = false;
for (let i = 0; i < 180; i++) {
  step(1 / 60);
  interiorSplashed ||= state.splashes.some(s => s.x > 490 && s.x < 510 && s.y > 405 && s.y < 425);
  assert(state.drips.every(d => readMask(state.mask, d.x, d.y) < .35), 'Drips stay in the opening');
}
assert(state.hits > exteriorHits + 20, 'Runoff actually collides with an interior surface');
assert(interiorSplashed, 'Interior landings produce visible splashes');
assert.equal(state.drips.length, 0, 'Runoff ends after its rain supply stops');
raster = 'block'; minute++; updateClock();
assert.equal(state.cavities.size, 0, 'Solid digits do not generate interior runoff');
assert.equal(state.drips.length, 0, 'Clock changes clear obsolete runoff');
console.log('PASS: sustained interior runoff, real inner-surface collisions and splashes, and cleanup.');
bounds = { width: 390, height: 844 }; resize();
assert.equal(state.width, 390);
assert.equal(state.height, 844);
for (let i = 0; i < 300; i++) step(1 / 60);
assert(state.drops.every(d => Number.isFinite(d.x + d.y)));
scheduled(0); scheduled(16);
console.log('PASS: numeral holes, portrait resize, and real render callback.');
