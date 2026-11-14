// The manager indexes metadata. Recording bytes remain in the existing stores.
export const ASSET_MANAGER_PROTOCOL='capp.voice-lab.asset-manager.v1';
export const managerKey=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('en-US');
export const managerTypeNames={sfx:'Sound effect',music:'Music',ambience:'Ambience',dialogue:'Dialogue',reference:'Voice reference'};
export function managerMetadata(value){
  const text=(v,max,label)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x1f]/.test(v.replace(/[\n\r\t]/g,'')))throw Error(`${label} is invalid or too long.`);return v.trim();};
  const title=text(value.title,160,'Name');if(!title)throw Error('Give the asset a name.');
  const category=text(value.category||'',80,'Category'),subject=text(value.subject||'',120,'Subject');
  if(/[\\/]/.test(category+subject)||['.','..'].includes(category)||['.','..'].includes(subject))throw Error('Use separate category and subject fields, without path separators.');
  if(!Array.isArray(value.tags)||value.tags.length>32)throw Error('Use up to 32 tags.');
  const tags=[...new Set(value.tags.map(t=>managerKey(text(t,64,'Tag'))).filter(Boolean))];
  if(value.assetType!==undefined&&!Object.hasOwn(managerTypeNames,value.assetType))throw Error('Choose a supported audio type.');
  return {title,category,subject,tags,notes:text(value.notes||'',12000,'Notes'),...(value.assetType?{assetType:value.assetType}:{})};
}
export function managerFolder(category='',subject=''){return JSON.stringify([category,subject]);}
export function managerSameFolder(a,b){return managerKey(a.category)===managerKey(b.category)&&managerKey(a.subject)===managerKey(b.subject);}
export function managerConflict(value,rows,exclude=''){
  return rows.find(r=>r.key!==exclude&&managerKey(r.title)===managerKey(value.title)&&r.kind===value.kind&&managerSameFolder(r,value));
}
export function managerAvailableName(value,rows,exclude=''){
  if(!managerConflict(value,rows,exclude))return value.title;
  const stem=value.title.replace(/ \(\d+\)$/,'');
  for(let n=2;n<100000;n++){const title=stem.slice(0,160-String(n).length-3)+` (${n})`;if(!managerConflict({...value,title},rows,exclude))return title;}
  throw Error('Too many matching names. Choose a different name.');
}
export function managerFilter(rows,{query='',type='',tag='',state='',folder=null,sort='newest'}={}){
  const tokens=managerKey(query).split(/\s+/).filter(Boolean),wantedTags=String(tag).split(',').map(managerKey).filter(Boolean);
  return rows.filter(r=>{
    const haystack=managerKey([r.title,r.type,r.kind,r.category,r.subject,r.notes,r.text,r.model,r.origin,r.id,r.row?.projectPath,r.recorded?'wav':'recipe',...(r.tags||[])].join(' '));
    return (!type||r.type===type)&&(!state||(state==='recorded')===r.recorded)&&(!folder||(managerKey(r.category)===managerKey(folder[0])&&(!folder[1]||managerKey(r.subject)===managerKey(folder[1]))))&&tokens.every(t=>haystack.includes(t))&&wantedTags.every(t=>(r.tags||[]).some(v=>managerKey(v)===t));
  }).sort((a,b)=>(sort==='name'?a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'}):sort==='duration'?(b.duration||0)-(a.duration||0):sort==='type'?a.type.localeCompare(b.type):String(b.updatedAt||'').localeCompare(a.updatedAt||''))||a.key.localeCompare(b.key));
}
export async function managerCollect(fetchPage,limit=200){
  const rows=[],seen=new Set();let total=null;
  do{
    const page=await fetchPage({offset:rows.length,limit});
    if(!Number.isInteger(page.total)||page.total<0||page.total>100000||!Array.isArray(page.items)||page.items.length>limit)throw Error('Invalid asset catalogue response.');
    if(total!==null&&page.total!==total)throw Error('The catalogue changed while loading. Refresh to search the complete collection.');
    total=page.total;
    for(const row of page.items){if(seen.has(row.id))throw Error('The catalogue changed while loading. Refresh and retry.');seen.add(row.id);rows.push(row);}
    if(rows.length<total&&!page.items.length)throw Error('Incomplete asset catalogue. Refresh and retry.');
  }while(rows.length<total);
  if(rows.length!==total)throw Error('Invalid asset catalogue size.');return rows;
}
export function managerProjectItem(row,collection){
  const m=row.metadata||{},type=m.source?.protocol==='capp.voice-lab.reference.v1'||m.source?.assetType==='reference'?'reference':m.kind;
  return {key:collection+':'+row.id,id:row.id,origin:'project',collection,type,kind:m.kind,title:m.title,category:m.category||'',subject:m.subject||'',tags:m.tags||[],notes:m.notes||'',text:m.source?.text||m.source?.recipe?.prompt||'',model:m.source?.model||m.source?.recipe?.model||'',recorded:true,duration:row.wav?.durationSeconds||0,updatedAt:row.approvedAt||row.createdAt||'',row};
}
export function managerLocalItems(sounds,characters,lines,takes,overrides={}){
  const result=[],lineById=new Map(lines.map(r=>[r.id,r]));
  for(const row of sounds)result.push({key:'sound:'+row.id,id:row.id,origin:'sound',collection:'library',type:row.assetType||row.kind,kind:row.assetType==='reference'?'dialogue':row.assetType||row.kind,title:row.title,category:row.category,subject:row.subject,tags:row.tags,notes:row.notes,text:row.recipe?.prompt||'',model:row.recipe?.model||'',recorded:row.state==='ready',duration:row.result?.durationSeconds||row.recipe?.durationSeconds||0,updatedAt:row.updatedAt,row});
  for(const row of takes){const line=lineById.get(row.dialogueId)||{};result.push({key:'take:'+row.id,id:row.id,origin:'take',collection:'library',type:'dialogue',kind:'dialogue',title:(line.title||row.character+' · dialogue').slice(0,138)+' · take '+row.id.slice(0,8),category:line.type||'Dialogue',subject:row.character||'',tags:line.tags||[],notes:row.notes||line.notes||'',text:row.text,model:row.model,recorded:true,duration:row.durationSeconds,updatedAt:row.createdAt,row,line});}
  const recordedLines=new Set(takes.map(t=>t.dialogueId));
  for(const row of lines)if(!recordedLines.has(row.id))result.push({key:'line:'+row.id,id:row.id,origin:'line',collection:'library',type:'dialogue',kind:'dialogue',title:row.title,category:row.type||'Dialogue',subject:row.character||'',tags:row.tags,notes:row.notes,text:row.text,model:row.settings?.model,recorded:false,duration:0,updatedAt:row.updatedAt,row});
  for(const row of characters)if(row.reference)result.push({key:'reference:'+row.id,id:row.id,origin:'reference',collection:'library',type:'reference',kind:'dialogue',title:row.name+' · reference',category:'Voice references',subject:row.name,tags:row.tags,notes:row.notes,text:row.reference.text,model:row.settings?.model,recorded:true,duration:row.reference.duration,updatedAt:row.updatedAt,row});
  return result.map(r=>{const meta=overrides[r.key]||{},type=meta.assetType||r.type;return {...r,...meta,type,kind:type==='reference'?'dialogue':type,key:r.key};});
}
export const managerRequest=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
export class AssetOrganizer {
  constructor({indexedDB=globalThis.indexedDB,name='capp.voice-lab.organizer.v1'}={}){this.idb=indexedDB;this.name=name;this.db=null;this.opening=null;}
  async open(){if(this.db)return;if(!this.opening)this.opening=new Promise((resolve,reject)=>{
    if(!this.idb)return reject(Error('Asset organization storage is unavailable.'));
    const r=this.idb.open(this.name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('items',{keyPath:'key'});r.result.createObjectStore('folders',{keyPath:'key'});};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Close older Voice Lab windows and retry.'));r.onsuccess=()=>{this.db=r.result;this.db.onversionchange=()=>this.close();resolve();};
  });return this.opening;}
  async transaction(mode,fn){await this.open();return new Promise((resolve,reject)=>{const tx=this.db.transaction(['items','folders'],mode);let result,failure;tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(failure||tx.error);Promise.resolve().then(()=>fn(n=>tx.objectStore(n))).then(v=>result=v,e=>{failure=e;try{tx.abort();}catch{reject(e);}});});}
  async read(){return this.transaction('readonly',async s=>({items:await managerRequest(s('items').getAll()),folders:await managerRequest(s('folders').getAll())}));}
  async save(key,value){const metadata=managerMetadata(value);return this.transaction('readwrite',s=>managerRequest(s('items').put({key,metadata})));}
  async folder(scope,category,subject=''){
    managerMetadata({title:'folder',category,subject,tags:[]});if(!category)throw Error('A folder needs a category name.');
    const row={key:JSON.stringify([scope,managerKey(category),managerKey(subject)]),scope,category,subject};
    return this.transaction('readwrite',async s=>{if(await managerRequest(s('folders').get(row.key)))throw Error('That folder already exists.');await managerRequest(s('folders').add(row));return row;});
  }
  async removeFolder(key){return this.transaction('readwrite',s=>managerRequest(s('folders').delete(key)));}
  async restore(data){
    if(data?.protocol!==ASSET_MANAGER_PROTOCOL||!Array.isArray(data.items)||!Array.isArray(data.folders)||data.items.length>100000||data.folders.length>10000)throw Error('Invalid organizer backup.');
    const items=data.items.map(r=>{if(typeof r.key!=='string'||r.key.length>256)throw Error('Invalid organizer key.');return {key:r.key,metadata:managerMetadata(r.metadata)};});
    const folders=data.folders.map(r=>{if(typeof r.scope!=='string'||r.scope.length>4096)throw Error('Invalid folder scope.');managerMetadata({title:'folder',...r,tags:[]});return {key:JSON.stringify([r.scope,managerKey(r.category),managerKey(r.subject)]),scope:r.scope,category:r.category,subject:r.subject};});
    return this.transaction('readwrite',async s=>{for(const row of items){if(await managerRequest(s('items').get(row.key)))throw Error('Organizer backup overlaps existing metadata. Nothing was restored.');await managerRequest(s('items').add(row));}for(const row of folders){if(!await managerRequest(s('folders').get(row.key)))await managerRequest(s('folders').add(row));}});
  }
  close(){this.db?.close();this.db=null;this.opening=null;}
}
// Real PCM sample peaks, sampled across the track, without decoding a large file.
export async function managerWaveform(blob,bins=64){
  const head=new Uint8Array(await blob.slice(0,65536).arrayBuffer()),v=new DataView(head.buffer);
  const tag=i=>String.fromCharCode(...head.subarray(i,i+4));
  if(head.length<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')return null;
  let channels=0,bits=0,format=0,data=0,length=0;
  for(let at=12;at+8<=head.length;){const size=v.getUint32(at+4,true);if(tag(at)==='fmt '&&size>=16&&at+24<=head.length){format=v.getUint16(at+8,true);channels=v.getUint16(at+10,true);bits=v.getUint16(at+22,true);}if(tag(at)==='data'){data=at+8;length=Math.min(size,blob.size-data);break;}at+=8+size+(size%2);}
  if(format!==1||bits!==16||!channels||!length)return null;
  const frames=Math.floor(length/(channels*2)),peaks=[];
  for(let i=0;i<bins;i++){const start=Math.floor(i*frames/bins),count=Math.min(256,Math.max(1,Math.floor(frames/bins)),frames-start);const bytes=await blob.slice(data+start*channels*2,data+(start+count)*channels*2).arrayBuffer(),view=new DataView(bytes);let peak=0;for(let n=0;n+1<bytes.byteLength;n+=2)peak=Math.max(peak,Math.abs(view.getInt16(n,true))/32768);peaks.push(peak);}
  return peaks;
}
