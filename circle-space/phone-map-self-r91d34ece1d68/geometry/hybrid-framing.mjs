import {projectPoint} from './world.mjs';
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x)),lerp=(a,b,t)=>a+(b-a)*t;
/** Keep the full nominal photo/ring envelope centered; partial-near-plane keeps its captured fallback. */
export function centerHybridFrame({base,focusPoint=null,amount=0,viewport,bounds}){
 if(!base.valid||!focusPoint||amount<=0)return {...base,focusAmount:0,focusWorld:focusPoint};
 const camera={...base.camera,screenOffset:{x:0,y:0}},q=projectPoint(focusPoint,camera,viewport);
 if(!q.visible)return {...base,valid:false,reason:'focus-unavailable'};
 const desired={x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2},circleOffset={...base.offset},offset={x:lerp(circleOffset.x,desired.x-q.x,amount),y:lerp(circleOffset.y,desired.y-q.y,amount)};
 return {...base,reason:'speaker-offset-framing',offset,desiredCenter:desired,camera:{...base.camera,screenOffset:offset},circleOffset,focusAmount:amount,focusWorld:focusPoint};
}
/** Resolve semantic references against the SAME candidate/intermediate adaptive world, never cached actual points. */
export function resolveFocusRefs(refs,ids,points,fallback=null){
 if(!refs?.length)return fallback;const out=[0,0,0];let total=0;
 for(const {id,weight} of refs){const point=points[ids.indexOf(id)];if(!point||!Number.isFinite(weight)||weight<0)throw TypeError('Known participant and nonnegative focus weight required');total+=weight;point.forEach((v,i)=>out[i]+=weight*v);}
 return total>0?out.map(v=>v/total):fallback;
}
export function interpolateHybridFrame(a,b,t){
 const p=a.focusWorld??b.focusWorld??null,q=b.focusWorld??a.focusWorld??null,ar=a.focusRefs?.length?a.focusRefs:b.focusRefs??[],br=b.focusRefs?.length?b.focusRefs:a.focusRefs??[],ids=new Set([...ar.map(r=>r.id),...br.map(r=>r.id)]);
 const focusRefs=[...ids].map(id=>({id,weight:lerp(ar.find(r=>r.id===id)?.weight??0,br.find(r=>r.id===id)?.weight??0,t)})).filter(r=>r.weight>1e-10);
 return {yaw:wrap(a.yaw+wrap(b.yaw-a.yaw)*t),pitch:lerp(a.pitch,b.pitch,t),zoom:a.zoom,focusId:t>=1?b.focusId:a.focusId,
  focusAmount:lerp(a.focusAmount??0,b.focusAmount??0,t),focusWorld:p&&q?p.map((v,i)=>lerp(v,q[i],t)):null,focusRefs};
}
