#!/usr/bin/env python3
"""Selective creative-suite handoff ZIP. Python 3.10+, standard library only.

Read-only by default. No model runtime, connection token or browser is required.
The optional history organizer moves old snapshots, never removes their content.
"""
import argparse
from contextlib import ExitStack, contextmanager
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
import time
from zipfile import ZipFile, ZIP_DEFLATED

PROTOCOL='capp.creative-suite-package.v1'
ROLES=('3d-lab','foundry','voice-lab','kestrel')
HEX=re.compile(r'[a-f0-9]{64}')
PRUNE={'.git','.svn','.capp','.venv','venv','node_modules','__pycache__','.cache','vendor','third_party','third-party','target','dist','bin','out','share','test-output','update-backups','capp-update-backups','backups','_service','_history','.foundry','migrations','recovered'}
EXT={'.c','.cc','.cpp','.cxx','.h','.hh','.hpp','.hxx','.inl','.inc','.cmake','.in','.rc','.js','.mjs','.cjs','.ts','.tsx','.jsx','.html','.css','.py','.ps1','.cmd','.bat','.json','.md','.txt','.toml','.yaml','.yml','.ini','.cfg','.glsl','.vert','.frag','.xml','.sha256','.ral'}
PRIVATE={'credentials.json','connection-token.txt','id_rsa','id_ed25519','.npmrc','.pypirc','creative-suite.local.json'}

def require(value,message):
    if not value:raise ValueError(message)

