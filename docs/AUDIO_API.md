# Sound and music — Voice Lab 1.5.1

Apply both overlay roots to their matching projects. Rebuild/restart cApp with MCP 0.24.14, enable scoped speech and **Sound and music authoring → Stable Audio 3 · CPU / GPU** in Local AI 0.15.1, then freshly Compile and Package Voice Lab. Keep the existing application identity and data. The Windows pipeline produces one Setup.exe; this source overlay is not a prebuilt installer.

## Models and devices

| Model ID | Purpose | Maximum per render |
| --- | --- | --- |
| `sa3-sfx` | Small sound effects / ambience | 120 s |
| `sa3-music` | Small music | 120 s |
| `sa3-medium` | Medium music and sound | 380 s |

Choose `cpu` (LiteRT W8A8) or `gpu` (Windows DirectML mixed FP16/FP32 diffusion). GPU text encoding and the audio codec still run on CPU. Preparation checks actual GPU execution; a GPU failure does not silently select CPU. Long renders need more memory; shorten them or explicitly choose CPU if necessary. The previous character voice model unloads when audio takes the authoring slot. Active work is protected. GGUF and Kokoro retain separate slots.

Preparation downloads only selected model/device files after acceptance of the linked Stability AI and Gemma terms. Shared files and the existing pinned revision are reused. Status is passive. Rendering uses verified local weights; no cloud fallback, runtime package installation or arbitrary model URL is accepted. Prompt limits remain 2,000 characters and 256 model tokens. Output is stereo PCM16 44.1 kHz WAV, with eight generation steps.

Hover over any button for a description of its action. Timeline tooltips explain selection edits, continuation placement and why some actions are unavailable.

## Library and editor

Players and WAV downloads appear on saved cards immediately. Click the title or card, or Open, for a modal waveform editor. Click to seek, drag to select, or use numeric start/end/playhead inputs. Arrow keys seek; Shift selects. Zoom and pan change the view. Playback includes selection audition and speed control.

Keep selection, Cut, Fade in/out, Normalize, Silence and Reverse apply to the selection. Undo/Redo stay local until **Save new version** creates an independent recording. Original assets remain intact. Closing dirty edits asks before discarding; an edited WAV can be downloaded before saving. Title, category, tags and notes travel with the new asset.

**Import audio** accepts browser-supported audio formats (WAV/MP3/FLAC/M4A/OGG support depends on the installed WebView). Decode and stereo/mono conversion happen locally. PCM16 44.1 kHz WAV has a direct path. Imports are limited to 350 MB per file, 20 files per action, and 30 minutes per decoded track. Imported audio gets the same playback, editing and continuation controls.

**Continue from playhead** preserves the prefix and replaces everything after the playhead with a new generated ending, saved separately. Choose the end to extend a recording. Save edits first. Up to 30 seconds immediately before the playhead supplies context; the render limit includes context plus the new duration. For example, Small can add 90 seconds with 30 seconds of context; Medium can add 350. Repeat continuation to build a longer track, up to the 30-minute library limit. Original prefix samples are preserved exactly, but musical continuity and quality are model-dependent; audition joins before use.

## Automation API

`window.voiceLabAudio` retains protocol `capp.voice-lab.audio-api.v1`. The existing database name and version are preserved. Earlier drafts, WAVs and v1 backups remain readable. New fields and operations are additive; older applications cannot interpret all new assets.

```js
const audio = window.voiceLabAudio;
await audio.ready();
await audio.prepare({model:'sa3-medium', device:'gpu'}, true); // explicit terms acceptance
const [draft] = await audio.assets.importBatch({
  protocol:'capp.voice-lab.audio-batch.v1',
  items:[{id:'desert-drone-01', title:'Desert drone', kind:'music',
    model:'sa3-medium', device:'gpu', prompt:'Continuous loud distorted reed drone, slow pitch swells.',
    durationSeconds:180, seed:42, category:'Desert', tags:['drone','ceremonial']}]
});
await audio.renderBatch({ids:[draft.id]});
const source = await audio.assets.get(draft.id);
const trimmed = await audio.assets.edit(source.id, source.revision, {
  operation:'trim', startSeconds:10, endSeconds:170, title:'Desert drone · trimmed'
});
const continued = await audio.extend({id:trimmed.id, revision:trimmed.revision,
  atSeconds:trimmed.result.durationSeconds, addedSeconds:120,
  model:'sa3-medium', device:'gpu', prompt:'Continue the sustained reed drone.', seed:43});
```

`assets.list({kind,category,query,tag,offset,limit})` returns metadata pages (up to 200 rows); audio is loaded only by `assets.get(id,{audio:true})`. `assets.save(row)` updates drafts or metadata with optimistic revision checks. Recorded recipes are frozen. `assets.remove(id,revision)` deletes only that asset; independent derived recordings survive. `assets.importAudio({file,...metadata})` accepts a Blob/File and decodes locally. `assets.importWav({audioWav,...metadata})` accepts base64 PCM16 WAV. `assets.edit(id,revision,{operation,startSeconds,endSeconds,title?})` supports the editor operations above. Native operations, edits and import are reusable without clicking UI controls; call `refresh()` to refresh visible cards after API-only mutations.

New saved recordings include `origin` (`generation`, `import`, `edit`, `extension`) and optional `lineage: {source:{id,revision},operations:[...]}`. Edits record ordered sample ranges. Extensions record the playhead, context duration, added duration and recipe. Imported/edited recordings may have `recipe:null`; use `result.durationSeconds` for the actual saved track duration. An extension recipe describes the generated window, not the complete saved track. Audio is persisted independently of the source; lineage does not require keeping the parent file. Seeds help repeat recipes, but results can vary across backends, hardware and versions.

`cancel()` stops the owned render; completed batch assets remain saved. `renderBatch` accepts 1–100 unique saved IDs and skips completed rows, so a stopped batch can resume. Storage failure retains a completed recording for Retry save or Download. It never silently discards the render. A changed/deleted source prevents saving a derived recording until resolved; download remains available.

`export({ids?})` and `import(backup)` retain metadata, lineage and exact WAVs. Imports are atomic and reject overlapping IDs. Exports are bounded to 500 MB of JSON/base64; select fewer assets for separate backups. Draft batches retain protocol `capp.voice-lab.audio-batch.v1`; their schema includes model/device and model-specific duration limits. Defaults for old recipes remain Small and CPU.

## Verification limits

Real Chromium exercises storage, modal editing, import, visible players, cancellation and continuation requests using controlled native replies. Real Linux CPU inference checks Small, continuation with exact prefix preservation, and Medium beyond 120 seconds. Shipped ONNX graphs and dependency artifacts are checked separately. Windows native imports, DirectML hardware execution/performance, long-render capacity and installed acceptance require the rebuilt target package.
