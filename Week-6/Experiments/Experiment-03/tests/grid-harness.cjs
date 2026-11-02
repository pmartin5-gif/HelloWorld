// Deterministic execution of production code with synthetic numeral rasters.
// Canvas calls are stubbed: these tests do not measure browser drawing.
const fs = require('node:fs');
const path = require('node:path');
function createSimulation({ width = 800, height = 600, seed = 816, shape = 'flat', overrides = {}, reduced = false } = {}) {
  const bounds = { width, height };
  let date = new Date(2026, 9, 26, 5, 30), scheduled;
  const attributes = {}, listeners = {};
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const drawing = new Proxy({}, { get: (obj, key) => obj[key] ?? (() => {}), set: (obj, key, value) => { obj[key] = value; return true; } });
  const canvas = { width: 0, getContext: () => drawing, getBoundingClientRect: () => bounds,
    setAttribute: (k, v) => { attributes[k] = v; } };
  const document = {
    getElementById: () => canvas, addEventListener: (k, v) => { listeners[k] = v; },
    createElement: () => {
      const image = { width: 0, height: 0 };
      image.getContext = () => ({
        measureText: text => ({ width: text.length * 30, actualBoundingBoxAscent: 50, actualBoundingBoxDescent: 1 }),
        fillText() {}, getImageData: () => {
          const data = new Uint8ClampedArray(image.width * image.height * 4);
          for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
            const nx = x / image.width, ny = y / image.height;
            const top = shape === 'curve' ? .32 + .28 * ((nx - .5) / .25) ** 2 : shape === 'double-hollow' ? .3 : .4;
            const solid = shape !== 'empty' && nx >= .25 && nx < .75 && ny >= top && ny < .8
              && (shape !== 'hollow' || !(nx > .35 && nx < .65 && ny > .5 && ny < .65))
              && (shape !== 'double-hollow' || !(nx > .35 && nx < .65 && ((ny > .36 && ny < .46) || (ny > .56 && ny < .66))));
            if (solid) data[(y * image.width + x) * 4 + 3] = 255;
          }
          return { data };
        }
      });
      return image;
    }
  };
  let source = fs.readFileSync(path.join(__dirname, '..', 'falling-ash.js'), 'utf8');
  for (const [key, value] of Object.entries(overrides)) source = source.replace(new RegExp(`(${key}: )[-0-9.]+`), `$1${value}`);
  source = source.replace(/\}\)\(\);\s*$/, 'return { state, settings, step, frame, render, resize, updateClock, spawnFlake, recycle, release, put, sandStep, erodeSand, windAt, cellAt, free }; })();');
  const MockDate = class { getHours() { return date.getHours(); } getMinutes() { return date.getMinutes(); } };
  const sim = new Function('document', 'devicePixelRatio', 'matchMedia', 'ResizeObserver', 'requestAnimationFrame', 'Math', 'Date',
    'return ' + source.slice(source.indexOf('(() =>')))(document, 1, () => ({ matches: reduced, addEventListener(k,v) { listeners[k] = v; } }),
    class { observe() {} }, cb => { scheduled = cb; }, math, MockDate);
  sim.add = (x, y) => { const f = sim.spawnFlake(); if (x !== undefined) f.x = f.previousX = x; if (y !== undefined) f.y = f.previousY = y;
    sim.state.flakes.push(f); return f; };
  sim.tick = dt => sim.step(dt);
  sim.setTime = d => { date = d; sim.updateClock(); };
  sim.setSize = (w,h) => { bounds.width = w; bounds.height = h; sim.resize(); };
  sim.attributes = attributes; sim.listeners = listeners;
  return sim;
}
module.exports = { createSimulation };
