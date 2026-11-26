'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = join(__dirname, '..');
const scripts = ['Inbox.gs', 'Queue.gs', 'GitHub.gs'].map(f => readFileSync(join(root, 'email', f), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const account = 'owner@example.test', commit = 'a'.repeat(40), repository = 'pmartin5-gif/HelloWorld';
const token = 'github_pat_' + 'T'.repeat(40), jobId = 'lb-' + hash(account).slice(0,12) + '-a1';
const queueKey = 'LB_QUEUE_JOB_' + jobId;
const plain = value => JSON.parse(JSON.stringify(value));
function initial() {
  const data = {LB_ACTIVE_CONFIG: JSON.stringify({schemaVersion: 1, account}),
    LB_GITHUB_SETUP: JSON.stringify({sourceCommit: commit}), LB_GITHUB_TOKEN: token};
  for (const [id, prompt, time] of [['a1', 'An overflowing heart that keeps giving', '17:00'],
    ['b2', 'A warm light in a blue vessel', '17:01']]) {
    data['LB_MSG_' + id] = JSON.stringify({schemaVersion:1, messageId:id, outcome:'received',
      recordedAt:'2026-11-26T18:00:00.000Z', job:{id:'lb-' + hash(account).slice(0,12) + '-' + id,
        messageId:id, prompt, promptSha256:hash(prompt), receivedAt:'2026-11-26T' + time + ':00.000Z',
        status:'received', buildDispatched:false, published:false, deviceConfirmed:false}});
  }
  return data;
}
function response(code, body = '', headers = {}) {
  return {getResponseCode: () => code, getAllHeaders: () => headers,
    getContentText: () => typeof body === 'string' ? body : JSON.stringify(body)};
}
function runtime(data = initial(), state = {}, options = {}) {
  const calls = [], logs = []; let uuid = state.uuid || 0;
  const q = () => JSON.parse(data[queueKey]);
  const makeRun = () => ({id:1234, workflow_id:7, head_sha:commit, head_branch:'main',
    event:'workflow_dispatch', run_attempt:1, path:'.github/workflows/lightboard-prompt-build.yml',
    repository:{full_name:repository,private:false},
    display_title:'Lightboard queue ' + jobId + ' ' + q().dispatch.id,
    html_url:'https://github.com/' + repository + '/actions/runs/1234',
    status:state.completed ? 'completed' : 'in_progress', conclusion:state.completed ? (state.conclusion || 'success') : null,
    ...state.runOverride});
  const makeReport = () => ({schemaVersion:1, jobId, dispatchId:q().dispatch.id,
    promptSha256:q().promptSha256, runId:'1234',runAttempt:1, commitSha:commit, repository,
    workflowPath:'.github/workflows/lightboard-prompt-build.yml', savedGenerationRunId:'42735010470',
    responseSha256:'ca9f5d73467bb02aab6278c8db4c03d5d643c960e5f2ea7221cea7d6263f1171',
    result:state.conclusion && state.conclusion !== 'success' ? 'failed' : 'built',
    published:false, publicationAbsenceVerified:true, modelRequests:0, automaticUpdates:false, deviceConfirmed:false,
    foundation:'f1244292bbdf180ad5ea8b4ffbf46c72b9772ef8ad2407276ae26e3786132522',
    version:'ota-pilot-'+'b'.repeat(24), sha256:'c'.repeat(64),bytes:1012016,...state.reportOverride});
  const pubCommit='b'.repeat(40);
  const pubRun=()=>({id:5678,workflow_id:8,head_sha:pubCommit,head_branch:'main',event:'workflow_dispatch',
    run_attempt:1,path:'.github/workflows/lightboard-queue-publish.yml',repository:{full_name:repository,private:false},
    display_title:'Lightboard queue '+jobId+' '+q().publicationDispatch.id,
    html_url:'https://github.com/'+repository+'/actions/runs/5678',status:state.pubCompleted?'completed':'in_progress',
    conclusion:state.pubCompleted?(state.pubConclusion||'success'):null,...state.pubRunOverride});
  const pubData=()=>{
    const old=makeReport(),tag='lightboard-ota-5678-1',baseUrl='https://github.com/'+repository+'/releases/download/'+tag+'/';
    const m={schema_version:2,repository,device:'esp32-32x32',channel:'ota-pilot',foundation_id:old.foundation,
      published:true,ota_enabled:true,automatic_updates:false,scene:'generated',
      build:{run_id:'5678',attempt:'1',commit_sha:pubCommit},
      generation:{run_id:'42735010470',response_sha256:old.responseSha256,model_request_in_this_run:false},
      current:{version:old.version,bytes:old.bytes,sha256:old.sha256,url:baseUrl+'firmware.bin',release_tag:tag},
      usb_recovery:{sha256:'d'.repeat(64),bytes:1011840}};
    const raw=JSON.stringify(m,null,2)+'\n';
    const hashes={'firmware.bin':old.sha256,'recovery.bin':'d'.repeat(64),'manifest.json':hash(raw),'SHA256SUMS':'e'.repeat(64)};
    const sizes={'firmware.bin':old.bytes,'recovery.bin':1011840,'manifest.json':Buffer.byteLength(raw),'SHA256SUMS':320};
    const report={schemaVersion:1,operation:'publication',jobId,dispatchId:q().publicationDispatch.id,
      priorBuildRunId:'1234',priorResultSha256:q().dispatch.resultSha256,promptSha256:old.promptSha256,
      runId:'5678',runAttempt:1,commitSha:pubCommit,repository,
      workflowPath:'.github/workflows/lightboard-queue-publish.yml',result:'published',published:true,modelRequests:0,
      automaticUpdates:false,deviceConfirmed:false,foundation:old.foundation,version:old.version,bytes:old.bytes,
      sha256:old.sha256,releaseTag:tag,manifestSha256:hash(raw),firmwareUrl:baseUrl+'firmware.bin',
      feedUrl:'https://raw.githubusercontent.com/'+repository+'/lightboard-feed/manifest.json',
      assetSha256:hashes,assetBytes:sizes,...state.pubReportOverride};
    return {m,raw,report,release:{draft:false,prerelease:true,assets:Object.keys(hashes).map(name=>({name,state:'uploaded',
      size:sizes[name],digest:'sha256:'+hashes[name],browser_download_url:baseUrl+name}))}};
  };
  const store = {getProperty:k => data[k] || null,getProperties:() => ({...data}),
    setProperty(k,v) {
      data[k]=v;
      if (options.crashAfterStatus && k===queueKey && JSON.parse(v).status===options.crashAfterStatus) {
        options.crashAfterStatus=null; throw new Error('private provider detail');
      }
    }, deleteProperty:k => {delete data[k];}};
  function fetch(url, opts) {
    calls.push({url,opts});
    assert.equal(opts.followRedirects,false);
    assert.equal(opts.muteHttpExceptions,true);
    if (url.startsWith('https://logs.blob.core.windows.net/')) {
      assert.equal(opts.headers.Authorization,undefined);
      const line='2026-11-26T18:00:00.0000000Z LB_QUEUE_RESULT: ' + JSON.stringify(
        url.includes('publication')?pubData().report:makeReport());
      return response(200,state.logText===undefined ? line : state.logText);
    }
    assert.ok(url.startsWith('https://api.github.com/repos/'+repository+'/'));
    if (opts.method==='post') {
      if(url.includes('lightboard-queue-publish')){
        assert.equal(q().status,'publication_pending');state.pubPostCount=(state.pubPostCount||0)+1;state.hasPubRun=true;
        if(state.pubPostThrows)throw new Error('lost publication response');
        return response(state.pubPostCode||200,{workflow_run_id:5678});
      }
      assert.equal(q().status,'dispatch_pending'); assert.equal(q().attempt,1);
      state.postCount=(state.postCount || 0)+1; state.hasRun=state.accepted!==false;
      if (state.postThrows) throw new Error('provider might echo '+token);
      return response(state.postCode || 200,state.postBody || {workflow_run_id:1234});
    }
    if (url.endsWith('/commits/main')) {
      assert.equal(opts.headers.Authorization,'Bearer '+token);
      return state.quota ? response(403,'private body',{ 'X-RateLimit-Remaining':'0' }) :
        response(200,{sha:state.head || commit});
    }
    if (url.includes('/contents/')) {
      assert.equal(opts.headers.Authorization,'Bearer '+token);
      if(url.includes('/contents/manifest.json?ref=lightboard-feed')){
        const raw=state.changedFeed?'{}':pubData().raw;
        return response(200,{encoding:'base64',content:Buffer.from(raw).toString('base64'),size:Buffer.byteLength(raw)});
      }
      const file = url.includes('/contents/.github/') ? join(root,'../../.github/workflows/',
        url.includes('lightboard-queue-publish')?'lightboard-queue-publish.yml':'lightboard-prompt-build.yml') :
        join(root,url.includes('queue_publication.py')?'cloud/queue_publication.py':'cloud/queue_binding.py');
      const content=state.badSource ? 'edited' : readFileSync(file,'utf8');
      return response(200,{encoding:'base64',content:Buffer.from(content).toString('base64')});
    }
    assert.equal(opts.headers.Authorization,'Bearer '+token);
    if(url.endsWith('/actions/workflows/lightboard-queue-publish.yml')) return response(200,
      {id:8,path:'.github/workflows/lightboard-queue-publish.yml',state:'active'});
    if(url.endsWith('/actions/runs/5678')) return response(200,pubRun());
    if(url.includes('lightboard-queue-publish.yml/runs?'))return response(200,{workflow_runs:state.hasPubRun?[pubRun()]:[]});
    if(url.includes('/actions/jobs/66/steps/'))return response(302,'',
      {Location:'https://logs.blob.core.windows.net/step?kind=publication'});
    if(url.includes('/actions/runs/5678/attempts/1/jobs'))return response(200,{total_count:1,jobs:[{id:66,run_id:5678,
      name:'compile-and-publish',status:'completed',conclusion:state.pubConclusion||'success',
      steps:[{name:'Record queue result',status:'completed',conclusion:'success',number:11}]}]});
    if(url.includes('/releases/tags/')){
      const release=pubData().release;if(state.badAsset)release.assets[0].digest='sha256:'+'0'.repeat(64);
      return response(200,release);
    }
    if (url.endsWith('/actions/workflows/lightboard-prompt-build.yml')) {
      return response(200,{id:7,path:'.github/workflows/lightboard-prompt-build.yml',state:'active'});
    }
    if (url.includes('/steps/')) return response(302,'',{Location:state.redirect ||
      'https://logs.blob.core.windows.net/step?sig=private'});
    if (url.includes('/attempts/1/jobs')) return response(200,{total_count:1,jobs:[{id:55,run_id:1234,
      name:'generate-and-compile',status:'completed',conclusion:state.conclusion || 'success',
      steps:state.steps || [{name:'Record queue result',status:'completed',conclusion:'success',number:12}]}]});
    if (url.includes('/runs?')) return response(200,{workflow_runs:state.hasRun ?
      [...(state.otherRuns || []),makeRun()] : []});
    if (url.endsWith('/actions/runs/1234')) return response(200,makeRun());
    throw new Error('Unexpected request');
  }
  const context=vm.createContext({console:{log:x=>logs.push(x)},
    PropertiesService:{getScriptProperties:()=>store},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
      getUuid:()=>{state.uuid=++uuid;return uuid.toString(16).padStart(32,'0');},
      newBlob:value=>({getBytes:()=>[...Buffer.from(value)],getDataAsString:()=>Buffer.from(value).toString('utf8')}),
      base64Decode:value=>[...Buffer.from(value,'base64')],
      computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()]},
    UrlFetchApp:{fetch},Gmail:{Users:{getProfile:()=>{throw new Error('No Gmail access in adapter');}}},
    ScriptApp:{newTrigger:()=>{throw new Error('No trigger');}},MailApp:{sendEmail:()=>{throw new Error('No mail');}}});
  scripts.forEach((s,index)=>vm.runInContext(options.legacyQueue && index===1 ?
    s.replace('githubAdapterVersion: 1,','') : s,context));
  return {context,data,state,calls,logs,q,makeRun,makeReport,pubData};
}
function prepared(state={},options={}) {
  const e=runtime(initial(),state,options); e.context.setupQueue(); e.context.syncQueue();
  assert.equal(e.context.setupGitHubConnection().status,'configured'); return e;
}
function dispatch(e) {return e.context.dispatchNextSavedBuild();}

