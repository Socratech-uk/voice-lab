# Shared project integration update

Use **Project Assets** for the new Kestrel registry/connector workflow:
[setup and limits](PROJECT-ASSETS.md). Rebuild this Lab using its existing identity.
No cApp host patch is included. The sections below document earlier AI/audio setup;
the new project connector is separate from those native capabilities.

## Sound/music integration (1.4.0)

Local AI 0.14.0 / MCP 0.24.11 adds the scoped `local.audio.connect({protocol: "capp.local-audio.v1"})` connection. Configure `audioGenerationEngine: "stable-audio3"` and `allowAppSpeech: true`; fresh Compile freezes these inputs. This connection shares the authoring worker with character dialogue. See [the audio contract](AUDIO_API.md).

# Character dialogue integration — 1.2.0

The optional `capp.ai.local.dialogue` facade requires Local AI 0.12.0 and Windows x64 with `speechDialogueEngines` selected at package time. `connect({protocol:'capp.local-dialogue.v1'})` returns `status`, `prepare`, `render`, `cancel`, `unload` and `dispose`. Only this document’s owned requests are cancelled. Model paths, executable paths and URLs are never app inputs. Default `disabled` produces no optional CUDA resources; enabled authoring builds produce a portable ZIP64 through MCP 0.24.3. Runtime dependencies are build-pinned; model downloads require explicit preparation.

The existing text and Kokoro integration follows below and remains unchanged.

# Integration contract

## Source basis

Voice Lab 1.1.1 keeps the same scoped Local AI text/speech connection contract and was rechecked against the current supplied cApp Local AI source. SOL Explorer 1.34's voice module served as a usage reference; it is not a runtime dependency or a vendored game subsystem.

Primary source paths:

- cApp `sidecars/local-ai/runtime/local-speech.js` — managed activation, own-request cancellation, speech admission and callbacks.
- cApp `sidecars/local-ai/contracts/local-speech.d.mts` — speech connection and status declaration.
- cApp `sidecars/local-ai/platforms/android/runtime/local-ai-shell.js` — shared cross-platform text connection implementation (also used on Windows).
- cApp `sidecars/local-ai/platforms/windows/runtime/local-ai-shell.js` — the Windows native-command adapter.
- Explorer `src/ai/ship-voice.js` — independent model slots and fact-bound phrase-selection pattern.

Those source files are **not packaged into this app**. cApp injects the selected Sidecar at build/runtime. `src/bridge.mjs` contains the entire host adapter.

## Two scoped clients

```javascript
const local = window.capp?.ai?.local;
const text = local.connect({
  protocol: 'capp.voice-lab.text.v1',
  clientName: 'Voice Lab · text'
});
const voice = local.speech.connect({
  protocol: 'capp.voice-lab.speech.v1',
  clientName: 'Voice Lab · speech'
});
```

The app omits `appId` deliberately to bind to the current installed application. It never climbs into `parent`, `opener` or another cApp owner window, does not overwrite `window.capp`, and reuses one connection of each type. A provider replacement requires reload rather than an automatic fallback.

Passive observation uses `text.status()` and `voice.status()`. Explicit text preparation uses `text.ensureReady()`. That may load/download the **already configured** baseline; it is not a passive status call. Model ownership and imports remain in Studio. The header invokes `local.openStudio()` only from a user action.

## Voice lifecycle

`voice.activate()` is called synchronously from a user gesture, before an awaited text/status operation. Managed 0.11.5 activates audio and waits for preparation. A status check then distinguishes supported, permitted, prepared and loaded. Read-only `local.speech.subscribe()` provides progress; an operation-scoped 650 ms status poll is the fallback when native event forwarding is absent. Polls stop on settlement.

```javascript
await voice.activate();
await voice.speak({
  text: 'Engine on.',
  voice: 'bm_george', speed: 1, volume: .65,
  onStart() { /* playback callback, not neural-inference attestation */ },
  onSegment({text}) { /* current spoken caption */ }
});
```

All speech calls are serialized. The underlying Sidecar may prefetch one audio segment; the lab does not spawn additional speech clients to obtain parallel utterances. There is no call to owner `configure`, `prepare`, `unload` or global `dispose`. The app's preferences do not overwrite Studio's owner preferences.

## Text and speech cooperation

