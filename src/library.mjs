import {dialogueSettings, readDialogueProfile, dialogueProfile, inspectDialogueWav, dialogueBase64} from './dialogue.mjs';

// App-owned persistence. UI and automation call the same transactional boundary.
export const VOICE_LIBRARY_PROTOCOL='capp.voice-lab.library.v1';
const libraryStores=['characters','types','dialogues','takes','audio'];
const libraryKey=value=>value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
const libraryCopy=value=>JSON.parse(JSON.stringify(value));
const libraryRequest=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
export class VoiceLibraryError extends Error {
  constructor(code,message){super(message);this.name='VoiceLibraryError';this.code=code;}
}
function libraryCheck(ok,code,message){if(!ok)throw new VoiceLibraryError(code,message);}
function libraryString(value,name,max=Infinity,required=false){
  libraryCheck(typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value),'invalid',`${name} is invalid.`);
  libraryCheck(!required||value.trim(),'invalid',`${name} is required.`);return value.trim();
}
function libraryId(value){return libraryString(value,'Record ID',128,true);}
function libraryTags(value=[]){
  libraryCheck(Array.isArray(value)&&value.length<=32,'invalid','Use up to 32 tags.');
  return [...new Set(value.map(t=>libraryKey(libraryString(t,'Tag',64,true))))];
}
function libraryRevision(old,value){
  libraryCheck(old?value===old.revision:value===undefined||value===null||value===0,'conflict','This record changed in another window. Reload it before saving.');
}
function libraryMeta(old,id){const now=new Date().toISOString();return {id,revision:(old?.revision||0)+1,createdAt:old?.createdAt||now,updatedAt:now};}
function libraryStorageError(error){
  if(error?.name==='QuotaExceededError')return new VoiceLibraryError('quota','Device storage is full. Export a backup and remove unneeded takes, then retry. Your current take is still in this session.');
  if(error?.name==='ConstraintError')return new VoiceLibraryError('duplicate','That name is already saved. Open the existing character or choose another name.');
  return error;
}
export class VoiceLibrary {
  constructor({indexedDB=globalThis.indexedDB,name='capp.voice-lab.library.v1',onChange=()=>{},onTakeSaved=async()=>{}}={}){
    this.onTakeSaved=onTakeSaved;
    this.indexedDB=indexedDB;this.name=name;this.onChange=onChange;this.db=null;this.opening=null;
  }
  async open(){
    if(this.db)return this;
    if(!this.opening)this.opening=new Promise((resolve,reject)=>{
      if(!this.indexedDB){reject(new VoiceLibraryError('unavailable','Saved library storage is unavailable in this window. Open the installed app.'));return;}
      const request=this.indexedDB.open(this.name,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        const characters=db.createObjectStore('characters',{keyPath:'id'});characters.createIndex('nameKey','nameKey',{unique:true});
        const types=db.createObjectStore('types',{keyPath:'id'});types.createIndex('nameKey','nameKey',{unique:true});
        const lines=db.createObjectStore('dialogues',{keyPath:'id'});
        lines.createIndex('characterId','characterId');lines.createIndex('typeId','typeId');lines.createIndex('characterType',['characterId','typeId']);lines.createIndex('tags','tags',{multiEntry:true});
        const takes=db.createObjectStore('takes',{keyPath:'id'});takes.createIndex('dialogueId','dialogueId');
        db.createObjectStore('audio',{keyPath:'id'});
      };
      request.onerror=()=>reject(libraryStorageError(request.error));
      request.onblocked=()=>reject(new VoiceLibraryError('blocked','Close older Voice Lab windows, then reopen this app.'));
      request.onsuccess=()=>{this.db=request.result;this.db.onversionchange=()=>this.close();resolve(this);};
    });
    return this.opening;
  }
  close(){this.db?.close();this.db=null;this.opening=null;}
  async transaction(stores,mode,work){
    await this.open();
    return new Promise((resolve,reject)=>{
      const tx=this.db.transaction(stores,mode);let result,failure;
      const store=name=>tx.objectStore(name);
      tx.oncomplete=()=>{if(mode==='readwrite'){try{this.onChange();}catch{}}resolve(result);};
      tx.onabort=()=>reject(libraryStorageError(failure||tx.error||new Error('Library save was interrupted.')));
      tx.onerror=()=>{};
      Promise.resolve().then(()=>work(store)).then(value=>{result=value;},error=>{failure=error;try{tx.abort();}catch{reject(libraryStorageError(error));}});
    });
  }
  id(){return globalThis.crypto.randomUUID();}
  async listCharacters({query=''}={}){
    const q=libraryKey(String(query));const rows=await this.transaction(['characters'],'readonly',s=>libraryRequest(s('characters').getAll()));
    return rows.filter(r=>!q||libraryKey([r.name,r.notes,...r.tags].join(' ')).includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
  }
  async catalogue(){
    return this.transaction(['characters','types','dialogues','takes'],'readonly',async s=>{
      const [characters,types,dialogues,takes]=await Promise.all(['characters','types','dialogues','takes'].map(n=>libraryRequest(s(n).getAll())));
      const names=new Map(characters.map(c=>[c.id,c.name])),typeNames=new Map(types.map(t=>[t.id,t.name]));
      return {characters,dialogues:dialogues.map(r=>({...r,character:names.get(r.characterId)||'',type:typeNames.get(r.typeId)||''})),takes:takes.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))};
    });
  }
  async getCharacter(id){
    const [row,audio]=await this.transaction(['characters','audio'],'readonly',s=>Promise.all([libraryRequest(s('characters').get(id)),libraryRequest(s('audio').get('reference:'+id))]));
    if(!row)return null;
    if(row.reference){libraryCheck(audio?.blob,'audio_missing','The saved character audio is missing. Restore a backup.');row.reference={...row.reference,audioWav:dialogueBase64(new Uint8Array(await audio.blob.arrayBuffer()))};}
    return row;
  }
  async saveCharacter(value){
    const id=libraryId(value.id||this.id()),name=libraryString(value.name??value.settings?.character??'','Character name',80,true);
    const settings=dialogueSettings({...value.settings,character:name});
    const notes=libraryString(value.notes||'','Character notes',12000),tags=libraryTags(value.tags);
    let reference=null,blob=null;
    if(value.reference){
      const r=value.reference,info=inspectDialogueWav(r.audioWav,true);
      reference={name:libraryString(r.name||'Character reference','Reference name',120,true),text:libraryString(r.text||'','Reference transcript',1200),duration:info.duration,sampleRate:info.sampleRate};
      blob=new Blob([info.bytes],{type:'audio/wav'});
    }
    return this.transaction(['characters','audio'],'readwrite',async s=>{
      const old=await libraryRequest(s('characters').get(id));libraryRevision(old,value.revision);
      const row={...libraryMeta(old,id),name,nameKey:libraryKey(name),settings,notes,tags,reference};
      await libraryRequest(s('characters').put(row));
      if(blob)await libraryRequest(s('audio').put({id:'reference:'+id,blob}));else await libraryRequest(s('audio').delete('reference:'+id));
      return {...row,reference:reference?{...reference,audioWav:value.reference.audioWav}:null};
    });
  }
  async duplicateCharacter(id){
    const row=await this.getCharacter(id);libraryCheck(row,'missing','Character not found.');
    const names=new Set((await this.listCharacters()).map(c=>c.nameKey));let name,n=1;
    do{name=row.name.slice(0,65)+' (copy'+(n>1?' '+n:'')+')';n++;}while(names.has(libraryKey(name)));
    return this.saveCharacter({...row,id:undefined,revision:undefined,name});
  }
  async listTypes(){return (await this.transaction(['types'],'readonly',s=>libraryRequest(s('types').getAll()))).sort((a,b)=>a.name.localeCompare(b.name));}
  async typeInTransaction(s,name){
    name=libraryString(name,'Dialogue type',80,true);const key=libraryKey(name);
    const old=await libraryRequest(s('types').index('nameKey').get(key));if(old)return old;
    const row={...libraryMeta(null,this.id()),name,nameKey:key};await libraryRequest(s('types').add(row));return row;
  }
  async saveType({id,name,revision}={}){
    return this.transaction(['types'],'readwrite',async s=>{
      if(!id)return this.typeInTransaction(s,name);
      const old=await libraryRequest(s('types').get(id));libraryCheck(old,'missing','Dialogue type not found.');libraryRevision(old,revision);
      name=libraryString(name,'Dialogue type',80,true);const row={...libraryMeta(old,id),name,nameKey:libraryKey(name)};await libraryRequest(s('types').put(row));return row;
    });
  }
  async deleteType(id,revision){
    return this.transaction(['types','dialogues'],'readwrite',async s=>{
      const old=await libraryRequest(s('types').get(id));libraryCheck(old,'missing','Dialogue type not found.');libraryRevision(old,revision);
      libraryCheck(!await libraryRequest(s('dialogues').index('typeId').count(id)),'in_use','This type is still used by dialogue. Reassign those lines before deleting it.');await libraryRequest(s('types').delete(id));
    });
  }
  normaliseDialogue(value){
    const text=libraryString(value.text,'Dialogue text',Infinity,true);
    const status=value.status||'draft';libraryCheck(['draft','ready'].includes(status),'invalid','Choose Draft or Ready.');
    const origin=value.origin||{kind:'manual'};
    libraryCheck(['manual','automation','import'].includes(origin.kind),'invalid','Invalid dialogue origin.');
    return {id:libraryId(value.id||this.id()),revision:value.revision,characterId:libraryId(value.characterId),
      title:libraryString(value.title||text.split('\n')[0].slice(0,80),'Dialogue title',160,true),text,
      notes:libraryString(value.notes||'','Dialogue notes',12000),tags:libraryTags(value.tags),status,
      settings:dialogueSettings(value.settings),origin:{kind:origin.kind,jobId:libraryString(origin.jobId||'','Job ID',128)},
      typeId:value.typeId?libraryId(value.typeId):null,type:value.type===undefined?undefined:libraryString(value.type,'Dialogue type',80)};
  }
  async putDialogue(s,value){
    const row={...value};const old=await libraryRequest(s('dialogues').get(row.id));libraryRevision(old,row.revision);
    libraryCheck(await libraryRequest(s('characters').get(row.characterId)),'missing','Save or select a character first.');
    if(row.type!==undefined)row.typeId=row.type?(await this.typeInTransaction(s,row.type)).id:null;
    if(row.typeId)libraryCheck(await libraryRequest(s('types').get(row.typeId)),'missing','Dialogue type not found.');
    // Once takes exist their character identity must not change silently.
    if(old&&old.characterId!==row.characterId)libraryCheck(!await libraryRequest(s('takes').index('dialogueId').count(row.id)),'has_takes','A line with saved takes cannot move to another character. Save it as a new line.');
    delete row.type;Object.assign(row,libraryMeta(old,row.id));await libraryRequest(s('dialogues').put(row));return row;
  }
  async saveDialogue(value){return this.importDialogues({protocol:'capp.voice-lab.dialogue-batch.v1',items:[value]}).then(rows=>rows[0]);}
  async importDialogues(batch){
    libraryCheck(batch?.protocol==='capp.voice-lab.dialogue-batch.v1'&&Array.isArray(batch.items)&&batch.items.length>0&&batch.items.length<=1000,'invalid','Use a dialogue batch with 1–1,000 records.');
    const rows=batch.items.map(row=>this.normaliseDialogue(row));
    libraryCheck(new Set(rows.map(r=>r.id)).size===rows.length,'duplicate','Batch contains duplicate dialogue IDs.');
    return this.transaction(['characters','types','dialogues','takes'],'readwrite',async s=>{const result=[];for(const row of rows)result.push(await this.putDialogue(s,row));return result;});
  }
  async getDialogue(id){return this.transaction(['dialogues'],'readonly',s=>libraryRequest(s('dialogues').get(id))).then(row=>row||null);}
  async listDialogues({characterId=null,typeId=null,query='',tag='',status='',offset=0,limit=100}={}){
    libraryCheck(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>=1&&limit<=200,'invalid','Invalid library page.');
    const q=libraryKey(String(query)),t=libraryKey(String(tag));
    return this.transaction(['characters','types','dialogues','takes'],'readonly',async s=>{
      const store=s('dialogues');let source=store,key;
      if(characterId&&typeId){source=store.index('characterType');key=[characterId,typeId];}
      else if(characterId){source=store.index('characterId');key=characterId;}
      else if(typeId){source=store.index('typeId');key=typeId;}
      else if(t){source=store.index('tags');key=t;}
      const [rows,characters,types]=await Promise.all([libraryRequest(source.getAll(key)),libraryRequest(s('characters').getAll()),libraryRequest(s('types').getAll())]);
      const names=new Map(characters.map(c=>[c.id,c.name])),typeNames=new Map(types.map(t=>[t.id,t.name]));
      const filtered=rows.map(row=>({...row,character:names.get(row.characterId)||'',type:typeNames.get(row.typeId)||''})).filter(row=>(!status||row.status===status)&&(!t||row.tags.includes(t))&&(!q||libraryKey([row.title,row.text,row.notes,row.character,row.type,...row.tags].join(' ')).includes(q))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
      const items=filtered.slice(offset,offset+limit);
      for(const row of items)row.takeCount=await libraryRequest(s('takes').index('dialogueId').count(row.id));
      return {items,total:filtered.length,offset,limit};
    });
  }
  async saveTake(value){
    const info=inspectDialogueWav(value.audioWav),id=libraryId(value.id||this.id()),dialogueId=libraryId(value.dialogueId);
    const blob=new Blob([info.bytes],{type:'audio/wav'});
    const row={id,dialogueId,createdAt:new Date().toISOString(),text:libraryString(value.text,'Take transcript',Infinity,true),
      character:libraryString(value.character||'','Take character',80),settings:dialogueSettings(value.settings),model:value.model,
      seed:value.seed,deviceName:libraryString(value.deviceName||'','Device',160),generationMs:Number(value.generationMs)||0,
      durationSeconds:info.duration,sampleRate:info.sampleRate,notes:libraryString(value.notes||'','Take notes',12000),
      characterRevision:value.characterRevision||null,dialogueRevision:value.dialogueRevision||null};
    libraryCheck(typeof row.model==='string'&&row.model===row.settings.model&&Number.isInteger(row.seed)&&row.seed===row.settings.seed,'invalid','Take model or seed does not match its settings.');
    return this.transaction(['dialogues','takes','audio'],'readwrite',async s=>{
      libraryCheck(await libraryRequest(s('dialogues').get(dialogueId)),'missing','Save the dialogue before its take.');
      libraryCheck(!await libraryRequest(s('takes').get(id)),'conflict','That take ID already exists.');
      await libraryRequest(s('takes').add(row));await libraryRequest(s('audio').add({id:'take:'+id,blob}));return row;
    }).then(async row=>{await this.onTakeSaved(row);return row;});
  }
  async listTakes(dialogueId){return this.transaction(['takes'],'readonly',s=>libraryRequest(s('takes').index('dialogueId').getAll(dialogueId))).then(rows=>rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));}
  async getTake(id){
    const [row,audio]=await this.transaction(['takes','audio'],'readonly',s=>Promise.all([libraryRequest(s('takes').get(id)),libraryRequest(s('audio').get('take:'+id))]));
    if(!row)return null;libraryCheck(audio?.blob,'audio_missing','The saved take audio is missing. Restore a backup.');return {...row,audioWav:dialogueBase64(new Uint8Array(await audio.blob.arrayBuffer()))};
  }
  async deleteTake(id){return this.transaction(['takes','audio'],'readwrite',async s=>{await libraryRequest(s('takes').delete(id));await libraryRequest(s('audio').delete('take:'+id));});}
  async removeDialogue(s,id){
    const takes=await libraryRequest(s('takes').index('dialogueId').getAll(id));
    for(const take of takes){await libraryRequest(s('audio').delete('take:'+take.id));await libraryRequest(s('takes').delete(take.id));}
    await libraryRequest(s('dialogues').delete(id));
  }
  async deleteDialogue(id,revision){
    return this.transaction(['dialogues','takes','audio'],'readwrite',async s=>{const old=await libraryRequest(s('dialogues').get(id));libraryCheck(old,'missing','Dialogue not found.');libraryRevision(old,revision);await this.removeDialogue(s,id);});
  }
  async deleteCharacter(id,revision){
    return this.transaction(libraryStores,'readwrite',async s=>{
      const old=await libraryRequest(s('characters').get(id));libraryCheck(old,'missing','Character not found.');libraryRevision(old,revision);
      for(const row of await libraryRequest(s('dialogues').index('characterId').getAll(id)))await this.removeDialogue(s,row.id);
      await libraryRequest(s('audio').delete('reference:'+id));await libraryRequest(s('characters').delete(id));
    });
  }
  async exportLibrary(){
    // Read one consistent snapshot; convert blobs only after the read transaction.
    const snapshot=await this.transaction(libraryStores,'readonly',async s=>Object.fromEntries(await Promise.all(libraryStores.map(async key=>[key,await libraryRequest(s(key).getAll())]))));
    const audio=new Map(snapshot.audio.map(a=>[a.id,a.blob]));
    for(const c of snapshot.characters)if(c.reference){const blob=audio.get('reference:'+c.id);libraryCheck(blob,'audio_missing','A character reference is missing.');c.reference.audioWav=dialogueBase64(new Uint8Array(await blob.arrayBuffer()));}
    for(const take of snapshot.takes){const blob=audio.get('take:'+take.id);libraryCheck(blob,'audio_missing','A saved take is missing.');take.audioWav=dialogueBase64(new Uint8Array(await blob.arrayBuffer()));}
    delete snapshot.audio;return {protocol:VOICE_LIBRARY_PROTOCOL,exportedAt:new Date().toISOString(),...snapshot};
  }
  async importLibrary(value){
    libraryCheck(value?.protocol===VOICE_LIBRARY_PROTOCOL&&['characters','types','dialogues','takes'].every(k=>Array.isArray(value[k])),'invalid','This is not a Voice Lab library backup.');
    const data=libraryCopy(value),audio=[];
    for(const key of ['characters','types','dialogues','takes']){
      libraryCheck(data[key].length<=100000,'invalid','Backup has too many records.');
      libraryCheck(new Set(data[key].map(r=>libraryId(r.id))).size===data[key].length,'duplicate','Backup contains duplicate IDs.');
    }
    for(const row of [...data.characters,...data.types,...data.dialogues]){
      libraryCheck(Number.isInteger(row.revision)&&row.revision>0&&typeof row.createdAt==='string'&&typeof row.updatedAt==='string','invalid','Backup record metadata is invalid.');
    }
    for(const c of data.characters){
      const profile=readDialogueProfile(JSON.stringify(dialogueProfile(c.settings,c.reference)));
      c.name=libraryString(c.name,'Character name',80,true);c.nameKey=libraryKey(c.name);c.settings=dialogueSettings({...profile.settings,character:c.name});c.tags=libraryTags(c.tags);c.notes=libraryString(c.notes||'','Character notes',12000);
      if(c.reference){const info=inspectDialogueWav(profile.reference.audioWav,true);audio.push({id:'reference:'+c.id,blob:new Blob([info.bytes],{type:'audio/wav'})});c.reference={name:profile.reference.name,text:profile.reference.text,duration:info.duration,sampleRate:info.sampleRate};}
    }
    for(const type of data.types){type.name=libraryString(type.name,'Dialogue type',80,true);type.nameKey=libraryKey(type.name);}
    for(const row of data.dialogues){const clean=this.normaliseDialogue(row);delete clean.type;Object.assign(row,clean);}
    for(const take of data.takes){
      libraryId(take.dialogueId);libraryString(take.text,'Take text',Infinity,true);const info=inspectDialogueWav(take.audioWav);
      libraryCheck(take.model===dialogueSettings(take.settings).model&&take.seed===dialogueSettings(take.settings).seed,'invalid','Backup take settings are invalid.');
      audio.push({id:'take:'+take.id,blob:new Blob([info.bytes],{type:'audio/wav'})});delete take.audioWav;take.durationSeconds=info.duration;take.sampleRate=info.sampleRate;
    }
    return this.transaction(libraryStores,'readwrite',async s=>{
      // Merge preserves IDs. Existing IDs/names refuse the whole import rather
      // than silently overwriting newer local work. Restore into an empty library.
      for(const key of ['characters','types','dialogues','takes'])for(const row of data[key]){
        libraryCheck(!await libraryRequest(s(key).get(row.id)),'conflict','This backup contains records already in this library. Nothing was imported.');await libraryRequest(s(key).add(row));
      }
      for(const row of data.dialogues){libraryCheck(await libraryRequest(s('characters').get(row.characterId)),'missing','Backup dialogue has no character.');if(row.typeId)libraryCheck(await libraryRequest(s('types').get(row.typeId)),'missing','Backup dialogue has no type.');}
      for(const take of data.takes)libraryCheck(await libraryRequest(s('dialogues').get(take.dialogueId)),'missing','Backup take has no dialogue.');
      for(const row of audio)await libraryRequest(s('audio').add(row));
      return {characters:data.characters.length,dialogues:data.dialogues.length,takes:data.takes.length};
    });
  }
}