test('connection setup checks pinned source, uses GET only and preserves existing queue/receipts',()=>{
  const e=prepared(); const saved=e.data.LB_GITHUB_ACTIVE;
  assert.equal(e.context.setupGitHubConnection().status,'already_configured');
  assert.equal(e.data.LB_GITHUB_ACTIVE,saved);assert.equal(e.q().attempt,0);
  assert.ok(e.calls.every(c=>c.opts.method==='get'));
  assert.equal(e.logs.join('').includes(token),false);
  const manifest=JSON.parse(readFileSync(join(root,'email/appsscript.json')));
  assert.deepEqual(manifest.oauthScopes,['https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/script.external_request']);
});

test('an older Queue file is refused before any GitHub request or configuration write',()=>{
  const e=runtime(initial(),{}, {legacyQueue:true});e.context.setupQueue();e.context.syncQueue();
  const result=e.context.setupGitHubConnection();
  assert.equal(result.reason,'LB_GH_CONFIG');assert.equal(e.calls.length,0);
  assert.equal(e.data.LB_GITHUB_ACTIVE,undefined);assert.equal(e.q().attempt,0);
});

test('manual dispatch reserves once, binds exact run/commit, and cannot dispatch a second job',()=>{
  const e=prepared(); const receipts=[e.data.LB_MSG_a1,e.data.LB_MSG_b2];
  assert.equal(dispatch(e).status,'building');assert.equal(e.q().dispatch.runId,'1234');
  const post=e.calls.find(c=>c.opts.method==='post'), payload=JSON.parse(post.opts.payload);
  assert.equal(payload.ref,'main');assert.equal(payload.inputs.prompt,'An overflowing heart that keeps giving');
  assert.equal(payload.inputs.publish,'false');assert.equal(payload.inputs.reuse_saved_generation,'true');
  assert.equal(payload.inputs.queue_job_id,jobId);assert.equal(payload.inputs.queue_prompt_sha256,e.q().promptSha256);
  assert.equal(dispatch(runtime(e.data,e.state)).status,'not_dispatched');assert.equal(e.state.postCount,1);
  assert.deepEqual([e.data.LB_MSG_a1,e.data.LB_MSG_b2],receipts);
  const view=e.context.inspectQueue();assert.equal(view.mode,'manual_saved_build');
  assert.equal(view.automaticDispatchEnabled,false);assert.equal(view.items[1].attempt,0);
});

