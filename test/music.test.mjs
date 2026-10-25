import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice, decodeMidi, filteredNotes, noteName } from '../dist/music.js';
import { importMidi } from '../dist/import.js';

const note=(pitch,beat=0,hand='right')=>({pitch,beat,duration:0.8,hand});
test('MIDI recognizes zero-velocity note-off, note-on, channel and sustain',()=>{
  assert.deepEqual(decodeMidi([0x92,60,100]),{type:'on',pitch:60,velocity:100,channel:2});
  assert.equal(decodeMidi([0x90,60,0]).type,'off');
  assert.equal(decodeMidi([0x80,60,64]).type,'off');
  assert.equal(decodeMidi([0xb0,64,127]).type,'pedal');
  assert.equal(decodeMidi([0xb0,7,100]),null);
  assert.equal(decodeMidi([0x90]),null);
});
test('wait mode requires every chord note and a release before a repeated pitch',()=>{
  const p=new Practice([note(60),note(64),note(60,1)]);
  assert.equal(p.on(60).result,'correct');
  assert.equal(p.index,0);
  assert.equal(p.on(60).result,'ignored');
  assert.equal(p.on(64).result,'correct');
  assert.equal(p.index,1);
  assert.equal(p.on(60).result,'ignored');
  p.off(60);
  assert.equal(p.on(60).done,true);
  assert.equal(p.coverage,100);
});
test('extra notes reduce precision without advancing the melody',()=>{
  const p=new Practice([note(60)]);
  assert.equal(p.on(62).result,'wrong');assert.equal(p.index,0);
  p.off(62);p.on(60);
  assert.equal(p.accuracy,50);assert.equal(p.coverage,100);
});
test('rhythm distinguishes missed notes from extra presses and matches nearest repeated pitch',()=>{
  const p=new Practice([note(60,0),note(60,1),note(64,2)],'rhythm',.2);
  p.advance(.3);assert.equal(p.notes[0].missed,true);
  assert.equal(p.on(60,1.1).result,'correct');p.off(60);
  assert.equal(p.on(65,2).result,'wrong');
  p.advance(2.3);assert.equal(p.done,true);assert.equal(p.coverage,33);
  assert.equal(p.wrong,1);assert.equal(p.notes[1].hit,true);
});
test('sustain does not turn sustained notes into new key presses or grant hits',()=>{
  const p=new Practice([note(60),note(60,1),note(64,2)]);
  p.on(60);p.setPedal(127);p.off(60);
  assert.equal(p.held.has(60),false);assert.equal(p.sustained.has(60),true);
  p.on(60);assert.equal(p.correct,2);p.off(60);
  p.setPedal(0);assert.equal(p.sustained.size,0);
  p.clearHeld();assert.equal(p.held.size,0);
});
test('hand and measure selection rebases time, including pickup boundaries',()=>{
  const song={beatsPerBar:4,barStarts:[0,1,5],notes:[note(60,0),note(48,1,'left'),note(62,2),note(64,5)]};
  const selected=filteredNotes(song,'right',2,2);
  assert.deepEqual(selected,[note(62,1)]);
  assert.equal(noteName(60),'Do4');
});
function midi(track,division=480){const bytes=[...Buffer.from('MThd'),0,0,0,6,0,0,0,1,division>>8,division&255,...Buffer.from('MTrk'),0,0,track.length>>8,track.length&255,...track];return Uint8Array.from(bytes).buffer;}
test('imports MIDI running status, tempo, durations, sustain-independent note lengths',()=>{
  const data=importMidi(midi([0,0xff,0x51,3,0x07,0xa1,0x20,0,0x90,60,100,0x83,0x60,60,0,0,0xff,0x2f,0]));
  assert.equal(data.bpm,120);assert.equal(data.notes.length,1);
  assert.equal(data.notes[0].duration,1);assert.equal(data.notes[0].pitch,60);
});
test('rejects damaged MIDI and incompatible SMPTE timing',()=>{
  assert.throws(()=>importMidi(new Uint8Array([1,2,3]).buffer),/incompleto/);
  assert.throws(()=>importMidi(midi([0,0xff,0x2f,0],0xe728)),/SMPTE/);
  assert.throws(()=>importMidi(midi([0,0x90,60])),/incompleto/);
});
test('rejects changing MIDI meters instead of silently mislabelling measures',()=>{
  const track=[0,0xff,0x58,4,4,2,24,8,0,0x90,60,100,0x83,0x60,0x80,60,64,0,0xff,0x58,4,3,2,24,8,0,0xff,0x2f,0];
  assert.throws(()=>importMidi(midi(track)),/cambios de compás/);
});
