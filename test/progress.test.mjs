import test from 'node:test';
import assert from 'node:assert/strict';
import { resetSongProgress, resetLessonProgress, resetAllProgress } from '../dist/progress.js';
const snapshot=()=>({version:1,goal:120,breakMinutes:30,latency:20,imports:[{id:'import-kept'}],lessons:['position','keyboard'],sessions:[{songId:'five',id:'a'},{songId:'echo',id:'b'}],checkpoints:{five:{correct:3},echo:{correct:2}},best:{five:100,echo:80},daySeconds:{'2026-10-25':1000}});
test('resetting a song removes only its results, history and checkpoint',()=>{
  const before=snapshot(),after=resetSongProgress(before,'five');
  assert.deepEqual(after.best,{echo:80});assert.deepEqual(after.checkpoints,{echo:{correct:2}});
  assert.deepEqual(after.sessions,[{songId:'echo',id:'b'}]);
  assert.deepEqual(after.lessons,before.lessons);assert.deepEqual(after.daySeconds,before.daySeconds);assert.deepEqual(after.imports,before.imports);
  assert.equal(before.best.five,100);
});
test('resetting a lesson preserves practice results and other completed lessons',()=>{
  const before=snapshot(),after=resetLessonProgress(before,'position');
  assert.deepEqual(after.lessons,['keyboard']);assert.deepEqual(after.best,before.best);assert.deepEqual(before.lessons,['position','keyboard']);
});
test('global reset clears learning records, time and streak data while keeping scores and preferences',()=>{
  const before=snapshot(),after=resetAllProgress(before);
  assert.deepEqual([after.lessons,after.sessions,after.best,after.checkpoints,after.daySeconds],[[],[],{},{},{}]);
  assert.deepEqual(after.imports,before.imports);assert.equal(after.goal,120);assert.equal(after.breakMinutes,30);assert.equal(after.latency,20);
});
