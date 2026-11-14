#!/usr/bin/env python3
"""Developer test: actual cApp JS clients, controlled native replies, real WebAudio.
Not a Kokoro/GGUF inference benchmark. No runtime fixture is bundled into index.html.
"""
from pathlib import Path
import argparse, base64, io, json, math, re, struct, wave
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--capp-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--browser',default='/usr/bin/chromium');a=p.parse_args()
root=Path(__file__).resolve().parents[1];a.output.mkdir(parents=True,exist_ok=True)
html=(root/'index.html').read_text();script=re.search(r'<script>([\s\S]*)</script>',html).group(1);markup=html.replace('<script>'+script+'</script>','')
local=a.capp_root/'sidecars/local-ai'
speech=(local/'runtime/local-speech.js').read_text();windows=(local/'platforms/windows/runtime/local-ai-shell.js').read_text();shared=(local/'platforms/android/runtime/local-ai-shell.js').read_text();css=(local/'platforms/android/runtime/local-ai-shell.css').read_text()
w=io.BytesIO()
with wave.open(w,'wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(24000);f.writeframes(b''.join(struct.pack('<h',int(180*math.sin(i*math.tau*440/24000))) for i in range(14400)))
audio=base64.b64encode(w.getvalue()).decode();checks=[];errors=[]
def check(name,condition):
 assert condition,name
 checks.append(name);print('PASS',name,flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=a.browser,headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page(viewport={'width':1360,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*',lambda r:r.abort())
 def boot(native=False, saved=None):
  page.set_content(markup)
  page.evaluate('''saved=>{
   window.__store=new Map(Object.entries(saved||{}));
   Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__store.get(k)||null,setItem:(k,v)=>__store.set(k,String(v)),removeItem:k=>__store.delete(k)}});
  }''',saved)
  if native:
   page.evaluate(r'''args=>{
    const append=Node.prototype.appendChild;
    Node.prototype.appendChild=function(child){if(child.tagName==='LINK'&&child.dataset.cappLocalAiStyle==='true')child.href='data:text/css;base64,'+btoa(args.css);return append.call(this,child);};
    window.__CAPP_EXECUTABLE_PLAN__={app:{id:'voice-lab-test',name:'Voice Lab'},library:{selected:[{id:'uk.capp.sidecar.local-ai',config:{startup:'hidden',applicationDefaultMode:'local',allowAppInference:true,applicationAccess:'scoped',allowAppSpeech:true,baselineStartupPolicy:'manual',baselineModelPreset:''}}]}};
    window.__CAPP_SIDECAR_STUDIO_INLINE_ENTRIES__=['capp-sidecars/local-ai/local-ai-runtime.js'];
    window.__fixture={commands:[],audio:args.audio,prepared:false,model:true,output:'Welcome aboard the Kestrel exploration ship. Our next destination is a quiet orbital station. Settle in and enjoy the view through the canopy.',tokenDelay:75,speechDelay:40,preparationDelay:240,failSpeech:false,activeText:0,activeVoice:0,maxText:0,maxVoice:0,cancelIds:new Set(),textJobs:new Map(),prepareJobs:new Map()};
    const f=__fixture,delay=ms=>new Promise(r=>setTimeout(r,ms));
    const emit=(type,payload)=>window.dispatchEvent(new CustomEvent('capp:local-ai-native-event',{detail:{type,payload}}));
    window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{
     const v=args.payloadJson?JSON.parse(args.payloadJson):{};f.commands.push({command,payload:v,at:performance.now()});
     if(command==='capp_local_ai_available')return true;
     if(command==='capp_local_ai_status')return JSON.stringify({status:f.model?'ready':'idle',currentModelId:f.model?'fixture-0.5b-no-neural-inference':null,generating:f.activeText>0,abi:'windows-x64',engineRevision:'controlled-test'});
     if(command==='capp_local_ai_list_models')return JSON.stringify({models:f.model?[{id:'fixture-0.5b-no-neural-inference',label:'Controlled test model'}]:[]});
     if(command==='capp_local_ai_new_conversation')return JSON.stringify({events:[{type:'conversation-ready',payload:{requestId:v.requestId,modelId:'fixture-0.5b-no-neural-inference'}}]});
     if(command==='capp_local_ai_complete'){
      const job={cancelled:false};f.textJobs.set(v.requestId,job);f.activeText++;f.maxText=Math.max(f.maxText,f.activeText);
      let output='';try{
       const text=v.maxTokens===3?'1':f.output;
       for(const token of text.match(/\S+\s*/g)||[]){await delay(f.tokenDelay);if(job.cancelled)throw new Error('local_ai_request_cancelled');output+=token;emit('token',{requestId:v.requestId,token});}
       return JSON.stringify({events:[{type:'complete',payload:{requestId:v.requestId,output}}]});
      }catch(e){return JSON.stringify({events:[{type:'error',payload:{requestId:v.requestId,error:e.message}}]});}
      finally{f.activeText--;f.textJobs.delete(v.requestId);}
     }
     if(command==='capp_local_ai_cancel'){const job=f.textJobs.get(v.requestId);if(job)job.cancelled=true;return JSON.stringify({ok:true});}
     if(command==='capp_local_ai_speech'){
      if(v.op==='status')return JSON.stringify({ok:true,supported:true,prepared:f.prepared,loaded:f.prepared,busy:f.activeVoice>0,managed:true,autoPrepare:true,protocol:'capp.local-speech.status.v1'});
      if(v.op==='ensure'||v.op==='prepare'){
       emit('speech-progress',{phase:'downloading',asset:'TEST FIXTURE · no actual download',bytes:512,totalBytes:1024});
       await delay(f.preparationDelay);
       if(f.cancelIds.has(v.requestId))return JSON.stringify({ok:false,error:'speech_cancelled'});
       f.prepared=true;emit('speech-progress',{phase:'ready',prepared:true});return JSON.stringify({ok:true,requestId:v.requestId,prepared:true,loaded:true,synthesisVerified:true});
      }
      if(v.op==='synthesize'){
       f.activeVoice++;f.maxVoice=Math.max(f.activeVoice,f.maxVoice);
       try{await delay(f.speechDelay);if(f.cancelIds.has(v.requestId))return JSON.stringify({ok:false,error:'speech_cancelled'});if(f.failSpeech)return JSON.stringify({ok:false,error:'speech_engine_test_failure'});
        return JSON.stringify({ok:true,requestId:v.requestId,sampleRate:24000,audioBase64:f.audio,durationSeconds:.6,synthesisMs:f.speechDelay});}
       finally{f.activeVoice--;}
      }
      if(v.op==='cancel'){f.cancelIds.add(v.requestId);return JSON.stringify({ok:true,cancelled:true});}
      if(v.op==='unload'){f.prepared=false;return JSON.stringify({ok:true,loaded:false});}
     }
     throw new Error('Unexpected test native command '+command);
    }};
   }''',{'css':css,'audio':audio})
   page.add_script_tag(content=speech);page.add_script_tag(content=windows);page.add_script_tag(content=shared)
   page.wait_for_function('window.capp?.ai?.local?.speech?.connect && window.__CAPP_MOBILE_LOCAL_AI__?.nativeReady',timeout=10000)
   page.evaluate('capp.ai.local.closeStudio()')
  page.add_script_tag(content=script);page.wait_for_timeout(100)
 try:
  boot(False)
  check('Standalone HTML boots without an injected Sidecar',page.locator('#preview-notice').is_visible())
  page.locator('#check').click();page.wait_for_timeout(100)
  check('Missing runtime is explained, not simulated as success','lab_sidecar_missing' in page.locator('#error-code').inner_text())
  page.locator('[data-mode=ship]').click();page.locator('[data-setting=shipVoice]').uncheck();page.locator('[data-ship-event=fleet]').click();page.wait_for_timeout(100)
  check('Ship simulator produces deterministic text without LLM or speech','19 hostile ships' in page.locator('#output').inner_text())
  page.locator('[data-mode=text]').click();page.locator('#prompt').fill('');page.locator('#run').click();page.wait_for_timeout(100)
  check('Empty prompts are rejected before dispatch','lab_input_limit' in page.locator('#error-code').inner_text())
  page.locator('#setup').click();check('Setup is an accessible native dialog',page.locator('#setup-dialog').is_visible());page.keyboard.press('Escape');check('Escape dismisses setup',not page.locator('#setup-dialog').is_visible())
  for width in [390,768,1360]:
   page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(80)
   check(f'No horizontal page overflow at {width}px',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
  # New page: prevents stale injected runtime globals or listeners from first fixture.
  page.close();page=b.new_page(viewport={'width':1360,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',lambda r:r.abort())
  boot(True)
  check('Actual managed speech and scoped text clients are installed',page.evaluate('capp.ai.local.speech.protocol === "capp.local-speech.v1" && capp.ai.local.protocol === "capp.local-ai-api.v2"'))
  speech_before=page.evaluate('__fixture.commands.filter(x=>x.command==="capp_local_ai_speech"&&["synthesize","ensure","prepare"].includes(x.payload.op)).length')
  page.locator('#check').click();page.wait_for_timeout(150)
  check('Passive readiness check starts no additional synthesis or preparation',page.evaluate('__fixture.commands.filter(x=>x.command==="capp_local_ai_speech"&&["synthesize","ensure","prepare"].includes(x.payload.op)).length')==speech_before)
  check('Text model identity is shown from scoped status','fixture-0.5b' in page.locator('#text-model').inner_text())
  page.locator('#enable-voice').click();page.wait_for_function('document.querySelector("#voice-state").textContent==="Ready to speak"',timeout=15000)
  check('Managed preparation is owned by the Local AI runtime whether startup or activation triggered it',page.evaluate('__fixture.commands.some(x=>x.command==="capp_local_ai_speech"&&["ensure","prepare"].includes(x.payload.op))'))
  page.screenshot(path=str(a.output/'managed-preparation-test.png'),full_page=True)
  page.locator('[data-mode=speak]').click();page.locator('#prompt').fill('The local voice path is being tested with a synthetic tone.');page.locator('#run').click();page.wait_for_function('!document.querySelector("#run").disabled',timeout=10000)
  check('TTS uses actual speech client and real WebAudio playback','synthetic tone' in page.locator('#spoken').inner_text())
  check('Speak-only path does not invoke a text completion',page.evaluate('!__fixture.commands.some(x=>x.command==="capp_local_ai_complete")'))
  check('First playback metric comes from actual client callback',page.locator('#first-audio').inner_text()!='—')
  page.locator('[data-mode=text]').click();page.locator('#prompt').fill('Three sentences.');base_calls=page.evaluate('__fixture.commands.filter(x=>x.payload.op==="synthesize").length');page.locator('#run').click();page.wait_for_function('!document.querySelector("#run").disabled',timeout=15000)
  check('Text-only streams through actual scoped complete()',page.locator('#output').inner_text().startswith('Welcome aboard'))
  check('Text-only leaves native speech synthesis untouched',page.evaluate('__fixture.commands.filter(x=>x.payload.op==="synthesize").length')==base_calls)
  check('Isolated text turn resets conversation through actual native adapter',page.evaluate('__fixture.commands.some(x=>x.command==="capp_local_ai_new_conversation")'))
  page.locator('[data-mode=together]').click();page.locator('#run').click();page.wait_for_function('document.querySelector("#overlap").classList.contains("active")',timeout=15000)
  check('Text request and actual playback overlap in the combined workflow',page.locator('#overlap').inner_text()!='—')
  page.wait_for_function('!document.querySelector("#run").disabled',timeout=15000)
  check('Combined workflow drains its queue before allowing another run',page.locator('#queue').inner_text()=='0')
  check('Native text and speech have independent bounded concurrency',page.evaluate('__fixture.maxText===1&&__fixture.maxVoice===1'))
  check('Text and voice use distinct scoped protocol names',page.evaluate('__CAPP_MOBILE_LOCAL_AI__.connections.some(x=>x.clientProtocol==="capp.voice-lab.text.v1")'))
  page.evaluate('''()=>{const n=document.createElement('div');n.id='fixture-label';n.textContent='INTEGRATION TEST · real cApp JavaScript / controlled model replies / synthetic audio, not Kokoro';n.style.cssText='padding:8px 20px;background:#382d1c;color:#edcc93;text-align:center;font:12px system-ui';document.body.prepend(n);}''')
  page.screenshot(path=str(a.output/'voice-lab-integrated-test.png'),full_page=True)
  page.locator('[name=delivery][value=complete]').check();page.locator('#run').click();page.wait_for_function('!document.querySelector("#run").disabled',timeout=15000)
  check('After-reply mode waits until text settlement before playback',page.locator('#overlap').inner_text()=='—')
  page.locator('[name=delivery][value=stream]').check()
  page.locator('#run').click();page.wait_for_function('document.querySelector("#voice-state").textContent==="Playing"',timeout=15000);page.locator('#stop-voice').click();page.wait_for_function('!document.querySelector("#run").disabled',timeout=15000)
  check('Stopping voice does not cancel the current text request',page.locator('#output').inner_text().endswith('canopy.'))
  check('No global GGUF unload is used by stop controls',page.evaluate('!__fixture.commands.some(x=>x.command==="capp_local_ai_unload")'))
  page.evaluate('__fixture.tokenDelay=250');page.locator('#run').click();page.wait_for_function('!document.querySelector("#stop-text").disabled');page.wait_for_timeout(350);page.locator('#stop-all').click()
  check('Stop-all keeps controls locked until original requests settle',page.locator('#run').is_disabled())
  page.wait_for_function('!document.querySelector("#run").disabled',timeout=15000)
  check('No stale speech queue resumes after stop-all',page.locator('#queue').inner_text()=='0')
  page.evaluate('__fixture.tokenDelay=40')
  page.locator('[data-mode=ship]').click();page.locator('[data-setting=shipVoice]').uncheck();page.locator('[data-setting=shipLlm]').check();page.locator('#ship-phrasing').select_option('narrate')
  page.locator('.advanced > summary').click()
  page.locator('#system').fill('Speak like a sardonic veteran navigator. Keep it terse.');page.locator('#system').dispatch_event('input')
  page.locator('[data-setting=maxTokens]').fill('64');page.locator('[data-setting=maxTokens]').dispatch_event('change')
  page.locator('[data-setting=temperature]').fill('1.1');page.locator('[data-setting=temperature]').dispatch_event('change')
  page.evaluate('__fixture.output="Nineteen hostiles on scope. Nine cruisers, ten fighters, one wing. Try not to scratch the paint."')
  page.locator('[data-ship-event=fleet]').click();page.wait_for_function('!document.querySelector("#run").disabled',timeout=15000)
  check('Ship Model narrator displays actual model prose rather than the old 0/1 template','Try not to scratch the paint' in page.locator('#output').inner_text())
  last=page.evaluate('__fixture.commands.filter(x=>x.command==="capp_local_ai_complete").at(-1).payload')
  check('Ship Model narrator forwards the custom system instruction','sardonic veteran navigator' in last.get('system',''))
  check('Ship Model narrator forwards configured temperature and output budget',last.get('temperature')==1.1 and last.get('maxTokens')==64)
  check('Ship Model narrator sends bounded telemetry facts','Observed hostile cruisers: 9' in last.get('prompt','') and 'Do not invent' in last.get('prompt',''))
  page.locator('#ship-phrasing').select_option('selector');page.evaluate('__fixture.output="THIS SHOULD BE IGNORED BY SELECTOR"');page.locator('[data-ship-event=fleet]').click();page.wait_for_function('!document.querySelector("#run").disabled',timeout=15000)
  check('Strict selector remains available as an explicit legacy mode','19 hostile ships detected' in page.locator('#output').inner_text())
  selector=page.evaluate('__fixture.commands.filter(x=>x.command==="capp_local_ai_complete").at(-1).payload')
  check('Strict selector visibly ignores general text controls by forcing its own parameters',selector.get('maxTokens')==3 and selector.get('temperature')==0)
  calls_before=page.evaluate('__fixture.commands.filter(x=>x.command==="capp_local_ai_complete").length');page.locator('[data-ship-event=critical]').click();page.wait_for_function('!document.querySelector("#run").disabled',timeout=15000)
  check('Critical ship event bypasses LLM in the actual UI',page.evaluate('__fixture.commands.filter(x=>x.command==="capp_local_ai_complete").length')==calls_before)
  check('Critical announcement reflects current simulated hull','10 percent' in page.locator('#output').inner_text())
  page.screenshot(path=str(a.output/'ship-simulator-integrated-test.png'),full_page=True)
  # Explicitly exercise text that would execute if interpolated into HTML.
  page.evaluate('__fixture.output="<img src=x onerror=window.__xss=1> This is literal generated text, not executable markup."')
  page.locator('[data-mode=text]').click();page.locator('#run').click();page.wait_for_function('!document.querySelector("#run").disabled',timeout=15000)
  check('Generated text is never inserted as executable HTML',page.evaluate('!window.__xss && !document.querySelector("#output img") && document.querySelector("#output").textContent.includes("<img")'))
  page.locator('#voice').select_option('af_heart');page.locator('[data-setting=maxTokens]').fill('48');page.locator('[data-setting=maxTokens]').dispatch_event('change');page.wait_for_timeout(100)
  check('Preferences save through a strict local settings record',page.evaluate('JSON.parse(__store.get("capp.voice-lab.preferences.v2")).voice==="af_heart"'))
  check('No prompts or output are stored in local preferences',page.evaluate('![...__store.values()].some(x=>x.includes("literal generated text"))'))
  check('Custom instruction is stored as an explicit local setting',page.evaluate('JSON.parse(__store.get("capp.voice-lab.preferences.v2")).customSystem.includes("sardonic veteran navigator")'))
  page.locator('.activity').evaluate('(e)=>e.open=true')
  with page.expect_download() as download:page.locator('#export').click()
  report=json.loads(Path(download.value.path()).read_text());check('Diagnostic export excludes generated text by default','output'not in report);check('Diagnostic export redacts custom system instruction by default',report['settings']['customSystem']=='[configured]')
  page.locator('#include-text').check()
  with page.expect_download() as download:page.locator('#export').click()
  report=json.loads(Path(download.value.path()).read_text());check('Explicit opt-in includes generated text in report','literal generated text' in report['output'])
  page.locator('#studio').click();check('Studio button opens the actual Local AI workspace',page.evaluate('document.querySelector("[data-capp-local-ai]")?.dataset.open==="true"') if page.locator('[data-capp-local-ai]').count() else page.evaluate('Array.from(document.querySelectorAll("[data-open=true]")).length>0'))
  page.evaluate('capp.ai.local.closeStudio()')
  for width in [390,768,1360]:
   page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(100)
   check(f'Integrated UI has no horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(a.output/'voice-lab-integrated-mobile.png'),full_page=True)
  check('Actual adapter/client run has no unhandled JS errors',not errors)
 finally:
  (a.output/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'scope':'Actual cApp shared/Windows text clients and managed speech JS; synthetic WAV; controlled native/model callbacks; no neural inference or device benchmark'},indent=2))
  b.close()
print('PASSED',len(checks),'browser checks')
