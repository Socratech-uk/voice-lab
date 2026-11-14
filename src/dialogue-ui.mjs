import {DialogueStudio, DIALOGUE_MODELS, DIALOGUE_LANGUAGES, DIALOGUE_SPEAKERS, dialogueSettings, dialogueProfile, readDialogueProfile, normaliseDialogueReference, inspectDialogueWav} from './dialogue.mjs';
// Uses the same window-scoped bridge as the original four Lab workflows.
const dialogueStudio=new DialogueStudio(bridge,()=>renderDialogue());
const dialoguePreferenceKey='capp.voice-lab.dialogue.preferences.v1';
try{dialogueStudio.settings=dialogueSettings(JSON.parse(localStorage.getItem(dialoguePreferenceKey)||'null'));}catch{}
const dialogueTakeViews=new Map();let dialogueReferenceUrl=null,dialogueReferenceValue=null,dialogueOpen=false;
for(const m of DIALOGUE_MODELS)$('dialogue-model').add(new Option(m.name,m.id));
for(const name of DIALOGUE_LANGUAGES)$('dialogue-language').add(new Option(name,name));
for(const name of DIALOGUE_SPEAKERS)$('dialogue-speaker').add(new Option(name,name));
function saveDialogueSettings(){audioDisk.setPreference(dialoguePreferenceKey,JSON.stringify(dialogueStudio.settings));}
function dialogueFilename(name){return String(name||'character').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,70)||'character';}
function downloadDialogue(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function dialogueErrorHelp(code){
  if(/not_bundled|0.12.0|runtime_unavailable|lab_.*(missing|unavailable)/.test(code))return 'Update cApp, select Dialogue authoring engines → Both in Local AI, then compile and package a new Windows release. Run its Setup.exe.';
  if(/watermarker|pkg_resources/.test(code))return 'The Chatterbox watermarker dependency is missing. Rebuild with Local AI 0.13.1 and install the new package. Changing CPU/GPU cannot repair a missing dependency.';
  if(/cuda_unavailable/.test(code))return 'CUDA was not available. Update the NVIDIA driver, or choose CPU explicitly and load again.';
  if(/out_of_memory/.test(code))return 'The GPU ran out of memory. Unload other GPU models in Local AI Studio, then retry; CPU is also available.';
  if(/not_prepared/.test(code))return 'Click Download & load model first. This verifies the selected model before rendering.';
  if(/engine_changed|engine_missing|import_probe/.test(code))return 'The packaged engine is missing or failed verification. Rebuild and reinstall this app with the updated cApp.';
  if(/timeout|download|URLError|HTTPError|TimeoutError/.test(code))return 'The operation could not finish. Check connectivity for first-time downloads and try again; partial model downloads can resume.';
  if(/engine_failed/.test(code))return 'The engine failed. The details include the failing stage and exception. Keep them when reporting the problem.';
  return code;
}
function setDialogueOpen(value){
  if(lab.busy||dialogueStudio.busy||document.body.dataset.audioBusy==='true'||(window.voiceLabLibrary&&libraryBusy))return;
  dialogueOpen=value;document.body.classList.toggle('dialogue-open',value);
  $('dialogue-workspace').hidden=!value;$('workspace').hidden=value;
  $('dialogue-tab').setAttribute('aria-pressed',String(value));
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(!value&&b.dataset.mode===currentMode));
  if(value&&!dialogueStudio.status&&!dialogueStudio.busy)void dialogueStudio.check();
}
function renderDialogue(){
  const d=dialogueStudio,s=d.settings,m=DIALOGUE_MODELS.find(m=>m.id===s.model);
  document.body.dataset.dialogueBusy=String(d.busy);
  for(const b of document.querySelectorAll('[data-mode]'))b.disabled=d.busy||lab.busy||document.body.dataset.audioBusy==='true';
  for(const el of document.querySelectorAll('[data-dialogue-setting]')){
    const value=s[el.dataset.dialogueSetting];if(el!==document.activeElement)el.value=String(value);el.disabled=d.busy;
  }
  for(const id of ['dialogue-text','dialogue-transcript','dialogue-reference-file','dialogue-import-profile','dialogue-export-profile','dialogue-clear-reference','dialogue-example','dialogue-random-seed','dialogue-clear-takes','dialogue-check','dialogue-unload','dialogue-prepare','dialogue-generate'])$(id).disabled=d.busy;
  $('dialogue-cancel').disabled=!d.busy||d.cancelled;
  const statusModel=d.status?.models?.find(row=>row.id===m.id),supported=d.status?.supported===true;
  $('dialogue-setup').hidden=supported&&statusModel?.available===true;
  if(d.status&&(!supported||!statusModel?.available)){$('dialogue-prepare').disabled=true;$('dialogue-generate').disabled=true;}
  $('dialogue-model-description').textContent=m.description;
  $('dialogue-direction-wrap').hidden=!['design','custom'].includes(m.mode);
  $('dialogue-direction-label').textContent=m.mode==='design'?'Voice description & delivery':'Delivery instruction';
  $('dialogue-language-wrap').hidden=m.engine!=='qwen';$('dialogue-speaker-wrap').hidden=m.mode!=='custom';
  $('dialogue-reference-wrap').hidden=!['clone','expressive','turbo'].includes(m.mode);
  $('dialogue-transcript-wrap').hidden=false;$('dialogue-expression-wrap').hidden=m.mode!=='expressive';
  $('dialogue-reference-status').textContent=d.reference?`${d.reference.name} · ${d.reference.duration.toFixed(1)} s`:m.mode==='clone'?'Required · 6–30 seconds with transcript':'Optional · built-in voice when empty';
  $('dialogue-clear-reference').disabled=d.busy||!d.reference;
  if($('dialogue-transcript')!==document.activeElement)$('dialogue-transcript').value=d.reference?.text||'';
  if(dialogueReferenceValue!==d.reference?.audioWav){
    $('dialogue-reference-audio').pause();$('dialogue-reference-audio').removeAttribute('src');if(dialogueReferenceUrl)URL.revokeObjectURL(dialogueReferenceUrl);
    dialogueReferenceValue=d.reference?.audioWav;dialogueReferenceUrl=null;
    if(d.reference){dialogueReferenceUrl=URL.createObjectURL(new Blob([inspectDialogueWav(d.reference.audioWav,true).bytes],{type:'audio/wav'}));$('dialogue-reference-audio').src=dialogueReferenceUrl;}
    $('dialogue-reference-audio').hidden=!d.reference;
  }
  $('dialogue-text-hint').textContent=m.mode==='turbo'?'Try tags in the line: [laugh], [chuckle], [sigh].':'Render a few takes and choose the delivery you like.';
  for(const key of ['temperature','exaggeration','cfgWeight'])$('dialogue-'+key+'-value').textContent=s[key].toFixed(2);
  const state=d.status?.state;
  $('dialogue-engine-state').textContent=d.busy?'Working…':state?.loaded?`${state.deviceName} · ${state.model===m.id?'selected model ready':state.model+' loaded'}`:statusModel?.available?'Engine packaged · model not loaded':'Engine not available';
  $('dialogue-dot').className='dot'+(d.busy?' busy':state?.loaded?' ready':'');
  $('dialogue-download-size').textContent=`${m.gb.toFixed(2)} GB model download · reused offline after setup`;
  const p=d.progress;$('dialogue-progress').hidden=!p;
  if(p?.totalBytes>0&&p.phase==='downloading')$('dialogue-progress').value=p.bytes/p.totalBytes;else $('dialogue-progress').removeAttribute('value');
  $('dialogue-progress-label').textContent=p?`${({verifying:'Verifying model',downloading:'Downloading model',loading:'Loading model',rendering:'Rendering dialogue','checking-engine':'Checking packaged engine'})[p.phase]||p.phase}${p.totalBytes>0?' · '+(p.bytes/1e9).toFixed(2)+' / '+(p.totalBytes/1e9).toFixed(2)+' GB':''}`:'';
  $('dialogue-live').textContent=d.message;$('dialogue-error').hidden=!d.error;$('dialogue-error-code').textContent=d.error;$('dialogue-error-help').textContent=dialogueErrorHelp(d.error);
  $('dialogue-count').textContent=`${[...$('dialogue-text').value].length} characters`;
  $('dialogue-take-count').textContent=String(d.takes.length);$('dialogue-empty').hidden=d.takes.length>0;
  const ids=new Set(d.takes.map(t=>t.id));for(const [id,view] of dialogueTakeViews){if(!ids.has(id)){view.audio.pause();URL.revokeObjectURL(view.url);view.node.remove();dialogueTakeViews.delete(id);}}
  for(const take of d.takes){
    let view=dialogueTakeViews.get(take.id);
    if(!view){view=makeDialogueTake(take);dialogueTakeViews.set(take.id,view);$('dialogue-takes').prepend(view.node);}
    view.reference.disabled=d.busy||take.durationSeconds<6||take.durationSeconds>30||take.text.length>1200;view.remove.disabled=d.busy;
    view.save.disabled=d.busy||!!take.savedId;view.save.textContent=take.savedId?'Saved to dialogue':'Save take';
  }
  if(window.voiceLabLibrary)renderLibraryControls();
}
function makeDialogueTake(take){
  const node=document.createElement('article');node.className='dialogue-take';
  const heading=document.createElement('h4');heading.textContent=`${take.character||'Character'} · Take ${take.id}`;
  const meta=document.createElement('p');meta.className='hint';meta.textContent=`${DIALOGUE_MODELS.find(m=>m.id===take.model)?.name} · ${take.durationSeconds.toFixed(1)} s · seed ${take.seed} · ${take.deviceName} · ${(take.generationMs/1000).toFixed(1)} s render`;
  const text=document.createElement('p');text.className='dialogue-take-text';text.textContent=take.text;
  const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';
  const url=URL.createObjectURL(new Blob([inspectDialogueWav(take.audioWav).bytes],{type:'audio/wav'}));audio.src=url;
  audio.addEventListener('play',()=>{for(const view of dialogueTakeViews.values())if(view.audio!==audio)view.audio.pause();$('dialogue-reference-audio').pause();});
  const actions=document.createElement('div');actions.className='dialogue-actions';
  const download=document.createElement('a');download.href=url;download.download=`${dialogueFilename(take.character)}-take-${take.id}-seed-${take.seed}.wav`;download.className='dialogue-download';download.textContent='Download WAV';download.title='Download this voice take as a WAV file.';
  const reference=document.createElement('button');reference.textContent='Use as reference';reference.title='Use a 6–30 second take to keep this character voice';
  reference.addEventListener('click',()=>void dialogueStudio.operation(async()=>{
    await adoptDialogueReference(take);
  }));
  const notes=document.createElement('button');notes.textContent='Take notes';notes.title='Download text, settings and timing as JSON';notes.addEventListener('click',()=>{const {audioWav,...data}=take;downloadDialogue(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`${dialogueFilename(take.character)}-take-${take.id}.json`);});
  const remove=document.createElement('button');remove.className='text-button';remove.textContent='Remove';remove.title='Remove this take from the session list; saved copies remain in the library.';remove.addEventListener('click',()=>void libraryAction(async()=>{if(!take.savedId&&!await confirmLibrary('Remove unsaved take?','This recording has not been saved. Download or save it first to keep it.','Remove take'))return;dialogueStudio.takes=dialogueStudio.takes.filter(t=>t.id!==take.id);dialogueStudio.notify();}));
  const save=document.createElement('button');save.textContent='Save take';save.title='Save this retained take to its dialogue without generating it again.';save.addEventListener('click',()=>void libraryAction(()=>saveSessionTake(take)));
  actions.append(download,reference,save,notes,remove);node.append(heading,meta,text,audio,actions);return {node,audio,url,reference,remove,save};
}
$('dialogue-tab').addEventListener('click',()=>setDialogueOpen(true));
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>setDialogueOpen(false));
for(const el of document.querySelectorAll('[data-dialogue-setting]'))el.addEventListener(el.type==='range'?'input':'change',()=>{const k=el.dataset.dialogueSetting;dialogueStudio.configure({[k]:['temperature','exaggeration','cfgWeight','seed','takes'].includes(k)?Number(el.value):el.value});saveDialogueSettings();});
$('dialogue-text').addEventListener('input',()=>{$('dialogue-count').textContent=`${[...$('dialogue-text').value].length} characters`;});
$('dialogue-text').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!dialogueStudio.busy){e.preventDefault();void renderSavedDialogue();}});
$('dialogue-transcript').addEventListener('input',()=>{if(dialogueStudio.reference&&!dialogueStudio.busy)dialogueStudio.reference.text=$('dialogue-transcript').value;});
for(const [id,method] of [['dialogue-prepare','prepare'],['dialogue-check','check'],['dialogue-unload','unload'],['dialogue-cancel','cancel']])$(id).addEventListener('click',()=>void dialogueStudio[method]());
$('dialogue-generate').addEventListener('click',()=>void renderSavedDialogue());
$('dialogue-random-seed').addEventListener('click',()=>{const n=new Uint32Array(1);crypto.getRandomValues(n);dialogueStudio.configure({seed:n[0]%2147483648});saveDialogueSettings();});
$('dialogue-example').addEventListener('click',()=>{$('dialogue-text').value=dialogueStudio.settings.model==='chatterbox-turbo'?'You paid how much for this ship? [chuckle] All right, captain. Let me find a wrench and see what we can save.':'Easy now. This wreck has been drifting for sixty years, and it can wait another minute. Bring us alongside the cargo hatch. If anything starts blinking red, you tell me before you touch it.';renderDialogue();});
$('dialogue-reference-file').addEventListener('change',()=>{const file=$('dialogue-reference-file').files[0];if(!file)return;void dialogueStudio.operation(async()=>{dialogueStudio.message='Reading reference audio…';dialogueStudio.notify();const ref=await normaliseDialogueReference(file);if(!dialogueStudio.cancelled){dialogueStudio.reference=ref;if(dialogueStudio.settings.character.trim())await saveActiveCharacter();dialogueStudio.message='Reference ready. Enter its exact transcript; it saves with the character.';}$('dialogue-reference-file').value='';});});
$('dialogue-clear-reference').addEventListener('click',()=>void libraryAction(async()=>{dialogueStudio.reference=null;$('dialogue-reference-file').value='';renderDialogue();if(dialogueStudio.settings.character.trim())await saveActiveCharacter();}));
$('dialogue-clear-takes').addEventListener('click',()=>void libraryAction(async()=>{if(dialogueStudio.takes.some(t=>!t.savedId)&&!await confirmLibrary('Clear unsaved takes?','Some recordings have not been saved. Download or save them first to keep them.','Clear session'))return;dialogueStudio.takes=[];renderDialogue();}));
$('dialogue-export-profile').addEventListener('click',()=>downloadDialogue(new Blob([JSON.stringify(dialogueProfile(dialogueStudio.settings,dialogueStudio.reference),null,2)],{type:'application/json'}),`${dialogueFilename(dialogueStudio.settings.character)}.voice-lab.json`));
$('dialogue-import-profile').addEventListener('click',()=>$('dialogue-profile-file').click());
$('dialogue-profile-file').addEventListener('change',()=>{const file=$('dialogue-profile-file').files[0];if(!file)return;void libraryAction(async()=>{if(file.size>2_000_000)throw new Error('Character profile is too large.');await importCharacterProfile(readDialogueProfile(await file.text()));});$('dialogue-profile-file').value='';});
$('dialogue-reference-audio').addEventListener('play',()=>{for(const view of dialogueTakeViews.values())view.audio.pause();});
window.addEventListener('capp:local-ai-ready',()=>{if(dialogueOpen&&!dialogueStudio.busy)void dialogueStudio.check();});
window.addEventListener('pagehide',()=>{dialogueStudio.dispose();for(const view of dialogueTakeViews.values()){view.audio.pause();URL.revokeObjectURL(view.url);}if(dialogueReferenceUrl)URL.revokeObjectURL(dialogueReferenceUrl);},{once:true});
renderDialogue();
