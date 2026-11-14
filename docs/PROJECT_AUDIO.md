# Project audio — Voice Lab 1.7.0

Voice Lab uses Local AI 0.16.0's existing project-audio capability. This release
contains only Voice Lab source. Apply its `voice-lab/` contents to the existing
Voice Lab folder, then freshly **Compile** and **Package** the application under
its existing identity. Keep recordings, model caches and the full project.

If project audio was not previously enabled, select Local AI 0.16.0+ in the
Windows package, enable **Project audio folders**, retain scoped app speech, and
keep the sound/music and dialogue engines you use. This requires the earlier
cApp project-audio owner update (MCP 0.24.15+); no additional cApp source patch is
included in this Voice Lab update.

1. Choose **Open project** and select the folder containing
   `capp-audio-project.json`. Cancelling retains the existing connection. Reopen
   the folder after restarting the app.
2. Assets shows **Drafts**, **Production** and your separate **Personal library**.
   New saved sound/music, waveform edits, continuations and dialogue recordings
   continue to copy into external drafts. Failed automatic copies keep the
   **Retry pending drafts** reminder.
3. Browse category/subject folders; search all loaded metadata; select a card to
   inspect and preview its actual recording. Right-click for asset actions.
4. Choose **Send to production**, or drag selected recordings to Production.
   Review the destination, resolve any display-name conflicts, and read the
   batch result. Native checksums and immutable destinations remain authoritative.
5. Editing, renaming or organizing project recordings creates new drafts and
   keeps the original versions. Empty folder definitions are local until they
   contain audio. Unrendered recipes stay in the personal library until rendered.

See [the asset workspace guide](ASSET_MANAGER.md) for all gestures, backup
instructions, classification and the distinction between catalogue folders and
native filesystem layout.

## Folder contract

| Location | Contents |
| --- | --- |
| `%USERPROFILE%\.capp\audio-drafts\<project-and-checkout-key>\<id>\` | Immutable draft `take.wav` and `asset.json`, outside the project |
| `<project>\assets\audio\<kind>\<category>\<subject>\<name>--<id>\` | Approved `take.wav` and `asset.json` |

Kinds are sound effects, music, dialogue and ambience. Safe ASCII folder names
are generated from the editable title/category/subject; metadata retains the
original spelling. The stable ID includes project identity, metadata and audio
hash. Retrying the same copy reuses the same draft. Different takes or notes
produce distinct records. Draft keys include the canonical checkout path, so
two copies of a project do not accidentally share an approval queue.

Each `asset.json` is a catalogue entry (`capp.project-audio-asset.v1`): stable ID,
project ID, creation time, title, kind, category, subject, tags, notes, source
identity/revision, generation or edit provenance, WAV format/size/SHA-256, and an
approval time for approved assets. Voice references remain in the character
library; recipes record the character/dialogue revisions and take settings.
Existing project takes are not automatically assigned to gameplay events.
Kestrel's normal assets input includes approved files on its next fresh Compile.

Other projects can use this descriptor at their root, with their own stable ID
and name; the managed audio root is deliberately fixed:

```json
{"protocol":"capp.audio-project.v1","id":"my-project","name":"My project","audioRoot":"assets/audio"}
```

## Limits and recovery

Windows only. Browser previews can display the interface but cannot open disk
projects. Folder grants last for the document/session and come only from the
native picker. File paths, commands and URLs cannot be submitted as write inputs.
Symlinks/junctions/reparse points are refused. A changed project descriptor
requires closing/reopening the project. Moves to a new checkout path make a new
draft queue; keep the old draft folder if it still contains work to review.

WAVs use 16-bit PCM, one or two channels, 8–192 kHz, at most 30 minutes and
317,520,064 bytes. Transfers use chunks of at most 512 KiB. Metadata is limited to
64 KiB; unusually large transcripts/notes require shortening the exported
metadata. Original library data is retained if export fails. Project listing is
paged and bounded to 10,000 recordings. Interrupted temporary upload folders are
ignored; normal session close removes its own unfinished upload. No retention
policy deletes completed drafts. Back up the draft directory as well as the full
project; the source-sharing ZIP intentionally excludes recording bytes.

## Sharing Kestrel source

Double-click **zip kestrel.cmd** in Kestrel. It creates a timestamped source ZIP
under `share/`, plus companion tree/inventory/checksum files. The ZIP itself
contains `PROJECT-TREE.txt` (actual `tree /f /a`), `OMITTED-FILES.csv`,
`SOURCE-MANIFEST.json` and sharing instructions. Send the source ZIP.

Code, scripts, current Markdown, small JSON catalogues and approved audio
metadata are included. WAVs, pictures, binaries, vendor dependencies, cooked
caches, old captures, saved visual model documents and large data documents are
listed but omitted. It is not a complete build or backup. Returned overlays
apply to your full local project. When a visual/audio source is needed, use the
script's `-IncludeAsset` option with that exact project-relative path or attach
that asset separately. An inventory entry does not provide its file contents.
