export const DIALOGUE_MODELS = Object.freeze([
  {id:'qwen-design',name:'Qwen3 · Voice design',engine:'qwen',mode:'design',gb:4.52,description:'Describe a new character voice, then render a line. Save a good take as a reference for consistent dialogue with Qwen Clone.'},
  {id:'qwen-custom',name:'Qwen3 · Preset voices',engine:'qwen',mode:'custom',gb:4.52,description:'Nine speaker presets with a delivery instruction. Try accents, pace and emotion in the direction field.'},
  {id:'qwen-clone',name:'Qwen3 · Voice clone',engine:'qwen',mode:'clone',gb:4.55,description:'Use reference audio and its exact transcript to keep a character voice. This model has no separate direction control.'},
  {id:'chatterbox',name:'Chatterbox · Expressive',engine:'chatterbox',mode:'expressive',gb:3.19,description:'English dialogue with emotion and guidance controls. Use the built-in voice or supply a character reference.'},
  {id:'chatterbox-turbo',name:'Chatterbox · Turbo',engine:'chatterbox',mode:'turbo',gb:2.99,description:'English dialogue with optional reference audio and performance tags such as [laugh], [chuckle] and [sigh].'}
]);
export const DIALOGUE_LANGUAGES = ['English','Chinese','Japanese','Korean','German','French','Russian','Portuguese','Spanish','Italian'];
export const DIALOGUE_SPEAKERS = ['Ryan','Aiden','Vivian','Serena','Uncle_Fu','Dylan','Eric','Ono_Anna','Sohee'];
export const DIALOGUE_DEFAULTS = Object.freeze({model:'qwen-design',device:'auto',language:'English',speaker:'Ryan',instruct:'A seasoned British salvage captain. Low, weathered voice, dry humour, relaxed but precise delivery.',temperature:.8,exaggeration:.5,cfgWeight:.5,seed:42,takes:1,character:'Salvage captain'});
const dialogueAssert=(condition,message)=>{if(!condition)throw new Error(message);};
export function dialogueSettings(value={}) {
  const d={...DIALOGUE_DEFAULTS};
  if(!value||typeof value!=='object'||Array.isArray(value))return d;
  for(const k of ['model','device','language','speaker','instruct','temperature','exaggeration','cfgWeight','seed','takes','character'])if(Object.hasOwn(value,k))d[k]=value[k];
  if(!DIALOGUE_MODELS.some(m=>m.id===d.model))d.model=DIALOGUE_DEFAULTS.model;
  if(!['auto','cuda','cpu'].includes(d.device))d.device='auto';
  if(!DIALOGUE_LANGUAGES.includes(d.language))d.language='English';
  if(!DIALOGUE_SPEAKERS.includes(d.speaker))d.speaker='Ryan';
  for(const [key,low,high] of [['temperature',.1,1.5],['exaggeration',0,1],['cfgWeight',0,1],['seed',0,2147483647],['takes',1,4]]){
    if(typeof d[key]!=='number'||!Number.isFinite(d[key])||d[key]<low||d[key]>high||(['seed','takes'].includes(key)&&!Number.isInteger(d[key])))d[key]=DIALOGUE_DEFAULTS[key];
  }
  d.instruct=typeof d.instruct==='string'?d.instruct.slice(0,600):DIALOGUE_DEFAULTS.instruct;
  d.character=typeof d.character==='string'?d.character.slice(0,80):DIALOGUE_DEFAULTS.character;
  return d;
}
export function dialogueRequest(settings,text,reference,seed=settings.seed) {
  const s=dialogueSettings(settings),m=DIALOGUE_MODELS.find(m=>m.id===s.model);
  dialogueAssert(typeof text==='string'&&text.trim().length>0,'Enter something to say.');
  const request={model:m.id,device:s.device,text:text.trim(),temperature:s.temperature,seed};
  if(m.engine==='qwen')request.language=s.language;
  if(['design','custom'].includes(m.mode))request.instruct=s.instruct.trim();
  if(m.mode==='design')dialogueAssert(request.instruct,'Describe the voice you want to design.');
  if(m.mode==='custom')request.speaker=s.speaker;
  if(['clone','expressive','turbo'].includes(m.mode)&&reference){
    inspectDialogueWav(reference.audioWav,true);
    request.referenceWav=reference.audioWav;
    if(m.mode==='clone')request.referenceText=reference.text.trim();
  }
  if(m.mode==='clone')dialogueAssert(request.referenceWav&&request.referenceText,'Add a 6–30 second reference and its exact spoken transcript.');
  if(m.mode==='expressive'){request.exaggeration=s.exaggeration;request.cfgWeight=s.cfgWeight;}
  return request;
}
export function dialogueBytes(encoded) {
  dialogueAssert(typeof encoded==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(encoded),'Invalid WAV data.');
  const raw=atob(encoded);return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export function dialogueBase64(bytes) {
  let result='';for(let i=0;i<bytes.length;i+=16384)result+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(result);
}
export function inspectDialogueWav(encoded,reference=false) {
  const bytes=dialogueBytes(encoded),v=new DataView(bytes.buffer),tag=(o,n)=>String.fromCharCode(...bytes.subarray(o,o+n));
  dialogueAssert(bytes.length>=44&&tag(0,4)==='RIFF'&&tag(8,4)==='WAVE'&&v.getUint32(4,true)+8===bytes.length,'Invalid WAV file.');
  let format=null,size=null;
  for(let p=12;p+8<=bytes.length;){const n=v.getUint32(p+4,true);dialogueAssert(p+8+n<=bytes.length,'Truncated WAV file.');
    if(tag(p,4)==='fmt '){dialogueAssert(n>=16&&!format,'Invalid WAV format.');format={encoding:v.getUint16(p+8,true),channels:v.getUint16(p+10,true),rate:v.getUint32(p+12,true),bits:v.getUint16(p+22,true)};}
    if(tag(p,4)==='data'){dialogueAssert(size===null,'Invalid WAV data.');size=n;}p+=8+n+(n%2);
  }
  dialogueAssert(format?.encoding===1&&format.channels===1&&format.bits===16&&format.rate>=16000&&format.rate<=48000&&size>0&&size%2===0,'Use mono PCM16 WAV audio.');
  const duration=size/(format.rate*2);
  if(reference)dialogueAssert(format.rate===24000&&duration>=6&&duration<=30&&bytes.length<=1_440_100,'Reference audio must be 6–30 seconds of mono 24 kHz PCM WAV.');
  return {bytes,duration,sampleRate:format.rate};
}
export async function normaliseDialogueReference(file,scope=globalThis) {
  dialogueAssert(file.size>0&&file.size<=20*1024*1024,'Choose an audio file smaller than 20 MB.');
  const Context=scope.AudioContext||scope.webkitAudioContext;
  dialogueAssert(Context&&scope.OfflineAudioContext,'Audio conversion is unavailable in this browser.');
  const context=new Context();let decoded;
  try{decoded=await context.decodeAudioData(await file.arrayBuffer());}finally{await context.close();}
  dialogueAssert(decoded.duration>=6&&decoded.duration<=30,'Choose a clean 6–30 second single-speaker clip.');
  const frames=Math.round(decoded.duration*24000),offline=new scope.OfflineAudioContext(1,frames,24000);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const result=await offline.startRendering(),samples=result.getChannelData(0),buffer=new ArrayBuffer(44+frames*2),v=new DataView(buffer);
  const tag=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  tag(0,'RIFF');v.setUint32(4,36+frames*2,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,24000,true);v.setUint32(28,48000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,frames*2,true);
  for(let i=0;i<frames;i++){const x=samples[i];dialogueAssert(Number.isFinite(x),'Invalid audio samples.');v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))*32767),true);}
  const audioWav=dialogueBase64(new Uint8Array(buffer));inspectDialogueWav(audioWav,true);
  return {audioWav,text:'',name:String(file.name||'Character reference').slice(0,120),duration:frames/24000};
}
export function dialogueProfile(settings,reference) {
  return {protocol:'capp.voice-lab.character.v1',settings:dialogueSettings(settings),reference:reference?{audioWav:reference.audioWav,text:reference.text,name:reference.name}:null};
}
export function readDialogueProfile(raw) {
  dialogueAssert(typeof raw==='string'&&raw.length<=2_000_000,'Character profile is too large.');
  const p=JSON.parse(raw);dialogueAssert(p?.protocol==='capp.voice-lab.character.v1','This is not a Voice Lab character profile.');
  const settings=dialogueSettings(p.settings);let reference=null;
  if(p.reference){const r=p.reference,info=inspectDialogueWav(r.audioWav,true);dialogueAssert(typeof r.text==='string'&&r.text.length<=1200,'Reference transcript is invalid.');reference={audioWav:r.audioWav,text:r.text,name:typeof r.name==='string'?r.name.slice(0,120):'Imported reference',duration:info.duration};}
  return {settings,reference};
}
export class DialogueStudio {
  constructor(bridge,onChange=()=>{}){this.bridge=bridge;this.onChange=onChange;this.settings={...DIALOGUE_DEFAULTS};this.reference=null;this.takes=[];this.busy=false;this.cancelled=false;this.closed=false;this.status=null;this.message='Choose a model to begin.';this.error='';this.progress=null;this.serial=0;}
  notify(){if(!this.closed)this.onChange(this);}
  configure(value){if(this.busy)return;this.settings=dialogueSettings({...this.settings,...value});this.notify();}
  async operation(work){
    dialogueAssert(!this.closed&&!this.busy,'A dialogue operation is already running.');this.busy=true;this.cancelled=false;this.error='';this.progress=null;this.notify();
    try{return await work();}catch(e){if(this.cancelled)this.message='Stopped. Completed takes are still available.';else{this.error=String(e?.message||e);this.message='Dialogue operation failed.';try{this.status=await this.bridge.dialogueClient().status();}catch{this.status=null;}}return null;}
    finally{this.busy=false;this.progress=null;this.notify();}
  }
  async check(){return this.operation(async()=>{this.status=await this.bridge.dialogueClient().status();this.message=this.status.state?.loaded?`Ready · ${this.status.state.deviceName}`:'Choose a model, then download and load it.';});}
  progressChanged(p){if(this.closed||this.cancelled)return;this.progress=p;this.notify();}
  prepare(){return this.operation(async()=>{const s=this.settings;this.message='Preparing '+DIALOGUE_MODELS.find(m=>m.id===s.model).name;this.notify();const result=await this.bridge.dialogueClient().prepare({model:s.model,device:s.device,onProgress:p=>this.progressChanged(p)});if(this.cancelled)return;this.status=await this.bridge.dialogueClient().status();this.message=`Ready · ${result.deviceName} · ${result.device.toUpperCase()}`;});}
  generate(text){return this.operation(async()=>{
    const s={...this.settings},request=dialogueRequest(s,text,this.reference);
    for(let i=0;i<s.takes&&!this.cancelled;i++){
      this.message=`Rendering take ${i+1} of ${s.takes}…`;this.notify();
      const seed=(s.seed+i)%2147483648;
      const result=await this.bridge.dialogueClient().render({...request,seed,onProgress:p=>this.progressChanged(p)});
      if(this.cancelled||this.closed)break;
      const info=inspectDialogueWav(result.audioWav);
      dialogueAssert(result.model===s.model&&result.seed===seed,'The engine returned a different model or seed.');
      const take={...result,durationSeconds:info.duration,id:++this.serial,text:request.text,character:s.character,settings:{...s,seed},createdAt:new Date().toISOString()};
      this.takes.push(take);this.notify();
      // The app library commits each completed take before another is rendered.
      // Failed persistence keeps this take in memory and stops the batch.
      if(this.onTake)await this.onTake(take);
      // Bound retained audio to 12 takes. UI revokes removed object URLs.
      while(this.takes.length>12){const oldest=this.onTake?this.takes.findIndex(t=>t.savedId):0;if(oldest<0)break;this.takes.splice(oldest,1);}this.notify();
    }
    if(!this.cancelled){this.message=`${s.takes} ${s.takes===1?'take':'takes'} ready${this.onTake?' and saved':''}. Audition below.`;this.status=await this.bridge.dialogueClient().status();}
  });}
  async cancel(){if(!this.busy)return;this.cancelled=true;this.message='Stopping…';this.notify();try{await this.bridge.dialogueClient().cancel();}catch(e){this.error=String(e?.message||e);this.notify();}}
  unload(){return this.operation(async()=>{await this.bridge.dialogueClient().unload();this.status=await this.bridge.dialogueClient().status();this.message='Dialogue engine unloaded.';});}
  dispose(){this.closed=true;this.cancelled=true;this.bridge.dialogue?.dispose?.();}
}
