// Persistent audio contract: real production methods with IndexedDB storage double.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {AudioAssetLibrary,AudioWorkshop,audioRecipe,inspectAssetWav,AUDIO_BATCH_PROTOCOL} from '../src/audio-assets.mjs';
const require=createRequire(import.meta.url),{indexedDB,IDBObjectStore}=require(process.env.IDB_PATH||'fake-indexeddb');
function wav(seconds=1){const b=Buffer.alloc(44+seconds*176400);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(44100,24);b.writeUInt32LE(176400,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b.toString('base64');}
const sound=wav(),base={title:'Airlock',kind:'sfx',prompt:'A heavy airlock opens.',durationSeconds:1,seed:7,category:'Greeting',subject:'Alex',tags:['Ship','ACT-1']};
const name='audio-'+crypto.randomUUID(),make=()=>new AudioAssetLibrary({indexedDB,name});let lib=make();
let a=await lib.save({...base,id:'airlock'});assert.equal(a.state,'draft');a=await lib.save({...a,recipe:{...a.recipe,prompt:'Airlock closes.'}});assert.equal(a.recipe.prompt,'Airlock closes.');
await assert.rejects(lib.save({...a,revision:1}),/another window/);assert.equal((await lib.list({query:'alex',tag:'ACT-1',category:'greeting'})).total,1);
assert.throws(()=>audioRecipe({...base,device:'cuda'}),/CPU/);assert.throws(()=>audioRecipe({...base,seed:true}),/Seed/);assert.throws(()=>audioRecipe({...base,durationSeconds:121}),/1–120/);assert.throws(()=>audioRecipe({...base,seed:-1}),/Seed/);assert.throws(()=>inspectAssetWav(sound.slice(0,-12)),/WAV/);
const result={audioWav:sound,model:a.recipe.model,seed:a.recipe.seed,modelRevision:'fixed-revision',deviceName:'CPU',generationMs:123};
await assert.rejects(lib.record(a.id,a.revision,{...result,seed:8}),/does not match/);assert.equal((await lib.get(a.id)).state,'draft');a=await lib.record(a.id,a.revision,result);
await assert.rejects(lib.save({...a,recipe:{...a.recipe,seed:8}}),/variation/);a=await lib.save({...a,notes:'Metallic ending'});assert.equal(a.state,'ready');
lib.close();lib=make();assert.equal((await lib.get(a.id,{audio:true})).audioWav,sound);assert(!JSON.stringify(await lib.list()).includes(sound));
const batch={protocol:AUDIO_BATCH_PROTOCOL,items:[{...base,id:'second'},{...base,id:'music',kind:'music',subject:'Ada'}]};await lib.importBatch(batch);
await assert.rejects(lib.importBatch({...batch,items:[{...base,id:'rollback'},batch.items[0]]}),/already exists/);assert.equal(await lib.get('rollback'),null);
const backup=await lib.export(),restore=new AudioAssetLibrary({indexedDB,name:'restore-'+crypto.randomUUID()});await restore.import(backup);assert.equal((await restore.get(a.id,{audio:true})).audioWav,sound);
await assert.rejects(restore.import(backup),/overlaps/);assert.equal((await restore.list()).total,3);assert.equal((await lib.export({ids:[a.id]})).items.length,1);
const calls=[];let fail=false,workshop;
const client={status:async()=>({models:[]}),render:async r=>{calls.push(r);if(fail)throw Error('engine failed');return {...result,model:r.model,seed:r.seed};},cancel:async()=>{},prepare:async r=>{calls.push(r);return {};},unload:async()=>{},dispose:()=>{}};
workshop=new AudioWorkshop({local:()=>({audio:{connect:()=>client}})},lib);
await assert.rejects(workshop.prepare('sfx',false),/terms/);assert.equal(calls.length,0);await workshop.prepare('sfx',true);assert.equal(calls.pop().acceptLicense,true);
const originalAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='audio')throw new DOMException('full','QuotaExceededError');return originalAdd.apply(this,args);};
try{await assert.rejects(workshop.renderBatch({ids:['second','music']}),/Storage is full/);}finally{IDBObjectStore.prototype.add=originalAdd;}
assert(workshop.unsaved);assert.equal((await lib.get('second')).state,'draft');assert.equal(calls.length,1);await workshop.saveUnsaved();assert.equal(workshop.unsaved,null);assert.equal((await lib.get('second')).state,'ready');
fail=true;await assert.rejects(workshop.renderBatch({ids:['second','music']}),/engine failed/);assert.equal((await lib.get('second')).state,'ready');assert.equal((await lib.get('music')).state,'draft');assert.equal(workshop.busy,false);
fail=false;client.render=async r=>{calls.push(r);await workshop.cancel();return {...result,model:r.model,seed:r.seed};};await workshop.renderBatch({ids:['music']});assert.equal((await lib.get('music')).state,'ready');
const before=calls.length;await workshop.renderBatch({ids:['second','music']});assert.equal(calls.length,before);assert(!Object.hasOwn(calls[0],'kind'));assert(!Object.hasOwn(calls[0],'prompt'));
const final=await lib.get('second');await lib.remove(final.id,final.revision);assert.equal(await lib.get(final.id,{audio:true}),null);assert(await lib.get('music'));
lib.close();restore.close();console.log('PASS audio assets: recipe validation, stereo WAV persistence, draft edits, frozen recording recipe, optimistic conflicts, indexed search, atomic batch/backup, quota recovery, failure/cancel retention and resumable automation');
