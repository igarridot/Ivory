import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';

const {values}=parseArgs({options:{cdp:{type:'string',default:'http://127.0.0.1:9227'},url:{type:'string',default:'http://127.0.0.1:5173/'}}});
async function connect(url){
  const socket=new WebSocket(url);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let id=0;const pending=new Map(),exceptions=[];
  socket.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(new Error(d.error.message)):p.resolve(d.result);}if(d.method==='Runtime.exceptionThrown')exceptions.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);};
  return {socket,exceptions,send:(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));})};
}
const version=await(await fetch(values.cdp+'/json/version')).json(),browser=await connect(version.webSocketDebuggerUrl);
const {browserContextId}=await browser.send('Target.createBrowserContext',{disposeOnDetach:true});
let page;
try{
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId});
  const targets=await(await fetch(values.cdp+'/json/list')).json();page=await connect(targets.find(t=>t.id===targetId).webSocketDebuggerUrl);
  const send=page.send;
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const until=async expression=>{for(let i=0;i<240;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out: '+expression+' '+JSON.stringify(await evaluate(`({status:document.querySelector('#practice-status')?.textContent,toast:document.querySelector('#toast')?.textContent,visibility:document.visibilityState,focus:document.hasFocus(),stats:window.audioQa})`)));};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const saved=()=>evaluate(`JSON.parse(localStorage.getItem('ivory.personal.v1'))`);
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.audioQa={starts:0,active:0,oscillators:0,cancelledFuture:0};
    const base=BaseAudioContext.prototype,originalSource=base.createBufferSource,originalOscillator=base.createOscillator;
    base.createBufferSource=function(){
      const source=originalSource.call(this);if(!(this instanceof AudioContext))return source;
      const context=this,start=source.start.bind(source),stop=source.stop.bind(source);let startTime=0;
      source.start=(when=context.currentTime,...args)=>{startTime=when;window.audioQa.starts++;window.audioQa.active++;start(when,...args);};
      source.stop=(when=context.currentTime)=>{if(when<startTime)window.audioQa.cancelledFuture++;stop(when);};
      source.addEventListener('ended',()=>window.audioQa.active--);return source;
    };
    base.createOscillator=function(){if(this instanceof AudioContext)window.audioQa.oscillators++;return originalOscillator.call(this);};
    const input={id:'test-piano',name:'Simulated piano',state:'connected',open:async()=>{},close:async()=>{}};
    window.audioQaInput=input;
    Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>({inputs:new Map([[input.id,input]]),outputs:new Map()})});
  `});
  await send('Page.bringToFront');await send('Page.navigate',{url:values.url});await until('!!document.querySelector("h1")');
  await click('[data-song="five"]');await until('!!document.querySelector("#roll")');
  await click('#play-button');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"a",bubbles:true}));document.dispatchEvent(new KeyboardEvent("keyup",{key:"a",bubbles:true}))');
  await click('#play-button');
  const before=await saved();await click('[data-action="demo"]');
  await until('document.querySelector("#practice-status").textContent==="Demostración · no puntúa"');
  await until('window.audioQa.starts>0');
  assert.equal(await evaluate('window.audioQa.oscillators'),0);
  await click('#play-button');await until('window.audioQa.active===0');
  const {updated:previousUpdate,...previousCheckpoint}=before.checkpoints.five;
  const {updated:currentUpdate,...currentCheckpoint}=(await saved()).checkpoints.five;
  assert.deepEqual(currentCheckpoint,previousCheckpoint);
  assert.deepEqual((await saved()).sessions,before.sessions);
  console.log('PASS real sampled demonstration, no synthesized tones, stop and unchanged progress');

  const starts=await evaluate('window.audioQa.starts');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"a",bubbles:true}))');
  await until(`window.audioQa.starts>${starts}`);
  await evaluate('document.dispatchEvent(new KeyboardEvent("keyup",{key:"a",bubbles:true}))');
  await until('window.audioQa.active===0');
  console.log('PASS virtual keyboard plays and releases a recorded piano note');

  await click('[data-route="learn"]');await click('[data-lesson="ear-intervals"]');
  const lessonStarts=await evaluate('window.audioQa.starts');await click('[data-action="listen-lesson"]');
  await until(`window.audioQa.starts===${lessonStarts+2}`);
  await click('[data-route="learn"]');await until('window.audioQa.active===0');
  assert.ok(await evaluate('window.audioQa.cancelledFuture>0'));
  console.log('PASS ear-training example uses piano and navigation cancels future notes');

  await click('[data-route="connection"]');await click('[data-action="request-midi"]');
  await until('!!window.audioQaInput.onmidimessage');
  const midiStarts=await evaluate('window.audioQa.starts');
  await evaluate('window.audioQaInput.onmidimessage({data:[144,60,90]});window.audioQaInput.onmidimessage({data:[128,60,0]})');
  assert.equal(await evaluate('window.audioQa.starts'),midiStarts);
  console.log('PASS physical MIDI input does not duplicate the piano sound in the browser');

  await click('[data-route="library"]');await click('[data-song="five"]');
  await evaluate(`(async()=>{const {GrandPiano}=await import('./piano-audio.js');window.originalPianoLoad=GrandPiano.prototype.load;GrandPiano.prototype.load=function(){const self=this;return new Promise(resolve=>{window.finishPianoLoad=()=>resolve(window.originalPianoLoad.call(self));});};})()`);
  const cancelledStarts=await evaluate('window.audioQa.starts');await click('[data-action="demo"]');
  await until('typeof window.finishPianoLoad==="function"');await click('[data-route="learn"]');
  await evaluate(`(async()=>{const {GrandPiano}=await import('./piano-audio.js');GrandPiano.prototype.load=window.originalPianoLoad;window.finishPianoLoad();await new Promise(r=>setTimeout(r,100));})()`);
  assert.equal(await evaluate('window.audioQa.starts'),cancelledStarts);
  assert.equal(await evaluate('document.querySelectorAll(".unit-card").length'),40);
  console.log('PASS navigating during audio loading prevents playback from starting afterwards');

  await evaluate('navigator.serviceWorker.ready');await until('!!navigator.serviceWorker.controller');
  assert.equal(await evaluate(`(async()=>{const cache=await caches.open('ivory-v4');return (await cache.keys()).filter(r=>new URL(r.url).pathname.endsWith('.mp3')).length})()`),30);
  assert.equal(await evaluate(`(async()=>{const r=await fetch('./audio/salamander/C4.mp3');return r.headers.get('content-type');})()`),'audio/mpeg');
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.reload');await until('!!document.querySelector("h1")');
  await click('[data-route="library"]');await click('[data-song="five"]');await click('[data-action="demo"]');
  await until('window.audioQa.starts>0');await click('#play-button');await until('window.audioQa.active===0');
  console.log('PASS first audio load after an offline reload uses all 30 locally cached recordings');

  const rendered=await evaluate(`(async()=>{
    const {GrandPiano}=await import('./piano-audio.js'),context=new OfflineAudioContext(2,44100*3,44100),piano=new GrandPiano(context);
    await piano.load();
    for(const buffer of piano.buffers.values())if(!buffer.duration||!buffer.getChannelData(0).some(n=>Math.abs(n)>0.0001))throw Error('Empty recording');
    for(const pitch of [48,55,60,64,67,72,76,79])piano.play(pitch,1,110,0);
    const audio=await context.startRendering(),channel=audio.getChannelData(0);
    let peak=0,energy=0,tail=0;
    for(let i=0;i<channel.length;i++){peak=Math.max(peak,Math.abs(channel[i]));energy+=channel[i]**2;if(i>44100*2)tail=Math.max(tail,Math.abs(channel[i]));}
    const silentContext=new OfflineAudioContext(2,44100,44100),cancelled=new GrandPiano(silentContext);cancelled.buffers=new Map(piano.buffers);
    cancelled.play(60,.5,90,.4);cancelled.allNotesOff();
    const silent=await silentContext.startRendering();let cancelledPeak=0;for(const value of silent.getChannelData(0))cancelledPeak=Math.max(cancelledPeak,Math.abs(value));
    return {samples:piano.buffers.size,peak,rms:Math.sqrt(energy/channel.length),tail,cancelledPeak};
  })()`);
  assert.equal(rendered.samples,30);assert.ok(rendered.peak>.01&&rendered.peak<.99,JSON.stringify(rendered));
  assert.ok(rendered.rms>.001);assert.ok(rendered.tail<.0001);assert.equal(rendered.cancelledPeak,0);
  console.log('PASS real MP3 decoding, audible non-clipping chord and sample-accurate cancellation: '+JSON.stringify(rendered));
  assert.deepEqual(page.exceptions,[]);console.log('PASS no uncaught browser errors');
}finally{
  await browser.send('Target.disposeBrowserContext',{browserContextId});page?.socket.close();browser.socket.close();
}
