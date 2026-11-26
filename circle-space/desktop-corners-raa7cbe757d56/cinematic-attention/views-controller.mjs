/** Callback-only adapter. Ranking, projection and motion remain their existing owners'. */
const finite=Number.isFinite;
const copy=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const sameIds=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const sameFrame=(a,b)=>Math.abs(wrap(a.yaw-b.yaw))<1e-10&&Math.abs(a.pitch-b.pitch)<1e-10&&Math.abs(Math.log(a.zoom/b.zoom))<1e-10;
const MODES={cinematic:'recency',equal:'equal',current:'current'};
class InvalidProjection extends Error{constructor(message,{unavailable=false}={}){super(message);if(unavailable)this.code='CAMERA_PROJECTION_UNAVAILABLE';}}
const isProjectionUnavailable=error=>error instanceof InvalidProjection||error?.code==='CAMERA_PROJECTION_UNAVAILABLE';
function frame(value){
 if(!value||![value.yaw,value.pitch,value.zoom].every(finite)||value.zoom<=0)throw new TypeError('getFrame must return finite yaw/pitch and positive zoom');
 return {yaw:value.yaw,pitch:value.pitch,zoom:value.zoom};
}

export function createAttentionController(options={}){
 const required=['getRoster','getProjection','getBounds','getSpeakerYaw','getFrame','applyFrame'];
 for(const name of required)if(typeof options[name]!=='function')throw new TypeError(`${name} callback required`);
 const libraries=options.libraries??{policy:globalThis.AttentionConversationCamera,calm:globalThis.CalmConversationCamera,motion:globalThis.RoundConversationMotion};
 if(typeof libraries.policy?.create!=='function'||typeof libraries.calm?.stepFrame!=='function'||typeof libraries.motion?.create!=='function')throw new TypeError('Load the paired attention policy, Calm and Round libraries before creating the controller');
 const config={minZoom:.72,maxZoom:2.15,memorySeconds:8,paceSeconds:14,planIntervalMs:500,restPitch:38*Math.PI/180,...options.config};
 if(config.manualRecoveryMaxZoom!==undefined&&(!finite(config.manualRecoveryMaxZoom)||config.manualRecoveryMaxZoom<config.maxZoom))throw new RangeError('Manual recovery ceiling must be finite and at least the automatic maximum');
 if(config.portraitFraming!==undefined&&!['all','roles'].includes(config.portraitFraming))throw new RangeError('Portrait framing must be all or roles');
 if(config.restMode!==undefined&&!['adaptive','fixed'].includes(config.restMode))throw new RangeError('Rest mode must be adaptive or fixed');
 const profile={yawRate:.45,pitchRate:.3,zoomOutLogRate:.8,zoomInLogRate:.1,...options.config?.profile};
 if(![config.minZoom,config.maxZoom,config.memorySeconds,config.paceSeconds,config.planIntervalMs].every(v=>finite(v)&&v>0)||config.maxZoom<config.minZoom||!finite(config.restPitch))throw new RangeError('Positive zoom/time configuration and finite rest pitch required');
 if(!Object.values(profile).every(v=>finite(v)&&v>0))throw new RangeError('Motion rates must be finite and positive');
 for(const name of ['getBlockers','getContentRects','getBaseZoom','getRestPitch','getHolder'])if(options[name]!==undefined&&typeof options[name]!=='function')throw new TypeError(`${name} must be a callback`);
 const fixedPitch=config.restMode==='fixed'?(options.getRestPitch?.()??config.restPitch):null;
 if(fixedPitch!==null&&(!finite(fixedPitch)||fixedPitch<18*Math.PI/180||fixedPitch>85*Math.PI/180))throw new RangeError('Fixed automatic rest pitch must be18..85degrees');
 const routeStats={jointRecoveryIntents:0,focusRecoveryIntents:0,visibilityRecoveryIntents:0};
 function routeStep(current,target,dt,rates,reduced,safety){
  if(safety?.visibilityRecovery&&typeof safety.fit==='function'){
   const joint=libraries.calm.stepFrame(current,target,dt,rates,reduced),next=safety.fit(joint);
   if(!next.hardRefusal&&next.visibilityProgress){routeStats.visibilityRecoveryIntents++;return joint;}
  }
  if(safety?.focusRecovery&&typeof safety.fit==='function'){
   const before=safety.fit(current),joint=libraries.calm.stepFrame(current,target,dt,rates,reduced),next=safety.fit(joint);
   if(!before.fits&&!next.hardRefusal&&(next.fits||next.overflowPenalty<before.overflowPenalty-1e-8)){routeStats.focusRecoveryIntents++;return joint;}
  }
  if(finite(safety?.fixedPitch)&&Math.abs(current.pitch-safety.fixedPitch)>1e-8&&typeof safety.fit==='function'){
   const before=safety.fit(current);
   if(!before.fits){const joint=libraries.calm.stepFrame(current,target,dt,rates,reduced),next=safety.fit(joint);
    if(!next.hardRefusal&&(next.fits||next.overflowPenalty<before.overflowPenalty-1e-8)){routeStats.jointRecoveryIntents++;return joint;}
   }
  }
  return libraries.calm.stepFrame(current,target,dt,rates,reduced,safety);
 }
 const motion=libraries.motion.create({...config.motion,stepFrame:routeStep});
 const actualResponseSeconds=config.visibilityRecoveryZoom==='inward-only'?motion.snapshot().responseSeconds:null;
 if(config.visibilityRecoveryZoom==='inward-only'&&(!finite(actualResponseSeconds)||actualResponseSeconds<=0))throw new RangeError('Pure pixel recovery requires the motion instance to report its actual positive responseSeconds');
 const recoveryLookaheadSeconds=config.visibilityRecoveryZoom==='inward-only'?4*actualResponseSeconds:null;
 const stats={calls:0,steps:0,applies:0,plans:0,rebuilds:0,resets:0,pausedSteps:0,blockedSteps:0,planMs:[]};
 let ids=[],bounds=null,planner=null,history=[],active=null,clock=null,target=null,lastProposal=null,lastPlan=-Infinity;
 let intentId=null,manualRecovery=null;
 let ready=false,reason='not-built',dirty=true,mode='cinematic',suspendReason=null,wasPaused=false,lastResult=null;

 function roster(){
  const value=options.getRoster();
  if(!Array.isArray(value))throw new TypeError('getRoster must return an array of IDs or people with .id');
  const result=value.map(p=>p&&typeof p==='object'?p.id:p);
  if(result.some(id=>!(typeof id==='string'&&id.length||typeof id==='number'&&Number.isSafeInteger(id)))||new Set(result).size!==result.length)throw new TypeError('Roster IDs must be distinct nonempty strings or safe integers');
  return result;
 }
 function readBounds(){
  const b=options.getBounds();
  return b&&[b.left,b.right,b.top,b.bottom].every(finite)&&b.right>b.left&&b.bottom>b.top?{left:b.left,right:b.right,top:b.top,bottom:b.bottom}:null;
 }
 function sameBounds(a,b){return a===null&&b===null||a&&b&&['left','right','top','bottom'].every(k=>a[k]===b[k]);}
 function validateTime(now){if(!finite(now)||clock!==null&&now<clock)throw new RangeError('observe and step require one finite monotonic millisecond clock; reset before restarting it');}
 function invalidate(){dirty=true;target=null;lastProposal=null;lastResult=null;lastPlan=-Infinity;motion.reset();}
 function rebuild(){
  const nextIds=roster(),nextBounds=readBounds();ids=nextIds;bounds=nextBounds;planner=null;ready=false;stats.rebuilds++;invalidate();
  if(active!==null&&!ids.includes(active)){
   active=null;history.push({id:null,at:clock??0});if(history.length>4096)history=history.slice(-4096);
  }
  if(intentId!==null&&!ids.includes(intentId))intentId=null;
  if(!ids.length){reason='empty-roster';return {ready,reason,roster:[...ids]};}
  if(!bounds){reason='unmeasured-bounds';return {ready,reason,roster:[...ids]};}
  const projection=options.getProjection(),project=typeof projection==='function'?projection:typeof projection?.project==='function'?projection.project.bind(projection):null;
  if(!project)throw new TypeError('getProjection must return a project function or {project(id,frame)}');
  if(projection.ids&&!sameIds(projection.ids,ids)){reason='projection-roster-mismatch';return {ready,reason,roster:[...ids]};}
  const capturedBounds={...bounds};
  planner=libraries.policy.create({ids:[...ids],minZoom:config.minZoom,maxZoom:config.maxZoom,portraitFraming:config.portraitFraming??'all',activeMinVisibleFraction:.60,
   project(id,f){const p=project(id,f);if(p?.visible===false)throw new InvalidProjection('Selected-room projection is explicitly unavailable',{unavailable:true});if(!p||![p.x,p.y,p.diameter,p.depth].every(finite)||p.diameter<=0)throw new InvalidProjection('Selected-room projection record is malformed');return p;},
   getBounds:()=>({...capturedBounds}),speakerYaw:options.getSpeakerYaw,getBlockers:options.getBlockers??(()=>[]),getHolder:options.getHolder??(()=>null),getContentRects:options.getContentRects??(()=>[]),faceGoalFraction:config.faceGoalFraction??null,...Object.fromEntries(['zoomIntent','sizeObjective','focusRecovery','speakerSizeFloor','visibilityRecovery','focusObjective','visibilityRecoveryZoom'].filter(key=>config[key]!==undefined).map(key=>[key,config[key]]))});
  // Removed people become silence boundaries, rather than extending another
  // person's old speaking span across time that belonged to the removed voice.
  for(const event of history)planner.observe(event.id===null||ids.includes(event.id)?event.id:null,event.at);
  ready=true;reason='ready';return {ready,reason,roster:[...ids]};
 }
 function observe(id,now){
  const currentIds=roster();
  if(id!==null&&!currentIds.includes(id))throw new RangeError('Observed speaker is outside the current roster');
  validateTime(now);clock=now;
  if(!history.length||active!==id){history.push({id,at:now});if(history.length>4096)history=history.slice(-4096);dirty=true;target=null;lastProposal=null;lastResult=null;lastPlan=-Infinity;}
  active=id;
  if(planner&&sameIds(currentIds,ids))planner.observe(id,now);else {ready=false;planner=null;invalidate();}
 }
 function verticalDebt(a){return a.verticalOverflowPx??((a.contentVerticalOverflowPx??0)+a.portraits.reduce((sum,p)=>{const r=p.diameter/2+Math.max(0,p.paintPadding??0);return sum+Math.max(0,a.bounds.top-(p.y-r),p.y+r-a.bounds.bottom);},0));}
 function activeHorizontal(a){
  if(active===null)return 0;
  const p=a.portraits.find(p=>p.id===active);if(!p)return Infinity;
  const r=p.diameter/2+Math.max(0,p.paintPadding??0);
  return Math.max(0,a.bounds.left-(p.x-r),p.x+r-a.bounds.right);
 }
 function safetyFor(current,before,base,pitchConstraint=null){
  const beforeVertical=verticalDebt(before),beforeHorizontal=Math.max(0,before.overflowPx-beforeVertical);
  const beforeDebt=beforeVertical>.25?beforeVertical:beforeHorizontal;
  return {minZoom:config.minZoom,maxZoom:config.maxZoom,fixedPitch:pitchConstraint??undefined,overviewZoom:Math.max(current.zoom,target?.zoom??current.zoom,base),context:{requiredIds:active===null?[]:[active]},fit:f=>{
   let a;try{a=planner.assess(f,{activeId:active,focusId:intentId});}catch(error){const currentPose=Object.is(f.yaw,current.yaw)&&Object.is(f.pitch,current.pitch)&&Object.is(f.zoom,current.zoom);if(error?.code==='CAMERA_PROJECTION_UNAVAILABLE'&&!currentPose)return{fits:false,visibleIds:[],overflowPenalty:Infinity,hardRefusal:true,projectionUnavailable:true};throw error;}
   const vertical=verticalDebt(a),horizontal=Math.max(0,a.overflowPx-vertical);
   const roles=['active','holder','intent'];
   const pixelGrowth=lastProposal?.metrics?.visibilityRecoveryWaypoint?.zoomMode==='inward-only'&&before.verticalFits&&before.contentFits&&before.holderVisibilityFits&&before.intentVisibilityFits&&before.holderFrameFits&&before.intentFrameFits&&(pitchConstraint===null||Math.abs(current.pitch-pitchConstraint)<1e-10)&&!before.activeVisibilityFits&&before.activeFrameFits&&before.activeVisibleFractionLower>=before.activeMinFraction*(1-1e-10)&&before.activeVisibleAreaLowerPx<before.activeMinAreaPx*(1-1e-10);
   const pureInward=pixelGrowth&&Math.abs(wrap(f.yaw-current.yaw))<1e-10&&Math.abs(f.pitch-current.pitch)<1e-10&&f.zoom>=current.zoom-1e-10&&f.zoom<=Math.min(config.maxZoom,lastProposal.frame.zoom)+1e-10;
   const zoomWorsens=f.zoom>current.zoom+1e-8&&roles.some(role=>!before[role+'VisibilityFits']&&(a[role+'VisibleAreaLowerPx']<before[role+'VisibleAreaLowerPx']-1||(pixelGrowth&&role==='active'?a.activeVisibleFractionLower<before.activeMinFraction*(1-1e-10):a[role+'VisibleFractionLower']<before[role+'VisibleFractionLower']-.002)));
   const verticalWorsens=before.verticalFits?!a.verticalFits:vertical>beforeVertical+.25;
   const visibilityWorsens=roles.some(role=>before[role+'VisibilityFits']&&!a[role+'VisibilityFits']||before[role+'FrameFits']&&!a[role+'FrameFits']);
   const aboveBefore=current.pitch>=18*Math.PI/180-1e-8&&current.pitch<=85*Math.PI/180+1e-8;
   const leavesAbove=aboveBefore&&(f.pitch<18*Math.PI/180-1e-8||f.pitch>85*Math.PI/180+1e-8);
   // Internal STEP permission is distinct from actual visible-speaker truth.
   // Deficient yaw/pitch may cross a plateau; zoom-in cannot make it worse.
   const contentWorsens=before.contentFits===true?a.contentFits===false:(a.contentOverflowPx??0)>(before.contentOverflowPx??0)+1e-8;
   const fixedWorsens=pitchConstraint!==null&&Math.abs(f.pitch-pitchConstraint)>Math.abs(current.pitch-pitchConstraint)+1e-8;
   const hardRefusal=(pixelGrowth&&!pureInward)||zoomWorsens||verticalWorsens||visibilityWorsens||leavesAbove||contentWorsens||fixedWorsens;
   const allowed=a.frameFits&&!hardRefusal;
   let debt=beforeVertical>.25?vertical:horizontal;
   if(hardRefusal)debt=Math.max(debt,beforeDebt+1);
   const beforeActiveHorizontal=activeHorizontal(before),nextActiveHorizontal=activeHorizontal(a);
   const progressFloors=before.verticalFits&&before.contentFits&&before.holderVisibilityFits&&before.intentVisibilityFits&&before.holderFrameFits&&before.intentFrameFits&&(pixelGrowth?pureInward:Math.abs(Math.log(f.zoom/current.zoom))<1e-10)&&!hardRefusal;
   const travelToTarget=pose=>target?Math.max(Math.abs(wrap(target.yaw-pose.yaw))/profile.yawRate,Math.abs(target.pitch-pose.pitch)/profile.pitchRate,Math.abs(Math.log(target.zoom/pose.zoom))/(target.zoom>=pose.zoom?profile.zoomInLogRate:profile.zoomOutLogRate)):Infinity;
   const zeroVisibilityPlateau=before.activeVisibleAreaLowerPx===0&&before.activeVisibleFractionLower===0&&a.activeVisibleAreaLowerPx>=0&&a.activeVisibleFractionLower>=0&&nextActiveHorizontal<=beforeActiveHorizontal+1e-8&&travelToTarget(f)<travelToTarget(current)-1e-10;
   const visibilityProgress=progressFloors&&(pixelGrowth?a.activeVisibleAreaLowerPx>before.activeVisibleAreaLowerPx+1e-8&&a.activeVisibleFractionLower>=before.activeMinFraction*(1-1e-10)&&a.activeVisibilityDebt<=before.activeVisibilityDebt+1e-10:before.activeVisibilityFits?!before.activeFrameFits&&a.activeVisibilityFits&&nextActiveHorizontal<beforeActiveHorizontal-1e-8:zeroVisibilityPlateau||a.activeVisibleAreaLowerPx>before.activeVisibleAreaLowerPx+1e-8&&a.activeVisibleFractionLower>before.activeVisibleFractionLower+1e-10&&a.activeVisibilityDebt<=before.activeVisibilityDebt+1e-10&&nextActiveHorizontal<=beforeActiveHorizontal+1e-8);
   return {fits:allowed,visibleIds:allowed&&active!==null?[active]:[],overflowPenalty:debt,hardRefusal,visibilityProgress};
  }};
 }
 function result(current,{applied=false,paused=false,blocked=false,why=reason,actual=null}={}){
  lastResult={frame:{...current},target:target?{...target}:null,applied,paused,blocked,reason:why,mode,metrics:{actual,proposal:lastProposal?.metrics??null,weights:lastProposal?.weights??[],motion:motion.snapshot(),plans:stats.plans}};
  return copy(lastResult);
 }
 function step(now,dt,{paused=false,mode:requestedMode=mode,reducedMotion}={}){
  if(!Object.hasOwn(MODES,requestedMode))throw new RangeError('Camera mode must be cinematic, equal or current');
  if(typeof paused!=='boolean'||!finite(dt)||dt<0)throw new RangeError('paused must be boolean; dt is finite nonnegative seconds');
  validateTime(now);const current=frame(options.getFrame());clock=now;stats.calls++;
  if(requestedMode!==mode){mode=requestedMode;invalidate();}
  if(paused||suspendReason!==null){if(!wasPaused)invalidate();wasPaused=true;stats.pausedSteps++;return result(current,{paused:true,why:suspendReason??'external-pause'});}
  if(wasPaused){invalidate();wasPaused=false;}
  const currentIds=roster(),currentBounds=readBounds();
  if(!ready||!sameIds(currentIds,ids)||!sameBounds(currentBounds,bounds))rebuild();
  if(!ready)return result(current,{blocked:true});
  if(manualRecovery&&current.zoom<=config.maxZoom+1e-9){manualRecovery=null;dirty=true;lastPlan=-Infinity;}
  const recoveringZoom=manualRecovery!==null&&current.zoom>config.maxZoom+1e-9&&current.zoom<=manualRecovery.ceiling+1e-9;
  if(current.zoom<config.minZoom-1e-9||current.zoom>config.maxZoom+1e-9&&!recoveringZoom){stats.blockedSteps++;return result(current,{blocked:true,why:'outside-auto-zoom-range'});}
  if(active===null&&intentId===null&&(options.getHolder?.()??null)===null)return result(current,{why:'no-active-speaker'});
  const base=options.getBaseZoom?.()??1,rest=options.getRestPitch?.()??config.restPitch;
  if(!finite(base)||base<=0||!finite(rest))throw new RangeError('Base zoom must be positive and rest pitch finite radians');
  if(fixedPitch!==null&&rest!==fixedPitch)return result(current,{blocked:true,why:'configuration-change-requires-recreation'});
  let before;
  try{
   before=planner.assess(current,{activeId:active,focusId:intentId});
   if(recoveringZoom){
    // Recovery only widens the retained manual view. The automatic planner's
    // maxZoom stays unchanged; only the smoother's temporary bound includes
    // the actual starting pose, preventing an instantaneous clamp.
    const entryZoom=config.maxZoom-Math.min(config.maxZoom*1e-4,(config.maxZoom-config.minZoom)/2);
    target={yaw:current.yaw,pitch:current.pitch,zoom:entryZoom};
    if(!dt)return result(current,{why:'recovering-manual-zoom',actual:before});
    const safety={...safetyFor(current,before,base),maxZoom:current.zoom};
    const reduce=reducedMotion??globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
    const next=motion.step(current,target,dt,profile,Boolean(reduce),safety);stats.steps++;
    const from=safety.fit(current),to=safety.fit(next);
    const outwardOnly=next.zoom<=current.zoom+1e-10&&next.zoom>=entryZoom-1e-9&&Math.abs(wrap(next.yaw-current.yaw))<1e-10&&Math.abs(next.pitch-current.pitch)<1e-10;
    const allowed=outwardOnly&&!to.hardRefusal&&(to.fits||!from.fits&&to.overflowPenalty<=from.overflowPenalty+1e-8);
    if(!allowed){motion.reset();stats.blockedSteps++;return result(current,{blocked:true,why:'manual-zoom-recovery-refused',actual:before});}
    const actual=planner.assess(next,{activeId:active,focusId:intentId});
    if(!sameFrame(current,next)){options.applyFrame({...next});stats.applies++;}
    return result(next,{applied:!sameFrame(current,next),why:'recovering-manual-zoom',actual});
   }
   if(dirty||now-lastPlan>=config.planIntervalMs){
    const started=globalThis.performance?.now?.()??Date.now();
    lastProposal=planner.plan({now,current,baselineZoom:base,restPitch:rest,memorySeconds:config.memorySeconds,paceSeconds:config.paceSeconds,mode:MODES[mode],focusId:intentId,fixedPitch,motionRates:{yaw:profile.yawRate,pitch:profile.pitchRate,zoomIn:profile.zoomInLogRate,zoomOut:profile.zoomOutLogRate,...(recoveryLookaheadSeconds!==null?{recoveryLookaheadSeconds}:{})}});
    stats.planMs.push((globalThis.performance?.now?.()??Date.now())-started);if(stats.planMs.length>128)stats.planMs.shift();stats.plans++;target={...lastProposal.frame};lastPlan=now;dirty=false;
   }
   if(!dt)return result(current,{why:'zero-dt',actual:before});
   const safety=safetyFor(current,before,base,fixedPitch);
   if(lastProposal?.metrics?.recoveryWaypoint?.reason==='readable-horizontal-turn'&&before.combinedVisibilityFits&&before.verticalFits&&before.contentFits&&!before.activeFrameFits&&before.holderFrameFits&&before.intentFrameFits)safety.focusRecovery=true;
   if(lastProposal?.metrics?.visibilityRecoveryWaypoint?.reason==='actual-visibility-progress'&&(!before.activeVisibilityFits||!before.activeFrameFits)&&before.verticalFits&&before.contentFits&&before.holderVisibilityFits&&before.intentVisibilityFits&&before.holderFrameFits&&before.intentFrameFits)safety.visibilityRecovery=true;
   const reduce=reducedMotion??globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
   const next=motion.step(current,target,dt,profile,Boolean(reduce),safety);stats.steps++;
   // The frozen smoother's reduced-motion path returns a static target before
   // consulting fit. Apply the same explicit postcondition in both paths.
   const from=safety.fit(current),to=safety.fit(next),allowed=!to.hardRefusal&&(to.fits||!from.fits&&to.overflowPenalty<=from.overflowPenalty+1e-8)&&(!safety.visibilityRecovery||sameFrame(current,next)||to.visibilityProgress);
   if(!allowed){motion.reset();stats.blockedSteps++;return result(current,{blocked:true,why:'actual-step-refused',actual:before});}
   const actual=planner.assess(next,{activeId:active,focusId:intentId});
   if(!sameFrame(current,next)){options.applyFrame({...next});stats.applies++;}
   return result(next,{applied:!sameFrame(current,next),why:'ready',actual});
  }catch(error){
   if(!isProjectionUnavailable(error))throw error;
   invalidate();ready=false;reason='invalid-selected-projection';stats.blockedSteps++;return result(current,{blocked:true,actual:before??null});
  }
 }
 function suspend(why='manual-browse'){manualRecovery=null;suspendReason=String(why);invalidate();}
 function resume(){
  const current=frame(options.getFrame()),ceiling=config.manualRecoveryMaxZoom;
  manualRecovery=suspendReason!==null&&ceiling!==undefined&&current.zoom>config.maxZoom+1e-9&&current.zoom<=ceiling+1e-9?{ceiling:current.zoom}:null;
  suspendReason=null;wasPaused=false;rebuild();
 }
 function retargetIntent(id,now){
  validateTime(now);clock=now;intentId=id;dirty=true;target=null;lastProposal=null;lastResult=null;lastPlan=-Infinity;
  // Keep one motion instance and its velocity/acceleration across pass intent,
  // arrival and cancellation. Permission and actual speech remain caller-owned.
 }
 function beginHandoff(id,now){
  if(!roster().includes(id))throw new RangeError('Handoff recipient is outside the current roster');
  retargetIntent(id,now);return {intendedId:intentId,holderId:options.getHolder?.()??null};
 }
 function commitHandoff(now){retargetIntent(null,now);}
 function cancelHandoff(now){retargetIntent(null,now);}
 function handoffReady(){
  if(manualRecovery!==null)return {ready:false,reason:'recovering-manual-zoom'};
  if(intentId===null||!ready||suspendReason!==null||wasPaused)return {ready:false,reason:'no-active-handoff-or-paused'};
  if(fixedPitch!==null&&(options.getRestPitch?.()??config.restPitch)!==fixedPitch)return {ready:false,reason:'configuration-change-requires-recreation'};
  if(!sameIds(roster(),ids)||!sameBounds(readBounds(),bounds))return {ready:false,reason:'geometry-changed-rebuild-needed'};
  try{
   const current=frame(options.getFrame()),actual=planner.assess(current,{activeId:active,focusId:intentId});
   if(fixedPitch!==null){const attained=Math.abs(current.pitch-fixedPitch)<=1e-8,selected=planner.assess({...current,pitch:fixedPitch},{activeId:active,focusId:intentId});
    if(!attained||!selected.fits)return {ready:false,reason:!attained?'fixed-pitch-not-attained':'fixed-pitch-roles-or-content-not-readable',actual:copy(actual)};
   }
   return {ready:actual.fits,reason:actual.fits?'recipient-and-current-roles-readable':'framing-current-roles-and-recipient',actual:copy(actual)};
  }catch(error){if(!isProjectionUnavailable(error))throw error;return {ready:false,reason:'invalid-selected-projection'};}
 }
 function reset(){manualRecovery=null;clock=null;history=[];active=null;intentId=null;lastProposal=null;stats.resets++;rebuild();}
 function snapshot(){return copy({frame:frame(options.getFrame()),ready,reason,mode,suspended:suspendReason,manualRecovery,fixedPitch,configuration:{...Object.fromEntries(['zoomIntent','sizeObjective','focusRecovery','speakerSizeFloor','visibilityRecovery','focusObjective','visibilityRecoveryZoom'].filter(key=>config[key]!==undefined).map(key=>[key,config[key]])),portraitFraming:config.portraitFraming??'all',faceGoalFraction:config.faceGoalFraction??null,restMode:config.restMode??'adaptive',memorySeconds:config.memorySeconds,paceSeconds:config.paceSeconds,planIntervalMs:config.planIntervalMs,profile:{...profile}},route:{...routeStats},activeId:active,intendedId:intentId,clock,roster:ids,history,policy:planner?.snapshot()??null,target,lastResult,stats,motion:motion.snapshot()});}
 return Object.freeze({observe,step,rebuild,reset,suspend,resume,snapshot,beginHandoff,commitHandoff,cancelHandoff,handoffReady});
}

export default createAttentionController;
