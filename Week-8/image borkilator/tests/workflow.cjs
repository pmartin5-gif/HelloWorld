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
w.FileReader = class { readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = 'data:image/png;base64,' + Buffer.from(bytes).toString('base64'); this.onload(); }, () => this.onerror()); } };
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
// These are mock PNG containers for the controller, not browser encoding tests.
function mockPNG(width,height,rgba) {
  const payload=Buffer.from(JSON.stringify({width,height,rgba:Buffer.from(rgba).toString('base64')}));
  const length=Buffer.alloc(4); length.writeUInt32BE(payload.length);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),length,Buffer.from('jsON'),payload,Buffer.alloc(4)]);
}
w.HTMLCanvasElement.prototype.toBlob = function(callback) { callback(new Blob([mockPNG(this.width,this.height,pixels(this))], {type:'image/png'})); };
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,dGVzdA==';
w.createImageBitmap = async blob => { const data=JSON.parse(Buffer.from(await blob.arrayBuffer()).subarray(16,-4).toString()); return {width:data.width,height:data.height,rgba:Buffer.from(data.rgba,'base64'),close(){}}; };
w.HTMLDialogElement.prototype.showModal = function() { this.open=true; };
w.HTMLDialogElement.prototype.close = function(value) { this.returnValue=value; this.open=false; this.dispatchEvent(new w.Event('close')); };
const $ = id => d.getElementById(id);
const click = id => $(id).click();
const event = (id, type) => $(id).dispatchEvent(new w.Event(type, { bubbles: true }));
const art = () => new Uint8ClampedArray(pixels($('artwork')));
const count = () => d.querySelectorAll('.history-item').length;
const activeId = () => d.querySelector('.history-item[aria-current=true]')?.title;
async function until(predicate) { for (let i = 0; i < 1000; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error(`Timed out. UI message: ${$('message').textContent}`); }
const idle = () => until(() => $('viewport').getAttribute('aria-busy') === 'false');
function adjust(prefix, key, value) { $(`${prefix}-${key}`).value = value; event(`${prefix}-${key}`, 'input'); }
function choose(id,file) { Object.defineProperty($(id),'files',{configurable:true,value:[file]}); event(id,'change'); }
function imageFile(width=80,height=70,name='color.png') {
  const rgba=Uint8ClampedArray.from({length:width*height*4},(_,i)=>i%4===3?(Math.floor(i/4)*13)%256:(i*37)%256);
  const file=new Blob([mockPNG(width,height,rgba)],{type:'image/png'}); file.name=name; return {file,rgba};
}
async function main() {
  w.eval(fs.readFileSync(path.join(root,'engine.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
  assert.equal(count(),0); assert.equal($('apply').disabled,true); assert.equal($('source-panel'),null);
  assert.equal($('signal-panel').hidden,false);
  let pickerClicks=0;
  $('upload-image').addEventListener('click',()=>{pickerClicks++;});
  assert.equal($('empty').tagName,'BUTTON','empty pane must have native keyboard activation');
  click('empty'); assert.equal(pickerClicks,1); assert.equal(count(),0,'picker cancellation leaves workspace empty');
  click('viewport'); assert.equal(pickerClicks,2,'empty pane margins also open the picker');
  const first=imageFile(); choose('upload-image',first.file);
  assert.equal($('empty').disabled,true,'empty upload action disabled while busy');
  click('viewport'); assert.equal(pickerClicks,2,'busy pane must not reopen picker');
  await idle();
  assert.equal($('empty').hidden,true);
  click('viewport'); assert.equal(pickerClicks,2,'loaded image pane must not reopen picker');
  assert.equal(count(),1); assert.deepEqual(art(),first.rgba); assert.equal($('study-title').textContent,'color.png');
  const original=art(); adjust('signal','shift',80); adjust('signal','pull',0); adjust('signal','mix',75);
  assert.deepEqual(art(),original,'settings must prepare only');
  click('apply'); await idle(); const pass=art(); assert.notDeepEqual(pass,original); assert.equal(count(),2);
  click('view-original'); await until(()=>$('view-original').getAttribute('aria-pressed')==='true'); assert.deepEqual(art(),original);
  click('export'); const exported=JSON.parse(Buffer.from(await downloads.at(-1).blob.arrayBuffer()).subarray(16,-4).toString());
  assert.deepEqual(Buffer.from(exported.rgba,'base64'),Buffer.from(pass),'export must use current while comparing original');
  click('undo'); await idle(); assert.deepEqual(art(),original);
  click('redo'); await idle(); assert.deepEqual(art(),pass);
  click('undo'); await idle(); adjust('signal','grain',40); click('apply'); await idle(); assert.equal(count(),3); assert.equal($('redo').disabled,true);
  const branch=art();
  click('save-recipe'); await idle(); const saved=downloads.at(-1).blob, recipe=JSON.parse(await saved.text());
  assert.equal(recipe.version,3); assert.equal(recipe.filename,'color.png'); assert.match(recipe.image,/^data:image\/png;base64,/);
  assert.equal(recipe.passes.length,1);
  const next=imageFile(80,70,'next.png'); choose('upload-image',next.file); await idle(); assert.equal(count(),4);
  assert.equal($('signal-grain').value,'40'); assert.deepEqual(art(),next.rgba);
  choose('load-recipe',saved); await idle(); assert.deepEqual(art(),branch); assert.equal(count(),6);
  click('undo'); await idle(); assert.deepEqual(art(),original); click('redo'); await idle(); assert.deepEqual(art(),branch);
  const stable=art(), stableCount=count();
  for(const file of [new Blob(['bad']),new Blob([JSON.stringify({...recipe,version:2})]),new Blob([JSON.stringify({...recipe,width:81})]),new Blob([JSON.stringify({...recipe,passes:[{seed:-1}]})])]) {
    choose('load-recipe',file); await idle(); assert.deepEqual(art(),stable); assert.equal(count(),stableCount);
  }
  choose('upload-image',new Blob(['invalid image'])); await idle(); assert.match($('message').textContent,/Choose a still/); assert.deepEqual(art(),stable);
  choose('upload-image',{size:101*1024*1024}); await idle(); assert.match($('message').textContent,/100 MiB/);
  // Animated PNG rejection before decoding.
  const animated=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(4),Buffer.from('acTL'),Buffer.alloc(4),Buffer.alloc(4)]);
  choose('upload-image',new Blob([animated])); await idle(); assert.match($('message').textContent,/Animated/);
  const narrow=imageFile(1,70,'narrow.png'); choose('upload-image',narrow.file); await idle(); assert.equal($('artwork').width,1); assert.deepEqual(art(),narrow.rgba);
  // Resize cancellation keeps the working state, confirmation imports at bounded dimensions.
  const huge=imageFile(8193,1,'wide.png'); choose('upload-image',huge.file); await until(()=>$('resize-dialog').open);
  assert.match($('resize-description').textContent,/8192 × 1/); $('resize-dialog').close('cancel'); await idle(); assert.deepEqual(art(),narrow.rgba);
  choose('upload-image',huge.file); await until(()=>$('resize-dialog').open); $('resize-dialog').close('resize'); await idle(); assert.equal($('artwork').width,8192);
  // Inject a mid-replay engine failure: no partial history or visible image may commit.
  const current=art(), num=count(), real=w.InkEngine.distortRGBA;
  w.InkEngine.distortRGBA=async()=>{throw new Error('injected failure');}; choose('load-recipe',saved); await idle();
  assert.deepEqual(art(),current); assert.equal(count(),num); w.InkEngine.distortRGBA=real;
  // No-op passes preserve history; picker cancellation does too.
  click('view-current'); choose('upload-image',undefined); assert.equal(count(),num);
  d.querySelector('[data-preset="clear"]').click(); click('apply'); assert.equal(count(),num);
  choose('upload-image',first.file); await idle();
  adjust('signal','grain',35); adjust('signal','mix',75); click('apply'); await idle();
  const once=art(); click('apply'); await idle(); assert.notDeepEqual(art(),once,'passes must accumulate');
  const exact=art(), priorCount=count(), encode=w.HTMLCanvasElement.prototype.toBlob;
  w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};
  choose('upload-image',next.file); await idle(); assert.deepEqual(art(),exact); assert.equal(count(),priorCount);
  w.HTMLCanvasElement.prototype.toBlob=encode;
  const tooMany={...recipe,passes:Array.from({length:65},()=>recipe.passes[0])};
  choose('load-recipe',new Blob([JSON.stringify(tooMany)])); await idle(); assert.deepEqual(art(),exact);
  choose('load-recipe',{size:129*1024*1024}); await idle(); assert.match($('message').textContent,/128 MiB/); assert.deepEqual(art(),exact);
  // Old v3 passes without the new field still replay and restore the control to zero.
  const older=JSON.parse(await saved.text()); older.passes.forEach(pass=>delete pass.cosmic);
  choose('load-recipe',new Blob([JSON.stringify(older)])); await idle();
  assert.deepEqual(art(),branch); assert.equal($('signal-cosmic').value,'0');
  choose('upload-image',first.file); await idle(); d.querySelector('[data-preset="clear"]').click();
  assert.equal($('signal-cosmic').value,'0');
  const particleOriginal=art(); adjust('signal','cosmic',100); adjust('signal','mix',75);
  assert.equal($('signal-cosmic-value').value,'100'); assert.deepEqual(art(),particleOriginal,'cosmic slider prepares only');
  click('apply'); await idle(); const cosmicFull=art(); assert.notDeepEqual(cosmicFull,particleOriginal,'cosmic alone must be treated as an effect');
  click('undo'); await idle(); assert.deepEqual(art(),particleOriginal);
  click('redo'); await idle(); assert.deepEqual(art(),cosmicFull); assert.equal($('signal-cosmic').value,'100');
  click('undo'); await idle(); adjust('signal','cosmic',50); click('apply'); await idle(); const cosmicBranch=art();
  assert.equal($('redo').disabled,true);
  click('save-recipe'); await idle(); const cosmicSave=downloads.at(-1).blob, cosmicRecipe=JSON.parse(await cosmicSave.text());
  assert.equal(cosmicRecipe.passes.at(-1).cosmic,.5);
  choose('load-recipe',cosmicSave); await idle(); assert.deepEqual(art(),cosmicBranch); assert.equal($('signal-cosmic').value,'50');
  for(const cosmic of [-.1,1.1,null,'0.5']) {
    const invalid=structuredClone(cosmicRecipe); invalid.passes[0].cosmic=cosmic;
    const total=count(); choose('load-recipe',new Blob([JSON.stringify(invalid)])); await idle();
    assert.match($('message').textContent,/Invalid cosmic/); assert.deepEqual(art(),cosmicBranch); assert.equal(count(),total);
  }
  for(const name of ['dragged','fractured','encoded','clear']) {
    adjust('signal','cosmic',40); d.querySelector(`[data-preset="${name}"]`).click();
    assert.equal($('signal-cosmic').value,'0'); assert.deepEqual(art(),cosmicBranch);
  }
  console.log('Controller: upload, preparation, cumulative passes, RGBA history, branching, compare/export, self-contained replay, atomic failures, limits, resizing, cosmic-only passes, cosmic history/replay, older v3 imports and cancellation passed.');
  w.close();
}
main().catch(error=>{console.error(error);w.close();process.exitCode=1;});
