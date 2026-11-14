# Local Files update · 2026-10-17

This update uses cApp Files 0.1.0 / MCP 0.24.23. Rebuild/restart the updated cApp
owner, select Files for Foundry, 3D Lab and Voice Lab, and freshly Compile/Package
each app under its existing app identity. Keep existing Local AI and Links settings.
Close old Start-3D-Asset-Storage, Start-Audio-Asset-Storage and Foundry host windows
once; they still hold their existing file locks. Subsequent launches need no storage
launcher, connection link or developer cApp process.

Shared assets default to USERPROFILE/cApp/assets. Existing disk files and metadata
are reused in place. Browser migrations retain originals and conflicting copies.
Foundry's Open project folder remembers Kestrel and exposes both project and shared
assets. Shared libraries browses complete Lab records and copies recipes/references
with models; file promotion retains the existing GLB/WAV behavior. Publication is
still explicit. Advanced retains optional remote services. Native folder access is
Windows-only; browser previews still use an explicitly started optional host.

3D PNG/GIF captures now save to shared 3d/captures. Voice project Drafts use shared
audio; Production retains approved pairs in the selected project's assets/audio.
No existing game assets, saves, stable IDs or C++ runtime files are modified.

Validation uses temporary data, source/generated-package checks and browser UIs with
a native API shim. Installed Windows packaging, dialogs and performance remain
untested. No native build, CTest, GPU inference or gameplay acceptance was run.
