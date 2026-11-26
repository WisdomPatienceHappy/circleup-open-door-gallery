import {createConversationFocus} from './conversation-focus.mjs';
import {createStableFocusPolicy} from './stable-focus-policy.mjs';

const finite = Number.isFinite;
const wrap = x => Math.atan2(Math.sin(x),Math.cos(x));
const copy = x => structuredClone(x);
const same = (a,b) => Math.abs(wrap(a.yaw-b.yaw))<1e-10 && Math.abs(a.pitch-b.pitch)<1e-10 && Math.abs(Math.log(a.zoom/b.zoom))<1e-10;
const sameIds = (a,b) => a.length===b.length && a.every((id,i)=>id===b[i]);
const MISS = 'CAMERA_PROJECTION_UNAVAILABLE';
class ProjectionError extends Error {}

/** C: observed conversation focus, held group destination, current geometry guards.
 * This module receives current observations only; it has no schedule interface.
 */
export function createConversationController(options={}) {
  for (const k of ['getRoster','getProjection','getBounds','getSpeakerYaw','getFrame','applyFrame']) if(typeof options[k]!=='function') throw TypeError(k+' callback required');
  const libs=options.libraries??{policy:globalThis.AttentionConversationCamera,calm:globalThis.CalmConversationCamera,motion:globalThis.RoundConversationMotion};
  if(typeof libs.policy?.create!=='function'||typeof libs.calm?.stepFrame!=='function'||typeof libs.motion?.create!=='function') throw TypeError('Assessment, Calm and Round libraries required');
  const c=options.config??{},config={minZoom:c.minZoom??.08,maxZoom:c.maxZoom??2.15,manualRecoveryMaxZoom:c.manualRecoveryMaxZoom??3,restPitch:c.restPitch??38*Math.PI/180,restMode:c.restMode??'adaptive',portraitFraming:c.portraitFraming??'roles',faceGoalFraction:c.faceGoalFraction??.46};
  if(![config.minZoom,config.maxZoom,config.manualRecoveryMaxZoom,config.restPitch,config.faceGoalFraction].every(finite)||config.minZoom<=0||config.maxZoom<config.minZoom||config.manualRecoveryMaxZoom<config.maxZoom) throw RangeError('Finite valid camera configuration required');
  if(!['adaptive','fixed'].includes(config.restMode)||!['all','roles'].includes(config.portraitFraming)||config.faceGoalFraction<.14||config.faceGoalFraction>.6)throw RangeError('Valid rest/framing mode and face fraction.14.. .60 required');
  const rates={yawRate:.45,pitchRate:.3,zoomInLogRate:.1,zoomOutLogRate:.8,...c.profile};
  if(!Object.values(rates).every(x=>finite(x)&&x>0)) throw RangeError('Positive finite motion rates required');
  const makeFocus=()=>createConversationFocus(c.conversationFocus??{});
  let focus=options.focusHelper??makeFocus(),owner=focus.snapshot().ownerId??null,clock=options.initialNow??null,planner=null,ids=[],bounds=null,proposal=null,dirty=true,suspended=null,wasPaused=false,recovery=null,phase=0,travel=null,goalRevision=null;
  if(clock!==null&&!finite(clock))throw RangeError('initialNow must be finite');
  let intentId=null;
  let latestActivity=new Map(),history=[],lastResult=null,reason='not-built',ready=false;
  const stats={calls:0,steps:0,applies:0,plans:0,rebuilds:0,blockedSteps:0};
  const round=libs.motion.create({...c.motion,stepFrame:libs.calm.stepFrame});
  function checkTime(t){if(!finite(t)||clock!==null&&t<clock)throw RangeError('One finite monotonic millisecond clock required');}
  function now(t){checkTime(t);clock=t;}
  function frame(v){if(!v||![v.yaw,v.pitch,v.zoom].every(finite)||v.zoom<=0)throw TypeError('Finite frame and positive zoom required');return{yaw:v.yaw,pitch:v.pitch,zoom:v.zoom};}
  function roster(){const list=options.getRoster();if(!Array.isArray(list))throw TypeError('Roster must be an array');const out=list.map(p=>p&&typeof p==='object'?p.id:p);if(out.some(id=>!(typeof id==='string'&&id.length||typeof id==='number'&&Number.isSafeInteger(id)))||new Set(out).size!==out.length)throw TypeError('Distinct valid roster IDs required');return out;}
  function readBounds(){const b=options.getBounds();return b&&[b.left,b.right,b.top,b.bottom].every(finite)&&b.left<b.right&&b.top<b.bottom?{left:b.left,right:b.right,top:b.top,bottom:b.bottom}:null;}
  function sameBounds(a,b){return a&&b&&['left','right','top','bottom'].every(k=>a[k]===b[k]);}
  function clear(){proposal=null;dirty=true;travel=null;phase=0;goalRevision=null;round.reset();}
  function focusSnapshot(){return copy(focus.snapshot());}
  function observe(id,t){checkTime(t);if(id!==null&&!roster().includes(id))throw RangeError('Owner outside roster');focus.observe(id,t);if(latestActivity.size)focus.update({now:t,activity:latestActivity});owner=id;clock=t;history.push({id,at:t});if(history.length>2048)history.shift();planner?.observe(id,t);}
  function observeActivity({now:t,activity}){checkTime(t);const before=focus.snapshot().version;focus.update({now:t,activity});const entries=activity instanceof Map?[...activity]:Object.entries(activity);latestActivity=new Map(entries.map(([id,x])=>[id,typeof x==='object'?{active:x.active,level:finite(x.level)?x.level:0}:x]));clock=t;if(focus.snapshot().version!==before)dirty=true;}

  function rebuild(){
    ids=roster();bounds=readBounds();stats.rebuilds++;clear();planner=null;ready=false;
    if(!ids.length||!bounds){reason=ids.length?'unmeasured-bounds':'empty-roster';return{ready,reason};}
    if(owner!==null&&!ids.includes(owner))owner=null;
    // A basis rebuild must not invent a new all-silent measurement or replay
    // observations into an already-live recognizer.
    if(focus.snapshot().focusIds.some(id=>!ids.includes(id))){reason='focus-roster-mismatch';return{ready,reason};}
    const p=options.getProjection(),project=typeof p==='function'?p:p?.project?.bind(p),point=options.getFocusPoint??p?.focusPoint?.bind(p);
    if(typeof project!=='function'||typeof point!=='function')throw TypeError('Actual projection and captured focusPoint required');
    if(p.ids&&!sameIds(p.ids,ids)){reason='projection-roster-mismatch';return{ready,reason};}
    planner=createStableFocusPolicy({assessmentLibrary:libs.policy,ids:[...ids],...config,project(id,f){const q=project(id,f);if(q?.visible===false)throw Object.assign(new ProjectionError('Projection unavailable'),{code:MISS});if(!q||![q.x,q.y,q.diameter,q.depth].every(finite)||q.diameter<=0)throw new ProjectionError('Malformed projection');return q;},getFocusPoint:point,getBounds:()=>({...bounds}),speakerYaw:options.getSpeakerYaw,getHolder:options.getHolder??(()=>null),getBlockers:options.getBlockers??(()=>[]),getContentRects:options.getContentRects??(()=>[])});
    planner.observe(owner,clock??0);planner.setFocusIds(focus.snapshot().focusIds,focus.snapshot().version);ready=true;reason='ready';return{ready,reason};
  }
  function safety(current,before){
    const previous=before.groupMembers,oldOverflow=before.overflowPx;
    const fixed=!recovery&&config.restMode==='fixed'?(options.getRestPitch?.()??config.restPitch):null;
    if(fixed!==null&&(!finite(fixed)||fixed<Math.PI/10||fixed>85*Math.PI/180))throw RangeError('Fixed pitch must remain18..85degrees');
    return{minZoom:config.minZoom,maxZoom:config.maxZoom,fixedPitch:fixed??undefined,overviewZoom:Math.max(current.zoom,proposal?.frame.zoom??current.zoom),context:{requiredIds:focus.snapshot().focusIds},fit:f=>{
      let a;try{a=planner.assess(f,{focusId:intentId});}catch(e){if(e?.code===MISS&&!['yaw','pitch','zoom'].every(k=>Object.is(current[k],f[k])))return{fits:false,visibleIds:[],overflowPenalty:Infinity,hardRefusal:true};throw e;}
      const memberLoss=previous.some(old=>{const n=a.groupMembers.find(m=>m.id===old.id);return !n||old.frameFits&&!n.frameFits||old.visibilityFits&&!n.visibilityFits;});
      const contentLoss=before.contentFits?!a.contentFits:a.contentOverflowPx>before.contentOverflowPx+1e-8;
      const verticalLoss=before.verticalFits?!a.verticalFits:a.verticalOverflowPx>before.verticalOverflowPx+.25;
      const roleLoss=before.holderFrameFits&&!a.holderFrameFits||before.holderVisibilityFits&&!a.holderVisibilityFits||before.intentFrameFits&&!a.intentFrameFits||before.intentVisibilityFits&&!a.intentVisibilityFits;
      const above=current.pitch>=Math.PI/10-1e-8&&current.pitch<=85*Math.PI/180+1e-8;
      const pitchLoss=above&&(f.pitch<Math.PI/10-1e-8||f.pitch>85*Math.PI/180+1e-8);
      const zoomLoss=f.zoom>current.zoom+1e-8&&(previous.some(old=>{const n=a.groupMembers.find(m=>m.id===old.id);return !old.visibilityFits&&(n.areaLower<old.areaLower-1||n.fraction<old.fraction-.002);})||['holder','intent'].some(role=>!before[role+'VisibilityFits']&&(a[role+'VisibleAreaLowerPx']<before[role+'VisibleAreaLowerPx']-1||a[role+'VisibleFractionLower']<before[role+'VisibleFractionLower']-.002)));
      const fixedLoss=fixed!==null&&Math.abs(f.pitch-fixed)>Math.abs(current.pitch-fixed)+1e-8;
      const hardRefusal=fixedLoss||memberLoss||contentLoss||verticalLoss||roleLoss||pitchLoss||zoomLoss;
      return{fits:a.frameFits&&!hardRefusal,visibleIds:a.frameFits&&!hardRefusal?focus.snapshot().focusIds:[],overflowPenalty:hardRefusal?Math.max(a.overflowPx,oldOverflow+1):a.overflowPx,hardRefusal};
    }};
  }
  function result(current,actual=null,extra={}){lastResult={frame:{...current},target:proposal?{...proposal.frame}:null,reason,applied:false,paused:false,blocked:false,...extra,conversationFocus:focusSnapshot(),metrics:{actual,proposal:proposal?.metrics??null,motion:round.snapshot()}};return copy(lastResult);}
  function step(t,dt,{paused=false,reducedMotion=false,mode='cinematic'}={}){
    if(!finite(dt)||dt<0||typeof paused!=='boolean')throw RangeError('Valid dt and paused required');now(t);stats.calls++;const current=frame(options.getFrame());
    if(paused||suspended!==null||mode==='manual'){if(!wasPaused)clear();wasPaused=true;reason=suspended??'external-pause';return result(current,null,{paused:true});}
    try{
      if(wasPaused){wasPaused=false;rebuild();}
      if(!ready||!sameIds(roster(),ids)||!sameBounds(readBounds(),bounds))rebuild();if(!ready)return result(current,null,{blocked:true});
      const fs=focus.snapshot();planner.setFocusIds(fs.focusIds,fs.version);
      const before=planner.assess(current,{focusId:intentId});
      if(recovery&&current.zoom<=config.maxZoom+1e-9)recovery=null;
      if(current.zoom<config.minZoom-1e-9||current.zoom>config.maxZoom+1e-9&&!recovery){reason='outside-auto-zoom-range';stats.blockedSteps++;return result(current,before,{blocked:true});}
      if(!fs.focusIds.length){reason='empty-conversation-focus';return result(current,before,{paused:true});}
      let s=safety(current,before),destination;
      if(recovery){destination={...current,zoom:config.maxZoom-Math.min(config.maxZoom*1e-4,(config.maxZoom-config.minZoom)/2)};s={...s,maxZoom:current.zoom};}
      else{
        const rest=options.getRestPitch?.()??config.restPitch;if(!finite(rest))throw RangeError('Finite selected rest pitch required');
        const key=JSON.stringify([fs.version,options.getHolder?.()??null,intentId,rest]);if(proposal?.constraintKey!==key)dirty=true;
        if(dirty){proposal=planner.plan({now:t,current,restPitch:rest,fixedPitch:config.restMode==='fixed'?rest:null,focusId:intentId});proposal.constraintKey=key;stats.plans++;dirty=false;travel=proposal.metrics.stableTravel?.corridorFits?proposal.metrics.stableTravel.waypoints.map(f=>({...f})):null;phase=0;goalRevision=proposal.metrics.goalRevision;}
        destination=proposal.frame;
        if(travel&&!reducedMotion){if(same(current,proposal.frame))phase=2;while(phase<2){const f=travel[phase],v=round.snapshot().velocity,near=Math.abs(wrap(current.yaw-f.yaw))<.002&&Math.abs(current.pitch-f.pitch)<.002&&Math.abs(Math.log(current.zoom/f.zoom))<.002;if(!near||phase===1&&(Math.abs(v.yaw)>.02||Math.abs(v.pitch)>.02))break;phase++;}destination=travel[phase];}
      }
      if(!dt){reason='zero-dt';return result(current,before);}
      const next=round.step(current,destination,dt,rates,reducedMotion,s);stats.steps++;const from=s.fit(current),to=s.fit(next);
      const recoveryWrong=recovery&&(next.zoom>current.zoom+1e-10||Math.abs(wrap(next.yaw-current.yaw))>1e-10||Math.abs(next.pitch-current.pitch)>1e-10);
      if(to.hardRefusal||recoveryWrong||!to.fits&&(from.fits||to.overflowPenalty>from.overflowPenalty+1e-8)){round.reset();stats.blockedSteps++;reason='actual-step-refused';return result(current,before,{blocked:true});}
      const actual=planner.assess(next,{focusId:intentId}),moved=!same(current,next);if(moved){options.applyFrame({...next});stats.applies++;}reason=recovery?'recovering-manual-zoom':actual.fits?'following-conversation':'recovering-conversation-focus';return result(next,actual,{applied:moved});
    }catch(e){if(!(e instanceof ProjectionError)&&e?.code!==MISS)throw e;ready=false;clear();reason='invalid-selected-projection';stats.blockedSteps++;return result(current,null,{blocked:true});}
  }
  function suspend(why='manual-browse'){suspended=String(why);recovery=null;clear();}
  function resume(){const f=frame(options.getFrame());recovery=suspended!==null&&f.zoom>config.maxZoom&&f.zoom<=config.manualRecoveryMaxZoom?{ceiling:f.zoom}:null;suspended=null;wasPaused=false;rebuild();}
  function reset(){focus=makeFocus();owner=null;intentId=null;clock=null;latestActivity=new Map();history=[];recovery=null;rebuild();}
  function snapshot(){return copy({algorithm:'conversation-focus',frame:frame(options.getFrame()),ready,reason,activeId:owner,cameraOwnerId:owner,intendedId:intentId,clock,suspended,history,roster:ids,manualRecovery:recovery,target:proposal?.frame??null,configuration:{...config,profile:rates,planIntervalMs:null,targetCadence:'focus-set-or-basis-event'},conversationFocus:focusSnapshot(),policy:planner?.snapshot()??null,stats,motion:{...round.snapshot(),stableTravel:travel?{phase,goalRevision,waypoint:travel[phase]}:null},lastResult});}
  function beginHandoff(id,t){checkTime(t);if(!roster().includes(id))throw RangeError('Recipient outside roster');clock=t;intentId=id;dirty=true;return{intendedId:id,holderId:options.getHolder?.()??null};}
  function commitHandoff(t){now(t);intentId=null;dirty=true;}
  function handoffReady(){
    if(recovery!==null)return{ready:false,reason:'recovering-manual-zoom'};
    if(!ready||suspended!==null||wasPaused||intentId===null||!focus.snapshot().focusIds.length)return{ready:false,reason:'no-active-handoff-or-paused'};
    if(!sameIds(roster(),ids)||!sameBounds(readBounds(),bounds))return{ready:false,reason:'geometry-changed-rebuild-needed'};
    const fs=focus.snapshot(),ps=planner.snapshot();
    if(ps.focusRevision!==fs.version||!sameIds(ps.focusIds,ids.filter(id=>fs.focusIds.includes(id))))return{ready:false,reason:'focus-changed-replan-needed'};
    try{
      const current=frame(options.getFrame()),actual=planner.assess(current,{focusId:intentId});
      if(config.restMode==='fixed'){
        const fixed=options.getRestPitch?.()??config.restPitch;
        if(!finite(fixed)||fixed<Math.PI/10||fixed>85*Math.PI/180)throw RangeError('Fixed pitch must remain18..85degrees');
        if(Math.abs(current.pitch-fixed)>1e-8)return{ready:false,reason:'fixed-pitch-not-attained',actual:copy(actual)};
        if(!planner.assess({...current,pitch:fixed},{focusId:intentId}).fits)return{ready:false,reason:'fixed-pitch-roles-or-content-not-readable',actual:copy(actual)};
      }
      return{ready:actual.fits,reason:actual.fits?'conversation-and-recipient-readable':'framing-conversation-and-recipient',actual:copy(actual)};
    }catch(e){if(!(e instanceof ProjectionError)&&e?.code!==MISS)throw e;return{ready:false,reason:'invalid-selected-projection'};}
  }
  return Object.freeze({beginHandoff,commitHandoff,cancelHandoff:commitHandoff,handoffReady,observe,observeActivity,step,rebuild,suspend,resume,reset,snapshot,focusSnapshot,getFocusHelper:()=>focus});
}
export default createConversationController;
