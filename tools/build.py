#!/usr/bin/env python3
"""Optional developer assembly. index.html is already built; users need no tools."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
parts = []
for name in ('local-files.mjs', 'asset-connection.mjs', 'disk-storage.mjs', 'project-workspace.mjs', 'bridge.mjs', 'lab.mjs', 'dialogue.mjs', 'library.mjs', 'audio-edit.mjs', 'audio-assets.mjs', 'project-audio.mjs', 'asset-manager.mjs', 'app.mjs', 'dialogue-ui.mjs', 'library-ui.mjs', 'audio-ui.mjs', 'audio-editor-ui.mjs', 'project-audio-ui.mjs', 'asset-manager-ui.mjs', 'disk-storage-ui.mjs', 'project-assets-ui.mjs'):
    text = (ROOT / 'src' / name).read_text(encoding='utf-8')
    text = re.sub(r'^import .*?;\s*$', '', text, flags=re.M)
    text = re.sub(r'^export ', '', text, flags=re.M)
    parts.append('// ---- ' + name + ' ----\n' + text)
script = "(() => {\n'use strict';\n" + '\n'.join(parts) + '\n})();'
if '</script' in script.lower():
    raise SystemExit('Unsafe closing script tag in source')
html = (ROOT / 'src' / 'index.template.html').read_text(encoding='utf-8')
html = html.replace('/*__STYLE__*/', (ROOT/'src'/'style.css').read_text(encoding='utf-8') + '\n' + (ROOT/'src'/'project-workspace.css').read_text(encoding='utf-8')).replace('/*__SCRIPT__*/', script)
(ROOT/'index.html').write_text(html, encoding='utf-8', newline='\n')
print('Built ready-to-use index.html:', (ROOT/'index.html').stat().st_size, 'bytes')
