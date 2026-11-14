# voice-lab · native shared folders

The installed app uses Files to open shared assets and remembered project folders automatically. See [local Files setup](docs/LOCAL-FILES.md). The launchers documented below remain the optional browser/remote path.

# Voice Lab 1.10.0 · permanent audio assets

Saved browser libraries and the native project draft queue migrate to `%USERPROFILE%\cApp\assets\audio`. New recordings, characters, dialogue, authoring settings and folder edits require disk acknowledgement. Start the audio service and connect the existing installed app once.

[Setup, migration, folders and recovery](docs/SHARED-ASSETS.md)

---

## Earlier release notes

# Voice Lab 1.9.0 · Foundry recording handoff

Project Assets preserves the chosen Foundry folder session. **Edit recording in
Voice Lab** copies the exact revision into the audio library and opens its editor.
Save a new recording version, copy it back through Project Assets, then use Foundry
to bind it to a game event with variations and mixing controls.

Existing AI engines and native approved-audio workflows are retained. Updating this
UI does not require an AI owner rebuild. Foundry's browser edition needs no AI.

[Workflow](docs/PROJECT-ASSETS.md) · [Verification](docs/FOUNDRY-VERIFICATION.json)

---

## Earlier release notes

# Voice Lab 1.8.0 · shared project assignments

**Project Assets** connects to the shared Kestrel registry used by 3D Lab. Copy saved
recordings into the project, preview them, and assign them to events such as footstep,
fire, engine or voice. Right-click → **Copy to shared project workspace** is available
alongside the existing native audio draft/approval workflow. Personal recordings stay
in their existing libraries.

Run the accompanying **Open-Asset-Workspace.cmd** in your full Kestrel folder
(Python 3.10+), then paste its link into Project Assets in both labs. If an installed
package blocks loopback access, the hub opens included browser editors already paired
to the project; AI generation remains in the installed apps.

Published sound lookup entries do **not** yet trigger in-game playback. Kestrel needs
its gameplay sound adapters. The registry also stores model and rig-specific movement
assignments. [Workflow and limits](docs/PROJECT-ASSETS.md).

Replace this source under the same app identity and freshly **Compile → Package**.
Rebuilt `index.html` is included. No cApp source patch or model runtime is included.

---

## Earlier workflows

# Voice Lab 1.7.0

A local audio production workspace: create sounds and dialogue, organize recordings, and review project drafts for production.

**The app is already built. Use `index.html`. No npm, development server, API key, Python setup or backend is needed to run the app.** Copy this archive’s `voice-lab/` contents into your existing Voice Lab source folder, then freshly Compile and Package with the existing Local AI 0.16.0+ configuration.

## Asset workspace

Start in **Assets**. Browse visual cards or rows; search folders, types, tags,
notes and transcripts; preview audio in the inspector. Right-click or use **•••**
for editing, renaming, variations, folder organization and production actions.
Drag files in to import, drag assets into folders, and drag project drafts to
**Production** for review. Name conflicts offer a distinct name and retain the
existing recordings. **Create** holds sound/music and character authoring;
**Playground** holds the text, speech and ship tools.

Read [the asset manager guide](docs/ASSET_MANAGER.md) for folder semantics,
shortcuts, backups and installation. This release updates Voice Lab only and
uses the previously added Local AI 0.16.0 project capability.

## Build it through cApp

1. Apply the Voice Lab overlay to the source folder extracted from your supplied `voice-lab.zip`. Keep this separate from the cApp repository.
2. In cApp, create a local project/application named **Voice Lab**. Bind the extracted folder as its source with `index.html` as the entry, or use that single HTML file through your normal source workflow. Leave backend integration off.
3. In the application's **Windows x64** package, select **Local AI 0.16.0 or later**. Keep **Allow scoped app inference**, **Allow scoped app speech** and **Automatically fetch missing voice engine and models on first use** enabled. Debug Inspector is optional, not required.
4. Compile a new release, package it and run the output. Dialogue packages produce one self-contained Setup.exe. Run it to install the app. This archive contains source changes, not a prebuilt Windows installer.
5. Click **Enable voice** in the lab. cApp prepares its managed runtime/model assets and arms playback. First use needs internet; no shell commands are involved.
6. Open **Local AI Studio**, choose/download a small GGUF or configure the package's baseline model, then click **Prepare text**. The lab uses that selected/configured model: it does not fetch a different text model or change GPU settings itself.