test('changed main or edited workflow source stops before reserving or posting',()=>{
  const e=prepared();e.state.head='b'.repeat(40);
  assert.equal(dispatch(e).reason,'LB_GH_SOURCE');assert.equal(e.q().status,'received');
  assert.equal(e.state.postCount,undefined);
  const bad=runtime(initial(),{badSource:true});bad.context.setupQueue();bad.context.syncQueue();
  assert.equal(bad.context.setupGitHubConnection().reason,'LB_GH_SOURCE');
  assert.equal(bad.data.LB_GITHUB_ACTIVE,undefined);
});

test('setup quota reports only safe authenticated request/reset metadata and retains unstarted jobs',()=>{
  const e=runtime(initial(),{quota:true});e.context.setupQueue();e.context.syncQueue();
  const result=e.context.setupGitHubConnection();
  assert.equal(result.reason,'LB_GH_QUOTA');assert.equal(result.rateLimit.authenticated,true);
  assert.equal(result.rateLimit.requestType,'source_head');assert.equal(result.rateLimit.remaining,0);
  assert.equal(e.q().attempt,0);assert.equal(e.data.LB_GITHUB_ACTIVE,undefined);
  assert.equal(e.state.postCount,undefined);assert.equal(e.logs.join('').includes(token),false);
  const headers={'X-RateLimit-Reset':'1795716000','X-RateLimit-Limit':'5000',
    'X-RateLimit-Remaining':'0','Retry-After':'120'};
  e.context.UrlFetchApp.fetch=()=>response(429,'private provider body '+token,headers);
  const retry=e.context.setupGitHubConnection();
  assert.equal(retry.rateLimit.resetAt,new Date(1795716000*1000).toISOString());
  assert.equal(retry.rateLimit.retryAfterSeconds,120);assert.equal(retry.rateLimit.limit,5000);
  assert.equal(e.logs.join('').includes('private provider'),false);
});

