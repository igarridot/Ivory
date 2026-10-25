import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createHttpServer } from '../scripts/server.mjs';
import { MAX_ORIGINAL } from '../scripts/upload-store.mjs';

const score=id=>({id,title:'Mi Moonlight',composer:'Beethoven',notes:[{pitch:60,beat:0,duration:1,hand:'right'}],bpm:60,beatsPerBar:4,fileName:'Moonlight.mxl'});
async function fixture(t){
  const folder=await mkdtemp(join(tmpdir(),'ivory-storage-test-')),uploads=join(folder,'uploads');let server;
  const start=async()=>{server=await createHttpServer({directory:resolve('dist'),uploadsDirectory:uploads});await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});return `http://127.0.0.1:${server.address().port}`;};
  let url=await start();
  const close=()=>server.listening?new Promise(r=>server.close(r)):Promise.resolve();
  t.after(async()=>{await close();await rm(folder,{recursive:true,force:true});});
  return {folder,uploads,get url(){return url;},restart:async()=>{await close();url=await start();},post:payload=>fetch(url+'/api/scores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})};
}

test('uploaded originals and musical data survive a server restart with the same filesystem directory',async t=>{
  const app=await fixture(t),original=await readFile('dist/scores/Sonate_No._14_Moonlight_1st_Movement.mxl');
  const response=await app.post({score:score('import-durable'),original:{name:'Sonate_No._14_Moonlight_1st_Movement.mxl',base64:original.toString('base64')}});
  assert.equal(response.status,201);const stored=(await response.json()).score;
  assert.equal(stored.original.sha256,createHash('sha256').update(original).digest('hex'));
  assert.deepEqual(await readFile(join(app.uploads,stored.id,stored.original.name)),original);
  assert.equal(JSON.parse(await readFile(join(app.uploads,stored.id,'score.json'),'utf8')).notes[0].pitch,60);
  await app.restart();const library=await(await fetch(app.url+'/api/scores')).json();assert.equal(library.scores.length,1);
  const download=await fetch(app.url+stored.original.url);assert.deepEqual(Buffer.from(await download.arrayBuffer()),original);
  assert.match(download.headers.get('content-disposition'),/attachment/);
});
test('uploads are idempotent, concurrent retries do not duplicate files, backups cannot overwrite an original',async t=>{
  const app=await fixture(t),payload={score:score('import-once'),original:{name:'piece.xml',base64:Buffer.from('<score-partwise/>').toString('base64')}};
  const responses=await Promise.all([app.post(payload),app.post(payload)]);assert.ok(responses.every(r=>r.status===201));
  await app.post({score:score('import-once')});
  const saved=(await(await fetch(app.url+'/api/scores')).json()).scores;assert.equal(saved.length,1);assert.ok(saved[0].original);
  assert.deepEqual((await readdir(app.uploads)).filter(n=>!n.startsWith('.')),['import-once']);
});
test('legacy and backup imports keep their original ID and are stored as normalized score files',async t=>{
  const app=await fixture(t),response=await app.post({score:score('import-legacy')});assert.equal(response.status,201);
  const saved=(await response.json()).score;assert.equal(saved.id,'import-legacy');assert.equal(saved.normalizedOnly,true);
  assert.equal((await fetch(app.url+'/api/scores/import-legacy/file')).status,404);
  assert.equal(JSON.parse(await readFile(join(app.uploads,'import-legacy','score.json'),'utf8')).id,'import-legacy');
});
test('storage rejects invalid notes, IDs, base64, unsupported formats, oversized originals and cross-origin writes',async t=>{
  const app=await fixture(t);
  assert.equal((await app.post({score:score('../escape')})).status,400);
  assert.equal((await app.post({score:{...score('import-bad'),notes:[]}})).status,400);
  assert.equal((await app.post({score:score('import-bad'),original:{name:'bad.exe',base64:'YQ=='}})).status,400);
  assert.equal((await app.post({score:score('import-bad'),original:{name:'bad.mxl',base64:'###='}})).status,400);
  const large=Buffer.alloc(MAX_ORIGINAL+1).toString('base64');
  assert.equal((await app.post({score:score('import-large'),original:{name:'big.mxl',base64:large}})).status,413);
  assert.equal((await fetch(app.url+'/api/scores',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://another.example'},body:'{}'})).status,403);
  assert.equal((await fetch(app.url+'/api/scores',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(app.url+'/api/scores',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'})).status,400);
});
test('uploads cannot expose files outside their data directory through paths or symlinks',async t=>{
  const app=await fixture(t),outside=join(app.folder,'outside');await mkdir(outside);await writeFile(join(outside,'score.json'),JSON.stringify(score('import-link')));
  await symlink(outside,join(app.uploads,'import-link'));
  assert.equal((await app.post({score:score('import-link')})).status,403);
  assert.equal((await fetch(app.url+'/data/uploads/import-link/score.json')).status,404);
  const response=await app.post({score:score('import-safe'),original:{name:'../../escape.xml',base64:Buffer.from('safe').toString('base64')}});
  assert.equal(response.status,201);const data=(await response.json()).score;assert.ok(!data.original.name.includes('/'));
  assert.equal((await fetch(app.url+'/api/scores/import-safe/file')).status,200);
});
