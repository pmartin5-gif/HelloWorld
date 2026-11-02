const assert = require('node:assert/strict');
const { createSimulation } = require('./grid-harness.cjs');
for (const seed of [15, 816, 2026]) {
 const sim=createSimulation({shape:'empty',seed,overrides:{particles:0,windStrength:0}});
 const {state:s,settings:k}=sim;
 const cell=40*s.cols+60;
 s.solid[cell+s.cols]=1;
 const f=sim.add(); f.speed=45;
 assert(sim.put(f,cell,0));
 sim.sandStep();
 assert.equal(f.mode,'settled','Final cell movement remains interpolated until the next sand tick');
 const vx=f.sandVX,vy=f.sandVY,x=f.x,y=f.y;
 assert.equal(Math.abs(vx),24);assert.equal(vy,24);
 assert(Math.hypot(vx,vy)<35,'Diagonal motion stays within the gentle flake speed range');
 // Preserve the exact static pose when resuming airborne tumbling.
 const angle=f.restAngle,width=f.restFlutter;
 s.elapsed+=1/k.sandHz;
 sim.sandStep();
 assert.equal(f.mode,'falling');
 assert.equal(f.x,x);assert.equal(f.y,y);
 assert.equal(f.vx,vx);assert.equal(f.vy,vy);
 assert.equal(s.sand[f.cell]||0,0);
 assert(Math.abs(f.rotation+s.elapsed*f.spin-angle)<1e-10);
 assert(Math.abs(.35+.65*Math.abs(Math.sin(s.elapsed*.9+f.flutterPhase))-width)<1e-10);
 sim.step(1/60);
 assert(f.y>y&&f.y-y<.5,'First airborne step continues with a small displacement');
 assert(f.vy>=vy&&f.vy-vy<1,'Downward velocity continues smoothly toward terminal speed');
 assert(Math.abs(f.vx-vx)<1,'Horizontal drag acts gradually rather than resetting velocity');
 assert(Math.abs(Math.hypot(f.vx,f.vy)-Math.hypot(vx,vy))<1);
}
console.log('PASS: gentle diagonal speed, completed grid interpolation, unchanged release position/velocity/pose, and gradual airborne response.');