test('lost POST response is reconciled by exact attempt title after restart without another dispatch',()=>{
  const e=prepared({postThrows:true});assert.equal(dispatch(e).status,'dispatch_unknown');
  assert.equal(e.state.postCount,1);assert.equal(e.logs.join('').includes(token),false);
  e.state.otherRuns=[{id:9999,display_title:'unrelated latest workflow'}];
  const restarted=runtime(e.data,e.state);
  assert.equal(dispatch(restarted).status,'not_dispatched');
  assert.equal(restarted.context.pollSavedBuild().status,'building');
  assert.equal(restarted.q().dispatch.runId,'1234');assert.equal(e.state.postCount,1);
  assert.ok(restarted.calls.some(c=>c.url.includes('created=%3E%3D')));
});

test('204 or incomplete responses retain reservation and recover through polling',()=>{
  for(const state of [{postCode:204},{postBody:{}}]){
    const e=prepared(state);assert.equal(dispatch(e).status,'dispatch_unknown');
    assert.equal(runtime(e.data,e.state).context.pollSavedBuild().status,'building');
    assert.equal(e.state.postCount,1);
  }
});

test('persisted reservation and bind-write crashes cannot cause HTTP reissue or erase a saved run',()=>{
  const reserved=prepared({}, {crashAfterStatus:'dispatch_pending'});
  assert.equal(dispatch(reserved).status,'stopped');assert.equal(reserved.q().status,'dispatch_pending');
  const r=runtime(reserved.data,reserved.state);assert.equal(dispatch(r).status,'not_dispatched');
  assert.equal(r.context.pollSavedBuild().status,'awaiting_run');assert.equal(reserved.state.postCount,undefined);
  const bound=prepared({}, {crashAfterStatus:'building'});
  assert.equal(dispatch(bound).status,'stopped');assert.equal(bound.q().status,'building');
  assert.equal(bound.q().dispatch.runId,'1234');assert.equal(bound.state.postCount,1);
});

