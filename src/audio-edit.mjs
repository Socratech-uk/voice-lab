// Sample-accurate PCM operations shared by the editor and automation API.
export const AUDIO_TRACK_LIMIT=1800;
export function pcmWav(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=(p,n)=>String.fromCharCode(...bytes.subarray(p,p+n));
  if(bytes.length<44||tag(0,4)!=='RIFF'||tag(8,4)!=='WAVE'||v.getUint32(4,true)+8!==bytes.length)throw Error('Invalid WAV file.');
  let channels,rate,bits,encoding,offset=-1,size=0;
  for(let p=12;p+8<=bytes.length;){const n=v.getUint32(p+4,true);if(p+8+n>bytes.length)throw Error('Truncated WAV.');
    if(tag(p,4)==='fmt '){if(n<16||channels)throw Error('Invalid WAV format.');encoding=v.getUint16(p+8,true);channels=v.getUint16(p+10,true);rate=v.getUint32(p+12,true);bits=v.getUint16(p+22,true);if(v.getUint16(p+20,true)!==channels*2||v.getUint32(p+16,true)!==rate*channels*2)throw Error('Invalid WAV layout.');}
    if(tag(p,4)==='data'){if(offset>=0)throw Error('Multiple WAV data chunks.');offset=p+8;size=n;}p+=8+n+(n%2);
  }
  if(encoding!==1||![1,2].includes(channels)||rate!==44100||bits!==16||offset<0||!size||size%(channels*2))throw Error('Use 44.1 kHz mono/stereo PCM16 WAV.');
  const frames=size/(channels*2),durationSeconds=frames/rate;
  if(durationSeconds>AUDIO_TRACK_LIMIT)throw Error('Tracks are limited to 30 minutes.');
  return {bytes,offset,size,frames,channels,sampleRate:rate,bits,encoding,durationSeconds};
}
export function pcmEncode(channels,sampleRate=44100){
  const frames=channels[0]?.length,n=channels.length;
  if(!frames||![1,2].includes(n)||sampleRate!==44100||channels.some(c=>c.length!==frames)||frames/sampleRate>AUDIO_TRACK_LIMIT)throw Error('Invalid audio track.');
  const bytes=new Uint8Array(44+frames*n*2),v=new DataView(bytes.buffer);const tag=(p,s)=>[...s].forEach((c,i)=>bytes[p+i]=c.charCodeAt(0));
  tag(0,'RIFF');v.setUint32(4,bytes.length-8,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,n,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*n*2,true);v.setUint16(32,n*2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,bytes.length-44,true);
  for(let i=0;i<frames;i++)for(let c=0;c<n;c++){const f=channels[c][i];if(!Number.isFinite(f))throw Error('Audio contains invalid samples.');v.setInt16(44+(i*n+c)*2,Math.round(Math.max(-1,Math.min(32767/32768,f))*32768),true);}return bytes;
}
export function pcmChannels(info){const v=new DataView(info.bytes.buffer,info.bytes.byteOffset+info.offset,info.size);return Array.from({length:info.channels},(_,c)=>Float32Array.from({length:info.frames},(_,i)=>v.getInt16((i*info.channels+c)*2,true)/32768));}
export function pcmSlice(bytes,startSeconds,endSeconds){const w=pcmWav(bytes);const [a,b]=pcmRange(w,startSeconds,endSeconds);return pcmEncode(pcmChannels(w).map(c=>c.slice(a,b)));}
function pcmRange(w,start,end){if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>w.durationSeconds+1e-6||start>=end)throw Error('Choose a non-empty range inside the track.');const a=Math.round(start*w.sampleRate),b=Math.min(w.frames,Math.round(end*w.sampleRate));if(b<=a)throw Error('Choose at least one sample.');return[a,b];}
export function pcmEdit(bytes,edit){
  const w=pcmWav(bytes),ch=pcmChannels(w),{operation,startSeconds=0,endSeconds=w.durationSeconds}=edit,[a,b]=pcmRange(w,startSeconds,endSeconds);
  if(operation==='trim')return pcmEncode(ch.map(c=>c.slice(a,b)));
  if(operation==='cut'){if(b-a===w.frames)throw Error('Cut would remove the entire track.');return pcmEncode(ch.map(c=>{const out=new Float32Array(w.frames-(b-a));out.set(c.subarray(0,a));out.set(c.subarray(b),a);return out;}));}
  if(!['fade-in','fade-out','normalize','silence','reverse'].includes(operation))throw Error('Unknown audio edit.');
  let gain=1;if(operation==='normalize'){let peak=0;for(const c of ch)for(let i=a;i<b;i++)peak=Math.max(peak,Math.abs(c[i]));gain=peak?0.95/peak:1;}
  for(const c of ch){if(operation==='reverse'){c.subarray(a,b).reverse();continue;}for(let i=a;i<b;i++){const t=(i-a)/Math.max(1,b-a-1);c[i]*=operation==='fade-in'?t:operation==='fade-out'?1-t:operation==='silence'?0:gain;}}
  return pcmEncode(ch);
}
export function pcmAppend(prefix,generated,contextSeconds){
  const a=pcmWav(prefix),b=pcmWav(generated),skip=Math.round(contextSeconds*44100);if(skip<0||skip>=b.frames)throw Error('Continuation did not contain new audio.');
  const ac=pcmChannels(a),bc=pcmChannels(b),channels=Math.max(a.channels,b.channels);
  return pcmEncode(Array.from({length:channels},(_,i)=>{const x=ac[i%a.channels],y=bc[i%b.channels],out=new Float32Array(a.frames+b.frames-skip);out.set(x);out.set(y.subarray(skip),a.frames);return out;}));
}
export async function decodeAudioImport(file){
  if(!(file instanceof Blob)||file.size>350_000_000)throw Error('Choose an audio file smaller than 350 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  try{pcmWav(bytes);return bytes;}catch{}
  const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContext)throw Error('This browser cannot decode audio. Import a 44.1 kHz PCM16 WAV.');
  const ctx=new AudioContext({sampleRate:44100});try{
    const decoded=await ctx.decodeAudioData(bytes.buffer);if(decoded.duration>AUDIO_TRACK_LIMIT)throw Error('Tracks are limited to 30 minutes.');
    const offline=new OfflineAudioContext(Math.min(2,decoded.numberOfChannels),Math.round(decoded.duration*44100),44100),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const converted=await offline.startRendering();return pcmEncode(Array.from({length:converted.numberOfChannels},(_,i)=>converted.getChannelData(i)));
  }catch(e){throw Error('Cannot import this audio: '+e.message);}finally{await ctx.close();}
}
