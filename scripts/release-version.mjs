import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const parse=tag=>{
  const match=/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if(!match)return null;
  const parts=match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger)?parts:null;
};
const ordered=tags=>tags.filter(t=>parse(t)).sort((a,b)=>{const x=parse(a),y=parse(b);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];});

export function nextRelease({tags=[],headTags=[],bump='patch'}={}){
  if(!['patch','minor','major'].includes(bump))throw new Error('Incremento de versión no válido.');
  const existing=ordered(headTags).at(-1);
  if(existing)return {tag:existing,version:existing.slice(1),reused:true};
  const latest=ordered(tags).at(-1);
  if(!latest)return {tag:'v0.1.0',version:'0.1.0',reused:false};
  let [major,minor,patch]=parse(latest);
  if(bump==='major'){major++;minor=0;patch=0;}else if(bump==='minor'){minor++;patch=0;}else patch++;
  if(![major,minor,patch].every(Number.isSafeInteger))throw new Error('Versión fuera de rango.');
  const version=`${major}.${minor}.${patch}`;
  return {tag:'v'+version,version,reused:false};
}
function main(){
  const list=args=>execFileSync('git',args,{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const result=nextRelease({tags:list(['tag','--list','v*']),headTags:list(['tag','--points-at','HEAD']),bump:process.env.RELEASE_BUMP||'patch'});
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,Object.entries(result).map(([k,v])=>`${k}=${v}\n`).join(''));
  console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
