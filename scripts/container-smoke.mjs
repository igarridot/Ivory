import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const image=process.env.TEST_IMAGE||'ivory-piano:test-runtime';
const root=await mkdtemp(join(tmpdir(),'ivory-container-'));
const uploads=join(root,'uploads');await mkdir(uploads);
let container;
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try{
  container=docker('run','--detach','--rm','--read-only','--tmpfs','/tmp','--user',`${process.getuid()}:${process.getgid()}`,'--publish','127.0.0.1::5173','--mount',`type=bind,source=${uploads},target=/app/data/uploads`,image);
  let port=docker('port',container,'5173/tcp').split(':').at(-1),url=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let i=0;i<60;i++){
    try{const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(ready,'El contenedor no pasó la comprobación de salud.');
  assert.equal((await fetch(url)).status,200);
  const payload={score:{id:'import-container-smoke',title:'Container smoke',composer:'Ivory',notes:[{pitch:60,beat:0,duration:1,hand:'right'}],bpm:60,beatsPerBar:4},original:{name:'smoke.xml',base64:Buffer.from('<score-partwise/>').toString('base64')}};
  const upload=await fetch(url+'/api/scores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(upload.status,201);
  assert.equal(await readFile(join(uploads,'import-container-smoke','smoke.xml'),'utf8'),'<score-partwise/>');
  docker('restart',container);
  port=docker('port',container,'5173/tcp').split(':').at(-1);url=`http://127.0.0.1:${port}`;
  for(let i=0;i<60;i++){
    try{const response=await fetch(url+'/api/scores',{signal:AbortSignal.timeout(1000)});if(response.ok){const data=await response.json();assert.ok(data.scores.some(s=>s.id===payload.score.id));break;}}catch{}
    if(i===59)throw new Error('La biblioteca no reapareció después del reinicio.');
    await new Promise(r=>setTimeout(r,500));
  }
  assert.ok((await readdir(uploads)).includes(payload.score.id));
  console.log('Contenedor verificado: HTTP, subida al bind mount y persistencia tras reinicio.');
}catch(error){if(container){try{console.error(docker('logs',container));}catch{}}throw error;}
finally{if(container){try{docker('rm','--force',container);}catch{}}await rm(root,{recursive:true,force:true});}
