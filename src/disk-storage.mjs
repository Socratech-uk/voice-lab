import {AssetStoreClient,assetConnection,assetDigest} from './asset-connection.mjs';

export const AUDIO_DISK_KEY='capp.voice-lab.disk.connection.v1';
export const AUDIO_DATABASES={voice:['characters','types','dialogues','takes','audio'],sounds:['assets','audio'],projects:['assets','audio'],organizer:['items','folders'],preferences:['items']};
export const AUDIO_PREFERENCES=['capp.voice-lab.preferences.v2','capp.voice-lab.dialogue.preferences.v1'];
const diskIDBRequest=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
const diskClone=value=>structuredClone(value);
const diskKey=(database,row)=>row[database==='organizer'||database==='preferences'?'key':'id'];
const diskEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const diskCanonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);

// The existing library validators run unchanged against an isolated transaction.
// Only its final operations are committed; IndexedDB is never the write authority.
export function diskTransactionStores(database,snapshot,allowed,client){
 const stores=Object.fromEntries(Object.entries(snapshot).map(([name,rows])=>[name,new Map(Object.entries(rows))]));
 const operations=[],requests=[];let failure=null,tail=Promise.resolve();
 const request=fn=>{const result={};const job=tail.then(async()=>{if(failure)throw failure;return fn();});tail=job.catch(e=>{failure=e;});requests.push(job);job.then(value=>{result.result=value;result.onsuccess?.();},error=>{result.error=error;result.onerror?.();});return result;};
 const api=name=>{
  if(!allowed.includes(name))throw Error('Store is outside this transaction.');
  const records=stores[name];
  const indexValue=(row,index)=>index==='characterType'?[row.characterId,row.typeId]:row[index];
  const matches=(row,index,key)=>key===undefined||(!index?diskEqual(diskKey(database,row),key):index==='tags'?row.tags?.includes(key):diskEqual(indexValue(row,index),key));
  const source=index=>({get:key=>request(async()=>{const row=[...records.values()].find(r=>matches(r,index,key));return row===undefined?undefined:client.decode(diskClone(row));}),getAll:key=>request(()=>Promise.all([...records.values()].filter(r=>matches(r,index,key)).map(r=>client.decode(diskClone(r))))),count:key=>request(()=>[...records.values()].filter(r=>matches(r,index,key)).length)});
  const write=(value,add)=>request(()=>{const row=diskClone(value),key=diskKey(database,row);if(typeof key!=='string'||!key)throw Error('Missing record identity.');if(add&&records.has(key))throw Error('That record ID already exists.');if(database==='voice'&&['characters','types'].includes(name)&&[...records].some(([id,v])=>id!==key&&v.nameKey===row.nameKey))throw Error('That character or dialogue type name already exists.');records.set(key,row);operations.push({type:'put',store:name,key,value:row});return key;});
  return {...source(null),index:name=>source(name),put:value=>write(value,false),add:value=>write(value,true),delete:key=>request(()=>{records.delete(key);operations.push({type:'delete',store:name,key});})};
 };
 return {store:api,operations,async done(){await Promise.all(requests);if(failure)throw failure;}};
}

