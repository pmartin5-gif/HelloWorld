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
  // Exercise worker transport using the same engine and real transferred byte layout.
  const posted=[];
  const scope={InkEngine:e,Uint8ClampedArray,importScripts(){},self:{postMessage(m){posted.push(m);}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../worker.js'),'utf8'),scope);
  const s=settings({shift:.9,grain:.5});
  await scope.self.onmessage({data:{id:4,operation:'distort',width:w,height:h,settings:s,pixels:color.slice().buffer}});
  assert.deepEqual(new Uint8ClampedArray(posted.at(-1).result),await e.distortRGBA(color,w,h,s));
  console.log('RGBA: grayscale parity, color, alpha, effects, determinism, input preservation, sort conservation, narrow sizes, limits and worker parity passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
