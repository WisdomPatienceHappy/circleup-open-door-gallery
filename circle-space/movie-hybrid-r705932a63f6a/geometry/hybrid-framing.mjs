import {projectPoint} from './world.mjs';
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x)),lerp=(a,b,t)=>a+(b-a)*t;
/** Center the actual world circle pivot; optionally blend toward an observed person's fixed world point. */
export function centerHybridFrame({base,circlePoint,focusPoint=null,amount=0,viewport,bounds}){
 const camera={...base.camera,screenOffset:{x:0,y:0}},q=projectPoint(circlePoint,camera,viewport);
 const desired={x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
 if(!q.visible)return {...base,valid:false,reason:'circle-pivot-unavailable'};
 const circleOffset={x:desired.x-q.x,y:desired.y-q.y},p=focusPoint?projectPoint(focusPoint,camera,viewport):q;
 if(!p.visible)return {...base,valid:false,reason:'focus-unavailable'};
 const offset={x:circleOffset.x+amount*(q.x-p.x),y:circleOffset.y+amount*(q.y-p.y)};
 return {...base,valid:true,reason:amount?'speaker-offset-framing':'fixed-circle-pivot-centered',offset,desiredCenter:desired,camera:{...base.camera,screenOffset:offset},circleOffset,focusAmount:amount,focusWorld:focusPoint};
}
export function interpolateHybridFrame(a,b,t){
 const p=a.focusWorld??b.focusWorld??null,q=b.focusWorld??a.focusWorld??null;
 return {yaw:wrap(a.yaw+wrap(b.yaw-a.yaw)*t),pitch:lerp(a.pitch,b.pitch,t),zoom:a.zoom,focusId:t>=1?b.focusId:a.focusId,
  focusAmount:lerp(a.focusAmount??0,b.focusAmount??0,t),focusWorld:p&&q?p.map((v,i)=>lerp(v,q[i],t)):null};
}
