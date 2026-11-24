/** Host-owned record/replay. Camera consumers receive only due observations. */
const copy=v=>structuredClone(v);
function activity(value={}){const out={};for(const[id,v]of Object.entries(value)){const level=typeof v==='number'?v:v?.level,active=typeof v==='number'?v>0:v?.active??level>0;if(!Number.isFinite(level)||typeof active!=='boolean')throw TypeError('Finite measured level/boolean activity required');out[id]={level:Math.max(0,Math.min(1,level)),active};}return out;}
export function createObservedInputRecorder({maxSamples=18000}={}){
 let recording=false,meta=null,samples=[],events=[],last=-Infinity,lastEvent=-Infinity,capped=false;
 return Object.freeze({
  begin(data){meta=copy(data);samples=[];events=[];last=lastEvent=-Infinity;capped=false;recording=true;},
  record({now,ownerEvents=[],levels={}}){if(!recording)return;if(samples.length>=maxSamples){recording=false;capped=true;return;}if(!Number.isFinite(now)||now<last)throw RangeError('Monotonic observed clock required');for(const e of ownerEvents){if(!Number.isFinite(e.at)||e.at<lastEvent||e.at>now||e.id!==null&&!['string','number'].includes(typeof e.id))throw RangeError('Only past/current ordered owner observations accepted');events.push(copy(e));lastEvent=e.at;}samples.push({at:now,levels:activity(levels)});last=now;},
  resume(){if(meta&&samples.length<maxSamples)recording=true;},
  seal(now=last){recording=false;if(!meta||!samples.length)return null;return copy({version:1,meta,durationMs:capped?last:Math.max(last,now),samples,events});},
  snapshot(){return {recording,samples:samples.length,events:events.length,observedUntil:Number.isFinite(last)?last:0};}
 });
}
export function createCausalReplay(input){
 const tape=copy(input);if(tape?.version!==1||!Array.isArray(tape.samples)||!Array.isArray(tape.events))throw TypeError('Observed tape required');let sampleIndex=0,eventIndex=0,last=-Infinity,current={};
 for(const list of[tape.samples,tape.events])for(let i=0;i<list.length;i++)if(!Number.isFinite(list[i].at)||i&&list[i].at<list[i-1].at)throw RangeError('Ordered tape required');
 return Object.freeze({
  advance(now){if(!Number.isFinite(now)||now<last)throw RangeError('Monotonic replay clock required');last=now;const activityEvents=[];while(sampleIndex<tape.samples.length&&tape.samples[sampleIndex].at<=now){const sample=tape.samples[sampleIndex++];current=activity(sample.levels);activityEvents.push({at:sample.at,levels:copy(current)});}const due=[];while(eventIndex<tape.events.length&&tape.events[eventIndex].at<=now)due.push(copy(tape.events[eventIndex++]));return {levels:copy(current),activityEvents,ownerEvents:due,ended:now>=tape.durationMs};},
  snapshot(){return {consumedSamples:sampleIndex,consumedEvents:eventIndex,observedUntil:Number.isFinite(last)?last:0,durationMs:tape.durationMs};}
 });
}

/** Ordered observed prefix for camera consumers; no tape/scheduler access. */
export function mergeObservedInputs({ownerEvents=[],activityEvents=[]}){return [...ownerEvents.map(e=>({kind:'owner',at:e.at,id:e.id})),...activityEvents.map(e=>({kind:'activity',at:e.at,levels:activity(e.levels)}))].sort((a,b)=>a.at-b.at||(a.kind===b.kind?0:a.kind==='activity'?-1:1));}
