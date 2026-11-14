#!/usr/bin/env python3
"""Voice Lab's permanent audio library. Python 3.10+, standard library only."""
import argparse
import copy
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import threading
from urllib.parse import urlparse
import wave

PROTOCOL = 'capp.voice-lab.disk.v1'
MAX_BLOB = 320 * 1024 * 1024  # Existing 30-minute stereo editor limit.
MAX_JSON = 64 * 1024 * 1024
SCHEMA = {'voice': ['characters', 'types', 'dialogues', 'takes', 'audio'],
          'sounds': ['assets', 'audio'], 'projects': ['assets', 'audio'],
          'organizer': ['items', 'folders'], 'preferences': ['items']}


class StorageError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def require(value, message, status=400):
    if not value:
        raise StorageError(message, status)


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def safe(root, relative):
    current = root
    for part in Path(relative).parts:
        require(part not in ('..', '.') and not re.search(r'[\\:\x00-\x1f]', part), 'Invalid library path.')
        current = current / part
        require(not current.is_symlink(), 'Library links are not followed.')
        if current.exists():
            require(not (getattr(current.stat(follow_symlinks=False), 'st_file_attributes', 0) & 0x400), 'Library junctions are not followed.')
    require(current.resolve().is_relative_to(root), 'Path escapes the library.')
    return current


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp-' + secrets.token_hex(8))
    try:
        with open(temp, 'xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def key_for(database, store, row):
    field = 'key' if database in ('organizer', 'preferences') else 'id'
    key = row.get(field)
    require(isinstance(key, str) and 0 < len(key) <= 8192 and '\x00' not in key, 'Invalid record identity.')
    return key


class AudioStore:
    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        for name in ('_service', '_blobs', '_history', 'drafts', 'migrations', 'recovered'):
            safe(self.root, name).mkdir(exist_ok=True)
        self.grant = safe(self.root, '_service/writer.lock').open('a+b')
        self.grant.seek(0)
        self.grant.write(b'0')
        self.grant.flush()
        self.grant.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.grant.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.grant, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.grant.close()
            raise StorageError('This audio folder already has a storage service. Use its connection link.', 409)
        self.lock = threading.RLock()
        self.file = safe(self.root, 'catalogue.json')
        if not self.file.exists():
            atomic(self.file, packed({'protocol': PROTOCOL, 'revision': 0, 'databases':
                {d: {s: {} for s in stores} for d, stores in SCHEMA.items()}, 'imports': {}, 'requests': {}}))
        require(self.file.stat().st_size <= MAX_JSON, 'Audio catalogue is too large.')
        self.state = json.loads(self.file.read_bytes())
        require(self.state.get('protocol') == PROTOCOL, 'Unsupported audio catalogue. Originals retained.')
        self.state['databases'].setdefault('projects', {'assets': {}, 'audio': {}})
        self.legacy_report = {'copied': 0, 'unchanged': 0, 'errors': []}
        token_path = safe(self.root, '_service/connection-token.txt')
        if not token_path.exists():
            atomic(token_path, secrets.token_urlsafe(36).encode())
            try:
                token_path.chmod(0o600)
            except OSError:
                pass
        self.token = token_path.read_text('ascii').strip()
        require(re.fullmatch(r'[A-Za-z0-9_-]{40,100}', self.token), 'Invalid connection token.')

    def close(self):
        self.grant.close()

    def blob_path(self, digest):
        require(isinstance(digest, str) and re.fullmatch(r'[a-f0-9]{64}', digest), 'Invalid content hash.')
        return safe(self.root, '_blobs/' + digest)

    def put_blob(self, digest, data):
        require(0 < len(data) <= MAX_BLOB and sha(data) == digest, 'Recording checksum or size mismatch.')
        path = self.blob_path(digest)
        with self.lock:
            if path.exists():
                require(path.stat().st_size == len(data) and sha(path.read_bytes()) == digest, 'Stored audio checksum mismatch.', 409)
            else:
                atomic(path, data)
        return {'sha256': digest, 'size': len(data)}

    def checked_blob(self, value):
        require(isinstance(value, dict) and set(value) == {'$blob'}, 'Missing audio descriptor.')
        ref = value['$blob']
        require(isinstance(ref, dict) and type(ref.get('size')) is int and 0 < ref['size'] <= MAX_BLOB, 'Invalid audio size.')
        path = self.blob_path(ref.get('sha256'))
        require(path.is_file() and path.stat().st_size == ref['size'] and sha(path.read_bytes()) == ref['sha256'], 'Audio bytes are missing or damaged. Retry saving.', 409)
        with wave.open(str(path), 'rb') as wav:
            require(wav.getsampwidth() == 2 and wav.getnchannels() in (1, 2) and 8000 <= wav.getframerate() <= 192000 and wav.getcomptype() == 'NONE', 'Use PCM 16-bit mono/stereo WAV.')
            frames = wav.getnframes()
            require(0 < frames <= wav.getframerate() * 1800, 'Recording exceeds the 30-minute limit.')
            remaining = frames
            while remaining:
                count = min(remaining, 65536)
                require(len(wav.readframes(count)) == count * wav.getnchannels() * 2, 'Truncated recording.')
                remaining -= count
        return path

    def snapshot(self, database):
        require(database in SCHEMA, 'Unknown audio collection.')
        with self.lock:
            return {'revision': self.state['revision'], 'stores': copy.deepcopy(self.state['databases'][database])}

    def validate(self, databases, verify_audio=True):
        require(set(databases) == set(SCHEMA), 'Missing audio collections.')
        for database, stores in databases.items():
            require(isinstance(stores, dict) and set(stores) == set(SCHEMA[database]), 'Invalid audio stores.')
            for name, records in stores.items():
                require(isinstance(records, dict) and len(records) <= 100000, 'Too many records.')
                for key, row in records.items():
                    require(isinstance(row, dict) and key_for(database, name, row) == key, 'Record identity mismatch.')
                    if name == 'audio' and verify_audio:
                        self.checked_blob(row.get('blob'))
        voice, sounds = databases['voice'], databases['sounds']
        for name in ('characters', 'types'):
            keys = [r.get('nameKey') for r in voice[name].values()]
            require(all(isinstance(k, str) and k for k in keys) and len(keys) == len(set(keys)), 'That character or dialogue type name already exists.', 409)
        for row in voice['characters'].values():
            require(not row.get('reference') or 'reference:' + row['id'] in voice['audio'], 'Character reference audio is missing.')
        for row in voice['dialogues'].values():
            require(row.get('characterId') in voice['characters'] and (not row.get('typeId') or row['typeId'] in voice['types']), 'Dialogue character/type is missing.')
        for row in voice['takes'].values():
            require(row.get('dialogueId') in voice['dialogues'] and 'take:' + row['id'] in voice['audio'], 'Take transcript or audio is missing.')
        for row in sounds['assets'].values():
            require(row.get('state') in ('draft', 'ready') and (row['state'] != 'ready' or row['id'] in sounds['audio']), 'Saved recording audio is missing.')
        for row in databases['projects']['assets'].values():
            require(row['id'] in databases['projects']['audio'], 'Project draft audio is missing.')

    def archive_project(self, value):
        project, metadata, blob = value.get('project'), value.get('metadata'), value.get('blob')
        require(isinstance(project, dict) and isinstance(project.get('id'), str) and 0 < len(project['id']) <= 160 and len(packed(project)) <= 8192, 'Project identity is required.')
        require(isinstance(metadata, dict) and isinstance(metadata.get('title'), str) and 0 < len(metadata['title']) <= 160 and len(packed(metadata)) <= 256 * 1024, 'Invalid project draft metadata.')
        self.checked_blob(blob)
        identity = sha(packed({'project': project, 'metadata': metadata, 'blob': blob}))
        with self.lock:
            if identity in self.state['databases']['projects']['assets'] or identity in self.state.get('projectImports', {}):
                return {'id': identity, 'alreadySaved': True}
            row = {'id': identity, 'project': project, 'metadata': metadata, 'nativeSource': value.get('nativeSource'), 'state': 'ready'}
            require(len(packed(row)) <= 512 * 1024, 'Project draft provenance is too large.')
            state = copy.deepcopy(self.state)
            state['databases']['projects']['assets'][identity] = row
            state['databases']['projects']['audio'][identity] = {'id': identity, 'blob': blob}
            state.setdefault('projectImports', {})[identity] = True
            state['revision'] += 1
            self.commit(state)
            return {'id': identity, 'alreadySaved': False}

    def import_legacy(self, directory):
        root = Path(directory).expanduser().resolve()
        report = {'copied': 0, 'unchanged': 0, 'errors': []}
        if root.is_dir():
            for index, file in enumerate(root.glob('*/*/asset.json')):
                if index >= 10000:
                    report['errors'].append({'path': str(root), 'error': 'Scan limit reached. Split the legacy draft import.'})
                    break
                try:
                    file = safe(root, str(file.relative_to(root)))
                    require(file.stat().st_size <= 512 * 1024, 'Legacy metadata is too large.')
                    row = json.loads(file.read_bytes())
                    require(row.get('protocol') == 'capp.project-audio-asset.v1', 'Unknown native audio draft format.')
                    audio = safe(root, str((file.parent / 'take.wav').relative_to(root)))
                    require(audio.stat().st_size <= MAX_BLOB, 'Legacy recording is too large.')
                    data = audio.read_bytes()
                    require(sha(data) == row.get('wav', {}).get('sha256'), 'Legacy WAV checksum does not match its metadata.')
                    self.put_blob(sha(data), data)
                    project_id = row.get('projectId') or row.get('project', {}).get('id')
                    result = self.archive_project({'project': {'id': project_id, 'name': row.get('project', {}).get('name', project_id), 'legacyScope': file.parent.parent.name}, 'metadata': row.get('metadata', {}), 'blob': {'$blob': {'sha256': sha(data), 'size': len(data), 'type': 'audio/wav'}}, 'nativeSource': row})
                    report['unchanged' if result['alreadySaved'] else 'copied'] += 1
                except (OSError, ValueError, TypeError, KeyError, StorageError, wave.Error) as e:
                    report['errors'].append({'path': str(file), 'error': str(e)})
        self.legacy_report = report
        atomic(safe(self.root, '_service/legacy-import-report.json'), packed(report))
        return report

    def import_recovery(self, file):
        file = Path(file).expanduser().resolve()
        require(file.parent.name in ('recovered', 'migrations'), 'Choose a retained audio migration snapshot.')
        require(file.stat().st_size <= MAX_JSON, 'Recovery snapshot is too large.')
        source_root = file.parent.parent
        require(source_root != self.root, 'Recover into a separate audio folder, then connect it as another library.')
        value = json.loads(file.read_bytes())
        require(value.get('protocol') == PROTOCOL, 'Unsupported recovery snapshot.')
        databases = value.get('databases')
        require(isinstance(databases, dict), 'Missing recovery databases.')
        databases.setdefault('projects', {'assets': {}, 'audio': {}})
        for stores in databases.values():
            for row in stores.get('audio', {}).values():
                ref = row['blob']['$blob']
                require(re.fullmatch(r'[a-f0-9]{64}', ref['sha256']), 'Invalid recovered audio hash.')
                source = safe(source_root, '_blobs/' + ref['sha256'])
                require(source.stat().st_size == ref['size'] and source.stat().st_size <= MAX_BLOB, 'Recovered audio size mismatch.')
                self.put_blob(ref['sha256'], source.read_bytes())
        return self.migrate({'databases': databases})

    def materialize(self, databases):
        # Immutable snapshots expose ordinary WAV/JSON files, without trusting user titles as paths.
        for database, stores in databases.items():
            for collection, rows in stores.items():
                if collection == 'audio':
                    continue
                for key, row in rows.items():
                    record = {'record': row}
                    audio_key = ('reference:' + key if collection == 'characters' else 'take:' + key if collection == 'takes' else key)
                    if audio_key in stores.get('audio', {}):
                        record['audio'] = stores['audio'][audio_key]['blob']
                    data = packed(record)
                    folder = safe(self.root, 'drafts/' + database + '/' + collection + '/' + sha(key.encode()) + '/' + sha(data))
                    file = safe(self.root, str((folder / 'record.json').relative_to(self.root)))
                    if not file.exists():
                        folder.mkdir(parents=True, exist_ok=True)
                        if record.get('audio'):
                            wav = self.checked_blob(record['audio'])
                            target = safe(self.root, str((folder / ('reference.wav' if collection == 'characters' else 'take.wav')).relative_to(self.root)))
                            atomic(target, wav.read_bytes())
                            require(sha(target.read_bytes()) == record['audio']['$blob']['sha256'], 'Written audio did not verify.', 507)
                        atomic(file, data)
                    require(sha(file.read_bytes()) == sha(data), 'Saved record checksum mismatch.', 409)

    def commit(self, state):
        raw = packed(state)
        require(len(raw) <= MAX_JSON, 'Audio catalogue exceeds 64 MiB. Split the library before adding more records.')
        self.materialize(state['databases'])
        atomic(safe(self.root, '_history/' + sha(self.file.read_bytes()) + '.json'), self.file.read_bytes())
        atomic(self.file, raw)
        self.state = state

    def transaction(self, database, value):
        require(database in SCHEMA, 'Unknown audio collection.')
        request = value.get('requestId')
        require(isinstance(request, str) and re.fullmatch(r'[A-Za-z0-9_-]{16,100}', request), 'Missing write identity.')
        signature = sha(packed({'database': database, 'request': value}))
        with self.lock:
            previous = self.state['requests'].get(request)
            if previous:
                require(previous['signature'] == signature, 'Write identity was reused.', 409)
                return {'revision': previous['revision'], 'saved': True}
            require(type(value.get('expectedRevision')) is int and value['expectedRevision'] == self.state['revision'], 'Audio library changed in another window. Refresh and retry.', 409)
            ops = value.get('operations')
            require(isinstance(ops, list) and 0 < len(ops) <= 200000, 'Invalid audio transaction.')
            state = copy.deepcopy(self.state)
            for op in ops:
                name = op.get('store')
                require(name in SCHEMA[database], 'Unknown audio store.')
                rows = state['databases'][database][name]
                key = op.get('key')
                if op.get('type') == 'put':
                    row = op.get('value')
                    require(isinstance(row, dict) and key_for(database, name, row) == key, 'Record identity mismatch.')
                    if name == 'audio':
                        self.checked_blob(row.get('blob'))
                    rows[key] = row
                elif op.get('type') == 'delete':
                    require(isinstance(key, str), 'Invalid record identity.')
                    rows.pop(key, None)
                else:
                    raise StorageError('Unknown record operation.')
            self.validate(state['databases'], verify_audio=False)
            state['revision'] += 1
            state['requests'][request] = {'signature': signature, 'revision': state['revision']}
            if len(state['requests']) > 20000:
                oldest = min(state['requests'], key=lambda k: state['requests'][k]['revision'])
                del state['requests'][oldest]
            self.commit(state)
            return {'revision': state['revision'], 'saved': True}

    def migrate(self, value):
        databases = value.get('databases')
        self.validate(databases)
        signature = sha(packed(databases))
        with self.lock:
            if signature in self.state['imports']:
                return {**self.state['imports'][signature], 'alreadyImported': True}
            state = copy.deepcopy(self.state)
            count = sum(len(rows) for stores in databases.values() for name, rows in stores.items() if name != 'audio')
            conflicts = []
            seen = state.setdefault('importedRecords', {})
            fresh = copy.deepcopy(databases)
            for database, stores in databases.items():
                for name, rows in stores.items():
                    existing = state['databases'][database][name]
                    for key, row in rows.items():
                        record_hash = sha(packed([database, name, key, row]))
                        if record_hash in seen:
                            del fresh[database][name][key]
                            continue
                        if key in existing and existing[key] != row:
                            conflicts.append(database + '/' + name + '/' + key)
            recovery = bool(conflicts)
            if not recovery:
                for database, stores in fresh.items():
                    for name, rows in stores.items():
                        state['databases'][database][name].update(rows)
                try:
                    self.validate(state['databases'], verify_audio=False)
                except StorageError as error:
                    conflicts.append(str(error))
                    recovery = True
            if recovery:
                state = copy.deepcopy(self.state)
            else:
                for database, stores in databases.items():
                    for name, rows in stores.items():
                        for key, row in rows.items():
                            state.setdefault('importedRecords', {})[sha(packed([database, name, key, row]))] = True
            # All incoming metadata and referenced WAVs remain recoverable, even on name/ID conflicts.
            destination = ('recovered/' if recovery else 'migrations/') + signature + '.json'
            self.materialize(databases)
            atomic(safe(self.root, destination), packed({'protocol': PROTOCOL, 'databases': databases}))
            report = {'records': count, 'recovered': recovery, 'conflicts': conflicts[:100], 'path': str(self.root / destination), 'fingerprint': signature}
            state['imports'][signature] = report
            state['revision'] += 1
            self.commit(state)
            return report

    def catalogue(self):
        with self.lock:
            db = self.state['databases']
            overrides = {k: v.get('metadata', {}) for k, v in db['organizer']['items'].items()}
            entries = []
            def add(key, row, ref, title, category='', subject='', kind='sfx', collection='assets', database='sounds'):
                meta = overrides.get(key, {})
                title, category, subject = meta.get('title', title), meta.get('category', category), meta.get('subject', subject)
                record = {'record': row}
                if ref:
                    record['audio'] = ref
                folder = self.root / 'drafts' / database / collection / sha(row['id'].encode()) / sha(packed(record))
                entries.append({'id': key, 'title': title, 'folder': '/'.join(filter(None, [category, subject])), 'category': category, 'subject': subject,
                    'kind': kind, 'recorded': ref is not None, 'blob': ref, 'fingerprint': sha(packed({'record': record, 'metadata': meta})),
                    'diskPath': str(folder), 'audioPath': str(folder / ('reference.wav' if collection == 'characters' else 'take.wav')) if ref else None,
                    'metadata': {'title': title, 'kind': kind, 'category': category, 'subject': subject, 'tags': meta.get('tags', row.get('tags', [])), 'notes': meta.get('notes', row.get('notes', '')), 'source': row}})
            for key, row in db['sounds']['assets'].items():
                add('sound:' + key, row, db['sounds']['audio'].get(key, {}).get('blob'), row['title'], row.get('category', ''), row.get('subject', ''), row.get('assetType', row.get('kind', 'sfx')))
            for key, row in db['voice']['takes'].items():
                line = db['voice']['dialogues'].get(row['dialogueId'], {})
                category = db['voice']['types'].get(line.get('typeId'), {}).get('name', 'Dialogue')
                add('take:' + key, row, db['voice']['audio'].get('take:' + key, {}).get('blob'), line.get('title', 'Dialogue') + ' · take ' + key[:8], category, row.get('character', ''), 'dialogue', 'takes', 'voice')
            for key, row in db['voice']['characters'].items():
                if row.get('reference'):
                    add('reference:' + key, row, db['voice']['audio'].get('reference:' + key, {}).get('blob'), row['name'] + ' · reference', 'Voice references', row['name'], 'reference', 'characters', 'voice')
            for key, row in db['projects']['assets'].items():
                meta = row['metadata']
                add('project:' + key, row, db['projects']['audio'].get(key, {}).get('blob'), meta['title'], meta.get('category', 'Project drafts'), meta.get('subject', ''), meta.get('kind', 'sfx'), 'assets', 'projects')
                item = entries[-1]
                override = overrides.get('project:' + key, {})
                item['projectArchive'] = True
                item['metadata'].update(tags=override.get('tags', meta.get('tags', [])), notes=override.get('notes', meta.get('notes', '')))
            return {'assets': entries, 'revision': self.state['revision'], 'folders': list(db['organizer']['folders'].values())}


def public_origin(value):
    if not value:
        return None
    u = urlparse(value)
    require(u.scheme == 'https' and u.hostname and not u.username and not u.password and u.path in ('', '/') and not u.query and not u.fragment, 'Public origin must be an HTTPS origin without a path.')
    return 'https://' + u.netloc


def make_server(store, port=43194, app_root=None, external_origin=None):
    external_origin = public_origin(external_origin)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def headers_out(self, code, size, mime='application/json'):
            self.send_response(code)
            for key, val in {'Content-Type': mime, 'Content-Length': str(size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Private-Network': 'true'}.items():
                self.send_header(key, val)
            self.end_headers()

        def reply(self, value, status=200):
            data = packed(value)
            self.headers_out(status, len(data))
            self.wfile.write(data)

        def body(self, limit):
            require(not self.headers.get('Transfer-Encoding'), 'Chunked uploads are not supported.')
            size = int(self.headers.get('Content-Length', '-1'))
            require(0 <= size <= limit, 'Request exceeds storage limit.', 413)
            self.connection.settimeout(180)
            data = self.rfile.read(size)
            require(len(data) == size, 'Incomplete request.')
            return data

        def do_OPTIONS(self):
            self.headers_out(204, 0)

        def dispatch(self):
            try:
                hosts = {'127.0.0.1:' + str(self.server.server_port)}
                if external_origin:
                    hosts.add(urlparse(external_origin).netloc)
                require(self.headers.get('Host') in hosts, 'Unconfigured storage host.', 403)
                path = urlparse(self.path).path
                if path == '/' and self.command == 'GET' and app_root:
                    data = (Path(app_root) / 'index.html').read_bytes()
                    self.headers_out(200, len(data), 'text/html; charset=utf-8')
                    self.wfile.write(data)
                    return
                require(hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + store.token), 'Use the private link from Start-Audio-Asset-Storage.cmd.', 401)
                if path == '/v1/status' and self.command == 'GET':
                    return self.reply({'protocol': PROTOCOL, 'root': str(store.root), 'revision': store.state['revision'], 'role': 'audio', 'maxBlobBytes': MAX_BLOB, 'legacyMigration': store.legacy_report})
                if path == '/v1/assets' and self.command == 'GET':
                    return self.reply(store.catalogue())
                if path == '/v1/migrate' and self.command == 'POST':
                    return self.reply(store.migrate(json.loads(self.body(MAX_JSON))))
                if path == '/v1/project-draft' and self.command == 'POST':
                    return self.reply(store.archive_project(json.loads(self.body(MAX_JSON))))
                m = re.fullmatch(r'/v1/db/(voice|sounds|projects|organizer|preferences)(/transaction)?', path)
                if m and self.command == 'GET' and not m[2]:
                    return self.reply(store.snapshot(m[1]))
                if m and self.command == 'POST' and m[2]:
                    return self.reply(store.transaction(m[1], json.loads(self.body(MAX_JSON))))
                m = re.fullmatch(r'/v1/blobs/([a-f0-9]{64})', path)
                if m and self.command == 'PUT':
                    return self.reply(store.put_blob(m[1], self.body(MAX_BLOB)))
                if m and self.command == 'GET':
                    p = store.blob_path(m[1])
                    require(p.is_file(), 'Audio bytes are missing.', 404)
                    data = p.read_bytes()
                    require(sha(data) == m[1], 'Audio checksum mismatch.', 409)
                    self.headers_out(200, len(data), 'audio/wav')
                    self.wfile.write(data)
                    return
                m = re.fullmatch(r'/v1/blob-info/([a-f0-9]{64})', path)
                if m and self.command == 'GET':
                    p = store.blob_path(m[1])
                    if not p.is_file():
                        return self.reply({'exists': False})
                    require(sha(p.read_bytes()) == m[1], 'Stored audio checksum mismatch.', 409)
                    return self.reply({'exists': True, 'size': p.stat().st_size})
                raise StorageError('Unknown audio storage operation.', 404)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except StorageError as e:
                self.reply({'error': str(e)}, e.status)
            except (ValueError, TypeError, KeyError, wave.Error) as e:
                self.reply({'error': 'Invalid audio request: ' + str(e)}, 400)
            except OSError as e:
                self.reply({'error': 'Disk write/read failed. Previous versions retained. ' + str(e)}, 507)

        do_GET = do_POST = do_PUT = dispatch
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.home() / 'cApp' / 'assets' / 'audio')
    parser.add_argument('--port', type=int, default=43194)
    parser.add_argument('--app-root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--public-origin', help='Explicit HTTPS reverse-proxy origin. Listener remains loopback.')
    parser.add_argument('--legacy-drafts', type=Path, default=Path.home() / '.capp' / 'audio-drafts', help='Existing native Voice Lab draft queue to copy, retaining originals.')
    parser.add_argument('--recover', type=Path, help='Copy a retained migration snapshot into a separate --root for review.')
    args = parser.parse_args()
    store = AudioStore(args.root)
    try:
        if args.recover:
            recovery = store.import_recovery(args.recover)
            print('Recovery snapshot retained: ' + recovery['path'], flush=True)
        print('Checking existing native audio drafts…', flush=True)
        report = store.import_legacy(args.legacy_drafts) if not args.recover else store.legacy_report
        print('Native draft migration: %d copied, %d already retained, %d need attention.' % (report['copied'], report['unchanged'], len(report['errors'])), flush=True)
        server = make_server(store, args.port, args.app_root, args.public_origin)
        origin = public_origin(args.public_origin) or 'http://127.0.0.1:' + str(server.server_port)
        print('\nVoice Lab permanent audio storage\nFolder: ' + str(store.root) + '\n\nPrivate connection link:\n' + origin + '/#storage=' + store.token + '\n\nIn the EXISTING installed Voice Lab: Asset storage -> Connect & migrate.\nPaste this same link into Foundry -> Asset libraries.\nKeep this window running. Browser originals and previous disk revisions are retained.\n', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
    finally:
        store.close()


if __name__ == '__main__':
    try:
        main()
    except (StorageError, OSError, ValueError) as error:
        raise SystemExit('Audio storage could not start: ' + str(error))
