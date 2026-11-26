/** Independently measured PCM test channels. No camera identity, winner, microphone or provider. */
export const MODULE_HISTORY=Object.freeze({
 id:'circleup-pcm-activity-source',version:'1.0.0',createdAt:'2026-11-21T22:24:01.660305+00:00',
 changes:Object.freeze([{at:'2026-11-21T22:24:01.660305+00:00',change:'Initial independent decoded-channel RMS source; host mix scenarios; muted output after analysers.'}])
});
export const SCENARIOS=Object.freeze(['overlap','silence','a-dominant','b-dominant','cycle']);
export const GENERATED_SPEECH_URLS=Object.freeze([
 new URL('./assets/generated-samantha.wav',import.meta.url).href,
 new URL('./assets/generated-daniel.wav',import.meta.url).href
]);
const finite=x=>typeof x==='number'&&Number.isFinite(x),clamp=x=>Math.max(0,Math.min(1,x));
const cyclePhases=Object.freeze([{name:'overlap',seconds:3},{name:'silence',seconds:1.5},{name:'a-dominant',seconds:3},{name:'b-dominant',seconds:3}]);
export function createActivitySource({channels,onStatus}={}){
 if(!Array.isArray(channels)||channels.length<2||channels.length>18)throw new RangeError('Configure 2 to 18 independent audio channels.');
 if(onStatus!==undefined&&typeof onStatus!=='function')throw new TypeError('onStatus must be a function.');
 const ids=new Set(),rows=channels.map(c=>{
  if(!c||typeof c.id!=='string'||!c.id.trim()||ids.has(c.id)||typeof c.url!=='string'||!c.url.trim())throw new TypeError('Each channel needs a unique participant id and an audio URL.');
  if(c.offsetSeconds!==undefined&&(!finite(c.offsetSeconds)||c.offsetSeconds<0))throw new RangeError('offsetSeconds must be finite and nonnegative.');
  ids.add(c.id);return{id:c.id,url:c.url,label:c.label||'Audio test channel',offsetSeconds:c.offsetSeconds??0,enabled:true,gain:1,node:null,control:null,analyser:null,data:null,duration:null,rms:0,level:0,active:false};
 });
 let context=null,output=null,status='idle',desired=false,disposed=false,revision=0,startPromise=null,scenario='overlap',phase='overlap',cycleOrigin=0,timer=null,sourcesStartedAt=null,lastSampleTimeMs=null,error=null,eventSerial=0;
 const buffers=new Map(),loads=new Map(),abort=new AbortController(),events=[];
 const zeroMap=()=>Object.fromEntries(rows.map(c=>[c.id,{level:0,active:false}]));
 let lastMap=zeroMap();
 const past=(type,details={})=>{events.push({sequence:++eventSerial,type,wallTimeMs:Date.now(),audioTimeSeconds:context?.currentTime??null,...details});if(events.length>128)events.shift();};
 const position=c=>c.duration&&sourcesStartedAt!==null?(c.offsetSeconds+Math.max(0,(context?.currentTime??sourcesStartedAt)-sourcesStartedAt))%c.duration:null;
 function snapshot(){return{module:structuredClone(MODULE_HISTORY),status,desiredRunning:desired,disposed,contextState:context?.state??'uncreated',audioTimeSeconds:context?.currentTime??0,contextSampleRate:context?.sampleRate??null,audible:Boolean(output?.gain.value),outputGain:output?.gain.value??0,scenario,phase,lastSampleTimeMs,error,graph:{analyserCount:new Set(rows.map(c=>c.analyser).filter(Boolean)).size,sourceCount:new Set(rows.map(c=>c.node).filter(Boolean)).size},channels:rows.map(c=>({id:c.id,url:c.url,label:c.label,offsetSeconds:c.offsetSeconds,durationSeconds:c.duration,positionSeconds:position(c),enabled:c.enabled,gain:c.gain,rms:c.rms,level:c.level,active:c.active,hasIndependentAnalyser:Boolean(c.analyser),hasIndependentSource:Boolean(c.node)})),activity:structuredClone(lastMap),history:structuredClone(events)};}
 function report(type,details={}){past(type,details);try{onStatus?.(snapshot());}catch(e){past('status-callback-error',{message:String(e?.message??e)});}}
 const alive=()=>{if(disposed)throw new Error('Activity source is disposed.');};
 let audible=false;
 function ensureContext(){
  if(context)return context;
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)throw new Error('WebAudio AudioContext is unavailable.');
  context=new Audio();output=context.createGain();output.gain.value=audible?.16:0;output.connect(context.destination);
  for(const c of rows){c.control=context.createGain();c.control.gain.value=c.enabled?c.gain:0;c.analyser=context.createAnalyser();c.analyser.fftSize=1024;c.analyser.smoothingTimeConstant=0;c.data=new Float32Array(c.analyser.fftSize);c.control.connect(c.analyser);c.analyser.connect(output);}
  context.onstatechange=()=>{if(!disposed)report('context-state',{state:context.state});};return context;
 }
 async function load(url){
  if(buffers.has(url))return buffers.get(url);if(loads.has(url))return loads.get(url);
  const p=(async()=>{const r=await fetch(url,{signal:abort.signal});if(!r.ok)throw new Error('Audio fetch failed ('+r.status+').');const buffer=await context.decodeAudioData(await r.arrayBuffer());if(!buffer.length||!buffer.duration)throw new Error('Decoded audio has no PCM frames.');if(!disposed)buffers.set(url,buffer);return buffer;})();
  loads.set(url,p);try{return await p;}finally{if(loads.get(url)===p)loads.delete(url);}
 }
 function clearMeasurements(){for(const c of rows){c.rms=0;c.level=0;c.active=false;c.data?.fill(0);}lastMap=zeroMap();}
 function stopNodes(){for(const c of rows)if(c.node){try{c.node.stop();}catch{}c.node.disconnect();c.node=null;}sourcesStartedAt=null;}
 function applyControls(){for(const c of rows)if(c.control){c.control.gain.cancelScheduledValues(context.currentTime);c.control.gain.setValueAtTime(c.enabled?c.gain:0,context.currentTime);}}
 function mix(name){phase=name;rows.forEach((c,i)=>{c.enabled=name!=='silence';c.gain=name==='a-dominant'?(i===0?1:.08):name==='b-dominant'?(i===1?1:.08):name==='silence'?0:1;});applyControls();}
 function updateCycle(){if(scenario!=='cycle'||!context||!desired||context.state!=='running')return;let t=(context.currentTime-cycleOrigin)%10.5;for(const p of cyclePhases){if(t<p.seconds){if(phase!==p.name){mix(p.name);report('scenario-phase',{phase});}return;}t-=p.seconds;}}
 function stopTimer(){if(timer!==null){clearInterval(timer);timer=null;}}
 function armTimer(){stopTimer();if(scenario==='cycle'&&desired)timer=setInterval(updateCycle,40);}
 function setScenario(name){alive();if(!SCENARIOS.includes(name))throw new RangeError('Unknown activity scenario.');scenario=name;cycleOrigin=context?.currentTime??0;mix(name==='cycle'?'overlap':name);armTimer();report('scenario',{scenario,phase});return snapshot();}
 function setChannel(id,{enabled,gain}={}){alive();const c=rows.find(c=>c.id===id);if(!c)throw new RangeError('Unknown participant channel.');if(enabled!==undefined&&typeof enabled!=='boolean')throw new TypeError('enabled must be boolean.');if(gain!==undefined&&(!finite(gain)||gain<0||gain>1))throw new RangeError('gain must be in 0..1.');scenario='manual';phase='manual';stopTimer();if(enabled!==undefined)c.enabled=enabled;if(gain!==undefined)c.gain=gain;applyControls();report('channel-control',{id,enabled:c.enabled,gain:c.gain});return snapshot();}
 function setAudible(value){alive();if(typeof value!=='boolean')throw new TypeError('audible must be boolean.');audible=value;if(output)output.gain.setValueAtTime(audible?.16:0,context.currentTime);report('audible',{audible});return snapshot();}
 async function start(){
  alive();if(desired&&startPromise)return startPromise;if(desired&&status==='running'&&context?.state==='running')return true;
  desired=true;const request=++revision;error=null;
  // This resume is invoked synchronously by start(), before any fetch/decode await: call from a user gesture.
  let resume;try{resume=ensureContext().resume();}catch(e){desired=false;status='error';error=String(e.message);report('error',{message:error});throw e;}
  status='loading';report('loading');
  const run=(async()=>{try{
   const settled=await Promise.all([...rows.map(c=>load(c.url)),resume]),loaded=settled.slice(0,rows.length);if(disposed||!desired||request!==revision)return false;
   if(!rows.every(c=>c.node)){stopNodes();sourcesStartedAt=context.currentTime;loaded.forEach((buffer,i)=>{const c=rows[i];c.duration=buffer.duration;c.node=context.createBufferSource();c.node.buffer=buffer;c.node.loop=true;c.node.connect(c.control);c.node.start(sourcesStartedAt,c.offsetSeconds%buffer.duration);});if(scenario==='cycle')cycleOrigin=context.currentTime;}
   status='running';armTimer();report('started');return true;
  }catch(e){if(disposed||request!==revision)return false;desired=false;status='error';error=String(e?.message??e);stopTimer();report('error',{message:error});throw e;}})();
  startPromise=run;try{return await run;}finally{if(startPromise===run)startPromise=null;}
 }
 async function pause(){alive();desired=false;const request=++revision;stopTimer();clearMeasurements();status='paused';const suspension=context&&context.state!=='closed'?context.suspend():null;report('paused');if(suspension)await suspension;if(request===revision)status='paused';return true;}
 async function reset(){alive();desired=false;const request=++revision;stopTimer();stopNodes();clearMeasurements();lastSampleTimeMs=null;cycleOrigin=context?.currentTime??0;if(scenario==='cycle')mix('overlap');status='idle';const suspension=context&&context.state!=='closed'?context.suspend():null;report('reset');if(suspension)await suspension;if(request===revision)status='idle';return true;}
 async function dispose(){if(disposed)return;desired=false;disposed=true;++revision;stopTimer();abort.abort();stopNodes();clearMeasurements();for(const c of rows){c.control?.disconnect();c.analyser?.disconnect();c.control=null;c.analyser=null;c.data=null;}output?.disconnect();output=null;buffers.clear();if(context&&context.state!=='closed')await context.close();status='disposed';report('disposed');}
 function sample(timeMs=globalThis.performance?.now()??Date.now()){
  if(!finite(timeMs))throw new TypeError('sample timeMs must be finite.');lastSampleTimeMs=timeMs;updateCycle();
  const running=!disposed&&desired&&status==='running'&&context?.state==='running';
  const entries=rows.map(c=>{let rms=0;if(running&&c.analyser){c.analyser.getFloatTimeDomainData(c.data);for(const v of c.data)rms+=v*v;rms=Math.sqrt(rms/c.data.length);}c.rms=rms;c.level=running&&c.enabled?clamp(rms*4):0;c.active=c.level>=.02;return[c.id,{level:c.level,active:c.active}];});lastMap=Object.fromEntries(entries);return structuredClone(lastMap);
 }
 report('created',{defaultAudible:false});return Object.freeze({start,pause,reset,dispose,sample,snapshot,setScenario,setChannel,setAudible});
}
export const create=createActivitySource;
