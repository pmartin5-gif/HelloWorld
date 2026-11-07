'use strict';
// Controller tests in a DOM harness, NOT a browser or visual/layout test.
// Canvas/PNG browser APIs are replaced with lossless in-memory stand-ins.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { JSDOM } = require(process.env.JSDOM_MODULE_PATH || 'jsdom');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'file:///afterimage/index.html', runScripts: 'outside-only' });
const w = dom.window, d = w.document;
const frames = new WeakMap(), blobs = new Map(), downloads = [];
let urlId = 0;
w.structuredClone = structuredClone; w.Blob = Blob;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.URL.createObjectURL = blob => { const id = `blob:test-${++urlId}`; blobs.set(id, blob); return id; };
w.URL.revokeObjectURL = id => blobs.delete(id);
w.HTMLAnchorElement.prototype.click = function () { downloads.push({ filename: this.download, blob: blobs.get(this.href) }); };
function pixels(canvas) {
  let a = frames.get(canvas);
  if (!a || a.length !== canvas.width * canvas.height * 4) { a = new Uint8ClampedArray(canvas.width * canvas.height * 4); frames.set(canvas, a); }
  return a;
}
w.HTMLCanvasElement.prototype.getContext = function () {
  const canvas = this;
  return {
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: image => frames.set(canvas, new Uint8ClampedArray(image.data)),
    getImageData: () => ({ data: new Uint8ClampedArray(pixels(canvas)) }),
    fillRect: () => pixels(canvas).fill(128),
    drawImage: image => {
      const from = image.rgba || pixels(image);
      if (from.length === canvas.width * canvas.height * 4) frames.set(canvas, new Uint8ClampedArray(from));
    }
  };
};
w.HTMLCanvasElement.prototype.toBlob = function (callback) { callback(new Blob([JSON.stringify({ width: this.width, height: this.height, rgba: Buffer.from(pixels(this)).toString('base64') })], { type: 'image/png' })); };
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,dGVzdA==';
w.createImageBitmap = async blob => { const data = JSON.parse(await blob.text()); return { width: data.width, height: data.height, rgba: Buffer.from(data.rgba, 'base64'), close() {} }; };
const $ = id => d.getElementById(id);
const click = id => $(id).click();
const event = (id, type) => $(id).dispatchEvent(new w.Event(type, { bubbles: true }));
const art = () => new Uint8ClampedArray(pixels($('artwork')));
const count = () => d.querySelectorAll('.history-item').length;
const activeId = () => d.querySelector('.history-item[aria-current=true]')?.title;
async function until(predicate) { for (let i = 0; i < 1000; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error(`Timed out. UI message: ${$('message').textContent}`); }
const idle = () => until(() => $('viewport').getAttribute('aria-busy') === 'false');
function adjust(prefix, key, value) { $(`${prefix}-${key}`).value = value; event(`${prefix}-${key}`, 'input'); }
async function main() {
  assert.equal($('resolution').value, '3840x2160', 'default output must be 4K');
  w.eval(fs.readFileSync(path.join(root, 'engine.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
  $('resolution').value = 'custom'; $('custom-width').value = 320; $('custom-height').value = 180; event('resolution', 'change');
  await until(() => count() === 1 && !$('generate').disabled);
  const source = art(); assert.equal(source.length, 320 * 180 * 4); assert.equal($('state-chip').textContent, 'SOURCE');
  click('signal-tab'); assert($('source-panel').hidden); assert(!$('signal-panel').hidden);
  adjust('signal', 'pull', 70); adjust('signal', 'shift', 30);
  assert.deepEqual(art(), source, 'moving controls must not render'); assert.equal(count(), 1);
  click('apply'); await idle(); const first = art(); assert.notDeepEqual(first, source); assert.equal(count(), 2);
  click('apply'); await idle(); const second = art(); assert.notDeepEqual(second, first); assert.equal(count(), 3);
  click('undo'); await idle(); assert.deepEqual(art(), first, 'undo must restore exact pixels'); assert(!$('redo').disabled);
  click('redo'); await idle(); assert.deepEqual(art(), second, 'redo must restore exact pixels');
  click('undo'); await idle(); adjust('signal', 'weave', 75); click('apply'); await idle(); const branch = art();
  assert.equal(count(), 4); assert.notDeepEqual(branch, second); assert($('redo').disabled);
  const originalId = activeId(); click('view-original'); await until(() => $('view-original').getAttribute('aria-pressed') === 'true');
  assert.deepEqual(art(), source); assert.equal(activeId(), originalId, 'comparison must not change working state');
  click('export');
  const png = JSON.parse(await downloads.at(-1).blob.text());
  assert.equal(png.width, 320); assert.equal(png.height, 180); assert.deepEqual(Buffer.from(png.rgba, 'base64'), Buffer.from(branch), 'export must use current result even when comparing original');
  click('view-current'); await until(() => $('view-current').getAttribute('aria-pressed') === 'true'); assert.deepEqual(art(), branch);
  click('zoom'); assert($('viewport').classList.contains('actual-size')); click('zoom'); assert(!$('viewport').classList.contains('actual-size'));
  click('save-recipe'); const saved = await downloads.at(-1).blob.text(); const recipe = JSON.parse(saved);
  assert.equal(recipe.passes.length, 2); assert.equal(recipe.width, 320); assert.equal(recipe.source.seed, 42819);
  const beforeZero = count(); d.querySelector('[data-preset=clear]').click(); click('apply'); await idle(); assert.equal(count(), beforeZero, 'no-op pass must not create a history state');
  Object.defineProperty($('load-recipe'), 'files', { configurable: true, value: [{ size: saved.length, text: async () => saved }] }); event('load-recipe', 'change');
  await until(() => count() === beforeZero + 3 && !$('generate').disabled);
  assert.deepEqual(art(), branch, 'reopened settings must recreate the exact image'); assert(!$('undo').disabled, 'reopened passes must be undoable');
  click('undo'); await idle(); assert.deepEqual(art(), first);
  const beforeInvalid = count(), beforeInvalidPixels = art();
  const invalid = JSON.stringify({ ...recipe, width: 99999 });
  Object.defineProperty($('load-recipe'), 'files', { configurable: true, value: [{ size: invalid.length, text: async () => invalid }] }); event('load-recipe', 'change');
  await until(() => $('message').classList.contains('error')); assert.equal(count(), beforeInvalid); assert.deepEqual(art(), beforeInvalidPixels);
  $('custom-width').value = 99999; click('generate'); assert.equal(count(), beforeInvalid); assert.deepEqual(art(), beforeInvalidPixels);
  $('custom-width').value = 400; $('custom-height').value = 225; d.querySelector('input[value=dry]').checked = true; click('generate'); await idle();
  assert.equal(count(), beforeInvalid + 1); assert.equal($('artwork').width, 400); assert.equal($('artwork').height, 225);
  d.querySelector('.history-item').click(); await idle(); assert.deepEqual(art(), source); assert.equal($('custom-width').value, '320');
  const unknownIds = [...d.querySelectorAll('[aria-controls]')].map(el => el.getAttribute('aria-controls')).filter(id => !$(id)); assert.deepEqual(unknownIds, []);
  assert.equal(d.querySelectorAll('canvas').length, 1); assert.equal(d.querySelectorAll('input[type=range]').length, 14);
  console.log('PASS: control preparation, tabs, cumulative passes, exact undo/redo, history branches, original comparison, export selection, saved-settings replay, loaded undo, no-op handling, invalid input, dimensions, earlier studies.');
  // New source exploration must change seeds without requiring a separate reroll.
  const seedBefore = $('source-seed').value;
  $('lock-seed').checked = false; event('lock-seed', 'change');
  click('generate'); await idle(); const explored = art(), exploredSeed = $('source-seed').value;
  assert.notEqual(exploredSeed, seedBefore, 'unlocked Generate must use a new seed');
  click('generate'); await idle(); assert.notEqual($('source-seed').value, exploredSeed); assert.notDeepEqual(art(), explored);
  $('lock-seed').checked = true; event('lock-seed', 'change'); const heldSeed = $('source-seed').value, heldImage = art();
  click('generate'); await idle(); assert.equal($('source-seed').value, heldSeed); assert.deepEqual(art(), heldImage, 'locking a seed must let the user revisit the exact source');
  $('source-seed').value = 2026; event('source-seed', 'input'); assert($('lock-seed').checked, 'manual seed input must be respected');
  $('structure').value = 'strata'; event('structure', 'change');
  const beforePreparing = art(); adjust('source', 'bleed', 100); assert.deepEqual(art(), beforePreparing, 'new source settings still prepare without rendering');
  click('generate'); await idle(); assert($('study-title').textContent.includes('Sediment'));
  click('save-recipe'); const modern = JSON.parse(await downloads.at(-1).blob.text());
  assert.equal(modern.version, 2); assert.equal(modern.source.structure, 'strata'); assert.equal(modern.source.model, 2); assert.equal(modern.source.seed, 2026);
  // Existing v1 settings still reconstruct their original pixels, and may gain v2 passes.
  const old = require('./fixtures/v1.json');
  const oldRecipe = JSON.stringify({ application: 'afterimage', version: 1, width: old.width, height: old.height, source: old.source, passes: [old.signal, old.signal] });
  Object.defineProperty($('load-recipe'), 'files', { configurable: true, value: [{ size: oldRecipe.length, text: async () => oldRecipe }] }); event('load-recipe', 'change');
  await until(() => $('message').textContent.includes('Recreated a 96 × 64') && !$('generate').disabled);
  const gray = new Uint8Array(old.width * old.height), rgba = art(); for (let i = 0; i < gray.length; i++) gray[i] = rgba[i * 4];
  assert.equal(crypto.createHash('sha256').update(gray).digest('hex'), old.hashes.second, 'opening a legacy file must preserve its exact result');
  d.querySelector('[data-preset=dragged]').click(); click('apply'); await idle(); const extended = art();
  click('save-recipe'); const hybridText = await downloads.at(-1).blob.text(), hybrid = JSON.parse(hybridText);
  assert.equal(hybrid.version, 2); assert.equal(hybrid.source.model, 1); assert.deepEqual(hybrid.passes.map(s => s.model), [1, 1, 2]);
  Object.defineProperty($('load-recipe'), 'files', { configurable: true, value: [{ size: hybridText.length, text: async () => hybridText }] }); event('load-recipe', 'change');
  await until(() => $('message').textContent.includes('with 3 applied passes') && !$('generate').disabled);
  assert.deepEqual(art(), extended, 'a legacy source with new passes must also replay exactly');
  console.log('PASS: fresh-source exploration, locked/manual seeds, independent structure choice, extreme prepared settings, modern recipes, exact legacy imports, mixed-model replay.');
  // Exercise the actual worker message handler without a browser or network.
  const replies = []; const context = vm.createContext({ self: { postMessage: data => replies.push(data) }, setTimeout, Uint8ClampedArray, Uint32Array, Float32Array, Math, Number, Object, Error, Promise, console });
  context.importScripts = name => vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context);
  Object.defineProperty(context, 'InkEngine', { get: () => context.self.InkEngine });
  vm.runInContext(fs.readFileSync(path.join(root, 'worker.js'), 'utf8'), context);
  await context.self.onmessage({ data: { id: 1, operation: 'generate', width: 96, height: 64, settings: {} } });
  assert.equal(replies.at(-1).id, 1); assert.equal(replies.at(-1).result.byteLength, 96 * 64);
  await context.self.onmessage({ data: { id: 2, operation: 'distort', width: 96, height: 64, settings: { pull: .7 }, pixels: replies.at(-1).result } });
  assert.equal(replies.at(-1).id, 2); assert.equal(replies.at(-1).result.byteLength, 96 * 64);
  await context.self.onmessage({ data: { id: 3, operation: 'generate', width: 9000, height: 64, settings: {} } }); assert(replies.at(-1).error);
  console.log('PASS: worker generation/distortion protocol, progress, result buffers, and error reporting.');
}
main().then(() => dom.window.close()).catch(error => { console.error(error); dom.window.close(); process.exitCode = 1; });
