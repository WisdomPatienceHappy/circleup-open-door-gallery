/** E-only pan-relative seating. Actual world geometry, not a post-render stretch. */
import {seatLayoutPoints,ringLayoutPoints} from './seating.mjs';

const finite=(value,name)=>{if(!Number.isFinite(value))throw TypeError(name+' must be finite');return value;};
export function createPanAdaptiveSeating({count,radius,shape='oval',ovality=1.35,anchor={x:0,y:0,z:0,yaw:0},adaptive=true}={}){
 if(typeof adaptive!=='boolean')throw TypeError('adaptive must be boolean');
 const center={x:finite(anchor.x,'anchor.x'),y:finite(anchor.y,'anchor.y'),z:finite(anchor.z,'anchor.z'),yaw:finite(anchor.yaw??0,'anchor.yaw')};
 const config={shape,ovality},aligned=adaptive&&shape==='oval',baseConfig=aligned?{shape:'circle',ovality}:config;
 // Existing seating code owns domain validation and order. Keep that order throughout.
 const local=seatLayoutPoints(count,radius,baseConfig),c=Math.cos(center.yaw),s=Math.sin(center.yaw);
 const toWorld=([x,y,z])=>[center.x+x*c+z*s,center.y+y,center.z-x*s+z*c];
 function transform(point,yaw){
  finite(yaw,'candidate yaw');const world=toWorld(point);if(!aligned)return world;
  const rx=Math.cos(yaw),rz=-Math.sin(yaw),u=(world[0]-center.x)*rx+(world[2]-center.z)*rz,amount=(ovality-1)*u;
  return[world[0]+amount*rx,world[1],world[2]+amount*rz];
 }
 return Object.freeze({
  points(yaw){finite(yaw,'candidate yaw');return local.map(point=>transform(point,yaw));},
  rings(yaw,options={}){finite(yaw,'candidate yaw');return ringLayoutPoints(radius,{...baseConfig,...options}).map(loop=>loop.map(point=>transform(point,yaw)));},
  describe(yaw){finite(yaw,'candidate yaw');const rx=Math.cos(yaw),rz=-Math.sin(yaw),k=aligned?ovality-1:0;return{model:aligned?'pan-aligned-oval-v1':'fixed-seating-v1',adaptive:aligned,shape,ovality,anchor:{...center},yaw,matrix:aligned?{xx:1+k*rx*rx,xz:k*rx*rz,zz:1+k*rz*rz}:null};}
 });
}
