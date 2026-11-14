# Asset workspace 1.7.0 — 2026-10-14

Input: `voice-lab(20261014-105441).zip`, SHA-256
`9ecfdd49e9fa8d695bdc2da3cddd5014c3a1046993fb10d3b8c8cf294c6f6723`.
Only this upload supplied implementation sources. No cApp or Kestrel source was
edited or used as a new build input.

## Executed checks

- **46 real Chromium acceptance checks** against the built, self-contained HTML
  and actual IndexedDB: initial startup, unified recordings/recipes, metadata and
  tag search, actual WAV waveform samples, context menus, metadata persistence,
  empty folders, drag-to-folder, grid/list views, project collections, complete
  chunk upload/read, promotion with retained drafts, naming conflicts and suffixes,
  immutable production behavior, drag-to-production confirmation, injected disk
  failure, cancelled picker, keyboard selection, file chooser and external drops,
  creator navigation, 24 kHz reference editing, dialogue take naming, classification,
  batch cancellation, pagination, off-page selection, hover help and reload.
- No horizontal page overflow at **1512, 1024, 768 and 390 px**. Desktop asset,
  production, sound/dialogue authoring and mobile screenshots were inspected.
- **50 core** and **10 connection-diagnostic** assertions passed.
- Existing dialogue, character library, audio assets, waveform editing and project
  transfer suites passed, including byte preservation, conflicts, backup/import
  rollback, continued audio, source provenance and interrupted writes.
- New organizer tests passed for complete pagination, search intersections,
  case-insensitive name/folder matching, suffix limits, persistence, atomic restore,
  real PCM peaks and classification through edit/backup/project export.
- Source and assembled JavaScript parse; DOM IDs are unique; all **117 static
  buttons** have hover descriptions. The built HTML contains no test fixtures.
  Reassembly is deterministic.

The browser's project service uses **controlled responses and synthetic WAVs**.
It exercises the real Voice Lab UI and `ProjectAudioSession` chunk/checksum logic,
not native Windows filesystem execution. Neural generation, Windows folder
picking/writes, physical disk permissions, GPU execution and a fresh cApp native
Compile/Package were **not** performed for this upload. Earlier native/compiler
records below describe their own releases only.

Detailed browser cases are in
`validation/asset-manager-browser-2026-10-14.json`.

## Developer checks

The ready-built app requires no npm/Python installation. For source development,
assemble with `python tools/build.py`; run `node tests/core.mjs`,
`node tests/connection.mjs`, `node tests/dialogue.mjs` and
`node tests/project-audio.mjs`. The library/audio/editor/manager tests additionally
use `fake-indexeddb`; the browser test uses Playwright and a Chromium executable.
Set `IDB_PATH`, `PLAYWRIGHT_PATH`, `CHROMIUM_PATH` and `TEST_OUTPUT` as appropriate
for your developer environment. These dependencies are never bundled into the app.

```text
node tests/library.mjs
node tests/audio-assets.mjs
node tests/audio-edit.mjs
node tests/asset-manager.mjs
node tests/asset-manager-browser.mjs
```

## Prior release records

# Project audio phase — 2026-10-14

Voice Lab 1.6.0 source and chunk-transfer regression checks pass. The actual
cApp owner/frame bridge checks explicit access, document identity and bounded
methods; generated Windows source and immutable owner/package checks include
the new native and JS helpers. New configuration approval/refusal checks pass.
Existing core/connection/dialogue/continuation checks remain passing.

Native Windows/Rust/PowerShell execution is unverified. Cargo and PowerShell are
unavailable; DOM/IndexedDB suites are blocked by missing jsdom/fake-indexeddb.
No Windows installation, file picker/approval, rendered UI, neural/GPU or Kestrel
gameplay success is claimed. Four real-filesystem Rust tests are supplied for
the optional native harness, but were not run here. The wider policy suite has
one missing-jsonschema environment error. See PROJECT_AUDIO.md for activation
and the target acceptance workflow. Previous phase evidence follows unchanged.

# Voice Lab 1.5.1 verification — 2026-10-13

