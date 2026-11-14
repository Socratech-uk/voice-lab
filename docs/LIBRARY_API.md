# Character and dialogue library — 1.3.0

The application owns an IndexedDB database named `capp.voice-lab.library.v1` in its current app/browser profile. Character reference WAVs and rendered WAVs are binary Blobs in a separate audio store; list/search results contain metadata only. No backend, cloud account, file path or model installation is needed for library operations. Keep the same installed app identity when updating. Browser data deletion/uninstall can remove this library: **Export backup** produces a portable JSON file containing every saved reference, transcript, line and take.

## Authoring

Create a character with **+ New**, give it a name and choose its voice. Named character settings, notes, tags, uploaded sample and reference transcript save automatically after edits settle. **Save character** commits immediately. Selecting the character later restores the sample and exact transcript without asking for another file. A new audio upload clears the previous transcript; enter the words for that recording. This is not automatic transcription. Duplicate creates an independent character profile without copying its dialogue. Delete explicitly confirms removal of the character and all its lines/recordings.

Give each dialogue a title, type, text and optional tags/notes. **Save dialogue** updates the open record; **Save as new** creates another. **Render dialogue** saves the line first, then commits each completed take before starting the next. Type names are shared and case-insensitive: `Greeting` and `greeting` use one ID. Choose a type with **All characters** to find the whole cast's greetings; selecting a character filters its lines. Renaming a type preserves its ID and all links. Used types cannot be deleted until their lines are reassigned.

Opening a line restores its saved delivery settings with the character's current reference. Saved takes keep their original spoken text, model/settings/seed and character/line revision numbers when the script changes. Revisions detect conflicting edits; they are not an archive of every earlier character voice. Hardware/model versions may also change results. Playback loads saved audio on demand; session clearing does not delete stored takes. Failed storage stops the render batch and retains the completed session WAV for download/retry. Dialogue text has no application character cap; reference clips remain 6–30 seconds with at most 1,200 transcript characters.

## Shared API

The UI and integrations use the same `VoiceLibrary` methods. The standalone HTML exposes `window.voiceLabLibrary`, protocol `capp.voice-lab.library-api.v1`. Await `ready` once. Every operation returns a Promise; errors provide a stable `code` (`invalid`, `missing`, `duplicate`, `conflict`, `in_use`, `has_takes`, `quota`, `audio_missing`, `unavailable`, `blocked`) and a readable message. Unexpected browser storage errors retain their native names.

| Group | Methods |
| --- | --- |
| `characters` | `list({query})`, `get(id)`, `save(record)`, `duplicate(id)`, `remove(id, revision)` |
| `types` | `list()`, `save({id?, revision?, name})`, `remove(id, revision)` |
| `dialogues` | `list(filters)`, `get(id)`, `save(record)`, `importBatch(batch)`, `remove(id, revision)` |
| `takes` | `list(dialogueId)`, `get(id)`, `save(record)`, `remove(id)` |
| Library | `export()`, `import(backup)` |

`characters.get` includes the reference's `audioWav`, `text`, `name`, `duration` and `sampleRate`; `list` omits WAV bytes. Character saves are full records: retain existing `settings`, `reference`, `notes` and `tags` when editing. Names are unique after Unicode normalization and case folding. IDs survive renames, edits, exports and restores. Existing character/dialogue/type edits require the returned `revision`, preventing silent overwrites from another window or agent. Read the latest record after `conflict` and decide whether the new proposal still applies.

`dialogues.list({characterId, typeId, query, tag, status, offset, limit})` returns `{items,total,offset,limit}`. `limit` is 1–200 (default 100). Character/type/tag queries use IndexedDB indexes; free-text search checks title, dialogue text, notes, character name, type and tags within the indexed result. Results sort by most recently updated, with ID as a deterministic tiebreaker. Queries return line text and take counts, never audio. For reproducible jobs use IDs, not display names.

```javascript
const library = window.voiceLabLibrary;
await library.ready;
const captain = (await library.characters.list({query: 'Alex'}))[0];
if (!captain) throw new Error('Choose a saved character first');
const greeting = (await library.types.list()).find(t => t.nameKey === 'greeting');
if (!greeting) throw new Error('No Greeting type has been saved yet');
const matches = await library.dialogues.list({typeId: greeting.id, limit: 100});
```

Do not pass an absent type ID when intending a restricted query: it means all types. Create the desired type or handle its absence explicitly in automation.

## Automation batches

An LLM can propose structured draft lines. The app does not start an LLM, execute code from a file or grant a new agent session. Existing app/agent authorization still owns access. The data API does not prepare or render a model. Use the existing scoped cApp dialogue client for separately authorized synthesis, or open the generated draft in the UI.

```javascript
const character = await library.characters.get(captain.id);
await library.dialogues.importBatch({
  protocol: 'capp.voice-lab.dialogue-batch.v1',
  items: [{
    id: 'greetings-job-17-line-001',
    characterId: character.id,
    type: 'Greeting',
    title: 'At the docks',
    text: 'Welcome aboard, captain.',
    tags: ['act-1', 'friendly'],
    notes: 'First meeting; keep the delivery warm.',
    status: 'draft',
    settings: character.settings,
    origin: {kind: 'automation', jobId: 'greetings-job-17'}
  }]
});
```

The [batch schema](../schemas/voice-lab-dialogue-batch.v1.schema.json) documents the fields. A batch contains 1–1,000 full records and commits atomically: invalid foreign keys, duplicate IDs, names or stale revisions roll back all rows and newly created types. Use `typeId` for an existing stable category or `type` to create/reuse a name (it takes precedence). An empty `type` clears categorization. Default status is `draft`; `ready` is editorial metadata, not native execution permission.

Callers may supply deterministic IDs. Repeating a create with an existing ID returns `conflict` and adds nothing. To resume a partially completed *multi-batch job*, read each known ID and compare its contents/job ID, skip already committed rows, and send explicit revisions for intended updates. A failing batch itself has no partial writes. No silent last-writer-wins or automatic retry that overwrites newer work.

`takes.save` needs `dialogueId`, `audioWav`, `text`, `model`, `seed` and matching `settings`; it accepts `character`, `characterRevision`, `dialogueRevision`, `notes`, `deviceName`, `generationMs` and an optional stable ID. A take is immutable after creation. Duplicate take IDs are refused. Deleting a line removes its own recordings/audio atomically; a line with takes cannot silently move to another character. Save as new instead.

## Backups and existing files

**Import** accepts `capp.voice-lab.library.v1` backups, `capp.voice-lab.dialogue-batch.v1` batches and legacy `capp.voice-lab.character.v1` profiles. Legacy profiles import their audio/transcript into the library; colliding names get an explicit imported suffix. Profile export remains available under Character notes & transfers.

Backups merge without overwriting IDs or names. Any collision refuses the whole import. Restore a full backup into a fresh app/profile; importing an overlapping backup into the same library is deliberately refused. The file picker accepts up to 500 MB; storage remains subject to the device's browser quota. Characters/lines without recordings are small; audio dominates backups. Export covers saved records, not unsaved line edits.

No model weights, engine packages, private paths or cApp credentials are in a library backup. It does contain the user's voice recordings and dialogue. The shared `%USERPROFILE%\.capp\models` weight store remains separate.
