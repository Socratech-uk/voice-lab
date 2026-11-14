import {localFiles,waitForLocalFiles} from './local-files.mjs';
// Loaded after all library UIs so one connection migrates their related stores together.
const audioStorageDialog=document.createElement('dialog');audioStorageDialog.className='pw-dialog';audioStorageDialog.id='audio-storage-dialog';audioStorageDialog.setAttribute('aria-labelledby','audio-storage-title');
audioStorageDialog.innerHTML=`<header class="pw-top"><h2 id="audio-storage-title">Audio assets on disk</h2><button id="audio-storage-close">Close ×</button></header>
<p>Characters, dialogue, recordings, references, generation recipes and folders stay together. Browser records are retained for recovery.</p>
<label class="pw-field">Permanent folder<input id="audio-storage-root" readonly value="C:\\Users\\alex1\\cApp\\assets\\audio"></label>
<button id="audio-storage-copy-link">Copy connection for Foundry</button><button id="audio-storage-copy">Copy folder path</button>
<div class="pw-toolbar"><button id="audio-storage-local">Use local assets</button><button id="audio-storage-retry">Retry / refresh</button></div>
<details><summary>Advanced · remote storage</summary><p>Connect another machine or a configured HTTPS service.</p>
<label class="pw-field">Private storage link<input id="audio-storage-link" type="password" autocomplete="off" placeholder="https://…/#storage=…"></label><button id="audio-storage-connect">Connect remote & migrate</button></details>
<p id="audio-storage-message" role="status" aria-live="polite"></p>
<p>Migration keeps original browser records. Earlier disk versions and removed recordings remain recoverable. New saves go to the connected disk folder. Local storage also copies existing native project drafts from .capp/audio-drafts into this library. Native originals and approved project recordings remain in place.</p>`;
document.body.append(audioStorageDialog);
function renderAudioStorage(){
 const busy=audioDisk.connecting||audioDisk.pending>0;
 $('audio-storage-open').textContent=audioDisk.connecting?'Migrating audio…':audioDisk.error?'Check audio storage':audioDisk.ready?'Audio on disk':'Asset storage';
 $('audio-storage-open').title=audioDisk.message;
 $('audio-storage-status').textContent=audioDisk.connecting?'Migrating audio…':audioDisk.uncertain?'Save needs verification':audioDisk.error?'Storage needs attention':audioDisk.cacheWarnings?.length?'Browser migration needs attention':audioDisk.pending?'Reading / saving on disk…':audioDisk.preferences.size?'Settings waiting for disk':audioDisk.ready?'Audio on disk':'Browser recovery · connect to save';
 $('audio-storage-message').textContent=audioDisk.message;
 if(audioDisk.client.status)$('audio-storage-root').value=audioDisk.client.status.root;
 $('audio-storage-connect').disabled=$('audio-storage-retry').disabled=busy;
}
audioDisk.onChange=renderAudioStorage;
async function connectAudioStorage(link){
 if(amOtherBusy())throw Error('Wait for the active audio operation before changing storage.');
 await audioDisk.connect(link);libraryReady=true;
 if(!audioDisk.preferences.size){try{lab.settings=cleanSettings(JSON.parse(localStorage.getItem(preferencesKey)||'null'));dialogueStudio.settings=dialogueSettings(JSON.parse(localStorage.getItem(dialoguePreferenceKey)||'null'));}catch{}}
 await refreshVoiceLibrary();await refreshAudioAssets();await amRefresh();renderLibraryControls();renderDialogue();scheduleRender();
 window.dispatchEvent(new Event('voice-lab:library-change'));
}
const runAudioStorage=link=>connectAudioStorage(link).catch(error=>{audioDisk.notify(error.message);});
$('audio-storage-open').onclick=()=>{renderAudioStorage();audioStorageDialog.showModal();};
$('audio-storage-close').onclick=()=>audioStorageDialog.close();$('audio-storage-local').onclick=()=>void runAudioStorage('capp-local:audio');
$('audio-storage-connect').onclick=()=>{const link=$('audio-storage-link').value;$('audio-storage-link').value='';void runAudioStorage(link);};
$('audio-storage-retry').onclick=()=>void runAudioStorage(audioDisk.client.connection?.link||$('audio-storage-link').value);
$('audio-storage-copy-link').onclick=async()=>{try{if(!audioDisk.client.connection)throw Error('Connect audio storage first.');if(audioDisk.client.connection.local){audioDisk.notify('Foundry uses the same shared audio folder automatically.');return;}await navigator.clipboard.writeText(audioDisk.client.connection.link);audioDisk.notify('Private link copied. Paste into Foundry → Asset libraries.');}catch(e){audioDisk.notify(e.message);}};
$('audio-storage-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('audio-storage-root').value);}catch{$('audio-storage-root').select();}};
window.addEventListener('beforeunload',e=>{if(audioDisk.pending||audioDisk.connecting||audioDisk.preferences.size||audioDisk.uncertain){e.preventDefault();e.returnValue='';}});
window.voiceLabStorage=Object.freeze({connect:connectAudioStorage,status:()=>({ready:audioDisk.ready,root:audioDisk.client.status?.root,message:audioDisk.message,report:audioDisk.report,pending:audioDisk.pending}),flush:()=>audioDisk.flushPreferences()});
renderAudioStorage();
let audioInitialLink;try{audioInitialLink=localStorage.getItem(AUDIO_DISK_KEY);}catch{}
const audioInitialParams=new URLSearchParams(location.hash.slice(1));const audioExplicitHandoff=audioInitialParams.has('storage')||audioInitialParams.has('assetStorage');
if(audioInitialParams.has('assetStorage')){audioInitialLink=audioInitialParams.get('assetStorage');audioInitialParams.delete('assetStorage');history.replaceState(null,'',location.pathname+(audioInitialParams.size?'#'+audioInitialParams:''));}
if(audioInitialParams.has('storage')){audioInitialLink=location.origin+'/#storage='+encodeURIComponent(audioInitialParams.get('storage'));audioInitialParams.delete('storage');history.replaceState(null,'',location.pathname+(audioInitialParams.size?'#'+audioInitialParams:''));}
const audioStorageStartup=waitForLocalFiles().then(api=>{const explicit=audioExplicitHandoff;const link=api&&!explicit?'capp-local:audio':audioInitialLink;return link?runAudioStorage(link):undefined;});
