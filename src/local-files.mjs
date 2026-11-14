// Shared native transport. Remote connections remain explicit and independent.
export function localFiles(){return globalThis.capp?.files?.protocol==='capp.files.v1'?globalThis.capp.files:null;}
export async function waitForLocalFiles(){
 if(localFiles())return localFiles();
 if(!globalThis.__CAPP_PACKAGED_RUNTIME__)return null;
 for(let i=0;i<80;i++){await new Promise(resolve=>setTimeout(resolve,50));if(localFiles())return localFiles();}
 return null;
}
export function localConnection(role){return {local:true,role,origin:'capp-local:'+role,base:'capp-local:project',link:'capp-local:'+role};}
export async function localFileRequest(service,route,{method='GET',value,body,raw=false,workspace='',rootId,connect=false}={}){
 const api=localFiles();if(!api)throw Error('Local folders need the Files sidecar in a freshly compiled Windows app.');
 const payload={service,route,method,...(value!==undefined?{value}:{}),...(workspace?{workspace}:{}),...(rootId?{rootId}:{}),...(connect?{connect:true}:{})};
 if(body!==undefined){const bytes=body instanceof Blob?new Uint8Array(await body.arrayBuffer()):new Uint8Array(body);let binary='';for(let n=0;n<bytes.length;n+=16384)binary+=String.fromCharCode(...bytes.subarray(n,n+16384));payload.data=btoa(binary);}
 let result;try{result=await api.request(payload);}catch(error){if(!error.status)error.network=true;throw error;}
 if(raw){if(typeof result?.binary!=='string')throw Error('Invalid Files response.');const binary=atob(result.binary);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
 return result;
}
export async function saveLocalCapture(blob,name){
 const api=localFiles();if(!api)return false;
 const status=await localFileRequest('project','local/status'),rootId=status.shared.rootId;
 if(!status.shared.available)throw Error('The shared assets folder is unavailable. Your capture has not been saved.');
 const folder='3d/captures';
 for(const path of ['3d',folder]){
   const inspect=()=>localFileRequest('project','local/inspect?scope=shared&path='+encodeURIComponent(path));
   let entry;try{entry=await inspect();}catch{
     try{await localFileRequest('project','local/mutate',{method:'POST',value:{operation:'mkdir',scope:'shared',path,rootId}});}catch(error){entry=await inspect().catch(()=>{throw error;});}
   }
   if(entry&&(!entry.directory||entry.rootId!==rootId))throw Error('The capture folder changed. Reconnect shared assets before saving.');
 }
 const safe=String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(-140);
 const path=folder+'/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8)+'-'+safe;
 const data=new Uint8Array(await blob.arrayBuffer());let binary='';for(let n=0;n<data.length;n+=16384)binary+=String.fromCharCode(...data.subarray(n,n+16384));
 await localFileRequest('project','local/mutate',{method:'POST',value:{operation:'upload',scope:'shared',path,rootId,data:btoa(binary)}});
 return status.shared.root+'/'+path;
}
