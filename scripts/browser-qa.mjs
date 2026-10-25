import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';

const {values}=parseArgs({options:{cdp:{type:'string',default:'http://127.0.0.1:9227'},url:{type:'string',default:'http://127.0.0.1:5173/'},sample:{type:'string'},artifacts:{type:'string',default:resolve(tmpdir(),'ivory-browser-qa')}}});
async function connect(url){
  const socket=new WebSocket(url);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let id=0;const pending=new Map(),exceptions=[];
  socket.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(new Error(d.error.message)):p.resolve(d.result);}if(d.method==='Runtime.exceptionThrown')exceptions.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);};
  return {socket,exceptions,send:(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));})};
}
const version=await(await fetch(values.cdp+'/json/version')).json();
const browser=await connect(version.webSocketDebuggerUrl);
const {browserContextId}=await browser.send('Target.createBrowserContext',{disposeOnDetach:true});
let page;
try{
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId});
  const targets=await(await fetch(values.cdp+'/json/list')).json();
  page=await connect(targets.find(t=>t.id===targetId).webSocketDebuggerUrl);
  const send=page.send;
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out: '+expression);};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const change=(selector,value)=>evaluate(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));}`);
  const press=k=>evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)},bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{key:${JSON.stringify(k)},bubbles:true}));`);
  const saved=()=>evaluate(`JSON.parse(localStorage.getItem('ivory.personal.v1'))`);
  const screenshot=async name=>{await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const r=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(values.artifacts,name+'.png'),Buffer.from(r.data,'base64'));};
  await mkdir(values.artifacts,{recursive:true});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:values.url});await until('!!document.querySelector("h1")');
  if(await evaluate('document.documentElement.dataset.theme')!=='dark')await click('[data-action="theme"]');
  assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()"),'#141e19');
  await screenshot('dark-home');await send('Page.reload');await until('!!document.querySelector("h1")');
  assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
  await click('[data-action="theme"]');assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');await screenshot('light-home');await click('[data-action="theme"]');
  console.log('PASS light/dark switching, calculated palette and persistence');

  await click('[data-song="five"]');await click('#play-button');await press('a');
  assert.equal((await saved()).checkpoints.five.correct,1);
  await click('[data-action="demo"]');await click('#play-button');assert.equal((await saved()).checkpoints.five.correct,1);
  await send('Page.reload');await until('!!document.querySelector("#score-count")');
  assert.match(await evaluate('document.querySelector("#score-count").textContent'),/^1/);
  await click('#play-button');for(const key of ['s','d','f','g','f','d','s','a','a','d','d','s','s','a','a'])await press(key);
  assert.equal((await saved()).sessions[0].coverage,100);await click('[data-action="finish-home"]');
  console.log('PASS existing practice, exact checkpoint, demonstration and completed result');

  await click('[data-route="library"]');await click('[data-reset-song="five"]');await click('[data-action="close-dialog"]');
  assert.equal((await saved()).best.five,100);
  await click('[data-reset-song="five"]');await click('[data-action="apply-progress-reset"]');
  assert.equal((await saved()).best.five,undefined);assert.equal((await saved()).sessions.filter(s=>s.songId==='five').length,0);
  console.log('PASS per-song reset and cancellation');

  await click('[data-route="learn"]');assert.equal(await evaluate('document.querySelectorAll(".unit-card").length'),40);
  assert.equal(await evaluate('document.querySelectorAll(".stage-header").length'),8);
  await change('#learn-stage','7');assert.equal(await evaluate('document.querySelectorAll(".unit-card").length'),5);
  await click('[data-lesson="recording-review"]');assert.equal(await evaluate('document.querySelectorAll(".lesson-lab li").length'),3);
  await click('[data-answer="2"]');await click('[data-action="complete-lesson"]');assert.ok((await saved()).lessons.includes('recording-review'));
  await click('[data-reset-lesson="recording-review"]');await click('[data-action="apply-progress-reset"]');
  assert.ok(!(await saved()).lessons.includes('recording-review'));
  await click('[data-lesson="recording-review"]');await click('[data-answer="2"]');await click('[data-action="complete-lesson"]');
  await screenshot('dark-curriculum');
  console.log('PASS all curriculum stages, advanced lab and quiz persistence');

  await click('[data-route="library"]');await click('[data-tab="original"]');await change('#stage-filter','7');
  assert.equal(await evaluate('document.querySelectorAll("#library-grid .song-card").length'),5);
  await click('[data-song="drill-recording-review"]');assert.ok(await evaluate('!!document.querySelector(".exercise-brief")'));
  await screenshot('dark-advanced-study');
  await click('[data-route="library"]');await click('[data-tab="catalog"]');
  assert.equal(await evaluate('document.querySelector("#catalog-count").textContent'),'69 resultados');
  assert.equal(await evaluate('document.querySelectorAll("#library-grid .song-card").length'),18);
  const first=await evaluate('document.querySelector("#library-grid [data-song]").dataset.song');await click('[data-action="next-page"]');
  assert.notEqual(await evaluate('document.querySelector("#library-grid [data-song]").dataset.song'),first);
  await evaluate(`{const e=document.querySelector('#search');e.value='moonlight';e.dispatchEvent(new Event('input',{bubbles:true}));}`);
  assert.ok(await evaluate('document.querySelectorAll("#library-grid .song-card").length>=2'));
  await screenshot('dark-library');
  console.log('PASS catalog count, pagination, stage filtering and search');

  const sample=values.sample||resolve('dist/scores/Sonate_No._14_Moonlight_1st_Movement.mxl');
  const file=await readFile(sample);
  const existing=await(await fetch(values.url+'api/scores')).json();const existingIds=new Set(existing.scores.map(s=>s.id));
  await click('[data-tab="original"]');await change('#stage-filter','7');await click('[data-action="import"]');
  assert.ok(await evaluate('document.querySelector("#score-file").accept.includes(".mxl")'));
  await evaluate(`{const bytes=Uint8Array.from(atob(${JSON.stringify(file.toString('base64'))}),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],${JSON.stringify(basename(sample))}));const input=document.querySelector('#score-file');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await until('!!document.querySelector("[data-action=confirm-import]")');await click('[data-action="confirm-import"]');
  await until('!document.querySelector("#dialog").open');
  const progress=await saved();assert.equal(progress.imports.length,0);
  const library=await(await fetch(values.url+'api/scores')).json(),uploaded=library.scores.find(s=>!existingIds.has(s.id));
  assert.ok(uploaded&&uploaded.notes.length>1000);assert.match(uploaded.title,/Moonlight/i);
  const original=Buffer.from(await(await fetch(new URL(uploaded.original.url,values.url))).arrayBuffer());assert.deepEqual(original,file);
  await click('[data-song="'+uploaded.id+'"]');assert.ok(await evaluate('!!document.querySelector("#roll")'));await screenshot('dark-moonlight');
  console.log('PASS actual MXL upload to filesystem, original download and playable Moonlight');

  const results=await evaluate(`(async()=>{const {importScore}=await import('./import.js');const {scores}=await(await fetch('./scores/manifest.json')).json();const results=[];for(const score of scores){try{const response=await fetch(score.fileUrl);if(!response.ok)throw Error('HTTP '+response.status);const parsed=importScore(await response.arrayBuffer(),score.file);if(!parsed.notes.length||!parsed.barStarts.length||parsed.notes.some(n=>!Number.isFinite(n.beat)||n.beat<0))throw Error('Invalid notes');results.push({id:score.id,file:score.file,notes:parsed.notes.length,bars:parsed.barStarts.length,warnings:parsed.warnings});}catch(e){results.push({file:score.file,error:e.message});}}return results;})()`);
  assert.equal(results.length,69);assert.deepEqual(results.filter(r=>r.error),[]);await writeFile(resolve(values.artifacts,'library-validation.json'),JSON.stringify(results,null,2));
  console.log('PASS 69/69 bundled MXL scores with valid timelines');

  await click('[data-route="library"]');await click('[data-tab="catalog"]');
  await evaluate(`{const e=document.querySelector('#search');e.value='Toccata';e.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await click('#library-grid [data-song]');await until('!!document.querySelector("[data-action=adapt-range]")');
  await click('[data-action="adapt-range"]');
  assert.match(await evaluate('document.querySelector(".notice.warm").textContent'),/se trasladan/);
  console.log('PASS explicit adaptation for notes outside the AP-300 range');
  await click('[data-route="library"]');await click('[data-tab="mine"]');
  await evaluate(`{const e=document.querySelector('#search');e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await click('#library-grid [data-song]');

  await send('Emulation.setDeviceMetricsOverride',{width:1194,height:834,deviceScaleFactor:1,mobile:true});await screenshot('dark-ipad');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('dark-phone');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.equal(await evaluate('document.querySelector("#roll").clientWidth'),await evaluate('document.querySelector("#keyboard").clientWidth'));
  console.log('PASS tablet/phone layouts and note-to-key alignment');

  await evaluate('navigator.serviceWorker.ready.then(()=>true)');await until('!!navigator.serviceWorker.controller');
  assert.equal(await evaluate(`(async()=>{const cache=await caches.open('ivory-v3');return (await cache.keys()).filter(r=>new URL(r.url).pathname.endsWith('.mxl')).length})()`),69);
  await send('Network.enable');await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.reload');await until('!!document.querySelector("#roll")');
  await click('[data-route="library"]');await click('[data-tab="catalog"]');
  assert.equal(await evaluate('document.querySelector("#catalog-count").textContent'),'69 resultados');
  await click('#library-grid [data-song]');await until('!!document.querySelector("#roll")');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  console.log('PASS cached offline reload and opening an included score without network');

  const legacyId='import-legacy-'+Date.now();
  await click('[data-route="connection"]');
  await evaluate(`{const state=JSON.parse(localStorage.getItem('ivory.personal.v1'));const legacy=${JSON.stringify(uploaded)};legacy.id=${JSON.stringify(legacyId)};delete legacy.original;delete legacy.storedOnServer;state.imports=[legacy];state.checkpoints[legacy.id]={options:{mode:'wait',hand:'both',mapping:'none',bpm:60,from:1,to:1,split:60},hits:[0],misses:[],correct:1,wrong:0,beat:0,seconds:1};state.goal=120;state.breakMinutes=30;state.latency=20;localStorage.setItem('ivory.personal.v1',JSON.stringify(state));}`);
  await send('Page.reload');await until(`!!document.querySelector('#connection-status') && JSON.parse(localStorage.getItem('ivory.personal.v1')).imports.length===0 && !!JSON.parse(localStorage.getItem('ivory.personal.v1')).checkpoints[${JSON.stringify(legacyId)}]`);
  assert.equal((await saved()).imports.length,0);assert.equal((await saved()).checkpoints[legacyId].correct,1);
  const migrated=(await(await fetch(values.url+'api/scores')).json()).scores.find(s=>s.id===legacyId);assert.ok(migrated?.normalizedOnly);
  console.log('PASS migration of previous browser imports without losing their checkpoints');

  await click('[data-route="connection"]');await click('[data-action="reset-global"]');await click('[data-action="close-dialog"]');
  assert.ok((await saved()).lessons.includes('recording-review'));
  await click('[data-action="reset-global"]');await click('[data-action="apply-progress-reset"]');
  const reset=await saved();assert.deepEqual([reset.lessons,reset.sessions,reset.checkpoints,reset.best,reset.daySeconds],[[],[],{},{},{}]);
  assert.equal(reset.goal,120);assert.equal(reset.breakMinutes,30);assert.equal(reset.latency,20);
  assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
  assert.ok((await(await fetch(values.url+'api/scores')).json()).scores.some(s=>s.id===uploaded.id));
  await screenshot('dark-global-reset');
  console.log('PASS global reset and cancellation preserve uploaded originals and preferences');
  assert.deepEqual(page.exceptions,[]);console.log('PASS no uncaught browser errors');
  console.log('Artifacts: '+values.artifacts);
}finally{
  await browser.send('Target.disposeBrowserContext',{browserContextId});
  page?.socket.close();browser.socket.close();
}
