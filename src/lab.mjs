/** Voice Lab: bounded independent text/speech operations. Runtime-agnostic logic. */
export const LAB_VERSION = '1.11.1';
export const VOICES = Object.freeze({bm_george: 'George · British', bf_emma: 'Emma · British', af_heart: 'Heart · American', af_sarah: 'Sarah · American', am_michael: 'Michael · American'});
export const DEFAULTS = Object.freeze({mode: 'together', delivery: 'stream', voice: 'bm_george', speed: 1, volume: 0.65, maxTokens: 36000, temperature: 0.3, style: 'concise', customSystem: '', timeout: 900, shipVoice: true, shipLlm: false, shipPhrasing: 'narrate'});
export const STYLES = Object.freeze({
  concise: 'You are a helpful, concise assistant. Reply in two or three short sentences of plain English. No markdown, code, reasoning tags or hidden analysis. Answer the user directly.',
  friendly: 'You are a friendly explainer. Give a short, clear explanation in three plain English sentences. No markdown, code or reasoning preamble.',
  ship: 'You are a fictional ship computer. Be calm and brief. This is a text playground, not real telemetry. Do not claim to operate machinery. Use plain spoken English without markdown or reasoning tags.',
});
const boundedNumber = (x, lo, hi, fallback) => typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : fallback;
export function cleanSettings(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const d = DEFAULTS;
  return {
    mode: ['speak','text','together','ship'].includes(input.mode) ? input.mode : d.mode,
    delivery: ['stream','complete'].includes(input.delivery) ? input.delivery : d.delivery,
    voice: Object.hasOwn(VOICES, input.voice) ? input.voice : d.voice,
    speed: boundedNumber(input.speed, .75, 1.25, d.speed), volume: boundedNumber(input.volume, 0, 1, d.volume),
    maxTokens: Math.round(boundedNumber(input.maxTokens, 16, 65536, d.maxTokens)),
    temperature: boundedNumber(input.temperature, 0, 1.5, d.temperature),
    style: Object.hasOwn(STYLES, input.style) ? input.style : d.style,
    customSystem: typeof input.customSystem === 'string' ? input.customSystem.slice(0, 1200) : d.customSystem,
    timeout: Math.round(boundedNumber(input.timeout, 15, 900, d.timeout)),
    shipVoice: typeof input.shipVoice === 'boolean' ? input.shipVoice : d.shipVoice,
    shipLlm: typeof input.shipLlm === 'boolean' ? input.shipLlm : d.shipLlm,
    shipPhrasing: ['narrate','selector'].includes(input.shipPhrasing) ? input.shipPhrasing : d.shipPhrasing,
  };
}
export function friendlyError(error) {
  const code = String(error?.message ?? error ?? 'Unknown error').replace(/https?:\/\/\S+/gi, '[endpoint]').replace(/[a-z]:\\[^\n]+/gi, '[local path]').slice(0, 240);
  let help = 'Open Local AI Studio, inspect the engine status and retry when the current request settles.';
  if (/lab_app_bridge_unavailable/.test(code)) help = 'This is a packaged application, but its scoped Local AI bridge is unavailable. Repackage with the updated cApp factory (Local AI 0.11.5+) and install the update. Keep your existing GGUF and app data.';
  else if (/lab_sidecar_not_selected/.test(code)) help = 'Local AI is not selected in this installed package. Select it and create a new Windows package; a Library selection alone does not update an installed binary.';
  else if (/local_ai_app_surface_closed|local_ai_app_connection_closed/.test(code)) help = 'This application document was replaced. Reload this app to open new scoped connections; other clients keep their own models.';
  else if (/lab_(sidecar|text|voice)_missing/.test(code)) help = 'Create a cApp Windows app with Local AI 0.10.1+ selected. An ordinary browser has no native model or voice engine.';
  else if (/provider_changed/.test(code)) help = 'The Local AI provider changed. Stop the lab and reload this application before reconnecting.';
  else if (/speech_platform_unsupported|unsupported.*platform|tauri_invoke/.test(code)) help = 'Managed neural speech needs the updated Windows x64 package, not a browser preview or the current Android speech path.';
  else if (/model_required|model_not_loaded|baseline.*(missing|disabled)|not configured|No .*model/i.test(code)) help = 'Use Local AI Studio to choose/download a small GGUF, then click Prepare text. Speech can be tested without it.';
  else if (/speech_disabled|access_denied|connection_disabled|inference_disabled/.test(code)) help = 'Enable scoped app inference/speech in the Local AI package and allow speech in Studio. Do not change system Python.';
  else if (/speech_auto|auto_prepare|automatic.*disabled/i.test(code)) help = 'Automatic voice preparation is disabled for this package. Use Prepare / retry in Local AI Studio or enable it in the build.';
  else if (/busy/.test(code)) help = 'Another request owns that engine. Wait for it to settle; opening more clients will not create another engine.';
  else if (/gesture|suspended/.test(code)) help = 'Click Enable voice again to resume audio in this window. No cloud or browser voice fallback is used.';
  else if (/cancel/.test(code)) help = 'Stop was requested. The original operation retains its slot until it settles.';
  else if (/speech_word_limit/.test(code)) help = 'Speech cannot accept an unbroken word longer than 200 characters. Shorten that token or generate text only.';
  else if (/speech_text_limit|lab_input/.test(code)) help = 'Enter 1–1,200 characters for speech, or 1–4,000 characters for a prompt.';
  else if (/audio|decode/i.test(code)) help = 'The speech request did not complete valid audio playback. Check Studio and the device audio output.';
  return {code, help};
}
/** Audio-only cleanup; the unmodified generated text remains visible. Hold an
 * unfinished tag/fence instead of reading a model's thinking/code aloud. */
