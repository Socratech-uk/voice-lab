import {VoiceLibrary, VOICE_LIBRARY_PROTOCOL} from './library.mjs';

const voiceLibrary=audioDisk.register('voice',new VoiceLibrary({onChange:()=>window.dispatchEvent(new Event('voice-lab:library-change'))}),'transaction',['characters','types','dialogues','takes','audio']);
let libraryReady=false,libraryBusy=false,activeCharacter=null,activeDialogue=null,lineDirty=false;
let characterTimer=null,characterSaveQueue=Promise.resolve(),characterSaveFailed=null,characterSaving=0,libraryRefreshTimer=null,libraryPage=0,libraryTotal=0;
let loadedLineType='';
let libraryCharacters=[],libraryTypes=[],libraryRefreshSerial=0,savedTakesSerial=0,renderContext=null;
const savedTakeViews=new Map(),libraryActiveKey='capp.voice-lab.library.active.v1';
const libraryTagInput=id=>$(id).value.split(',').map(x=>x.trim()).filter(Boolean);
const lineInputIds=['dialogue-text','dialogue-line-title','dialogue-line-type','dialogue-line-tags','dialogue-line-status','dialogue-line-notes'];
const libraryControlIds=['library-new-character','library-new-dialogue','dialogue-save-character','dialogue-duplicate-character','dialogue-delete-character','dialogue-save-line','dialogue-copy-line','dialogue-delete-line','library-export','library-import','library-refresh','library-save-type','library-delete-type','library-character-search','library-character-filter','library-type-filter','library-search','library-manage-type','library-type-name','character-notes','character-tags',...lineInputIds];
function libraryMessage(message){$('library-status').textContent=message;}
function libraryFailure(error){$('library-error').hidden=false;$('library-error').textContent=String(error?.message||error);}
function renderLibraryControls(){
  const busy=libraryBusy||dialogueStudio.busy;
  document.body.dataset.libraryBusy=String(libraryBusy);document.body.dataset.libraryReady=String(libraryReady);
  for(const el of document.querySelectorAll('[data-mode],#dialogue-tab,#audio-tab'))el.disabled=busy||lab.busy||document.body.dataset.audioBusy==='true';
  for(const id of libraryControlIds)$(id).disabled=busy||!libraryReady;
  for(const el of $('library-characters').querySelectorAll('button'))el.disabled=busy;
  for(const el of $('library-lines').querySelectorAll('button'))el.disabled=busy;
  for(const el of $('saved-takes').querySelectorAll('button'))el.disabled=busy;
  if(busy||!libraryReady)for(const el of $('dialogue-workspace').querySelectorAll('input,select,textarea,button'))if(el.id!=='dialogue-cancel')el.disabled=true;
  $('dialogue-duplicate-character').disabled=busy||!activeCharacter;
  $('dialogue-delete-character').disabled=busy||!activeCharacter;
  $('dialogue-delete-line').disabled=busy||!activeDialogue;
  $('library-previous').disabled=busy||libraryPage===0;$('library-next').disabled=busy||(libraryPage+1)*20>=libraryTotal;
  $('dialogue-line-save-status').textContent=lineDirty?'Unsaved changes':activeDialogue?`Saved · revision ${activeDialogue.revision}`:'New line';
}
async function libraryAction(work){
  if(libraryBusy||dialogueStudio.busy)return null;
  libraryBusy=true;$('library-error').hidden=true;renderDialogue();renderLibraryControls();
  try{await voiceLibrary.open();return await work();}catch(error){libraryFailure(error);return null;}
  finally{libraryBusy=false;renderDialogue();renderLibraryControls();}
}
function confirmLibrary(title,detail,accept='Delete'){
  const dialog=$('library-confirm');$('library-confirm-title').textContent=title;$('library-confirm-detail').textContent=detail;$('library-confirm-accept').textContent=accept;$('library-confirm-accept').title=detail;
  return new Promise(resolve=>{
    const finish=value=>{dialog.close();$('library-confirm-accept').removeEventListener('click',yes);$('library-confirm-cancel').removeEventListener('click',no);dialog.removeEventListener('cancel',cancel);resolve(value);};
    const yes=()=>finish(true),no=()=>finish(false),cancel=event=>{event.preventDefault();finish(false);};
    $('library-confirm-accept').addEventListener('click',yes);$('library-confirm-cancel').addEventListener('click',no);dialog.addEventListener('cancel',cancel);dialog.showModal();$('library-confirm-cancel').focus();
  });
}
async function canLeaveLine(){return !lineDirty||await confirmLibrary('Discard line changes?','Your saved dialogue and recordings will stay as they are. The unsaved changes in this editor will be discarded.','Discard changes');}
function rememberCharacter(){try{if(activeCharacter)localStorage.setItem(libraryActiveKey,activeCharacter.id);else localStorage.removeItem(libraryActiveKey);}catch{}}
function characterInput(){return {name:dialogueStudio.settings.character,settings:{...dialogueStudio.settings},reference:dialogueStudio.reference?{...dialogueStudio.reference}:null,notes:$('character-notes').value,tags:libraryTagInput('character-tags')};}
async function saveActiveCharacter(){
  clearTimeout(characterTimer);characterTimer=null;
  const snapshot=characterInput();
  characterSaving++;
  characterSaveQueue=characterSaveQueue.catch(()=>{}).then(async()=>{
    activeCharacter=await voiceLibrary.saveCharacter({...snapshot,id:activeCharacter?.id,revision:activeCharacter?.revision});
    characterSaveFailed=null;
    rememberCharacter();$('character-save-status').textContent=`Saved · ${activeCharacter.name} · sample and transcript stay with this character`;
    return activeCharacter;
  }).catch(error=>{characterSaveFailed=error;throw error;}).finally(()=>{characterSaving--;});
  return characterSaveQueue;
}
function scheduleCharacterSave(){
  if(!libraryReady||dialogueStudio.busy||libraryBusy)return;
  clearTimeout(characterTimer);
  if(!dialogueStudio.settings.character.trim()){$('character-save-status').textContent='Name this character to save its voice and sample.';return;}
  $('character-save-status').textContent='Saving character…';
  characterTimer=setTimeout(()=>{void saveActiveCharacter().catch(error=>{$('character-save-status').textContent='Character not saved';libraryFailure(error);});},600);
}
async function flushCharacterSave(discardFailed=false){
  if(discardFailed&&characterSaveFailed){
    if(!await confirmLibrary('Character changes were not saved','Discard the unsaved character changes and reload from the library? Your saved records will stay intact.','Discard and reload'))throw characterSaveFailed;
    clearTimeout(characterTimer);characterTimer=null;characterSaveQueue=Promise.resolve();characterSaveFailed=null;return;
  }
  if(characterTimer)await saveActiveCharacter();else await characterSaveQueue;
}
function clearSavedTakes(){savedTakesSerial++;for(const view of savedTakeViews.values()){view.audio?.pause();if(view.url)URL.revokeObjectURL(view.url);}savedTakeViews.clear();$('saved-takes').replaceChildren();$('saved-takes-count').textContent='0';}
function blankLine(){activeDialogue=null;lineDirty=false;loadedLineType='';for(const id of lineInputIds)$(id).value=id==='dialogue-line-status'?'draft':'';$('dialogue-line-type').value=libraryTypes.find(t=>t.id===$('library-type-filter').value)?.name||'';clearSavedTakes();renderDialogue();renderLibraryControls();}
function applyCharacter(row){
  activeCharacter=row;dialogueStudio.settings=dialogueSettings(row.settings);dialogueStudio.reference=row.reference;
  $('character-notes').value=row.notes||'';$('character-tags').value=row.tags.join(', ');$('character-save-status').textContent=`Loaded · ${row.name} · changes save automatically`;
  saveDialogueSettings();rememberCharacter();renderDialogue();
}
async function selectCharacter(id){
  await flushCharacterSave(true);if(!await canLeaveLine())return;
  const row=await voiceLibrary.getCharacter(id);if(!row)throw new Error('This character was deleted. Refresh the library.');
  applyCharacter(row);blankLine();$('library-character-filter').value=row.id;libraryPage=0;await refreshVoiceLibrary();
  libraryMessage(`Showing ${row.name}’s dialogue. Choose All characters to search the whole cast.`);
}
async function newCharacter(){
  await flushCharacterSave(true);if(!await canLeaveLine())return;
  activeCharacter=null;dialogueStudio.reference=null;dialogueStudio.settings=dialogueSettings({...dialogueStudio.settings,character:''});
  $('character-notes').value='';$('character-tags').value='';rememberCharacter();blankLine();
  $('character-save-status').textContent='Name the character, then add a voice sample. Changes save automatically.';$('dialogue-character').value='';$('dialogue-character').focus();
}
function dialogueInput(copy=false){
  return {id:copy?undefined:activeDialogue?.id,revision:copy?undefined:activeDialogue?.revision,characterId:activeCharacter?.id,
    title:$('dialogue-line-title').value,text:$('dialogue-text').value,
    ...(activeDialogue&&$('dialogue-line-type').value===loadedLineType?{typeId:activeDialogue.typeId}:{type:$('dialogue-line-type').value}),
    tags:libraryTagInput('dialogue-line-tags'),notes:$('dialogue-line-notes').value,status:$('dialogue-line-status').value,
    settings:{...dialogueStudio.settings},origin:activeDialogue?.origin||{kind:'manual'}};
}
async function saveActiveDialogue(copy=false){
  await saveActiveCharacter();activeDialogue=await voiceLibrary.saveDialogue(dialogueInput(copy));lineDirty=false;loadedLineType=$('dialogue-line-type').value;
  $('dialogue-line-title').value=activeDialogue.title;renderLibraryControls();await refreshVoiceLibrary();await refreshSavedTakes();return activeDialogue;
}
async function openSavedDialogue(id){
  await flushCharacterSave(true);if(!await canLeaveLine())return;
  const row=await voiceLibrary.getDialogue(id);if(!row)throw new Error('This dialogue was deleted. Refresh the library.');
  const character=await voiceLibrary.getCharacter(row.characterId);if(!character)throw new Error('The saved character is missing.');
  applyCharacter(character);activeDialogue=row;lineDirty=false;
  dialogueStudio.settings=dialogueSettings({...row.settings,character:character.name});saveDialogueSettings();
  $('dialogue-text').value=row.text;$('dialogue-line-title').value=row.title;loadedLineType=libraryTypes.find(t=>t.id===row.typeId)?.name||'';$('dialogue-line-type').value=loadedLineType;
  $('dialogue-line-tags').value=row.tags.join(', ');$('dialogue-line-notes').value=row.notes;$('dialogue-line-status').value=row.status;
  renderDialogue();renderLibraryControls();await refreshVoiceLibrary();await refreshSavedTakes();libraryMessage(`Opened ${character.name} · ${row.title}`);
}
async function saveSessionTake(take){
  if(take.savedId)return;
  const context=take.libraryContext||renderContext;
  if(!context)throw new Error('This take has no saved dialogue. Download its WAV and notes to keep it.');
  const row=await voiceLibrary.saveTake({...take,id:undefined,dialogueId:context.dialogueId,characterRevision:context.characterRevision,dialogueRevision:context.dialogueRevision});
  take.savedId=row.id;take.libraryContext=context;renderDialogue();await refreshSavedTakes();
}
async function adoptDialogueReference(take){
  const blob=new Blob([inspectDialogueWav(take.audioWav).bytes],{type:'audio/wav'});
  const ref=await normaliseDialogueReference(new File([blob],`${take.character||'Character'} reference.wav`));ref.text=take.text;dialogueStudio.reference=ref;
  dialogueStudio.settings=dialogueSettings({...take.settings,character:dialogueStudio.settings.character,model:take.model.startsWith('qwen-')?'qwen-clone':take.model});saveDialogueSettings();await saveActiveCharacter();dialogueStudio.message='Character reference saved. Record another line when ready.';
}
async function renderSavedDialogue(){
  return libraryAction(async()=>{
    // Validate the engine-specific input before creating a library line.
    try{dialogueRequest(dialogueStudio.settings,$('dialogue-text').value,dialogueStudio.reference);}
    catch(error){dialogueStudio.error=String(error?.message||error);dialogueStudio.message='Check the dialogue input.';renderDialogue();return;}
    const row=await saveActiveDialogue();renderContext={dialogueId:row.id,dialogueRevision:row.revision,characterRevision:activeCharacter.revision};
    try{await dialogueStudio.generate(row.text);}finally{renderContext=null;await refreshVoiceLibrary();await refreshSavedTakes();}
  });
}
dialogueStudio.onTake=async take=>{take.libraryContext={...renderContext};await saveSessionTake(take);};
function libraryOption(select,rows,all){const value=select.value;select.replaceChildren(new Option(all,''),...rows.map(row=>new Option(row.name,row.id)));if(rows.some(r=>r.id===value))select.value=value;}
async function refreshVoiceLibrary(){
  const ticket=++libraryRefreshSerial;
  const [characters,types,result]=await Promise.all([voiceLibrary.listCharacters(),voiceLibrary.listTypes(),voiceLibrary.listDialogues({characterId:$('library-character-filter').value||null,typeId:$('library-type-filter').value||null,query:$('library-search').value,offset:libraryPage*20,limit:20})]);
  if(ticket!==libraryRefreshSerial)return;
  libraryCharacters=characters;libraryTypes=types;libraryTotal=result.total;
  libraryOption($('library-character-filter'),characters,'All characters');libraryOption($('library-type-filter'),types,'All types');libraryOption($('library-manage-type'),types,'New type');
  $('dialogue-type-options').replaceChildren(...types.map(type=>new Option(type.name,type.name)));
  const search=$('library-character-search').value.toLocaleLowerCase();$('library-characters').replaceChildren();
  for(const row of characters.filter(c=>[c.name,c.notes,...c.tags].join(' ').toLocaleLowerCase().includes(search))){
    const button=document.createElement('button');button.className='quiet';button.dataset.characterId=row.id;button.title='Select '+row.name+' and restore their saved voice settings and reference.';button.setAttribute('aria-pressed',String(activeCharacter?.id===row.id));
    const name=document.createElement('strong');name.textContent=row.name;const meta=document.createElement('small');meta.textContent=`${DIALOGUE_MODELS.find(m=>m.id===row.settings.model)?.name||row.settings.model}${row.reference?' · reference saved':''}`;button.append(name,meta);button.addEventListener('click',()=>void libraryAction(()=>selectCharacter(row.id)));$('library-characters').append(button);
  }
  $('library-lines').replaceChildren();
  for(const row of result.items){
    const button=document.createElement('button');button.className='quiet';button.dataset.dialogueId=row.id;button.title='Open '+row.title+' with its saved text, notes and recordings.';button.setAttribute('aria-pressed',String(activeDialogue?.id===row.id));
    const title=document.createElement('strong');title.textContent=row.title;const meta=document.createElement('small');meta.textContent=`${row.character} · ${row.type||'Untyped'} · ${row.status} · ${row.takeCount} takes`;const preview=document.createElement('small');preview.textContent=row.text.slice(0,145);button.append(title,meta,preview);button.addEventListener('click',()=>void libraryAction(()=>openSavedDialogue(row.id)));$('library-lines').append(button);
  }
  $('library-count').textContent=`${result.total} ${result.total===1?'line':'lines'}${result.total?' · '+(result.offset+1)+'–'+Math.min(result.offset+20,result.total):''}`;
  renderLibraryControls();
}
async function refreshSavedTakes(){
  clearSavedTakes();const ticket=savedTakesSerial,id=activeDialogue?.id;if(!id)return;
  const rows=await voiceLibrary.listTakes(id);if(ticket!==savedTakesSerial)return;
  $('saved-takes-count').textContent=String(rows.length);
  if(!rows.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='No recordings yet. Render this line to save its first take.';$('saved-takes').append(empty);}
  for(const row of rows){
    const node=document.createElement('article');node.className='saved-recording';node.dataset.takeId=row.id;
    const label=document.createElement('strong');label.textContent=`${DIALOGUE_MODELS.find(m=>m.id===row.model)?.name||row.model} · ${row.durationSeconds.toFixed(1)} s`;
    const meta=document.createElement('p');meta.className='hint';meta.textContent=`Seed ${row.seed} · ${new Date(row.createdAt).toLocaleString()}`;
    const actions=document.createElement('div');actions.className='dialogue-actions';const listen=document.createElement('button');listen.className='secondary';listen.textContent='Audition / download';listen.title='Show playback and WAV download for this saved take.';
    const remove=document.createElement('button');remove.className='text-button';remove.textContent='Delete take';remove.title='Review deletion of this saved recording; the dialogue line remains.';
    const view={node,audio:null,url:null};savedTakeViews.set(row.id,view);
    listen.addEventListener('click',()=>void libraryAction(async()=>{
      if(view.url)return;
      const take=await voiceLibrary.getTake(row.id);if(!take)throw new Error('This take was deleted. Refresh the library.');
      const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';const url=URL.createObjectURL(new Blob([inspectDialogueWav(take.audioWav).bytes],{type:'audio/wav'}));audio.src=url;view.audio=audio;view.url=url;
      audio.addEventListener('play',()=>{for(const v of [...savedTakeViews.values(),...dialogueTakeViews.values()])if(v.audio&&v.audio!==audio)v.audio.pause();$('dialogue-reference-audio').pause();});
      const link=document.createElement('a');link.className='dialogue-download';link.href=url;link.download=`${dialogueFilename(take.character)}-${row.id}.wav`;link.textContent='Download WAV';link.title='Download this saved voice recording as a WAV file.';actions.prepend(link);node.insertBefore(audio,actions);
      if(take.durationSeconds>=6&&take.durationSeconds<=30&&take.text.length<=1200){const use=document.createElement('button');use.textContent='Use as reference';use.title='Use this take and its recorded words as the character’s voice reference.';use.addEventListener('click',()=>void libraryAction(()=>adoptDialogueReference(take)));actions.append(use);}
      const words=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');summary.textContent='Recorded text & notes';text.className='dialogue-take-text';text.textContent=take.text+(take.notes?'\n\n'+take.notes:'');words.append(summary,text);node.append(words);listen.remove();
    }));
    remove.addEventListener('click',()=>void libraryAction(async()=>{if(await confirmLibrary('Delete this recording?','The saved WAV will be deleted. The dialogue text and other takes stay in the library.')){await voiceLibrary.deleteTake(row.id);for(const take of dialogueStudio.takes)if(take.savedId===row.id)delete take.savedId;await refreshSavedTakes();}}));
    actions.append(listen,projectStageButton(()=>projectStageTake(row)),remove);node.append(label,meta,actions);$('saved-takes').append(node);
  }
  renderLibraryControls();
}
async function importCharacterProfile(profile){
  await flushCharacterSave();if(!await canLeaveLine())return;
  let name=profile.settings.character||'Imported character',suffix=1;const base=name,names=new Set((await voiceLibrary.listCharacters()).map(c=>c.name.toLocaleLowerCase()));
  while(names.has(name.toLocaleLowerCase()))name=base.slice(0,58)+` (imported ${suffix++})`;
  const row=await voiceLibrary.saveCharacter({name,settings:profile.settings,reference:profile.reference});applyCharacter(row);blankLine();await refreshVoiceLibrary();libraryMessage('Character imported and saved with its audio and transcript.');
}
for(const el of document.querySelectorAll('[data-dialogue-setting]'))el.addEventListener(el.type==='range'?'input':'change',()=>scheduleCharacterSave());
$('dialogue-character').addEventListener('input',()=>{dialogueStudio.settings.character=$('dialogue-character').value;scheduleCharacterSave();});
for(const id of ['dialogue-transcript','character-notes','character-tags'])$(id).addEventListener('input',scheduleCharacterSave);
for(const id of lineInputIds)$(id).addEventListener('input',()=>{lineDirty=true;renderLibraryControls();});
$('dialogue-line-status').addEventListener('change',()=>{lineDirty=true;renderLibraryControls();});
$('dialogue-example').addEventListener('click',()=>{lineDirty=true;renderLibraryControls();});
$('dialogue-save-character').addEventListener('click',()=>void libraryAction(()=>saveActiveCharacter()));
$('library-new-character').addEventListener('click',()=>void libraryAction(newCharacter));
$('library-new-dialogue').addEventListener('click',()=>void libraryAction(async()=>{await flushCharacterSave();if(await canLeaveLine()){blankLine();$('dialogue-text').focus();}}));
$('dialogue-duplicate-character').addEventListener('click',()=>void libraryAction(async()=>{await flushCharacterSave();if(!activeCharacter||!await canLeaveLine())return;applyCharacter(await voiceLibrary.duplicateCharacter(activeCharacter.id));blankLine();await refreshVoiceLibrary();}));
$('dialogue-delete-character').addEventListener('click',()=>void libraryAction(async()=>{
  await flushCharacterSave();if(!activeCharacter)return;const lines=await voiceLibrary.listDialogues({characterId:activeCharacter.id});
  if(await confirmLibrary(`Delete ${activeCharacter.name}?`,`This deletes the character, reference sample, ${lines.total} saved dialogue lines and all their recordings. Export a backup first if you want to keep them.`)){
    await voiceLibrary.deleteCharacter(activeCharacter.id,activeCharacter.revision);lineDirty=false;activeCharacter=null;dialogueStudio.reference=null;dialogueStudio.settings.character='';$('character-notes').value='';$('character-tags').value='';rememberCharacter();blankLine();$('character-save-status').textContent='Character deleted.';await refreshVoiceLibrary();
  }
}));
$('dialogue-save-line').addEventListener('click',()=>void libraryAction(()=>saveActiveDialogue()));
$('dialogue-copy-line').addEventListener('click',()=>void libraryAction(()=>saveActiveDialogue(true)));
$('dialogue-delete-line').addEventListener('click',()=>void libraryAction(async()=>{if(activeDialogue&&await confirmLibrary('Delete this dialogue?','This deletes the saved line and all its recordings. The character and reference sample stay saved.')){await voiceLibrary.deleteDialogue(activeDialogue.id,activeDialogue.revision);blankLine();await refreshVoiceLibrary();}}));
for(const id of ['library-search','library-character-search'])$(id).addEventListener('input',()=>{libraryPage=0;void refreshVoiceLibrary().catch(libraryFailure);});
for(const id of ['library-character-filter','library-type-filter'])$(id).addEventListener('change',()=>{libraryPage=0;void refreshVoiceLibrary().catch(libraryFailure);});
$('library-previous').addEventListener('click',()=>{libraryPage=Math.max(0,libraryPage-1);void refreshVoiceLibrary().catch(libraryFailure);});
$('library-next').addEventListener('click',()=>{libraryPage++;void refreshVoiceLibrary().catch(libraryFailure);});
$('library-refresh').addEventListener('click',()=>void libraryAction(async()=>{await refreshVoiceLibrary();await refreshSavedTakes();libraryMessage('Library refreshed. Reopen a record to load changes from another window.');}));
$('library-manage-type').addEventListener('change',()=>{$('library-type-name').value=libraryTypes.find(t=>t.id===$('library-manage-type').value)?.name||'';});
$('library-save-type').addEventListener('click',()=>void libraryAction(async()=>{const old=libraryTypes.find(t=>t.id===$('library-manage-type').value);const row=await voiceLibrary.saveType({id:old?.id,revision:old?.revision,name:$('library-type-name').value});if(activeDialogue?.typeId===row.id&&!lineDirty)$('dialogue-line-type').value=row.name;await refreshVoiceLibrary();$('library-manage-type').value=row.id;libraryMessage('Dialogue type saved across the cast.');}));
$('library-delete-type').addEventListener('click',()=>void libraryAction(async()=>{const type=libraryTypes.find(t=>t.id===$('library-manage-type').value);if(!type)return;await voiceLibrary.deleteType(type.id,type.revision);$('library-type-name').value='';await refreshVoiceLibrary();}));
$('library-export').addEventListener('click',()=>void libraryAction(async()=>{await flushCharacterSave();const data=await voiceLibrary.exportLibrary();downloadDialogue(new Blob([JSON.stringify(data)],{type:'application/json'}),`voice-lab-library-${new Date().toISOString().slice(0,10)}.json`);libraryMessage('Backup exported with saved characters, dialogue, reference audio and recordings.');}));
$('library-import').addEventListener('click',()=>$('library-file').click());
$('library-file').addEventListener('change',()=>{const file=$('library-file').files[0];$('library-file').value='';if(!file)return;void libraryAction(async()=>{
  if(file.size>500*1024*1024)throw new Error('Import files must be under 500 MB.');const raw=await file.text(),data=JSON.parse(raw);
  if(data.protocol==='capp.voice-lab.character.v1'){await importCharacterProfile(readDialogueProfile(raw));return;}
  if(data.protocol==='capp.voice-lab.dialogue-batch.v1'){await voiceLibrary.importDialogues(data);libraryMessage('Dialogue batch imported.');}
  else{const result=await voiceLibrary.importLibrary(data);libraryMessage(`Imported ${result.characters} characters, ${result.dialogues} lines and ${result.takes} recordings.`);}
  await refreshVoiceLibrary();
});});
window.addEventListener('voice-lab:library-change',()=>{clearTimeout(libraryRefreshTimer);libraryRefreshTimer=setTimeout(()=>void refreshVoiceLibrary().catch(libraryFailure),60);});
window.addEventListener('beforeunload',event=>{if(lineDirty||characterTimer||characterSaving||characterSaveFailed||libraryBusy){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{clearTimeout(characterTimer);clearTimeout(libraryRefreshTimer);clearSavedTakes();voiceLibrary.close();},{once:true});
// Versioned, same-origin app data API. No server, shell, model preparation or
// ambient agent permissions are added. Promise rejection retains a stable code.
window.voiceLabLibrary=Object.freeze({protocol:'capp.voice-lab.library-api.v1',
  characters:Object.freeze({list:o=>voiceLibrary.listCharacters(o),get:id=>voiceLibrary.getCharacter(id),save:v=>voiceLibrary.saveCharacter(v),duplicate:id=>voiceLibrary.duplicateCharacter(id),remove:(id,revision)=>voiceLibrary.deleteCharacter(id,revision)}),
  types:Object.freeze({list:()=>voiceLibrary.listTypes(),save:v=>voiceLibrary.saveType(v),remove:(id,revision)=>voiceLibrary.deleteType(id,revision)}),
  dialogues:Object.freeze({list:o=>voiceLibrary.listDialogues(o),get:id=>voiceLibrary.getDialogue(id),save:v=>voiceLibrary.saveDialogue(v),importBatch:v=>voiceLibrary.importDialogues(v),remove:(id,revision)=>voiceLibrary.deleteDialogue(id,revision)}),
  takes:Object.freeze({list:id=>voiceLibrary.listTakes(id),get:id=>voiceLibrary.getTake(id),save:v=>voiceLibrary.saveTake(v),remove:id=>voiceLibrary.deleteTake(id)}),
  export:()=>voiceLibrary.exportLibrary(),import:v=>voiceLibrary.importLibrary(v),ready:voiceLibrary.open().then(()=>true)});
void (async()=>{
  try{
    await window.voiceLabLibrary.ready;libraryReady=true;
    let id;try{id=localStorage.getItem(libraryActiveKey);}catch{}
    if(id){const row=await voiceLibrary.getCharacter(id);if(row)applyCharacter(row);}
    await refreshVoiceLibrary();libraryMessage(audioDisk.ready?'Audio library connected to disk.':'Browser recovery copies loaded. Connect Asset storage to migrate and save.');
  }catch(error){libraryFailure(error);libraryMessage('The saved library could not open.');}
  renderLibraryControls();
})();
