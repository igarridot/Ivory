import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zipEntries } from '../dist/archive.js';
import { zipSync, strToU8 } from '../dist/vendor/fflate.js';
import { measureOrder } from '../dist/musicxml.js';
import { SONGS, LESSONS, STAGES } from '../dist/curriculum.js';
import { filteredNotes, pianoNotes } from '../dist/music.js';

test('every bundled score is present, matches its source checksum and has a valid ZIP directory',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../dist/scores/manifest.json',import.meta.url),'utf8'));
  const files=(await readdir(new URL('../dist/scores/',import.meta.url))).filter(f=>f.endsWith('.mxl'));
  assert.equal(files.length,manifest.count);assert.equal(manifest.scores.length,69);
  assert.equal(new Set(manifest.scores.map(s=>s.id)).size,69);
  for(const s of manifest.scores){
    const bytes=await readFile(new URL('../dist/scores/'+s.file,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),s.sha256,s.file);
    assert.ok(zipEntries(bytes).entries.some(e=>e.name==='META-INF/container.xml'),s.file);
  }
});
test('ZIP validation rejects malformed, unsafe, encrypted and oversized containers before decompression',()=>{
  assert.throws(()=>zipEntries(new Uint8Array([1,2,3])),/ZIP válido/);
  assert.throws(()=>zipEntries(zipSync({'../escape.xml':strToU8('test')})),/ruta no permitida/);
  const normal=zipSync({'music.xml':strToU8('<score-partwise/>')});
  const view=new DataView(normal.buffer,normal.byteOffset,normal.byteLength);
  let central=0;while(view.getUint32(central,true)!==0x02014b50)central++;
  view.setUint16(central+8,1,true);
  assert.throws(()=>zipEntries(normal),/cifrado/);
  view.setUint16(central+8,0,true);view.setUint32(central+24,31*1024*1024,true);
  assert.throws(()=>zipEntries(normal),/30 MB/);
});
test('repeat traversal unfolds first and second endings without replaying the first ending',()=>{
  const m=(data={})=>({endings:[],...data});
  assert.deepEqual(measureOrder([m({forward:true}),m({endings:[1],backward:true}),m({endings:[2]}),m()]).order,[0,1,0,2,3]);
  assert.deepEqual(measureOrder([m({forward:true}),m({backward:true,times:3}),m()]).order,[0,1,0,1,0,1,2]);
  assert.equal(measureOrder([m({forward:true}),m({forward:true}),m({backward:true}),m({backward:true})]).nested,true);
});
test('the last measure retains every note even with changing meters',()=>{
  const song={beatsPerBar:2,barStarts:[0,2,5],endBeat:10,notes:[{pitch:60,beat:9,duration:.5,hand:'right'}]};
  assert.equal(filteredNotes(song,'both',3,3)[0].beat,4);
});
test('88-key adaptation moves only out-of-range pitches and merges physical unisons',()=>{
  const notes=[{pitch:20,beat:0,duration:1,hand:'left'},{pitch:32,beat:0,duration:2,hand:'left'},{pitch:110,beat:1,duration:1,hand:'right'}];
  assert.deepEqual(pianoNotes(notes).map(n=>n.pitch),[20,32,110]);
  const adapted=pianoNotes(notes,true);
  assert.deepEqual(adapted.map(n=>n.pitch),[32,98]);
  assert.equal(adapted[0].duration,2);
  assert.equal(notes[0].pitch,20);
});
test('the expanded curriculum preserves original IDs and every lesson leads to a playable study',()=>{
  assert.equal(LESSONS.length,40);assert.equal(SONGS.length,37);
  assert.equal(new Set(LESSONS.map(l=>l.id)).size,LESSONS.length);
  assert.equal(new Set(SONGS.map(s=>s.id)).size,SONGS.length);
  for(const id of ['position','keyboard','pulse','hands','intervals','chords','reading','pedal'])assert.ok(LESSONS.some(l=>l.id===id));
  for(const stage of STAGES)assert.ok(LESSONS.some(l=>l.stage===stage.id)&&SONGS.some(s=>s.stage===stage.id));
  for(const lesson of LESSONS){
    assert.ok(SONGS.some(s=>s.id===lesson.exercise),lesson.id);
    assert.ok(lesson.answers[lesson.correct],lesson.id);
  }
  for(const song of SONGS){
    assert.ok(song.notes.length>0,song.id);
    assert.ok(song.notes.every(n=>n.pitch>=21&&n.pitch<=108&&Number.isFinite(n.beat)&&n.beat>=0&&n.duration>0),song.id);
  }
});
