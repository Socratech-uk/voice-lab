import {localFiles,localFileRequest} from './local-files.mjs';
// Portable metadata and chunked transfer; native cApp owns folder access.
export class ProjectAudioSession {
  constructor(bridge){this.bridge=bridge;this.client=null;this.project=null;this.busy=false;}
  connect(){if(!this.client){const api=this.bridge.local();if(typeof api.audioProjects?.connect!=='function')throw Error('Project audio needs Local AI 0.16.0 or later, with Project audio folders enabled in a freshly compiled Windows package.');this.client=api.audioProjects.connect({protocol:'capp.audio-project-client.v1',clientName:'Voice Lab · project audio'});}return this.client;}
  async operation(fn){if(this.busy)throw Error('Wait for the current project audio operation.');this.busy=true;try{return await fn();}finally{this.busy=false;}}
  async open(){if(localFiles())return this.operation(async()=>{const opened=await localFileRequest('project','projects/open',{method:'POST',value:{}});if(opened.cancelled)return opened;this.workspace=opened.workspace;const result=await localFileRequest('project','audio/info',{workspace:this.workspace});this.project=result.project;return result;});return this.operation(async()=>{const r=await this.connect().open();if(!r.cancelled)this.project=r.project;return r;});}
  async close(){return this.operation(async()=>{if(this.project&&!this.workspace)await this.connect().close();this.workspace=null;this.project=null;});}
  requireProject(){if(!this.project)throw Error('Open an audio project first.');return this.connect();}
  async list(options={}){if(this.workspace)return this.operation(()=>localFileRequest('project','audio/list',{method:'POST',workspace:this.workspace,value:{collection:'drafts',offset:0,limit:20,...options}}));return this.operation(()=>this.requireProject().list({collection:'drafts',offset:0,limit:20,...options}));}
  async stage(metadata,blob,onProgress=()=>{}){
    return this.operation(async()=>{
      if(this.workspace){const r=await localFileRequest('project','audio/stage',{method:'POST',workspace:this.workspace,value:{metadata,expectedProjectId:this.project.projectId},body:blob});onProgress(blob.size,blob.size);return r.asset;}
      const client=this.requireProject();if(!(blob instanceof Blob)||blob.size<44||blob.size>317_520_064)throw Error('Choose a WAV within the 30-minute audio limit.');
      let started=false;try{
        const begin=await client.begin({metadata,bytes:blob.size});started=true;
        if(!Number.isInteger(begin.chunkBytes)||begin.chunkBytes<1||begin.chunkBytes>524288)throw Error('Invalid project chunk size.');
        for(let offset=0;offset<blob.size;offset+=begin.chunkBytes){const b=new Uint8Array(await blob.slice(offset,offset+begin.chunkBytes).arrayBuffer());let raw='';for(let n=0;n<b.length;n+=16384)raw+=String.fromCharCode(...b.subarray(n,n+16384));const r=await client.append({offset,data:btoa(raw)});if(r.bytes!==offset+b.length)throw Error('Draft transfer did not confirm the expected bytes.');onProgress(r.bytes,blob.size);}
        const r=await client.finish();started=false;return r.asset;
      }finally{if(started)await client.abort().catch(()=>{});}
    });
  }
  async read(row,collection){return this.operation(async()=>{
    if(this.workspace){const bytes=await localFileRequest('project','audio/read',{method:'POST',workspace:this.workspace,value:{id:row.id,sha256:row.wav.sha256,collection},raw:true});return new Blob([bytes],{type:'audio/wav'});}
    const client=this.requireProject(),parts=[];let offset=0;
    const size=row.wav?.bytes;if(!Number.isInteger(size)||size<44||size>317_520_064)throw Error('Invalid recording size.');
    while(offset<size){const r=await client.read({id:row.id,sha256:row.wav.sha256,collection,offset});const raw=atob(r.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(r.offset!==offset||r.bytes!==size||!bytes.length||bytes.length>524288||r.nextOffset!==offset+bytes.length||r.nextOffset>size)throw Error('Incomplete project recording.');parts.push(bytes);offset=r.nextOffset;}
    const blob=new Blob(parts,{type:'audio/wav'}),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==row.wav.sha256)throw Error('Project recording changed while it was being read. Refresh and retry.');return blob;
  });}
  async approve(row){if(this.workspace)return this.operation(()=>localFileRequest('project','audio/approve',{method:'POST',workspace:this.workspace,value:{id:row.id,sha256:row.wav.sha256,expectedProjectId:this.project.projectId}}));return this.operation(()=>this.requireProject().approve({id:row.id,sha256:row.wav.sha256}));}
  dispose(){this.client?.dispose();this.project=null;}
}
export function projectSoundMetadata(row){
  return {title:row.title,kind:row.assetType==='reference'?'dialogue':row.assetType||row.kind,category:row.category||'',subject:row.subject||'',tags:row.tags||[],notes:row.notes||'',source:{protocol:'capp.voice-lab.audio-assets.v1',id:row.id,revision:row.revision,assetType:row.assetType,origin:row.origin,recipe:row.recipe,lineage:row.lineage,result:row.result}};
}
export function projectDialogueMetadata(take,line={},category='Dialogue'){
  const {audioWav,...source}=take;
  return {title:line.title||take.character+' · dialogue',kind:'dialogue',category,subject:take.character||'',tags:line.tags||[],notes:line.notes||take.notes||'',source:{protocol:'capp.voice-lab.take.v1',...source}};
}
