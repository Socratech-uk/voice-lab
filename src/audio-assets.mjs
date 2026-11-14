import {pcmWav,pcmEdit,pcmSlice,pcmAppend,AUDIO_TRACK_LIMIT} from './audio-edit.mjs';
// Sound/music assets use a separate database, preserving the character library.
export const AUDIO_ASSET_PROTOCOL='capp.voice-lab.audio-assets.v1';
export const AUDIO_BATCH_PROTOCOL='capp.voice-lab.audio-batch.v1';
export const AUDIO_MODELS=Object.freeze({sfx:'sa3-sfx',music:'sa3-music'});
export const AUDIO_MODEL_OPTIONS=Object.freeze({'sa3-sfx':{label:'Small · sound effects',max:120,kinds:['sfx']},'sa3-music':{label:'Small · music',max:120,kinds:['music']},'sa3-medium':{label:'Medium · music & sound',max:380,kinds:['sfx','music']}});
const assetReq=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
const assetKey=s=>s.normalize('NFKC').trim().toLocaleLowerCase('en-US');
function assetCheck(ok,message){if(!ok)throw new Error(message);}
function assetText(v,max,required=false){assetCheck(typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v),'Invalid audio asset text.');v=v.trim();assetCheck(!required||v,'A title and sound description are required.');return v;}
export function audioRecipe(v){
  assetCheck(v&&Object.hasOwn(AUDIO_MODELS,v.kind),'Choose Sound effect or Music.');
  const model=v.model||AUDIO_MODELS[v.kind],spec=AUDIO_MODEL_OPTIONS[model],device=v.device||'cpu';
  assetCheck(spec&&spec.kinds.includes(v.kind)&&['cpu','gpu'].includes(device)&&(v.steps===undefined||v.steps===8),'Choose a supported model and CPU or Windows GPU.');
  const prompt=assetText(v.prompt,2000,true),durationSeconds=v.durationSeconds,seed=v.seed;
  assetCheck(Number.isFinite(durationSeconds)&&durationSeconds>=1&&durationSeconds<=spec.max,`Duration must be 1–${spec.max} seconds for this model.`);
  assetCheck(Number.isInteger(seed)&&seed>=0&&seed<=2147483647,'Seed must be an integer from 0 to 2147483647.');
  return {kind:v.kind,model,prompt,durationSeconds,seed,device,steps:8};
}
export function inspectAssetWav(encoded){
  assetCheck(typeof encoded==='string'&&encoded.length<=423_360_064,'Audio exceeds the 30-minute stereo limit.');
  let bytes;try{const binary=atob(encoded);bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);}catch{throw new Error('Invalid WAV encoding.');}
  return pcmWav(bytes);
}
export function assetBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}