Text completions use `isolated: true`, `maxInputTokens: 2048`, bounded `maxTokens`, explicit temperature and a bounded prompt/system instruction. The Sidecar owns its native limits and capability admission.

In streaming mode the original onToken text is displayed safely with `textContent`. A separate speech filter holds incomplete tags, removes thinking/analysis and code fences, and accumulates complete phrases. Those phrases are sent to the single speech queue while the same text request continues. Long phrases are split at a word boundary, never inside a word. Short final fragments are flushed after text settlement.

After-reply mode queues nothing until the text result settles. If the final result differs from already emitted tokens, the streaming workflow does not repeat or rewrite audio that has already played: it flushes only the original stream, shows the final text and records the discrepancy.

A stalled voice never opens a second speech slot. The queue is bounded; exceeding the speech budget is visible. An unavailable voice retains generated text and reports the error. There is no alternate TTS provider. A normal LLM reply is unverified prose. Ship simulator offers two explicit LLM modes: **Model narrator**, which receives a bounded telemetry fact block plus the selected/custom system instruction and normal generation settings, and **Strict factual selector**, which retains the legacy 0/1 candidate selection. Critical ship alerts remain deterministic and bypass the model.

## Cancellation and disposal

An operation job is retained until its original promise settles, including after deadlines and cancellation. Starting a new workflow while those jobs exist is refused. Cancelling one engine does not cancel the other. At pagehide the app requests cancellation of its own operations and disposes its speech connection; it does not unload shared model files or the text engine.

Text connection v1 has no `dispose()` method, so the app does not assume one. Read-only subscriptions and local timers are cleared separately.

## Platform scope

The source UI is responsive and browser-readable. The managed neural speech path supplied here targets Windows x64. This new app cannot add native speech support to an old installed binary, Android or a regular browser. Model weights and cApp native runtime are deliberately not in the archive.


The 0.11.5 Windows factory delivers a limited facade into the selected app frame. This consumer uses only its own `window.capp.ai.local`; it never borrows the owner API. The engine recipe/model assets are unchanged.


## Saved character and dialogue data (1.3.0)

`src/library.mjs` owns transactional IndexedDB persistence; `src/library-ui.mjs` uses the same operations exposed through `window.voiceLabLibrary`. See [the library contract and batch API](LIBRARY_API.md). App-owned character audio/transcripts, dialogue and saved takes are independent of Local AI's model store. Rebuilding under the same app identity preserves this data; import/export uses versioned records and never grants native or network authority.

## Voice Lab 1.5 audio update

Use Local AI 0.15.1 and MCP 0.24.14. Rebuild the owner, freshly Compile and Package. Existing database names and app identity must stay stable. The additive audio API, CPU/GPU selection, import/edit history and continuation contracts are documented in [AUDIO_API.md](AUDIO_API.md).


## Project audio in 1.6.0

Local AI 0.16.0 adds `capp.ai.local.audioProjects` behind a Windows-only opt-in
and native picker. The Lab uses metadata and bounded chunks, never paths.
See [the workflow and contract](PROJECT_AUDIO.md). No model or app identity
migration is required; preserve the current library on update.

## Asset workspace in 1.7.0

`asset-manager.mjs` supplies metadata validation, folder/name matching, complete
pagination, unified indexing, real PCM waveform sampling and the transactional
`capp.voice-lab.organizer.v1` IndexedDB store. `asset-manager-ui.mjs` composes the
existing audio, character and project APIs into one workspace. Project work is
serialized through `projectTask`; the native command/protocol is unchanged.

Audio rows accept optional `assetType` (`sfx`, `music`, `ambience`, `dialogue`,
`reference`) independently of their generation recipe's `kind`. Old rows fall
back to `kind`. Backups round-trip this classification. Project metadata uses
supported native kinds; references use `dialogue` plus `source.assetType`.

`VoiceLibrary.catalogue()` takes a metadata-only transaction snapshot of the
cast, types, lines and takes. Native project listings load sequentially in
100-item pages; inconsistent/partial catalogues report an error and disable
manager mutations until refreshed. Recording bytes load only for visible local
waveforms, preview/edit/download or an explicit transfer.

`window.voiceLabAssets` exposes `protocol`, `refresh()`, `collection` and `count`.
The existing `voiceLabAudio`, `voiceLabLibrary` and `voiceLabProjectAudio` APIs
remain available. No new runtime package or network request is shipped.
