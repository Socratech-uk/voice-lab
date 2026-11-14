/** cApp Local AI 0.11.5 integration. No host shim, HTTP fallback or model loader.
 * Resolve this window's factory-delivered scoped facade; never borrow the owner API.
 * A client protocol is not an app ID. Omit appId to bind to the installed app.
 */
export class CappBridge {
  constructor(scope = globalThis) {
    this.scope = scope;
    this.api = null;
    this.text = null;
    this.voice = null;
    this.dialogue = null;
    this.unsubscribe = null;
    this.onProgress = () => {};
  }
  available() {
    const api = this.scope.capp?.ai?.local;
    return {text: typeof api?.connect === 'function', voice: typeof api?.speech?.connect === 'function'};
  }
  contextInfo() {
    const scope = this.scope, plan = scope.__CAPP_EXECUTABLE_PLAN__;
    const installed = scope.__CAPP_PACKAGED_RUNTIME__ === true || scope.__CAPP_RUNTIME__ === true
      || !!scope.__TAURI_INTERNALS__ || !!scope.__TAURI__ || scope.location?.hostname === 'tauri.localhost';
    return {installed, selected: Array.isArray(plan?.library?.selected) ? plan.library.selected.some(s => s?.id === 'uk.capp.sidecar.local-ai') : null,
      delivery: scope.__CAPP_LOCAL_AI_APP_BRIDGE__?.status || 'direct-or-unavailable'};
  }
  missingError() {
    const context = this.contextInfo();
    return new Error(context.installed ? (context.selected === false ? 'lab_sidecar_not_selected' : 'lab_app_bridge_unavailable') : 'lab_sidecar_missing');
  }
  retryConnection() {
    // Only call the factory-provided hook in THIS document. It admits the current
    // packaged app; this consumer never searches parent/top or exports native IPC.
    this.scope.__CAPP_REFRESH_LOCAL_AI_APP__?.();
  }
  local() {
    this.retryConnection();
    const api = this.scope.capp?.ai?.local;
    if (!api) throw this.missingError();
    // Do not silently swap a provider beneath requests or cross into a parent app.
    if (this.api && this.api !== api) throw new Error('lab_provider_changed');
    this.api = api;
    return api;
  }
  textClient() {
    const api = this.local();
    if (this.text) return this.text;
    if (typeof api.connect !== 'function') throw new Error('lab_text_missing');
    this.text = api.connect({protocol: 'capp.voice-lab.text.v1', clientName: 'Voice Lab · text'});
    return this.text;
  }
  voiceClient() {
    const api = this.local();
    if (this.voice) return this.voice;
    if (typeof api.speech?.connect !== 'function') throw new Error('lab_voice_missing');
    this.voice = api.speech.connect({protocol: 'capp.voice-lab.speech.v1', clientName: 'Voice Lab · speech'});
    this.unsubscribe = api.speech.subscribe?.(progress => this.onProgress(progress));
    return this.voice;
  }
  dialogueClient() {
    const api=this.local();
    if(this.dialogue)return this.dialogue;
    if(typeof api.dialogue?.connect!=='function')throw new Error('Dialogue needs cApp Local AI 0.12.0+ and a rebuilt Windows package.');
    this.dialogue=api.dialogue.connect({protocol:'capp.local-dialogue.v1',clientName:'Voice Lab · character dialogue'});
    return this.dialogue;
  }
  textStatus() { return this.textClient().status(); }
  voiceStatus() { return this.voiceClient().status(); }
  prepareText() {
    const client = this.textClient();
    if (typeof client.ensureReady !== 'function') throw new Error('lab_text_prepare_missing');
    return client.ensureReady();
  }
  activateVoice() { return this.voiceClient().activate(); }
  complete(options) { return this.textClient().complete(options); }
  speak(options) { return this.voiceClient().speak(options); }
  cancelText() { return this.text?.cancel?.() ?? Promise.resolve({ok: true, cancelled: false}); }
  cancelVoice() { return this.voice?.cancel?.() ?? Promise.resolve({ok: true, cancelled: false}); }
  openStudio() {
    const api = this.local();
    if (typeof api.openStudio !== 'function') throw new Error('lab_studio_missing');
    return api.openStudio();
  }
  dispose() {
    this.dialogue?.dispose?.();
    this.unsubscribe?.(); this.unsubscribe = null;
    this.text?.dispose?.();
    // Older direct connections may omit dispose; never unload their engine.
    this.voice?.dispose?.();
  }
}
