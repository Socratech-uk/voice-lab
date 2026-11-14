## 1.11.1 · 2026-10-18

Project model transfers accept GLBs above 64 MiB and use bounded local model blob
reads. Recording-specific bounds remain. See docs/TEXTURE-ASSETS-UPDATE.md.

# 1.7.0 — Asset manager and production workspace · 2026-10-14

- Start in a unified visual asset browser with folder navigation, grid/list views,
  real waveform previews, an inspector and searchable audio/dialogue/reference metadata.
- Add right-click/keyboard menus, selection across pages, drag/drop imports and
  folder organization, per-take names and metadata, editable audio classification,
  new variations and selected-recipe rendering with an always-available Stop control.
- Expose Drafts and Production when a project is open, with explicit promotion,
  naming-conflict resolution, immutable draft versions and per-item failure feedback.
- Split the app into Assets, Create and Playground; collapse cast/library management
  while composing and retain the waveform editor and existing model workflows.
- Keep the existing Local AI 0.16.0 bridge and original IndexedDB stores. Add a separate
  organizer store and backup. No cApp/native-engine changes are included.
- Exercise built HTML in Chromium, real IndexedDB persistence and controlled project
  transfers. Windows native filesystem and neural/GPU acceptance remain separate.

# 1.6.0 — Project audio drafts and approval

- Open a native project folder; keep per-checkout drafts under the user's `.capp/audio-drafts`.
- Copy newly saved sound/music, imported/edited/continued recordings and dialogue takes into drafts; retry failed copies without regenerating.
- Browse/audition drafts and approved recordings, edit a copy and approve exact takes into a structured immutable project audio tree.
- Local AI 0.16.0 / MCP 0.24.15 opt-in capability; fresh owner build and Voice Lab Compile/Package required. Native Windows execution remains unverified here.

## 1.5.1 — 2026-10-13

- Pair with Local AI 0.15.1 / MCP 0.24.14 to fix continuation rejected by the packaged app-frame bridge. Rebuild the owner, freshly Compile and Package.
- Add descriptive hover tooltips to all authored buttons, dynamic library actions and timeline controls, with state-aware playback/continuation guidance.
- Clear stale continuation progress on failure and explain how to update an older rejecting bridge.
- Run audio browser coverage through the actual app-frame facade; keep controlled native replies distinct from Windows/engine qualification.

## 1.5.0 — 2026-10-13

- Show saved WAV players immediately and open assets in a waveform editor with seek, range selection, zoom, trim/cut, fades, normalization, silence, reverse and undo/redo.
- Import local audio; save edits and continuations as independent recordings with provenance, preserving originals and the existing database.
- Add Stable Audio Medium (380 seconds), Windows DirectML diffusion, and context-based continuation from a chosen point. Tracks can grow to 30 minutes through repeated continuation.
- Extend the automation API and batch schema; preserve old recipes and backups. Require Local AI 0.15.0 / MCP 0.24.13 and a fresh Compile/Package.
- Real Linux CPU/Chromium checks pass within the documented scope; Windows GPU and installed acceptance remain separate.

## 1.4.0 — 2026-10-12

- Add Sound & music using Stable Audio 3 Small SFX/music, explicit CPU, fixed local engine and selected-model preparation.
- Persist stereo WAVs and recipes with searchable categories, subjects, tags and notes; support variations, revision checks and backup/restore.
- Add atomic automation draft batches and sequential resumable rendering with completed-output retention.
- Require Local AI 0.14.0 / MCP 0.24.11 and a fresh Compile/Package; retain the existing character/dialogue library.
- Real Linux CPU inference passes, including 120 seconds. Windows native/installer qualification remains pending.

## 1.3.0 — 2026-10-12

- Add an in-app character manager with automatic local saving of settings, reference audio/transcript, notes and tags; create, rename, duplicate, delete and import old profiles.
- Save dialogue by character, with shared case-insensitive types, tags, titles, notes and Draft/Ready status; search across the cast or browse one character.
- Save rendered WAVs automatically against their dialogue; preserve original recorded words and settings after script edits, audition/download/delete saved takes and export/import full backups.
- Expose a versioned same-origin library API and atomic structured dialogue batches with stable IDs and revision checks for later automation.
- Show actionable engine error details and require the matching Local AI 0.13.1 / MCP 0.24.10 Chatterbox dependency repair. Current build guidance uses one Setup.exe.
- Verify real Chromium persistence/conversion/layout plus controlled native requests; Windows neural/GPU/installer acceptance is still separate.

## 1.2.1 — 2026-10-11

- Remove the Character dialogue line’s 600-character limit, request-size gate and fixed 120-second output gate. Engine limits remain visible as results/errors.
- Document Local AI 0.13.0 / MCP 0.24.5 MSI installation and shared per-user model weights.
- Add long-line forwarding and long-output validation coverage to the existing application tests.

## 1.2.0 — 2026-10-11

- Add Character dialogue with Qwen3-TTS design, presets and cloning, plus Chatterbox and Turbo. Fish Audio is excluded.
- Add local reference conversion, supported model controls, seeded takes, playback, WAV/notes export and reusable character profiles.
- Use cApp Local AI 0.12.0’s optional owned dialogue slot; device choice, errors and cancellation remain explicit. The matching MCP 0.24.3 build produces a portable Windows ZIP64 with private CUDA runtimes.
- Preserve the four Kokoro/GGUF workflows and existing preferences. See docs/VERIFICATION.md for the source/fixture boundary and outstanding native acceptance.

# Changelog

## 1.1.1

- Default text output request budget is now 36,000 tokens (native context remains the hard effective limit).
- Increased the lab text deadline to 15 minutes for deliberately long local runs.
- Speech-only cleanup normalizes typographic punctuation/outer quotes before TTS while preserving displayed model text.
- Requires Local AI 0.11.5 for the larger Windows request ceiling and speech pronunciation recovery.

## 1.1.0

- Fixed Ship simulator LLM mode so the default Model narrator actually uses Response style, Custom system instruction, output-token budget and temperature.
- Retained the previous 0/1 phrase selector as an explicit Strict factual selector mode.
- Custom system instruction is now a saved setting, applied consistently to LLM workflows, and redacted from diagnostics unless text export is opted in.
- Added contextual UI copy explaining when text-model controls are active or deliberately bypassed.


## 1.0.0 — 2026-10-02

Initial standalone Voice Lab application. Four workflows: direct TTS, LLM text, combined text/speech and simulated ship announcements. Integrates existing cApp Local AI 0.10.1 scoped APIs without changing the platform or game. Adds managed-preparation progress, bounded sentence streaming, independent stop controls, per-device settings and opt-in diagnostic export. No native runtime, model weights, cloud fallback or microphone input bundled.


## 1.0.1 — 2026-10-02

Distinguishes installed-app bridge failures from ordinary browser previews and absent selections. Observes late factory delivery, provides Check/retry without parent API searching, and labels Kokoro separately from the text GGUF. Optional scoped connection disposal is used when provided. Requires Local AI 0.11.5 for fixed Windows app-frame delivery. Prompts, responses, simulation controls and preferences retain their existing behaviour.
