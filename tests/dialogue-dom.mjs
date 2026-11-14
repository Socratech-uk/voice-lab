/** Real generated application + actual cApp dialogue client; controlled native replies.
 * Requires developer jsdom; no DOM/native fixture is bundled into the app. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {File} from 'node:buffer';
const require=createRequire(import.meta.url);const {JSDOM,VirtualConsole}=require(process.env.JSDOM_PATH||'jsdom');
const {indexedDB}=require(process.env.IDB_PATH||'fake-indexeddb');
const root=new URL('../',import.meta.url),capp=process.argv[2];assert(capp,'pass cApp source directory');
const owner=fs.readFileSync(capp+'/sidecars/local-ai/runtime/local-dialogue.js','utf8');const catalogue=JSON.parse(fs.readFileSync(capp+'/sidecars/local-ai/native/dialogue-models.json','utf8')).models;
const delay=ms=>new Promise(r=>setTimeout(r,ms));const calls=[],urls=new Map(),downloads=[];let serial=0,active=null,hold=false,state={loaded:false};
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
const wav=Buffer.alloc(44+6*48000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);const audio=wav.toString('base64');
const dom=new JSDOM(fs.readFileSync(new URL('index.html',root),'utf8'),{url:'https://voice-lab.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 w.Blob=Blob;w.File=File;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 w.indexedDB=indexedDB;
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:urls.get(this.href)});};
 w.URL.createObjectURL=blob=>{const id='blob:fixture-'+(++serial);urls.set(id,blob);return id;};w.URL.revokeObjectURL=id=>urls.delete(id);
 w.__CAPP_PACKAGED_RUNTIME__=true;w.__CAPP_EXECUTABLE_PLAN__={app:{id:'voice-lab'},library:{selected:[{id:'uk.capp.sidecar.local-ai'}]}};
 w.cappLocalAiNative={dialogue:async raw=>{const r=JSON.parse(raw);calls.push(r);
  if(r.op==='status')return {ok:true,supported:true,models:catalogue.map(m=>({...m,available:true})),state};
  if(r.op==='cancel'){if(active&&active.requestId===r.requestId)active.cancelled=true;return {ok:true,cancelled:true};}
  if(r.op==='unload'){state={loaded:false};return {ok:true,unloaded:true};}
  active=r;w.dispatchEvent(new w.CustomEvent('capp:local-ai-native-event',{detail:{type:'dialogue-progress',payload:{phase:r.op==='prepare'?'loading':'rendering',requestId:r.requestId}}}));
  while(hold)await delay(5);await delay(2);if(r.cancelled)throw Error('dialogue_cancelled');state={loaded:true,model:r.model,device:'cuda',deviceName:'Fixture GPU'};
  return {ok:true,requestId:r.requestId,model:r.model,device:'cuda',deviceName:'Fixture GPU',loaded:true,...(r.op==='render'?{audioWav:audio,seed:r.seed,generationMs:25,durationSeconds:6}: {})};
 }};
 w.eval(owner);const api={};w.__CAPP_INSTALL_LOCAL_DIALOGUE__({api,getConfig:()=>({allowAppSpeech:true}),getIdentity:()=>({id:'voice-lab'}),scope:w});w.capp={ai:{local:api}};
}});
const w=dom.window,$=id=>w.document.getElementById(id),click=id=>$(id).click(),change=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
async function settled(){for(let i=0;i<500;i++){await delay(5);if(w.document.body.dataset.dialogueBusy!=='true'&&w.document.body.dataset.libraryBusy!=='true'&&w.document.body.dataset.libraryReady==='true')return;}throw Error('UI did not settle');}
try{
 await settled();assert.equal(errors.length,0,errors.join('\n'));click('dialogue-tab');await settled();assert(!$('dialogue-workspace').hidden);assert($('workspace').hidden);assert(calls.every(c=>c.op==='status'));
 assert.equal($('dialogue-model').options.length,5);assert(!$('dialogue-direction-wrap').hidden);assert($('dialogue-reference-wrap').hidden);
 click('dialogue-prepare');await settled();assert($('dialogue-engine-state').textContent.includes('Fixture GPU'));
 assert(!$('dialogue-text').hasAttribute('maxlength'));
 const longLine='A line longer than six hundred characters. '.repeat(50);$('dialogue-text').value=longLine;
 $('dialogue-text').dispatchEvent(new w.Event('input',{bubbles:true}));
 change('dialogue-take-total','2');click('dialogue-generate');await settled();assert.equal($('dialogue-takes').children.length,2);assert.equal(calls.filter(c=>c.op==='render').length,2);
 assert.equal(calls.findLast(c=>c.op==='render').text,longLine.trim());
 assert.equal((await w.voiceLabLibrary.characters.list()).length,1);assert.equal((await w.voiceLabLibrary.dialogues.list()).total,1);assert.equal($('saved-takes-count').textContent,'2');
 const link=$('dialogue-takes').querySelector('a');link.click();assert(downloads.at(-1).name.endsWith('.wav'));assert(Buffer.from(await downloads.at(-1).blob.arrayBuffer()).equals(wav));
 change('dialogue-model','chatterbox-turbo');assert($('dialogue-direction-wrap').hidden);assert($('dialogue-expression-wrap').hidden);assert(!$('dialogue-reference-wrap').hidden);click('dialogue-generate');await settled();const last=calls.findLast(c=>c.op==='render');assert(!('cfgWeight' in last));assert(!('instruct' in last));
 change('dialogue-model','qwen-clone');assert(!$('dialogue-transcript-wrap').hidden);click('dialogue-generate');await settled();assert(!$('dialogue-error').hidden);assert($('dialogue-error-help').textContent.includes('reference'));
 click('dialogue-export-profile');const exported=JSON.parse(await downloads.at(-1).blob.text());assert.equal(exported.protocol,'capp.voice-lab.character.v1');assert.equal(exported.settings.model,'qwen-clone');
 const profile={...exported,reference:{audioWav:audio,text:'The exact reference transcript.',name:'Fixture character'}};const file=new File([JSON.stringify(profile)],'fixture.voice-lab.json',{type:'application/json'});Object.defineProperty($('dialogue-profile-file'),'files',{configurable:true,value:[file]});$('dialogue-profile-file').dispatchEvent(new w.Event('change'));await settled();assert.equal($('dialogue-transcript').value,profile.reference.text);$('dialogue-text').value='Saved clone line.';click('dialogue-generate');await settled();assert.equal(calls.findLast(c=>c.op==='render').referenceText,profile.reference.text);
 const count=$('dialogue-takes').children.length;hold=true;click('dialogue-generate');for(let i=0;i<200&&w.document.body.dataset.dialogueBusy!=='true';i++)await delay(5);click('dialogue-cancel');assert($('dialogue-generate').disabled);assert(w.document.querySelector('[data-mode=speak]').disabled);hold=false;await settled();assert.equal($('dialogue-takes').children.length,count);assert($('dialogue-live').textContent.includes('Stopped'));
 click('dialogue-clear-takes');await settled();assert.equal($('dialogue-takes').children.length,0);assert(!$('dialogue-empty').hidden);
 w.document.querySelector('[data-mode=speak]').click();assert($('dialogue-workspace').hidden);assert(!$('workspace').hidden);assert.equal(w.document.querySelector('[data-mode=speak]').getAttribute('aria-pressed'),'true');
 const frame=w.document.createElement('iframe');frame.id='appFrame';w.document.body.append(frame);const child=frame.contentWindow;child.__CAPP_PACKAGED_RUNTIME__=true;child.__CAPP_EXECUTABLE_PLAN__=w.__CAPP_EXECUTABLE_PLAN__;
 w.eval(fs.readFileSync(capp+'/sidecars/local-ai/runtime/local-ai-app-bridge.js','utf8'));
 w.__CAPP_INSTALL_LOCAL_AI_APP_BRIDGE__({api:w.capp.ai.local,getConfig:()=>({allowAppSpeech:true}),getIdentity:()=>({id:'voice-lab'}),scope:w});
 assert.equal(child.capp.ai.local.protocol,'capp.local-ai-app-facade.v1');assert(!child.cappLocalAiNative);
 const scoped=child.capp.ai.local.dialogue.connect({protocol:'capp.local-dialogue.v1'});await scoped.status();hold=true;const task=scoped.prepare({model:'qwen-design'});await delay(5);child.dispatchEvent(new child.Event('pagehide'));hold=false;await assert.rejects(task,/cancelled|closed/);await assert.rejects(scoped.status(),/closed/);
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS generated Voice Lab DOM: five models, passive discovery, prepare/render, two takes, real WAV export bytes, mode controls, clone validation, character profile round-trip, cancellation, cleanup and original workflows');
}finally{w.dispatchEvent(new w.Event('pagehide'));dom.window.close();}
