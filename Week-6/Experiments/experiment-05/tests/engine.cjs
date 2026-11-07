'use strict';
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const E = require('../engine.js');

// A tiny PNG encoder lets this test inspect actual full-resolution output without
// requiring a browser, a display, a canvas mock, or external dependencies.
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(pixels, w, h) {
  const header = Buffer.alloc(13); header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; raw.set(pixels.subarray(y * w, (y + 1) * w), y * (w + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function changed(a, b) { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n / a.length; }
function stats(a, w, h) {
  let sum = 0, dark = 0, paper = 0, symmetry = 0; const tones = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = a[y * w + x]; sum += v; dark += v < 90; paper += v > 230; tones.add(v); symmetry += Math.abs(v - a[y * w + w - 1 - x]); }
  return { mean: sum / a.length, dark: dark / a.length, paper: paper / a.length, tones: tones.size, asymmetry: symmetry / a.length };
}
async function main() {
  const width = 320, height = 180;
  const source = E.sourceSettings({ seed: 42819 });
  const wet = await E.generate(width, height, source);
  const wetAgain = await E.generate(width, height, source);
  assert.deepEqual(wet, wetAgain, 'same source seed/settings must reproduce pixels');
  const different = await E.generate(width, height, { ...source, seed: 1234567 });
  assert(changed(wet, different) > .25, 'changing the source seed must change the composition');
  const dry = await E.generate(width, height, { ...source, mode: 'dry' });
  assert(changed(wet, dry) > .25, 'source modes must produce materially different images');
  for (const [name, image] of [['wet', wet], ['dry', dry]]) {
    const s = stats(image, width, height);
    assert(s.tones > 160, `${name} needs tonal variation`);
    assert(s.paper > .03 && s.paper < .95, `${name} needs both ink and open paper`);
    assert(s.asymmetry > 8, `${name} must not be mirrored`);
    console.log(name, s);
  }
  const untouched = wet.slice();
  const zero = Object.fromEntries(['pull','shift','slip','sort','weave','crush','grain'].map(k => [k, 0]));
  assert.deepEqual(await E.distort(wet, width, height, { ...zero, mix: 1 }), wet, 'disabled effects are an identity');
  assert.deepEqual(await E.distort(wet, width, height, { pull: 1, mix: 0 }), wet, 'zero mix is an identity');
  for (const effect of Object.keys(zero)) {
    const s = { ...zero, [effect]: .8, mix: 1, scale: .3, seed: 7183 };
    const out = await E.distort(wet, width, height, s);
    assert(changed(wet, out) > .005, `${effect} must visibly affect pixels`);
    assert.deepEqual(out, await E.distort(wet, width, height, s), `${effect} must reproduce from settings`);
    assert.deepEqual(wet, untouched, `${effect} must preserve its input for history`);
  }
  const pass = { ...zero, pull: .7, shift: .32, weave: .25, grain: .1, mix: .85, seed: 7183 };
  const first = await E.distort(wet, width, height, pass);
  const second = await E.distort(first, width, height, pass);
  assert(changed(first, second) > .02, 'reapplying the same settings must accumulate on the current result');
  const replaySource = await E.generate(width, height, JSON.parse(JSON.stringify(source)));
  const replayFirst = await E.distort(replaySource, width, height, JSON.parse(JSON.stringify(pass)));
  assert.deepEqual(await E.distort(replayFirst, width, height, pass), second, 'saved settings must replay the same cumulative result');
  const inverted = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) inverted[y * width + x] = ((x * 7 + y * 13) % 256);
  const sorted = await E.distort(inverted, width, height, { ...zero, sort: 1, mix: .75 });
  for (let x = 0; x < width; x++) {
    const before = new Uint32Array(256), after = new Uint32Array(256);
    for (let y = 0; y < height; y++) { before[inverted[y * width + x]]++; after[sorted[y * width + x]]++; }
    assert.deepEqual(before, after, 'column sorting must preserve the per-column histogram');
  }
  await assert.rejects(E.generate(9000, 2160, source), /dimensions/);
  await assert.rejects(E.generate(8192, 8192, source), /megapixels/);
  await assert.rejects(E.distort(new Uint8ClampedArray(1), width, height, {}), /dimensions/);
  for (const [w, h] of [[64, 64], [96, 160], [160, 96]]) assert.equal((await E.generate(w, h, source)).length, w * h);
  console.log('PASS: source determinism, mode differences, asymmetry, effects, input preservation, accumulation, recipe replay, sorting conservation, dimensions.');
  if (process.argv.includes('--samples')) {
    const output = path.resolve(__dirname, '../samples/iteration-02'); fs.mkdirSync(output, { recursive: true });
    const w = 3840, h = 2160, t0 = performance.now();
    const high = await E.generate(w, h, source);
    fs.writeFileSync(path.join(output, 'wet-wash-4k.png'), png(high, w, h));
    console.log(`4K wet source: ${Math.round(performance.now() - t0)}ms`, stats(high, w, h));
    const highDry = await E.generate(w, h, { ...source, mode: 'dry' });
    fs.writeFileSync(path.join(output, 'dry-transfer-4k.png'), png(highDry, w, h));
    const glitched = await E.distort(high, w, h, { ...zero, pull: .67, sort: .36, shift: .06, grain: .08, crush: .08, mix: .85, scale: .24, seed: 7183 });
    fs.writeFileSync(path.join(output, 'vertical-pull-4k.png'), png(glitched, w, h));
    fs.writeFileSync(path.join(output, 'digital-weave-4k.png'), png(await E.distort(high, w, h, { ...zero, pull: .14, weave: .71, shift: .12, slip: .06, crush: .48, mix: .84, scale: .3, seed: 7183 }), w, h));
    for (const name of ['wet-wash-4k.png', 'dry-transfer-4k.png', 'vertical-pull-4k.png', 'digital-weave-4k.png']) {
      const file = fs.readFileSync(path.join(output, name));
      assert.equal(file.readUInt32BE(16), w); assert.equal(file.readUInt32BE(20), h);
    }
    console.log('PASS: 4K rendering, distortion, and PNG dimensions. Samples:', output);
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { png, stats, changed };
