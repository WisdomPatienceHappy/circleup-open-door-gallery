/** Experimental B: one actual-geometry goal per owner/basis, no history ranking. */
const finite=Number.isFinite,rad=d=>d*Math.PI/180,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const copy=x=>JSON.parse(JSON.stringify(x)),MISS='CAMERA_PROJECTION_UNAVAILABLE';
const unavailable=()=>Object.assign(new RangeError('Stable speaker projection unavailable'),{code:MISS});
export function createStableSpeakerPolicy(options={}){
 const {assessmentLibrary,project,getBounds,speakerYaw,ids,getHolder=()=>null,minZoom=.72,maxZoom=2.15}=options,faceGoalFraction=options.faceGoalFraction??.46;
 if(typeof assessmentLibrary?.create!=='function'||typeof project!=='function'||typeof getBounds!=='function'||typeof speakerYaw!=='function'||!Array.isArray(ids)||!ids.length||!finite(minZoom)||!finite(maxZoom)||minZoom<=0||maxZoom<minZoom)throw TypeError('Assessment library, actual geometry, roster and positive zoom range required');
 if(!finite(faceGoalFraction)||faceGoalFraction<.14||faceGoalFraction>.6)throw RangeError('Face diameter fraction must remain .14.. .60');
 const roster=[...ids],truth=assessmentLibrary.create({...options,faceGoalFraction}),events=[];
 let active=null,lastOwner=null,lastTime=null,generation=0,revision=0,cached=null,lastPlan=null;
 function validateTime(now){if(!finite(now)||lastTime!==null&&now<lastTime)throw RangeError('Observed time must be finite and monotonic');}
 function observe(id,now){if(id!==null&&!roster.includes(id))throw RangeError('Speaker outside roster');validateTime(now);truth.observe(id,now);lastTime=now;if(id!==active){active=id;if(id!==null)lastOwner=id;events.push({id,at:now});if(events.length>4096)events.shift();}}
 function assess(frame,extra={}){return truth.assess(frame,extra);}
 function projection(id,frame){const p=project(id,frame);if(p?.visible===false)throw unavailable();if(!p||![p.x,p.y,p.diameter,p.depth].every(finite)||p.diameter<=0)throw RangeError('Finite actual portrait projection required');return p;}
 function rebase(){generation++;cached=null;}
 function plan({now,current,restPitch=rad(38),fixedPitch=null,focusId=null,basisKey=0}={}){
  validateTime(now);if(![current?.yaw,current?.pitch,current?.zoom,restPitch].every(finite)||current.zoom<=0||fixedPitch!==null&&!finite(fixedPitch))throw RangeError('Finite current and selected pitch required');
  if(focusId!==null&&!roster.includes(focusId))throw RangeError('Intent outside roster');
  if(!['string','number','boolean'].includes(typeof basisKey)||typeof basisKey==='number'&&!finite(basisKey))throw TypeError('basisKey must be a finite scalar');
  // Actual invalid geometry is never softened into a hypothetical miss.
  const actual=assess(current,{focusId}),holder=getHolder(),bounds=actual.bounds,selectedPitch=clamp(fixedPitch??restPitch,rad(18),rad(85)),owner=active??lastOwner;
  const key=JSON.stringify([owner,holder,focusId,bounds.left,bounds.right,bounds.top,bounds.bottom,selectedPitch,faceGoalFraction,minZoom,maxZoom,basisKey,generation]);
  if(cached?.key!==key){
   const goal=faceGoalFraction*Math.min(bounds.right-bounds.left,bounds.bottom-bounds.top),yaw=owner===null?current.yaw:speakerYaw(owner);if(!finite(yaw))throw RangeError('Finite speaker yaw required');
   let probes=0,misses=0;
   function hypothetical(fn){try{return fn();}catch(e){if(e?.code!==MISS)throw e;misses++;return null;}}
   const at=zoom=>({yaw:wrap(yaw),pitch:selectedPitch,zoom});
   function projectable(zoom){probes++;return hypothetical(()=>{for(const id of roster)projection(id,at(zoom));return true;})===true;}
   let desiredZoom=clamp(current.zoom,minZoom,maxZoom),target,assessment,conflict=false,reason=null;
   if(owner===null){target={...current};assessment=actual;}
   else{
    if(!projectable(minZoom))throw unavailable();let validMax=maxZoom;
    if(!projectable(maxZoom)){let lo=minZoom,hi=maxZoom;for(let j=0;j<12;j++){const z=(lo+hi)/2;if(projectable(z))lo=z;else hi=z;}validMax=lo;}
    const diameter=z=>{probes++;return projection(owner,at(z)).diameter;},lowD=diameter(minZoom),highD=diameter(validMax);if(highD<lowD)throw RangeError('Increasing actual diameter over valid zoom domain required');
    let lo=minZoom,hi=validMax;if(goal<=lowD)hi=lo;else if(goal>=highD)lo=hi;else for(let j=0;j<16;j++){const z=(lo+hi)/2;if(diameter(z)<goal)lo=z;else hi=z;}desiredZoom=(lo+hi)/2;
    const checked=[];const test=z=>{probes++;const a=hypothetical(()=>assess(at(z),{focusId}));if(a)checked.push({zoom:z,a});return a;};
    let upper=desiredZoom,a=test(upper),chosen=a?.fits?{zoom:upper,a}:null;
    // Full visibility need not be monotone over zoom. Search bounded descending
    // knots; refine only checked safe/unsafe bracket, retain only actual fits.
    for(let j=1;j<=32&&!chosen;j++){const z=desiredZoom*Math.exp(Math.log(minZoom/desiredZoom)*j/32),next=test(z);if(next?.fits){chosen={zoom:z,a:next};let low=z,high=upper;for(let k=0;k<12;k++){const m=(low+high)/2,v=test(m);if(v?.fits){chosen={zoom:m,a:v};low=m;}else high=m;}}upper=z;}
    if(!chosen){conflict=true;reason='no-feasible-speaker-rest-zoom';chosen=checked.find(x=>x.a.frameFits)??checked.at(-1);if(!chosen)throw unavailable();}
    target=at(chosen.zoom);assessment=chosen.a;
   }
   revision++;cached={key,frame:Object.freeze({...target}),owner,revision,desiredZoom,faceGoalPx:goal,assessment,conflict,reason,probes,misses,selectedPitch};
  }
  lastTime=now;const c=cached,a=assess(c.frame,{focusId});
  // Copy protects the held goal from a caller or smoother mutating its input.
  lastPlan={frame:{...c.frame},weights:[],metrics:{...a,stableSpeakerTarget:true,goalRevision:c.revision,goalOwnerId:c.owner,actualSpeakerId:active,attentionId:c.owner,holderId:holder,intendedId:focusId,faceGoalFraction,faceGoalPx:c.faceGoalPx,desiredZoom:c.desiredZoom,targetHeld:true,targetProjectionProbes:c.probes,hypotheticalProjectionMisses:c.misses,constraintConflict:!a.fits,constraintReason:a.fits?null:c.reason??'held-target-constraint-conflict',selectedPitch:c.selectedPitch,fixedPitch:fixedPitch===null?null:selectedPitch,fixedMode:fixedPitch!==null,returningFixed:fixedPitch!==null&&Math.abs(current.pitch-selectedPitch)>1e-8,returningAbove:fixedPitch===null&&(current.pitch<rad(18)||current.pitch>rad(85)),routeSampleSafe:null}};
  return copy(lastPlan);
 }
 return Object.freeze({observe,assess,plan,rebase,snapshot:()=>copy({activeId:active,actualSpeakerId:active,goalOwnerId:cached?.owner??lastOwner,lastTime,goalRevision:revision,rebaseGeneration:generation,observedEvents:events.length,events,lastPlan})});
}
