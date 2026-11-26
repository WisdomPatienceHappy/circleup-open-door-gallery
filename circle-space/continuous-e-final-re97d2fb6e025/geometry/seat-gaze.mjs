/** Seat orientation only. Host owns fixed eye, optics, scene writes and gates. */
const finite=Number.isFinite;
const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const validId=id=>typeof id==='string'&&id.length>0||typeof id==='number'&&Number.isSafeInteger(id);
function point(value){
 const p=Array.isArray(value)&&value.length===3?{x:value[0],y:value[1],z:value[2]}:value;
 return p&&[p.x,p.y,p.z].every(finite)?{x:p.x,y:p.y,z:p.z}:null;
}
function orientation(value){
 if(!value||![value.yaw,value.pitch].every(finite))throw new TypeError('Finite current yaw and pitch required');
 return {yaw:value.yaw,pitch:value.pitch};
}
export function createSeatGaze({motion=globalThis.RoundConversationMotion,responseSeconds=.18,rounding=1,yawRate=.45,pitchRate=.3}={}){
 if(typeof motion?.create!=='function')throw new TypeError('Seat gaze requires the reviewed Round motion factory');
 if(![yawRate,pitchRate].every(v=>finite(v)&&v>0))throw new RangeError('Positive finite angular rates required');
 const profile={yawRate,pitchRate,zoomOutLogRate:.8,zoomInLogRate:.1};
 function angularStep(current,target,seconds,rates){
  const dt=Math.min(seconds,.1);
  return {yaw:wrap(current.yaw+clamp(wrap(target.yaw-current.yaw),-rates.yawRate*dt,rates.yawRate*dt)),pitch:current.pitch+clamp(target.pitch-current.pitch,-rates.pitchRate*dt,rates.pitchRate*dt),zoom:1};
 }
 const dynamics=motion.create({stepFrame:angularStep,responseSeconds,rounding});
 if(dynamics.snapshot?.().model!=='round-v1')throw new TypeError('Seat gaze requires the reviewed Round motion model');
 let held=true,last=null;
 const stats={calls:0,followingSteps:0,holdTransitions:0,explicitResets:0};
 function hold(current,reason){
  if(!held){dynamics.reset();stats.holdTransitions++;}held=true;
  last={orientation:{...current},target:null,following:false,moving:false,reason};return structuredClone(last);
 }
 function step({current,eye,speakerId=null,speaker=null,selfId=null,dtSeconds,paused=false,reducedMotion=false}={}){
  const actual=orientation(current);
  if(!finite(dtSeconds)||dtSeconds<0||typeof paused!=='boolean'||typeof reducedMotion!=='boolean')throw new TypeError('Nonnegative finite dtSeconds and boolean gates required');
  stats.calls++;
  // A disabled/manual host need not provide a currently usable target/eye.
  if(paused)return hold(actual,'host-paused');
  if(speakerId===null)return hold(actual,'no-speaker');
  if(!validId(speakerId))return hold(actual,'invalid-speaker-id');
  if(speakerId===selfId)return hold(actual,'self-speaking');
  const origin=point(eye),targetPoint=point(speaker);
  if(!origin)return hold(actual,'invalid-eye');
  if(!targetPoint)return hold(actual,'invalid-speaker-position');
  const dx=origin.x-targetPoint.x,dy=origin.y-targetPoint.y,dz=origin.z-targetPoint.z,horizontal=Math.hypot(dx,dz),distance=Math.hypot(dx,dy,dz);
  if(![dx,dy,dz,horizontal,distance].every(finite))return hold(actual,'invalid-direction');
  if(distance<=1e-9)return hold(actual,'coincident-target');
  // lookFromEye looks opposite the camera's toward vector. At a pole, yaw
  // has no optical meaning; retain actual yaw instead of inventing a turn.
  const target={yaw:horizontal<=1e-9?actual.yaw:Math.atan2(dx,dz),pitch:Math.atan2(dy,horizontal)};
  held=false;
  const next=dtSeconds===0?actual:dynamics.step({...actual,zoom:1},{...target,zoom:1},dtSeconds,profile,reducedMotion,{minZoom:1,maxZoom:1});
  stats.followingSteps++;
  const out={yaw:next.yaw,pitch:next.pitch};
  last={orientation:out,target,following:true,moving:Math.abs(wrap(out.yaw-actual.yaw))>1e-12||Math.abs(out.pitch-actual.pitch)>1e-12,reason:'following-speaker'};
  return structuredClone(last);
 }
 function reset(){dynamics.reset();stats.explicitResets++;held=true;last=null;}
 function snapshot(){return structuredClone({kind:'seat-gaze',configuration:{responseSeconds,rounding,yawRate,pitchRate},held,last,stats,motion:dynamics.snapshot()});}
 return Object.freeze({step,reset,snapshot});
}
export default createSeatGaze;
