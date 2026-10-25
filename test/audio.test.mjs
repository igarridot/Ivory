import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GrandPiano, PIANO_SAMPLES, sampleForPitch } from '../dist/piano-audio.js';

class Param {
  constructor(){this.value=0;this.events=[];}
  setValueAtTime(value,time){this.events.push(['set',value,time]);}
  linearRampToValueAtTime(value,time){this.events.push(['ramp',value,time]);}
  cancelScheduledValues(time){this.events=this.events.filter(e=>e[2]<time);}
}
class Node {
  connect(node){return node;}
  disconnect(){this.disconnected=true;}
}
class AudioContext {
  constructor(){this.currentTime=0;this.destination=new Node();this.sources=[];}
  createGain(){return Object.assign(new Node(),{gain:new Param()});}
  createDynamicsCompressor(){return Object.assign(new Node(),Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,new Param()])));}
  createBufferSource(){
    const source=Object.assign(new Node(),{playbackRate:new Param(),stops:[],start(time){this.startTime=time;},stop(time){this.stops.push(time);}});
    this.sources.push(source);return source;
  }
  async decodeAudioData(){return {duration:10};}
}
const response=()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(16)});
function loadedPiano(options){
  const context=new AudioContext(),piano=new GrandPiano(context,options);
  for(const sample of PIANO_SAMPLES)piano.buffers.set(sample.pitch,{duration:10});
  return {context,piano};
}

test('all grand piano recordings match their provenance manifest and retain their license',async()=>{
  const root=new URL('../dist/audio/salamander/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
  assert.equal(manifest.author,'Alexander Holm');assert.equal(manifest.license,'CC BY 3.0');
  assert.equal(manifest.samples.length,30);
  assert.equal((await readdir(root)).filter(file=>file.endsWith('.mp3')).length,30);
  for(const sample of PIANO_SAMPLES){
    const entry=manifest.samples.find(s=>s.pitch===sample.pitch),bytes=await readFile(new URL(sample.file,root));
    assert.equal(entry.file,sample.file);assert.equal(bytes.length,entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  }
  assert.match(await readFile(new URL('LICENSE.txt',root),'utf8'),/Attribution 3.0 Unported/);
  assert.match(await readFile(new URL('README.txt',root),'utf8'),/Alexander Holm/);
});

test('all 88 piano keys use a recording at most one semitone away and preserve concert pitch',()=>{
  for(let pitch=21;pitch<=108;pitch++)assert.ok(Math.abs(sampleForPitch(pitch).pitch-pitch)<=1);
  assert.equal(sampleForPitch(0).pitch,21);assert.equal(sampleForPitch(127).pitch,108);
  for(const pitch of [-1,128,60.5,NaN])assert.throws(()=>sampleForPitch(pitch),RangeError);
  const {piano}=loadedPiano(),voice=piano.play(61,.8,80);
  assert.equal(voice.source.buffer,piano.buffers.get(60));
  assert.equal(voice.source.playbackRate.value,2**(1/12));
  assert.equal(piano.play(69,.8,80).source.playbackRate.value,1);
});

test('concurrent piano requests share one load and reuse decoded recordings',async()=>{
  let calls=0,active=0,peak=0;
  const piano=new GrandPiano(new AudioContext(),{fetchSample:async function(url){
    assert.equal(this,undefined);assert.match(url.href,/\/audio\/salamander\/[A-Za-z0-9]+\.mp3$/);calls++;active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setImmediate(resolve));active--;return response();
  }});
  await Promise.all([piano.load(),piano.load(),piano.load()]);
  assert.equal(piano.ready,true);assert.equal(calls,30);assert.ok(peak<=4);
  await piano.load();assert.equal(calls,30);
});

test('releasing keys or stopping playback during loading prevents delayed ghost notes',async()=>{
  let finish;const gate=new Promise(resolve=>{finish=resolve;});
  const context=new AudioContext(),piano=new GrandPiano(context,{fetchSample:async()=>{await gate;return response();}});
  const released=piano.noteOn(60),held=piano.noteOn(64);
  piano.noteOff(60);finish();await Promise.all([released,held]);
  assert.equal(context.sources.length,1);assert.equal(piano.held.has(60),false);assert.ok(piano.held.get(64)?.voice);
  let cancelLoad;const pending=new Promise(resolve=>{cancelLoad=resolve;});
  const otherContext=new AudioContext(),other=new GrandPiano(otherContext,{fetchSample:async()=>{await pending;return response();}});
  const cancelled=other.noteOn(67);other.allNotesOff();cancelLoad();await cancelled;
  assert.equal(otherContext.sources.length,0);assert.equal(other.held.size,0);
});

test('repeated keys release the previous attack without stopping other chord notes and velocity controls level',async()=>{
  const {piano,context}=loadedPiano();
  await piano.noteOn(60,30);await piano.noteOn(64,100);
  const old=piano.held.get(60).voice,other=piano.held.get(64).voice;
  context.currentTime=.1;await piano.noteOn(60,110);
  assert.ok(old.source.stops.length);assert.equal(other.source.stops.length,0);
  assert.ok(piano.held.get(60).voice.level>old.level);
  piano.noteOff(60);assert.equal(piano.held.has(60),false);assert.equal(other.source.stops.length,0);
  await piano.noteOn(64,0);assert.equal(piano.held.has(64),false);assert.ok(other.source.stops.length);
});

test('stop cancels sounding and future notes with a short release and disconnects ended nodes',()=>{
  const {piano,context}=loadedPiano();
  const active=piano.play(60,8,90),future=piano.play(67,.8,90,2);
  context.currentTime=.1;piano.allNotesOff();
  assert.equal(active.source.stops.at(-1),.125);assert.equal(future.source.stops.at(-1),.125);
  assert.equal(future.gain.gain.events.findLast(e=>e[0]==='set')[1],0);
  for(const source of context.sources)source.onended();
  assert.equal(piano.voices.size,0);
  assert.ok(context.sources.every(source=>source.disconnected));
});

test('dense passages keep polyphony bounded while allowing independent attacks',()=>{
  const {piano,context}=loadedPiano({maxVoices:4});
  for(let i=0;i<20;i++)piano.play(60+i%3,4,100);
  assert.equal(piano.voices.size,4);assert.equal(context.sources.length,20);
  assert.ok(context.sources.slice(0,16).every(source=>source.stops.at(-1)===.005));
  piano.allNotesOff();assert.ok([...piano.voices].every(v=>v.source.stops.at(-1)===.025));
});

test('a failed sample load is reported and can be retried without redownloading successful samples',async()=>{
  const calls=new Map();
  const piano=new GrandPiano(new AudioContext(),{fetchSample:async url=>{
    const count=(calls.get(url.pathname)||0)+1;calls.set(url.pathname,count);
    if(url.pathname.endsWith('/A0.mp3')&&count===1)return {ok:false};
    return response();
  }});
  await assert.rejects(piano.load(),/A0.mp3/);
  await new Promise(resolve=>setImmediate(resolve));
  await piano.load();assert.equal(piano.ready,true);
  assert.equal([...calls.values()].reduce((a,b)=>a+b,0),31);
});
