const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const { createSimulation: grid } = require('./grid-harness.cjs');
const { createSimulation: legacy } = require('./legacy/tests/piling-harness.cjs');
const results = [];
for (const [width,height] of [[1200,700],[390,844],[1920,1080]]) {
 for (const [name,load] of [['legacy columns',legacy],['sand grid',grid]]) {
  const sim = load({width,height,shape:'hollow'});
  const tick = name === 'sand grid' ? dt => sim.step(dt) : sim.tick;
  for(let i=0;i<600;i++) tick(1/60);
  const times = [];
  for(let i=0;i<900;i++) {const start=performance.now(); tick(1/60); times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);
  results.push({viewport:`${width}x${height}`,model:name,gridCell:name==='sand grid'?sim.settings.gridCell:undefined,sandHz:name==='sand grid'?sim.settings.sandHz:undefined,particles:sim.state.flakes.length,
    meanMs:+(times.reduce((a,b)=>a+b,0)/times.length).toFixed(3),
    p95Ms:+times[Math.floor(times.length*.95)].toFixed(3),
    settled:sim.state.flakes.filter(f=>f.mode==='settled').length,
    gridBytes:name==='sand grid'?sim.state.sand.byteLength+sim.state.solid.byteLength:undefined});
 }
}
const report={runtime:process.version,platform:process.platform,architecture:process.arch,
 description:'Deterministic synthetic hollow raster, 8,000 particles; 600 warmup and 900 timed physics steps at 60 Hz. Includes wind. Excludes rendering, browser overhead, and mask rebuilds. Models produce different pile geometries.',results};
fs.writeFileSync(require('node:path').join(__dirname,'grid-performance.json'),JSON.stringify(report,null,2)+'\n');
console.table(results);
