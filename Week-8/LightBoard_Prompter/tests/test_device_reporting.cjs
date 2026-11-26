'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), crypto=require('node:crypto');
const {readFileSync}=require('node:fs'), {join}=require('node:path'), vm=require('node:vm');
const now=Date.parse('2026-11-26T23:40:00Z'), key='a'.repeat(64);
function environment(initial={}) {
  const data={LB_REPORT_KEY:key,...initial};
  const store={getProperty:k=>data[k]||null,setProperty:(k,v)=>{data[k]=v;},getProperties:()=>({...data})};
  const utility={Charset:{UTF_8:'utf8'},getUuid:()=>crypto.randomUUID(),
    computeHmacSha256Signature:(p,k)=>[...crypto.createHmac('sha256',k).update(p).digest()]};
  const ctx=vm.createContext({Utilities:utility,console:{log(){}},Date:class extends Date{static now(){return now;}},
    PropertiesService:{getScriptProperties:()=>store}});
  vm.runInContext(readFileSync(join(__dirname,'../reporting/Receiver.gs'),'utf8'),ctx);
  const sign=value=>{const payload=JSON.stringify(value);return {payload,signature:crypto.createHmac('sha256',key).update(payload).digest('hex')};};
  const report={schemaVersion:1,action:'installed',boardId:'lightboard-main',reportedAt:now/1000,
    nonce:'b'.repeat(32),version:'ota-pilot-'+'c'.repeat(24),foundation:'d'.repeat(64),sha256:'e'.repeat(64),
    bytes:1000000,healthy:true,otaState:2};
  return {data,store,ctx,sign,report,utility};
}
test('receiver authenticates healthy installation; replay never refreshes its timestamp',()=>{
  const h=environment(), envelope=h.sign(h.report);
  const first=h.ctx.lbrHandle_(envelope,h.store,now), saved=h.data.LB_LATEST_REPORT;
  assert.equal(first.ok,true);
  const replay=h.ctx.lbrHandle_(envelope,h.store,now+1000);
  assert.equal(replay.duplicate,true);assert.equal(h.data.LB_LATEST_REPORT,saved);
  const status=h.sign({schemaVersion:1,action:'status',boardId:'lightboard-main',reportedAt:now/1000,nonce:'f'.repeat(32)});
  assert.equal(h.ctx.lbrHandle_(status,h.store,now).report.sha256,h.report.sha256);
});
test('receiver refuses forged, stale, unhealthy and mismatched-board reports without writes',()=>{
  for(const change of [{signature:'0'.repeat(64)},{reportedAt:now/1000-301},{healthy:false},
    {otaState:1},{boardId:'other'},{extra:'unexpected'},{bytes:2000000}]) {
    const h=environment(), candidate={...h.report,...change};delete candidate.signature;
    const envelope=h.sign(candidate);if(change.signature)envelope.signature=change.signature;
    assert.throws(()=>h.ctx.lbrHandle_(envelope,h.store,now));assert.equal(h.data.LB_LATEST_REPORT,undefined);
  }
  const h=environment();h.ctx.lbrHandle_(h.sign(h.report),h.store,now);
  assert.throws(()=>h.ctx.lbrHandle_(h.sign({...h.report,reportedAt:h.report.reportedAt-1}),h.store,now));
});
test('private reader matches exact published firmware once; wrong hash cannot confirm another job',()=>{
  const h=environment(), config={schemaVersion:1,boardId:'lightboard-main',key,url:'https://script.google.com/macros/s/'+'x'.repeat(40)+'/exec'};
  h.data.LB_DEVICE_REPORT_CONNECTION=JSON.stringify(config);
  h.ctx.lbrHandle_(h.sign(h.report),h.store,now);
  const result={jobId:'lb-123456789abc-a',version:h.report.version,foundation:h.report.foundation,sha256:h.report.sha256,bytes:h.report.bytes};
  h.data.LB_EMAIL_PUBLISHED_a=JSON.stringify({result});
  h.data.LB_EMAIL_PUBLISHED_b=JSON.stringify({result:{...result,jobId:'lb-123456789abc-b',sha256:'0'.repeat(64)}});
  Object.assign(h.ctx,{LBAUTO:{completedPrefix:'LB_EMAIL_PUBLISHED_'},lbaRequire_:(ok,code)=>{if(!ok)throw Error(code);},
    lbSet:(store,snapshot,k,v)=>{store.setProperty(k,JSON.stringify(v));snapshot[k]=JSON.stringify(v);},
    UrlFetchApp:{fetch:(url,options)=>{
      assert.equal(url,config.url);const body=JSON.parse(options.payload);
      const answer=h.ctx.lbrHandle_(body,h.store,now);
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(answer)};
    }}});
  vm.runInContext(readFileSync(join(__dirname,'../email/DeviceReports.gs'),'utf8'),h.ctx);
  h.ctx.lbdrRefresh_(h.store,h.store.getProperties());
  const installed=h.data['LB_DEVICE_INSTALLED_'+result.jobId];assert.ok(installed);
  assert.equal(h.data['LB_DEVICE_INSTALLED_lb-123456789abc-b'],undefined);
  assert.equal(h.ctx.lbdrDelivery_(h.data,result.jobId).status,'installed');
  assert.equal(h.ctx.lbdrDelivery_(h.data,'lb-123456789abc-b').deviceConfirmed,false);
  h.ctx.lbdrRefresh_(h.store,h.store.getProperties());assert.equal(h.data['LB_DEVICE_INSTALLED_'+result.jobId],installed);
});