The supplied 0.15.0 app-frame bridge reproduces `local_ai_app_request_invalid` for the editor’s `sourceWav`; Local AI 0.15.1 admits it to the existing bounded owner client. `node tests/local_audio_app_bridge.mjs` in the cApp source tests the actual facade/client with controlled frame and native objects, including exact 20.71-second and maximum 30-second contexts, CPU/GPU selection, unknown fields, input limits, cancellation and document revocation. This is not neural or Windows execution.

The audio browser suite now places Voice Lab in a separate `appFrame` and installs the real owner client and app bridge in its parent. Chromium cannot launch in this repair environment because `socket()` is denied. Browser interaction/layout checks and actual Windows continuation remain unverified for 1.5.1. Source assembly, JavaScript parsing, generated package inclusion and immutable compiler admission are recorded with the paired cApp repair evidence. Button tooltips use native HTML titles; no renderer or new runtime dependency is added.

Rebuild/restart cApp with MCP 0.24.14, select Local AI 0.15.1, freshly Compile Voice Lab 1.5.1, then Package/install under the existing identity. Retain recordings and models.

# Voice Lab 1.5.0 verification — 2026-10-13

Current checks cover the persistent audio editor, immediate players, imports, API edits, Medium/GPU request selection and continuation. Run `node tests/audio-edit.mjs` (fake-indexeddb required) and `node tests/audio-browser.mjs <capp-root> <output-folder>` (Playwright/Chromium required). The browser test uses controlled native replies; it does not generate neural audio.

Real Linux backend checks generated Small Music, exact-prefix continuation and a 125-second Medium track. The shipped ONNX Small graph completed a real ONNX Runtime CPU forward. Windows DirectML hardware and private-interpreter imports still require a freshly rebuilt target package. Full native Rust passes 28 portable fixture tests; this does not certify an installed Windows build. cApp's ordinary package build, registry/capsule reconstruction and actual immutable owner-service closure are checked separately.

Core, dialogue, character-library and connection checks remain applicable. Originals and existing v1 databases/backups are retained; new edits/imports/continuations have independent WAVs and recorded provenance. See [the audio guide](AUDIO_API.md) for limits and activation.

## Previous verification records

## 1.4.0 audio authoring verification — 2026-10-12

Actual pinned Stable Audio 3 Small models produced 2-second SFX and 3-second music WAVs through the production Linux CPU adapter. A 120-second SFX render also passed exact stereo PCM16 44.1 kHz frame counts, finite/non-silent samples and tiled decoding. This is real neural execution on this host, not a Windows/RTX4070 benchmark or subjective quality rating.

The new IndexedDB contract test covers persisted WAVs, frozen recording recipes, editable drafts, revision conflicts, query filters, atomic batch/backup rollback, quota recovery and cancellation/resume. The real Chromium audio test passes reload, exact stereo bytes, explicit preparation/terms, unsaved-edit protection, cross-character/category search, two-model batches, stop retention, backup/restore and widths 1440/768/390 with no horizontal overflow or unhandled errors. Native replies in browser tests are controlled. Existing character/dialogue persistence/browser tests still pass.

cApp: the 12 pinned Windows runtime archives were actually downloaded, extracted and dependency-checked. Both model variants and shared weights were actually downloaded and hash-checked. Standard gate: 633 checks; public docs: 17 tests, 249 Worker checks and 63 source-derived SDK declarations. Ordinary isolated build with launcher site/version, registry reconstruction and capsule verification passed. The actual immutable cApp self-compile retains the recipe, helpers, licences and inference adapter. Configuration policy requires explicit approval for the new audio engine selection. The general docs gate still fails on the same 19 pre-existing Designer links; baseline comparison is identical.

Windows private-interpreter imports, native compile, Setup.exe install/upgrade/repair/uninstall and installed generation are pending. There is no Windows target or Cargo in this environment, and the mandatory native import probe has not been bypassed. The code checkpoint remains ready for target verification, not a certified native binary.

Reproduce focused app checks (developer test dependencies only):

```sh
python tools/build.py
node tests/core.mjs
node tests/connection.mjs
node tests/dialogue.mjs
node tests/library.mjs
node tests/audio-assets.mjs
node tests/dialogue-dom.mjs /path/to/capp
node tests/audio-browser.mjs /path/to/capp /path/to/evidence
node tests/library-browser.mjs /path/to/capp /path/to/evidence-library
python tests/compile.py --capp-root /path/to/capp --output /path/to/compiler-evidence
```

