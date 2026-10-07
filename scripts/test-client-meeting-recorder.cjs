// Uses isolated browser contexts, native IndexedDB, and a small hook runner.
// Lifecycle cases mock the microphone; real_container also checks actual MediaRecorder output.
// No Firebase, customer records, or external API calls are made.
const ts = require('typescript');
const {readFileSync, existsSync} = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.MEETING_TEST_CHROME_PATH || (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined);
const compiled = {};
for (const [id,path] of Object.entries({local:'src/lib/client-meeting-local.ts',hook:'src/hooks/use-client-meeting-recorder.ts'})) compiled[id]=ts.transpileModule(readFileSync(root+'/'+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
(async()=>{
 const server=http.createServer((req,res)=>res.end('<html></html>')); await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try {
  browser=await chromium.launch({headless:true,executablePath,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 } catch (error) {
  server.close();
  throw new Error('Chrome is niet beschikbaar. Stel MEETING_TEST_CHROME_PATH in op een bestaande Chrome-installatie of installeer zelf de Playwright Chromium-browser. '+error.message);
 }
 try {
  const tests = ['basic','start_failure','rotate_failure','hidden','storage_failure','timeout_recovery','spontaneous_stop','upload_retry','unmount','real_container'];
  for (const name of tests) {
   const context=await browser.newContext(); const page=await context.newPage(); await page.goto('http://127.0.0.1:'+server.address().port);
   const result=await page.evaluate(async({compiled,name})=>{
    const assert=(v,m)=>{if(!v)throw new Error(m)};
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const originalSetTimeout=window.setTimeout.bind(window);
    window.setTimeout=(fn,ms,...args)=>originalSetTimeout(fn, ms===8000 ? 30 : (ms===60000 && name==='rotate_failure' ? 25 : ms),...args);
    const fake={getUserMediaCalls:0,startCalls:0,throwStartAt:0,stopTimeout:false,decodeFails:false,recorders:[],tracks:[],requests:[],httpFailure:false};
    class FakeRecorder extends EventTarget {
     static isTypeSupported(){return true}
     constructor(stream,options){super();this.state='inactive';this.mimeType=options.mimeType;fake.recorders.push(this)}
     start(){fake.startCalls++;if(fake.startCalls===fake.throwStartAt)throw new Error('Recorder start failed');this.state='recording';}
     pause(){this.state='paused'}
     emit(){this.ondataavailable?.({data:new Blob(['test-audio'],{type:this.mimeType})})}
     stop(){this.state='inactive';if(fake.stopTimeout)return;queueMicrotask(()=>{this.emit();this.onstop?.()})}
     spontaneous(){this.state='inactive';this.emit();this.onstop?.()}
    }
    if(name!=='real_container') window.MediaRecorder=FakeRecorder;
    if(name!=='real_container') Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{fake.getUserMediaCalls++;const track={stop(){this.stopped=true},stopped:false,onended:null,onmute:null};fake.tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]}}}});
    if(name!=='real_container') window.AudioContext=class {async decodeAudioData(){if(fake.decodeFails)throw new Error('decode failed');return {length:50,numberOfChannels:1,sampleRate:1000,duration:.05,getChannelData:()=>new Float32Array(50)}}async close(){}};
    window.fetch=async(url,options)=>{fake.requests.push({url,options});return new Response(JSON.stringify(fake.httpFailure&&url.endsWith('/process')?{error:'Queue unavailable'}:{ok:true}),{status:fake.httpFailure&&url.endsWith('/process')?503:200,headers:{'Content-Type':'application/json'}})};
    let states=[],refs=[],effects=[],cursor=0,refCursor=0,effectCursor=0,renderQueued=false,current;
    const rerender=()=>{if(renderQueued)return;renderQueued=true;queueMicrotask(()=>{renderQueued=false;render()})};
    const react={useState(initial){let i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;rerender()}]},useRef(initial){let i=refCursor++;return refs[i]||=( {current:initial})},useEffect(fn){let i=effectCursor++;if(!effects[i])effects[i]={fn}}};
    const modules={};
    function req(id){if(id==='react')return react;if(id==='@/firebase')return {useUser:()=>({user:{uid:'user-1',getIdToken:async()=> 'test-token'}})};if(id==='@/lib/client-meetings')return {MEETING_MAX_CHUNK_BYTES:12*1024*1024,MEETING_MAX_DURATION_MS:90*60000};if(id==='@/lib/client-meeting-local')return modules.local;throw new Error('unknown '+id)}
    for(const id of ['local','hook']){const mod={exports:{}};new Function('require','module','exports',compiled[id])(req,mod,mod.exports);modules[id]=mod.exports}
    function render(){cursor=refCursor=effectCursor=0;current=modules.hook.useClientMeetingRecorder('user-1')}
    render();for(const e of effects)e.cleanup=e.fn();await sleep(20);
    const start=async()=>{await current.start({clientId:'client-1',title:'Test gesprek',consent:true});await sleep(15)};
    const parts=async()=>{const list=await modules.local.listLocalMeetings('user-1');return list.length?modules.local.getLocalMeetingSegments('user-1',list[0].id):[]};
    if(name==='real_container'){
     await start();await sleep(700);await current.pause();await current.resume();await sleep(700);await current.stop();const list=await parts();assert(list.length===2,'Real recording missing segments');for(const part of list){const ac=new AudioContext();const decoded=await ac.decodeAudioData(await part.blob.arrayBuffer());assert(decoded.duration>.3,'Segment not independently playable');await ac.close()}
    } else if(name==='basic'){
     await current.start({clientId:'client-1',title:'Test',consent:false});assert(fake.getUserMediaCalls===0,'Microphone before consent');
     await start();assert(current.phase==='recording','Not recording');fake.recorders.at(-1).emit();await sleep(15);await current.pause();await sleep(10);assert(current.phase==='paused','Not paused');const duration=current.durationMs;await sleep(30);assert(current.durationMs===duration,'Paused time increased');await current.resume();await sleep(10);await current.stop();const list=await parts();assert(list.length===2&&list.every(x=>x.finalized)&&list[1].index===1,'Invalid independent segments');assert(list[1].startMs===list[0].durationMs,'Timeline not contiguous');
    } else if(name==='start_failure'){
     fake.throwStartAt=1;await start();assert(current.phase==='stopped','Start failure not stopped');const before=Date.now();await current.stop();assert(Date.now()-before<500,'Stop hangs after start failure');assert(fake.tracks.every(x=>x.stopped),'Track leaked after start failure');
    } else if(name==='rotate_failure'){
     fake.throwStartAt=2;await start();fake.recorders[0].emit();await sleep(120);assert(current.phase==='paused','Rotation failure not paused');assert(fake.tracks.every(x=>x.stopped),'Track leaked after rotation failure');assert((await parts())[0].finalized,'First segment lost on rotation error');
    } else if(name==='hidden'){
     await start();fake.recorders[0].emit();Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));await sleep(35);assert(current.phase==='paused','Hidden recording not paused');assert(fake.tracks.every(x=>x.stopped),'Hidden microphone active');assert((await parts())[0].finalized,'Hidden segment not finalized');
    } else if(name==='storage_failure'){
     await start();const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='segments')throw new DOMException('No storage','QuotaExceededError');return original.apply(this,args)};fake.recorders[0].emit();await sleep(60);assert(current.phase==='paused','Storage failure not paused');assert((await parts()).length===1,'Memory fallback lost');await current.resume();await sleep(20);assert(current.phase==='paused','Resumed without flushing failed storage');IDBObjectStore.prototype.put=original;await current.resume();await sleep(20);assert(current.phase==='recording','Did not resume once storage returned');await current.stop();assert((await parts()).length===2,'Failed segment overwritten');
    } else if(name==='timeout_recovery'){
     await start();fake.recorders[0].emit();fake.stopTimeout=true;await current.pause();await sleep(10);assert(!(await parts())[0].finalized,'Timed-out tail incorrectly finalized');fake.decodeFails=true;await current.resume();await sleep(10);assert(current.phase==='paused','Resumed over undecodable tail');fake.decodeFails=false;fake.stopTimeout=false;await current.resume();await sleep(10);fake.recorders[0].emit();await sleep(10);assert((await parts())[0].recovered,'Late recorder event overwrote recovered tail');await current.stop();const list=await parts();assert(list.length===2&&list[0].recovered&&list[1].index===1,'Recovered tail overwritten');
    } else if(name==='spontaneous_stop'){
     await start();fake.recorders[0].spontaneous();await sleep(40);assert(current.phase==='paused','Spontaneous stop not paused');assert(fake.tracks.every(x=>x.stopped),'Spontaneous stop leaked track');
    } else if(name==='upload_retry'){
     await start();await current.stop();let list=await modules.local.listLocalMeetings('user-1');fake.httpFailure=true;assert(!(await current.upload(list[0])),'Queue failure wrongly accepted');assert((await parts()).length===1,'Failure deleted local audio');fake.httpFailure=false;assert(await current.upload(list[0]),'Retry failed');list=await modules.local.listLocalMeetings('user-1');assert(list[0].status==='queued','Success not marked queued');assert((await parts()).length===1,'Success unexpectedly deleted local copy');const chunks=fake.requests.filter(x=>x.options.method==='PUT');assert(chunks.length===2&&chunks[0].url===chunks[1].url,'Retry not idempotent');
    } else if(name==='unmount'){
     await start();fake.recorders[0].emit();for(const e of effects)e.cleanup?.();await sleep(40);assert(fake.tracks.every(x=>x.stopped),'Unmount leaked microphone');assert((await parts())[0].finalized,'Unmount lost final segment');
    }
    for(const e of effects)e.cleanup?.();await sleep(15);
    return {name,phase:current.phase,segments:(await parts()).length};
   },{compiled,name});
   console.log('PASS',JSON.stringify(result)); await context.close();
  }
 } finally {await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
