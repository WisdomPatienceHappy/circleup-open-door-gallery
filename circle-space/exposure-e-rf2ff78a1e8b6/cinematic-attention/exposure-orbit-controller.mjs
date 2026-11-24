import {createSteadyActivity} from './steady-duration.mjs';
import {createExposureOrbitPolicy} from './exposure-orbit-policy.mjs';
import {createExposureUrgency} from './exposure-urgency.mjs';

const finite=Number.isFinite,rad=d=>d*Math.PI/180,wrap=x=>Math.atan2(Math.sin(x),Math.cos(x)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),copy=x=>structuredClone(x);
const sameIds=(a,b)=>a.length===b.length&&a.every((id,i)=>Object.is(id,b[i]));
const exact=(a,b)=>['yaw','pitch','zoom'].every(k=>Object.is(a[k],b[k]));
class GeometryError extends Error{}

/** E orbit: actual near-full exposure, proportional duration and reachable-opportunity rate scheduling. */
export function createExposureOrbitController(options={}){
 for(const k of ['getRoster','getProjection','getBounds','getSpeakerYaw','getFrame','applyFrame'])if(typeof options[k]!=='function')throw TypeError(k+' callback required');
 const libraries=options.libraries??{policy:globalThis.AttentionConversationCamera,motion:globalThis.RoundConversationMotion};
 if(typeof libraries.policy?.measureVisibility!=='function'||typeof libraries.motion?.create!=='function')throw TypeError('Actual visibility measurement and Round motion required');
 const c=options.config??{};if(['onsetMs','releaseMs','attentionMaxMs'].some(k=>Object.hasOwn(c,k)))throw TypeError('Equal-voice onset/release/attention horizon is superseded; use duration memory');
 const cfg={pitchMin:c.pitchMin??rad(5),pitchMax:c.pitchMax??rad(45),restPitch:c.restPitch??rad(24),memoryMs:c.memoryMs??8000,planIntervalMs:c.planIntervalMs??500,weightChangeThreshold:c.weightChangeThreshold??.08,quietHoldMs:c.quietHoldMs??400,preferredPixels:c.preferredPixels??160,fractionTarget:c.fractionTarget??.95};
 if(!Object.values(cfg).every(finite)||cfg.pitchMin<rad(5)||cfg.pitchMax>rad(45)||cfg.pitchMin>cfg.pitchMax||cfg.memoryMs<=0||cfg.planIntervalMs<0||cfg.weightChangeThreshold<0||cfg.weightChangeThreshold>1||cfg.quietHoldMs<0||cfg.preferredPixels<=0||cfg.fractionTarget<=0||cfg.fractionTarget>1)throw RangeError('Finite E configuration; pitch5..45, positive duration/pixel preference required');
 const rates={yawRate:c.profile?.yawRate??.08,pitchRate:c.profile?.pitchRate??.035},maxRates={yawRate:c.urgentProfile?.yawRate??.30,pitchRate:c.urgentProfile?.pitchRate??.12};
 if(![...Object.values(rates),...Object.values(maxRates)].every(x=>finite(x)&&x>0)||maxRates.yawRate<rates.yawRate||maxRates.pitchRate<rates.pitchRate)throw RangeError('Positive angular rates required');
 const frame=v=>{if(!v||![v.yaw,v.pitch,v.zoom].every(finite)||v.zoom<=0)throw TypeError('Finite pose and positive actual zoom required');return{yaw:v.yaw,pitch:v.pitch,zoom:v.zoom};};
 const roster=()=>{const v=options.getRoster();if(!Array.isArray(v))throw TypeError('Roster array required');const ids=v.map(x=>x&&typeof x==='object'?x.id:x);if(new Set(ids).size!==ids.length||ids.some(id=>!(typeof id==='string'&&id.length||typeof id==='number'&&Number.isSafeInteger(id))))throw TypeError('Distinct string/safeinteger roster IDs required');return ids;};
 const makeActivity=()=>createSteadyActivity({ids:roster(),memoryMs:cfg.memoryMs});
 let activity=options.activityHelper??makeActivity(),clock=options.initialNow??activity.snapshot().now??null,owner=Object.hasOwn(options,'initialOwnerId')?options.initialOwnerId:null,intentId=null,history=[],ids=[],bounds=null,policy=null,ready=false,suspended=null,wasPaused=false,dirty=true,reason='not-built',target=null,lastZoom=null,lastRest=null,plannedWeights=[],lastPlan=null,quietSince=null,quietBraked=false,lastResult=null,reference=null,lastPreferred=null,geometryVersion=null,lastPlanMetrics=null,lastLimited=false,appliedVelocity={yaw:0,pitch:0},lastView={evaluated:false,members:[],reason:'not-evaluated'},observedBasisKey=null;
 if(clock!==null&&!finite(clock))throw RangeError('Finite initialNow required');
 if(activity.snapshot().now!==null&&(clock===null||clock<activity.snapshot().now))throw RangeError('initialNow cannot precede retained observed activity');
 if(activity.configuration?.memoryMs!==cfg.memoryMs)throw RangeError('Changed duration memory requires a new matching helper; do not mislabel retained evidence');
 if(activity.snapshot().now!==null&&!activity.snapshot().rawActiveIds.length)quietSince=activity.snapshot().rawQuietSince??activity.snapshot().now;
 if(owner!==null&&(!roster().includes(owner)||clock===null))throw RangeError('Known initialNow and roster ID required for initialOwnerId');
 const stats={calls:0,steps:0,applies:0,plans:0,rebuilds:0,blockedSteps:0};
 const angularIntent=(from,to,dt,profile)=>({yaw:wrap(from.yaw+clamp(wrap(to.yaw-from.yaw),-profile.yawRate*dt,profile.yawRate*dt)),pitch:from.pitch+clamp(to.pitch-from.pitch,-profile.pitchRate*dt,profile.pitchRate*dt),zoom:from.zoom});
 const motion=libraries.motion.create({responseSeconds:.30,rounding:1,...c.motion,stepFrame:angularIntent});
 const urgency=createExposureUrgency({...c.urgency,yawRateMin:rates.yawRate,yawRateMax:maxRates.yawRate,pitchRateMin:rates.pitchRate,pitchRateMax:maxRates.pitchRate,initialState:options.attentionState?.urgencyState});
 const readPreferred=()=>{const p=options.getPreferredPixels?.()??cfg.preferredPixels;if(!finite(p)||p<=0)throw RangeError('Positive finite preferred pixels required');return p;};
 const readGeometryVersion=()=>{const v=options.getGeometryVersion?.()??0;if(!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!finite(v))throw TypeError('Scalar explicit geometry version required');return v;};
 const basisKey=()=>JSON.stringify([geometryVersion,ids,bounds,cfg.pitchMin,cfg.pitchMax,lastPreferred]);
 const checkTime=t=>{if(!finite(t)||clock!==null&&t<clock)throw RangeError('Finite monotonic logical milliseconds required');};
 const readBounds=()=>{const b=options.getBounds();return b&&[b.left,b.right,b.top,b.bottom].every(finite)&&b.left<b.right&&b.top<b.bottom?{left:b.left,right:b.right,top:b.top,bottom:b.bottom}:null;};
 const sameBounds=(a,b)=>a&&b&&['left','right','top','bottom'].every(k=>Object.is(a[k],b[k]));
 const rest=()=>{const x=options.getRestPitch?.()??cfg.restPitch;if(!finite(x))throw RangeError('Finite selected rest pitch required');return clamp(x,cfg.pitchMin,cfg.pitchMax);};
 function focusSnapshot(){return copy(activity.snapshot());}
 function observe(id,t){checkTime(t);if(id!==null&&!roster().includes(id))throw RangeError('Actual owner outside roster');if(owner!==id){history.push({id,at:t});if(history.length>2048)history.shift();}owner=id;clock=t;}
 function observeActivity({now,activity:sample}){checkTime(now);activity.update({now,activity:sample});clock=now;if(activity.snapshot().rawActiveIds.length){if(quietBraked)dirty=true;quietSince=null;}else quietSince=activity.snapshot().rawQuietSince??quietSince??now;}
 function getAttentionState(){return clock===null&&target===null&&owner===null&&intentId===null?null:copy({goal:target?{yaw:target.yaw,pitch:target.pitch}:null,weights:plannedWeights,plannedAt:lastPlan??clock??0,quietSince,quietBraked,actualOwnerId:owner,intendedId:intentId,urgencyState:{urgency:urgency.snapshot().filteredUrgency},referenceState:reference?{basisKey:reference.basisKey,lockedZoom:reference.lockedZoom,preferredPixels:reference.preferredPixels,bankId:reference.bankId}:null});}
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
  ids=roster();bounds=readBounds();geometryVersion=readGeometryVersion();lastPreferred=readPreferred();stats.rebuilds++;ready=false;policy=null;reference=null;dirty=true;lastView={...lastView,stale:true};
  if(!ids.length||!bounds){reason=ids.length?'unmeasured-bounds':'empty-roster';return{ready,reason};}
  if(!sameIds(activity.snapshot().roster,ids)){reason='activity-roster-mismatch';return{ready,reason};}
  const p=options.getProjection(),project=typeof p==='function'?p:p?.project?.bind(p);
  if(typeof project!=='function')throw TypeError('Actual selected projection callback required');
  if(p.ids&&!sameIds(p.ids,ids)){reason='projection-roster-mismatch';return{ready,reason};}
  policy=createExposureOrbitPolicy({ids:[...ids],getBounds:()=>({...bounds}),speakerYaw:options.getSpeakerYaw,getHolder:options.getHolder??(()=>null),getBlockers:blockers,getContentRects:content,measureVisibility:libraries.policy.measureVisibility,pitchMin:cfg.pitchMin,pitchMax:cfg.pitchMax,preferredPixels:lastPreferred,fractionTarget:cfg.fractionTarget,...Object.fromEntries(['readableMinFraction','readableMinAreaPx','yawDeadband','pitchDeadband','improvementThreshold'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]])),project(id,f){let q;try{q=project(id,f);}catch(e){if(e?.code!=='CAMERA_PROJECTION_UNAVAILABLE')throw e;return{visible:false};}if(q?.visible===false)return q;if(!q||![q.x,q.y,q.diameter,q.depth].every(finite)||q.diameter<=0||q.paintPadding!==undefined&&(!finite(q.paintPadding)||q.paintPadding<0))throw new GeometryError('Malformed actual visible projection');return q;}});
  if(owner!==null&&!ids.includes(owner))owner=null;if(intentId!==null&&!ids.includes(intentId))intentId=null;
  ready=true;reason='ready';return{ready,reason};
 }
 function assess(f,weights){return policy.assess(f,{reference,activeIds:activity.snapshot().rawActiveIds,weights,actualSpeakerId:owner,intendedId:intentId});}
 function exposureSnapshot(){return copy(lastView);}
 function result(current,actual=null,extra={}){
  const us=urgency.snapshot();
  if(actual)lastView={evaluated:true,evaluatedAt:clock,evaluatedFrame:{...current},evaluatedBasisKey:observedBasisKey,evaluatedActivityVersion:activity.snapshot().version,frame:{...current},stale:false,paused:Boolean(extra.paused),members:actual.members.map(m=>({id:m.id,weight:m.weight,projected:m.projected,fraction:m.photoFractionLower,diameter:m.projectedDiameterPx,visibleEquivalentDiameter:m.visibleEquivalentDiameterLowerPx??m.visibleEquivalentDiameterLower,frameFits:m.photoFrameFits,photoFrameFits:m.photoFrameFits,paintFrameFits:m.paintFrameFits,paintOverflowPx:m.paintOverflowPx})),weightedQuality:actual.weightedUtility,qualityBasis:actual.qualityBasis,requestedPixels:lastPreferred,estimatedPixelReferences:reference?.perId.map(r=>({...r}))??[],referenceEndpointOnly:true,heldTarget:target?{...target,zoom:current.zoom}:null,urgency:us,desiredRates:{yawRate:us.yawRate,pitchRate:us.pitchRate},actualAppliedVelocity:{...appliedVelocity},maximumRates:{...maxRates},reason};
  else lastView={...lastView,frame:{...current},stale:!lastView.evaluatedFrame||!exact(current,lastView.evaluatedFrame)||lastView.evaluatedBasisKey!==observedBasisKey||lastView.evaluatedActivityVersion!==activity.snapshot().version,paused:Boolean(extra.paused),urgency:us,desiredRates:{yawRate:us.yawRate,pitchRate:us.pitchRate},actualAppliedVelocity:{...appliedVelocity},reason};
  lastResult={frame:{...current},target:target?{...target,zoom:current.zoom}:null,applied:false,paused:false,blocked:false,reason,...extra,conversationFocus:focusSnapshot(),attention:getAttentionState(),metrics:{actual,motion:motion.snapshot(),zoomPolicy:'user-locked',urgency:us,desiredRates:{yawRate:us.yawRate,pitchRate:us.pitchRate},appliedVelocity:{...appliedVelocity},reference,opportunity:lastPlanMetrics?.opportunity??null}};return copy(lastResult);
 }
 function variation(a,b){const ids=new Set([...a.map(x=>x.id),...b.map(x=>x.id)]);return [...ids].reduce((sum,id)=>sum+Math.abs((a.find(x=>Object.is(x.id,id))?.weight??0)-(b.find(x=>Object.is(x.id,id))?.weight??0)),0)/2;}
 function commitGoal(current,weights,t){
  const proposed=policy.plan({current,weights,activeIds:activity.snapshot().rawActiveIds,actualSpeakerId:owner,intendedId:intentId,restPitch:rest(),basisKey:basisKey(),reference,previousTarget:target?{...target,zoom:current.zoom}:undefined});stats.plans++;reference=proposed.metrics.reference;lastPlanMetrics=proposed.metrics;lastLimited=false;
  target={yaw:proposed.frame.yaw,pitch:weights.length?clamp(proposed.frame.pitch,cfg.pitchMin,cfg.pitchMax):rest(),zoom:current.zoom};plannedWeights=weights.map(x=>({id:x.id,weight:x.weight}));lastPlan=t;dirty=false;
 }
 function step(t,dt,{paused=false,reducedMotion=false,mode='cinematic'}={}){
  if(!finite(dt)||dt<0||typeof paused!=='boolean')throw RangeError('Valid dt and pause flag required');checkTime(t);clock=t;stats.calls++;const current=frame(options.getFrame());observedBasisKey=JSON.stringify([readGeometryVersion(),roster(),readBounds(),cfg.pitchMin,cfg.pitchMax,readPreferred()]);
  if(paused||suspended!==null||mode==='manual'){if(!wasPaused){motion.reset();urgency.reset();}appliedVelocity={yaw:0,pitch:0};wasPaused=true;reason=suspended??'external-pause';return result(current,null,{paused:true});}
  try{
   if(wasPaused){wasPaused=false;rebuild();}
   if(!ready||!sameIds(roster(),ids)||!sameBounds(readBounds(),bounds)||!Object.is(readGeometryVersion(),geometryVersion)||!Object.is(readPreferred(),lastPreferred))rebuild();if(!ready)return result(current,null,{blocked:true});
   const fs=activity.snapshot(),weights=fs.weights.map(x=>({id:x.id,weight:x.weight})),selectedRest=rest();
   const restChanged=!Object.is(selectedRest,lastRest),zoomChanged=!Object.is(current.zoom,lastZoom);if(zoomChanged||restChanged){dirty=true;reference=null;}
   const quiet=!fs.rawActiveIds.length&&quietSince!==null&&t-quietSince>=cfg.quietHoldMs;
   if(quiet){if(!quietBraked||!target||restChanged){target={yaw:current.yaw,pitch:restChanged?selectedRest:target?.pitch??selectedRest,zoom:current.zoom};quietBraked=true;}dirty=false;}
   else{quietBraked=false;if(dirty||!target||weights.length&&!plannedWeights.length||t-(lastPlan??-Infinity)>=cfg.planIntervalMs&&variation(weights,plannedWeights)>=cfg.weightChangeThreshold)commitGoal(current,weights,t);}
   lastZoom=current.zoom;lastRest=selectedRest;
   const before=assess(current,weights);
   const destination={yaw:target.yaw,pitch:target.pitch,zoom:current.zoom};
   const guarded=(f)=>{
    let a;try{a=assess(f,weights);}catch(e){if(e instanceof GeometryError&&!exact(current,f))return{fits:false,visibleIds:[],overflowPenalty:Infinity,hardRefusal:true};throw e;}
    const contentLoss=before.contentFits?!a.contentFits:(a.contentOverflowPx??0)>(before.contentOverflowPx??0)+1e-8;
    const oldDistance=Math.abs(current.pitch-clamp(current.pitch,cfg.pitchMin,cfg.pitchMax)),newDistance=Math.abs(f.pitch-clamp(f.pitch,cfg.pitchMin,cfg.pitchMax)),pitchLoss=newDistance>oldDistance+1e-10;
    const hardRefusal=contentLoss||pitchLoss;
    return{fits:!hardRefusal,visibleIds:[],overflowPenalty:hardRefusal?Infinity:0,hardRefusal,contentLoss,pitchLoss};
   };
   const held=assess(destination,weights),currentQuality=clamp(before.weightedUtility,0,1),heldQuality=clamp(held.weightedUtility,0,1),need=1-currentQuality,gain=held.contentFits?Math.max(0,heldQuality-currentQuality):0,opportunity=need>1e-12?clamp(gain/need,0,1):0,remainingAngle=Math.max(Math.abs(wrap(destination.yaw-current.yaw)),Math.abs(destination.pitch-current.pitch));
   const scheduled=urgency.update({seconds:Math.min(dt,.1),need,opportunity,remainingAngle,blocked:lastLimited,quiet});
   if(!dt){reason='zero-dt';appliedVelocity={yaw:0,pitch:0};return result(current,before);}
   const beforeLimits=motion.snapshot().metrics.safetyLimits;
   let next=motion.step(current,destination,dt,{yawRate:scheduled.yawRate,pitchRate:scheduled.pitchRate,zoomInLogRate:1,zoomOutLogRate:1},reducedMotion,{minZoom:current.zoom,maxZoom:current.zoom,context:{requiredIds:[]},fit:guarded});stats.steps++;
   const elapsed=Math.min(dt,.1);next={yaw:wrap(current.yaw+clamp(wrap(next.yaw-current.yaw),-maxRates.yawRate*elapsed,maxRates.yawRate*elapsed)),pitch:current.pitch+clamp(next.pitch-current.pitch,-maxRates.pitchRate*elapsed,maxRates.pitchRate*elapsed),zoom:current.zoom};
   const post=guarded(next);
   if(post.hardRefusal){motion.reset();stats.blockedSteps++;target={...current};lastLimited=true;appliedVelocity={yaw:0,pitch:0};urgency.update({seconds:0,need:0,opportunity:0,remainingAngle:0,blocked:true});reason='angular-step-refused';return result(current,before,{blocked:true});}
   const actual=assess(next,weights),moved=!exact(current,next);appliedVelocity={yaw:wrap(next.yaw-current.yaw)/elapsed,pitch:(next.pitch-current.pitch)/elapsed};if(moved){options.applyFrame({...next,zoom:current.zoom});stats.applies++;}
   const limited=motion.snapshot().metrics.safetyLimits>beforeLimits;lastLimited=limited;if(limited){target={...next};urgency.update({seconds:0,need:0,opportunity:0,remainingAngle:0,blocked:true});}
   reason=limited?'angular-support-limited':quiet?'quiet-angular-hold':actual.weightedUtility>=.98?'holding-fuller-exposure':'seeking-fuller-exposure';
   return result(next,actual,{applied:moved});
  }catch(e){if(!(e instanceof GeometryError))throw e;ready=false;reason='invalid-selected-geometry';motion.reset();urgency.reset();appliedVelocity={yaw:0,pitch:0};stats.blockedSteps++;return result(current,null,{blocked:true});}
 }
 function suspend(why='manual-browse'){suspended=String(why);motion.reset();urgency.reset();appliedVelocity={yaw:0,pitch:0};dirty=true;}
 function resume(){suspended=null;wasPaused=false;rebuild();}
 function reset(){activity=makeActivity();clock=null;owner=null;intentId=null;history=[];target=null;plannedWeights=[];lastPlan=null;quietSince=null;quietBraked=false;lastZoom=null;lastRest=null;reference=null;lastPlanMetrics=null;lastLimited=false;lastView={evaluated:false,stale:true,members:[],reason:'reset'};urgency.reset();appliedVelocity={yaw:0,pitch:0};motion.reset();rebuild();}
 function beginHandoff(id,t){checkTime(t);if(!roster().includes(id))throw RangeError('Recipient outside roster');clock=t;intentId=id;return{intendedId:id,holderId:options.getHolder?.()??null};}
 function commitHandoff(t){checkTime(t);clock=t;intentId=null;}
 function handoffReady(){if(!ready||suspended!==null||wasPaused||intentId===null)return{ready:false,reason:'no-active-handoff-or-paused'};if(!sameIds(roster(),ids)||!sameBounds(readBounds(),bounds)||!Object.is(readGeometryVersion(),geometryVersion)||!Object.is(readPreferred(),lastPreferred)||reference&&!Object.is(frame(options.getFrame()).zoom,reference.lockedZoom))return{ready:false,reason:'geometry-or-reference-changed-rebuild-needed'};try{const a=assess(frame(options.getFrame()),activity.snapshot().weights);return{ready:Boolean(a.intended?.readable&&a.contentFits),reason:a.intended?.readable&&a.contentFits?'recipient-readable-at-user-scale':'recipient-not-readable-at-user-scale',actual:copy(a)};}catch(e){if(!(e instanceof GeometryError))throw e;return{ready:false,reason:'invalid-selected-geometry'};}}
 function snapshot(){return copy({algorithm:'exposure-orbit',frame:frame(options.getFrame()),ready,reason,activeId:owner,cameraOwnerId:owner,intendedId:intentId,clock,suspended,manualRecovery:null,roster:ids,history,configuration:{...cfg,profile:rates,urgentProfile:maxRates,urgency:urgency.configuration,motion:{responseSeconds:motion.snapshot().responseSeconds,rounding:motion.snapshot().rounding},zoomPolicy:'user-locked',targetCadence:'material-duration-or-basis-exposure-event'},conversationFocus:focusSnapshot(),attention:getAttentionState(),target:target?{...target,zoom:frame(options.getFrame()).zoom}:null,stats,motion:motion.snapshot(),urgency:urgency.snapshot(),exposure:exposureSnapshot(),lastResult});}
 return Object.freeze({observe,observeActivity,step,rebuild,suspend,resume,reset,snapshot,focusSnapshot,getActivityHelper:()=>activity,getAttentionState,exposureSnapshot,viewSnapshot:exposureSnapshot,beginHandoff,commitHandoff,cancelHandoff:commitHandoff,handoffReady});
}
export default createExposureOrbitController;