def packed(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def digest(data):return hashlib.sha256(data).hexdigest()
def file_hash(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def path_under(root,relative,allow_root=False):
    require(isinstance(relative,str) and '\\' not in relative and ':' not in relative,'Use a portable relative path.')
    p=PurePosixPath(relative)
    require(not p.is_absolute() and '..' not in p.parts and (relative or allow_root),'Path escapes its selected root.')
    root=Path(root).absolute()
    for parent in [root,*root.parents]:
        require(not parent.is_symlink() and not (getattr(parent.stat(follow_symlinks=False),'st_file_attributes',0)&0x400) if parent.exists() else not parent.is_symlink(),'Links and junctions are not exported.')
    current=root
    for part in p.parts:
        require(part not in ('.','..') and not re.search(r'[\x00-\x1f<>"|?*]',part) and part.rstrip(' .')==part,'Invalid selected path.')
        current=current/part
        require(not current.is_symlink() and not (getattr(current.stat(follow_symlinks=False),'st_file_attributes',0)&0x400) if current.exists() else not current.is_symlink(),'Links and junctions are not exported.')
    require(current.resolve().is_relative_to(root.resolve()),'Path escapes its selected root.')
    return current

def folder_hash(root,relative):
    path=path_under(root,relative);rows=[]
    for directory,dirs,files in os.walk(path,followlinks=False):
        for name in sorted(dirs+files):
            item=path_under(path,(Path(directory)/name).relative_to(path).as_posix());stat=item.stat()
            rows.append([item.relative_to(path).as_posix(),stat.st_size,stat.st_mtime_ns,stat.st_ctime_ns]);require(len(rows)<=10000,'Selected folder exceeds 10,000 entries.')
    return digest(packed(rows))

def read_json(root,relative,limit=64*1024**2):
    path=path_under(root,relative);require(path.is_file() and path.stat().st_size<=limit,'Missing or oversized metadata: '+relative)
    data=path.read_bytes();return json.loads(data),digest(data)

def slug(value):return re.sub(r'[^A-Za-z0-9._-]+','-',str(value)).strip('-')[:65] or 'asset'
def forbidden(relative):
    p=PurePosixPath(relative);parts=[s.casefold() for s in p.parts]
    return any(s in PRUNE or s.startswith('.env') or re.fullmatch(r'(build|cmake-build)(-.*)?',s) for s in parts) or p.name.casefold() in PRIVATE or p.suffix.lower() in ('.pem','.key','.pfx','.p12')

class Package:
    def __init__(self,roots,assets):
        self.roots=roots;self.assets=Path(assets);self.files={};self.generated={};self.guards={};self.items=[];self.warnings=[];self.omitted=[]
    def add(self,root,relative,destination,reason,expected=None):
        path=path_under(root,relative);require(path.is_file(),'Selected file is missing: '+relative)
        require(not forbidden(relative),'Protected content cannot be explicitly included: '+relative)
        require(not PurePosixPath(destination).is_absolute() and '..' not in PurePosixPath(destination).parts,'Invalid ZIP path.')
        sha=file_hash(path);require(expected is None or sha==expected,'Selected file changed or is damaged: '+relative)
        old=self.files.get(destination);require(old is None or old['sha256']==sha,'Conflicting ZIP paths: '+destination)
        self.files[destination]={'source':path,'bytes':path.stat().st_size,'sha256':sha,'reason':reason}
    def data(self,destination,value):self.generated[destination]=packed(value)
    def source(self,role,root):
        for directory,dirs,files in os.walk(root,followlinks=False):
            parent=Path(directory);rel_parent=parent.relative_to(root).as_posix()
            kept=[]
            for name in sorted(dirs):
                rel=(parent/name).relative_to(root).as_posix()
                if forbidden(rel) or (parent/name).is_symlink() or rel.startswith('workspaces/assets') or rel.endswith('project_assets/labs'):
                    self.omitted.append({'project':role,'path':rel+'/','reason':'Dependency, private state, history or generated content'});continue
                try:path_under(root,rel)
                except (ValueError,OSError):self.omitted.append({'project':role,'path':rel+'/','reason':'Link or unavailable folder'});continue
                kept.append(name)
            dirs[:]=kept
            for name in sorted(files):
                path=parent/name;rel=path.relative_to(root).as_posix()
                if forbidden(rel):continue
                if path.is_symlink():continue
                if path.suffix.lower() not in EXT or name in {'3d-lab.txt','voice-lab.txt','kestrel.txt','foundry.txt'} or (path.stat().st_size>1024**2 and path.suffix.lower() in {'.json','.txt','.xml','.ral'}) or ('/validation/' in '/'+rel and path.suffix.lower()!='.md'):
                    self.omitted.append({'project':role,'path':rel,'bytes':path.stat().st_size,'reason':'Unselected media/data or historical evidence'});continue
                self.add(root,rel,role+'/'+rel,'current source')
    def blobs(self,root,value,base):
        """Collect every content reference and preserve the exact bundle metadata."""
        mapping={}
        def walk(v):
            if isinstance(v,dict) and '$blob' in v:
                b=v['$blob'];require(HEX.fullmatch(b.get('sha256','')) and type(b.get('size')) is int,'Invalid blob descriptor.')
                key=b['sha256'];extension={'model/gltf-binary':'.glb','audio/wav':'.wav','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}.get(b.get('type'),'.bin')
                dest='content/'+key+extension
                # Blob folders are internal content, not private service state.
                self.add(root,'_blobs/'+key,dest,'selected asset content',key);require(self.files[dest]['bytes']==b['size'],'Blob size does not match its metadata.');mapping[key]=dest
            elif isinstance(v,dict):
                for x in v.values():walk(x)
            elif isinstance(v,list):
                for x in v:walk(x)
        walk(value);self.data(base+'/CONTENT-MAP.json',mapping);return mapping
    def models(self,explicit=()):
        root=self.assets/'3d'
        if not (root/'catalogue.json').exists():
            require(not explicit,'The shared 3D catalogue is missing.');return
        index,sha=read_json(root,'catalogue.json');require(index.get('format')=='capp.3d-lab.disk.v1','Unsupported 3D catalogue.');self.guards[root/'catalogue.json']=sha
        wanted=set(explicit)|{id for id,row in index['assets'].items() if row['asset'].get('workPackage') is True}
        visited=set()
        def collect(id,expected=None,dependency=False):
            require(isinstance(id,str),'Invalid source asset identity.')
            entry=index['assets'].get(id) or index.get('deleted',{}).get(id)
            if not entry:
                if dependency:self.warnings.append('Original shared source '+id+' is unavailable; its saved provenance is retained.');return
                raise ValueError('Selected shared model is missing: '+id)
            fp=entry['fingerprint'];require(HEX.fullmatch(fp),'Invalid shared revision identity.')
            def read_record(fp):
                for parent in ('drafts/','_history/drafts/'):
                    relative=parent+id+'/'+fp+'/record.json'
                    if path_under(root,relative).is_file():
                        b,h=read_json(root,relative);require(h==fp and b['asset']['id']==id,'Shared record checksum mismatch.');return b
                return None
            bundle=read_record(fp)
            if expected and (not bundle or bundle['asset']['sha256']!=expected):
                bundle=None
                for parent in ('drafts/','_history/drafts/'):
                    directory=path_under(root,parent+id)
                    if not directory.is_dir():continue
                    for folder in sorted(directory.iterdir()):
                        if not HEX.fullmatch(folder.name):continue
                        candidate=read_record(folder.name)
                        if candidate and candidate['asset']['sha256']==expected:bundle=candidate;fp=folder.name;break
                    if bundle:break
            if not bundle:
                if dependency:self.warnings.append('Exact original shared source '+id+' / '+str(expected)+' is unavailable.');return
                raise ValueError('Selected shared record is missing: '+id)
            if (id,fp) in visited:return
            visited.add((id,fp));asset=bundle['asset'];base='selected/3d/'+slug(asset['title'])+'-'+slug(id)+'-'+fp[:12];self.data(base+'/record.json',bundle);mapping=self.blobs(root,bundle,base)
            for key,name in [('actionDocument','action.json'),('shapeDocument','shape.json')]:
                if bundle['files'].get(key) is not None:self.data(base+'/'+name,bundle['files'][key])
            self.items.append({'role':'3d','id':id,'name':asset['title'],'revision':asset['revision'],'fingerprint':fp,'dependency':dependency,'record':base+'/record.json','model':mapping[bundle['files']['glb']['$blob']['sha256']],'notes':asset.get('workNotes','')})
            source=(bundle['files'].get('actionDocument') or {}).get('source')
            if isinstance(source,dict) and source.get('id') and source.get('sha256'):collect(source['id'],source['sha256'],True)
            edit=asset.get('edit')
            if isinstance(edit,dict) and edit.get('parentId') and edit.get('parentSha256'):collect(edit['parentId'],edit['parentSha256'],True)
        for id in sorted(wanted):collect(id)
    def project(self,explicit=(),scene_ids=()):
        root=self.roots['kestrel'];config_path='assets/creative-suite.json';config={'assets':{},'scenes':[],'files':[]}
        if (root/config_path).exists():config,sha=read_json(root,config_path,2*1024**2);self.guards[root/config_path]=sha;require(config.get('protocol')=='capp.creative-suite.v1','Unsupported project scene document.')
        if not (root/'workspaces/assets/registry.json').exists():
            require(not explicit and not scene_ids and not any(a.get('include') for a in config.get('assets',{}).values()) and not any(a.get('include') for a in config.get('scenes',[])),'Open this project in Foundry before exporting selected project assets.')
            self.warnings.append('This project has no Foundry registry yet; shared assets and source are still included.');return
        state,sha=read_json(root,'workspaces/assets/registry.json',16*1024**2);self.guards[root/'workspaces/assets/registry.json']=sha
        self.add(root,'workspaces/assets/registry.json','kestrel/workspaces/assets/registry.json','current project registry metadata',sha)
        require(not config.get('projectId') or config['projectId']==state['project']['id'],'Scene document belongs to another project.')
        assets=set(explicit)|{id for id,row in config['assets'].items() if row.get('include') is True};revisions=set();scenes=[]
        for s in config['scenes']:
            if s.get('include') is True or s['id'] in scene_ids:
                scenes.append(s);assets.update(i['assetId'] for i in s['instances']);revisions.update(i['revisionId'] for i in s['instances']);revisions.update(c['revisionId'] for c in s['audio'])
        require(set(scene_ids)<={s['id'] for s in scenes},'A selected scene is missing.')
        visited=set()
        def visit(id,chain=()):
            require(id not in chain,'Cyclic project assembly.');require(id in state['assets'],'Missing project dependency: '+id)
            if id in visited:return
            visited.add(id);a=state['assets'][id]
            for rid in [a['slots'].get('model'),a['slots'].get('movement'),*a['slots'].get('sounds',{}).values()]:
                if rid:revisions.add(rid)
            for cfg in a.get('soundSettings',{}).values():revisions.update(cfg.get('variants',[]))
            for n in a.get('assembly',{}).get('attachments',[]):visit(n['assetId'],(*chain,id))
        for id in list(assets):visit(id)
        # Resolve linked equipment models carried by selected Action Lab recipes.
        done=set()
        while revisions-done:
            for rid in list(revisions-done):
                require(rid in state['revisions'],'Missing selected project revision: '+rid);rec=state['revisions'][rid];done.add(rid)
                if rec.get('recipePath'):
                    recipe,_=read_json(root,rec['recipePath'],24*1024**2)
                    for item in ((recipe.get('actionDocument') or {}).get('equipment') or {}).get('items',[]):
                        reference=item.get('asset') or {};linked=reference.get('id')
                        if linked in state['assets']:visit(linked)
                        elif linked:self.warnings.append('Equipment '+str(linked)+' has no project model; its proxy remains explicit.')
                        pinned=reference.get('revision')
                        if pinned:revisions.add(pinned)
        for rid in sorted(revisions):
            rec=state['revisions'][rid];self.add(root,rec['path'],'kestrel/'+rec['path'],'selected project revision',rec['sha256'])
            if rec.get('recipePath'):self.add(root,rec['recipePath'],'kestrel/'+rec['recipePath'],'editable project recipe')
        selected_state={**state,'assets':{id:state['assets'][id] for id in sorted(visited)},'revisions':{rid:state['revisions'][rid] for rid in sorted(revisions)},'history':[]}
        self.data('project-context/registry.json',selected_state);self.data('project-context/scenes.json',{'protocol':'capp.foundry-scenes.v1','projectId':state['project']['id'],'scenes':scenes})
        for id in sorted(visited):self.items.append({'role':'project','id':id,'name':state['assets'][id]['name'],'dependency':id not in assets,'notes':config['assets'].get(id,{}).get('notes','')})
        for scene in scenes:self.items.append({'role':'scene','id':scene['id'],'name':scene['name'],'notes':scene.get('notes','')})
        for f in config.get('files',[]):
            if not f.get('include'):continue
            scope=f['scope'];base=self.assets if scope=='shared' else root/'assets';relative=f['path'];path=path_under(base,relative);require(path.exists(),'Selected file/folder is missing: '+relative)
            if path.is_dir():
                # Same directory fingerprint as the local Files service.
                rows=[]
                for directory,dirs,files in os.walk(path):
                    for name in sorted(dirs+files):
                        p=Path(directory)/name;rel=p.relative_to(path).as_posix();path_under(path,rel);st=p.stat();rows.append([rel,st.st_size,st.st_mtime_ns,st.st_ctime_ns]);require(len(rows)<=10000,'Selected folder exceeds 10,000 entries.')
                require(digest(packed(rows))==f['fingerprint'],'Selected folder changed. Refresh its work selection: '+relative)
                self.folder_guards=getattr(self,'folder_guards',[])+[(base,relative,f['fingerprint'])]
                for directory,dirs,files in os.walk(path):
                    dirs[:]=[d for d in dirs if not forbidden((Path(directory)/d).relative_to(base).as_posix())]
                    for name in files:
                        rel=(Path(directory)/name).relative_to(base).as_posix()
                        if not forbidden(rel):self.add(base,rel,'selected/files/'+scope+'/'+rel,'explicit folder selection')
            else:self.add(base,relative,'selected/files/'+scope+'/'+relative,'explicit file selection',f['fingerprint'])
    def export(self,output,dry_run=False):
        for role,root in self.roots.items():self.source(role,root)
        count=len(self.files)+len(self.generated);size=sum(v['bytes'] for v in self.files.values())+sum(map(len,self.generated.values()))
        summary={'selected':self.items,'files':count,'bytes':size,'warnings':self.warnings,'dryRun':dry_run}
        if dry_run:return summary
        output=Path(output);output.parent.mkdir(parents=True,exist_ok=True);require(not output.exists(),'Choose a new ZIP path.')
        handle=tempfile.NamedTemporaryFile(prefix='creative-suite-',suffix='.partial',dir=output.parent,delete=False);partial=Path(handle.name);handle.close()
        records=[]
        try:
            with ZipFile(partial,'w',ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
                for dest,row in sorted(self.files.items()):
                    require(file_hash(row['source'])==row['sha256'],'Source changed during export. Run again: '+dest);z.write(row['source'],dest);require(file_hash(row['source'])==row['sha256'],'Source changed while copying. Run again: '+dest);records.append({'path':dest,'bytes':row['bytes'],'sha256':row['sha256'],'reason':row['reason']})
                for dest,data in sorted(self.generated.items()):z.writestr(dest,data);records.append({'path':dest,'bytes':len(data),'sha256':digest(data),'reason':'selected metadata'})
                for path,sha in self.guards.items():require(file_hash(path)==sha,'A catalogue or scene changed during export. Run again.')
                manifest={'protocol':PROTOCOL,'createdUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceRoles':list(self.roots),'selected':self.items,'files':records,'warnings':self.warnings,'omitted':self.omitted,'completeBackup':False,'nativeRuntimeValidated':False}
                z.writestr('WORK-PACKAGE.json',packed(manifest))
                notes=['# Creative suite work package','', 'Current source for the four supplied app roles plus explicitly selected assets and dependency revisions. Apply returned changes to the full original projects. This package omits installed runtimes, weights, vendor folders, backups, credentials and unselected media.','', 'Models and recordings are content-addressed under content/ or retained at their project-relative paths. Use WORK-PACKAGE.json and CONTENT-MAP.json; filenames are never used to guess asset identity. project-context/registry.json is a selected snapshot, not a replacement for the live project registry. Scene definitions are authoring/preview data; native playback requires an explicit game adapter.','', '## Selected work']
                notes += [f"- {item['role']} / {item['name']} ({item['id']}): {item.get('notes') or 'No work note supplied.'}" for item in self.items]
                if not self.items:notes.append('No assets selected. Tick Include in work ZIP in 3D Lab or Foundry and save that selection before exporting.')
                z.writestr('HANDOFF.md','\n'.join(notes)+'\n')
            verify(partial)
            # Recheck authoritative pointers after the full archive read-back.
            for path,sha in self.guards.items():require(file_hash(path)==sha,'A catalogue changed while verifying. Run again.')
            for base,relative,sha in getattr(self,'folder_guards',[]):require(folder_hash(base,relative)==sha,'A selected folder changed during export. Refresh its selection and retry.')
            os.replace(partial,output)
        finally:partial.unlink(missing_ok=True)
        return {**summary,'output':str(output),'zipBytes':output.stat().st_size,'sha256':file_hash(output)}

def verify(path):
    with ZipFile(path) as z:
        require(z.testzip() is None,'ZIP integrity check failed.');m=json.loads(z.read('WORK-PACKAGE.json'));require(m['protocol']==PROTOCOL,'Unsupported work package.')
        require(len(z.namelist())==len(set(z.namelist()))==len(m['files'])+2,'Duplicate or unexpected ZIP entries.')
        for row in m['files']:
            h=hashlib.sha256();size=0
            with z.open(row['path']) as stream:
                for block in iter(lambda:stream.read(1024*1024),b''):h.update(block);size+=len(block)
            require(size==row['bytes'] and h.hexdigest()==row['sha256'],'ZIP checksum mismatch: '+row['path'])
    return True

@contextmanager
def writer_lock(root):
    path=path_under(root,'_service/writer.lock');f=path.open('r+b');f.seek(0)
    try:
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError as error:raise ValueError('Close the Lab/Files storage owner before organizing history.') from error
        yield
    finally:f.close()

def archive_history(assets,dry_run=False):
    root=Path(assets)/'3d';moves=[]
    with writer_lock(root):
        index,_=read_json(root,'catalogue.json')
        keep={(id,row['fingerprint']) for id,row in index['assets'].items()}
        for id_dir in path_under(root,'drafts').iterdir():
            require(not id_dir.is_symlink(),'Linked draft folder.');
            if not id_dir.is_dir():continue
            for folder in id_dir.iterdir():
                if (id_dir.name,folder.name) in keep or not HEX.fullmatch(folder.name):continue
                record,sha=read_json(root,folder.relative_to(root).as_posix()+'/record.json');require(sha==folder.name,'Historical record checksum mismatch.')
                destination=path_under(root,'_history/drafts/'+id_dir.name+'/'+folder.name);require(not destination.exists(),'History destination already exists; originals retained.')
                moves.append({'from':folder.relative_to(root).as_posix(),'to':destination.relative_to(root).as_posix()})
        if not dry_run:
            for move in moves:
                source=path_under(root,move['from']);target=path_under(root,move['to']);target.parent.mkdir(parents=True,exist_ok=True);os.rename(source,target)
    return moves

def configuration(args):
    root=args.root.absolute();path=args.config or root/'creative-suite.local.json';config=json.loads(path.read_text()) if path.exists() else {'projects':{},'assetsRoot':str(Path.home()/'cApp/assets')}
    require(isinstance(config.get('projects'),dict),'Invalid suite configuration.')
    for value in args.project:
        role,sep,folder=value.partition('=');require(sep and role in ROLES,'Use --project role=folder.');config['projects'][role]=folder
    markers={'3d-lab':'src/action-lab.mjs','foundry':'foundry.py','voice-lab':'src/lab.mjs','kestrel':'capp-audio-project.json'}
    for role,marker in markers.items():
        if (root/marker).is_file():config['projects'].setdefault(role,str(root))
    for role in ROLES:
        if role not in config['projects']:
            candidates=[root if root.name.lower()==role else root/role,root.parent/role,Path.home()/'cApp/projects'/role,Path.home()/role]
            found=next((p for p in candidates if (p/'memory.md').is_file()),None)
            if found:config['projects'][role]=str(found)
    for role in ROLES:
        if args.configure or role not in config['projects']:
            require(sys.stdin.isatty(),'Configure the source roots first: --project '+role+'=PATH (all four roles are required).')
            before=config['projects'].get(role,'');value=input(role+' source folder'+(' ['+before+']' if before else '')+': ').strip().strip('"');config['projects'][role]=value or before
    if args.assets_root:config['assetsRoot']=str(args.assets_root)
    if args.configure and sys.stdin.isatty():config['assetsRoot']=input('Shared assets folder ['+config['assetsRoot']+']: ').strip().strip('"') or config['assetsRoot']
    roots={role:Path(config['projects'][role]).expanduser().absolute() for role in ROLES}
    require(all(p.is_dir() and (p/markers[role]).is_file() for role,p in roots.items()),'A source folder is missing or is the wrong app. Run --configure and choose the four app source roots.')
    require(len({str(p.resolve()).casefold() for p in roots.values()})==4,'Choose four distinct source folders.')
    if not args.dry_run:
        path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(config,indent=2)+'\n')
    return roots,Path(config['assetsRoot']).expanduser()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--config',type=Path);parser.add_argument('--project',action='append',default=[]);parser.add_argument('--assets-root',type=Path);parser.add_argument('--configure',action='store_true');parser.add_argument('--model-id',action='append',default=[]);parser.add_argument('--asset-id',action='append',default=[]);parser.add_argument('--scene-id',action='append',default=[]);parser.add_argument('--archive-history',action='store_true');parser.add_argument('--dry-run',action='store_true');parser.add_argument('--output',type=Path);parser.add_argument('--verify',type=Path);args=parser.parse_args()
    try:
        if args.verify:verify(args.verify);print('Work package hashes verified.');return 0
        roots,assets=configuration(args)
        if args.archive_history:print(json.dumps({'historyMoves':archive_history(assets,args.dry_run),'dryRun':args.dry_run},indent=2))
        package=Package(roots,assets);package.models(args.model_id);package.project(args.asset_id,args.scene_id);output=args.output or args.root/'share'/('creative-suite-'+time.strftime('%Y%m%d-%H%M%S')+'.zip');result=package.export(output,args.dry_run);print(json.dumps(result,indent=2));return 0
    except (ValueError,OSError,KeyError,TypeError) as error:print('No work ZIP completed: '+str(error),file=sys.stderr);return 1
if __name__=='__main__':raise SystemExit(main())
