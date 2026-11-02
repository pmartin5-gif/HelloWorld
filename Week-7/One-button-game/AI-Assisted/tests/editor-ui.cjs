// Execute the actual editor controller with a small DOM/audio fixture.
const fs=require('node:fs'), path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'editor/index.html'),'utf8');
class Element {
  constructor(id){this.id=id;this.value='';this.checked=false;this.disabled=false;this.listeners={};this.children=[];this.scrollTop=0;this.style={};this.width=1200;this.height=240;this.textContent='';this.classList={toggle(){}};}
  set value(value){this._value=String(value);}
  get value(){return this._value;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(name,value){this[name]=value;}
  replaceChildren(){this.children=[];}
  append(child){this.children.push(child);}
  getContext(){return new Proxy({}, {get:()=>()=>{},set:()=>true});}
  getBoundingClientRect(){return {left:0,width:1200};}
  closest(){return null;}
  click(){}
}
const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])]));
for(const [id,value] of Object.entries({speed:'1','tap-offset':'0','loop-start':'0','loop-end':'10',zoom:'10',shift:'-50'})) elements.get(id).value=value;
elements.get('preview').checked=true; elements.get('follow').checked=true;
const chart={audio:'Songs/test.m4a',duration:10,notes:[1,2,3]};
const easyChart={audio:'Songs/easy.mp3',duration:10,notes:[]};
const hardChart={audio:'Songs/hard.mp3',duration:10,notes:[]};
const catalog=[{id:'hard',difficulty:'Hard',title:'Bleeding The Weak',audio:hardChart.audio,chart:'Songs/hard.chart.json'},{id:'easy',difficulty:'Easy',title:'Happy Birthday',audio:easyChart.audio,chart:'Songs/easy.chart.json'},{id:'medium',difficulty:'Medium',title:'Pink Panther',audio:chart.audio,chart:'Songs/test.chart.json'}];
let context,frame,documentEvents={},windowEvents={},post,postUrl;
class Audio {
  constructor(){context=this;this.currentTime=0;this.destination={};}
  async resume(){}
  async decodeAudioData(){return {duration:10,getChannelData:()=>new Float32Array(100)};}
  createBufferSource(){return {playbackRate:{},connect(){},start(){},stop(){},disconnect(){}};}
  createOscillator(){return {frequency:{},connect(){},disconnect(){},start(){},stop(){}};}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
}
const ctx=vm.createContext({console,Math,Number,JSON,Float32Array,URL,Blob,setTimeout,
  location:{href:'http://127.0.0.1:8000/editor/'},
  requestAnimationFrame:fn=>{frame=fn;},
  window:{AudioContext:Audio,addEventListener:(n,fn)=>{windowEvents[n]=fn;}},
  document:{getElementById:id=>elements.get(id),createElement:()=>new Element(),addEventListener:(n,fn)=>{documentEvents[n]=fn;}},
  fetch:async(url,options)=>{
    if(options?.method==='POST'){postUrl=String(url);post=JSON.parse(options.body);const selected=String(url).includes('song=hard')?hardChart:String(url).includes('song=easy')?easyChart:chart;return {ok:true,json:async()=>({chart:{...selected,notes:post.notes},revision:'new'})};}
    if(String(url).endsWith('catalog.json')) return {ok:true,json:async()=>catalog};
    if(String(url).startsWith('/api/chart'))return {ok:true,json:async()=>({chart:String(url).includes('song=hard')?hardChart:String(url).includes('song=easy')?easyChart:chart,revision:'old'})};
    return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)};
  }
});
for(const file of ['editor/model.js','editor/editor.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const click=async id=>{elements.get(id).listeners.click();await flush();};
const key=async(code,key)=>{documentEvents.keydown({code,key,repeat:false,target:new Element(),preventDefault(){}});await flush();};
(async()=>{
  await flush(); assert.equal(elements.get('workspace').disabled,false); frame();
  assert.equal(elements.get('notes').children.length,3);
  // Record after clicking a button: Space must record rather than toggle the button.
  await click('clear-section'); assert.equal(elements.get('notes').children.length,0);
  await click('record'); await key('KeyP','p');
  context.currentTime=1.5; await key('Space',' ');
  assert.equal(elements.get('notes').children.length,1);
  assert.match(elements.get('notes').children[0].textContent,/1.500/);
  context.currentTime=2.5; elements.get('tap-offset').value='-50'; await key('Space',' ');
  assert.match(elements.get('notes').children[1].textContent,/2.450/);
  await key('ArrowLeft','ArrowLeft'); assert.match(elements.get('notes').children[1].textContent,/2.440/);
  await click('save'); assert.deepEqual(post.notes,[1.5,2.44]);
  assert.equal(post.revision,'old'); assert.equal(elements.get('dirty').textContent,'Chart matches saved version');
  windowEvents.blur(); frame(); assert.equal(elements.get('play').textContent,'Play · P');
  await click('undo'); assert.equal(elements.get('dirty').textContent,'Unsaved changes');
  elements.get('loop-start').value='9';elements.get('loop-end').value='2';
  elements.get('loop').listeners.change();await flush();
  assert.match(elements.get('notice').textContent,/Section must/);
  elements.get('import').files=[{size:100,text:async()=>JSON.stringify({...chart,notes:[4,5]})}];
  await elements.get('import').listeners.change();
  assert.equal(elements.get('notes').children.length,2);
  assert.match(elements.get('notes').children[0].textContent,/4.000/);
  assert.equal(elements.get('dirty').textContent,'Unsaved changes');
  // Clearing follows the visible timeline, independently of invalid loop fields.
  elements.get('import').files=[{size:100,text:async()=>JSON.stringify({...chart,notes:[0,1,5,5.25,9,10]})}];
  await elements.get('import').listeners.change();
  elements.get('follow').checked=false;
  elements.get('zoom').value='5'; elements.get('zoom').listeners.change(); frame();
  await click('clear-section');
  assert.deepEqual(elements.get('notes').children.map(n=>n.textContent.trim().split(/\s+/)[1]),['5.250000','9.000000','10.000000']);
  await click('undo'); assert.equal(elements.get('notes').children.length,6);
  await click('view-next'); frame(); // View is 4–9 seconds.
  await click('clear-section');
  assert.deepEqual(elements.get('notes').children.map(n=>n.textContent.trim().split(/\s+/)[1]),['0.000000','1.000000','10.000000']);
  await click('undo'); await click('view-next'); frame(); // Final view is 5–10 seconds.
  await click('clear-section');
  assert.deepEqual(elements.get('notes').children.map(n=>n.textContent.trim().split(/\s+/)[1]),['0.000000','1.000000']);
  await click('undo');
  elements.get('zoom').value='all'; elements.get('zoom').listeners.change(); frame();
  await click('clear-section'); assert.equal(elements.get('notes').children.length,0);
  await click('undo'); assert.equal(elements.get('notes').children.length,6);
  elements.get('import').files=[{size:100,text:async()=>JSON.stringify({...chart,notes:[1,1.001,1.0011]})}];
  await elements.get('import').listeners.change();
  assert.equal(elements.get('issues').textContent,'');
  assert.equal(elements.get('save').disabled,false);
  assert.match(elements.get('notes').children[2].textContent,/1.001100/);
  elements.get('zoom').value='0.1'; elements.get('zoom').listeners.change(); frame();
  await click('save'); assert.deepEqual(post.notes,[1,1.001,1.0011]);
  // Keep separate unsaved drafts, reset transport, and save to the selected song.
  elements.get('import').files=[{size:100,text:async()=>JSON.stringify({...chart,notes:[1,1.001,1.0012]})}];
  await elements.get('import').listeners.change();
  const mediumCount=elements.get('notes').children.length;
  const mediumFirst=elements.get('notes').children[0].textContent;
  elements.get('song').value='easy'; await elements.get('song').listeners.change();
  assert.equal(elements.get('notes').children.length,0);
  assert.match(elements.get('notice').textContent,/Blank chart ready/);
  assert.equal(elements.get('save').disabled,true);
  await click('tap'); // Add a first note at the paused position (0 seconds).
  await click('save'); assert.deepEqual(post.notes,[0]);
  assert.equal(postUrl,'/api/chart?song=easy');
  assert.match(elements.get('save').textContent,/Easy/);
  elements.get('song').value='medium'; await elements.get('song').listeners.change();
  assert.equal(elements.get('notes').children.length,mediumCount);
  assert.equal(elements.get('notes').children[0].textContent,mediumFirst);
  assert.equal(elements.get('dirty').textContent,'Unsaved changes');
  assert.match(elements.get('save').textContent,/Medium/);
  elements.get('song').value='hard'; await elements.get('song').listeners.change();
  assert.equal(elements.get('notes').children.length,0);
  assert.match(elements.get('notice').textContent,/strikes you want in Hard/);
  await click('tap'); await click('save');
  assert.equal(postUrl,'/api/chart?song=hard');
  assert.deepEqual(post.notes,[0]);
  assert.match(elements.get('save').textContent,/Hard/);
  elements.get('song').value='medium'; await elements.get('song').listeners.change();
  assert.equal(elements.get('notes').children.length,mediumCount);
  assert.equal(elements.get('dirty').textContent,'Unsaved changes');
  console.log('Passed editor controller: boot, waveform draw, clear, tap, correction, nudge, save, pause, undo, invalid loop.');
})().catch(e=>{console.error(e);process.exitCode=1;});
