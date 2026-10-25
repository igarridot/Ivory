import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createUploadStore, StoreError } from './upload-store.mjs';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const MAX_BODY=16*1024*1024;
const inside=(root,target)=>{const path=relative(root,target);return path===''||!path.startsWith('..')&&!isAbsolute(path);};
function readJson(request){
  return new Promise((resolve,reject)=>{
    let size=0,failed=false;const chunks=[];
    request.on('data',chunk=>{if(failed)return;size+=chunk.length;if(size>MAX_BODY){failed=true;chunks.length=0;reject(new StoreError(413,'La solicitud supera 16 MB.'));}else chunks.push(chunk);});
    request.on('end',()=>{if(failed)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new StoreError(400,'El contenido JSON no es válido.'));}});
    request.on('error',reject);
  });
}
export async function createAppHandler({directory,uploadsDirectory=resolve(directory,'../data/uploads')}){
  const root=await realpath(directory),store=await createUploadStore(uploadsDirectory);
  return async(request,response)=>{
    const json=(status,data)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(request.method==='HEAD'?undefined:JSON.stringify(data));};
    const text=(status,message)=>{response.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});response.end(request.method==='HEAD'?undefined:message);};
    try{
      const url=new URL(request.url,'http://localhost');
      if(url.pathname==='/api/health'){json(200,{ok:true,apiVersion:1,storage:'filesystem'});return;}
      if(url.pathname==='/api/scores'){
        if(request.method==='GET'){json(200,{apiVersion:1,...await store.list()});return;}
        if(request.method!=='POST'){response.setHeader('Allow','GET, POST');json(405,{error:'Método no permitido.'});return;}
        const origin=request.headers.origin;
        if(origin&&origin!==`${request.socket.encrypted?'https':'http'}://${request.headers.host}`)throw new StoreError(403,'La solicitud debe proceder de esta aplicación.');
        if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||''))throw new StoreError(415,'Se requiere application/json.');
        if(Number(request.headers['content-length'])>MAX_BODY){request.resume();throw new StoreError(413,'La solicitud supera 16 MB.');}
        json(201,{score:await store.put(await readJson(request))});return;
      }
      const download=url.pathname.match(/^\/api\/scores\/(import-[a-zA-Z0-9-]{1,80})\/file$/);
      if(download&&['GET','HEAD'].includes(request.method)){
        const file=await store.original(download[1]),info=await stat(file.path);
        response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':info.size,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/'/g,'%27'),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        if(request.method==='HEAD')response.end();else createReadStream(file.path).on('error',()=>response.destroy()).pipe(response);
        return;
      }
      if(url.pathname.startsWith('/api/')){json(404,{error:'Ruta no encontrada.'});return;}
      if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD');text(405,'Método no permitido.');return;}
      const pathname=decodeURIComponent(url.pathname);
      if(pathname.includes('\0')||pathname.split('/').some(p=>p.startsWith('.'))){text(403,'Ruta no permitida.');return;}
      const candidate=resolve(root,'.'+pathname,pathname.endsWith('/')?'index.html':'');
      if(!inside(root,candidate)){text(403,'Ruta no permitida.');return;}
      const actual=await realpath(candidate);if(!inside(root,actual)){text(403,'Ruta no permitida.');return;}
      const info=await stat(actual);if(!info.isFile()){text(404,'Archivo no encontrado.');return;}
      response.writeHead(200,{'Content-Type':MIME[extname(actual)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      if(request.method==='HEAD')response.end();else createReadStream(actual).on('error',()=>response.destroy()).pipe(response);
    }catch(error){
      const status=error.status||(error instanceof URIError?400:['ENOENT','ENOTDIR'].includes(error.code)?404:500);
      if(status===500)console.error('Ivory:',error.message);
      json(status,{error:status===500?'No se pudo guardar o leer la partitura. Comprueba la carpeta de datos y sus permisos.':error.message});
    }
  };
}
export async function createHttpServer(options){return createServer(await createAppHandler(options));}
async function main(){
  const {values}=parseArgs({options:{host:{type:'string',default:process.env.IVORY_HOST||'127.0.0.1'},port:{type:'string',default:process.env.PORT||'5173'}}});
  const port=Number(values.port);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Puerto no válido.');
  const server=await createHttpServer({directory:resolve(project,'dist'),uploadsDirectory:process.env.IVORY_UPLOADS_DIR||resolve(project,'data/uploads')});
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(port,values.host,()=>console.log(`Ivory · http://${values.host==='0.0.0.0'?'127.0.0.1':values.host}:${port}`));
  const stop=()=>server.close(()=>process.exit(0));process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