test('quota before POST pauses without an attempt; quota after POST keeps an uncertain reservation',()=>{
  const e=prepared();e.state.quota=true;assert.equal(dispatch(e).status,'quota_paused');
  assert.equal(e.q().attempt,0);assert.equal(e.state.postCount,undefined);
  e.state.quota=false;assert.equal(e.context.resumeSavedBuildQueue().status,'received');
  assert.equal(dispatch(e).status,'building');
  const posted=prepared({postCode:429,accepted:false});assert.equal(dispatch(posted).status,'dispatch_unknown');
  assert.equal(runtime(posted.data,posted.state).context.pollSavedBuild().status,'awaiting_run');
  assert.equal(posted.state.postCount,1);
});

test('verified result from just the result step completes build-only job and preserves trace',()=>{
  const e=prepared();dispatch(e);e.state.completed=true;
  const restarted=runtime(e.data,e.state);const result=restarted.context.pollSavedBuild();
  assert.equal(result.status,'built');assert.equal(result.modelRequests,0);
  assert.equal(result.published,false);assert.equal(result.deviceConfirmed,false);
  assert.equal(restarted.q().dispatch.workflowJobId,'55');assert.match(result.resultSha256,/^[a-f0-9]{64}$/);
  assert.ok(restarted.calls.some(c=>c.url.endsWith('/actions/jobs/55/steps/12/logs')));
  assert.ok(!restarted.calls.some(c=>/\/actions\/jobs\/55\/logs/.test(c.url)));
  const count=restarted.calls.length;assert.equal(restarted.context.pollSavedBuild().status,'built');
  assert.equal(restarted.calls.length,count);assert.equal(dispatch(restarted).status,'not_dispatched');
  assert.equal(e.state.postCount,1);assert.equal(restarted.context.inspectQueue().items[1].status,'received');
});

