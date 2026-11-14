# Creative suite work packages and scenes

3D Lab 0.21.0 · Foundry 0.6.0 · 2026-10-18

## Install this source update

Apply the supplied changed-files overlay to the four full source projects, using
its hash-checking backup updater. Freshly Compile/Package 3D Lab and Foundry in
cApp with their existing Files capability enabled, then restart those apps.
The browser Labs bundled in both Foundry hosts are updated together. Voice Lab's
UI and Kestrel's native version remain unchanged; their source folders receive
the exporter. Kestrel also retains the scene/work document during asset cooking.
No cApp owner or AI runtime change is required for this update. Keep the existing
Local AI runtime/model weights and dependencies. Installed Windows acceptance
and native gameplay have not been run.

## Select a useful work package

1. In 3D Lab, tick **Work ZIP** on asset cards, or use the Action Lab work section.
   Add a specific work note and save that selection. Card checkboxes persist
   immediately; wait for saves to finish before exporting.
2. In Foundry, open the full project folder. Use the asset inspector's work
   section and **Save ZIP selection**. The Files view can select a specific file
   or folder, including audio. Scenes have their own Work ZIP checkbox and notes;
   press **Save scenes**. Notes can explain the requested game plumbing or point
   to sound locations. A path in a note is a hint, not automatic file inclusion.
3. Run `zip-creative-suite.cmd` in any updated source root. Python 3.10+ is needed.
   The exporter discovers sibling projects or asks for the four full source roots
   and shared assets folder once. Default shared root is
   `C:\Users\alex1\cApp\assets` (`USERPROFILE\cApp\assets` for another account).
   Choose your full projects, not the extracted overlay's partial folders.
4. The ZIP is written under that source root's `share` folder. Upload it with the
   task you want continued. It includes current source, chosen content and required
   dependency revisions, names/IDs, notes, hashes and a handoff guide.

Selections are allowlists: unselected models/recordings do not get swept in.
Dependencies of selected assets/scenes are included even if their own checkbox
is off. Source code for all four roles is included. Vendor dependencies, installed
apps, model weights, build folders, caches, old ZIPs/backups and service tokens
are excluded. This is a work package, not a complete disaster-recovery backup.
Keep the full original projects. The current project registry is retained as
metadata; `project-context/registry.json` is a selected view, not a live-registry
replacement. Shared blobs are deduplicated under `content/`, with exact record
metadata and `CONTENT-MAP.json` to retain editing context and original references.

Useful commands (run from the updated source root):

```bat
zip-creative-suite.cmd --configure
zip-creative-suite.cmd --dry-run
zip-creative-suite.cmd --output "C:\Users\alex1\Desktop\npc-work.zip"
zip-creative-suite.cmd --verify "C:\Users\alex1\Desktop\npc-work.zip"
```

Advanced selection also accepts repeatable `--model-id`, `--asset-id` and
`--scene-id`. `--project role=PATH` sets source roots without an interactive prompt;
roles are `3d-lab`, `foundry`, `voice-lab`, `kestrel`. `--assets-root PATH` overrides
the shared root. The private `creative-suite.local.json` is never exported.
Set `CAPP_SUITE_PYTHON` to a Python executable if needed. Existing output ZIPs
are never overwritten. Stale catalogues, missing required content and changed
selected files fail visibly; refresh the selection and retry.

## Save one asset, keep its revisions

Builder, Action Lab and saved Shape Lab assets now save a new revision on their
existing identity. The library keeps one current card per ID. Original creation
time, generation settings, references, original bytes and prior saved snapshots
remain recoverable. An imported/new unsaved object gets its first ID on save.
**Save as new asset** intentionally creates a separate variant.

Changing a saved name asks **Rename and save** or **Duplicate and rename**.
Rename retains the ID; a duplicate gets a new ID. Metadata-only renames retain the
GLB bytes. Existing separate IDs are not automatically merged: they may represent
intentional variants. A stale save is rejected instead of overwriting another
editor's revision. **Reload saved revision** in Action Lab lets you recover the
latest disk state; export unsaved work first if you want to keep it separately.

Immutable snapshot folders still retain history. To move older shared 3D record
snapshots outside the main drafts tree, close the storage owner/apps and use:

```bat
zip-creative-suite.cmd --archive-history --dry-run
zip-creative-suite.cmd --archive-history
```

This optional organizer moves old snapshots to `3d\_history\drafts`, retaining
current snapshots and shared content blobs. It does not delete history, merge IDs
or reorganize Voice Lab recordings. Normal ZIP export is read-only for asset
content. Back up the shared assets folder before any manual history cleanup.

## Stage visual and audio scenes in Foundry

Open **Scenes**, create a named scene, and add project models. Instances pin the
model revision, have independent position/rotation/scale, visibility windows and
an optional animation clip. Use transform tools/numeric settings, Fit and Keep
camera, and the timeline. Nested assemblies and character sockets follow the model.
Undo/redo covers scene edits. Save scenes explicitly before leaving or exporting.

Add audio/dialogue from project WAVs, promote a saved shared-audio item, or import
a PCM WAV. The picker can audition audio before selection. Choose music, ambience,
effects or voice; set gain, fades, loop, start/end and optional spatial placement.
Voice cues can carry a speaker and subtitle. Trigger a cue at a timeline position
or from a named action marker on an instance. Marker windows limit repeated events.
When no explicit scene cue overrides a marker, existing asset sound bindings are
previewed. Pause, scrub, reload and scene changes stop sound. Browser audio starts
after a user playback gesture. Preview limits bound decoded audio and active voices.

The Assembly sound tab also attaches shared/project audio to an asset's actions.
Promoting a recording copies it into the project; the shared original stays intact.
Scenes, cue references, work selections and notes are saved through Files in
`assets/creative-suite.json`, bound to the project ID with stale-write checks.
The game cook preserves this file, and a selected scene's ZIP follows its pinned
models, movement, sounds and attached assets.

Scenes are ready for authoring, preview and delegated game integration. This update
does not add a Kestrel native scene player, spawn the scene in a level, or change
gameplay physics. A game adapter still needs to consume the chosen scene/cues.
3D Lab makes and edits asset contents; Foundry assembles/references those assets;
Kestrel executes gameplay. Builder library insertion remains separate future work.

## Verification and limits

See `CREATIVE-SUITE-VERIFICATION.json` for source provenance and checks. Real
temporary disk services and fresh browser profiles verified identity-preserving
saves, rename/duplicate, durable work selection, scenes, animation/audio preview,
stale-write rejection and selective packaging. Original user media was not supplied
for this task; tests used disposable fixtures. No original drafts were moved.
Python/JavaScript/browser authoring checks are not native Windows, CUDA, performance
or gameplay acceptance. The Windows CMD/PowerShell wrappers were source reviewed,
not executed on Windows.
