import {ProjectAudioSession,projectSoundMetadata,projectDialogueMetadata} from './project-audio.mjs';
const projectAudio=new ProjectAudioSession(bridge);
const nativeProjectStage=projectAudio.stage.bind(projectAudio);
projectAudio.stage=async(metadata,blob,onProgress)=>{if(!projectAudio.project)throw Error('Open an audio project first.');if(!projectAudio.workspace)await audioDisk.archiveProject(projectAudio.project,metadata,blob);window.dispatchEvent(new Event('voice-lab:library-change'));return nativeProjectStage(metadata,blob,onProgress);};
const projectPendingKey='capp.voice-lab.project-pending.v1';
let projectPending=[];try{const rows=JSON.parse(localStorage.getItem(projectPendingKey)||'[]');if(Array.isArray(rows))projectPending=rows.filter(r=>r&&typeof r.root==='string'&&['sound','dialogue'].includes(r.kind)&&typeof r.id==='string').slice(0,1000);}catch{}
let projectBusy=false,projectQueue=Promise.resolve();
function projectChanged(){window.dispatchEvent(new Event('voice-lab:project-change'));}
function projectMarkPending(root,kind,id,pending){projectPending=projectPending.filter(r=>!(r.root===root&&r.kind===kind&&r.id===id));if(pending)projectPending.push({root,kind,id});try{localStorage.setItem(projectPendingKey,JSON.stringify(projectPending));}catch{projectError('The recording is saved, but its pending-copy reminder could not be saved.');}}
function projectWorking(){return projectBusy||lab.busy||dialogueStudio.busy||audioWorkshop.busy||audioLibraryBusy||libraryBusy||document.body.dataset.managerBusy==='true';}
function renderProjectAudio(){
  const p=projectAudio.project,busy=projectWorking(),pending=projectPending.filter(r=>r.root===p?.root).length;
  $('project-retry').hidden=!pending;$('project-retry').disabled=busy||!p;$('project-retry').textContent=`Retry pending drafts (${pending})`;
  $('project-name').textContent=p?p.name:'Personal library';$('project-connection-note').textContent=p?'New recordings save to external drafts.':'Open a project for Drafts & Production.';
  $('project-paths').hidden=!p;$('project-source-path').textContent=p?.root||'';$('project-draft-path').textContent=p?.draftsRoot||'';$('project-approved-path').textContent=p?.audioRoot||'';
  $('project-open').disabled=busy;$('project-close').disabled=busy||!p;
  for(const b of document.querySelectorAll('[data-project-stage]')){b.disabled=busy||!p;b.title=p?'Copy this recording into '+p.name+' drafts.':'Open a project before sending this recording to drafts.';}
}
function projectMessage(message){$('project-status').hidden=!message;$('project-status').textContent=message;}
function projectError(error){$('project-error').hidden=false;$('project-error').textContent=String(error?.message||error);}
function projectTask(fn,{changed=true}={}){
  const project=projectAudio.project;
  const task=projectQueue.then(async()=>{projectBusy=true;renderProjectAudio();try{if(projectAudio.project!==project)throw Error('The project changed. Retry in the intended project.');return await fn();}finally{projectBusy=false;renderProjectAudio();if(changed)projectChanged();}});
  projectQueue=task.catch(()=>{});return task;
}
async function projectAction(fn){$('project-error').hidden=true;try{return await projectTask(fn);}catch(e){projectError(e);return false;}}
async function projectStageSound(row){
  if(!projectAudio.project||row.state!=='ready')return;
  const p=projectAudio.project;projectMarkPending(p.root,'sound',row.id,true);
  await projectAction(async()=>{projectMessage('Saving project draft · '+row.title);await projectAudio.stage(projectSoundMetadata(row),await audioAssets.blob(row.id));projectMarkPending(p.root,'sound',row.id,false);projectMessage('Draft saved · '+row.title);});
}
async function projectStageTake(row){
  if(!projectAudio.project)return;const p=projectAudio.project;projectMarkPending(p.root,'dialogue',row.id,true);
  await projectAction(async()=>{const take=await voiceLibrary.getTake(row.id);if(!take)throw Error('Saved take is missing.');const line=await voiceLibrary.getDialogue(take.dialogueId),type=(await voiceLibrary.listTypes()).find(t=>t.id===line?.typeId)?.name||'Dialogue';await projectAudio.stage(projectDialogueMetadata(take,line||{},type),new Blob([inspectDialogueWav(take.audioWav).bytes],{type:'audio/wav'}));projectMarkPending(p.root,'dialogue',row.id,false);projectMessage('Dialogue saved to project drafts.');});
}
function projectStageButton(action){const b=document.createElement('button');b.type='button';b.dataset.projectStage='true';b.textContent='Send to project drafts';b.title='Copy this saved recording into the open project’s external drafts.';b.addEventListener('click',()=>{if(!projectWorking()&&projectAudio.project)void action();});return b;}
audioAssets.onRecorded=projectStageSound;voiceLibrary.onTakeSaved=projectStageTake;
$('project-open').addEventListener('click',()=>{if(projectWorking())return;void projectAction(async()=>{const r=await projectAudio.open();if(!r.cancelled)projectMessage('Project open. Saved recordings also go to drafts; send selected takes to Production when ready.');});});
$('project-close').addEventListener('click',()=>{if(projectWorking())return;void projectAction(async()=>{await projectAudio.close();projectMessage('Project closed. All recordings remain saved.');});});
$('project-retry').addEventListener('click',()=>{if(projectWorking())return;void(async()=>{const root=projectAudio.project?.root;for(const entry of [...projectPending].filter(r=>r.root===root)){if(projectAudio.project?.root!==root)break;if(entry.kind==='sound'){const row=await audioAssets.get(entry.id);if(row)await projectStageSound(row);else projectError('Pending recording missing: '+entry.id);}else await projectStageTake(entry);}})().catch(projectError);});
const projectObserver=new MutationObserver(renderProjectAudio);projectObserver.observe(document.body,{attributes:true,attributeFilter:['data-audio-busy','data-dialogue-busy','data-library-busy','data-lab-busy','data-manager-busy']});
window.addEventListener('beforeunload',e=>{if(projectBusy){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{projectObserver.disconnect();projectAudio.dispose();},{once:true});
window.voiceLabProjectAudio=Object.freeze({protocol:'capp.voice-lab.project-audio.v1',get project(){return projectAudio.project;},stageSound:id=>audioAssets.get(id).then(row=>{if(!row)throw Error('Audio asset not found.');return projectStageSound(row);}),stageTake:id=>projectStageTake({id}),refresh:async()=>projectChanged()});
renderProjectAudio();