test('mismatched job/prompt/commit/attempt/model/publication results cannot complete the queue',()=>{
  for(const change of [{jobId:'wrong'},{dispatchId:'wrong'},{promptSha256:'0'.repeat(64)},
    {commitSha:'b'.repeat(40)},{runId:'5678'},{runAttempt:2},{modelRequests:1},{published:true},
    {deviceConfirmed:true},{responseSha256:'f'.repeat(64)},{foundation:'f'.repeat(64)},
    {publicationAbsenceVerified:false},{bytes:1310721}]){
    const e=prepared();dispatch(e);e.state.completed=true;e.state.reportOverride=change;
    assert.equal(e.context.pollSavedBuild().reason,'LB_GH_RESULT');assert.equal(e.q().status,'building');
    assert.equal(e.q().dispatch.resultSha256,undefined);
  }
});

test('wrong run workflow/ref/nonce/commit/repository or manual rerun never binds result',()=>{
  for(const change of [{workflow_id:8},{head_branch:'other'},{head_sha:'b'.repeat(40)},
    {event:'push'},{run_attempt:2},{display_title:'latest run'}, {repository:{full_name:'other/repo',private:false}}]){
    const e=prepared();dispatch(e);e.state.completed=true;e.state.runOverride=change;
    assert.equal(e.context.pollSavedBuild().reason,'LB_GH_RUN');assert.equal(e.q().status,'building');
  }
});

test('missing/duplicate/oversized logs and untrusted redirects stop without credential forwarding',()=>{
  for(const state of [{steps:[]},{logText:'no result'},
    {logText:'LB_QUEUE_RESULT: {}\nLB_QUEUE_RESULT: {}'}, {logText:'x'.repeat(65537)},
    {redirect:'http://logs.blob.core.windows.net/log'}, {redirect:'https://attacker.test/log'}]){
    const e=prepared();dispatch(e);Object.assign(e.state,state,{completed:true});
    assert.equal(e.context.pollSavedBuild().status,'stopped');assert.equal(e.q().status,'building');
    assert.ok(!e.calls.some(c=>c.url.startsWith('https://attacker.test')));
  }
});

test('bound failure with zero publication evidence finishes failed without an installed claim',()=>{
  const e=prepared();dispatch(e);e.state.completed=true;e.state.conclusion='failure';
  const result=e.context.pollSavedBuild();assert.equal(result.status,'failed');
  assert.equal(result.published,false);assert.equal(result.deviceConfirmed,false);
  assert.equal(e.context.inspectQueue().items[1].attempt,0);
});

test('late verified result can reconcile review hold without a second POST',()=>{
  for(const unknown of [false,true]){
    const e=prepared({postThrows:unknown});dispatch(e);
    const q=e.q();e.context.lbqApplyEvent_(jobId,{id:'timeout',type:'timeout',expectedRevision:q.revision});
    assert.equal(e.q().status,'review_required');e.state.completed=true;
    assert.equal(runtime(e.data,e.state).context.pollSavedBuild().status,'built');
    assert.equal(e.state.postCount,1);
  }
});

test('only approved FIFO saved-heart job is eligible; queued vessel never causes a model request',()=>{
  const e=prepared();const receipt=JSON.parse(e.data.LB_MSG_b2);
  receipt.job.receivedAt='2026-11-26T16:00:00.000Z';e.data.LB_MSG_b2=JSON.stringify(receipt);
  delete e.data['LB_QUEUE_JOB_'+receipt.job.id];
  assert.equal(dispatch(e).reason,'LB_GH_JOB');assert.equal(e.state.postCount,undefined);
});

