import {createSteadyActivity} from './steady-duration.mjs';
import {createSteadyAngularPolicy} from './steady-angular-policy.mjs';

const finite=Number.isFinite,rad=d=>d*Math.PI/180,wrap=x=>Math.atan2(Math.sin(x),Math.cos(x)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),copy=x=>structuredClone(x);
const sameIds=(a,b)=>a.length===b.length&&a.every((id,i)=>Object.is(id,b[i]));
const exact=(a,b)=>['yaw','pitch','zoom'].every(k=>Object.is(a[k],b[k]));
class GeometryError extends Error{}

/** D: scale belongs to the caller; recent measured speaking time selects angular goals. */
export function createSteadyConversationController(options={}){
 for(const k of ['getRoster','getProjection','getBounds','getSpeakerYaw','getFrame','applyFrame'])if(typeof options[k]!=='function')throw TypeError(k+' callback required');
 const libraries=options.libraries??{policy:globalThis.AttentionConversationCamera,motion:globalThis.RoundConversationMotion};
 if(typeof libraries.policy?.measureVisibility!=='function'||typeof libraries.motion?.create!=='function')throw TypeError('Actual visibility measurement and Round motion required');
 const c=options.config??{};if(['onsetMs','releaseMs','attentionMaxMs'].some(k=>Object.hasOwn(c,k)))throw TypeError('Equal-voice onset/release/attention horizon is superseded; use duration memory');
 const cfg={pitchMin:c.pitchMin??rad(18),pitchMax:c.pitchMax??rad(45),restPitch:c.restPitch??rad(38),memoryMs:c.memoryMs??8000,planIntervalMs:c.planIntervalMs??500,weightChangeThreshold:c.weightChangeThreshold??.08,quietHoldMs:c.quietHoldMs??400};
 if(!Object.values(cfg).every(finite)||cfg.pitchMin<rad(5)||cfg.pitchMax>rad(45)||cfg.pitchMin>cfg.pitchMax||cfg.memoryMs<=0||cfg.planIntervalMs<0||cfg.weightChangeThreshold<0||cfg.weightChangeThreshold>1||cfg.quietHoldMs<0)throw RangeError('Finite D configuration; pitch within5..45 (default minimum18) and positive duration memory required');
 const rates={yawRate:c.profile?.yawRate??.08,pitchRate:c.profile?.pitchRate??.035};
 if(!Object.values(rates).every(x=>finite(x)&&x>0))throw RangeError('Positive angular rates required');
 const frame=v=>{if(!v||![v.yaw,v.pitch,v.zoom].every(finite)||v.zoom<=0)throw TypeError('Finite pose and positive actual zoom required');return{yaw:v.yaw,pitch:v.pitch,zoom:v.zoom};};
 const roster=()=>{const v=options.getRoster();if(!Array.isArray(v))throw TypeError('Roster array required');const ids=v.map(x=>x&&typeof x==='object'?x.id:x);if(new Set(ids).size!==ids.length||ids.some(id=>!(typeof id==='string'&&id.length||typeof id==='number'&&Number.isSafeInteger(id))))throw TypeError('Distinct string/safeinteger roster IDs required');return ids;};
 const makeActivity=()=>createSteadyActivity({ids:roster(),memoryMs:cfg.memoryMs});
 let activity=options.activityHelper??makeActivity(),clock=options.initialNow??activity.snapshot().now??null,owner=Object.hasOwn(options,'initialOwnerId')?options.initialOwnerId:null,intentId=null,history=[],ids=[],bounds=null,policy=null,ready=false,suspended=null,wasPaused=false,dirty=true,reason='not-built',target=null,lastZoom=null,lastRest=null,plannedWeights=[],lastPlan=null,quietSince=null,quietBraked=false,lastResult=null;
 if(clock!==null&&!finite(clock))throw RangeError('Finite initialNow required');
 if(activity.snapshot().now!==null&&(clock===null||clock<activity.snapshot().now))throw RangeError('initialNow cannot precede retained observed activity');
 if(activity.configuration?.memoryMs!==cfg.memoryMs)throw RangeError('Changed duration memory requires a new matching helper; do not mislabel retained evidence');
 if(activity.snapshot().now!==null&&!activity.snapshot().rawActiveIds.length)quietSince=activity.snapshot().rawQuietSince??activity.snapshot().now;
 if(owner!==null&&(!roster().includes(owner)||clock===null))throw RangeError('Known initialNow and roster ID required for initialOwnerId');
 const stats={calls:0,steps:0,applies:0,plans:0,rebuilds:0,blockedSteps:0};
 const angularIntent=(from,to,dt,profile)=>({yaw:wrap(from.yaw+clamp(wrap(to.yaw-from.yaw),-profile.yawRate*dt,profile.yawRate*dt)),pitch:from.pitch+clamp(to.pitch-from.pitch,-profile.pitchRate*dt,profile.pitchRate*dt),zoom:from.zoom});
 const motion=libraries.motion.create({responseSeconds:.30,rounding:1,...c.motion,stepFrame:angularIntent});
 const checkTime=t=>{if(!finite(t)||clock!==null&&t<clock)throw RangeError('Finite monotonic logical milliseconds required');};
 const readBounds=()=>{const b=options.getBounds();return b&&[b.left,b.right,b.top,b.bottom].every(finite)&&b.left<b.right&&b.top<b.bottom?{left:b.left,right:b.right,top:b.top,bottom:b.bottom}:null;};
 const sameBounds=(a,b)=>a&&b&&['left','right','top','bottom'].every(k=>Object.is(a[k],b[k]));
 const rest=()=>{const x=options.getRestPitch?.()??cfg.restPitch;if(!finite(x))throw RangeError('Finite selected rest pitch required');return clamp(x,cfg.pitchMin,cfg.pitchMax);};
 function focusSnapshot(){return copy(activity.snapshot());}
 function observe(id,t){checkTime(t);if(id!==null&&!roster().includes(id))throw RangeError('Actual owner outside roster');if(owner!==id){history.push({id,at:t});if(history.length>2048)history.shift();}owner=id;clock=t;}
 function observeActivity({now,activity:sample}){checkTime(now);activity.update({now,activity:sample});clock=now;if(activity.snapshot().rawActiveIds.length){if(quietBraked)dirty=true;quietSince=null;}else quietSince=activity.snapshot().rawQuietSince??quietSince??now;}
 function getAttentionState(){return clock===null&&target===null&&owner===null&&intentId===null?null:copy({goal:target?{yaw:target.yaw,pitch:target.pitch}:null,weights:plannedWeights,plannedAt:lastPlan??clock??0,quietSince,quietBraked,actualOwnerId:owner,intendedId:intentId});}
 function readAttention(v){
  if(v===null||v===undefined)return;
  if(clock===null)throw TypeError('Retained attention requires a known initialNow');
  if(!v||!finite(v.plannedAt)||v.goal!==null&&![v.goal?.yaw,v.goal?.pitch].every(finite)||!Array.isArray(v.weights)||v.weights.some(x=>!roster().includes(x.id)||!finite(x.weight)||x.weight<0)||new Set(v.weights.map(x=>x.id)).size!==v.weights.length||v.quietSince!==null&&v.quietSince!==undefined&&!finite(v.quietSince)||clock!==null&&(v.plannedAt>clock||v.quietSince>clock))throw TypeError('Past observed weighted attention state required');
  const total=v.weights.reduce((sum,x)=>sum+x.weight,0);if(v.weights.length&&Math.abs(total-1)>1e-8)throw RangeError('Normalized duration weights required');
  for(const key of ['actualOwnerId','intendedId'])if(Object.hasOwn(v,key)&&v[key]!==null&&!roster().includes(v[key]))throw RangeError('Past owner/recipient outside roster');
  if(!Object.hasOwn(options,'initialOwnerId')&&Object.hasOwn(v,'actualOwnerId'))owner=v.actualOwnerId;intentId=v.intendedId??null;target=v.goal===null?null:{yaw:v.goal.yaw,pitch:clamp(v.goal.pitch,cfg.pitchMin,cfg.pitchMax),zoom:frame(options.getFrame()).zoom};plannedWeights=v.weights.map(x=>({id:x.id,weight:x.weight}));lastPlan=v.plannedAt;const observed=activity.snapshot();quietSince=observed.now!==null?(observed.rawActiveIds.length?null:observed.rawQuietSince??observed.now):v.quietSince??null;quietBraked=Boolean(v.quietBraked);
 }
 readAttention(options.attentionState);
 function blockers(f){const v=options.getBlockers?.(f)??[];if(!Array.isArray(v))throw new GeometryError('Blockers array required');for(const q of v)if(q?.visible!==false&&(!q||![q.x,q.y].every(finite)||(q.shape==='rect'?![q.width,q.height].every(finite)||q.width<=0||q.height<=0:!finite(q.diameter)||q.diameter<=0)||!q.front&&!finite(q.depth)))throw new GeometryError('Malformed actual blocker');return v;}
 function content(f){const v=options.getContentRects?.(f)??[];if(!Array.isArray(v))throw new GeometryError('Content array required');for(const q of v)if(!q||![q.x,q.y,q.width,q.height].every(finite)||q.width<=0||q.height<=0)throw new GeometryError('Malformed actual content support');return v;}
 function rebuild(){
  ids=roster();bounds=readBounds();stats.rebuilds++;ready=false;policy=null;dirty=true;
  if(!ids.length||!bounds){reason=ids.length?'unmeasured-bounds':'empty-roster';return{ready,reason};}
  if(!sameIds(activity.snapshot().roster,ids)){reason='activity-roster-mismatch';return{ready,reason};}
  const p=options.getProjection(),project=typeof p==='function'?p:p?.project?.bind(p);
  if(typeof project!=='function')throw TypeError('Actual selected projection callback required');
  if(p.ids&&!sameIds(p.ids,ids)){reason='projection-roster-mismatch';return{ready,reason};}
  policy=createSteadyAngularPolicy({ids:[...ids],getBounds:()=>({...bounds}),speakerYaw:options.getSpeakerYaw,getHolder:options.getHolder??(()=>null),getBlockers:blockers,getContentRects:content,measureVisibility:libraries.policy.measureVisibility,pitchMin:cfg.pitchMin,pitchMax:cfg.pitchMax,...Object.fromEntries(['readableMinFraction','readableMinAreaPx','yawDeadband','pitchDeadband','improvementThreshold'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]])),project(id,f){let q;try{q=project(id,f);}catch(e){if(e?.code!=='CAMERA_PROJECTION_UNAVAILABLE')throw e;return{visible:false};}if(q?.visible===false)return q;if(!q||![q.x,q.y,q.diameter,q.depth].every(finite)||q.diameter<=0||q.paintPadding!==undefined&&(!finite(q.paintPadding)||q.paintPadding<0))throw new GeometryError('Malformed actual visible projection');return q;}});
  if(owner!==null&&!ids.includes(owner))owner=null;if(intentId!==null&&!ids.includes(intentId))intentId=null;
  ready=true;reason='ready';return{ready,reason};
 }
 function assess(f,weights){return policy.assess(f,{activeIds:activity.snapshot().rawActiveIds,weights,actualSpeakerId:owner,intendedId:intentId});}
 function result(current,actual=null,extra={}){lastResult={frame:{...current},target:target?{...target,zoom:current.zoom}:null,applied:false,paused:false,blocked:false,reason,...extra,conversationFocus:focusSnapshot(),attention:getAttentionState(),metrics:{actual,motion:motion.snapshot(),zoomPolicy:'user-locked'}};return copy(lastResult);}
 function variation(a,b){const ids=new Set([...a.map(x=>x.id),...b.map(x=>x.id)]);return [...ids].reduce((sum,id)=>sum+Math.abs((a.find(x=>Object.is(x.id,id))?.weight??0)-(b.find(x=>Object.is(x.id,id))?.weight??0)),0)/2;}
 function commitGoal(current,weights,t){
  const proposed=policy.plan({current,weights,activeIds:activity.snapshot().rawActiveIds,actualSpeakerId:owner,intendedId:intentId,restPitch:rest(),previousTarget:target?{...target,zoom:current.zoom}:undefined});stats.plans++;
  target={yaw:proposed.frame.yaw,pitch:weights.length?clamp(proposed.frame.pitch,cfg.pitchMin,cfg.pitchMax):rest(),zoom:current.zoom};plannedWeights=weights.map(x=>({id:x.id,weight:x.weight}));lastPlan=t;dirty=false;
 }
 function step(t,dt,{paused=false,reducedMotion=false,mode='cinematic'}={}){
  if(!finite(dt)||dt<0||typeof paused!=='boolean')throw RangeError('Valid dt and pause flag required');checkTime(t);clock=t;stats.calls++;const current=frame(options.getFrame());
  if(paused||suspended!==null||mode==='manual'){if(!wasPaused)motion.reset();wasPaused=true;reason=suspended??'external-pause';return result(current,null,{paused:true});}
  try{
   if(wasPaused){wasPaused=false;rebuild();}
   if(!ready||!sameIds(roster(),ids)||!sameBounds(readBounds(),bounds))rebuild();if(!ready)return result(current,null,{blocked:true});
   const fs=activity.snapshot(),weights=fs.weights.map(x=>({id:x.id,weight:x.weight})),selectedRest=rest();
   const restChanged=!Object.is(selectedRest,lastRest);if(!Object.is(current.zoom,lastZoom)||restChanged)dirty=true;
   const before=assess(current,weights),quiet=!fs.rawActiveIds.length&&quietSince!==null&&t-quietSince>=cfg.quietHoldMs;
   if(quiet){if(!quietBraked||!target||restChanged){target={yaw:current.yaw,pitch:restChanged?selectedRest:target?.pitch??selectedRest,zoom:current.zoom};quietBraked=true;}dirty=false;}
   else{quietBraked=false;if(dirty||!target||weights.length&&!plannedWeights.length||t-(lastPlan??-Infinity)>=cfg.planIntervalMs&&variation(weights,plannedWeights)>=cfg.weightChangeThreshold)commitGoal(current,weights,t);}
   lastZoom=current.zoom;lastRest=selectedRest;
   const destination={yaw:target.yaw,pitch:target.pitch,zoom:current.zoom};
   const guarded=(f)=>{
    let a;try{a=assess(f,weights);}catch(e){if(e instanceof GeometryError&&!exact(current,f))return{fits:false,visibleIds:[],overflowPenalty:Infinity,hardRefusal:true};throw e;}
    const contentLoss=before.contentFits?!a.contentFits:(a.contentOverflowPx??0)>(before.contentOverflowPx??0)+1e-8;
    const oldDistance=Math.abs(current.pitch-clamp(current.pitch,cfg.pitchMin,cfg.pitchMax)),newDistance=Math.abs(f.pitch-clamp(f.pitch,cfg.pitchMin,cfg.pitchMax)),pitchLoss=newDistance>oldDistance+1e-10;
    const hardRefusal=contentLoss||pitchLoss;
    return{fits:!hardRefusal,visibleIds:[],overflowPenalty:hardRefusal?Infinity:0,hardRefusal,contentLoss,pitchLoss};
   };
   if(!dt){reason='zero-dt';return result(current,before);}
   const beforeLimits=motion.snapshot().metrics.safetyLimits;
   let next=motion.step(current,destination,dt,{...rates,zoomInLogRate:1,zoomOutLogRate:1},reducedMotion,{minZoom:current.zoom,maxZoom:current.zoom,context:{requiredIds:[]},fit:guarded});stats.steps++;
   const elapsed=Math.min(dt,.1);next={yaw:wrap(current.yaw+clamp(wrap(next.yaw-current.yaw),-rates.yawRate*elapsed,rates.yawRate*elapsed)),pitch:current.pitch+clamp(next.pitch-current.pitch,-rates.pitchRate*elapsed,rates.pitchRate*elapsed),zoom:current.zoom};
   const post=guarded(next);
   if(post.hardRefusal){motion.reset();stats.blockedSteps++;target={...current};reason='angular-step-refused';return result(current,before,{blocked:true});}
   const actual=assess(next,weights),moved=!exact(current,next);if(moved){options.applyFrame({...next,zoom:current.zoom});stats.applies++;}
   const limited=motion.snapshot().metrics.safetyLimits>beforeLimits;if(limited)target={...next};
   reason=limited?'angular-support-limited':quiet?'quiet-angular-hold':actual.fits?'steady-weighted-voices':'steady-soft-framing';
   return result(next,actual,{applied:moved});
  }catch(e){if(!(e instanceof GeometryError))throw e;ready=false;reason='invalid-selected-geometry';motion.reset();stats.blockedSteps++;return result(current,null,{blocked:true});}
 }
 function suspend(why='manual-browse'){suspended=String(why);motion.reset();dirty=true;}
 function resume(){suspended=null;wasPaused=false;rebuild();}
 function reset(){activity=makeActivity();clock=null;owner=null;intentId=null;history=[];target=null;plannedWeights=[];lastPlan=null;quietSince=null;quietBraked=false;lastZoom=null;lastRest=null;motion.reset();rebuild();}
 function beginHandoff(id,t){checkTime(t);if(!roster().includes(id))throw RangeError('Recipient outside roster');clock=t;intentId=id;return{intendedId:id,holderId:options.getHolder?.()??null};}
 function commitHandoff(t){checkTime(t);clock=t;intentId=null;}
 function handoffReady(){if(!ready||suspended!==null||wasPaused||intentId===null)return{ready:false,reason:'no-active-handoff-or-paused'};if(!sameIds(roster(),ids)||!sameBounds(readBounds(),bounds))return{ready:false,reason:'geometry-changed-rebuild-needed'};try{const a=assess(frame(options.getFrame()),activity.snapshot().weights);return{ready:Boolean(a.intended?.readable&&a.contentFits),reason:a.intended?.readable&&a.contentFits?'recipient-readable-at-user-scale':'recipient-not-readable-at-user-scale',actual:copy(a)};}catch(e){if(!(e instanceof GeometryError))throw e;return{ready:false,reason:'invalid-selected-geometry'};}}
 function snapshot(){return copy({algorithm:'steady-angular',frame:frame(options.getFrame()),ready,reason,activeId:owner,cameraOwnerId:owner,intendedId:intentId,clock,suspended,manualRecovery:null,roster:ids,history,configuration:{...cfg,profile:rates,motion:{responseSeconds:motion.snapshot().responseSeconds,rounding:motion.snapshot().rounding},zoomPolicy:'user-locked',targetCadence:'material-duration-change-with-minimum-interval'},conversationFocus:focusSnapshot(),attention:getAttentionState(),target:target?{...target,zoom:frame(options.getFrame()).zoom}:null,stats,motion:motion.snapshot(),lastResult});}
 return Object.freeze({observe,observeActivity,step,rebuild,suspend,resume,reset,snapshot,focusSnapshot,getActivityHelper:()=>activity,getAttentionState,beginHandoff,commitHandoff,cancelHandoff:commitHandoff,handoffReady});
}
export default createSteadyConversationController;
