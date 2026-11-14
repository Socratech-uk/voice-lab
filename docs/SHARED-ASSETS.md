# Shared asset libraries · 2026-10-17

3D Lab 0.16.1 · Voice Lab 1.10.0 · Foundry 0.3.0 · Kestrel 0.36 authoring tools.

## Install and connect

1. Merge the update's matching folders into the four existing source folders. Only supplied files are replaced. The optional hash-checked updater refuses changed baselines and makes backups.
2. Compile and package **3D Lab and Voice Lab under their existing app identities**, then install the updates. Keep their existing data. AI packages and models are unchanged.
3. Restart `Start-3D-Asset-Storage.cmd` from the updated 3D Lab source. Start `Start-Audio-Asset-Storage.cmd` from the updated Voice Lab source. Keep both windows open.
4. In the existing installed Voice Lab, choose **Asset storage → paste the audio link → Connect & migrate**. Wait for the result. The service also imports the existing native project queue at `%USERPROFILE%\.capp\audio-drafts`; originals remain there. If migration reports a failure, fix it and retry; unreadable browser databases are explicitly reported as unmigrated.
5. Restart **Start-Foundry.cmd**, open the full Kestrel project, then choose **Asset libraries**. Add the 3D and audio links with labels. The Labs also have **Copy connection for Foundry**. Foundry keeps these private connection profiles in its host configuration, outside the project.
6. Select a library and folder, then **Copy revision to project**. Assign it to an existing stable asset ID or create an ID. Link Model and Movement to the same saved rig revision. Add parts in Assembly and recordings in Sound. **Save edits → Check project → Publish to Kestrel**. Rebuild/restart Kestrel to include the publication.

Use one Foundry/project connector per checkout. `Open-Asset-Workspace.cmd` in Kestrel is an alternative host with the same updated authoring interface. Both browser Labs are rebuilt and included. AI generation remains in installed Labs.

## Files and ownership

| Location | What is stored |
| --- | --- |
| `%USERPROFILE%\cApp\assets\3d` | Existing permanent model drafts, actions, shapes, rigs, references and authoring settings; existing catalogue/IDs remain compatible |
| `%USERPROFILE%\cApp\assets\audio` | Characters, dialogue, types, takes, reference WAVs, music/SFX recordings, recipes, folder metadata, saved authoring preferences and copies of native project drafts |
| `<Kestrel>\workspaces\assets` | Foundry's stable project IDs, pinned imported revisions, assignments, assemblies and history |
| `<Kestrel>\assets\project-library` and `project-bindings.json` | Explicitly published, self-contained runtime files and bindings |
| Foundry host `projects.json` | Private connection profiles and recent folders; never part of game publication |

On Alex's PC the first two roots are `C:\Users\alex1\cApp\assets\3d` and `C:\Users\alex1\cApp\assets\audio`. Both launchers accept `--root` for a different storage machine. Browser databases retain their original records for recovery; they are not the save authority. Connection preferences and view state may be cached in the browser.

Audio uses an atomic `catalogue.json`, content-addressed `_blobs`, readable immutable WAV/JSON snapshots under `drafts`, original browser snapshots under `migrations`, conflicting browser snapshots under `recovered`, and earlier catalogues under `_history`. The folder labels in both apps are catalogue metadata; stable filesystem paths use IDs/content hashes, so renaming or organizing an asset cannot break an imported revision. Voice Lab's inspector and context menu expose **Copy disk WAV path**. 3D Lab already exposes the model path.

New native project transfers are first retained in the connected audio folder. A failed native transfer therefore leaves its shared audio copy intact. Existing approved project recordings remain at their project-owned paths. Foundry's **Sync project files** still imports those approved WAVs. Native project archives appear alongside personal audio in Voice Lab and in Foundry; opening one for editing creates a new editable copy and preserves the original sample rate/bytes in the archive.

A disk acknowledgement is required for new asset saves. Missing services, stale edits, incomplete audio, checksum errors and failed writes surface as failures. Current editor output remains available to retry or download. Browser quota does not prevent disk saves. Unsaved editor input and session-only auditions still require an explicit save.

## Migration and recovery

The browser migration includes all three old databases: voice characters/dialogue/takes; music/SFX assets; and the organizer's metadata/empty folders. IDs, transcript/reference relationships and original WAV bytes are preserved. Repeating migration is idempotent. Migration history prevents old browser records or native queue entries from resurrecting removed records. Original browser records and native files are never cleared.

On a conflict, disk records stay authoritative and the complete incoming browser snapshot plus its WAVs is retained. The panel reports the recovery file. To inspect it as a second usable library, run the audio launcher with a separate root and port, for example:

```bat
Start-Audio-Asset-Storage.cmd --root "C:\Users\alex1\cApp\assets\audio-recovery" --port 43195 --recover "C:\Users\alex1\cApp\assets\audio\recovered\SNAPSHOT.json"
```

Use the actual snapshot filename shown in the app. Add the resulting link in Foundry as a separate library, or use an empty browser profile to inspect it in Voice Lab. Originals and the active audio library remain intact. Earlier snapshots/WAVs are retained when an item is removed; this release has no disk-pruning operation.

Native imports report unreadable or mismatched recordings in `_service/legacy-import-report.json`. Correct the original file and restart the service to retry. `--legacy-drafts` can select another existing native queue root. A custom `--recover` session does not rescan the normal native queue.

Back up the complete `assets\3d` and `assets\audio` roots, including `_blobs` and history. Back up Kestrel's project workspace and published files separately. Existing JSON export tools cover their named library collections; the full folder backup includes native archives and recovery snapshots too. Connection-token files and Foundry's host configuration are private.

## Multiple machines and future proxy setup

Asset storage and project assembly keep separate connections. Foundry can browse up to 16 named sources, including several computers with the same asset role. A connection supports loopback HTTP or an explicitly configured HTTPS origin. Each service still binds to `127.0.0.1`; `--public-origin https://your-origin` adds exactly that reverse-proxy host and prints an HTTPS pairing link. Foundry additionally supports repeated `--allow-origin` values for explicit HTTPS Lab origins.

The API is still authenticated with its private bearer link. Redirects are refused; connection credentials are not stored in asset provenance or runtime manifests. A future reverse proxy can forward these existing APIs. This update does not deploy Cloudflare services, open ports, provision DNS, or implement enterprise accounts/SSO/role permissions. Those are separate deployment/access-control work.

Game publications contain verified copies, never a dependency on a live Lab or asset server. Changing a draft on another machine does not change an already imported project revision. Refresh and import the newer revision deliberately, then assign and publish it.

## Limits and verification

Audio persistence accepts the existing 30-minute PCM16 mono/stereo WAV range. Foundry's existing project-import limit remains 64 MiB per file; larger audio stays safe in the library and must be shortened into a new edit for project transfer. Existing Kestrel collision, equipment ownership, supported sound events and animation restrictions remain in force.

See `SHARED-ASSETS-VERIFICATION.json` for the executed source/browser checks. Synthetic fixtures exercise real HTTP/file transactions, IndexedDB migration, folder browsing, pinning, publication and recovery. Native compile/build, CTest, Windows packaging, GPU inference and gameplay acceptance were not run, as required by the standing source instructions. Kestrel's native runtime remains 0.36; this update changes its authoring connector/bundles and compatible publication metadata.
