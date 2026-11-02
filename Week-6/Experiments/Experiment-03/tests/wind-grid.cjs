const assert = require('node:assert/strict');
const { createSimulation } = require('./grid-harness.cjs');
// A strong wind peels the top, while a configurable dust layer stays on the solid.
const erosion = createSimulation({shape:'flat',overrides:{particles:0}});
const s=erosion.state, col=Math.floor(400/erosion.settings.gridCell);
let base; for(let r=1;r<s.rows;r++) if(s.solid[r*s.cols+col]) {base=(r-1)*s.cols+col;break;}
const grains=[];
for(let i=0;i<4;i++) {const f=erosion.add();erosion.put(f,base-i*s.cols,2);grains.push(f);}
s.wind={kind:'gust',x:400,y:grains.at(-1).y,rx:500,ry:500,strength:180,direction:1,travel:1,age:50,duration:100,driftX:0,driftY:0,tilt:0};
for(let i=0;i<120;i++) erosion.erodeSand(1/60);
const retainedRows=Math.ceil(erosion.settings.windResidue/erosion.settings.gridCell);
assert(grains.slice(0,retainedRows).every(f=>f.mode==='settled'));
assert(grains.slice(retainedRows).every(f=>f.mode==='falling'&&f.vx>0&&f.vy<0));
console.log('PASS: strong wind lifts exposed grains and retains the basal dust layer.');
for(const [width,height] of [[1200,700],[390,844]]) {
 const sim=createSimulation({width,height,shape:'double-hollow'});
 const sand=sim.state.sand,solid=sim.state.solid;
 let maxSettled=0;
 for(let i=0;i<7200;i++) {
  sim.step(1/60);
  if(i%300!==0)continue;
  const seen=new Set();
  for(let cell=0;cell<sim.state.sand.length;cell++) if(sim.state.sand[cell]) {
   const id=sim.state.sand[cell]-1,f=sim.state.flakes[id];
   assert(!solid[cell] && f.mode==='settled'&&f.cell===cell&&!seen.has(id));seen.add(id);
  }
  assert.equal(sim.state.flakes.length,8000);
  for(const f of sim.state.flakes) {
   assert(Number.isFinite(f.x+f.y+f.vx+f.vy));
   assert.equal(f.mode==='settled',seen.has(f.id));
   const cell=sim.cellAt(f.x,f.y);
   if(f.mode==='falling'&&!f.passThrough&&cell>=0&&solid[cell]) assert.equal(solid[cell]-1,f.ignoreGlyph);
  }
  maxSettled=Math.max(maxSettled,seen.size);
  assert.equal(sim.state.sand,sand); assert.equal(sim.state.solid,solid);
 }
 assert(sim.state.windCount>=2);assert(sim.state.interiorEntries>0);assert(maxSettled>100);
 assert(sim.state.detachments>0);
 console.log(`PASS: ${width}x${height}, 120 seconds, 8,000 conserved flakes, ${sim.state.windCount} wind events, ${sim.state.interiorEntries} inner entries, ${sim.state.detachments} natural detachments; grid buffers reused.`);
}
