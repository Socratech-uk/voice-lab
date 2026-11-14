import assert from 'node:assert/strict';
import { CappBridge } from '../src/bridge.mjs';
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS',name);};
const selected={library:{selected:[{id:'uk.capp.sidecar.local-ai'}]}};
check('Plain web preview is distinct from installed connection failure',()=>assert.equal(new CappBridge({}).missingError().message,'lab_sidecar_missing'));
for(const [name,scope] of [['compiled',{__CAPP_PACKAGED_RUNTIME__:true}],['native-origin',{location:{hostname:'tauri.localhost'}}],['native-marker',{__TAURI_INTERNALS__:{}}]]){
 check(name+' is not described as an ordinary browser',()=>assert.equal(new CappBridge(scope).missingError().message,'lab_app_bridge_unavailable'));
}
check('Selected Local AI still needs a delivered app bridge',()=>assert.equal(new CappBridge({__CAPP_PACKAGED_RUNTIME__:true,__CAPP_EXECUTABLE_PLAN__:selected}).missingError().message,'lab_app_bridge_unavailable'));
check('Explicit absent selection is reported separately',()=>assert.equal(new CappBridge({__CAPP_PACKAGED_RUNTIME__:true,__CAPP_EXECUTABLE_PLAN__:{library:{selected:[]}}}).missingError().message,'lab_sidecar_not_selected'));
check('Factory hook may refresh only the same document',()=>{const s={__CAPP_PACKAGED_RUNTIME__:true,__CAPP_EXECUTABLE_PLAN__:selected};let calls=0;s.__CAPP_REFRESH_LOCAL_AI_APP__=()=>{calls++;s.capp={ai:{local:{connect(){}}}};};const b=new CappBridge(s);b.retryConnection();assert.equal(calls,1);assert(b.available().text);});
check('No parent provider search even in installed context',()=>{const b=new CappBridge({__CAPP_PACKAGED_RUNTIME__:true,parent:{get capp(){throw Error('must not read parent');}}});assert.throws(()=>b.local(),/lab_app_bridge_unavailable/);});
check('Optional scoped text disposal is used without unloading',()=>{
 let td=0,vd=0,unload=0;
 const api={connect:()=>({dispose(){td++;}}),unload(){unload++;},speech:{connect:()=>({dispose(){vd++;}})}};
 const b=new CappBridge({capp:{ai:{local:api}}});b.textClient();b.voiceClient();b.dispose();assert.deepEqual([td,vd,unload],[1,1,0]);
});
check('No bridge descriptor means no inferred model readiness',()=>{const b=new CappBridge({__CAPP_LOCAL_AI_APP_BRIDGE__:{status:'waiting'},__CAPP_PACKAGED_RUNTIME__:true});assert.deepEqual(b.available(),{text:false,voice:false});assert.equal(b.contextInfo().delivery,'waiting');});
console.log(`PASSED ${count} connection diagnostics checks`);
