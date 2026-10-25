import { mkdir, readFile, writeFile, rename, readdir, rm, realpath, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { normalizePersonalScore, validPersonalScore } from '../dist/score-data.js';

export const MAX_ORIGINAL=5*1024*1024;
const allowed=new Set(['.mxl','.xml','.musicxml','.mid','.midi']);
const validId=id=>/^import-[a-zA-Z0-9-]{1,80}$/.test(id);
export class StoreError extends Error{
  constructor(status,message){super(message);this.status=status;}
}

export async function createUploadStore(directory){
  await mkdir(directory,{recursive:true,mode:0o750});
  const root=await realpath(directory);
  await access(root,constants.R_OK|constants.W_OK);
  let writes=Promise.resolve();
  const inRoot=async path=>{
    const actual=await realpath(path);
    if(!actual.startsWith(root+sep))throw new StoreError(403,'Ruta de partitura no permitida.');
    return actual;
  };
  async function get(id){
    if(!validId(id))throw new StoreError(400,'Identificador de partitura no válido.');
    try{
      const file=await inRoot(resolve(root,id,'score.json'));
      const score=JSON.parse(await readFile(file,'utf8'));
      if(!validPersonalScore(score)||score.id!==id)throw new Error('Datos de partitura no válidos.');
      return score;
    }catch(error){if(error.code==='ENOENT')throw new StoreError(404,'Partitura no encontrada.');throw error;}
  }
  async function list(){
    const scores=[],warnings=[];
    for(const entry of await readdir(root,{withFileTypes:true})){
      if(!entry.isDirectory()||!validId(entry.name))continue;
      try{scores.push(await get(entry.name));}catch{warnings.push(`No se pudo leer la partitura ${entry.name}. Conserva su carpeta y revisa la copia.`);}
    }
    return {scores:scores.sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')),warnings};
  }
  async function putNow(payload){
    let score;
    try{score=normalizePersonalScore(payload?.score);}catch{throw new StoreError(400,'La partitura contiene datos no válidos.');}
    let original=null;
    if(payload.original){
      const {name,base64}=payload.original;
      if(typeof name!=='string'||name.length>240||typeof base64!=='string'||!allowed.has(extname(name).toLowerCase()))throw new StoreError(400,'El archivo debe ser MXL, MusicXML o MIDI.');
      if(base64.length>Math.ceil(MAX_ORIGINAL/3)*4)throw new StoreError(413,'El archivo supera 5 MB.');
      if(base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(base64))throw new StoreError(400,'El archivo no está codificado correctamente.');
      const bytes=Buffer.from(base64,'base64');
      if(bytes.length>MAX_ORIGINAL)throw new StoreError(413,'El archivo supera 5 MB.');
      if(!bytes.length||bytes.toString('base64')!==base64)throw new StoreError(400,'El archivo no es válido.');
      const safeName=name.replace(/[\\/:\x00-\x1f]/g,'_').replace(/^\.+/,'').slice(0,240);
      if(!safeName||!allowed.has(extname(safeName).toLowerCase()))throw new StoreError(400,'Nombre de archivo no válido.');
      original={name:safeName,bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
    }
    // Retries and migration of the same ID are idempotent; an existing original
    // must never be overwritten by a normalized-only backup.
    try{return await get(score.id);}catch(error){if(error.status!==404)throw error;}
    const temporary=resolve(root,'.pending-'+randomUUID());
    await mkdir(temporary,{mode:0o750});
    try{
      score={...score,createdAt:new Date().toISOString(),storedOnServer:true};
      if(original){
        await writeFile(resolve(temporary,original.name),original.bytes,{mode:0o600,flag:'wx'});
        score.original={name:original.name,bytes:original.bytes.length,sha256:original.sha256,url:'/api/scores/'+score.id+'/file'};
        score.fileName=original.name;
      }else score.normalizedOnly=true;
      await writeFile(resolve(temporary,'score.json'),JSON.stringify(score),{mode:0o600,flag:'wx'});
      await rename(temporary,resolve(root,score.id));
      return score;
    }catch(error){await rm(temporary,{recursive:true,force:true});throw error;}
  }
  function put(payload){const result=writes.then(()=>putNow(payload));writes=result.catch(()=>{});return result;}
  async function original(id){
    const score=await get(id);
    if(!score.original?.name)throw new StoreError(404,'Esta partitura conserva datos musicales, pero no el archivo original.');
    const filename=score.original.name;
    if(filename.includes('/')||filename.includes('\\')||!allowed.has(extname(filename).toLowerCase()))throw new StoreError(400,'Nombre de archivo no válido.');
    return {path:await inRoot(resolve(root,id,filename)),name:filename};
  }
  return {get,list,put,original};
}
