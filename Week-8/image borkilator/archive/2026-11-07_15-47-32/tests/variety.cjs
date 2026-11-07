'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const { png, stats, changed } = require('./engine.cjs');
const legacy = require('./fixtures/v1.json');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const meanDifference = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
function thumbnail(a, w, h) {
  const result = new Float32Array(16 * 9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) result[Math.min(8, Math.floor(y / h * 9)) * 16 + Math.min(15, Math.floor(x / w * 16))] += a[y * w + x] / ((w / 16) * (h / 9));
  return result;
}
async function main() {
  const oldSource = { ...legacy.source, model: 1 }, oldSignal = { ...legacy.signal, model: 1 };
  const oldWet = await E.generate(legacy.width, legacy.height, oldSource);
  const oldDry = await E.generate(legacy.width, legacy.height, { ...oldSource, mode: 'dry' });
  const oldFirst = await E.distort(oldWet, legacy.width, legacy.height, oldSignal);
  const oldSecond = await E.distort(oldFirst, legacy.width, legacy.height, oldSignal);
  for (const [key, image] of [['wet', oldWet], ['dry', oldDry], ['first', oldFirst], ['second', oldSecond]]) assert.equal(sha(image), legacy.hashes[key], `version-1 ${key} must preserve exact pixels`);
  console.log('PASS: version-1 source materials and two successive distortion passes retain their exact pixel digests.');
  const width = 320, height = 180, source = E.sourceSettings({ seed: 2026, texture: .4 });
  const signatures = [];
  for (const structure of Object.keys(E.structures)) {
    const s = { ...source, structure }, image = await E.generate(width, height, s);
    assert.deepEqual(image, await E.generate(width, height, s), `${structure} must reproduce`);
    const signature = thumbnail(image, width, height); signatures.push({ structure, signature });
    assert(stats(image, width, height).tones > 80, `${structure} must have material variation`);
    assert(stats(image, width, height).asymmetry > 2, `${structure} must be asymmetric`);
    console.log(structure, 'mean', stats(image, width, height).mean.toFixed(1));
  }
  for (let i = 0; i < signatures.length; i++) {
    const distinct = signatures.filter((other, j) => i !== j && meanDifference(signatures[i].signature, other.signature) > 8).length;
    assert(distinct >= 6, `${signatures[i].structure} must differ in broad composition from most other structures, not only grain`);
  }
  const profiles = new Set(Array.from({ length: 100 }, (_, seed) => E.sourceProfile({ seed }).primary));
  assert.equal(profiles.size, Object.keys(E.structures).length, 'exploration seeds must reach every structure');
  const endpoints = [];
  for (const key of ['coverage', 'scale', 'bleed', 'density', 'texture']) {
    const base = { ...source, structure: 'currents' };
    const low = await E.generate(width, height, { ...base, [key]: 0 }), high = await E.generate(width, height, { ...base, [key]: 1 });
    const difference = meanDifference(low, high);
    endpoints.push([low, high]);
    assert(difference > (key === 'texture' ? 6 : 15), `${key} endpoints must differ substantially, got ${difference}`);
    if (key === 'coverage' || key === 'density') assert(stats(low, width, height).mean - stats(high, width, height).mean > 40, `${key} must reach from sparse/faint to dense`);
    console.log(`${key} endpoint difference`, difference.toFixed(1));
  }
  const gradient = new Uint8ClampedArray(width * height);
  for (let i = 0; i < gradient.length; i++) gradient[i] = (Math.floor(i / width) * 7 + i * 3) % 256;
  const zero = { pull: 0, shift: 0, slip: 0, sort: 0, weave: 0, crush: 0, grain: 0, mix: .75, scale: .35, seed: 7183 };
  for (const key of ['pull', 'shift', 'slip', 'sort', 'weave', 'crush', 'grain']) {
    const maximum = await E.distort(gradient, width, height, { ...zero, [key]: 1 });
    assert(meanDifference(gradient, maximum) > 15, `${key} maximum should be a substantial interruption`);
  }
  const small = await E.distort(gradient, width, height, { ...zero, weave: 1, scale: 0 });
  const large = await E.distort(gradient, width, height, { ...zero, weave: 1, scale: 1 });
  assert(meanDifference(small, large) > 40, 'fragment scale needs a genuinely large span');
  const full = await E.distort(gradient, width, height, { ...zero, shift: 1, mix: .75 });
  const driven = await E.distort(gradient, width, height, { ...zero, shift: 1, mix: 1 });
  assert(meanDifference(full, driven) > 20, 'maximum mix must reach overdrive');
  console.log('PASS: distinct structures, exploration coverage, source endpoint ranges, maximum distortion, fragment scale, and feedback overdrive.');
  if (process.argv.includes('--samples')) {
    const out = path.resolve(__dirname, '../samples/iteration-02'); fs.mkdirSync(out, { recursive: true });
    const extremes = new Uint8ClampedArray(width * 2 * height * endpoints.length);
    for (let row = 0; row < endpoints.length; row++) for (let side = 0; side < 2; side++) for (let y = 0; y < height; y++) extremes.set(endpoints[row][side].subarray(y * width, (y + 1) * width), (row * height + y) * width * 2 + side * width);
    fs.writeFileSync(path.join(out, 'source-extremes.png'), png(extremes, width * 2, height * endpoints.length));
    const w = 640, h = 360;
    for (const mode of ['wet', 'dry']) {
      const atlas = new Uint8ClampedArray(w * 3 * h * 3); atlas.fill(252);
      let index = 0;
      for (const structure of Object.keys(E.structures)) {
        const image = await E.generate(w, h, { ...source, mode, structure });
        fs.writeFileSync(path.join(out, `${mode}-${structure}.png`), png(image, w, h));
        for (let y = 0; y < h; y++) atlas.set(image.subarray(y * w, (y + 1) * w), ((Math.floor(index / 3) * h + y) * w * 3) + index % 3 * w);
        index++;
      }
      fs.writeFileSync(path.join(out, `${mode}-variety.png`), png(atlas, w * 3, h * 3));
    }
    fs.writeFileSync(path.join(out, 'README.md'), '# Iteration 02 samples\n\nThe two variety sheets show the same seed and controls with different structures, read left to right, top to bottom: Pools & blooms, Archipelago, Currents, Filaments, Sediment, Ribbons, Membranes, Impressions, Spatter. Wet wash and dry transfer remain independently selectable materials. Each tile is 640 × 360; the separate 4K studies exercise the full-resolution path.\n\nThe source-extremes sheet compares 0 (left) with 100 (right), top to bottom: Coverage, Form scale, Bleed, Ink load, Paper & pigment. Other controls and the seed are held constant.\n');
    console.log('Saved wet/dry variety sheets and individual structure previews:', out);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
