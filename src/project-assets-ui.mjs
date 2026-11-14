import {ProjectWorkspace} from './project-workspace.mjs';

// Existing native ProjectAudioSession remains the owner of its approved audio
// folders. This explicit connector adds model/movement/event assignments only.
const sharedProjectWorkspace=new ProjectWorkspace({lab:'voice',
  listLocal:async()=>{if(!amBusy&&!amLoading)await amRefresh();return amRows.filter(r=>r.recorded).map(r=>({id:r.key,title:r.title+' · '+r.collection}));},
  uploadLocal:async key=>{const item=amRows.find(r=>r.key===key);if(!item?.recorded)throw Error('Refresh and choose an existing recording.');if(amOtherBusy()||amBusy)throw Error('Wait for the current audio operation.');return {blob:await amBlob(item),kind:'audio',metadata:{title:item.title,kind:item.kind,category:item.category,subject:item.subject,tags:item.tags,notes:item.notes,source:{...item.row,audioWav:undefined,reference:undefined}}};},
  openAudio:async({blob,metadata,revision})=>{await audioStorageStartup;if(amOtherBusy()||amBusy)throw Error('Wait for the current audio operation.');const bytes=await decodeAudioImport(new File([blob],'project.wav',{type:'audio/wav'}));const saved=await audioAssets.saveMedia({metadata:{title:metadata.title||'Project recording',kind:metadata.kind==='music'?'music':'sfx',assetType:metadata.kind==='music'?'music':'sfx',category:metadata.category||'Project audio',subject:metadata.subject||'',notes:'Copied project revision '+revision.id},bytes,notify:false});await amRefresh();await openAudioTimeline(saved.id);}
});
$('shared-project-open').addEventListener('click',()=>void sharedProjectWorkspace.open());
window.addEventListener('pagehide',()=>sharedProjectWorkspace.dispose());
