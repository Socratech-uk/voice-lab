// IndexedDB contract tests. The fake supplies storage, never production data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {VoiceLibrary} from '../src/library.mjs';
import {dialogueBase64,DIALOGUE_DEFAULTS} from '../src/dialogue.mjs';
const require=createRequire(import.meta.url),{indexedDB,IDBObjectStore}=require(process.env.IDB_PATH||'fake-indexeddb');
function wav(seconds=6){const b=Buffer.alloc(44+seconds*48000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return dialogueBase64(b);}
const name='test-'+crypto.randomUUID(),open=()=>new VoiceLibrary({indexedDB,name}),audio=wav();let lib=open();
const reference={audioWav:audio,text:'Exact reference words.',name:'Sample.wav'};
let alex=await lib.saveCharacter({id:'alex',name:'Alex',settings:{...DIALOGUE_DEFAULTS,model:'qwen-clone'},reference,notes:'Captain',tags:['Crew']});
let ada=await lib.saveCharacter({id:'ada',name:'Ada',settings:DIALOGUE_DEFAULTS});
assert.equal(alex.revision,1);assert.equal((await lib.listCharacters())[0].name,'Ada');
assert(!JSON.stringify(await lib.listCharacters()).includes(audio));lib.close();lib=open();
alex=await lib.getCharacter('alex');assert.equal(alex.reference.audioWav,audio);assert.equal(alex.reference.text,reference.text);assert.equal(alex.settings.model,'qwen-clone');
await assert.rejects(lib.saveCharacter({...alex,name:'Ada'}),e=>e.code==='duplicate');
const other=open(),stale=await other.getCharacter(alex.id);
alex=await lib.saveCharacter({...alex,name:'Alex Pearce'});await assert.rejects(other.saveCharacter({...stale,notes:'Stale edit'}),e=>e.code==='conflict');assert.equal((await other.getCharacter('alex')).name,'Alex Pearce');
const copy=await lib.duplicateCharacter('alex');assert.notEqual(copy.id,alex.id);assert.equal(copy.reference.audioWav,audio);
const batch={protocol:'capp.voice-lab.dialogue-batch.v1',items:[
 {id:'greet-alex',characterId:'alex',type:'Greeting',text:'Welcome aboard.',tags:['act-1'],settings:alex.settings,origin:{kind:'automation',jobId:'batch-1'}},
 {id:'greet-ada',characterId:'ada',type:'greeting',text:'Hello, captain.',settings:ada.settings},
 {id:'farewell-alex',characterId:'alex',type:'Farewell',text:'Safe travels.',settings:alex.settings}
]};
const rows=await lib.importDialogues(batch);const types=await lib.listTypes();assert.equal(types.length,2);const greeting=types.find(t=>t.name==='Greeting');
assert.equal((await lib.listDialogues({typeId:greeting.id})).total,2);assert.equal((await lib.listDialogues({characterId:'alex'})).total,2);
assert.equal((await lib.listDialogues({query:'greeting'})).total,2);assert.equal((await lib.listDialogues({tag:'ACT-1'})).total,1);
assert.equal((await lib.listDialogues({characterId:'alex',typeId:greeting.id})).total,1);assert.equal((await lib.listDialogues({query:'Pearce'})).total,2);
assert.equal((await lib.listDialogues({limit:1,offset:1})).items.length,1);assert.equal(rows[0].origin.jobId,'batch-1');
await assert.rejects(lib.importDialogues({...batch,items:[{id:'new-line',characterId:'alex',text:'First',type:'Should roll back'},batch.items[0]]}),e=>e.code==='conflict');
assert.equal(await lib.getDialogue('new-line'),null);assert(!(await lib.listTypes()).some(t=>t.name==='Should roll back'));
await assert.rejects(lib.importDialogues({...batch,items:[{id:'orphan',characterId:'missing',text:'Bad'}]}),e=>e.code==='missing');
await assert.rejects(lib.deleteType(greeting.id,greeting.revision),e=>e.code==='in_use');
await lib.saveType({...greeting,name:'First greeting'});assert.equal((await lib.listDialogues({query:'first greeting'})).total,2);
const take=await lib.saveTake({id:'take-one',dialogueId:'greet-alex',text:rows[0].text,character:alex.name,audioWav:audio,model:'qwen-clone',seed:42,settings:alex.settings,characterRevision:alex.revision,dialogueRevision:1});
const add=IDBObjectStore.prototype.add;
IDBObjectStore.prototype.add=function(...args){if(this.name==='audio')throw new DOMException('Full','QuotaExceededError');return add.apply(this,args);};
try{await assert.rejects(lib.saveTake({id:'quota-take',dialogueId:'greet-alex',text:'Retain this take',audioWav:audio,model:'qwen-clone',seed:42,settings:alex.settings}),e=>e.code==='quota');}
finally{IDBObjectStore.prototype.add=add;}
assert.equal(await lib.getTake('quota-take'),null);assert.equal((await lib.listTakes('greet-alex')).length,1);
assert.equal((await lib.getTake(take.id)).audioWav,audio);assert.equal((await lib.listDialogues({characterId:'alex',typeId:greeting.id})).items[0].takeCount,1);
await assert.rejects(lib.saveDialogue({...rows[0],characterId:'ada'}),e=>e.code==='has_takes');
const changed=await lib.saveDialogue({...rows[0],text:'Updated words.',status:'ready'});assert.equal(changed.revision,2);assert.equal((await lib.getTake('take-one')).text,'Welcome aboard.');
const backup=await lib.exportLibrary();assert.equal(backup.takes[0].audioWav,audio);
const restored=new VoiceLibrary({indexedDB,name:'restore-'+crypto.randomUUID()});await restored.importLibrary(backup);
assert.equal((await restored.getCharacter('alex')).reference.text,reference.text);assert.equal((await restored.getTake('take-one')).audioWav,audio);assert.equal((await restored.listDialogues()).total,3);
await assert.rejects(restored.importLibrary(backup),e=>e.code==='conflict');assert.equal((await restored.listDialogues()).total,3);
const broken=new VoiceLibrary({indexedDB,name:'broken-'+crypto.randomUUID()}),invalid=structuredClone(backup);invalid.dialogues[0].characterId='orphan';
await assert.rejects(broken.importLibrary(invalid),e=>e.code==='missing');assert.equal((await broken.listCharacters()).length,0);
await lib.deleteDialogue('greet-alex',changed.revision);assert.equal(await lib.getTake('take-one'),null);assert.equal((await lib.getCharacter('alex')).reference.audioWav,audio);
await lib.deleteCharacter('alex',alex.revision);assert.equal((await lib.listDialogues({characterId:'alex'})).total,0);assert(await lib.getCharacter('ada'));assert.equal((await lib.listDialogues()).total,1);
for(const db of [lib,other,restored,broken])db.close();
console.log('PASS library: persisted audio/transcripts, stable identity, optimistic conflicts, case-insensitive shared types, indexed queries, atomic automation batches, take provenance, backup restore, corruption rollback and scoped deletion');