function assetRow(value){
  const recipe=value.recipe===null?null:audioRecipe(value.recipe||value),id=value.id||globalThis.crypto.randomUUID();
  assetCheck(typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(id),'Invalid asset ID.');
  const tags=value.tags||[];assetCheck(Array.isArray(tags)&&tags.length<=32,'Use up to 32 tags.');
  const category=assetText(value.category||'',80),subject=assetText(value.subject||'',120);
  return {id,assetType:['sfx','music','ambience','dialogue','reference'].includes(value.assetType)?value.assetType:(recipe?.kind||(['music','sfx'].includes(value.kind)?value.kind:'music')),title:assetText(value.title||recipe?.prompt.slice(0,80)||'Imported audio',160,true),kind:recipe?.kind||(['music','sfx'].includes(value.kind)?value.kind:'music'),category,categoryKey:assetKey(category),subject,
    tags:[...new Set(tags.map(t=>assetKey(assetText(t,64,true))))],notes:assetText(value.notes||'',12000),recipe,revision:value.revision};
}
function assetLineage(value){if(value==null)return null;assetCheck(value&&typeof value.source?.id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value.source.id)&&Number.isInteger(value.source.revision)&&value.source.revision>0,'Invalid source identity.');assetCheck(Array.isArray(value.operations)&&value.operations.length<=100&&JSON.stringify(value.operations).length<=16000,'Invalid edit history.');return JSON.parse(JSON.stringify(value));}
export class AudioAssetLibrary {
  constructor({indexedDB=globalThis.indexedDB,name='capp.voice-lab.audio-assets.v1',onRecorded=async()=>{},onChange=()=>{}}={}){this.onChange=onChange;this.onRecorded=onRecorded;this.idb=indexedDB;this.name=name;this.db=null;this.opening=null;}
  async open(){if(this.db)return this;if(!this.opening)this.opening=new Promise((ok,no)=>{
    if(!this.idb){no(new Error('Audio library storage is unavailable.'));return;}
    const r=this.idb.open(this.name,1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('assets',{keyPath:'id'});s.createIndex('kind','kind');s.createIndex('categoryKey','categoryKey');s.createIndex('tags','tags',{multiEntry:true});r.result.createObjectStore('audio',{keyPath:'id'});};
    r.onerror=()=>no(r.error);r.onblocked=()=>no(new Error('Close older audio-library windows and reopen.'));
    r.onsuccess=()=>{this.db=r.result;this.db.onversionchange=()=>this.close();ok(this);};});return this.opening;}
  close(){this.db?.close();this.db=null;this.opening=null;}
  async tx(mode,fn){await this.open();return new Promise((ok,no)=>{const t=this.db.transaction(['assets','audio'],mode);let result,failure;t.oncomplete=()=>{if(mode==='readwrite'){try{this.onChange();}catch{}}ok(result);};t.onabort=()=>no((failure||t.error)?.name==='QuotaExceededError'?new Error('Storage is full. Download the unsaved recording, export a backup, then free space.'):failure||t.error);t.onerror=()=>{};Promise.resolve().then(()=>fn(n=>t.objectStore(n))).then(v=>{result=v;},e=>{failure=e;try{t.abort();}catch{no(e);}});});}
  async list({kind='',category='',query='',tag='',offset=0,limit=50}={}){
    assetCheck(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>=1&&limit<=200,'Invalid asset page.');
    return this.tx('readonly',async s=>{const store=s('assets'),source=kind?store.index('kind'):category?store.index('categoryKey'):tag?store.index('tags'):store;
      let rows=await assetReq(source.getAll(kind||assetKey(category)||assetKey(tag)||undefined));const q=assetKey(query);
      rows=rows.filter(r=>(!category||r.categoryKey===assetKey(category))&&(!tag||r.tags.includes(assetKey(tag)))&&(!q||assetKey([r.title,r.subject,r.category,r.notes,r.recipe?.prompt,...r.tags].join(' ')).includes(q))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
      return {items:rows.slice(offset,offset+limit),total:rows.length,offset,limit};});
  }
  async get(id,{audio=false}={}){const [row,record]=await this.tx('readonly',s=>Promise.all([assetReq(s('assets').get(id)),audio?assetReq(s('audio').get(id)):null]));if(!row)return null;if(audio&&row.state==='ready'){assetCheck(record?.blob,'Saved audio is missing. Restore a backup.');row.audioWav=assetBase64(new Uint8Array(await record.blob.arrayBuffer()));}return row;}
  async blob(id){const r=await this.tx('readonly',s=>assetReq(s('audio').get(id)));assetCheck(r?.blob,'Saved audio is missing.');return r.blob;}
  async save(value){const row=assetRow(value);return this.tx('readwrite',async s=>{
    const old=await assetReq(s('assets').get(row.id));assetCheck(old?value.revision===old.revision:!value.revision,'This asset changed in another window. Reload it before saving.');
    assetCheck(!old||old.state==='draft'||JSON.stringify(row.recipe)===JSON.stringify(old.recipe),'Create a new variation to change a saved generation recipe.');
    assetCheck(old||row.recipe,'Imported audio must be saved with its recording.');
    const now=new Date().toISOString(),saved={...row,origin:old?.origin||'generation',lineage:old?.lineage||null,state:old?.state||'draft',result:old?.result||null,revision:(old?.revision||0)+1,createdAt:old?.createdAt||now,updatedAt:now};await assetReq(s('assets').put(saved));return saved;}).then(async row=>{if(row.state==='ready')await this.onRecorded(row);return row;});}
  async importBatch(batch){assetCheck(batch?.protocol===AUDIO_BATCH_PROTOCOL&&Array.isArray(batch.items)&&batch.items.length>0&&batch.items.length<=100,'Use an audio batch with 1–100 items.');
    const rows=batch.items.map(assetRow);assetCheck(rows.every(r=>r.recipe),'Batch drafts require generation recipes.');assetCheck(new Set(rows.map(r=>r.id)).size===rows.length,'Duplicate IDs in batch.');
    return this.tx('readwrite',async s=>{const result=[];for(const row of rows){assetCheck(!await assetReq(s('assets').get(row.id)),'An asset ID already exists. Nothing was imported.');const now=new Date().toISOString(),v={...row,state:'draft',result:null,revision:1,createdAt:now,updatedAt:now};await assetReq(s('assets').add(v));result.push(v);}return result;});}
  async record(id,revision,result){const info=inspectAssetWav(result.audioWav),blob=new Blob([info.bytes],{type:'audio/wav'});
    return this.tx('readwrite',async s=>{const row=await assetReq(s('assets').get(id));assetCheck(row&&row.revision===revision&&row.state==='draft','Asset changed during rendering. Download the unsaved recording.');
      assetCheck((result.device===undefined||result.device===row.recipe.device)&&result.model===row.recipe.model&&result.seed===row.recipe.seed&&Math.abs(info.durationSeconds-row.recipe.durationSeconds)<0.02,'Engine response does not match the requested asset.');
      row.result={model:result.model,modelRevision:assetText(result.modelRevision||'',80),seed:result.seed,deviceName:assetText(result.deviceName||'',160),generationMs:Number(result.generationMs)||0,durationSeconds:info.durationSeconds,sampleRate:info.sampleRate,channels:info.channels};row.state='ready';row.revision++;row.updatedAt=new Date().toISOString();
      await assetReq(s('audio').add({id,blob}));await assetReq(s('assets').put(row));return row;}).then(async row=>{await this.onRecorded(row);return row;});}
  async saveMedia({metadata={},bytes,audioWav,source=null,operations=[],recipe=null,generation=null,origin=source?'edit':'import',notify=true}={}){
    const info=bytes?pcmWav(bytes):inspectAssetWav(audioWav),blob=new Blob([info.bytes],{type:'audio/wav'});
    const lineage=assetLineage(source?{source,operations}:null),row=assetRow({...metadata,id:undefined,recipe});
    assetCheck(['import','edit','extension'].includes(origin),'Invalid audio origin.');
    return this.tx('readwrite',async s=>{if(source){const parent=await assetReq(s('assets').get(source.id));assetCheck(parent?.state==='ready'&&parent.revision===source.revision,'Source changed. Reopen it before saving this edit.');}
      const now=new Date().toISOString(),saved={...row,origin,lineage,revision:1,state:'ready',createdAt:now,updatedAt:now,result:{...(generation||{}),durationSeconds:info.durationSeconds,sampleRate:info.sampleRate,channels:info.channels}};
      await assetReq(s('assets').add(saved));await assetReq(s('audio').add({id:saved.id,blob}));return saved;}).then(async row=>{if(notify)await this.onRecorded(row);return row;});
  }
  async edit(id,revision,edit){const row=await this.get(id);assetCheck(row?.revision===revision&&row.state==='ready','Source changed. Reload it.');const bytes=pcmEdit(new Uint8Array(await (await this.blob(id)).arrayBuffer()),edit);
    return this.saveMedia({metadata:{...row,title:edit.title||row.title+' · '+edit.operation},bytes,source:{id,revision},operations:[edit]});}
  async remove(id,revision){return this.tx('readwrite',async s=>{const row=await assetReq(s('assets').get(id));assetCheck(row&&row.revision===revision,'Asset changed. Reload it before deleting.');await assetReq(s('assets').delete(id));await assetReq(s('audio').delete(id));});}
  async export({ids}={}){if(ids)assetCheck(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length,'Choose distinct assets to export.');const [items,audio]=await this.tx('readonly',s=>Promise.all([ids?Promise.all(ids.map(id=>assetReq(s('assets').get(id)))):assetReq(s('assets').getAll()),ids?Promise.all(ids.map(id=>assetReq(s('audio').get(id)))):assetReq(s('audio').getAll())]));assetCheck(items.every(Boolean),'An asset was deleted. Refresh before exporting.');const blobs=new Map(audio.filter(Boolean).map(r=>[r.id,r.blob]));
    assetCheck(new Blob([JSON.stringify(items)]).size+[...blobs.values()].reduce((n,b)=>n+Math.ceil(b.size/3)*4,0)<500_000_000,'This backup exceeds 500 MB. Select fewer assets and export them in separate backups.');
    for(const r of items)if(r.state==='ready'){assetCheck(blobs.has(r.id),'Saved audio is missing.');r.audioWav=assetBase64(new Uint8Array(await blobs.get(r.id).arrayBuffer()));}return {protocol:AUDIO_ASSET_PROTOCOL,exportedAt:new Date().toISOString(),items};}
  async import(value){if(value?.protocol===AUDIO_BATCH_PROTOCOL)return this.importBatch(value);
    assetCheck(value?.protocol===AUDIO_ASSET_PROTOCOL&&Array.isArray(value.items)&&value.items.length<=10000,'Invalid audio library backup.');
    const rows=value.items.map(v=>{const row=assetRow(v);assetCheck(['draft','ready'].includes(v.state)&&Number.isInteger(v.revision)&&v.revision>0,'Invalid backup state.');let blob=null,result=null;
      if(v.state==='ready'){const info=inspectAssetWav(v.audioWav);if(!v.origin||v.origin==='generation')assetCheck(row.recipe&&v.result?.model===row.recipe.model&&v.result.seed===row.recipe.seed&&Math.abs(info.durationSeconds-row.recipe.durationSeconds)<.02,'Invalid backup generation metadata.');blob=new Blob([info.bytes],{type:'audio/wav'});result={...v.result,durationSeconds:info.durationSeconds,sampleRate:info.sampleRate,channels:info.channels};}
      assetCheck(['generation','import','edit','extension'].includes(v.origin||'generation'),'Invalid audio origin.');assetCheck(v.state==='ready'||row.recipe,'Draft requires a recipe.');
      const lineage=assetLineage(v.lineage);return {row:{...row,origin:v.origin||'generation',lineage,state:v.state,result,createdAt:assetText(v.createdAt,50,true),updatedAt:assetText(v.updatedAt,50,true)},blob};});
    return this.tx('readwrite',async s=>{for(const {row,blob} of rows){assetCheck(!await assetReq(s('assets').get(row.id)),'Backup overlaps with existing assets. Nothing was imported.');await assetReq(s('assets').add(row));if(blob)await assetReq(s('audio').add({id:row.id,blob}));}return rows.length;});
  }
}
export class AudioWorkshop {
  constructor(bridge,library,onChange=()=>{}){this.bridge=bridge;this.library=library;this.onChange=onChange;this.client=null;this.busy=false;this.cancelled=false;this.status=null;this.progress=null;this.message='Choose a model and load it when you are ready.';this.error='';this.unsaved=null;this.latest=null;}
  notify(){this.onChange();}
  connect(){if(!this.client){const api=this.bridge.local();assetCheck(typeof api.audio?.connect==='function','Sound and music need Local AI 0.15.1 and a freshly compiled Windows package with Audio authoring enabled.');this.client=api.audio.connect({protocol:'capp.local-audio.v1',clientName:'Voice Lab · audio workshop'});}return this.client;}
  async check(){this.status=await this.connect().status();this.notify();return this.status;}
  async operation(fn){assetCheck(!this.busy,'Audio workshop is busy.');this.busy=true;this.cancelled=false;this.error='';this.notify();try{return await fn();}catch(e){this.error=String(e.message||e);throw e;}finally{this.busy=false;this.progress=null;try{this.status=await this.connect().status();}catch{}this.notify();}}
  async prepare(choice,accepted){assetCheck(accepted===true,'Accept the model terms before downloading.');const {model,device='cpu'}=typeof choice==='string'?{model:AUDIO_MODELS[choice]||choice}:choice;assetCheck(AUDIO_MODEL_OPTIONS[model]&&['cpu','gpu'].includes(device),'Invalid audio model or device.');return this.operation(async()=>{this.message='Preparing selected audio model…';this.notify();const r=await this.connect().prepare({model,device,acceptLicense:true,onProgress:p=>{this.progress=p;this.notify();}});this.message='Model ready · '+(r.deviceName||device);return r;});}
  async extend({id,revision,atSeconds,addedSeconds,model,device='cpu',prompt,seed=1}={}){
    assetCheck(!this.unsaved,'Save or download the unsaved recording first.');return this.operation(async()=>{
      const row=await this.library.get(id);assetCheck(row?.state==='ready'&&row.revision===revision,'Source changed. Reopen it.');
      const original=new Uint8Array(await (await this.library.blob(id)).arrayBuffer()),info=pcmWav(original);
      const at=Math.round(atSeconds*44100)/44100;assetCheck(Number.isFinite(at)&&at>=.1&&at<=info.durationSeconds,'Choose a continuation point after the start.');
      const contextSeconds=Math.min(30,at);assetCheck(Number.isFinite(addedSeconds)&&addedSeconds>=1&&at+addedSeconds<=AUDIO_TRACK_LIMIT,'Add at least one second, within the 30-minute track limit.');
      const recipe=audioRecipe({kind:row.kind,model:model||row.recipe?.model||AUDIO_MODELS[row.kind],device,prompt,seed,durationSeconds:contextSeconds+addedSeconds});
      this.message='Continuing from '+at.toFixed(2)+' s…';this.notify();const sourceWav=assetBase64(pcmSlice(original,at-contextSeconds,at));
      const {kind,prompt:description,...request}=recipe,r=await this.connect().render({...request,text:description,sourceWav,onProgress:p=>{this.progress=p;this.notify();}});
      const resultInfo=inspectAssetWav(r.audioWav);assetCheck(r.model===recipe.model&&r.seed===seed&&Math.abs(resultInfo.durationSeconds-recipe.durationSeconds)<.02,'Continuation response did not match the request.');
      const bytes=pcmAppend(pcmSlice(original,0,at),resultInfo.bytes,contextSeconds);
      const media={metadata:{...row,title:row.title+' · continued'},audioWav:assetBase64(bytes),source:{id,revision},operations:[{operation:'continue',atSeconds:at,contextSeconds,addedSeconds,recipe}],origin:'extension',recipe,generation:{...r,audioWav:undefined}};
      this.unsaved={title:media.metadata.title,result:{...r,audioWav:media.audioWav},media};this.notify();const saved=await this.library.saveMedia(media);this.latest=saved;this.unsaved=null;this.message='Continuation saved. Original retained.';return saved;
    });
  }
  async renderBatch({ids}={}){assetCheck(Array.isArray(ids)&&ids.length>0&&ids.length<=100&&new Set(ids).size===ids.length,'Choose 1–100 distinct saved drafts.');assetCheck(!this.unsaved,'Download or save the unsaved recording before rendering again.');
    return this.operation(async()=>{const rows=[];for(const id of ids){const r=await this.library.get(id);assetCheck(r,'Asset not found.');rows.push(r);}const done=[];
      for(let i=0;i<rows.length;i++){if(this.cancelled)break;const row=rows[i];if(row.state==='ready'){done.push(row);continue;}
        this.message=`Rendering ${i+1} / ${rows.length} · ${row.title}`;this.notify();const {kind,prompt,...request}=row.recipe;let r;try{r=await this.connect().render({...request,text:prompt,onProgress:p=>{this.progress=p;this.notify();}});}catch(e){if(this.cancelled)break;throw e;}
        this.unsaved={id:row.id,revision:row.revision,title:row.title,result:r};this.notify();const saved=await this.library.record(row.id,row.revision,r);this.unsaved=null;this.latest=saved;done.push(saved);this.notify();}
      this.message=this.cancelled?`Stopped. ${done.length} completed assets retained.`:`Saved ${done.length} audio assets.`;return done;});}
  async saveUnsaved(){assetCheck(this.unsaved,'No unsaved recording.');const u=this.unsaved,r=u.media?await this.library.saveMedia(u.media):await this.library.record(u.id,u.revision,u.result);this.unsaved=null;this.latest=r;this.notify();return r;}
  async cancel(){this.cancelled=true;await this.client?.cancel();}
  async unload(){assetCheck(!this.busy,'Stop the current operation first.');const r=await this.connect().unload();await this.check();return r;}
  dispose(){this.client?.dispose();}
}