`fake-indexeddb`, `jsdom` and Playwright/Chromium are test dependencies and are not bundled in the app. `IDB_PATH`, `JSDOM_PATH` and `PLAYWRIGHT_PATH` may point to existing test installations. Runtime use needs only the ready-built `index.html` and the selected cApp Sidecar.

# Voice Lab 1.3.0 verification

The fresh application source passes its 50 core and 10 connection checks, dialogue request/WAV/profile/cancellation tests, and failed-persistence regression. The latter proves a failed save stops a multi-take batch and leaves the completed WAV available in the session.

`tests/library.mjs` exercises actual library transactions through fake-indexeddb: reference audio/transcript persistence and reopen, stable IDs/renames, shared case-insensitive types, indexed search, cross-window stale revisions, atomic automation batch rollback, quota rollback, take text/settings provenance, complete backup restore, invalid-backup rollback and scoped deletion. The fake supplies storage semantics, not shipped data or generated speech.

`tests/library-browser.mjs` runs the generated single HTML in real Chromium with real IndexedDB and WebAudio conversion, and the actual cApp dialogue client with controlled native replies. Its 19 checks cover upload/name/save, reference/transcript restoration, two-character Greeting search, line selection and unsaved-edit guard, saved WAV bytes after reload, original take text after edits, desktop/tablet/phone overflow, export/import in separate profiles and conflict/reload recovery. No fixture is bundled into the app. `tests/dialogue-dom.mjs` retains five-model controls, long-line forwarding, real WAV export bytes, imported profiles, cancellation and child-document facade retirement.

The original Kokoro/GGUF browser suite reaches 45 passing checks before a pre-existing integrated 768-pixel overflow assertion fails. That failure also reproduces on the unchanged supplied Voice Lab source. The fixture now opens the existing Advanced panel before entering its custom instruction. This wider suite is not fully green; the new library’s separate 19-check browser suite passes.

The actual cApp compiler accepts and preserves the ready-built HTML byte-for-byte as an immutable release and admits that release for Windows packaging. The library needs no backend and creates no new native capability. Exact current source hashes and paired component versions are in `docs/SOURCE_REFERENCE.json`.

## Developer commands

Assemble with `python tools/build.py`. Run `node tests/core.mjs`, `node tests/connection.mjs`, `node tests/dialogue.mjs` and `IDB_PATH=<absolute fake-indexeddb module> node tests/library.mjs`. Run `tests/dialogue-dom.mjs <capp-root>` with `JSDOM_PATH` and `IDB_PATH`; run `tests/library-browser.mjs <capp-root> <evidence-folder>` with `PLAYWRIGHT_PATH`. These are optional development dependencies; no node modules ship in the app.

`python tests/compile.py --capp-root <capp-root> --output <temporary-folder>` verifies immutable compiler/release/package admission. `tests/browser.py` exercises the original Kokoro/GGUF workflows with real browser audio and controlled native replies; it requires Python Playwright and the `--browser` executable path.

The paired cApp source regression, production wheel extraction, real Linux CPU Perth watermarker, public-docs/registry/standard, ordinary build and immutable service closure results are recorded in `docs/history/validation/sidecars/VOICE_LIBRARY_PERTH_2026-10-12.md` in that project. Full neural speech, Windows CPU/CUDA, audible quality, final Setup.exe and installed self-host are **not** certified by these checks.

## Installed acceptance

Rebuild cApp with MCP 0.24.10 / Local AI 0.13.1, freshly Compile Voice Lab 1.3.0, then package/install that release under the same application identity. The expected output is one Setup.exe. Download any wanted takes from the old app's session before closing it; those old session-only WAVs cannot be recovered by a later source update. Import existing character JSON profiles once to bring them into the new in-app library.

On Windows verify Chatterbox and Turbo initialization and synthesis, Qwen/reference identity, CUDA/CPU behavior, cancellation/model switching/offline reuse, character/sample/transcript persistence across restart, multi-character Greeting search, saved recording playback, conflict handling, backup/restore and data-preserving installation updates. Shared voice weights stay in the existing model store.