The same preparations are requested lazily when a workflow needs them. The dedicated buttons simply make it easier to diagnose each engine independently. A plain browser can display the complete UI and run the text-only **ship simulator**, but it does not contain native Local AI. No generated reply or neural speech is faked in the shipped app.

## Six workflows

| Mode | What runs |
|---|---|
| **Text → voice** | Type a line, choose a voice, and synthesize/play it. No LLM needed. |
| **LLM only** | Generate a bounded text reply from your selected GGUF. No voice preparation or synthesis. |
| **LLM + voice** | Generate and speak. Choose sentence streaming to allow text work to overlap audio, or wait for the completed reply before speaking. |
| **Character dialogue** | Qwen3 voice design, presets and cloning; Chatterbox and Turbo; reference audio, seeded takes and WAV export. |
| **Sound & music** | Generate effects, ambience and music; import, edit and continue recordings. |
| **Ship simulator** | Set simulated engines/shields/hull and hostile cruiser/fighter counts. Request status, toggle a system, report a fleet or trigger a critical hull line. |

The ship simulator is explicitly **not connected to SOL Explorer**. With **LLM chooses phrasing** enabled, its default **Model narrator** sends the displayed telemetry to your selected GGUF and applies the same Response style, Custom system instruction, output-token budget and temperature as the other LLM workflows. A factual boundary is appended so the prompt tells the model not to invent telemetry. The optional **Strict factual selector** retains the old 0/1 behaviour and deliberately ignores the general text controls. Critical hull warnings bypass the LLM. An identified fighter wing is part of the displayed fighter count, not additional ships.

## Character dialogue

Use the existing Local AI 0.16.0+ package for this release. In Voice Lab’s Windows Local AI configuration set **Dialogue authoring engines → Both** and keep scoped app speech enabled. Compile the updated Lab and build a new Windows package. This optional configuration creates **one Setup.exe** containing the MSI and all its cabinets. Windows Installer handles the native engine files and shortcuts after the setup extracts them automatically. Windows x64 is required. Engine dependencies are prepared by cApp at build time, not by player-side Python or pip.

Open **Character dialogue**, choose a model and click **Download & load model**. The first model download is about 4.5 GB for each Qwen mode, 3.2 GB for Chatterbox and 3.0 GB for Turbo. Subsequent uses reuse verified local weights. The private CUDA runtime is a large first build; the two providers share the identical Torch distribution while keeping incompatible Transformers versions isolated.

- **Qwen Voice design:** describe a voice and its delivery, then render a line.
- **Qwen Presets:** pick one of nine speakers and add a delivery instruction.
- **Qwen Clone:** add a clean 6–30 second reference and its exact transcript. A suitable generated Qwen take can become this reference in one click.
- **Chatterbox:** optional reference, temperature, emotion and guidance.
- **Turbo:** optional reference, temperature and performance tags such as `[laugh]`; unsupported emotion/CFG controls are hidden.

Create a character in the in-app library. Its voice settings, sample, transcript, notes and tags save locally; selecting it restores them. Save lines with titles, shared types (such as Greeting), tags, notes and Draft/Ready status. Search a type across the cast, or select a character to browse its dialogue. Choose 1–4 takes: rendering saves the line and each completed WAV. Saved recordings survive app restarts; only the session audition list is limited to the latest 12. Export backup includes the whole saved library. Old character JSON profiles can still be imported/exported. See [library use and automation API](docs/LIBRARY_API.md). The dialogue line has no character cap. The app forwards the complete line; long runs may exhaust memory, fail or stop at the model’s own generation limit. It does not automatically split the text.

