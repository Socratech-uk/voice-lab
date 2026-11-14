import assert from 'node:assert/strict';
import {VoiceLab, cleanSettings, SentenceChunker, spokenText, shipLine, DEFAULTS} from '../src/lab.mjs';
import {CappBridge} from '../src/bridge.mjs';
const checks=[];
function check(name,fn){fn();checks.push(name);console.log('PASS',name);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=1000){const t=Date.now();while(!fn()){if(Date.now()-t>ms)throw new Error('Timed out');await wait(2);}}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
class FakeBridge {
 constructor(){this.calls=[];this.activeText=0;this.activeVoice=0;this.maxText=0;this.maxVoice=0;this.cancelT=0;this.cancelV=0;this.textStatusValue={currentModelId:'unit-test-only',generating:false};this.voiceStatusValue={supported:true,prepared:true,loaded:true,enabled:true,allowed:true};this.output='First sentence is deliberately long enough to start speech. The next sentence follows while speech is active.';this.failText=false;this.failVoice=false;}
 available(){return {text:true,voice:true};}
 textStatus(){this.calls.push(['textStatus']);return Promise.resolve(this.textStatusValue);}
 voiceStatus(){this.calls.push(['voiceStatus']);return Promise.resolve(this.voiceStatusValue);}
 prepareText(){this.calls.push(['prepareText']);return this.prepText?.promise||Promise.resolve({ok:true});}
 activateVoice(){this.calls.push(['activate']);return this.activation?.promise||Promise.resolve({ok:true});}
 complete(o){this.calls.push(['complete',o]);this.activeText++;this.maxText=Math.max(this.activeText,this.maxText);if(this.textGate)return this.textGate.promise.finally(()=>{this.activeText--;});return (async()=>{try{if(this.failText)throw new Error('local_ai_model_not_loaded');let out='';for(const t of this.output.match(/\S+\s*/g)||[]){await wait(3);o.onToken?.(t);out+=t;}return {ok:true,output:out};}finally{this.activeText--;}})();}
 speak(o){this.calls.push(['speak',o]);this.activeVoice++;this.maxVoice=Math.max(this.activeVoice,this.maxVoice);return (async()=>{try{if(this.failVoice)throw new Error('speech_busy');o.onStart?.({id:'test'});o.onSegment?.({index:0,text:o.text});if(this.voiceGate)await this.voiceGate.promise;else await wait(85);return {ok:true,voice:o.voice,segments:1,provider:'test-double'};}finally{this.activeVoice--;}})();}
 cancelText(){this.cancelT++;return Promise.resolve({ok:true,cancelled:true});}
 cancelVoice(){this.cancelV++;return Promise.resolve({ok:true,cancelled:true});}
 dispose(){}
}
function setup(){const b=new FakeBridge();return [new VoiceLab(b),b];}
check('Settings clamp numbers and reject unknown keys',()=>{const s=cleanSettings({voice:'secret',speed:99,temperature:-1,maxTokens:1,shipVoice:false,shipPhrasing:'bad',customSystem:'x'.repeat(1300),prompt:'private'});assert.equal(s.voice,'bm_george');assert.equal(s.speed,1.25);assert.equal(s.temperature,0);assert.equal(s.maxTokens,16);assert.equal(s.shipVoice,false);assert.equal(s.shipPhrasing,'narrate');assert.equal(s.customSystem.length,1200);assert.equal('prompt'in s,false);});
check('Speech filter holds unfinished thinking tags',()=>{assert.equal(spokenText('<thi',false),'');assert.equal(spokenText('<think>private analysis</think>Engine on.',true),'Engine on.');assert.equal(spokenText('Hello. <analysis>unclosed',true),'Hello.');});
check('Code fences omitted from spoken content',()=>assert.equal(spokenText('Hello. ```js\nrun()\n``` Shields active.',true),'Hello. Shields active.'));
check('Speech normalizes typographic punctuation and caret artifacts',()=>assert.equal(spokenText('“Engine ^ on — shields active…”',true),'Engine on - shields active...'));
check('Speech chunks bounded and reconstruct simple prose',()=>{const c=new SentenceChunker(),text='Engines on. '+('A careful local test uses small sentences. ').repeat(25),parts=c.take(text,true);assert(parts.every(x=>x.length<=200));assert.equal(parts.join(' '),text.trim());});
check('Incremental sentence chunks do not repeat',()=>{const c=new SentenceChunker();let text='',parts=[];for(const x of 'First sentence long enough to speak safely. Another short sentence follows. '.split('')){text+=x;parts.push(...c.take(text,false));}parts.push(...c.take(text,true));assert.equal(parts.join(' '),text.trim());});
check('Unbroken long tokens reject speech',()=>assert.throws(()=>new SentenceChunker().take('a'.repeat(201),true),/word_limit/));
check('Revised emitted text is not replayed',()=>{const c=new SentenceChunker();c.take('Original complete sentence long enough. ',false);assert.equal(c.take('Changed complete sentence long enough.',true).length,0);assert(c.mismatch);});
check('Fleet report counts identified wing inside total',()=>{const t=shipLine('fleet',{cruisers:9,fighters:10,wing:true}).candidates[0];assert(t.includes('19 hostile ships'));assert(t.includes('one identified wing'));});
check('Zero contacts does not invent wings',()=>{const s=shipLine('fleet',{cruisers:0,fighters:0,wing:true});assert(!s.candidates[0].includes('wing'));});
check('Critical status deterministic and bounded',()=>{const s=shipLine('critical',{hull:10});assert(s.critical);assert.equal(s.candidates.length,1);assert(s.candidates[0].includes('10 percent'));});
{
 const [l,b]=setup();await l.check();check('Passive check does not activate or prepare engines',()=>assert.deepEqual(b.calls.map(x=>x[0]),['textStatus','voiceStatus']));l.dispose();
}
{
 const [l,b]=setup();await l.start({mode:'speak',input:'Local speech is running in a small test.'});check('Speech-only makes no LLM request',()=>{assert(!b.calls.some(x=>x[0]==='complete'));assert(b.calls.some(x=>x[0]==='speak'));assert(!l.busy);});l.dispose();
}
{
 const [l,b]=setup();await l.start({mode:'text',input:'Explain flight.'});check('Text-only does not activate or synthesize speech',()=>{assert(!b.calls.some(x=>x[0]==='activate'||x[0]==='speak'));assert(l.output.startsWith('First'));});check('Text request uses isolation and bounded settings',()=>{const p=b.calls.find(x=>x[0]==='complete')[1];assert.equal(p.isolated,true);assert.equal(p.maxTokens,36000);assert.equal(p.temperature,.3);assert.equal(p.maxInputTokens,2048);assert(!('appId'in p));});l.dispose();
}
{
 const [l,b]=setup();l.configure({customSystem:'Always answer as a laconic flight engineer.',maxTokens:48,temperature:.8});await l.start({mode:'text',input:'Report in.'});check('Custom system instruction overrides preset style in normal LLM workflow',()=>{const o=b.calls.find(x=>x[0]==='complete')[1];assert.equal(o.system,'Always answer as a laconic flight engineer.');assert.equal(o.maxTokens,48);assert.equal(o.temperature,.8);});l.dispose();
}
{
 const [l,b]=setup();await l.start({mode:'together',input:'Describe the ship.'});check('Streaming overlaps text request and speech playback',()=>assert(l.snapshot().metrics.overlapMs>0));check('Only one text and one voice request at a time',()=>{assert.equal(b.maxText,1);assert.equal(b.maxVoice,1);});check('All queued speech drained on successful completion',()=>{assert.equal(l.queue.length,0);assert(!l.busy);assert.equal(l.run.played,l.run.speechRequests);});l.dispose();
}
{
 const [l,b]=setup();l.configure({delivery:'complete'});await l.start({mode:'together',input:'Describe the ship.'});check('Completed-reply mode has no text/playback overlap',()=>assert.equal(l.snapshot().metrics.overlapMs,0));l.dispose();
}
{
 const [l,b]=setup();l.configure({volume:0});await l.start({mode:'together',input:'Hi'});check('Zero volume skips activation and synthesis but retains text',()=>{assert(!b.calls.some(x=>['activate','speak'].includes(x[0])));assert(l.output);});l.dispose();
}
{
 const [l,b]=setup();b.textGate=deferred();const done=l.start({mode:'text',input:'Test'});await until(()=>l.textJob);l.stopText();check('Stop text retains original lease',()=>assert(l.busy));await assert.rejects(l.start({mode:'text',input:'New'}),/busy/);b.textGate.resolve({ok:true,output:'Late reply'});await done;check('Cancelled late text is not displayed',()=>{assert.equal(l.output,'');assert.equal(b.cancelT,1);assert(!l.busy);});l.dispose();
}
{
 const [l,b]=setup();b.voiceGate=deferred();const done=l.start({mode:'together',input:'Hi'});await until(()=>l.voiceJob);l.stopVoice();check('Voice Stop does not cancel text',()=>assert.equal(b.cancelT,0));check('Voice Stop retains speech lease',()=>assert(l.voiceJob));b.voiceGate.resolve();await done;check('Text can finish after Voice Stop',()=>{assert(l.output.includes('next sentence'));assert.equal(b.calls.filter(x=>x[0]==='speak').length,1);});l.dispose();
}
{
 const [l,b]=setup();b.activation=deferred();const done=l.start({mode:'speak',input:'Waiting for preparation.'});l.stopAll();check('Stop during activation keeps slot until activation settles',()=>{assert(l.busy);assert(l.voicePreparation);});b.activation.resolve({ok:true});await done;check('Stopped activation cannot start queued speech',()=>{assert(!b.calls.some(x=>x[0]==='speak'));assert.equal(l.armed,false);});l.dispose();
}
{
 const [l,b]=setup();b.failVoice=true;await l.start({mode:'together',input:'Go'});check('Voice error retains text without fallback provider',()=>{assert(l.output.includes('sentence'));assert.equal(l.error.code,'speech_busy');assert(!l.busy);});l.dispose();
}
{
 const [l,b]=setup();l.configure({shipLlm:true,shipVoice:false,shipPhrasing:'narrate',style:'ship',customSystem:'Speak like a clipped veteran navigator. Mention only supplied telemetry.',maxTokens:64,temperature:1.1});b.output='Nine cruisers and ten fighters on scope. Nineteen hostiles total; one fighter wing identified.';await l.startShip('fleet',{cruisers:9,fighters:10,wing:true,hull:85,shield:40,engines:true,shields:true});check('Ship narrator uses model prose rather than the legacy 0/1 selector',()=>assert(l.output.startsWith('Nine cruisers')));check('Ship narrator passes custom system instruction and factual boundary',()=>{const o=b.calls.find(x=>x[0]==='complete')[1];assert(o.system.includes('clipped veteran navigator'));assert(o.system.includes('FACTUAL BOUNDARY'));});check('Ship narrator uses configured token budget and temperature',()=>{const o=b.calls.find(x=>x[0]==='complete')[1];assert.equal(o.maxTokens,64);assert.equal(o.temperature,1.1);});check('Ship narrator prompt contains bounded simulated telemetry',()=>{const o=b.calls.find(x=>x[0]==='complete')[1];assert(o.prompt.includes('Observed hostile cruisers: 9'));assert(o.prompt.includes('Hull integrity: 85 percent'));assert(o.prompt.includes('Do not invent'));});l.dispose();
}
{
 const [l,b]=setup();l.configure({shipLlm:true,shipVoice:false,shipPhrasing:'selector',customSystem:'THIS MUST NOT BE USED',maxTokens:192,temperature:1.4});b.output='1';await l.startShip('fleet',{cruisers:9,fighters:10,wing:true});check('Strict ship selector retains approved equivalent phrase mode',()=>assert(l.output.startsWith('19 hostile ships')));check('Strict ship selector deliberately forces 3 tokens and temperature zero',()=>{const o=b.calls.find(x=>x[0]==='complete')[1];assert.equal(o.maxTokens,3);assert.equal(o.temperature,0);assert.equal(o.system,'Return only the single digit 0 or 1.');});l.dispose();
}
{
 const [l,b]=setup();l.configure({shipLlm:true,shipVoice:false});await l.startShip('critical',{hull:10});check('Critical event bypasses LLM even when enabled',()=>assert(!b.calls.some(x=>x[0]==='complete')));l.dispose();
}
{
 const [l,b]=setup();l.configure({customSystem:'private custom instruction'});await l.start({mode:'text',input:'private user prompt'});const report=l.report();check('Report excludes response, prompt and custom instruction by default',()=>{assert(!('output'in report));assert(!JSON.stringify(report).includes('private user prompt'));assert(!JSON.stringify(report).includes('private custom instruction'));assert.equal(report.settings.customSystem,'[configured]');});check('Explicit text export includes response and configured custom instruction',()=>{const full=l.report(true);assert(full.output);assert.equal(full.settings.customSystem,'private custom instruction');});l.dispose();
}
{
 const [l,b]=setup();await l.start({mode:'text',input:'Hi'});l.clear();check('Clear removes only lab output and log',()=>{assert.equal(l.output,'');assert.equal(l.events.length,0);assert(!b.calls.some(x=>/unload|delete/.test(x[0])));});l.dispose();
}
{
 let textConnect=0,voiceConnect=0;const o=[];const api={connect:x=>{o.push(x);textConnect++;return {status:async()=>({})};},speech:{connect:x=>{o.push(x);voiceConnect++;return {status:async()=>({}),dispose(){}};},subscribe:()=>()=>{}}};const b=new CappBridge({capp:{ai:{local:api}}});b.textClient();b.textClient();b.voiceClient();b.voiceClient();check('Bridge reuses exactly one scoped connection per kind',()=>{assert.equal(textConnect,1);assert.equal(voiceConnect,1);assert(o.every(x=>!('appId'in x)));});b.scope.capp.ai.local={};check('Provider replacement is refused, not silently reconnected',()=>assert.throws(()=>b.local(),/provider_changed/));b.dispose();
}
{
 const b=new CappBridge({parent:{capp:{ai:{local:{connect(){throw new Error('do not access');}}}}}});check('Bridge never climbs into the parent owner application',()=>{assert(!b.available().text);assert.throws(()=>b.local(),/sidecar_missing/);});
}