test('maintenance publication tracking verifies completed run and feed without claiming installation',()=>{
  const h=environment();h.data.LB_RUNTIME_UPDATE_RUN_ID='321';
  const state={mode:'continuous',active:false}, sha='a'.repeat(40);
  const manifest={schema_version:2,repository:'pmartin5-gif/HelloWorld',published:true,automatic_updates:true,
    foundation_id:h.report.foundation,build:{run_id:'321',commit_sha:sha},current:{version:h.report.version,
      sha256:h.report.sha256,bytes:h.report.bytes,
      url:'https://github.com/pmartin5-gif/HelloWorld/releases/download/lightboard-ota-321-1/firmware.bin'}};
  const run={id:321,status:'completed',conclusion:'success',run_attempt:1,event:'workflow_dispatch',
    head_branch:'main',head_sha:sha,repository:{full_name:'pmartin5-gif/HelloWorld'},
    path:'.github/workflows/lightboard-runtime-update.yml',html_url:'https://github.com/pmartin5-gif/HelloWorld/actions/runs/321'};
  Object.assign(h.utility,{base64Decode:text=>Buffer.from(text,'base64'),newBlob:bytes=>({getDataAsString:()=>bytes.toString()})});
  Object.assign(h.ctx,{LBGH:{repository:'pmartin5-gif/HelloWorld'},
    LBAUTO:{completedPrefix:'LB_EMAIL_PUBLISHED_',foundation:h.report.foundation,deliveryIntervalMs:360000},
    lbaLocked_:fn=>fn(h.store,h.store.getProperties()),lbaState_:()=>state,
    lbaRequire_:(ok,code)=>{if(!ok)throw Error(code);},lbaSave_:()=>{},lbaReport_:()=>({deviceConfirmed:false}),
    lbSet:(store,snapshot,k,v)=>{store.setProperty(k,JSON.stringify(v));snapshot[k]=JSON.stringify(v);},
    lbghGet_:(snapshot,path)=>path.startsWith('/actions/')?run:path==='/commits/main'?{sha}:
      {encoding:'base64',size:1000,content:Buffer.from(JSON.stringify(manifest)).toString('base64')}});
  vm.runInContext(readFileSync(join(__dirname,'../email/DeviceReports.gs'),'utf8'),h.ctx);
  assert.equal(h.ctx.trackRuntimeUpdatePublication().deviceConfirmed,false);
  const saved=h.data['LB_EMAIL_PUBLISHED_lb-runtime-321'];
  assert.equal(JSON.parse(saved).result.modelRequests,0);
  assert.equal(state.lastPublished.version,manifest.current.version);
  manifest.published=false;
  assert.throws(()=>h.ctx.trackRuntimeUpdatePublication());
  assert.equal(h.data['LB_EMAIL_PUBLISHED_lb-runtime-321'],saved);
  assert.equal(h.data['LB_DEVICE_INSTALLED_lb-runtime-321'],undefined);
});
