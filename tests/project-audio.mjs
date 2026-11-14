import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ProjectAudioSession,projectSoundMetadata,projectDialogueMetadata} from '../src/project-audio.mjs';
const bytes=Buffer.alloc(1_100_044,27),blob=new Blob([bytes],{type:'audio/wav'}),sha256=createHash('sha256').update(bytes).digest('hex');
const calls=[];let failAppend=false,badRead=false,cancelled=false,hold=false,release;
const client={
 async open(){calls.push('open');return cancelled?{cancelled:true}:{project:{name:'Kestrel',root:'C:/kestrel'}};},
 async close(){calls.push('close');},async list(v){calls.push(v);return {items:[],total:0};},
 async begin(v){calls.push({op:'begin',...v});return {chunkBytes:524288};},
 async append(v){if(hold)await new Promise(r=>release=r);if(failAppend)throw Error('Disk full');calls.push({op:'append',...v});return {bytes:v.offset+Buffer.from(v.data,'base64').length};},
 async finish(){calls.push('finish');return {asset:{id:'draft'}};},async abort(){calls.push('abort');},
 async read(v){const part=bytes.subarray(v.offset,v.offset+524288);return {offset:v.offset,nextOffset:v.offset+part.length,bytes:bytes.length,data:badRead?Buffer.alloc(part.length).toString('base64'):part.toString('base64')};},
 async approve(v){calls.push({op:'approve',...v});return {draftRetained:true};},dispose(){calls.push('dispose');}
};
const project=new ProjectAudioSession({local:()=>({audioProjects:{connect:()=>client}})});
await assert.rejects(project.list(),/Open an audio project/);
await project.open();const original=project.project;cancelled=true;await project.open();assert.equal(project.project,original);cancelled=false;
const metadata=projectSoundMetadata({id:'local',revision:3,title:'Throat drone',kind:'music',recipe:{model:'sa3-medium',seed:1},lineage:{source:{id:'original',revision:2}}});
assert.equal(metadata.source.lineage.source.id,'original');assert.equal(metadata.source.recipe.seed,1);
const staged=await project.stage(metadata,blob);assert.equal(staged.id,'draft');
const chunks=calls.filter(c=>c.op==='append');assert.equal(chunks.length,3);assert(Buffer.concat(chunks.map(c=>Buffer.from(c.data,'base64'))).equals(bytes));assert(chunks.every(c=>c.data.length<=699052));
const row={id:'native',wav:{bytes:bytes.length,sha256}};assert.deepEqual(Buffer.from(await (await project.read(row,'drafts')).arrayBuffer()),bytes);
await project.approve(row);assert.deepEqual(calls.at(-1),{op:'approve',id:'native',sha256});
badRead=true;await assert.rejects(project.read(row,'drafts'),/changed while/);badRead=false;
failAppend=true;await assert.rejects(project.stage(metadata,blob),/Disk full/);assert.equal(calls.at(-1),'abort');assert.equal(project.busy,false);failAppend=false;
hold=true;const pending=project.stage(metadata,new Blob([bytes.subarray(0,100)]));await new Promise(r=>setImmediate(r));await assert.rejects(project.close(),/Wait for/);release();await pending;hold=false;
const dialogue=projectDialogueMetadata({id:'take',character:'Pilot',audioWav:'not-metadata',text:'Hello',settings:{seed:3}},{title:'Greeting',tags:['radio']},'Greeting');assert.equal(dialogue.kind,'dialogue');assert(!('audioWav' in dialogue.source));assert.equal(dialogue.source.text,'Hello');
await project.close();assert.equal(project.project,null);await assert.rejects(project.stage(metadata,blob),/Open an audio project/);
console.log('PASS project transfer: bounded round-trip chunks, receipt verification, cancelled picker, retained original metadata, dialogue provenance, failed-write abort and busy project switching');