{
 const [l,b]=setup();b.voiceStatusValue.prepared=false;b.voiceStatusValue.loaded=false;
 await l.start({mode:'speak',input:'Do not claim this was spoken.'});
 check('Activation alone cannot falsely establish voice readiness',()=>{assert.equal(l.armed,false);assert(!b.calls.some(x=>x[0]==='speak'));assert.equal(l.error.code,'speech_preparation_unconfirmed');assert(!l.busy);});l.dispose();
}
{
 const [l,b]=setup();await l.start({mode:'speak',input:'<think>Only hidden analysis in this fixture.</think>'});
 check('No speakable content is reported instead of claiming playback',()=>{assert(!b.calls.some(x=>x[0]==='speak'));assert(l.message.includes('no speakable text'));});l.dispose();
}
{
 const [l,b]=setup();let largest=0;l.onChange=s=>{largest=Math.max(largest,s.queued);};
 const long='This is a bounded sentence for a deliberately long response. '.repeat(80);
 b.complete=async o=>{b.calls.push(['complete',o]);o.onToken(long);return {ok:true,output:long};};
 await l.start({mode:'together',input:'Budget check.'});
 check('Speech queue and total character budget are bounded',()=>{assert(largest<=12);assert(l.run.enqueuedChars<=1800);assert(l.run.clipped);assert.equal(l.output,long);});l.dispose();
}
{
 const [l,b]=setup();b.output='<think>Private model scratch text.</think> This is the only sentence suitable for speech in the fixture.';
 await l.start({mode:'together',input:'Filter check.'});
 check('Streaming reasoning tags remain on screen but are never sent to speech',()=>{assert(l.output.includes('scratch'));assert(b.calls.filter(x=>x[0]==='speak').every(x=>!x[1].text.includes('scratch')));});l.dispose();
}
{
 const [l,b]=setup();b.failText=true;await l.start({mode:'together',input:'Missing model.'});
 check('A parallel successful voice preparation cannot mask a text error',()=>{assert.equal(l.error.code,'local_ai_model_not_loaded');assert(l.message.includes('Text generation unavailable'));assert(!b.calls.some(x=>x[0]==='speak'));});l.dispose();
}
{
 const [l,b]=setup();b.prepText=deferred();const promise=l.prepareText();l.stopText();
 check('Text preparation retains its lease after Stop',()=>assert(l.textPreparation));b.prepText.resolve({ok:true});await promise;
 check('Text preparation does not unload or modify the voice engine',()=>assert(!b.calls.some(x=>['activate','speak','unload'].includes(x[0]))));l.dispose();
}
{
 const scope={capp:{ai:{local:{connect:()=>({complete:()=>Promise.resolve({output:'old'})})}}}};const b=new CappBridge(scope);b.textClient();scope.capp.ai.local={connect:()=>({})};
 check('Cached connections also reject a replaced runtime during use',()=>assert.throws(()=>b.complete({prompt:'test'}),/provider_changed/));
}

console.log(JSON.stringify({passed:checks.length,checks},null,2));