export class AudioDiskStorage{
 constructor({client=new AssetStoreClient(),storage,onChange=()=>{}}={}){this.client=client;try{this.storage=storage===undefined?globalThis.localStorage:storage;}catch{this.storage=null;}this.onChange=onChange;this.ready=false;this.connecting=false;this.pending=0;this.error='';this.message='Connect audio storage to save permanently.';this.registrations=new Map();this.queue=Promise.resolve();this.uncertain=null;this.preferences=new Map();this.preferenceBaseline=new Map();this.preferenceTimer=null;}
 notify(message){if(message!==undefined)this.message=message;this.onChange(this);}
 register(database,library,method,stores){const legacy=library[method].bind(library);this.registrations.set(database,{library,legacy,method,stores});library[method]=(...args)=>{const [allowed,mode,work]=database==='voice'?args:[stores,...args];return this.transaction(database,allowed,mode,work,()=>legacy(...args));};return library;}
 async migrate(){
  this.cacheWarnings=[];
  const databases=Object.fromEntries(Object.entries(AUDIO_DATABASES).map(([db,stores])=>[db,Object.fromEntries(stores.map(s=>[s,{}]))]));
  for(const [database,{legacy,stores}]of this.registrations){
   this.notify('Reading existing '+database+' browser records…');
   const work=async s=>Object.fromEntries(await Promise.all(stores.map(async name=>[name,await diskIDBRequest(s(name).getAll())])));
   let rows;try{rows=await (database==='voice'?legacy(stores,'readonly',work):legacy('readonly',work));}catch(e){this.cacheWarnings.push(database+': '+e.message);continue;}
   for(const [name,values]of Object.entries(rows))for(const row of values){const key=diskKey(database,row);Object.defineProperty(databases[database][name],key,{value:await this.client.encode(row),enumerable:true});}
  }
  for(const key of AUDIO_PREFERENCES){let value;try{value=this.storage?.getItem(key);}catch{}if(value!==null&&value!==undefined)databases.preferences.items[key]={key,value};}
  for(const [key,value]of this.preferences)databases.preferences.items[key]={key,value};
  const fingerprint=await assetDigest(new TextEncoder().encode(diskCanonical(databases)));
  // Unmodified browser originals are migration sources only. Do not migrate them again after disk edits/deletes.
  const marker='capp.voice-lab.disk.migrated.'+await assetDigest(new TextEncoder().encode(this.client.status.root));
  let prior;try{prior=this.storage?.getItem(marker);}catch{}
  if(prior===fingerprint){
   // Server import ledger is authoritative, including recovery files and deletion history.
   this.notify('Checking the retained migration on disk…');
  }
  this.notify('Verifying browser records in the permanent audio folder…');
  const report=await this.client.request('migrate',{method:'POST',value:{databases}});
  try{this.storage?.setItem(marker,fingerprint);}catch{}
  return report;
 }
 async connect(link){
  if(this.pending||this.connecting)throw Error('Wait for the current audio storage operation.');
  this.connecting=true;this.ready=false;this.notify('Connecting audio storage…');
  try{
   if(this.uncertain){const candidate=assetConnection(link||'capp-local:audio');if(candidate.origin!==this.uncertain.origin)throw Error('Resolve the pending save on the current audio connection before switching services.');}
   await this.client.connect(link,'audio');
   if(this.uncertain&&this.client.status.root!==this.uncertain.root)throw Error('The connected folder changed while a save was pending. Reconnect the original audio folder.');
   if(this.uncertain){await this.client.request(this.uncertain.route,{method:'POST',value:this.uncertain.value});this.uncertain=null;}
   const report=await this.migrate();this.report=report;this.ready=true;this.error='';
   try{this.storage?.setItem(AUDIO_DISK_KEY,this.client.connection.link);}catch{}
   const preferences=await this.client.request('db/preferences');
   for(const key of AUDIO_PREFERENCES){const row=preferences.stores.items[key],pending=this.preferences.get(key);if(report.recovered&&pending!==undefined&&this.preferenceBaseline.has(key)&&row?.value!==this.preferenceBaseline.get(key)&&row?.value!==pending)this.preferences.delete(key);this.preferenceBaseline.set(key,row?.value);if(row&&!this.preferences.has(key)){try{this.storage?.setItem(key,row.value);}catch{}}}
   const native=this.client.status.legacyMigration,nativeNote=native?' Native drafts: '+native.copied+' copied, '+native.unchanged+' already retained'+(native.errors?.length?', '+native.errors.length+' could not migrate; see _service/legacy-import-report.json.':'.'):'';
   this.notify((report.recovered?'Audio connected. Conflicting browser records were preserved at '+report.path:report.records+' browser records verified on disk. Future saves use '+this.client.status.root+'.')+nativeNote+(this.cacheWarnings.length?' Browser recovery is incomplete: '+this.cacheWarnings.join('; '):''));
   if(this.preferences.size)await this.flushPreferences();
   return report;
  }catch(e){this.ready=false;this.error=e.message;this.notify(e.message);throw e;}finally{this.connecting=false;this.notify();}
 }
 async restore(){let link;try{link=this.storage?.getItem(AUDIO_DISK_KEY);}catch{}if(link)return this.connect(link);}
 transaction(database,stores,mode,work,legacy){
  if(this.connecting&&!this.ready){if(mode==='readonly'&&legacy)return legacy();return Promise.reject(Error('Audio migration is running. Wait for it to finish.'));}
  if(!this.ready){if(mode==='readonly'&&legacy)return legacy();return Promise.reject(Error('Connect Asset storage before saving. This work has not been saved to disk.'));}
  this.pending++;this.notify();
  const operation=async()=>{
   if(this.uncertain){await this.client.request(this.uncertain.route,{method:'POST',value:this.uncertain.value});this.uncertain=null;throw Error('The previous save is now verified on disk. Refresh the library before saving again.');}
   const snapshot=await this.client.request('db/'+database),tx=diskTransactionStores(database,snapshot.stores,stores,this.client);
   const result=await work(tx.store);await tx.done();
   if(mode==='readwrite'&&tx.operations.length){
    const value={expectedRevision:snapshot.revision,requestId:crypto.randomUUID(),operations:await this.client.encode(tx.operations)},route='db/'+database+'/transaction';
    try{await this.client.request(route,{method:'POST',value});}catch(e){if(!e.network)throw e;this.uncertain={route,value,origin:this.client.connection.origin,root:this.client.status.root};try{await this.client.request(route,{method:'POST',value});this.uncertain=null;}catch(retry){throw retry;}}
    this.error='';this.notify('Saved to '+this.client.status.root+'.');
    try{this.registrations.get(database)?.library.onChange?.();}catch{}
   }
   return result;
  };
  const result=this.queue.then(operation);this.queue=result.catch(()=>{});
  return result.catch(e=>{this.error=e.message;this.notify(e.message);throw e;}).finally(()=>{this.pending--;this.notify();});
 }
 setPreference(key,value){if(!AUDIO_PREFERENCES.includes(key))throw Error('Unknown authoring preference.');try{this.storage?.setItem(key,value);}catch{}this.preferences.set(key,value);clearTimeout(this.preferenceTimer);this.notify('Authoring settings have pending disk changes.');if(this.ready)this.preferenceTimer=setTimeout(()=>void this.flushPreferences().catch(e=>this.notify(e.message)),350);}
 archiveProject(project,metadata,blob){
  if(!this.ready||this.connecting)return Promise.reject(Error('Connect Asset storage before saving a project draft.'));
  this.pending++;this.notify();
  const task=this.queue.then(async()=>{const value={project:{id:project.id||project.projectId,name:project.name,root:project.root},metadata,blob:await this.client.encode(blob)};let result;try{result=await this.client.request('project-draft',{method:'POST',value});}catch(e){if(!e.network)throw e;result=await this.client.request('project-draft',{method:'POST',value});}this.error='';this.notify('Project draft retained in '+this.client.status.root+'.');return result;});this.queue=task.catch(()=>{});
  return task.catch(e=>{this.error=e.message;this.notify(e.message);throw e;}).finally(()=>{this.pending--;this.notify();});
 }
 async flushPreferences(){
  clearTimeout(this.preferenceTimer);if(!this.ready||!this.preferences.size)return;
  const values=new Map(this.preferences);
  await this.transaction('preferences',['items'],'readwrite',async s=>{for(const [key,value]of values){const current=await diskIDBRequest(s('items').get(key));if(current?.value!==this.preferenceBaseline.get(key)&&current?.value!==value)throw Error('Authoring settings changed in another window. Retry / refresh preserves your pending copy for recovery and loads the disk settings.');await diskIDBRequest(s('items').put({key,value}));}});
  for(const [key,value]of values){this.preferenceBaseline.set(key,value);if(this.preferences.get(key)===value)this.preferences.delete(key);}this.notify();
 }
}