**Auto checks real NVIDIA CUDA and reports failure instead of silently using CPU.** CPU is an explicit option. The Lab displays the actual device returned by the worker. It does not unload your GGUF or Kokoro model to make room. Unload other GPU models in Local AI Studio if needed. Stop keeps finished takes and waits for the active job to settle. Changing the dialogue model replaces only that dialogue model.

This release passes browser, persistence, waveform and controlled project-transfer checks. Actual Windows packaging/launch, native folder writes, CUDA on your RTX4070 and neural quality remain separate acceptance checks. It is not a prebuilt native executable.

## Sound and music

Workflow **06** adds Stable Audio 3 Small SFX and music with explicit CPU execution. Save searchable assets with categories, character/object associations, tags and exact generation recipes. Queue batches, retain completed WAVs, audition, create variations and restore backups. Enable **Sound and music authoring** in Local AI before a fresh Compile and Package. See [workflow, limits and automation API](docs/AUDIO_API.md).

## Settings and controls

Five voices (George, Emma, Heart, Sarah and Michael), speed 0.75–1.25×, volume, output-token budget, temperature, response style and an optional custom system instruction are exposed. The custom instruction is saved locally as a setting and is used by LLM only, LLM + voice, and the Ship simulator's Model narrator. Diagnostic exports redact it unless response-text export is explicitly enabled. Model selection, import/download, repair and processor settings remain in **Local AI Studio**, which opens from the header.

**Stop text** cancels this lab's text request and lets queued speech finish. **Stop voice** clears this test's audio queue and prevents further speech while text continues. **Stop all** requests both. None unloads a shared model or deletes files. Controls remain guarded until the original operation settles; stopping is a request, not proof of immediate native cancellation. A text deadline behaves the same way.

Volume zero skips activation and synthesis. A text-only run never prepares speech. Each generation uses isolated context; this is not a persistent chat thread. Read aloud replays a completed response of up to 1,200 characters. Longer responses can be copied in excerpts to Text → voice.

## What the measurements mean

First token and first playback are elapsed times from **Run**, including cold preparation. The overlap counter measures time when the text request was active while audio playback ran. It is **not** evidence that two GPU kernels ran simultaneously, nor proof of externally audible sound. Cold model loading and the OS audio settings still matter. Voice status, prepared files and successful playback are distinct observations.

## Limits and privacy

The lab admits one workflow at a time, with at most one text operation and one voice operation. Combined mode can stream while speaking. Speech uses whole, bounded chunks; no more than 12 chunks are queued and no more than 1,800 characters are admitted per workflow. Each native-facing speech chunk is at most 200 characters. Generated text stays visible when the audio budget is exceeded.

Prompt input is capped at 4,000 characters, typed speech at 1,200, custom instructions at 1,200, and displayed generation at 12,000. Temperature and output tokens are validated; native runtime limits may further constrain them. Long unbroken words cannot be passed to the speech engine. Thinking/analysis tags and fenced code are omitted from audio, while raw model output remains visible. Sentence streaming is not suitable for text that must be reviewed before speaking.

Preferences are saved locally. The character/dialogue library uses IndexedDB for saved voice samples, transcripts, lines and WAV recordings. Prompts, responses and the activity log remain in memory unless explicitly exported. The custom system instruction is a saved local setting so repeated tests keep it; diagnostic export redacts it by default. Export excludes response text by default and never exports the prompt. The Local AI Sidecar may maintain its own bounded session diagnostics. Review exported reports before sharing them.

There are no application-level network requests, cloud/browser-TTS fallback, microphone recording, voice commands or mainframe control calls. Optional project audio access uses a native folder picker and restricted draft/approval operations. Network/model preparation belongs to cApp's selected Sidecar.

## Troubleshooting

