# Texture alignment and large local assets · 2026-10-18

3D Lab 0.21.1 · Foundry 0.6.1 · Voice Lab 1.11.1
cApp Files 0.1.1 · Local AI 0.23.2 · MCP 0.24.28

## Align images before baking

Open the mesh in Builder → Texture → **Align image visually…**. Drag the image
against the orthographic model preview. Scroll adjusts image scale; arrow keys
nudge position, with Shift for larger changes. Alt-drag/right-drag, or **Pan
preview**, moves the preview without changing alignment. Zoom and pan to inspect
the face. **Fit preview** resets that view only. Image visibility controls the
temporary blend; it does not change the baked material's opacity.

Use **Image width** and **Image height** independently to stretch the image, and
fine numeric fields for scale/position (0.001 steps). Small scales such as 0.08
are supported. Each direction retains its own alignment; switching front/right
does not move the other view. Reset this view restores just its alignment.
**Use alignment** returns to Builder; **Bake source textures** applies the result.
Cancel keeps the existing controls/geometry. Alignment and the final bake share
the same projection calculation. Model/image mismatches can still require manual
adjustment; this is not automatic facial landmark registration or unseen texturing.

Keep the source images in matching separate front/left/right/back slots. The
foreground option uses alpha bounds; it does not remove an opaque background.
Select all intended parts before baking. A single chosen source replaces that
direction for the bake. Remove legacy image overlays before baking UV textures.
**Save asset** retains this asset ID and an immutable earlier revision. The GLB
embeds its texture images and per-view alignment. Multi-material GLBs retain
alignment when reopened; source image bytes/views remain in the disk record.
Texture before rigging: the texture authoring tools still require static parts.

## Limits and loading

The legacy **Project image overlay** no longer rejects a model at 500,000
triangles. It retains original geometry, uses less per-face scratch memory and
does not project onto existing overlay meshes again. Its separate overlap/raster
work bound remains, with a visible error if that specific operation is excessive.
The UV texture baker remains the ordinary colour-texturing workflow.

The arbitrary 64 MiB GLB ceiling is removed from Lab import/validation, model disk
storage, Local AI export/worker/response admission and project upload/promotion/
preview. GLB's uint32 total-length field still applies. The application does not
silently simplify, compress or reduce the model to make it fit. Structural checks,
image decoding bounds, metadata/animation limits and separate audio/file limits
remain. Actual memory, native message capacity and renderer resources can still
limit a particular operation; format admission is not a promise to render a 4 GiB
model. Project upload still uses the existing bounded native message envelope.

Local model blob reads/writes use 8 MiB chunks so large shared models do not require
one enormous base64 message. A content hash commits the complete blob atomically;
partial/corrupt chunks never become a saved asset. Disk hashing/copy verification
streams rather than allocating another whole model. Remote services retain their
explicit connection protocol and full-content checksum checks.

Assets and the Action Lab picker read metadata first and load only visible preview
images, with at most two requests in flight. Native preview reads never fetch GLB
bytes. Model bytes load when you open a model. Verified browser-cache records use
a metadata marker on reconnect; local cache edits invalidate that marker. Old
unmarked caches receive one checksum verification before the shortcut is available.
The disk catalogue can be browsed during legacy recovery.

## Embedded texture failure

The generated native content policy omitted `blob:` from `connect-src`. Chromium
under the supplied `http://tauri.localhost` origin reproduces **Failed to fetch**
for browser-created image blobs under that policy. All updated policy variants
permit that browser resource with the actual generated fetch bridge loaded.
The Lab also rejects a GLB whose embedded texture loading failed, preserving the
previous asset instead of silently accepting an untextured scene.

The supplied selected GLB has zero image/texture entries. This update cannot
recover image data absent from that file: reopen the source asset and rebake from
the retained reference images after updating. Original media is never overwritten
by this patch.

## Activate

Apply the combined five-project source overlay with its hash-checking backup
updater. Rebuild/restart the cApp owner to pick up the factory/Files/AI helpers,
then freshly Compile/Package 3D Lab, Foundry and Voice Lab with their existing
Files selections. Preserve the app identities, shared asset folder, model weights
and dependency pins. Old immutable releases are not modified. The Kestrel changes
update its authoring web tools/backend; native gameplay code is unchanged.

Browser/storage/format tests are recorded in the companion verification JSON.
Real temporary Files subprocesses and built UIs cover 54 assets, a 779,546-triangle
version of the supplied NPC, per-view alignment/save/reopen, failed texture loads,
and a 68 MiB GLB import/save/read/project upload. These are authoring checks.
Native compilation/CTest, installed Windows/WebView2, CUDA inference, performance
and gameplay acceptance remain unrun under the standing instruction.
