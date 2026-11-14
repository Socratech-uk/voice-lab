import {CappBridge} from './bridge.mjs';
import {VoiceLab, DEFAULTS, LAB_VERSION, cleanSettings, spokenText} from './lab.mjs';
import {AudioDiskStorage,AUDIO_DISK_KEY} from './disk-storage.mjs';
const audioDisk=new AudioDiskStorage();
const $ = id => document.getElementById(id);
const MODES = {
  speak: {number:'01', title:'Give your words a voice.', label:'Text to speak', button:'Speak text', limit:1200, sample:'Ship computer online. Engines ready. Shields active. Welcome aboard the Kestrel.', description:'Use the speech engine on its own. Type a line, choose a voice and hear it locally. No text model required.', hint:'Only text-to-speech runs. First use may prepare the managed voice engine.'},
  text: {number:'02', title:'Try your small language model.', label:'Your prompt', button:'Generate text', limit:4000, sample:'In three short sentences, explain why a spacecraft keeps moving after its engines switch off.', description:'Generate text without starting the voice engine. A useful first check for your selected GGUF.', hint:'Each request uses isolated context. No previous conversation is sent.'},
  together: {number:'03', title:'Ask it. Hear the reply.', label:'Your prompt', button:'Generate & speak', limit:4000, sample:'Give a calm welcome aboard an exploration ship. Write three short sentences, each about a different part of the journey.', description:'Generate a short reply and speak complete phrases as they arrive. Text generation can continue while audio plays.', hint:'Replies are model-generated, not validated facts. Audio may start before the final answer.'},
  ship: {number:'04', title:'A ship computer, in miniature.', button:'Announce status', description:'Change the simulated ship, then trigger an announcement. Only these displayed facts are used; there is no game connection.'},
};
const preferencesKey = 'capp.voice-lab.preferences.v2';
const legacyPreferencesKey = 'capp.voice-lab.preferences.v1';
const bridge = new CappBridge(window);
const lab = new VoiceLab(bridge, {onChange: () => scheduleRender()});
try {
  const saved = localStorage.getItem(preferencesKey) ?? localStorage.getItem(legacyPreferencesKey);
  const parsed = JSON.parse(saved || 'null');
  lab.settings = cleanSettings(parsed);
  // 1.1.1 raises the playground's old 96/256-token ceiling. Migrate only
  // legacy-sized values; preserve every other voice/personality preference.
  if (parsed && Number(parsed.maxTokens) <= 256) lab.settings.maxTokens = DEFAULTS.maxTokens;
} catch { lab.settings = {...DEFAULTS}; }
let prompts = Object.fromEntries(Object.entries(MODES).filter(([k]) => k !== 'ship').map(([k,v]) => [k,v.sample]));
let currentMode = lab.settings.mode, raf = 0, renderedEventKey = '', renderedOutput = '', disposed = false;
function save() { audioDisk.setPreference(preferencesKey,JSON.stringify(lab.settings)); }
function scheduleRender() { if (!disposed && !raf) raf = requestAnimationFrame(() => { raf = 0; render(lab.snapshot()); }); }
function stateDot(el, busy, value) { el.className = 'dot' + (busy ? ' busy' : /ready|loaded|reply received/i.test(value) ? ' ready' : /failed|unavailable|disabled/i.test(value) ? ' error' : ''); }
function timeText(ms) { return ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`; }
function render(s) {
  document.body.dataset.labBusy=String(s.busy);
  const capability = s.available.text || s.available.voice;
  $('capability').textContent = capability ? (s.context.delivery === 'connected' ? 'Local AI · app bridge connected' : 'Local AI detected') : s.context.installed ? 'Installed app · bridge unavailable' : 'Preview · no Sidecar';
  $('capability').className = 'badge' + (capability ? ' present' : '');
  $('preview-notice').hidden = capability;
  $('runtime-notice-title').textContent = s.context.installed ? 'Application connection unavailable.' : 'Interface preview.';
  $('runtime-notice-text').textContent = s.context.installed
    ? 'The native engine can be ready in Studio while this app cannot reach it. Check the scoped connection and repackage with Local AI 0.11.5+. Existing models can stay in place.'
    : 'Local AI is not present in this window. Build this app with the Local AI Sidecar to use the real engines. The ship simulator still produces text.';
  $('text-state').textContent = s.textState; $('voice-state').textContent = s.voiceState;
  $('text-model').textContent = s.textModel ? 'Model: ' + s.textModel : 'Your selected GGUF · independent text slot';
  $('text-model').title = s.textModel || '';
  stateDot($('text-dot'), s.textBusy, s.textState); stateDot($('voice-dot'), s.voiceBusy, s.voiceState);
  $('prepare-text').disabled = s.textBusy || s.active;
  $('enable-voice').disabled = s.voiceBusy || s.active;
  $('prepare-text').textContent = s.textPreparing ? 'Preparing…' : 'Prepare text';
  $('enable-voice').textContent = s.voicePreparing ? 'Preparing…' : s.armed ? 'Enable / recheck' : 'Enable voice';
  $('check').disabled = s.checking; $('check').textContent = s.checking ? 'Checking…' : '↻ Check engines';
  for (const b of document.querySelectorAll('[data-mode]')) { b.disabled = s.busy || document.body.dataset.dialogueBusy === 'true' || document.body.dataset.audioBusy === 'true'; b.setAttribute('aria-pressed', String(b.dataset.mode === currentMode && !document.body.classList.contains('dialogue-open') && !document.body.classList.contains('audio-open'))); }
  $('dialogue-tab').disabled = s.busy || document.body.dataset.audioBusy === 'true';
  $('audio-tab').disabled = s.busy || document.body.dataset.dialogueBusy === 'true' || document.body.dataset.audioBusy === 'true';
  $('run').title = s.busy ? 'Wait for this test to finish, or use the Stop controls.' : MODES[currentMode].description; $('run').disabled = s.busy; $('run-label').textContent = s.busy ? 'Test in progress…' : MODES[currentMode].button;
  $('stop-text').disabled = !s.textBusy; $('stop-voice').disabled = !s.voiceBusy && !s.queued; $('stop-all').disabled = !s.busy;
  $('sample').disabled = s.busy; $('clear').disabled = s.busy;
  $('read-output').disabled = s.busy || !s.output.trim(); $('copy').disabled = !s.output.trim();
  $('prompt').disabled = s.busy; $('system').disabled = s.busy;
  for (const el of document.querySelectorAll('[data-setting], input[name="delivery"], #ship-workspace input, [data-ship-event]')) {
    el.disabled = s.busy;
    if (el.dataset.setting && el !== document.activeElement) { const value = s.settings[el.dataset.setting]; if (el.type === 'checkbox') el.checked = value; else el.value = value; }
    if (el.name === 'delivery') el.checked = el.value === s.settings.delivery;
  }
  $('reset-settings').disabled = s.busy;
  $('speed-value').textContent = s.settings.speed.toFixed(2) + '×'; $('volume-value').textContent = Math.round(s.settings.volume * 100) + '%';
  $('delivery-settings').hidden = currentMode !== 'together';
  $('ship-phrasing-wrap').hidden = currentMode !== 'ship' || !s.settings.shipLlm;
  $('text-settings-note').textContent = currentMode === 'ship'
    ? s.settings.shipLlm
      ? s.settings.shipPhrasing === 'narrate'
        ? 'These settings ARE active for the ship narrator. A custom instruction overrides Response style; factual telemetry constraints are always appended.'
        : 'Strict selector deliberately forces 3 tokens, temperature 0 and an internal 0/1 prompt. General text settings do not apply in this mode.'
      : 'Ship LLM is off. Announcements are deterministic; text-model settings are not used.'
    : 'These settings apply to LLM only and LLM + voice. A custom instruction overrides Response style.';
  if ($('system') !== document.activeElement) $('system').value = s.settings.customSystem;
  if (s.output !== renderedOutput) {
    const el = $('output'), atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 45;
    el.textContent = s.output; renderedOutput = s.output;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }
  $('output').hidden = !s.output; $('output-empty').hidden = !!s.output;
  $('spoken-line').hidden = !s.spoken; $('spoken').textContent = s.spoken;
  $('first-token').textContent = timeText(s.metrics.firstTokenMs); $('first-audio').textContent = timeText(s.metrics.firstAudioMs);
  $('overlap').textContent = s.metrics.overlapMs > 0 ? timeText(s.metrics.overlapMs) : '—'; $('overlap').classList.toggle('active', s.metrics.overlapMs > 0);
  $('queue').textContent = String(s.queued);
  $('status-message').textContent = s.message;
  $('status-dot').className = 'dot' + (s.busy ? ' busy' : s.error ? ' error' : s.id ? ' ready' : '');
  $('error-box').hidden = !s.error;
  if (s.error) { $('error-code').textContent = s.error.code; $('error-help').textContent = s.error.help; }
  $('preparation').hidden = !s.voicePreparing;
  if (s.voicePreparing) {
    const p = s.preparation, labels = {starting:'Starting local voice',verifying:'Verifying cached assets','checking-assets':'Checking voice assets',downloading:'Downloading voice assets',installing:'Installing the private engine',prepared:'Files installed',loading:'Loading and testing speech',ready:'Voice ready',cancelled:'Stopping preparation',failed:'Preparation failed'};
    $('prep-label').textContent = (labels[p.phase] || 'Preparing voice') + (p.asset ? ' · ' + p.asset : '');
    const mb = x => (x / 1048576).toFixed(1) + ' MB';
    $('prep-bytes').textContent = p.bytes ? mb(p.bytes) + (p.totalBytes ? ' / ' + mb(p.totalBytes) : '') : 'First preparation may take a little while';
    if (p.totalBytes > 0 && p.phase === 'downloading') $('prep-progress').value = Math.min(1, p.bytes / p.totalBytes); else $('prep-progress').removeAttribute('value');
  }
  const key = JSON.stringify(s.events);
  if (key !== renderedEventKey) {
    renderedEventKey = key; $('events').replaceChildren(); $('event-count').textContent = `${s.events.length} events`;
    for (const e of s.events) { const li = document.createElement('li'), time = document.createElement('time'), text = document.createElement('span'); time.textContent = e.at.slice(11,19); time.dateTime = e.at; text.textContent = e.text; li.append(time,text); $('events').append(li); }
  }
}
function modeChanged(mode) {
  if (!Object.hasOwn(MODES, mode) || lab.busy) return;
  if (currentMode !== 'ship') prompts[currentMode] = $('prompt').value;
  currentMode = mode; lab.configure({mode}); save();
  const info = MODES[mode];
  $('mode-kicker').textContent = `WORKFLOW ${info.number}`; $('mode-title').textContent = info.title;
  $('mode-description').textContent = info.description; $('prompt-workspace').hidden = mode === 'ship'; $('ship-workspace').hidden = mode !== 'ship';
  $('sample').textContent = mode === 'ship' ? 'Reset ship ↺' : 'Load example ↺';
  if (mode !== 'ship') { $('prompt-label').textContent = info.label; $('prompt').maxLength = info.limit; $('prompt').value = prompts[mode]; $('input-hint').textContent = info.hint; updateCount(); }
  render(lab.snapshot());
}
function updateCount() { const limit = MODES[currentMode].limit || 4000; $('char-count').textContent = `${$('prompt').value.length.toLocaleString('en-GB')} / ${limit.toLocaleString('en-GB')}`; }
function runAction(fn) {
  try {
    const task = fn();
    // Admission and disabled controls are visible before another click; tokens
    // still use animation-frame batching. Fast deterministic runs show output now.
    render(lab.snapshot());
    Promise.resolve(task).catch(e => { lab.fail(e); render(lab.snapshot()); });
  } catch (e) { lab.fail(e); render(lab.snapshot()); }
}
function shipFacts() { return {engines:$('ship-engines').checked,shields:$('ship-shields').checked,hull:Number($('ship-hull').value),shield:Number($('ship-shield').value),cruisers:Number($('ship-cruisers').value),fighters:Number($('ship-fighters').value),wing:$('ship-wing').checked}; }
function run() {
  if (lab.busy) return;
  if (currentMode === 'ship') runAction(() => lab.startShip('status', shipFacts()));
  else runAction(() => lab.start({mode: currentMode, input: $('prompt').value, system: lab.settings.customSystem}));
}
function resetShip() { for (const id of ['ship-engines','ship-shields','ship-wing']) $(id).checked = true; $('ship-hull').value=100; $('ship-shield').value=100; $('ship-cruisers').value=9; $('ship-fighters').value=10; }
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => modeChanged(button.dataset.mode));
$('run').addEventListener('click', run);
$('prepare-text').addEventListener('click', () => runAction(() => lab.prepareText()));
$('enable-voice').addEventListener('click', () => runAction(() => lab.enableVoice()));
$('check').addEventListener('click', () => runAction(() => lab.check()));
$('studio').addEventListener('click', () => runAction(() => bridge.openStudio()));
$('stop-text').addEventListener('click', () => lab.stopText()); $('stop-voice').addEventListener('click', () => lab.stopVoice()); $('stop-all').addEventListener('click', () => lab.stopAll());
$('clear').addEventListener('click', () => lab.clear());
$('read-output').addEventListener('click', () => {
  const text = spokenText(lab.output, true).trim();
  if (text.length > 1200) { lab.error = {code:'Reply exceeds read-back limit',help:'Copy an excerpt of up to 1,200 characters into Text → voice.'}; lab.message = lab.error.help; lab.notify(); return; }
  runAction(() => lab.start({mode:'speak',input:text}));
});
$('sample').addEventListener('click', () => { if (currentMode === 'ship') resetShip(); else { $('prompt').value = MODES[currentMode].sample; prompts[currentMode] = $('prompt').value; updateCount(); } });
$('prompt').addEventListener('input', updateCount);
$('prompt').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
for (const input of document.querySelectorAll('[data-setting]')) input.addEventListener('change', () => {
  lab.configure({[input.dataset.setting]:input.type === 'checkbox' ? input.checked : input.type === 'number' || input.type === 'range' ? Number(input.value) : input.value}); save();
});
for (const input of document.querySelectorAll('input[type=range][data-setting], #system')) input.addEventListener('input', () => {
  const key = input.id === 'system' ? 'customSystem' : input.dataset.setting;
  const value = input.type === 'range' ? Number(input.value) : input.value;
  lab.configure({[key]: value}); save();
});
for (const radio of document.querySelectorAll('[name=delivery]')) radio.addEventListener('change', () => { if (radio.checked) { lab.configure({delivery:radio.value}); save(); } });
$('reset-settings').addEventListener('click', () => { lab.settings = {...DEFAULTS,mode:currentMode}; save(); lab.notify(); });
for (const button of document.querySelectorAll('[data-ship-event]')) button.addEventListener('click', () => {
  if (lab.busy) return;
  const event = button.dataset.shipEvent;
  if (event === 'engine') $('ship-engines').checked = !$('ship-engines').checked;
  if (event === 'shield') $('ship-shields').checked = !$('ship-shields').checked;
  if (event === 'critical') $('ship-hull').value = 10;
  runAction(() => lab.startShip(event, shipFacts()));
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(lab.output); $('copy').textContent = 'Copied'; }
  catch { const t = document.createElement('textarea'); t.value = lab.output; t.style.position='fixed'; t.style.left='-10000px'; document.body.append(t); t.select(); const copied=document.execCommand('copy'); t.remove(); $('copy').textContent=copied?'Copied':'Select output to copy'; }
  setTimeout(() => { if (!disposed) $('copy').textContent = 'Copy'; }, 1800);
});
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(lab.report($('include-text').checked), null, 2)],{type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `voice-lab-${new Date().toISOString().replaceAll(':','-')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (const id of ['setup','preview-setup']) $(id).addEventListener('click', () => $('setup-dialog').showModal());
for (const id of ['close-setup','done-setup']) $(id).addEventListener('click', () => $('setup-dialog').close());
const startingMode = currentMode; currentMode = 'ship'; modeChanged(startingMode);
let ticks = 0;
const presenceTimer = setInterval(() => { if (disposed || ++ticks > 30 || (bridge.available().voice && bridge.available().text)) clearInterval(presenceTimer); scheduleRender(); }, 1000);
const metricTimer = setInterval(() => { if (lab.busy) scheduleRender(); }, 180);
const onLocalReady = () => { if (!disposed && !lab.busy) runAction(() => lab.check()); };
window.addEventListener('capp:local-ai-ready', onLocalReady);
window.addEventListener('pagehide', () => { window.removeEventListener('capp:local-ai-ready', onLocalReady); disposed = true; clearInterval(presenceTimer); clearInterval(metricTimer); cancelAnimationFrame(raf); lab.dispose(); }, {once:true});
