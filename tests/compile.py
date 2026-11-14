#!/usr/bin/env python3
"""Optional developer check against a local cApp checkout; no native compilation."""
import argparse, hashlib, json, sys, zipfile, re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--capp-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
args.output.mkdir(parents=True,exist_ok=True);sys.path[:0]=[str(args.capp_root),str(args.capp_root/'tools')]
from mcp.capp_mcp_server import CAppMcpCore
root=Path(__file__).resolve().parents[1]
version=re.search(r"export const LAB_VERSION = '([^']+)'",(root/'src/lab.mjs').read_text()).group(1)
core=CAppMcpCore(args.output/'workspace',user_projects_root=args.output/'projects')
core.user_project_create({'projectId':'voice-lab','name':'Voice Lab','appVersion':version})
# Compile exactly the standalone payload; docs/tests/reference data stay outside.
src=args.output/'source';src.mkdir(exist_ok=True);data=(root/'index.html').read_bytes();(src/'index.html').write_bytes(data)
core.user_project_bind_source_directory('voice-lab',str(src))
artifact=core.user_project_source_artifact('voice-lab','main',refresh=False)
params={'componentId':'main','sourceArtifactRef':artifact['artifactRef'],'siteId':'voice-lab','version':version,'configHandling':'embed','refresh':False}
analysis=core.user_project_compiler_analysis('voice-lab',params)['analysis']
plan=core.user_project_compiler_release_plan('voice-lab',{**params,'analysisKey':analysis['analysisKey']})['releasePlan']
release=core.user_project_compiler_finalise('voice-lab',{'componentId':'main','sourceArtifactRef':artifact['artifactRef'],'releasePlanKey':plan['releasePlanKey'],'refresh':False})['release']
assert release['productReadiness']['usableProduct'] is True
assert release['productReadiness']['backendRequired'] is False
assert release['productReadiness']['diagnosticPreviewOnly'] is False
package={'protocol':'capp.executable-factory-plan.v1','project':{'protocol':'capp.project-binding.v1','projectId':'voice-lab','name':'Voice Lab'},'app':{'appId':'voice-lab','name':'Voice Lab','version':version},'packageAuthority':{'protocol':'capp.package-source-authority.v1','mode':'immutable-compiler-release','artifactRef':release['artifactRef'],'releaseSha256':release['releaseSha256'],'projectId':'voice-lab','componentId':'main','siteId':'voice-lab','version':version,'source':'explicit-selected-compiler-release','mutable':False,'browserPayloadRequired':False},'runtime':{'protocol':'capp.executable-runtime.v1','mode':'local-compiler-release-ref','compilerReleaseArtifactRef':release['artifactRef'],'releaseSha256':release['releaseSha256'],'pageBundleEmbedded':False,'browserReleaseBytesRequired':False}}
core._factory_require_immutable_package_authority(package,'windows');resolved=core._factory_plan_with_local_compiler_release(package)
with zipfile.ZipFile(resolved['runtime']['localCompilerRelease']['releaseZipPath']) as z:
 compiled=z.read('index.html')
assert data in compiled
assert (src/'index.html').read_bytes()==data
(args.output/'compiled.html').write_bytes(compiled)
report={'sourceSha256':hashlib.sha256(data).hexdigest(),'release':release,'checks':['product ready','no backend required','not diagnostic only','immutable package admission','compiled payload preserves exact application','source unchanged'],'scope':'Actual cApp source analysis, release planning, finalisation and Windows package authority; no native binary build.'}
(args.output/'compiler-result.json').write_text(json.dumps(report,indent=2))
print('PASS',json.dumps({'checks':report['checks'],'sourceBytes':len(data),'compiledBytes':len(compiled),'artifactRef':release['artifactRef']},indent=2))
