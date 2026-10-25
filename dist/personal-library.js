import { validPersonalScore } from './score-data.js';

let dbPromise;
function database(){
  if(!globalThis.indexedDB)return Promise.reject(new Error('No hay caché local.'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open('ivory-personal-library',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('scores',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return dbPromise;
}
async function cacheScores(scores){
  try{
    const db=await database();
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction('scores','readwrite'),store=transaction.objectStore('scores');
      store.clear();for(const score of scores)store.put(score);
      transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
    });
  }catch{/* The filesystem copy is authoritative; browser caching is optional. */}
}
export async function cachedScores(){
  try{
    const db=await database();return await new Promise((resolve,reject)=>{
      const request=db.transaction('scores').objectStore('scores').getAll();
      request.onsuccess=()=>resolve(request.result.filter(validPersonalScore));request.onerror=()=>reject(request.error);
    });
  }catch{return [];}
}
export async function loadPersonalLibrary(){
  try{
    const response=await fetch('./api/scores',{cache:'no-store',signal:AbortSignal.timeout(2500)});
    if(!response.ok)throw new Error();
    const data=await response.json();
    if(data.apiVersion!==1||!Array.isArray(data.scores)||!data.scores.every(validPersonalScore))throw new Error();
    await cacheScores(data.scores);
    return {scores:data.scores,online:true,warnings:data.warnings || []};
  }catch{return {scores:await cachedScores(),online:false,warnings:[]};}
}
export async function persistPersonalScore(score,file){
  const original=file?{name:file.name,base64:await new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);
  })}:undefined;
  let response;
  try{response=await fetch('./api/scores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({score,original}),signal:AbortSignal.timeout(15000)});}
  catch{throw new Error('No se pudo conectar con el almacenamiento local. Inicia Ivory con make up o npm run dev y vuelve a guardar.');}
  let data;try{data=await response.json();}catch{throw new Error('Este servidor no permite guardar archivos. Inicia Ivory con make up o npm run dev.');}
  if(!response.ok||!validPersonalScore(data.score))throw new Error(data.error || 'No se pudo guardar la partitura en la carpeta local.');
  const all=await cachedScores();await cacheScores([...all.filter(s=>s.id!==data.score.id),data.score]);
  return data.score;
}