export function spokenText(raw, final = true) {
  let out = '', i = 0, mode = '';
  raw = String(raw ?? '');
  while (i < raw.length) {
    if (mode) {
      const marker = mode === 'code' ? '```' : `</${mode}>`;
      const at = raw.toLowerCase().indexOf(marker, i);
      if (at < 0) break;
      i = at + marker.length; mode = ''; continue;
    }
    if (raw.startsWith('```', i)) { mode = 'code'; i += 3; continue; }
    if (!final && /^`{1,2}$/.test(raw.slice(i))) break;
    if (raw[i] === '<') {
      const end = raw.indexOf('>', i);
      if (end < 0) { if (!final) break; i++; continue; }
      const tag = raw.slice(i + 1, end).trim().toLowerCase();
      if (tag === 'think' || tag === 'analysis') mode = tag;
      i = end + 1; continue;
    }
    out += raw[i++];
  }
  return out.normalize('NFKC').replace(/[\u2018\u2019\u201a\u201b]/g, "'").replace(/[\u201c\u201d\u201e\u201f]/g, '"').replace(/[\u2013\u2212]/g,'-').replace(/\u2014/g,' - ').replace(/\u2026/g,'...').replace(/\^/g,' ').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/[*`#_~|<>\[\]{}]/g, ' ').replace(/^\s*["“”]+|["“”]+\s*$/g,'').replace(/\s+/g, ' ').trim();
}
export class SentenceChunker {
  constructor() { this.consumed = 0; this.prefix = ''; this.mismatch = false; }
  take(text, final = false) {
    if (!text.startsWith(this.prefix)) { this.mismatch = true; return []; }
    const chunks = [];
    while (this.consumed < text.length) {
      const tail = text.slice(this.consumed);
      let cut = 0;
      // Enough phrase context for short announcements, bounded latency on prose.
      for (let n = 0; n < Math.min(tail.length, 200); n++) {
        if (/[.!?]/.test(tail[n]) && n >= 28 && (n + 1 < tail.length ? /\s/.test(tail[n+1]) : final)) { cut = n + 1; break; }
      }
      if (!cut && tail.length > 200) { cut = tail.lastIndexOf(' ', 200); if (cut < 1) throw new Error('speech_word_limit'); }
      if (!cut && final) cut = tail.length;
      if (!cut) break;
      const part = tail.slice(0, cut).trim();
      if (part && part.split(/\s+/).some(w => w.length > 200)) throw new Error('speech_word_limit');
      this.consumed += cut;
      while (/\s/.test(text[this.consumed] || '') && this.consumed < text.length) this.consumed++;
      if (part) chunks.push(part);
    }
    this.prefix = text.slice(0, this.consumed);
    return chunks;
  }
}
export function shipLine(event = 'status', raw = {}) {
  const hull = Math.round(boundedNumber(raw.hull, 0, 100, 100)), shield = Math.round(boundedNumber(raw.shield, 0, 100, 100));
  const fighters = Math.round(boundedNumber(raw.fighters, 0, 99, 10)), cruisers = Math.round(boundedNumber(raw.cruisers, 0, 99, 9));
  const engines = raw.engines !== false, shields = raw.shields !== false;
  const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  let candidates;
  if (event === 'engine') candidates = [engines ? 'Engine on.' : 'Engine off. Momentum is preserved.'];
  else if (event === 'shield') candidates = [shields ? 'Shields active.' : 'Shields offline.'];
  else if (event === 'critical') candidates = [`Warning. Hull integrity at ${hull} percent.`];
  else if (event === 'fleet') {
    const total = fighters + cruisers;
    const fleet = [cruisers ? count(cruisers,'cruiser') : '', fighters ? count(fighters,'fighter') : ''].filter(Boolean).join(' and ');
    const wing = raw.wing === true && fighters > 0 ? ' The fighters include one identified wing.' : '';
    candidates = total ? [`Enemy fleet: ${fleet}. ${total} hostile ships in total.${wing}`, `${total} hostile ships detected: ${fleet}.${wing}`] : ['No hostile ships in this simulated snapshot.'];
  } else {
    const e = engines ? 'Engine on.' : 'Engine off.';
    const s = shields ? `Shields at ${shield} percent.` : 'Shield generator offline.';
    const h = `Hull integrity at ${hull} percent.`;
    candidates = [`${e} ${s} ${h}`, `${h} ${s} ${e}`];
  }
  return {candidates, critical: event === 'critical', event};
}
export function shipNarrationPrompt(event = 'status', raw = {}, line = shipLine(event, raw)) {
  const hull = Math.round(boundedNumber(raw.hull, 0, 100, 100));
  const shield = Math.round(boundedNumber(raw.shield, 0, 100, 100));
  const fighters = Math.round(boundedNumber(raw.fighters, 0, 99, 10));
  const cruisers = Math.round(boundedNumber(raw.cruisers, 0, 99, 9));
  const total = fighters + cruisers;
  return [
    'Write one short spoken ship-computer announcement for this simulated event.',
    'Use ONLY the facts below. Do not invent or infer systems, damage, locations, causes, weapons, contacts, actions, or values.',
    `Event: ${line.event}.`,
    `Engine: ${raw.engines === false ? 'offline' : 'online'}.`,
    `Shield generator: ${raw.shields === false ? 'offline' : 'active'}.`,
    `Shield charge: ${shield} percent.`,
    `Hull integrity: ${hull} percent.`,
    `Observed hostile cruisers: ${cruisers}.`,
    `Observed hostile fighters: ${fighters}.`,
    `Observed hostile total: ${total}.`,
    `Identified fighter wing: ${raw.wing === true && fighters > 0 ? 'yes, already included in the fighter count' : 'no'}.`,
    `Deterministic reference meaning: ${line.candidates[0]}`,
    'Return only the announcement text. No markdown, labels, analysis, or invented telemetry.'
  ].join('\n');
}
export function shipNarrationSystem(settings = {}) {
  const style = STYLES[settings.style] || STYLES.ship;
  const custom = String(settings.customSystem || '').trim();
  const base = custom || style;
  return `${base}\n\nFACTUAL BOUNDARY: This is simulated telemetry. Follow the user-provided fact block exactly. Do not add facts that are not explicitly present.`;
}
const settleCall = async fn => { try { return await fn(); } catch { return null; } };
export class VoiceLab {
  constructor(bridge, {now = () => performance.now(), onChange = () => {}} = {}) {
    this.bridge = bridge; this.now = now; this.onChange = onChange;
    this.settings = {...DEFAULTS}; this.sequence = 0; this.run = null;
    this.textJob = null; this.voiceJob = null; this.textPreparation = null; this.voicePreparation = null;
    this.queue = []; this.armed = false; this.closed = false; this.checking = false;
    this.textState = 'Not checked'; this.voiceState = 'Not enabled'; this.textModel = '';
    this.message = 'Choose a mode. Check the engines, or run a short test.';
    this.error = null; this.events = []; this.preparation = {}; this.output = ''; this.spoken = ''; this.lastResult = null;
    this.bridge.onProgress = p => { if (this.voicePreparation && !this.closed) { this.preparation = this.safeProgress(p); this.notify(); } };
  }
  safeProgress(p = {}) { return {phase: String(p.phase || 'checking').slice(0, 48), asset: String(p.asset || '').slice(0, 160), bytes: Math.max(0, Number(p.bytes) || 0), totalBytes: Math.max(0, Number(p.totalBytes) || 0), fileIndex: Number(p.fileIndex) || 0, fileCount: Number(p.fileCount) || 0}; }
  get busy() { return !!(this.textJob || this.voiceJob || this.textPreparation || this.voicePreparation || this.queue.length || this.run?.running); }
  snapshot() {
    const r = this.run;
    const overlap = r ? r.overlapMs + (r.overlapAt == null ? 0 : this.now() - r.overlapAt) : 0;
    return {settings: {...this.settings}, available: this.bridge.available(), context: this.bridge.contextInfo?.() || {installed:false}, busy: this.busy, checking: this.checking,
      textBusy: !!(this.textJob || this.textPreparation), voiceBusy: !!(this.voiceJob || this.voicePreparation),
      textPreparing: !!this.textPreparation, voicePreparing: !!this.voicePreparation, armed: this.armed,
      textState: this.textState, voiceState: this.voiceState, textModel: this.textModel,
      message: this.message, error: this.error ? {...this.error} : null, output: this.output, spoken: this.spoken,
      preparation: {...this.preparation}, queued: this.queue.length, events: [...this.events],
      active: r?.running === true, id: r?.id || 0, mode: r?.mode, stopped: !!r?.cancelled,
      metrics: {firstTokenMs: r?.firstTokenMs ?? null, firstAudioMs: r?.firstAudioMs ?? null, elapsedMs: r ? (r.finishedAt ?? this.now()) - r.started : 0, overlapMs: overlap, speechRequests: r?.speechRequests || 0, played: r?.played || 0},
      lastResult: this.lastResult ? {...this.lastResult} : null};
  }
  notify() {
    const r = this.run;
    if (r) {
      const overlap = !!(this.textJob && !this.textJob.settled && this.voiceJob?.playing);
      if (overlap && r.overlapAt == null) r.overlapAt = this.now();
      if (!overlap && r.overlapAt != null) { r.overlapMs += this.now() - r.overlapAt; r.overlapAt = null; }
    }
    if (!this.closed) this.onChange(this.snapshot());
  }
  log(kind, text) {
    this.events.unshift({at: new Date().toISOString(), kind, text: String(text).slice(0, 280)});
    this.events = this.events.slice(0, 40); this.notify();
  }
  fail(e, topic = 'Operation') {
    this.error = friendlyError(e); this.message = `${topic} unavailable. ${this.error.help}`;
    this.log('error', `${topic}: ${this.error.code}`);
  }
  configure(patch) { this.settings = cleanSettings({...this.settings, ...patch}); this.notify(); }
  async check() {
    if (this.closed || this.checking) return;
    this.checking = true; this.error = null; this.notify();
    this.bridge.retryConnection?.();
    const cap = this.bridge.available();
    try {
      const [t,v] = await Promise.all([
        cap.text ? this.bridge.textStatus().catch(e => ({error: e.message})) : null,
        cap.voice ? this.bridge.voiceStatus().catch(e => ({error: e.message})) : null,
      ]);
      if (t) {
        this.textModel = t.currentModelId ? String(t.currentModelId).slice(0, 180) : '';
        if (!this.textJob && !this.textPreparation) this.textState = t.error ? 'Unavailable' : t.generating ? 'Engine busy' : this.textModel ? 'Model loaded' : 'Choose a GGUF in Studio';
      } else this.textState = 'Sidecar not found';
      if (!this.voiceJob && !this.voicePreparation) this.voiceState = !v ? 'Voice API not found' : v.supported === false ? 'Platform unavailable' : v.allowed === false || v.enabled === false ? 'Disabled in Local AI' : v.busy ? 'Engine busy' : v.loaded ? (this.armed ? 'Ready to speak' : 'Click Enable voice') : v.prepared ? 'Installed; enable to load' : 'First use prepares voice';
      if (!cap.text && !cap.voice) this.fail(this.bridge.missingError?.() || new Error('lab_sidecar_missing'), 'Local AI');
      else if (t?.error || v?.error) this.fail(new Error(t?.error || v?.error), 'Status');
      else this.message = 'Status checked. No model downloads were requested by this check.';
      this.log('check', 'Passive text / voice status check');
    } finally { this.checking = false; this.notify(); }
  }
  prepareText() {
    if (this.closed || this.textJob || this.textPreparation) return Promise.resolve(false);
    const job = {cancelled: false}; this.textPreparation = job; this.textState = 'Preparing selected GGUF'; this.error = null; this.notify();
    let request;
    try { request = this.bridge.prepareText(); } catch (e) { request = Promise.reject(e); }
    return Promise.resolve(request).then(async result => {
      if (result?.ok === false) throw new Error(result.error || 'lab_text_prepare_failed');
      const state = await this.bridge.textStatus();
      if (!state?.currentModelId) throw new Error('local_ai_model_not_loaded');
      this.textModel = String(state.currentModelId).slice(0, 180);
      this.textState = job.cancelled ? 'Preparation settled' : 'Model loaded';
      this.message = job.cancelled ? 'Text preparation settled after Stop.' : 'Text model ready. Voice remains a separate engine.';
      this.log('ready', 'Selected GGUF reported loaded'); return !job.cancelled;
    }).catch(e => { this.textState = 'Text not ready'; if (!job.cancelled) this.fail(e, 'Text preparation'); return false; })
    .finally(() => { if (this.textPreparation === job) this.textPreparation = null; this.tryFinish(); this.notify(); });
  }
  enableVoice() {
    if (this.closed) return Promise.resolve(false);
    if (this.voicePreparation) return this.voicePreparation.promise;
    if (this.voiceJob) return Promise.resolve(this.armed);
    const job = {cancelled: false}; this.voicePreparation = job; this.armed = false;
    this.voiceState = 'Preparing / arming audio'; this.preparation = {phase: 'starting'}; this.error = null; this.notify();
    let request;
    // Must occur synchronously in the click handler BEFORE another awaited call.
    try { request = this.bridge.activateVoice(); } catch (e) { request = Promise.reject(e); }
    let done = false, timer;
    const poll = async () => {
      if (done || this.closed) return;
      try { const s = await this.bridge.voiceStatus(); if (!done && s?.progress) { this.preparation = this.safeProgress(s.progress); this.notify(); } } catch {}
      if (!done && !this.closed) timer = setTimeout(poll, 650);
    };
    timer = setTimeout(poll, 650);
    job.promise = Promise.resolve(request).then(async () => {
      const s = await this.bridge.voiceStatus();
      if (s?.supported === false || s?.allowed === false || s?.enabled === false || !s?.prepared || !s?.loaded) throw new Error(s?.error || 'speech_preparation_unconfirmed');
      this.armed = !job.cancelled && !this.closed;
      this.voiceState = this.armed ? 'Ready to speak' : 'Stopped';
      if (this.armed) { if (!this.error) this.message = 'Local voice ready. Nothing is sent to a cloud voice service.'; this.log('ready', 'Voice loaded; playback armed by gesture'); }
      return this.armed;
    }).catch(e => { this.voiceState = 'Voice not ready'; this.armed = false; if (!job.cancelled) this.fail(e, 'Voice preparation'); if (this.run?.running) { this.run.speechWanted = false; this.queue = []; } return false; })
    .finally(() => { done = true; clearTimeout(timer); if (this.voicePreparation === job) this.voicePreparation = null; this.pump(); this.tryFinish(); this.notify(); });
    return job.promise;
  }
  newRun(mode, speechWanted) {
    if (this.closed) throw new Error('lab_closed');
    if (this.busy) throw new Error('lab_busy');
    const run = {id: ++this.sequence, mode, settings: {...this.settings}, started: this.now(), running: true,
      cancelled: false, textStopped: false, voiceStopped: false, speechWanted, voiceFailed: false,
      textDone: true, finishedAt: null, firstTokenMs: null, firstAudioMs: null, overlapMs: 0, overlapAt: null,
      enqueuedChars: 0, speechRequests: 0, played: 0, clipped: false, chunker: new SentenceChunker()};
    run.promise = new Promise(resolve => { run.resolve = resolve; });
    this.run = run; this.output = ''; this.spoken = ''; this.lastResult = null; this.error = null; this.queue = [];
    this.message = 'Starting test…'; this.log('run', `Test ${run.id} · ${mode}`); return run;
  }
  start({mode = this.settings.mode, input = '', system = ''} = {}) {
    if (!['speak','text','together'].includes(mode)) return Promise.reject(new Error('lab_mode_invalid'));
    if (typeof input !== 'string' || !input.trim() || input.length > (mode === 'speak' ? 1200 : 4000)) return Promise.reject(new Error('lab_input_limit'));
    if (typeof system !== 'string' || system.length > 1200) return Promise.reject(new Error('lab_system_limit'));
    if (mode === 'speak' && (/[^\S\r\n]*[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input) || input.split(/\s+/).some(w => w.length > 200))) return Promise.reject(new Error('speech_word_limit'));
    let run;
    try { run = this.newRun(mode, mode !== 'text' && this.settings.volume > 0); } catch (e) { return Promise.reject(e); }
    run.textDone = mode === 'speak';
    // First-use voice and text preparation may proceed independently.
    if (run.speechWanted) void this.enableVoice();
    if (mode === 'speak') {
      this.output = input.trim();
      if (run.speechWanted) this.queueText(this.output, true, run);
      else this.message = 'Volume is zero. Text displayed; no synthesis requested.';
    } else this.generate(run, input, system || run.settings.customSystem || STYLES[run.settings.style]);
    this.pump(); this.tryFinish(); this.notify(); return run.promise;
  }
  startShip(event, facts) {
    let run; try { run = this.newRun('ship', this.settings.shipVoice && this.settings.volume > 0); } catch (e) { return Promise.reject(e); }
    const line = shipLine(event, facts); run.ship = line;
    const useModel = run.settings.shipLlm && !line.critical && (run.settings.shipPhrasing === 'narrate' || line.candidates.length > 1);
    run.textDone = !useModel;
    if (run.speechWanted) void this.enableVoice();
    if (useModel && run.settings.shipPhrasing === 'selector') {
      const prompt = `Select one equivalent factual sentence. Reply ONLY 0 or 1. Do not add words.\n0: ${line.candidates[0]}\n1: ${line.candidates[1] || line.candidates[0]}`;
      this.generate(run, prompt, 'Return only the single digit 0 or 1.', true);
    } else if (useModel) {
      const prompt = shipNarrationPrompt(event, facts, line);
      this.generate(run, prompt, shipNarrationSystem(run.settings), false);
      this.log('narrator', `Ship narrator uses ${run.settings.customSystem ? 'custom system instruction' : run.settings.style + ' response style'} · ${run.settings.maxTokens} tokens · temperature ${run.settings.temperature}`);
    } else {
      this.output = line.candidates[0]; this.message = line.critical ? 'Critical test: deterministic line. The LLM is bypassed.' : 'Simulated event: deterministic announcement.';
      this.queueText(this.output, true, run);
    }
    this.pump(); this.tryFinish(); this.notify(); return run.promise;
  }
  generate(run, prompt, system, selector = false) {
    const job = {run, cancelled: false, raw: '', selector}; this.textJob = job; this.textState = selector ? 'Choosing factual phrase' : 'Generating'; this.notify();
    const timeout = setTimeout(() => {
      job.cancelled = true; run.textStopped = true; this.textState = 'Timed out; waiting for settlement';
      this.log('stop', 'Text deadline reached; own cancellation requested; slot remains held');
      void settleCall(() => this.bridge.cancelText()); this.notify();
    }, (selector ? 15 : run.settings.timeout) * 1000);
    let flight;
    try {
      flight = this.bridge.complete({prompt, system, maxTokens: selector ? 3 : run.settings.maxTokens, maxInputTokens: 2048,
        temperature: selector ? 0 : run.settings.temperature, isolated: true,
        onToken: token => {
          if (job.cancelled || run.cancelled || this.closed || this.run !== run) return;
          if (run.firstTokenMs == null) run.firstTokenMs = this.now() - run.started;
          job.raw += String(token);
          if (job.raw.length > 12000) { job.raw = job.raw.slice(0,12000); job.cancelled = true; run.textStopped = true; this.log('limit', 'Output character budget reached; cancelling owned text'); void settleCall(() => this.bridge.cancelText()); }
          if (!selector) {
            this.output = job.raw;
            if (run.settings.delivery === 'stream' && run.mode === 'together') this.queueText(job.raw, false, run);
          }
          this.notify();
        }});
    } catch (e) { flight = Promise.reject(e); }
    Promise.resolve(flight).then(result => {
      job.settled = true; this.notify();
      if (this.closed || run.cancelled || this.run !== run) return;
      if (result?.ok === false) throw new Error(result.error || 'lab_text_failed');
      const final = typeof result?.output === 'string' ? result.output : job.raw;
      if (selector) {
        const id = !job.cancelled && /^[01]$/.test(final.trim()) ? Number(final.trim()) : 0;
        this.output = run.ship.candidates[id];
        this.log('phrase', id === 1 ? 'Approved factual alternative selected' : 'Approved default phrase selected / fallback');
        this.queueText(this.output, true, run);
      } else if (!job.cancelled) {
        this.output = final.slice(0, 12000);
        if (!this.output.trim()) throw new Error('lab_empty_response');
        if (run.mode === 'ship') {
          // Ship narrator speaks the completed bounded announcement. It never
          // streams partial telemetry wording before the model settles.
          this.queueText(this.output, true, run);
        } else if (run.mode === 'together') {
          if (run.settings.delivery === 'stream' && job.raw && final !== job.raw) {
            // Never replay or revise already spoken tokens after the final differs.
            this.queueText(job.raw, true, run);
            this.log('notice', 'Final output differed from streamed text. Audio uses only the stream; final text is shown.');
          } else this.queueText(this.output, true, run);
        }
      }
      this.textState = job.cancelled ? 'Stopped' : 'Reply received';
    }).catch(e => {
      job.settled = true; this.notify();
      if (!run.cancelled && !this.closed) {
        if (selector) { this.output = run.ship.candidates[0]; this.queueText(this.output, true, run); this.log('fallback', 'Text unavailable: deterministic simulated status used'); }
        else if (!job.cancelled) this.fail(e, 'Text generation');
      }
      this.textState = job.cancelled ? 'Stopped' : 'Text failed';
    }).finally(() => {
      clearTimeout(timeout); run.textDone = true;
      if (this.textJob === job) this.textJob = null;
      this.pump(); this.tryFinish(); this.notify();
    });
  }
  queueText(raw, final, run) {
    if (!run.speechWanted || run.cancelled || run.voiceStopped || this.closed) return;
    try {
      const visible = spokenText(raw, final);
      for (const text of run.chunker.take(visible, final)) {
        if (this.queue.length >= 12 || run.enqueuedChars + text.length > 1800) {
          if (!run.clipped) this.log('limit', 'Speech capped at 1,800 characters / 12 queued chunks. Remaining text stays on screen.');
          run.clipped = true; continue;
        }
        if (run.clipped) continue;
        this.queue.push({text, run}); run.enqueuedChars += text.length;
      }
      if (run.chunker.mismatch) this.log('notice', 'A text revision was not replayed to speech.');
      this.pump();
    } catch (e) { run.speechWanted = false; this.queue = []; this.fail(e, 'Speech text'); }
  }
  pump() {
    if (this.closed || this.voiceJob || this.voicePreparation || !this.armed) return;
    this.queue = this.queue.filter(x => x.run === this.run && !x.run.cancelled && !x.run.voiceStopped && x.run.speechWanted);
    const entry = this.queue.shift(); if (!entry) { this.tryFinish(); return; }
    const {run,text} = entry, job = {run, cancelled: false, playing: false};
    this.voiceJob = job; this.voiceState = 'Synthesizing'; run.speechRequests++; this.notify();
    let request;
    try {
      request = this.bridge.speak({text, voice: run.settings.voice, speed: run.settings.speed, volume: run.settings.volume,
        onStart: () => { if (job.cancelled || run.cancelled || this.closed) return; job.playing = true; this.voiceState = 'Playing'; if (run.firstAudioMs == null) run.firstAudioMs = this.now() - run.started; this.notify(); },
        onSegment: p => { if (!job.cancelled && !this.closed) { this.spoken = String(p.text || text); this.notify(); } }});
    } catch (e) { request = Promise.reject(e); }
    Promise.resolve(request).then(result => {
      if (result?.ok !== true && !job.cancelled) throw new Error(result?.error || 'speech_playback_unconfirmed');
      if (!job.cancelled && !run.cancelled) { run.played++; this.lastResult = {voice: result.voice, provider: result.provider, firstAudioMs: result.firstAudioMs, synthesisMs: result.synthesisMs}; }
      this.voiceState = job.cancelled ? 'Stopped' : 'Ready to speak';
    }).catch(e => {
      if (!job.cancelled && !run.cancelled && !this.closed) { run.voiceFailed = true; run.speechWanted = false; this.queue = []; this.fail(e, 'Speech'); this.voiceState = 'Speech failed'; }
    }).finally(() => {
      if (this.voiceJob === job) this.voiceJob = null;
      this.notify(); this.pump(); this.tryFinish();
    });
  }
  tryFinish() {
    const r = this.run;
    if (!r?.running || !r.textDone || this.textJob || this.voiceJob || this.voicePreparation || this.textPreparation || this.queue.length) return;
    r.running = false; r.finishedAt = this.now();
    if (!this.error) this.message = r.cancelled ? 'Stopped. In-flight work has settled; text is preserved.' : r.textStopped || r.voiceStopped ? 'Test settled after Stop. Output is preserved.' : r.clipped ? 'Test complete. Speech was bounded; full output is shown.' : r.speechWanted && !r.speechRequests ? 'Text is shown, but no speakable text remained after removing reasoning tags or code.' : r.settings.volume === 0 && r.mode !== 'text' ? 'Text is shown. Volume is zero; no speech was synthesized.' : 'Test complete. You can change settings and run again.';
    this.log('complete', `Test ${r.id} settled · ${r.played} speech chunks finished`); r.resolve(this.snapshot());
  }
  stopText() {
    const job = this.textJob, prep = this.textPreparation;
    if (!job && !prep) return;
    if (job) { job.cancelled = true; job.run.textStopped = true; }
    if (prep) prep.cancelled = true;
    this.textState = 'Stopping; waiting for settlement';
    this.log('stop', 'Text Stop requested. Queued speech may finish. Model preparation may need to settle.');
    void settleCall(() => this.bridge.cancelText()); this.notify();
  }
  stopVoice() {
    if (this.run?.running) { this.run.voiceStopped = true; this.run.speechWanted = false; }
    this.queue = [];
    if (this.voiceJob) this.voiceJob.cancelled = true;
    if (this.voicePreparation) { this.voicePreparation.cancelled = true; this.armed = false; }
    this.voiceState = this.voiceJob || this.voicePreparation ? 'Stopping; waiting for settlement' : 'Stopped';
    this.log('stop', 'Voice Stop requested. No new speech will be queued in this test; text may continue.');
    void settleCall(() => this.bridge.cancelVoice()); this.tryFinish(); this.notify();
  }
  stopAll() { if (this.run?.running) this.run.cancelled = true; this.stopText(); this.stopVoice(); this.tryFinish(); }
  clear() {
    if (this.busy) return;
    this.run = null; this.output = ''; this.spoken = ''; this.events = []; this.error = null; this.lastResult = null;
    this.message = 'Session output cleared. Model files and engine state are untouched.'; this.notify();
  }
  report(includeText = false) {
    const s = this.snapshot();
    const settings = {...s.settings, customSystem: s.settings.customSystem ? (includeText ? s.settings.customSystem : '[configured]') : ''};
    return {protocol:'capp.voice-lab.report.v1', version: LAB_VERSION, exportedAt: new Date().toISOString(),
      scope:'Application callbacks, not hardware or neural-inference attestation', settings,
      state:{text:s.textState,voice:s.voiceState,armed:s.armed,queued:s.queued}, metrics:s.metrics,
      lastSpeech:s.lastResult, error:s.error, events:s.events,
      ...(includeText ? {output:s.output, spoken:s.spoken} : {})};
  }
  dispose() { this.closed = true; this.stopAll(); this.bridge.dispose(); }
}