- **Chatterbox TypeError / missing watermarker:** rebuild the cApp owner with MCP 0.24.10, select Local AI 0.13.1, freshly Compile Voice Lab and package it. The repaired private dependency is installed with the app; CPU selection does not fix a missing package.
- **Storage full:** the render batch stops and retains its last WAV. Download it, export a backup, remove unneeded saved takes, then retry Save take.
- **Preview / no Sidecar:** package and run with Local AI selected; opening HTML in a normal browser only previews the UI.
- **Voice API not found:** update the factory/selected package to the managed speech version and build a new native package.
- **No text model:** choose one in Local AI Studio or configure its baseline, then Prepare text. Speech works independently.
- **Preparation fails or automatic preparation is disabled:** use Local AI Studio's Prepare / retry or Verify / repair. Do not install Python or run pip.
- **Busy:** let the active native request settle. Another feature can own the shared model slot; the lab does not bypass that lease.
- **Silent playback:** check lab volume, OS output/mute and click Enable voice again. There is no hidden hosted voice fallback.
- **Only one engine runs:** use LLM + voice with As sentences arrive. The model must emit enough text before finishing for overlap to be observable; a one-word answer need not overlap playback.

## Source and testing

`index.html` contains the entire runtime CSS and JavaScript inline. The editable files are under `src/`; `tools/build.py` is an **optional developer assembly step**, not an application prerequisite. Tests and setup notes are separate from the runtime; no test fixture is present in the built HTML.

See `docs/INTEGRATION.md` for exact interfaces and `docs/VERIFICATION.md` for executed checks and their limits. Local AI 0.16.0+ supplies the native project-audio capability.


## Installed Studio is ready but the Lab cannot connect

A loaded text model in the owning Studio does not prove the application frame has received its API. This Lab distinguishes **Installed app · bridge unavailable** from a real browser preview. Build/package with Local AI 0.15.1 or later to acquire the document-bound bridge; updating the HTML alone cannot repair an older native shell. Keep your existing app identity/data and loaded GGUF. Do not uninstall or run Python setup commands.

After updating: **Check engines** should show the current text model. **Enable voice** reaches automatic Kokoro preparation and **Text → voice** tests audio; Gemma/other GGUFs only supply text. Studio's expanded Voice section has the separate model information and Test/retry/repair controls. Android text engine readiness in the Library is not Windows voice readiness.

The new regression uses the actual factory-generated parent/child arrangement, not just a top-level page with injected APIs. Tests still use controlled model/native responses and a synthetic tone; actual Windows/neural acceptance is not claimed.

## Shared model weights

With Local AI 0.13.0, Windows model downloads live under `%USERPROFILE%\.capp\models` and can be reused by other rebuilt cApp applications. Studio refresh rescans GGUF and model descriptors. Existing model files are migrated without deleting old app data. Deleting a shared model affects every app; unload it in other apps before repair or deletion. Engines and Voice Lab character profiles remain separate from this weight store.

## Audio editing and continuation

Sound & music now includes Small SFX, Small Music and Medium (up to 380 seconds per render), with CPU or Windows DirectML diffusion. Saved cards show players immediately. Click an asset for waveform selection, trim/cut, fades, normalization, reverse, undo/redo and continuation from the playhead. Import audio and use the same tools. Edits save independent recordings and retain source/recipe history. See [the audio API and editor guide](docs/AUDIO_API.md).


## Open an audio project

Voice Lab 1.7.0 can open Kestrel or another project with `capp-audio-project.json`.
Enable **Project audio folders** in Local AI 0.16.0, freshly Compile and Package,
then choose **Open project**. New saved takes are copied to external
project drafts; right-click a draft and **Send to production** into `assets/audio`.
See [project audio, activation and source sharing](docs/PROJECT_AUDIO.md).

## Selective work packages

See [creative suite work packages and scenes](docs/CREATIVE-SUITE.md). Run
`zip-creative-suite.cmd` to package current source and explicitly selected assets.
