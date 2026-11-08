'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const e = require('../engine.js');
const keys = ['pull','shift','slip','sort','weave','crush','grain'];
const settings = (extra = {}) => e.signalSettings({ ...Object.fromEntries(keys.map(k=>[k,0])), scale:.35, mix:.75, seed:7123, ...extra });
const w=80,h=70,n=w*h;
const gray = Uint8ClampedArray.from({length:n},(_,i)=>(i*53+i%17)%256);
const rgba = new Uint8ClampedArray(n*4);
for(let i=0;i<n;i++) rgba.set([gray[i],gray[i],gray[i],255],i*4);
(async()=>{
  for(const key of [...keys, 'all']) {
    const s=settings(key==='all'?Object.fromEntries(keys.map(k=>[k,.7])):{[key]:.83});
    const g=await e.distort(gray,w,h,s), r=await e.distortRGBA(rgba,w,h,s);
    for(let i=0;i<n;i++) { assert.equal(r[i*4],g[i],key); assert.equal(r[i*4+1],g[i]); assert.equal(r[i*4+3],255); }
  }
  const color=new Uint8ClampedArray(n*4);
  for(let i=0;i<n;i++) color.set([i%256,(i*7)%256,(i*19)%256,(i*13)%256],i*4);
  const before=color.slice();
  assert.deepEqual(await e.distortRGBA(color,w,h,settings()),color);
  for(const key of keys) {
    const s=settings({[key]:1}), a=await e.distortRGBA(color,w,h,s), b=await e.distortRGBA(color,w,h,s);
    assert.deepEqual(a,b); assert.deepEqual(color,before); assert.notDeepEqual(a,color,key);
    if(['weave','crush','grain'].includes(key)) for(let i=3;i<a.length;i+=4) assert.equal(a[i],color[i],key+' alpha');
    const over=await e.distortRGBA(color,w,h,{...s,mix:1}); assert.equal(over.length,color.length);
  }
  // Sorting preserves complete RGBA pixels (apart from invisible RGB normalization).
  const opaque=color.slice(); for(let i=3;i<opaque.length;i+=4)opaque[i]=255;
  const sorted=await e.distortRGBA(opaque,w,h,settings({sort:1}));
  const multiset=a=>Array.from({length:a.length/4},(_,i)=>Array.from(a.slice(i*4,i*4+4)).join(',')).sort();
  assert.deepEqual(multiset(sorted),multiset(opaque));
  for(const [width,height] of [[1,1],[1,8192],[8192,1]]) {
    const a=new Uint8ClampedArray(width*height*4).fill(128);
    assert.equal((await e.distortRGBA(a,width,height,settings({pull:1,sort:1,slip:1}))).length,a.length);
  }
  assert.throws(()=>e.validateUploadSize(8193,1)); assert.throws(()=>e.validateUploadSize(8192,8192));
  await assert.rejects(e.distortRGBA(new Uint8ClampedArray(2),1,1,settings()));
  // Cosmic hits change one RGB channel per selected pixel and preserve alpha.
  const particleInput = opaque.slice(), particleBefore = particleInput.slice();
  const cosmic = coverage => settings({cosmic:coverage});
  const full = await e.distortRGBA(particleInput,w,h,cosmic(1));
  const quarter = await e.distortRGBA(particleInput,w,h,cosmic(.25));
  const half = await e.distortRGBA(particleInput,w,h,cosmic(.5));
  assert.deepEqual(full,await e.distortRGBA(particleInput,w,h,cosmic(1)));
  assert.deepEqual(particleInput,particleBefore);
  assert.deepEqual(await e.distortRGBA(particleInput,w,h,cosmic(0)),particleInput);
  assert.deepEqual(await e.distortRGBA(particleInput,w,h,{...cosmic(1),mix:0}),particleInput);
  assert.notDeepEqual(full,await e.distortRGBA(particleInput,w,h,{...cosmic(1),seed:7124}));
  let selected=0, allSelected=0; const channels=[0,0,0], values=new Set();
  for(let p=0;p<full.length;p+=4) {
    const changed=[0,1,2].filter(c=>full[p+c]!==particleInput[p+c]);
    assert.ok(changed.length<=1,'a hit must not replace multiple channels');
    assert.equal(full[p+3],particleInput[p+3]);
    if(changed.length) { allSelected++; channels[changed[0]]++; values.add(full[p+changed[0]]); }
    if([0,1,2].some(c=>quarter[p+c]!==particleInput[p+c])) {
      selected++;
      assert.deepEqual(half.slice(p,p+4),quarter.slice(p,p+4),'higher coverage retains existing hits');
      assert.deepEqual(full.slice(p,p+4),quarter.slice(p,p+4));
    }
  }
  assert.ok(selected/n>.22 && selected/n<.28,'quarter coverage must target approximately a quarter');
  assert.ok(allSelected/n>.985,'full coverage changes nearly every pixel; equal replacements are allowed');
  assert.ok(channels.every(count=>count/allSelected>.29 && count/allSelected<.38),'all RGB channels must be reachable');
  assert.equal(values.size,256,'random replacement spans all byte values');
  const blended=await e.distortRGBA(particleInput,w,h,{...cosmic(1),mix:.375});
  const overdriven=await e.distortRGBA(particleInput,w,h,{...cosmic(1),mix:1});
  assert.deepEqual(blended,Uint8ClampedArray.from(particleInput,(v,i)=>i%4===3?v:v+(full[i]-v)*.5),'particle hits must precede mix');
  assert.deepEqual(overdriven,Uint8ClampedArray.from(particleInput,(v,i)=>i%4===3?v:v+(full[i]-v)*3),'particle hits use existing overdrive');
  const combinedSettings=settings({shift:.7,grain:.3,cosmic:.8});
  const preceding=await e.distortRGBA(particleInput,w,h,{...combinedSettings,cosmic:0});
  assert.deepEqual(await e.distortRGBA(particleInput,w,h,combinedSettings),await e.distortRGBA(preceding,w,h,cosmic(.8)),'particle hits must follow other effects');
  const partial=particleInput.slice(); for(let p=0;p<partial.length;p+=4) {partial[p+3]=p%256; if(!partial[p+3]) partial.fill(0,p,p+3);}
  const transparent=await e.distortRGBA(partial,w,h,cosmic(1));
  for(let p=3;p<partial.length;p+=4) assert.equal(transparent[p],partial[p]);
  const beforeCosmic=require('./fixtures/rgba-before-cosmic.json'), digest=require('node:crypto');
  const oldInput=Uint8ClampedArray.from({length:beforeCosmic.width*beforeCosmic.height*4},(_,i)=>(i*37)%256);
  for(const fixture of beforeCosmic.cases) {
    for(const extra of [{},{cosmic:0}]) {
      const pixels=await e.distortRGBA(oldInput,beforeCosmic.width,beforeCosmic.height,{...fixture.settings,...extra});
      assert.equal(digest.createHash('sha256').update(pixels).digest('hex'),fixture.sha256,'pre-feature version-3 pixels must match');
    }
  }
  // Exercise worker transport using the same engine and real transferred byte layout.
  const posted=[];
  const scope={InkEngine:e,Uint8ClampedArray,importScripts(){},self:{postMessage(m){posted.push(m);}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../worker.js'),'utf8'),scope);
  const s=settings({shift:.9,grain:.5,cosmic:.6});
  await scope.self.onmessage({data:{id:4,operation:'distort',width:w,height:h,settings:s,pixels:color.slice().buffer}});
  assert.deepEqual(new Uint8ClampedArray(posted.at(-1).result),await e.distortRGBA(color,w,h,s));
  console.log('RGBA: grayscale parity, color, alpha, effects, determinism, input preservation, sort conservation, narrow sizes, limits, cosmic coverage/channel/seed checks, old-save digests and worker parity passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
