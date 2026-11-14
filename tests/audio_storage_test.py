"""Real file transactions with injected disk failures; never touches user assets."""
import copy
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import wave
spec=importlib.util.spec_from_file_location('audio_storage',Path(__file__).resolve().parents[1]/'tools/audio_storage.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class AudioStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=m.AudioStore(self.tmp.name)
        buf=io.BytesIO()
        with wave.open(buf,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(44100);w.writeframes(bytes(88200))
        self.wav=buf.getvalue();key=m.sha(self.wav);self.store.put_blob(key,self.wav)
        self.ref={'$blob':{'sha256':key,'size':len(self.wav),'type':'audio/wav'}}
        self.db=copy.deepcopy(self.store.state['databases']);self.db['sounds']['assets']['door']={'id':'door','title':'Door','state':'ready','revision':1};self.db['sounds']['audio']['door']={'id':'door','blob':self.ref};self.store.migrate({'databases':self.db})
    def tearDown(self):self.store.close();self.tmp.cleanup()
    def write(self,ops):return self.store.transaction('sounds',{'expectedRevision':self.store.state['revision'],'requestId':'test-identity-123456789','operations':ops})
    def test_catalogue_commit_failure_retains_previous_snapshot(self):
        before=self.store.file.read_bytes();original=m.atomic
        def fail(path,data):
            if path==self.store.file:raise OSError('Disk full at commit')
            original(path,data)
        with patch.object(m,'atomic',fail):
            with self.assertRaises(OSError):self.write([{'type':'put','store':'assets','key':'door','value':{**self.db['sounds']['assets']['door'],'title':'Failed'}}])
        self.assertEqual(self.store.file.read_bytes(),before);self.assertEqual(self.store.snapshot('sounds')['stores']['assets']['door']['title'],'Door')
        self.store.close();self.store=m.AudioStore(self.tmp.name);self.assertEqual(self.store.snapshot('sounds')['stores']['assets']['door']['title'],'Door')
    def test_materialization_failure_never_publishes(self):
        before=self.store.file.read_bytes()
        with patch.object(m,'atomic',side_effect=OSError('Disk full')):
            with self.assertRaises(OSError):self.write([{'type':'put','store':'assets','key':'new','value':{'id':'new','title':'Failed','state':'draft'}}])
        self.assertEqual(self.store.file.read_bytes(),before)
    def test_incomplete_recording_and_dangling_dialogue_rejected(self):
        before=self.store.file.read_bytes()
        with self.assertRaises(m.StorageError):self.write([{'type':'delete','store':'audio','key':'door'}])
        self.assertEqual(self.store.file.read_bytes(),before)
        broken=copy.deepcopy(self.db);broken['voice']['dialogues']['x']={'id':'x','characterId':'absent'}
        with self.assertRaises(m.StorageError):self.store.migrate({'databases':broken})
    def test_second_writer_and_link_paths_rejected(self):
        with self.assertRaisesRegex(m.StorageError,'already has'):m.AudioStore(self.tmp.name)
        for value in ('../outside','C:\\outside','a'*63):
            with self.assertRaises(m.StorageError):self.store.blob_path(value)
        target=Path(self.tmp.name)/'drafts/sounds';target.mkdir(exist_ok=True)
        outside=Path(self.tmp.name)/'outside';outside.mkdir();(target/'assets').rename(target/'saved-assets');(target/'assets').symlink_to(outside,target_is_directory=True)
        with self.assertRaises(m.StorageError):self.write([{'type':'put','store':'assets','key':'new','value':{'id':'new','title':'Blocked','state':'draft'}}])
    def test_repeat_write_is_idempotent_and_stale_commit_rejected(self):
        req={'expectedRevision':self.store.state['revision'],'requestId':'test-request-123456789','operations':[{'type':'put','store':'assets','key':'door','value':{**self.db['sounds']['assets']['door'],'title':'Updated'}}]}
        a=self.store.transaction('sounds',req);b=self.store.transaction('sounds',req);self.assertEqual(a,b)
        with self.assertRaises(m.StorageError):self.store.transaction('sounds',{**req,'requestId':'another-request-123456'})
    def test_explicit_https_proxy_configuration_only(self):
        self.assertEqual(m.public_origin('https://audio.example.test/'),'https://audio.example.test')
        for value in ('http://audio.test','https://user:pass@audio.test','https://audio.test/path'):
            with self.assertRaises(m.StorageError):m.public_origin(value)
    def test_native_draft_migration_preserves_bytes_identity_and_originals(self):
        folder=Path(self.tmp.name)/'legacy/scope/old-id';folder.mkdir(parents=True)
        record={'protocol':'capp.project-audio-asset.v1','id':'old-id','projectId':'kestrel','metadata':{'title':'Native door','kind':'sfx','category':'Doors','subject':'Bridge'},'wav':{'sha256':m.sha(self.wav),'bytes':len(self.wav)}}
        (folder/'asset.json').write_bytes(m.packed(record));(folder/'take.wav').write_bytes(self.wav)
        report=self.store.import_legacy(folder.parents[1]);self.assertEqual(report['copied'],1)
        entry=next(r for r in self.store.catalogue()['assets'] if r.get('projectArchive'))
        self.assertEqual(Path(entry['audioPath']).read_bytes(),self.wav);self.assertEqual(entry['metadata']['source']['nativeSource']['id'],'old-id')
        self.assertEqual((folder/'take.wav').read_bytes(),self.wav);self.assertEqual(self.store.import_legacy(folder.parents[1])['unchanged'],1)
        key=entry['id'].removeprefix('project:')
        self.store.transaction('projects',{'expectedRevision':self.store.state['revision'],'requestId':'remove-project-1234567','operations':[{'type':'delete','store':'assets','key':key},{'type':'delete','store':'audio','key':key}]})
        self.store.import_legacy(folder.parents[1]);self.assertFalse(any(r.get('projectArchive') for r in self.store.catalogue()['assets']))
        self.assertEqual(Path(entry['audioPath']).read_bytes(),self.wav)
    def test_corrupt_native_draft_is_reported_without_changing_existing_audio(self):
        folder=Path(self.tmp.name)/'legacy/scope/bad';folder.mkdir(parents=True)
        (folder/'asset.json').write_bytes(m.packed({'protocol':'capp.project-audio-asset.v1','projectId':'kestrel','metadata':{'title':'Broken'},'wav':{'sha256':'a'*64}}));(folder/'take.wav').write_bytes(self.wav)
        before=self.store.file.read_bytes();report=self.store.import_legacy(folder.parents[1]);self.assertEqual(len(report['errors']),1);self.assertEqual(self.store.file.read_bytes(),before)
    def test_recovered_snapshot_opens_as_a_separate_usable_library(self):
        changed=copy.deepcopy(self.db);changed['sounds']['assets']['door']['title']='Conflicting copy'
        report=self.store.migrate({'databases':changed});self.assertTrue(report['recovered'])
        with tempfile.TemporaryDirectory() as target:
            recovered=m.AudioStore(target)
            try:
                recovered.import_recovery(report['path'])
                entry=recovered.catalogue()['assets'][0];self.assertEqual(entry['title'],'Conflicting copy');self.assertEqual(Path(entry['audioPath']).read_bytes(),self.wav)
            finally:recovered.close()
if __name__=='__main__':unittest.main()
