# Voice Lab 1.7.0 — asset workspace

## Install the update

Copy the contents of this archive's `voice-lab/` folder into your existing Voice
Lab source folder. The ready-built entry is `index.html`. In cApp, freshly
**Compile**, then **Package** Voice Lab and update the installed application under
its existing identity. Keep its saved data and model caches.

This is a Voice Lab source update. It uses the existing Local AI **0.16.0+**
project-audio bridge. In the Windows package, keep **Project audio folders** and
scoped app speech enabled. If you have already applied the previous project-audio
cApp update, this update does not require another cApp source patch.

## Three workspaces

- **Assets** opens first: browse, listen, organize, edit and promote recordings.
- **Create** contains Sound & music and Character dialogue. Expand **Characters &
  saved dialogue** to manage the cast and choose saved lines.
- **Playground** keeps Text → voice, LLM only, LLM + voice and the ship simulator.

Navigation retains composer input. A visible operation strip provides Stop even
while Assets is open. Batch generation remains sequential and retains finished
recordings. Choose recorded assets to open the existing waveform editor, or open
an unrendered recipe to continue composing it.

## Collections and folders

Without a project, **Personal library** combines saved sound/music, ambience,
dialogue takes, unrendered audio recipes, dialogue lines without takes, and
character reference recordings. Character profiles without a reference remain in
the Character dialogue workspace. Existing audio and character databases remain
in place; opening the manager does not migrate, duplicate or delete recordings.

Open a project containing `capp-audio-project.json`. It adds two collections:

| Collection | Storage and behavior |
| --- | --- |
| Drafts | Saved audio under `%USERPROFILE%\.capp\audio-drafts\<checkout-key>`. New saved sound/music and dialogue recordings are also copied here. |
| Production | Approved recordings under the project's `assets/audio`. Each take has its own WAV and metadata. |
| Personal library | Your existing app-owned recordings and recipes. Available alongside the project collections. |

Folders group assets by **category / subject**; a category shows its subject
subfolders too. Use **+** beside Folders to create a category or subject, then drag
assets into it. Empty folder definitions are saved on this device; a physical
project destination is created when a recording is written there. Native drafts
remain immutable hash directories. Production uses the existing structured
kind/category/subject/name-and-ID layout. This is an audio catalogue manager, not
an unrestricted filesystem browser or an importer for arbitrary project files.

Project recordings are immutable. Organizing, renaming or changing a project
recording creates a new draft; the original stays available. Production changes
therefore pass through review again. Empty folder definitions can be removed by
right-clicking their folder. The existing project bridge provides no destructive
project-delete or arbitrary rename operation, so those actions are not offered.

Unrendered recipes/text stay in the personal library until their audio exists.
Choose one or more audio recipes and **Render recipes**, or use that context-menu
action. The selected model must already be prepared through Create.

## Browse and inspect

- Choose grid cards or compact rows. WAV cards show sampled peaks from the actual
  recording. Project waveforms load when you preview a recording; placeholders
  never pretend to be audio data.
- Search matches names, folders, subjects/characters, tags, notes, transcripts,
  prompts, model identifiers and project paths. Multiple words must all match.
- Combine type, tags, recording state and folder filters. Comma-separated tags
  must all match. Sort by date, name, duration or type.
- The catalogue loads metadata across all pages before enabling mutations. Search
  and **Select all results** cover the entire loaded collection, not just the
  visible cards. Cards page at 24 items; the existing native project limit remains
  10,000 recordings per collection.
- Single-click selects and opens the inspector. Double-click opens the editor or
  recipe. Ctrl/Cmd-click toggles selection; Shift-click selects a range. A visible
  checkbox is also available on every card.
- The inspector shows notes, tags, provenance and an explicit audio preview
  player. No recording starts playing merely because it was selected.

**Rename / edit metadata** also changes the asset's library classification.
Classification is separate from an existing generation recipe. Editing or copying
a dialogue/reference recording preserves its classification and provenance even
though the waveform editor uses its standard PCM audio representation.

For saved dialogue takes, reference recordings and unrendered dialogue entries, per-asset names/folders/tags are stored
in a separate organizer database. They do not rewrite a character's identity or
an older take's generation settings. Promotion uses the effective asset metadata.

## Right-click and drag/drop

Right-click a card, use its **•••** button, or press Shift+F10 while it is focused.
Menus support arrow keys, Home/End, Enter and Escape. Available actions include
opening the editor, new variations, rendering selected recipes, metadata editing,
organizing, copying to drafts, sending to production, WAV download and local
library deletion. Actions requiring a recording are disabled for recipes.

- Drop up to **20 audio files** into the browser or a folder to import them. WAV,
  MP3, FLAC, M4A and OGG depend on the installed browser's audio decoders. Existing
  file/track limits still apply. Partial successes are retained and failures are
  reported per file.
- Drag selected assets to a folder to organize them. Project recordings create
  new draft versions; the UI reports that their originals remain.
- Drag personal recordings to Drafts to copy them into the project.
- Drag Drafts to Production, or choose **Send to production**, to review and
  approve them. Direct external-file drops onto Production are refused; import
  into Drafts first. The Import button in Production switches to Drafts.
- Drag project audio back to Personal library to make an editable local copy.
- `/` focuses search; Ctrl/Cmd+A selects all filtered results; F2 opens metadata
  for the focused card; Escape clears selection; Delete reviews local deletion.

## Name conflicts and production

Promotion first asks you to review the destination project and number of takes.
Names are checked case-insensitively within the same kind/category/subject. A
conflict offers an unused name such as `Airlock (2)`; edit it or cancel that item.
The chosen name must also be unused. Existing versions are never overwritten.

The manager refreshes the production catalogue again immediately before approval.
If another write created a conflicting name during transfer, the newly transferred
draft stays saved and you receive a retry message. Exact native recordings already
in production are skipped. Batch results report sent, skipped and failed items.
The native storage service remains the final authority for path safety, checksums,
immutable IDs and refusing filesystem overwrites. Concurrent apps may still create
identical display names; their hashed destinations remain separate.

The original saved take remains if a native copy fails. Automatic-copy failures
keep the existing **Retry pending drafts** reminder. Manager-import failures state
that any completed personal-library copy remains available for a manual retry.

## Backups

The **•••** library menu provides separate exports for:

1. Audio recordings and recipes, including their classification and provenance.
2. Characters, reference audio, dialogue and takes.
3. Folder organization and per-take/reference metadata overrides.

Keep all three for a complete personal-workspace backup. Organization export does
not contain audio bytes. **Restore backup / import batch** recognizes all three
backup protocols and existing audio batch files. Overlapping IDs/organizer entries
are refused atomically rather than replacing existing data. Project WAVs and
manifests remain on disk; back up the external drafts and project directories too.

## Verification boundary

The built HTML was exercised in Chromium with real IndexedDB and synthetic WAVs.
Project reads/uploads/approval used a controlled service implementation of the
existing bridge protocol. Windows native folder picking, physical filesystem
permissions and neural/GPU inference were not exercised by this update's tests.
See [verification](VERIFICATION.md) for the exact checks and developer commands.
