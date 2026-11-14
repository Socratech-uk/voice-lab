import {localFiles,localFileRequest,localConnection} from './local-files.mjs';
// Shared transport for independently connected asset roles. Credentials never enter project metadata.
export const ASSET_STORE_PROTOCOLS={model:'capp.3d-lab.disk.v1',audio:'capp.voice-lab.disk.v1'};
export function assetConnection(value){
 if(/^capp-local:(model|audio)$/.test(String(value)))return localConnection(String(value).split(':')[1]);
 let url;try{url=new URL(String(value).trim());}catch{throw Error('Paste the complete private asset storage link.');}
 const token=new URLSearchParams(url.hash.slice(1)).get('storage');
 const transport=url.protocol==='https:'||(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port);
 if(!transport||url.pathname!=='/'||url.search||url.username||url.password||!/^[A-Za-z0-9_-]{40,100}$/.test(token||''))throw Error('Use a local 127.0.0.1 storage link or a configured HTTPS storage link.');
 return {origin:url.origin,token,link:url.href};
}
export async function assetDigest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
export class AssetStoreClient{
 constructor({fetch=globalThis.fetch}={}){this.fetch=fetch.bind(globalThis);this.connection=null;this.status=null;}
 async request(route,{method='GET',value,body,raw=false,timeout=180000}={}){
  if(!this.connection)throw Error('Connect Asset storage before saving.');
  if(this.connection?.local)return localFileRequest(this.connection.role,route,{method,value,body,raw,rootId:this.status?.rootId});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const r=await this.fetch(this.connection.origin+'/v1/'+route,{method,headers:{Authorization:'Bearer '+this.connection.token,...(value!==undefined?{'Content-Type':'application/json'}:{})},body:value!==undefined?JSON.stringify(value):body,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
   if(!r.ok){const detail=await r.json().catch(()=>({})),e=Error(detail.error||'Asset storage returned '+r.status+'.');e.status=r.status;throw e;}
   return raw?new Uint8Array(await r.arrayBuffer()):r.json();
  }catch(e){if(e instanceof TypeError||e.name==='AbortError'){const error=Error('Asset storage is unavailable. Keep its service running and retry. Your current work is retained.');error.network=true;throw error;}throw e;}finally{clearTimeout(timer);}
 }
 async connect(link,role){link=link||('capp-local:'+(role||'model'));const connection=assetConnection(link),previous=this.connection;const oldStatus=this.status;this.status=null;this.connection=connection;try{const status=connection.local?await localFileRequest(connection.role,'status',{connect:true}):await this.request('status',{timeout:10000});if(!Object.values(ASSET_STORE_PROTOCOLS).includes(status.protocol)||(role&&status.protocol!==ASSET_STORE_PROTOCOLS[role]))throw Error('This connection is not the required '+(role||'asset')+' library.');this.status=status;return status;}catch(e){this.connection=previous;this.status=oldStatus;throw e;}}
 async encode(value,upload=true){
  if(value instanceof Blob){const bytes=await value.arrayBuffer(),sha256=await assetDigest(bytes);if(upload){const known=this.status?.protocol===ASSET_STORE_PROTOCOLS.audio?await this.request('blob-info/'+sha256):null;if(!known?.exists||known.size!==value.size){if(this.connection?.local&&this.status?.chunkedBlobs&&value.size>(this.status.blobChunkBytes||8*1024**2)){const step=this.status.blobChunkBytes;for(let offset=0;offset<value.size;offset+=step)await this.request('blob-chunks/'+sha256+'/'+offset,{method:'PUT',value:{size:value.size},body:value.slice(offset,offset+step)});}else await this.request('blobs/'+sha256,{method:'PUT',body:value});}}return {$blob:{sha256,size:value.size,type:value.type||'audio/wav'}};}
  if(Array.isArray(value)){const out=[];for(const row of value)out.push(await this.encode(row,upload));return out;}
  if(value&&typeof value==='object'){const out={};for(const [key,row]of Object.entries(value))if(row!==undefined)Object.defineProperty(out,key,{value:await this.encode(row,upload),enumerable:true,writable:true,configurable:true});return out;}return value;
 }
 async decode(value){
  if(value instanceof Blob)return value;
  if(value&&typeof value==='object'&&Object.hasOwn(value,'$blob')){const ref=value.$blob;let bytes;if(this.connection?.local&&this.status?.chunkedBlobs&&ref.size>(this.status.blobChunkBytes||8*1024**2)){const info=await this.request('blob-info/'+ref.sha256);if(!info.exists||info.size!==ref.size)throw Error('Stored asset size mismatch.');bytes=new Uint8Array(ref.size);const step=this.status.blobChunkBytes;for(let offset=0;offset<ref.size;offset+=step){const data=await this.request('blob-chunks/'+ref.sha256+'/'+offset,{raw:true});if(data.length!==Math.min(step,ref.size-offset))throw Error('Stored chunk size mismatch.');bytes.set(data,offset);}}else bytes=await this.request('blobs/'+ref.sha256,{raw:true});if(bytes.length!==ref.size||await assetDigest(bytes)!==ref.sha256)throw Error('Stored asset checksum mismatch.');return new Blob([bytes],{type:ref.type});}
  if(Array.isArray(value))return Promise.all(value.map(row=>this.decode(row)));
  if(value&&typeof value==='object'){const out={};for(const [key,row]of Object.entries(value))Object.defineProperty(out,key,{value:await this.decode(row),enumerable:true,writable:true,configurable:true});return out;}return value;
 }
}
