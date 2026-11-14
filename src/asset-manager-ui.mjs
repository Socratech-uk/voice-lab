import {ASSET_MANAGER_PROTOCOL,AssetOrganizer,managerKey,managerMetadata,managerFolder,managerSameFolder,managerConflict,managerAvailableName,managerFilter,managerCollect,managerProjectItem,managerLocalItems,managerWaveform,managerTypeNames,managerRequest} from './asset-manager.mjs';

const amOrganizer=audioDisk.register('organizer',new AssetOrganizer(),'transaction',['items','folders']),amSelected=new Set(),amPeaks=new Map();
let amRows=[],amOrganization={items:[],folders:[]},amCollection='library',amFolder=null,amPage=0,amView='grid',amBusy=false,amLoading=false,amFresh=false,amPending=false,amTimer=null,amInspectKey='',amPreviewUrl=null,amPreviewAudio=null,amPreviewTicket=0,amRoot=null,amAnchor='',amDisposed=false,amRenderSerial=0,amMenuReturn=null,amDragKeys=[];
let amRefreshWaiters=[];
const amPageSize=24,amMime='application/x-voicelab-assets';
const amEl=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const amButton=(text,title,fn,className='')=>{const b=amEl('button',className,text);b.type='button';b.title=title;b.addEventListener('click',fn);return b;};
function amNotice(text){$('asset-status').textContent=text;}
function amError(error){$('asset-error').hidden=false;$('asset-error').textContent=String(error?.message||error);}
function amScope(){return amCollection==='library'?'library':JSON.stringify([projectAudio.project?.root,amCollection]);}
function amCollectionRows(){return amRows.filter(r=>r.collection===amCollection);}
function amFiltered(){return managerFilter(amCollectionRows(),{query:$('asset-search').value,type:$('asset-type').value,tag:$('asset-tag').value,state:$('asset-state').value,sort:$('asset-sort').value,folder:amFolder});}
function amOtherBusy(){return lab.busy||dialogueStudio.busy||audioWorkshop.busy||audioLibraryBusy||libraryBusy||projectBusy;}
function amQueueRefresh(){amPending=true;clearTimeout(amTimer);amTimer=setTimeout(()=>{if(!amDisposed&&!amBusy&&!amLoading&&!projectBusy)void amRefresh();},180);}
async function amRefresh(){
  if(amDisposed)return;if(amBusy||amLoading||projectBusy){amPending=true;return;}
  amLoading=true;amPending=false;amFresh=false;amControls();const root=projectAudio.project?.root||null;
    if(root!==amRoot){amCollection=root?'drafts':'library';amRoot=root;amFolder=null;amSelected.clear();amInspectKey='';amClearPreview();}
  try{
    const [sounds,voice,organization]=await Promise.all([managerCollect(o=>audioAssets.list(o)),voiceLibrary.catalogue(),amOrganizer.read()]);
    const overrides=Object.fromEntries(organization.items.map(r=>[r.key,r.metadata]));
    let rows=managerLocalItems(sounds,voice.characters,voice.dialogues,voice.takes,overrides);
    if(audioDisk.ready){const archive=await audioDisk.client.request('assets');for(const entry of archive.assets.filter(r=>r.projectArchive)){const m=entry.metadata;rows.push({key:entry.id,id:entry.id.slice(8),origin:'archive',collection:'library',type:m.kind,kind:m.kind,title:m.title,category:m.category,subject:m.subject,tags:m.tags||[],notes:m.notes||'',text:m.source?.metadata?.source?.text||'',recorded:true,duration:m.source?.nativeSource?.wav?.durationSeconds||0,updatedAt:m.source?.nativeSource?.createdAt||'',row:entry});}}
    if(projectAudio.project){const project=projectAudio.project;const more=await projectTask(async()=>{
      const drafts=await managerCollect(o=>projectAudio.list({...o,collection:'drafts'}),100);
      const production=await managerCollect(o=>projectAudio.list({...o,collection:'approved'}),100);
      return [...drafts.map(r=>managerProjectItem(r,'drafts')),...production.map(r=>managerProjectItem(r,'approved'))];
    },{changed:false});if(projectAudio.project!==project)throw Error('Project changed. Refresh the asset browser.');rows=rows.concat(more);}
    amRows=rows;amOrganization=organization;amFresh=true;
    const keys=new Set(rows.map(r=>r.key));for(const key of amSelected)if(!keys.has(key))amSelected.delete(key);
    amRender();
  }catch(e){amError(e);amNotice('Catalogue could not fully load. Refresh before making changes.');}
  finally{amLoading=false;amControls();const waiters=amRefreshWaiters;amRefreshWaiters=[];for(const resolve of waiters)resolve();if(amPending)amQueueRefresh();}
}
async function amAction(fn,{refresh=true}={}){
  if(amLoading)await new Promise(resolve=>amRefreshWaiters.push(resolve));
  if(!amFresh){amError('Refresh the complete catalogue before performing this action.');return;}
  if(amBusy||amLoading||amOtherBusy()){amNotice('Wait for the current operation to finish.');return;}
  amBusy=true;document.body.dataset.managerBusy='true';$('asset-error').hidden=true;amCloseMenu();amControls();
  try{return await fn();}catch(e){amError(e);}finally{amBusy=false;document.body.dataset.managerBusy='false';$('asset-progress').hidden=true;amControls();if(refresh||amPending)await amRefresh();}
}
function amControls(){
  const busy=amBusy||amLoading||amOtherBusy();$('asset-workspace').setAttribute('aria-busy',String(amBusy||amLoading));
  for(const id of ['asset-new','asset-import','asset-new-folder','asset-bulk-folder','asset-bulk-promote','asset-bulk-render'])$(id).disabled=busy||!amFresh;
  $('asset-bulk-render').hidden=![...amSelected].some(k=>amRows.some(r=>r.key===k&&r.origin==='sound'&&!r.recorded));
  const generating=audioWorkshop.busy||dialogueStudio.busy||lab.busy;$('workspace-activity').hidden=!generating;$('workspace-activity-text').textContent=audioWorkshop.busy?audioWorkshop.message:dialogueStudio.busy?dialogueStudio.message:lab.message;
  $('asset-bulk-promote').hidden=!projectAudio.project||amCollection==='approved';
  for(const el of document.querySelectorAll('[data-am-write]'))el.disabled=busy||!amFresh;
  $('create-tab').disabled=busy;$('tools-tab').disabled=busy;
  $('project-open').disabled=busy;$('project-close').disabled=busy||!projectAudio.project;
}
function amChangeCollection(collection,folder=null){amCollection=collection;amFolder=folder;amPage=0;amSelected.clear();amAnchor='';amInspectKey='';amClearPreview();amRender();}
function amReset(){for(const id of ['asset-search','asset-type','asset-tag','asset-state'])$(id).value='';amFolder=null;amPage=0;amSelected.clear();amRender();}
function amDropTarget(node,target){
  node.addEventListener('dragover',e=>{if([...e.dataTransfer.types].some(t=>t==='Files'||t===amMime)){e.preventDefault();e.dataTransfer.dropEffect=target.collection==='approved'?'copy':'copy';node.classList.add('drop-target');}});
  node.addEventListener('dragleave',()=>node.classList.remove('drop-target'));
  node.addEventListener('drop',e=>{node.classList.remove('drop-target');e.preventDefault();e.stopPropagation();const files=[...e.dataTransfer.files];if(files.length){if(target.collection==='approved'){amError('Import into Drafts, then review and send to production.');return;}void amImport(files,target);return;}
    let keys;try{keys=JSON.parse(e.dataTransfer.getData(amMime));}catch{return;}
    // Only an active in-app drag can request mutations; arbitrary dropped JSON cannot.
    if(!Array.isArray(keys)||JSON.stringify(keys)!==JSON.stringify(amDragKeys))return;
    const rows=keys.map(k=>amRows.find(r=>r.key===k)).filter(Boolean);amDragKeys=[];
    if(target.collection==='approved')void amAction(()=>amPromote(rows,target.folder));
    else if(target.collection==='drafts'&&rows.some(r=>r.collection!=='drafts'))void amAction(()=>amCopyDrafts(rows,target.folder));
    else if(target.collection==='library'&&rows.some(r=>r.collection!=='library'))void amAction(()=>amCopyLibrary(rows,target.folder));
    else if(target.folder)void amAction(()=>amMove(rows,target.folder));
  });
}
function amRenderFolders(){
  $('asset-collections').replaceChildren();
  const cols=projectAudio.project?[['drafts','Drafts','Outside project'],['approved','Production','In '+projectAudio.project.name],['library','Personal library','On this device']]:[['library','Personal library','On this device']];
  for(const [key,name,detail]of cols){const b=amButton('',`Browse ${name}. Drag recordings here to copy them.`,()=>amChangeCollection(key),'collection-button');b.setAttribute('aria-pressed',String(amCollection===key));b.dataset.collection=key;const icon=amEl('span','collection-icon',key==='approved'?'✓':key==='drafts'?'▱':'◈');const label=amEl('span','');label.append(amEl('strong','',name),amEl('small','',detail));b.append(icon,label,amEl('span','folder-count',String(amRows.filter(r=>r.collection===key).length)));amDropTarget(b,{collection:key});$('asset-collections').append(b);}
  $('asset-folders').replaceChildren();const rows=amCollectionRows();const folders=new Map(),addFolder=(category,subject='')=>{const key=managerFolder(managerKey(category),managerKey(subject));if(!folders.has(key))folders.set(key,[category,subject]);};
  for(const row of rows){if(row.category){addFolder(row.category);if(row.subject)addFolder(row.category,row.subject);}}
  for(const f of amOrganization.folders.filter(f=>f.scope===amScope())){addFolder(f.category);addFolder(f.category,f.subject);}
  const all=amButton('All assets', 'Search all folders in this collection.',()=>{amFolder=null;amPage=0;amSelected.clear();amRender();},'folder-button');all.setAttribute('aria-pressed',String(!amFolder));$('asset-folders').append(all);
  const unc=amButton('Unfiled', 'Show assets without a category.',()=>{amFolder=['',''];amPage=0;amSelected.clear();amRender();},'folder-button');unc.setAttribute('aria-pressed',String(amFolder?.[0]===''));amDropTarget(unc,{collection:amCollection,folder:['','']});$('asset-folders').append(unc);
  for(const folder of [...folders.values()].sort((a,b)=>(a[0]+'/'+a[1]).localeCompare(b[0]+'/'+b[1],undefined,{numeric:true}))){
    const count=rows.filter(r=>managerKey(r.category)===managerKey(folder[0])&&(!folder[1]||managerKey(r.subject)===managerKey(folder[1]))).length;
    const b=amButton('',`Open ${folder.filter(Boolean).join(' / ')}. Drag assets here to organize.`,()=>{amFolder=folder;amPage=0;amSelected.clear();amRender();},'folder-button'+(folder[1]?' folder-child':''));b.append(amEl('span','',folder[1]?'└ '+folder[1]:'▱ '+folder[0]),amEl('span','folder-count',String(count)));b.setAttribute('aria-pressed',String(amFolder&&managerFolder(...amFolder)===managerFolder(...folder)));b.dataset.folder=managerFolder(...folder);amDropTarget(b,{collection:amCollection,folder});
    b.addEventListener('contextmenu',e=>{e.preventDefault();amShowMenu(e.clientX,e.clientY,[{label:'Open folder',run:()=>b.click()},{label:'New subfolder',disabled:!!folder[1],run:()=>void amAction(()=>amNewFolder(folder[0]))},{label:'Remove empty folder',disabled:count>0,run:()=>void amAction(async()=>{for(const f of amOrganization.folders.filter(f=>f.scope===amScope()&&managerKey(f.category)===managerKey(folder[0])&&(!folder[1]||managerKey(f.subject)===managerKey(folder[1]))))await amOrganizer.removeFolder(f.key);amFolder=null;amNotice('Empty folder removed.');})}],b);});$('asset-folders').append(b);
  }
}
function amDuration(seconds){return seconds?`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`:'—';}
function amWaveNode(){const node=amEl('div','asset-wave');node.append(amEl('span','wave-placeholder','⌁'));return node;}
function amDrawWave(node,peaks){if(!peaks)return;const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 256 64');svg.setAttribute('aria-label','Waveform sampled from this recording');svg.setAttribute('role','img');const p=document.createElementNS(ns,'path');p.setAttribute('d',peaks.map((v,i)=>`M${(i+.5)*256/peaks.length} ${32-Math.max(.6,v*29)}v${Math.max(1.2,v*58)}`).join(' '));p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','2');p.setAttribute('stroke-linecap','round');svg.append(p);node.replaceChildren(svg);}
async function amLocalBlob(item){
  if(item.origin==='sound')return audioAssets.blob(item.id);
  if(item.origin==='archive')return audioDisk.client.decode(item.row.blob);
  const name=item.origin==='reference'?'reference:':'take:';
  const record=await voiceLibrary.transaction(['audio'],'readonly',s=>managerRequest(s('audio').get(name+item.id)));
  if(!record?.blob)throw Error('Saved recording missing. Restore a backup.');return record.blob;
}
async function amBlob(item){return item.origin==='project'?projectTask(()=>projectAudio.read(item.row,item.collection),{changed:false}):amLocalBlob(item);}
function amCardWave(node,item,serial){const key=item.key+':'+item.updatedAt;if(amPeaks.has(key)){amDrawWave(node,amPeaks.get(key));return;}if(item.origin==='project')return;
  void amLocalBlob(item).then(managerWaveform).then(peaks=>{if(!peaks)return;if(amPeaks.size>=120)amPeaks.delete(amPeaks.keys().next().value);amPeaks.set(key,peaks);if(serial===amRenderSerial)amDrawWave(node,peaks);}).catch(()=>{});
}
function amSelect(item,event={}){
  const visible=amFiltered();if(event.shiftKey&&amAnchor){const a=visible.findIndex(r=>r.key===amAnchor),b=visible.findIndex(r=>r.key===item.key);if(a>=0)for(const r of visible.slice(Math.min(a,b),Math.max(a,b)+1))amSelected.add(r.key);else amSelected.add(item.key);}
  else if(event.ctrlKey||event.metaKey){if(amSelected.has(item.key))amSelected.delete(item.key);else amSelected.add(item.key);amAnchor=item.key;}
  else{amSelected.clear();amSelected.add(item.key);amAnchor=item.key;}
  amInspectKey=item.key;amRenderSelection();amInspect(item);
}
function amRenderSelection(){
  for(const node of $('asset-items').children){const yes=amSelected.has(node.dataset.key);node.classList.toggle('selected',yes);node.querySelector('input[type=checkbox]').checked=yes;}
  $('asset-selection-bar').hidden=!amSelected.size;$('asset-selection-count').textContent=amSelected.size+' selected';amControls();
}
function amRender(){
  const rows=amFiltered(),total=amCollectionRows().length;amPage=Math.max(0,Math.min(amPage,Math.max(0,Math.ceil(rows.length/amPageSize)-1)));
  const serial=++amRenderSerial;amRenderFolders();$('asset-total').textContent=String(total);$('nav-asset-count').textContent=String(amRows.filter(r=>r.collection==='library').length);
  const label=amCollection==='drafts'?'Drafts':amCollection==='approved'?'Production':'Personal library';
  $('asset-subtitle').textContent=amCollection==='approved'?'Approved project recordings. Edits become new drafts.':amCollection==='drafts'?'External project drafts. Listen, refine, then send to production.':'Sound, music, dialogue and voice references in one place.';
  $('asset-location').textContent=[label,...(amFolder?amFolder.filter(Boolean):['All assets'])].join(' / ');$('asset-result-count').textContent=rows.length===total?`${total} assets`:`${rows.length} of ${total} assets`;
  const tags=[...new Set(amCollectionRows().flatMap(r=>r.tags||[]))].sort();$('asset-tag-options').replaceChildren(...tags.map(t=>{const o=amEl('option');o.value=t;return o;}));
  $('asset-items').replaceChildren();$('asset-items').classList.toggle('list-view',amView==='list');
  for(const item of rows.slice(amPage*amPageSize,(amPage+1)*amPageSize)){
    const card=amEl('article','asset-card');card.dataset.key=item.key;card.dataset.type=item.type;card.setAttribute('role','listitem');card.tabIndex=0;card.draggable=true;card.setAttribute('aria-label',`${item.title}, ${managerTypeNames[item.type]||item.type}, ${item.recorded?amDuration(item.duration):'recipe'}`);
    const top=amEl('div','asset-card-top'),check=amEl('input');check.type='checkbox';check.title='Select '+item.title;check.setAttribute('aria-label','Select '+item.title);check.addEventListener('click',e=>{e.stopPropagation();amSelect(item,{ctrlKey:true});});
    const type=amEl('span','asset-kind',managerTypeNames[item.type]||item.type),more=amButton('•••','Actions for '+item.title,e=>{e.stopPropagation();if(!amSelected.has(item.key))amSelect(item);const rect=more.getBoundingClientRect();amShowMenu(rect.left,rect.bottom,amItemMenu(item),more);},'card-more');more.setAttribute('aria-haspopup','menu');top.append(check,type,more);
    const wave=amWaveNode(),heading=amEl('h3','',item.title),info=amEl('div','asset-card-info');info.append(heading,amEl('p','',item.subject||item.category||(item.recorded?'Recorded audio':'Saved recipe')));
    const foot=amEl('div','asset-card-foot');foot.append(amEl('span','asset-state',item.collection==='approved'?'Production':item.collection==='drafts'?(item.row.approved?'In production · draft retained':'Draft'):item.recorded?'Recorded':'Recipe'),amEl('span','',amDuration(item.duration)));
    const tagsNode=amEl('div','asset-card-tags');for(const t of (item.tags||[]).slice(0,3))tagsNode.append(amEl('span','',t));if((item.tags||[]).length>3)tagsNode.append(amEl('span','',`+${item.tags.length-3}`));
    card.append(top,wave,info,tagsNode,foot);if(item.recorded)amCardWave(wave,item,serial);else{wave.replaceChildren(amEl('span','recipe-icon',item.type==='dialogue'?'“ ”':'✎'));}
    card.addEventListener('click',e=>{if(!e.target.closest('button,input'))amSelect(item,e);});card.addEventListener('dblclick',e=>{if(!e.target.closest('button,input'))void amAction(()=>amOpen(item),{refresh:false});});
    card.addEventListener('contextmenu',e=>{e.preventDefault();if(!amSelected.has(item.key))amSelect(item);amShowMenu(e.clientX,e.clientY,amItemMenu(item),card);});
    card.addEventListener('keydown',e=>{if(e.target!==card)return;if(e.key==='Enter'){e.preventDefault();void amAction(()=>amOpen(item),{refresh:false});}else if(e.key===' '){e.preventDefault();amSelect(item,{ctrlKey:true});}else if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();amSelect(item);const r=card.getBoundingClientRect();amShowMenu(r.left+20,r.top+20,amItemMenu(item),card);}else if(e.key==='F2'){e.preventDefault();void amAction(()=>amEditMetadata(item));}});
    card.addEventListener('dragstart',e=>{if(amBusy||amLoading){e.preventDefault();return;}if(!amSelected.has(item.key))amSelect(item);amDragKeys=[...amSelected];e.dataTransfer.setData(amMime,JSON.stringify(amDragKeys));e.dataTransfer.effectAllowed='copy';card.classList.add('dragging');});card.addEventListener('dragend',()=>{amDragKeys=[];card.classList.remove('dragging');for(const el of document.querySelectorAll('.drop-target'))el.classList.remove('drop-target');});$('asset-items').append(card);
  }
  $('asset-empty').hidden=!!rows.length;$('asset-empty-title').textContent=total?'No matching assets.':amCollection==='approved'?'A home for the keepers.':amCollection==='drafts'?'Your next take starts here.':'Make room for your next sound.';$('asset-empty-text').textContent=total?'Try a different search, type or tag, or reset your filters.':amCollection==='approved'?'Choose a draft, right-click, then Send to production.':'Drop audio files here, create a sound, or copy a recording from your personal library.';
  $('asset-page').textContent=rows.length?`${amPage+1} / ${Math.ceil(rows.length/amPageSize)}`:'0 / 0';$('asset-prev').disabled=!amPage;$('asset-next').disabled=(amPage+1)*amPageSize>=rows.length;
  amRenderSelection();const item=amRows.find(r=>r.key===amInspectKey);if(item)amInspect(item);else amEmptyInspector();
}
function amClearPreview(){amPreviewTicket++;amPreviewAudio?.pause();amPreviewAudio=null;if(amPreviewUrl)URL.revokeObjectURL(amPreviewUrl);amPreviewUrl=null;}
function amEmptyInspector(){amClearPreview();const box=$('asset-inspector-content');box.replaceChildren();const d=amEl('div','inspector-empty');d.append(amEl('span','','⌁'),amEl('h3','','A closer listen.'),amEl('p','','Select an asset to preview its audio, inspect its details and decide what ships.'));box.append(d);}
function amInspect(item){
  amClearPreview();const box=$('asset-inspector-content');box.replaceChildren();const wave=amWaveNode();amDrawWave(wave,amPeaks.get(item.key+':'+item.updatedAt));box.append(wave,amEl('span','asset-kind',managerTypeNames[item.type]||item.type),amEl('h2','',item.title));
  if(item.recorded){const listen=amButton('▶ Preview recording','Load the saved audio and show its player.',()=>void amAction(async()=>{
    const ticket=amPreviewTicket;const blob=await amBlob(item);if(ticket!==amPreviewTicket)return;amPreviewUrl=URL.createObjectURL(blob);const audio=amEl('audio');audio.controls=true;audio.preload='metadata';audio.src=amPreviewUrl;audio.setAttribute('aria-label','Preview '+item.title);amPreviewAudio=audio;listen.replaceWith(audio);
    const peaks=await managerWaveform(blob);if(ticket!==amPreviewTicket)return;amPeaks.set(item.key+':'+item.updatedAt,peaks);amDrawWave(wave,peaks);const card=[...$('asset-items').children].find(n=>n.dataset.key===item.key);if(card)amDrawWave(card.querySelector('.asset-wave'),peaks);
  },{refresh:false}),'inspector-listen');box.append(listen);}
  const actions=amEl('div','inspector-actions');const edit=amButton(item.recorded?'Open editor':'Open recipe','Open this asset for editing.',()=>void amAction(()=>amOpen(item),{refresh:false}),'secondary');edit.dataset.amWrite='true';actions.append(edit);
  if(item.collection==='library'&&item.recorded){const copyPath=amButton('Copy disk WAV path','Copy the permanent WAV path for use in another tool.',()=>void amAction(async()=>{if(!audioDisk.ready)throw Error('Connect Asset storage first.');const row=(await audioDisk.client.request('assets')).assets.find(r=>r.id===item.key);if(!row?.audioPath)throw Error('Refresh the library before copying this path.');await navigator.clipboard.writeText(row.audioPath);amNotice('Permanent WAV path copied.');},{refresh:false}));actions.append(copyPath);}
  if(projectAudio.project&&item.recorded&&item.collection!=='approved'){const promote=amButton('Send to production','Review this recording and copy it into the project.',()=>void amAction(()=>amPromote([item])),'primary');promote.dataset.amWrite='true';actions.append(promote);}box.append(actions);
  const dl=amEl('dl','inspector-details');for(const [label,value]of [['Collection',item.collection==='approved'?'Production':item.collection==='drafts'?'Project drafts':'Personal library'],['Folder',[item.category,item.subject].filter(Boolean).join(' / ')||'Unfiled'],['Duration',amDuration(item.duration)],['Model',item.model||'Imported / recorded'],['Updated',item.updatedAt?new Date(item.updatedAt).toLocaleString():'—']])dl.append(amEl('dt','',label),amEl('dd','',value));box.append(dl);
  if(item.tags?.length){const tags=amEl('div','inspector-tags');for(const tag of item.tags)tags.append(amButton('#'+tag,'Filter this collection by '+tag,()=>{$('asset-tag').value=tag;amPage=0;amRender();}));box.append(tags);}
  if(item.notes)box.append(amEl('h3','','Notes'),amEl('p','inspector-notes',item.notes));if(item.text)box.append(amEl('h3','',item.type==='dialogue'?'Transcript':'Direction'),amEl('p','inspector-notes',item.text));
  const details=amEl('details','inspector-provenance');details.append(amEl('summary','','Source & provenance'),amEl('pre','',JSON.stringify(item.origin==='project'?item.row:{...item.row,audioWav:undefined,reference:item.row.reference?{...item.row.reference,audioWav:undefined}:undefined},null,2)));box.append(details);if(item.origin==='project')box.append(amEl('p','inspector-path',item.row.projectPath));amControls();
}
function amItemMenu(item){
  const rows=amSelected.has(item.key)?[...amSelected].map(k=>amRows.find(r=>r.key===k)).filter(Boolean):[item],many=rows.length>1,locked=amBusy||amLoading||!amFresh||amOtherBusy();
  const action=(label,fn,disabled=false)=>({label,run:()=>void amAction(fn),disabled:locked||disabled});
  return [{label:'Copy to shared project workspace',run:()=>void sharedProjectWorkspace.stageLocal(item.key),disabled:locked||many||!item.recorded},action(many?'Send selected to production':'Send to production',()=>amPromote(rows),!projectAudio.project||rows.some(r=>!r.recorded||r.collection==='approved')),
    action(many?'Copy selected to drafts':'Copy to project drafts',()=>amCopyDrafts(rows),!projectAudio.project||rows.some(r=>!r.recorded)),
    {separator:true},action('Render selected recipes',()=>amRenderRecipes(rows),!rows.some(r=>r.origin==='sound'&&!r.recorded)),action('New variation',()=>amVariation(item),many||item.origin!=='sound'),action(item.recorded?'Open in audio editor':'Open recipe',()=>amOpen(item),many),action('Rename / edit metadata',()=>amEditMetadata(item),many),action('Organize in folder…',()=>amChooseMove(rows)),
    action('Copy disk WAV path',async()=>{if(!audioDisk.ready)throw Error('Connect Asset storage first.');const row=(await audioDisk.client.request('assets')).assets.find(r=>r.id===item.key);if(!row?.audioPath)throw Error('Refresh this recording first.');await navigator.clipboard.writeText(row.audioPath);amNotice('Permanent WAV path copied.');},many||!item.recorded||item.collection!=='library'),action('Download WAV',async()=>downloadDialogue(await amBlob(item),dialogueFilename(item.title)+'.wav'),many||!item.recorded),action('Copy to personal library',()=>amCopyLibrary(rows),rows.some(r=>r.collection==='library'||!r.recorded)),
    {separator:true},action('Delete from personal library…',()=>amDelete(rows),rows.some(r=>r.collection!=='library'))];
}
async function amRenderRecipes(rows){const ids=rows.filter(r=>r.origin==='sound'&&!r.recorded).map(r=>r.id);if(!ids.length)throw Error('Select a saved sound or music recipe first.');if(ids.length>100)throw Error('Render up to 100 recipes at a time.');const done=await audioWorkshop.renderBatch({ids});amNotice(`${done.length} completed recipes retained${audioWorkshop.cancelled?' · stopped':''}.`);}
async function amVariation(item){if(!await audioReplace())return;amWorkspace('create','audio');audioEditing=null;audioFill({...item.row,title:(item.title+' · variation').slice(0,160),recipe:{...item.row.recipe,kind:item.row.kind,prompt:item.row.recipe?.prompt||'',seed:((item.row.recipe?.seed||0)+1)%2147483648}});audioDirty=true;amNotice('New variation ready in Create. Original retained.');}
function amCloseMenu(restore=false){const menu=$('asset-context');if(menu.hidden)return;menu.hidden=true;menu.replaceChildren();if(restore&&amMenuReturn?.isConnected)amMenuReturn.focus();amMenuReturn=null;}
function amShowMenu(x,y,items,origin){amCloseMenu();const menu=$('asset-context');amMenuReturn=origin;for(const item of items){if(item.separator){menu.append(amEl('hr'));continue;}const b=amButton(item.label,item.label,()=>{amCloseMenu();item.run();});b.setAttribute('role','menuitem');b.disabled=!!item.disabled;menu.append(b);}menu.hidden=false;const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-rect.height-8))+'px';menu.querySelector('button:not(:disabled)')?.focus();}
$('asset-context').addEventListener('keydown',e=>{const buttons=[...$('asset-context').querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);if(e.key==='Escape'||e.key==='Tab'){if(e.key==='Escape')e.preventDefault();e.stopPropagation();amCloseMenu(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();}});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#asset-context'))amCloseMenu();});window.addEventListener('resize',()=>amCloseMenu());document.addEventListener('scroll',()=>amCloseMenu(),true);
function amForm(title,description,fields,accept='Save',validate=null){
  const dialog=$('asset-form-dialog');$('asset-form-title').textContent=title;$('asset-form-description').textContent=description;$('asset-form-fields').replaceChildren();$('asset-form-error').hidden=true;$('asset-form-save').textContent=accept;
  for(const spec of fields){const label=amEl('label','',spec.label),input=amEl(spec.options?'select':spec.multiline?'textarea':'input');if(spec.options)for(const [value,label]of spec.options){const o=amEl('option','',label);o.value=value;input.append(o);}input.name=spec.name;input.id='am-field-'+spec.name;if(!spec.multiline&&!spec.options)input.type='text';if(spec.max)input.maxLength=spec.max;input.value=spec.value||'';input.required=!!spec.required;label.append(input);$('asset-form-fields').append(label);}
  return new Promise(resolve=>{const finish=v=>{dialog.close();$('asset-form').removeEventListener('submit',submit);$('asset-form-cancel').removeEventListener('click',cancel);dialog.removeEventListener('cancel',esc);resolve(v);};const submit=e=>{e.preventDefault();const v=Object.fromEntries([...$('asset-form-fields').querySelectorAll('input,textarea,select')].map(el=>[el.name,el.value]));try{validate?.(v);finish(v);}catch(error){$('asset-form-error').hidden=false;$('asset-form-error').textContent=error.message;}};const cancel=()=>finish(null),esc=e=>{e.preventDefault();finish(null);};$('asset-form').addEventListener('submit',submit);$('asset-form-cancel').addEventListener('click',cancel);dialog.addEventListener('cancel',esc);dialog.showModal();dialog.querySelector('input,textarea,select')?.focus();});
}
async function amResolveName(meta,rows,exclude=''){
  const conflict=managerConflict(meta,rows,exclude);if(!conflict)return meta;
  const v=await amForm('This name already exists',`“${meta.title}” already exists in this folder. Keep both with a distinct name; existing audio will be retained.`,[{name:'title',label:'New name',value:managerAvailableName(meta,rows,exclude),max:160,required:true}],'Use this name',v=>{const clean=managerMetadata({...meta,title:v.title});if(managerConflict({...meta,...clean},rows,exclude))throw Error('That name is also used in this folder. Choose another.');});
  return v?{...meta,title:v.title.trim()}:null;
}
function amItemMetadata(item){return managerMetadata({title:item.title,category:item.category,subject:item.subject,tags:item.tags||[],notes:item.notes||'',assetType:item.type});}
function amNativeMetadata(item,metadata){
  const source=item.origin==='project'?item.row.metadata.source:item.origin==='sound'?projectSoundMetadata(item.row).source:item.origin==='archive'?item.row.metadata.source:item.origin==='take'?{protocol:'capp.voice-lab.take.v1',...item.row}:item.origin==='reference'?{protocol:'capp.voice-lab.reference.v1',id:item.id,revision:item.row.revision,character:item.row.name,text:item.row.reference?.text,settings:item.row.settings}:null;
  const {assetType,...clean}=metadata;return {...clean,kind:assetType==='reference'?'dialogue':assetType||item.kind,source:{...source,...(assetType?{assetType}:{})}};
}
async function amProductionRows(){return (await projectTask(()=>managerCollect(o=>projectAudio.list({...o,collection:'approved'}),100),{changed:false})).map(r=>managerProjectItem(r,'approved'));}
async function amPromote(rows,folder=null){
  if(!projectAudio.project)throw Error('Open a project first.');if(!rows.length||rows.some(r=>!r.recorded))throw Error('Only recorded audio can be sent to production. Render recipes first.');
  if(!await confirmLibrary('Send to production?',`Copy ${rows.length===1?'“'+rows[0].title+'”':rows.length+' recordings'} into ${projectAudio.project.name}?\n\nDrafts and existing production versions will be retained. You will resolve any name conflicts before each copy.`,'Send to production'))return;
  let sent=0,skipped=0;const failures=[];$('asset-progress').hidden=false;$('asset-progress').max=rows.length;
  for(const item of rows){try{
    let production=await amProductionRows();if(item.origin==='project'&&production.some(r=>r.id===item.id)&&!folder){skipped++;continue;}
    let metadata={...amItemMetadata(item),kind:item.kind};if(folder)[metadata.category,metadata.subject]=folder;
    metadata=await amResolveName(metadata,production);if(!metadata){skipped++;continue;}
    amNotice('Sending to production · '+metadata.title);
    // Reuse unchanged native drafts; edited names/folders create immutable draft versions.
    let draft=item.origin==='project'&&item.collection==='drafts'&&JSON.stringify(amItemMetadata(item))===JSON.stringify(managerMetadata(metadata))?item.row:null;
    if(!draft){const blob=await amBlob(item);draft=await projectTask(()=>projectAudio.stage(amNativeMetadata(item,metadata),blob),{changed:false});}
    // Refresh name admission immediately before commit. Native hashed destinations are always no-clobber.
    production=await amProductionRows();if(!production.some(r=>r.id===draft.id)&&managerConflict(metadata,production))throw Error('Production changed during this transfer. The new draft is saved; retry to choose a name.');
    await projectTask(()=>projectAudio.approve(draft),{changed:false});sent++;
  }catch(e){failures.push(item.title+': '+e.message);}finally{$('asset-progress').value=sent+skipped+failures.length;}}
  amNotice(`${sent} sent to production · ${skipped} skipped or already present · ${failures.length} failed. Drafts retained.`);if(failures.length)throw Error(failures.join('\n'));
}
async function amCopyDrafts(rows,folder=null){
  if(!projectAudio.project)throw Error('Open a project first.');if(rows.some(r=>!r.recorded))throw Error('Render recipes before copying their audio to the project.');let copied=0,skipped=0;const errors=[];
  let targets=(await projectTask(()=>managerCollect(o=>projectAudio.list({...o,collection:'drafts'}),100),{changed:false})).map(r=>managerProjectItem(r,'drafts'));
  for(const item of rows){try{let m={...amItemMetadata(item),kind:item.kind};if(folder)[m.category,m.subject]=folder;
    if(item.origin==='project'&&targets.some(r=>r.id===item.id)&&!folder){skipped++;continue;}
    m=await amResolveName(m,targets);if(!m){skipped++;continue;}const blob=await amBlob(item),draft=await projectTask(()=>projectAudio.stage(amNativeMetadata(item,m),blob),{changed:false});targets.push(managerProjectItem(draft,'drafts'));copied++;
  }catch(e){errors.push(item.title+': '+e.message);}}
  amNotice(`${copied} copied to project drafts · ${skipped} skipped. Originals retained.`);if(errors.length)throw Error(errors.join('\n'));
}
async function amCopyLibrary(rows,folder=null){let count=0;const errors=[];for(const item of rows){try{if(!item.recorded)throw Error('No recording yet.');let m={...amItemMetadata(item),kind:item.kind};if(folder)[m.category,m.subject]=folder;m=await amResolveName(m,amRows.filter(r=>r.collection==='library'));if(!m)continue;const bytes=await decodeAudioImport(new File([await amBlob(item)],'copy.wav',{type:'audio/wav'}));const saved=await audioAssets.saveMedia({metadata:{...m,kind:item.kind==='music'?'music':'sfx',assetType:item.type,notes:(m.notes+'\nCopied from '+item.key).trim().slice(0,12000)},bytes,notify:false});amRows.push(...managerLocalItems([saved],[],[],[]));count++;}catch(e){errors.push(item.title+': '+e.message);}}amNotice(`${count} recordings copied to the personal library. Originals retained.`);if(errors.length)throw Error(errors.join('\n'));}
async function amOpen(item){
  amClearPreview();if(!item.recorded){if(item.origin==='sound'){if(!await audioReplace())return;amWorkspace('create','audio');audioEditing=await audioAssets.get(item.id);audioFill(audioEditing);$('audio-title').focus();}else{amWorkspace('create','dialogue');await openSavedDialogue(item.id);}return;}
  if(item.origin==='sound'){await openAudioTimeline(item.id);return;}
  const bytes=await decodeAudioImport(new File([await amBlob(item)],'editable-copy.wav',{type:'audio/wav'})),m=amItemMetadata(item);
  const saved=await audioAssets.saveMedia({metadata:{...m,assetType:item.type,kind:item.kind==='music'?'music':'sfx',notes:(m.notes+'\nEditable copy of '+item.key).trim().slice(0,12000)},bytes,notify:false});await openAudioTimeline(saved.id);amNotice('Opened an editable copy. Save a new version to create a project draft.');
}
async function amWriteMetadata(item,m){
  if(item.origin==='project'){const blob=await amBlob(item);await projectTask(()=>projectAudio.stage(amNativeMetadata(item,m),blob),{changed:false});amNotice('Saved a new project draft. Original recording retained.');}
  else if(item.origin==='sound'){const latest=await audioAssets.get(item.id);if(latest?.revision!==item.row.revision)throw Error('This asset changed. Refresh before editing.');await audioAssets.save({...latest,...m});amNotice('Asset metadata saved.');}
  else{await amOrganizer.save(item.key,m);amNotice('Asset metadata saved. Original character and take settings retained.');}
}
async function amEditMetadata(item){
  const fields=[['title','Name',160],['category','Category folder',80],['subject','Subject subfolder',120],['tags','Tags · comma separated',2000],['notes','Notes',12000]].map(([name,label,max])=>({name,label,max,value:name==='tags'?(item.tags||[]).join(', '):item[name]||'',multiline:name==='notes',required:name==='title'}));
  fields.splice(1,0,{name:'assetType',label:'Asset type',options:Object.entries(managerTypeNames),value:item.type});
  const v=await amForm('Edit asset details',item.origin==='project'?'This creates a new draft version. The existing recording stays intact.':'Rename and organize the asset without changing its recording.',fields,item.origin==='project'?'Save new draft':'Save details',v=>managerMetadata({...v,tags:v.tags.split(',').map(s=>s.trim()).filter(Boolean)}));if(!v)return;
  let m={...managerMetadata({...v,tags:v.tags.split(',').map(s=>s.trim()).filter(Boolean)}),kind:v.assetType==='reference'?'dialogue':v.assetType};m=await amResolveName(m,amRows.filter(r=>r.collection===(item.origin==='project'?'drafts':'library')),item.key);if(m)await amWriteMetadata(item,m);
}
async function amChooseMove(rows){const v=await amForm('Organize in folder',rows.some(r=>r.origin==='project')?'Project recordings are copied into new drafts in the chosen folder. Originals are retained.':'Organize the selected assets by category and subject.',[{name:'category',label:'Category folder',value:amFolder?.[0]||'',max:80},{name:'subject',label:'Subject subfolder',value:amFolder?.[1]||'',max:120}],'Organize',v=>managerMetadata({title:'folder',...v,tags:[]}));if(v)await amMove(rows,[v.category.trim(),v.subject.trim()]);}
async function amMove(rows,folder){let count=0;const errors=[];for(const item of rows){try{if(managerSameFolder(item,{category:folder[0],subject:folder[1]}))continue;let m={...amItemMetadata(item),kind:item.kind,category:folder[0],subject:folder[1]};m=await amResolveName(m,amRows.filter(r=>r.collection===(item.origin==='project'?'drafts':'library')),item.key);if(!m)continue;await amWriteMetadata(item,m);if(item.origin!=='project')Object.assign(item,m);else amRows.push({...item,...m,key:'staged:'+count,collection:'drafts'});count++;}catch(e){errors.push(item.title+': '+e.message);}}amNotice(`${count} organized${rows.some(r=>r.origin==='project')?' as new drafts; original project versions retained':''}.`);if(errors.length)throw Error(errors.join('\n'));}
async function amNewFolder(category=''){
  const v=await amForm('New folder','Use a category and an optional subject. Project folders are created on disk when they contain a recording.',[{name:'category',label:'Category folder',value:category,max:80,required:true},{name:'subject',label:'Subject subfolder · optional',max:120}],'Create folder',v=>managerMetadata({title:'folder',...v,tags:[]}));if(!v)return;
  const folder=[v.category.trim(),v.subject.trim()];if(amCollectionRows().some(r=>managerKey(r.category)===managerKey(folder[0])&&(!folder[1]||managerKey(r.subject)===managerKey(folder[1]))))throw Error('That folder already exists.');await amOrganizer.folder(amScope(),...folder);amFolder=folder;amNotice('Folder created. Drag assets here to organize them.');
}
async function amDelete(rows){
  if(rows.some(r=>r.collection!=='library'))throw Error('Project recordings are retained by the project storage contract.');
  if(!await confirmLibrary('Delete from personal library?',`Delete ${rows.length} selected assets and their local recordings? Separately copied project drafts and production recordings are retained. Export a backup first if needed.`,'Delete selected'))return;
  let count=0;const errors=[];for(const item of rows){try{if(item.origin==='archive')await audioDisk.transaction('projects',['assets','audio'],'readwrite',async s=>{await managerRequest(s('assets').delete(item.id));await managerRequest(s('audio').delete(item.id));});else if(item.origin==='sound')await audioAssets.remove(item.id,item.row.revision);else if(item.origin==='take')await voiceLibrary.deleteTake(item.id);else if(item.origin==='line')await voiceLibrary.deleteDialogue(item.id,item.row.revision);else{const c=await voiceLibrary.getCharacter(item.id);if(c.revision!==item.row.revision)throw Error('Character changed; refresh first.');await voiceLibrary.saveCharacter({...c,reference:null});}amSelected.delete(item.key);count++;}catch(e){errors.push(item.title+': '+e.message);}}
  amInspectKey='';amNotice(`${count} deleted from the personal library.`);if(errors.length)throw Error(errors.join('\n'));
}
async function amImport(files,target={collection:amCollection,folder:amFolder}){
  return amAction(async()=>{if(files.length>20)throw Error('Import up to 20 audio files at a time.');if(target.collection==='approved')throw Error('Import into Drafts, then send the reviewed recordings to Production.');let count=0;const failures=[];
    for(const file of files){try{const kind=$('asset-type').value==='music'?'music':'sfx';let m={title:file.name.replace(/\.[^.]+$/,'').slice(0,160),kind,category:target.folder?.[0]||'',subject:target.folder?.[1]||'',tags:['imported'],notes:'',assetType:$('asset-type').value||kind};m.kind=m.assetType==='reference'?'dialogue':m.assetType;m=await amResolveName(m,amRows.filter(r=>r.collection===target.collection));if(!m)continue;
      amNotice('Importing · '+file.name);const bytes=await decodeAudioImport(file),saved=await audioAssets.saveMedia({metadata:{...m,kind},bytes,notify:false}),item=managerLocalItems([saved],[],[],[])[0];amRows.push(item);count++;
      if(projectAudio.project){const draft=await projectTask(()=>projectAudio.stage(projectSoundMetadata(saved),new Blob([bytes],{type:'audio/wav'})),{changed:false});amRows.push(managerProjectItem(draft,'drafts'));}
    }catch(e){failures.push(file.name+': '+e.message+' Any completed local copy remains in Personal library.');}}
    amNotice(`${count} audio files imported${projectAudio.project?' and copied to drafts where successful':''}.`);if(failures.length)throw Error(failures.join('\n'));
  });
}
async function amBackupOrganizer(){const data={protocol:ASSET_MANAGER_PROTOCOL,...await amOrganizer.read()};downloadDialogue(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'voice-lab-organization.json');amNotice('Organization exported. Use audio and character backups for recording bytes.');}
function amToolsMenu(button){const r=button.getBoundingClientRect();amShowMenu(r.left,r.bottom,[{label:'Refresh all assets',run:()=>{amFresh=false;void amRefresh();}}, {separator:true},{label:'Back up audio library',run:()=>void amAction(async()=>downloadDialogue(new Blob([JSON.stringify(await audioAssets.export())],{type:'application/json'}),'voice-lab-audio-backup.json'),{refresh:false})},{label:'Back up characters & dialogue',run:()=>void amAction(async()=>downloadDialogue(new Blob([JSON.stringify(await voiceLibrary.exportLibrary())],{type:'application/json'}),'voice-lab-characters-backup.json'),{refresh:false})},{label:'Back up folder organization',run:()=>void amAction(amBackupOrganizer,{refresh:false})},{label:'Restore backup / import batch',run:()=>$('asset-backup-file').click()}],button);}
// Workspace navigation keeps each composer's unsaved input in place.
let amLastCreate='audio';
function amWorkspace(workspace,create=amLastCreate,legacy=false){
  if(!legacy&&workspace!=='assets'&&amOtherBusy())return;
  if(workspace==='create')amLastCreate=create;document.body.dataset.workspace=workspace;
  for(const [id,name]of [['assets-tab','assets'],['create-tab','create'],['tools-tab','tools']])$(id).setAttribute('aria-pressed',String(name===workspace));
  $('asset-workspace').hidden=workspace!=='assets';
  if(workspace==='create'){document.body.dataset.creator=create;if(!legacy){setAudioOpen(create==='audio');setDialogueOpen(create==='dialogue');}}
  if(workspace==='tools'&&!legacy){setAudioOpen(false);setDialogueOpen(false);}
  if(workspace==='assets'){amQueueRefresh();}
}
$('assets-tab').addEventListener('click',()=>amWorkspace('assets'));$('create-tab').addEventListener('click',()=>amWorkspace('create'));$('tools-tab').addEventListener('click',()=>amWorkspace('tools'));
$('audio-tab').addEventListener('click',()=>amWorkspace('create','audio',true));$('dialogue-tab').addEventListener('click',()=>amWorkspace('create','dialogue',true));
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>amWorkspace('tools',undefined,true));
for(const b of document.querySelectorAll('a.brand,a.skip'))b.addEventListener('click',()=>amWorkspace('assets'));
$('asset-new').addEventListener('click',()=>{amWorkspace('create','audio');$('audio-new').click();});
$('asset-new-folder').addEventListener('click',()=>void amAction(()=>amNewFolder()));
$('asset-import').addEventListener('click',()=>{if(amCollection==='approved'){amChangeCollection('drafts');amNotice('Importing into Drafts. Review recordings before promotion.');}$('asset-files').click();});
$('asset-files').addEventListener('change',()=>{const files=[...$('asset-files').files];$('asset-files').value='';if(files.length)void amImport(files);});
amDropTarget($('asset-items'),{get collection(){return amCollection;},get folder(){return amFolder;}});amDropTarget($('asset-empty'),{get collection(){return amCollection;},get folder(){return amFolder;}});
for(const id of ['asset-search','asset-tag','asset-type','asset-state','asset-sort'])$(id).addEventListener(['asset-search','asset-tag'].includes(id)?'input':'change',()=>{amPage=0;amSelected.clear();amRender();});
$('asset-clear-filters').addEventListener('click',amReset);$('asset-prev').addEventListener('click',()=>{amPage--;amRender();});$('asset-next').addEventListener('click',()=>{amPage++;amRender();});
for(const view of ['grid','list'])$('asset-'+view+'-view').addEventListener('click',()=>{amView=view;for(const v of ['grid','list'])$('asset-'+v+'-view').setAttribute('aria-pressed',String(v===view));try{localStorage.setItem('capp.voice-lab.asset-view',view);}catch{}amRender();});
$('asset-select-all').addEventListener('click',()=>{for(const row of amFiltered())amSelected.add(row.key);amRenderSelection();});$('asset-clear-selection').addEventListener('click',()=>{amSelected.clear();amRenderSelection();});
const amSelectedRows=()=>[...amSelected].map(k=>amRows.find(r=>r.key===k)).filter(Boolean);
$('workspace-stop').addEventListener('click',()=>{if(audioWorkshop.busy)void audioWorkshop.cancel().catch(amError);if(dialogueStudio.busy)void dialogueStudio.cancel();if(lab.busy)lab.stopAll();});
$('asset-bulk-render').addEventListener('click',()=>void amAction(()=>amRenderRecipes(amSelectedRows())));
$('asset-bulk-promote').addEventListener('click',()=>void amAction(()=>amPromote(amSelectedRows())));$('asset-bulk-folder').addEventListener('click',()=>void amAction(()=>amChooseMove(amSelectedRows())));
$('asset-tools').addEventListener('click',e=>amToolsMenu(e.currentTarget));
$('asset-backup-file').addEventListener('change',()=>{const file=$('asset-backup-file').files[0];$('asset-backup-file').value='';if(file)void amAction(async()=>{if(file.size>510000000)throw Error('Choose a backup smaller than 510 MB.');const data=JSON.parse(await file.text());if(data.protocol===ASSET_MANAGER_PROTOCOL)await amOrganizer.restore(data);else if(data.protocol===VOICE_LIBRARY_PROTOCOL)await voiceLibrary.importLibrary(data);else await audioAssets.import(data);amNotice('Backup imported. Existing IDs are never overwritten.');});});
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||e.target.closest('input,textarea,select')||document.body.dataset.workspace!=='assets')return;
  if(e.key==='/'){e.preventDefault();$('asset-search').focus();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();$('asset-select-all').click();}else if(e.key==='Escape'){amCloseMenu(true);amSelected.clear();amRenderSelection();}else if(e.key==='Delete'&&amSelected.size){e.preventDefault();void amAction(()=>amDelete(amSelectedRows()));}
});
window.addEventListener('voice-lab:library-change',amQueueRefresh);window.addEventListener('voice-lab:project-change',amQueueRefresh);
const amObserver=new MutationObserver(()=>{amControls();if(amPending&&!amOtherBusy()&&!amBusy&&!amLoading)amQueueRefresh();});amObserver.observe(document.body,{attributes:true,attributeFilter:['data-audio-busy','data-dialogue-busy','data-library-busy','data-lab-busy']});
window.addEventListener('focus',amQueueRefresh);
// Prevent a missed file drop from navigating away from unsaved work.
for(const type of ['dragover','drop'])window.addEventListener(type,e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault();});
window.addEventListener('beforeunload',e=>{if(amBusy){e.preventDefault();e.returnValue='';}});window.addEventListener('pagehide',()=>{amDisposed=true;clearTimeout(amTimer);amObserver.disconnect();amClearPreview();amOrganizer.close();},{once:true});
try{if(localStorage.getItem('capp.voice-lab.asset-view')==='list')amView='list';}catch{}
window.voiceLabAssets=Object.freeze({protocol:ASSET_MANAGER_PROTOCOL,refresh:()=>amRefresh(),get collection(){return amCollection;},get count(){return amRows.length;}});
amWorkspace('assets');
