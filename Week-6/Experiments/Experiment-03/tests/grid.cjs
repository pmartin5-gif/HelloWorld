const assert = require('node:assert/strict');
const { createSimulation } = require('./grid-harness.cjs');
function check(sim) {
  const { state: s } = sim;
  const occupied = new Set();
  for (let i = 0; i < s.sand.length; i++) if (s.sand[i]) {
    const f = s.flakes[s.sand[i] - 1];
    assert(f && f.mode === 'settled' && f.cell === i);
    assert(!s.solid[i]); assert(!occupied.has(f.id)); occupied.add(f.id);
  }
  for (const f of s.flakes) {
    assert(Number.isFinite(f.x + f.y + f.vx + f.vy));
    assert.equal(f.mode === 'settled', occupied.has(f.id));
    assert.equal(s.flakes[f.id], f);
  }
}
// Multiple grains competing for a destination must never overwrite one another.
const conflict = createSimulation({ shape: 'empty', overrides: { particles: 0 } });
const row = 40, col = 60, cols = conflict.state.cols;
for (const c of [col-2,col-1,col+1,col+2]) conflict.state.solid[(row+1)*cols+c] = 1;
conflict.state.solid[(row+2)*cols+col] = 1;
for (const c of [col-1,col,col+1]) assert(conflict.put(conflict.add(), row*cols+c, 0));
conflict.sandStep(); check(conflict);
assert(conflict.state.sand[(row+1)*cols+col] > 0);
assert.equal(conflict.state.flakes.length, 3);
for (const f of conflict.state.flakes) assert(f.y <= (row + 1.5) * conflict.settings.gridCell, 'At most one cell of movement per tick');
console.log('PASS: destination claims conserve competing grains; one move per grain per tick.');
// A concentrated supply should form a broad mound, rather than a vertical stack.
const mound = createSimulation({ overrides: { particles: 0, windStrength: 0 } });
for (let i = 0; i < 3600; i++) {
  if (i < 1800 && i % 3 === 0) mound.add(400, 180);
  mound.step(1/60);
  if (i % 300 === 0) check(mound);
}
check(mound);
assert.equal(mound.state.flakes.length, 600);
assert(mound.state.flakes.filter(f => f.mode === 'settled').length > 580);
const heights = new Map();
for (const f of mound.state.flakes.filter(f => f.mode === 'settled')) {
  const c = f.cell % mound.state.cols;
  heights.set(c, Math.min(heights.get(c) ?? Infinity, f.y));
  const below = f.cell + mound.state.cols;
  assert(!mound.free(below), 'Resting grains have support');
  for (const d of [-1,1]) assert(!mound.free(below+d) || mound.state.solid[f.cell+d], 'A stable mound has no open diagonal descent');
}
const keys = [...heights.keys()].sort((a,b)=>a-b);
assert(keys.length > 30, 'Point supply spreads over many columns');
for (let i = 1; i < keys.length; i++) {
  assert.equal(keys[i]-keys[i-1],1, 'Mound has no empty vertical strips');
  assert(Math.abs(heights.get(keys[i])-heights.get(keys[i-1])) <= mound.settings.gridCell + .01, 'Neighboring pile tops follow the local diagonal rule');
}
console.log(`PASS: 600 grains form a stable ${keys.length * mound.settings.gridCell}px-wide mound, with no isolated columns or unsupported grains.`);
// Removing a support makes grains fall; there is no scripted release impulse.
const lip = createSimulation({ shape: 'empty', overrides: { particles: 0, windStrength: 0 } });
const at = 50 * lip.state.cols + 60;
const grain = lip.add(); lip.put(grain, at, 0); lip.sandStep();
assert.equal(grain.mode, 'falling'); assert.equal(grain.vx, 0); assert(grain.vy <= grain.speed);
check(lip);
console.log('PASS: unsupported grains return to air without excessive lateral momentum.');
for (const shape of ['hollow', 'double-hollow']) {
  const sim = createSimulation({ shape, overrides: { particles: 0, windStrength: 0, interiorSupply: 1 } });
  const levels = [...new Set(sim.state.interiorSources.map(c => Math.floor(c / sim.state.cols)))];
  assert.equal(levels.length, shape === 'hollow' ? 1 : 2);
  for (let i=0;i<120;i++) sim.recycle(sim.add());
  assert.equal(sim.state.interiorEntries,120);
  for (let i=0;i<1200;i++) sim.step(1/60);
  check(sim); assert.equal(sim.state.flakes.length,120);
  for (const level of levels) assert(sim.state.flakes.some(f => f.mode === 'settled' && f.y > level*sim.settings.gridCell && f.y < level*sim.settings.gridCell+90), 'Each inner floor collects ash');
  sim.recycle(sim.add()); assert.equal(sim.state.interiorEntries,121);
}
console.log('PASS: recycled ash continues feeding one and two numeral openings; inner floors accumulate.');
// Minute changes clear all deposits owned by changed digits, including shared contours.
const clock = createSimulation({ overrides: { particles: 0, windStrength: 0 } });
const changedCol = Math.floor(600/clock.settings.gridCell), retainedCol = Math.floor(300/clock.settings.gridCell);
function topCell(sim,c) { for(let r=1;r<sim.state.rows;r++) if(sim.state.solid[r*sim.state.cols+c]) return (r-1)*sim.state.cols+c; }
const changed = clock.add(), retained = clock.add();
assert(clock.put(changed,topCell(clock,changedCol),0));
assert(clock.put(retained,topCell(clock,retainedCol),3));
clock.setTime(new Date(2026,9,26,5,31));
assert(changed.mode === 'falling' && changed.passThrough);
assert.equal(retained.mode,'settled'); check(clock);
clock.setTime(new Date(2026,9,26,5,32)); assert(changed.passThrough);
clock.recycle(changed); assert(!changed.passThrough && changed.y === -clock.settings.margin);
clock.setTime(new Date(2026,9,26,12,0)); check(clock);
clock.setSize(390,844); check(clock); assert.equal(clock.state.width,390);
clock.frame(0); clock.frame(16); clock.render();
clock.listeners.change({matches:true}); assert(clock.state.reduced);
console.log('PASS: changed-digit release, unchanged retention, hour-length change, portrait resize, render, and reduced motion.');
// Fixed timestep means identical trajectories at 30, 60, and 120 display frames/s.
function atFrameRate(fps) {
 const sim = createSimulation({width:390,height:844, shape:'double-hollow', overrides:{particles:1200}});
 for(let i=0;i<=fps*12;i++) sim.frame(i*1000/fps);
 check(sim); return sim;
}
const a=atFrameRate(30),b=atFrameRate(60),c=atFrameRate(120);
for(const other of [b,c]) {
 assert(Math.abs(a.state.elapsed-other.state.elapsed)<1e-8);
 assert.equal(a.state.gridMoves,other.state.gridMoves);
 for(let i=0;i<a.state.flakes.length;i++) {
  assert(Math.abs(a.state.flakes[i].x-other.state.flakes[i].x)<1e-8);
  assert(Math.abs(a.state.flakes[i].y-other.state.flakes[i].y)<1e-8);
 }
}
console.log('PASS: identical physics and sand results at 30, 60, and 120 display frames/s.');
