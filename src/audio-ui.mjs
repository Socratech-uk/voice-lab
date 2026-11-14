import {decodeAudioImport} from './audio-edit.mjs';
import {AudioAssetLibrary,AudioWorkshop,AUDIO_MODELS,AUDIO_BATCH_PROTOCOL,inspectAssetWav,audioRecipe,AUDIO_MODEL_OPTIONS,assetBase64} from './audio-assets.mjs';
const audioAssets=audioDisk.register('sounds',new AudioAssetLibrary({onChange:()=>window.dispatchEvent(new Event('voice-lab:library-change'))}),'tx',['assets','audio']),audioWorkshop=new AudioWorkshop(bridge,audioAssets,()=>renderAudioWorkshop());
let audioOpen=false,audioDirty=false,audioEditing=null,audioLibraryBusy=false,audioPage=0,audioTotal=0,audioListSerial=0;
const audioSelected=new Set(),audioViews=new Map();let audioLatestKey='',audioLatestUrl=null;
$('audio-latest-open').addEventListener('click',()=>{if(audioWorkshop.latest)void openAudioTimeline(audioWorkshop.latest.id).catch(audioFail);});
$('audio-latest-player').addEventListener('play',()=>{for(const v of audioViews.values())v.audio?.pause();});
const audioFields=['audio-title','audio-kind','audio-prompt','audio-duration','audio-seed','audio-category','audio-subject','audio-tags','audio-notes','audio-model','audio-device'];
function audioForm(){return {model:$('audio-model').value,device:$('audio-device').value,title:$('audio-title').value,kind:$('audio-kind').value,prompt:$('audio-prompt').value,durationSeconds:Number($('audio-duration').value),seed:Number($('audio-seed').value),category:$('audio-category').value,subject:$('audio-subject').value,tags:$('audio-tags').value.split(',').map(s=>s.trim()).filter(Boolean),notes:$('audio-notes').value};}
function audioFill(row){const r=row.recipe||row;for(const [id,value] of Object.entries({'audio-title':row.title||'','audio-kind':r.kind||'sfx','audio-prompt':r.prompt||'','audio-duration':r.durationSeconds||5,'audio-seed':r.seed??1,'audio-category':row.category||'','audio-subject':row.subject||'','audio-tags':(row.tags||[]).join(', '),'audio-notes':row.notes||'','audio-model':r.model||AUDIO_MODELS[r.kind||'sfx'],'audio-device':r.device||'cpu'}))$(id).value=value;audioDirty=false;renderAudioWorkshop();}
function audioFail(e){audioWorkshop.error=String(e.message||e);renderAudioWorkshop();}
async function audioAction(fn,{refresh=true}={}){if(audioLibraryBusy||audioWorkshop.busy)return;audioLibraryBusy=true;audioWorkshop.error='';renderAudioWorkshop();try{return await fn();}catch(e){audioFail(e);}finally{audioLibraryBusy=false;if(refresh)await refreshAudioAssets().catch(audioFail);renderAudioWorkshop();}}
async function audioReplace(){return !audioDirty||await confirmLibrary('Discard unsaved changes?','Save this asset before opening another or starting a new one.','Discard changes');}
for(const id of audioFields)$(id).addEventListener('input',()=>{audioDirty=true;});
function setAudioOpen(value){if(lab.busy||dialogueStudio.busy||libraryBusy||audioWorkshop.busy||audioLibraryBusy)return;
  if(value)setDialogueOpen(false);audioOpen=value;document.body.classList.toggle('audio-open',value);$('audio-workspace').hidden=!value;
  if(value){$('workspace').hidden=true;$('dialogue-workspace').hidden=true;for(const b of document.querySelectorAll('[data-mode],#dialogue-tab'))b.setAttribute('aria-pressed','false');void audioAction(async()=>{await audioAssets.open();await audioWorkshop.check();});}
  else{$('workspace').hidden=dialogueOpen;}
  $('audio-tab').setAttribute('aria-pressed',String(value));renderAudioWorkshop();
}
function renderAudioWorkshop(){
  const w=audioWorkshop,busy=w.busy||audioLibraryBusy,kind=$('audio-kind').value,model=$('audio-model').value,device=$('audio-device').value,spec=w.status?.models?.find(m=>m.id===model),state=w.status?.state;
  document.body.dataset.audioBusy=String(busy);$('audio-live').textContent=w.message;$('audio-error').hidden=!w.error;$('audio-error').textContent=w.error;
  $('audio-engine').textContent=state?.loaded&&state.model===model&&state.device===device?'Selected model ready · '+state.deviceName:spec?.available?'Engine installed · selected model not loaded':'Enable Sound and music authoring in Local AI, then freshly Compile and Package this app.';
  $('audio-download-size').textContent=spec?`${((spec.bytesByDevice?.[device]||spec.bytes)/1e9).toFixed(2)} GB for this model; shared files are reused. Stereo 44.1 kHz output.`:'Stable Audio 3 · Small and Medium · CPU or Windows GPU';
  for(const id of audioFields)$(id).disabled=busy;
  if(audioEditing?.state==='ready')for(const id of ['audio-kind','audio-prompt','audio-duration','audio-seed','audio-model','audio-device'])$(id).disabled=true;
  for(const el of $('audio-workspace').querySelectorAll('button,input[type=file]'))el.disabled=busy;
  $('audio-prepare').disabled=busy||!$('audio-terms').checked;$('audio-terms').disabled=busy;
  $('audio-render').disabled=busy||audioEditing?.state==='ready'||!!w.unsaved;
  $('audio-render-selected').disabled=busy||!audioSelected.size||!!w.unsaved;
  $('audio-export').textContent=audioSelected.size?'Back up selected ('+audioSelected.size+')':'Back up audio library';
  $('audio-render-selected').textContent=`Render selected${audioSelected.size?' ('+audioSelected.size+')':''}`;
  $('audio-cancel').disabled=!w.busy;$('audio-previous').disabled=busy||!audioPage;$('audio-next').disabled=busy||(audioPage+1)*20>=audioTotal;
  $('audio-editor-state').textContent=audioEditing?`${audioEditing.state==='ready'?'Recorded':'Saved draft'} · revision ${audioEditing.revision}`:'New asset';
  const p=w.progress;$('audio-progress').hidden=!p;
  if(p?.totalBytes)$('audio-progress').value=p.bytes/p.totalBytes;else if(p?.steps)$('audio-progress').value=p.step/p.steps;else $('audio-progress').removeAttribute('value');
  $('audio-progress-text').textContent=p?`${p.phase}${p.steps?' · '+p.step+'/'+p.steps:''}${p.totalBytes?' · '+(p.bytes/1e9).toFixed(2)+' / '+(p.totalBytes/1e9).toFixed(2)+' GB':''}`:'';
  $('audio-unsaved').hidden=!w.unsaved;
  const latestKey=w.latest?w.latest.id+':'+w.latest.revision:'';
  if(latestKey&&latestKey!==audioLatestKey){audioLatestKey=latestKey;const row=w.latest;void audioAssets.blob(row.id).then(blob=>{if(audioLatestKey!==latestKey)return;$('audio-latest-player').pause();if(audioLatestUrl)URL.revokeObjectURL(audioLatestUrl);audioLatestUrl=URL.createObjectURL(blob);$('audio-latest-player').src=audioLatestUrl;$('audio-latest-title').textContent=row.title;$('audio-latest').hidden=false;}).catch(audioFail);}

  $('audio-duration').max=AUDIO_MODEL_OPTIONS[model]?.max||120;
  $('audio-duration-help').textContent=`Up to ${AUDIO_MODEL_OPTIONS[model]?.max||120} seconds per render. Extend saved tracks from the editor.`;
  for(const option of $('audio-model').options)option.disabled=!AUDIO_MODEL_OPTIONS[option.value].kinds.includes(kind);
  for(const b of document.querySelectorAll('[data-mode],#dialogue-tab,#audio-tab'))b.disabled=busy||lab.busy||dialogueStudio.busy||libraryBusy;
  for(const v of audioViews.values())for(const el of v.node.querySelectorAll('button,input'))el.disabled=busy;
}
async function saveAudioDraft(){
  const v=audioForm();if(audioEditing?.recipe===null)v.recipe=null;if(audioEditing){v.id=audioEditing.id;v.revision=audioEditing.revision;}
  audioEditing=await audioAssets.save(v);audioDirty=false;audioWorkshop.message='Asset saved.';return audioEditing;
}
function clearAudioViews(){for(const v of audioViews.values()){v.audio?.pause();if(v.url)URL.revokeObjectURL(v.url);}audioViews.clear();$('audio-assets').replaceChildren();}
async function refreshAudioAssets(){
  const ticket=++audioListSerial;const page=await audioAssets.list({kind:$('audio-filter-kind').value,category:$('audio-filter-category').value,query:$('audio-search').value,offset:audioPage*20,limit:20});if(ticket!==audioListSerial)return;if(page.total&&page.offset>=page.total){audioPage=Math.floor((page.total-1)/20);return refreshAudioAssets();}
  clearAudioViews();audioTotal=page.total;$('audio-asset-count').textContent=`${page.total} assets${page.total?' · '+(page.offset+1)+'–'+Math.min(page.total,page.offset+20):''}`;
  if(!page.total){const p=document.createElement('p');p.className='hint';p.textContent='Your effects, ambience and music will appear here. Save a draft or render your first sound.';$('audio-assets').append(p);}
  for(const row of page.items){
    const node=document.createElement('article');node.className='audio-asset';node.dataset.assetId=row.id;
    const heading=document.createElement('h4');heading.textContent=row.title;
    const meta=document.createElement('p');meta.className='hint';meta.textContent=[row.kind==='sfx'?'SFX':'Music',row.state==='ready'?row.result.durationSeconds+' s '+(row.result.channels===1?'mono':'stereo'):row.recipe.durationSeconds+' s · draft',row.category,row.subject,...row.tags.map(t=>'#'+t)].filter(Boolean).join(' · ');
    const prompt=document.createElement('p');prompt.className='audio-description';prompt.textContent=row.recipe?.prompt||'Imported audio · ready to edit and continue';
    const actions=document.createElement('div');actions.className='dialogue-actions';const open=document.createElement('button');open.textContent='Open';open.title=row.state==='ready'?'Open this recording in the waveform editor.':'Open this saved generation draft.';open.addEventListener('click',()=>{if(row.state==='ready'){void openAudioTimeline(row.id).catch(audioFail);return;}void audioAction(async()=>{if(!await audioReplace())return;audioEditing=await audioAssets.get(row.id);if(!audioEditing)throw Error('Asset was deleted. Refresh the library.');audioFill(audioEditing);$('audio-editor').scrollIntoView({block:'start',behavior:'smooth'});});});
    heading.title=open.title;heading.tabIndex=0;heading.setAttribute('role','button');heading.setAttribute('aria-label','Open '+row.title);heading.addEventListener('click',()=>open.click());heading.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open.click();}});
    node.addEventListener('click',e=>{if(!e.target.closest('button,input,a,audio,label,h4'))open.click();});

    const duplicate=document.createElement('button');duplicate.textContent='New variation';duplicate.title='Start a new draft from this asset with a new seed; the saved recording is retained.';duplicate.addEventListener('click',()=>void audioAction(async()=>{if(!await audioReplace())return;audioEditing=null;audioFill({...row,title:row.title+' · variation',recipe:{...row.recipe,kind:row.kind,prompt:row.recipe?.prompt||'',seed:((row.recipe?.seed||0)+1)%2147483648}});audioDirty=true;}));
    const remove=document.createElement('button');remove.className='text-button';remove.textContent='Delete';remove.title='Review deletion of this asset and its saved WAV; separately saved versions are retained.';remove.addEventListener('click',()=>void audioAction(async()=>{if(await confirmLibrary('Delete audio asset?',`Delete “${row.title}” and its saved WAV?`)){await audioAssets.remove(row.id,row.revision);audioSelected.delete(row.id);if(audioEditing?.id===row.id){audioEditing=null;audioFill({});}}}));
    actions.append(open,duplicate,remove);const view={node,audio:null,url:null};audioViews.set(row.id,view);
    {
      const label=document.createElement('label');label.className='audio-select';const input=document.createElement('input');input.type='checkbox';input.checked=audioSelected.has(row.id);input.setAttribute('aria-label','Select '+row.title);input.addEventListener('change',()=>{if(input.checked)audioSelected.add(row.id);else audioSelected.delete(row.id);renderAudioWorkshop();});label.append(input,document.createTextNode(row.state==='draft'?'Select draft':'Select asset'));node.append(label);
    }
    if(row.state==='ready'){
      actions.append(projectStageButton(()=>projectStageSound(row)));
      const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.setAttribute('aria-label',row.title);view.audio=audio;
      const link=document.createElement('a');link.className='dialogue-download';link.download=dialogueFilename(row.title)+'.wav';link.textContent='Download WAV';link.title='Download this saved recording as a WAV file.';
      node.append(audio,link);
      audio.addEventListener('play',()=>{$('audio-latest-player').pause();for(const v of audioViews.values())if(v.audio!==audio)v.audio?.pause();});
      void audioAssets.blob(row.id).then(blob=>{if(ticket!==audioListSerial||audioViews.get(row.id)!==view)return;view.url=URL.createObjectURL(blob);audio.src=view.url;link.href=view.url;}).catch(audioFail);
    }

    node.append(heading,meta,prompt,actions);$('audio-assets').append(node);
  }
  renderAudioWorkshop();
}
$('audio-tab').addEventListener('click',()=>setAudioOpen(true));
for(const b of document.querySelectorAll('[data-mode],#dialogue-tab'))b.addEventListener('click',()=>{if(!audioWorkshop.busy&&!audioLibraryBusy)setAudioOpen(false);});
$('audio-kind').addEventListener('change',()=>{if(!audioEditing)$('audio-duration').value=$('audio-kind').value==='music'?30:5;if(!AUDIO_MODEL_OPTIONS[$('audio-model').value].kinds.includes($('audio-kind').value))$('audio-model').value=AUDIO_MODELS[$('audio-kind').value];renderAudioWorkshop();});
for(const id of ['audio-model','audio-device'])$(id).addEventListener('change',renderAudioWorkshop);
$('audio-terms').addEventListener('change',renderAudioWorkshop);
$('audio-new').addEventListener('click',()=>void audioAction(async()=>{if(!await audioReplace())return;audioEditing=null;audioFill({kind:$('audio-kind').value});}));
$('audio-example').addEventListener('click',()=>void audioAction(async()=>{if(!await audioReplace())return;audioEditing=null;const kind=$('audio-kind').value;audioFill({kind,title:kind==='music'?'Quiet orbit':'Heavy airlock',category:kind==='music'?'Exploration':'Machinery',subject:'Kestrel',prompt:kind==='music'?'A restrained atmospheric science-fiction instrumental, warm synthesizer pads, sparse piano, slow pulse, quiet exploration, no vocals.':'A heavy metal spacecraft airlock opens, pneumatic hiss, deep mechanical movement, solid locking clunk, isolated sound, no music.',durationSeconds:kind==='music'?30:5,seed:1});audioDirty=true;}));
$('audio-save').addEventListener('click',()=>void audioAction(saveAudioDraft));
$('audio-prepare').addEventListener('click',()=>void audioAction(()=>audioWorkshop.prepare({model:$('audio-model').value,device:$('audio-device').value},$('audio-terms').checked)));
$('audio-check').addEventListener('click',()=>void audioAction(()=>audioWorkshop.check()));
$('audio-unload').addEventListener('click',()=>void audioAction(()=>audioWorkshop.unload()));
$('audio-cancel').addEventListener('click',()=>void audioWorkshop.cancel().catch(audioFail));
$('audio-render').addEventListener('click',()=>void audioAction(async()=>{const row=await saveAudioDraft();await audioWorkshop.renderBatch({ids:[row.id]});audioEditing=await audioAssets.get(row.id);audioFill(audioEditing);}));
$('audio-render-selected').addEventListener('click',()=>void audioAction(async()=>{await audioWorkshop.renderBatch({ids:[...audioSelected]});audioSelected.clear();}));
$('audio-retry-save').addEventListener('click',()=>void audioAction(()=>audioWorkshop.saveUnsaved()));
$('audio-download-unsaved').addEventListener('click',()=>{const u=audioWorkshop.unsaved;if(u)downloadDialogue(new Blob([inspectAssetWav(u.result.audioWav).bytes],{type:'audio/wav'}),dialogueFilename(u.title)+'.wav');});
$('audio-dismiss-unsaved').addEventListener('click',()=>void audioAction(async()=>{if(await confirmLibrary('Discard unsaved recording?','Download the WAV first if you want to keep it.','Discard recording'))audioWorkshop.unsaved=null;}));
for(const id of ['audio-filter-kind','audio-filter-category','audio-search'])$(id).addEventListener(id==='audio-filter-kind'?'change':'input',()=>{audioPage=0;void refreshAudioAssets().catch(audioFail);});
$('audio-refresh').addEventListener('click',()=>void audioAction(async()=>{}));
$('audio-previous').addEventListener('click',()=>{audioPage--;void refreshAudioAssets().catch(audioFail);});$('audio-next').addEventListener('click',()=>{audioPage++;void refreshAudioAssets().catch(audioFail);});
$('audio-export').addEventListener('click',()=>void audioAction(async()=>downloadDialogue(new Blob([JSON.stringify(await audioAssets.export(audioSelected.size?{ids:[...audioSelected]}:{}))],{type:'application/json'}),'voice-lab-audio-backup.json')));
$('audio-import').addEventListener('click',()=>$('audio-file').click());
$('audio-file').addEventListener('change',()=>{const file=$('audio-file').files[0];$('audio-file').value='';if(file)void audioAction(async()=>{if(file.size>510_000_000)throw Error('Import is limited to 510 MB. Split larger collections into smaller backups.');const data=JSON.parse(await file.text()),result=await audioAssets.import(data);if(data.protocol===AUDIO_BATCH_PROTOCOL){audioSelected.clear();for(const row of result)audioSelected.add(row.id);}audioWorkshop.message='Imported saved assets. Rendering starts only when requested.';});});
$('audio-import-media').addEventListener('click',()=>$('audio-media-file').click());
$('audio-media-file').addEventListener('change',()=>{const files=[...$('audio-media-file').files];$('audio-media-file').value='';if(files.length)void audioAction(async()=>{if(files.length>20)throw Error('Import up to 20 tracks at a time.');for(const file of files){const bytes=await decodeAudioImport(file);await audioAssets.saveMedia({metadata:{title:file.name.replace(/\.[^.]+$/,'').slice(0,160),kind:$('audio-kind').value,category:$('audio-category').value,tags:['imported']},bytes});}audioWorkshop.message=`Imported ${files.length} audio tracks.`;});});
window.voiceLabAudio=Object.freeze({protocol:'capp.voice-lab.audio-api.v1',ready:()=>audioAssets.open(),refresh:()=>refreshAudioAssets(),
  assets:Object.freeze({list:o=>audioAssets.list(o),get:(id,o)=>audioAssets.get(id,o),save:v=>audioAssets.save(v),remove:(id,revision)=>audioAssets.remove(id,revision),importBatch:b=>audioAssets.importBatch(b),importWav:({audioWav,...metadata})=>audioAssets.saveMedia({metadata,audioWav}),importAudio:async({file,...metadata})=>audioAssets.saveMedia({metadata,bytes:await decodeAudioImport(file)}),edit:(id,revision,edit)=>audioAssets.edit(id,revision,edit)}),
  status:()=>audioWorkshop.check(),prepare:(kind,acceptLicense)=>audioWorkshop.prepare(kind,acceptLicense),renderBatch:r=>audioWorkshop.renderBatch(r),extend:r=>audioWorkshop.extend(r),cancel:()=>audioWorkshop.cancel(),unload:()=>audioWorkshop.unload(),export:o=>audioAssets.export(o),import:v=>audioAssets.import(v)});
window.addEventListener('beforeunload',e=>{if(audioDirty||audioTimelineDirty()||audioWorkshop.busy||audioLibraryBusy||audioWorkshop.unsaved){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{audioWorkshop.dispose();$('audio-latest-player').pause();if(audioLatestUrl)URL.revokeObjectURL(audioLatestUrl);clearAudioViews();audioAssets.close();},{once:true});
audioFill({kind:'sfx'});