function publicationReady(state={}){
  const e=prepared(state);dispatch(e);e.state.completed=true;
  assert.equal(e.context.pollSavedBuild().status,'built');
  e.state.head='b'.repeat(40);e.data.LB_PUBLICATION_SETUP=JSON.stringify({sourceCommit:e.state.head});
  assert.equal(e.context.setupPublication().status,'configured');return e;
}
test('publication setup preserves build evidence, old connection pin and receipts without POST',()=>{
  const e=publicationReady();const oldConfig=e.data.LB_GITHUB_ACTIVE,oldBuild=JSON.stringify(e.q().dispatch);
  assert.equal(e.context.setupPublication().status,'already_configured');
  assert.equal(e.state.pubPostCount,undefined);assert.equal(e.data.LB_GITHUB_ACTIVE,oldConfig);
  assert.equal(JSON.stringify(e.q().dispatch),oldBuild);assert.equal(e.q().status,'built');
});
test('publication reserves once before POST, survives lost response and binds only publication run',()=>{
  const e=publicationReady({pubPostThrows:true});const oldBuild=JSON.stringify(e.q().dispatch);
  assert.equal(e.context.publishApprovedBuild().status,'publication_unknown');
  const restarted=runtime(e.data,e.state);
  assert.equal(restarted.context.publishApprovedBuild().dispatchRepeated,false);
  assert.equal(restarted.context.pollPublication().status,'publishing');
  assert.equal(e.state.pubPostCount,1);assert.equal(e.q().publicationDispatch.runId,'5678');
  assert.equal(JSON.stringify(e.q().dispatch),oldBuild);
  assert.equal(restarted.context.pollSavedBuild().nextAction,'pollPublication');
});
test('published result requires exact prior image plus feed/release digests; holds later board work',()=>{
  const e=publicationReady();e.context.publishApprovedBuild();e.state.pubCompleted=true;
  const result=runtime(e.data,e.state).context.pollPublication();
  assert.equal(result.status,'published');assert.equal(result.deviceConfirmed,false);assert.equal(result.modelRequests,0);
  const view=e.context.inspectQueue();assert.equal(view.inFlightJobId,jobId);assert.equal(view.items[1].attempt,0);
  assert.equal(view.items[0].published,true);assert.equal(e.state.pubPostCount,1);
  assert.equal(e.context.pollPublication().status,'published');
  assert.throws(()=>e.context.lbqApplyEvent_('lb-'+hash(account).slice(0,12)+'-b2',
    {id:'later',type:'reserve_dispatch',expectedRevision:1}),/Queue stopped/);
});
test('wrong publication provenance, image, current feed or server digest never completes queue',()=>{
  for(const bad of [{pubReportOverride:{priorResultSha256:'0'.repeat(64)}},
    {pubReportOverride:{sha256:'0'.repeat(64)}},{pubReportOverride:{modelRequests:1}},
    {pubReportOverride:{deviceConfirmed:true}},{changedFeed:true},{badAsset:true},
    {pubRunOverride:{head_sha:'c'.repeat(40)}}]){
    const e=publicationReady();e.context.publishApprovedBuild();Object.assign(e.state,bad,{pubCompleted:true});
    assert.equal(e.context.pollPublication().status,'stopped');assert.equal(e.q().status,'publishing');
    assert.equal(e.q().publication,null);
  }
});
test('failed or uncertain publication retains a durable review hold without claiming unpublished',()=>{
  const e=publicationReady();e.context.publishApprovedBuild();e.state.pubCompleted=true;e.state.pubConclusion='failure';
  const result=e.context.pollPublication();assert.equal(result.status,'review_required');
  assert.equal(result.publicationConfirmed,false);assert.equal(result.published,undefined);
  assert.equal(e.context.inspectQueue().inFlightJobId,jobId);
  assert.equal(e.context.publishApprovedBuild().dispatchRepeated,false);assert.equal(e.state.pubPostCount,1);
});
test('late verified publication reconciles review hold but never confirms installation',()=>{
  const e=publicationReady();e.context.publishApprovedBuild();
  e.context.lbqApplyEvent_(jobId,{id:'pub-timeout',type:'timeout',expectedRevision:e.q().revision});
  e.state.pubCompleted=true;assert.equal(runtime(e.data,e.state).context.pollPublication().status,'published');
  assert.equal(e.q().deviceConfirmed,false);assert.equal(e.state.pubPostCount,1);
});
