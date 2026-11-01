import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import * as music from '../dist/music.js';

// Run the application's actual handlers with a controlled clock, DOM and piano.
const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replace(/^bootstrap\(\);$/m,'');
function player(){
  let now=0;
  const elements=new Map(),documentEvents=new Map(),windowEvents=new Map(),tones=[];
  const element=selector=>{
    if(selector==='#roll')return null;
    if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',open:false,
      classList:{add(){},remove(){}},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});
    return elements.get(selector);
  };
  const context=createContext({...music,
    document:{hidden:false,querySelector:element,querySelectorAll:()=>[],addEventListener:(name,fn)=>documentEvents.set(name,fn)},
    window:{addEventListener:(name,fn)=>windowEvents.set(name,fn)},navigator:{},
    localStorage:{getItem:()=>null,setItem(){}},performance:{now:()=>now},
    requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},
    tones,
  });
  const run=code=>runInContext(code,context);
  run(source);
  run(`
    route='practice';
    currentSong={id:'test',beatsPerBar:4,notes:[
      {pitch:60,beat:0,duration:.2,hand:'right'},
      {pitch:64,beat:1,duration:2,hand:'right'},
      {pitch:67,beat:3,duration:1,hand:'right'}
    ]};
    options=optionsFor(currentSong);options.bpm=60;
    practice=new Practice(selectedNotes());practice.on(60,0);practice.off(60);
    currentBeat=.25;viewBeat=.25;checkpoint();
    piano={ready:true,load:async()=>{},allNotesOff(){},play:(pitch,duration,velocity)=>tones.push({pitch,duration,velocity})};
    ensureAudio=()=>({});renderPractice=()=>{};
  `);
  const click=action=>documentEvents.get('click')({target:{closest:()=>({dataset:{action},disabled:false,isConnected:true,setAttribute(){},removeAttribute(){}})}});
  const advance=seconds=>{for(let i=0;i<Math.round(seconds*10);i++){now+=100;run('tickFrame(performance.now())');}};
  const snapshot=()=>JSON.parse(run(`JSON.stringify({playing,demo,currentBeat,viewBeat,played:[...demoPlayed],correct:practice.correct,checkpoint:state.checkpoints.test,sessions:state.sessions})`));
  return {run,click,advance,snapshot,tones,element,blur:()=>windowEvents.get('blur')()};
}

test('stopping listening freezes its position and continuing resumes notes without replaying earlier attacks',async()=>{
  const p=player();
  await p.click('demo');const checkpoint=p.snapshot().checkpoint;p.advance(2.5);
  const before=p.snapshot();assert.ok(before.currentBeat>1);
  assert.deepEqual(p.tones.map(n=>n.pitch),[60,64]);
  await p.click('toggle-play');p.advance(5);
  assert.deepEqual(p.snapshot(),{...before,playing:false});
  assert.match(p.element('#play-button').innerHTML,/Continuar escucha/);
  await p.click('toggle-play');
  assert.equal(p.snapshot().currentBeat,before.currentBeat);
  assert.equal(p.tones.at(-1).pitch,64);
  assert.ok(Math.abs(p.tones.at(-1).duration-(3-before.currentBeat))<1e-9);
  p.advance(1.6);
  assert.deepEqual(p.tones.map(n=>n.pitch),[60,64,64,67]);
  assert.deepEqual(p.snapshot().checkpoint,checkpoint);
  assert.equal(p.snapshot().correct,1);assert.deepEqual(p.snapshot().sessions,[]);
});

test('the listening button, focus changes and dialogs also pause without losing the listening position',async()=>{
  const p=player();await p.click('demo');p.advance(2.5);
  const beat=p.snapshot().currentBeat;
  await p.click('demo');assert.equal(p.snapshot().playing,false);
  await p.click('demo');assert.equal(p.snapshot().playing,true);
  p.blur();assert.equal(p.snapshot().currentBeat,beat);assert.equal(p.snapshot().demo,true);
  await p.click('toggle-play');p.run("openDialog('Opciones')");p.advance(2);
  assert.equal(p.snapshot().playing,false);assert.equal(p.snapshot().currentBeat,beat);
});

test('restart clears the listening position and the next listen starts at the beginning',async()=>{
  const p=player();await p.click('demo');p.advance(2.5);
  await p.click('toggle-play');await p.click('restart');
  assert.equal(p.snapshot().currentBeat,-2);assert.equal(p.snapshot().demo,false);
  assert.deepEqual(p.snapshot().played,[]);assert.equal(p.run('demoSnapshot'),null);
  await p.click('demo');assert.equal(p.snapshot().currentBeat,-1);
  p.tones.length=0;p.advance(1.1);assert.deepEqual(p.tones.map(n=>n.pitch),[60]);
});

test('finishing listening restores the practice checkpoint and normal practice still pauses and continues',async()=>{
  const p=player();await p.click('demo');p.advance(6);
  assert.equal(p.snapshot().demo,false);assert.equal(p.snapshot().playing,false);
  assert.equal(p.snapshot().currentBeat,.25);assert.equal(p.snapshot().viewBeat,.25);
  await p.click('toggle-play');assert.equal(p.snapshot().playing,true);
  await p.click('toggle-play');assert.equal(p.snapshot().playing,false);
  await p.click('toggle-play');assert.equal(p.snapshot().playing,true);
  assert.equal(p.snapshot().demo,false);assert.equal(p.snapshot().correct,1);
});
