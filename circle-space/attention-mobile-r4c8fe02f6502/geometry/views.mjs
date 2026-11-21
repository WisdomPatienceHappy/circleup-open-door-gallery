/** Pure camera poses. Host owns mode/gesture/cinematic state and actual DOM support. */
import {fitWorldCamera} from './world.mjs';
import {fitProjectedEnvelope} from './framing.mjs';

const BASE=1/.24;
const finite=(v,name)=>{if(!Number.isFinite(v))throw new TypeError(`${name} must be finite`);return v;};
const positive=(v,name)=>{finite(v,name);if(v<=0)throw new RangeError(`${name} must be positive`);return v;};
function point(value,name){
 if(!value||typeof value!=='object')throw new TypeError(`${name} required`);
 const v=Array.isArray(value)?{x:value[0],y:value[1],z:value[2]}:value;
 return {x:finite(v.x,`${name}.x`),y:finite(v.y,`${name}.y`),z:finite(v.z,`${name}.z`)};
}
function offset(value={x:0,y:0}){return{x:finite(value.x,'screenOffset.x'),y:finite(value.y,'screenOffset.y')};}
function pose(value){
 const out={yaw:finite(value.yaw,'yaw'),pitch:finite(value.pitch,'pitch'),distance:positive(value.distance,'distance'),target:point(value.target,'target'),screenOffset:offset(value.screenOffset)};
 if(value.fov!==undefined){finite(value.fov,'fov');if(value.fov<.001||value.fov>Math.PI-.001)throw new RangeError('fov must be in .001..π-.001');out.fov=value.fov;}
 return out;
}
export function circleViewPose({anchor,zoom=1,yaw=0,pitch=38*Math.PI/180,baseDistance=BASE,screenOffset,fov}={}){
 positive(zoom,'zoom');positive(baseDistance,'baseDistance');
 return pose({yaw,pitch,distance:baseDistance/zoom,target:anchor,screenOffset,fov});
}
export function cameraEye(camera){
 const c=pose(camera),cp=Math.cos(c.pitch);
 return {x:finite(c.target.x+Math.sin(c.yaw)*cp*c.distance,'eye.x'),y:finite(c.target.y+Math.sin(c.pitch)*c.distance,'eye.y'),z:finite(c.target.z+Math.cos(c.yaw)*cp*c.distance,'eye.z')};
}
/** Change look direction about a fixed eye, rather than orbiting a fixed target. */
export function lookFromEye({eye,yaw,pitch,focusDistance,screenOffset}={}){
 const e=point(eye,'eye');finite(yaw,'yaw');finite(pitch,'pitch');positive(focusDistance,'focusDistance');
 const cp=Math.cos(pitch),target={x:e.x-Math.sin(yaw)*cp*focusDistance,y:e.y-Math.sin(pitch)*focusDistance,z:e.z-Math.cos(yaw)*cp*focusDistance};
 return pose({yaw,pitch,distance:focusDistance,target,screenOffset});
}
export function fromSeatViewPose({seat,anchor,screenOffset,fov}={}){
 const eye=point(seat,'seat'),target=point(anchor,'anchor');
 const dx=finite(eye.x-target.x,'seat delta.x'),dy=finite(eye.y-target.y,'seat delta.y'),dz=finite(eye.z-target.z,'seat delta.z');
 const distance=positive(Math.hypot(dx,dy,dz),'seat-to-anchor distance');
 return pose({yaw:Math.atan2(dx,dz),pitch:Math.atan2(dy,Math.hypot(dx,dz)),distance,target,screenOffset,fov});
}
export function freeFlatPose(camera){return pose({...pose(camera),pitch:Math.PI/2});}
export function mapViewPose(rooms,layout,bounds,{yaw=0,pitch=Math.PI/2,target,fov}={}){
 return pose(fitWorldCamera(rooms,layout,bounds,{yaw,pitch,...(target===undefined?{}:{target}),...(fov===undefined?{}:{fov})}));
}
/** Fit caller's exact projected supports; failed fits return no applicable camera. */
export function fitViewPose(projectAtZoom,bounds,{pose:inputPose,preferredZoom=1,minZoom=.08,maxZoom=3,baseDistance=BASE,allowOffset=true,maxIterations=28}={}){
 if(typeof projectAtZoom!=='function')throw new TypeError('projectAtZoom callback required');
 positive(baseDistance,'baseDistance');const fixed=pose(inputPose);
 const at=zoom=>pose({...fixed,distance:baseDistance/zoom,screenOffset:{x:0,y:0}});
 const fit=fitProjectedEnvelope(zoom=>projectAtZoom(zoom,at(zoom)),bounds,{preferredZoom,minZoom,maxZoom,allowOffset,maxIterations});
 return {camera:fit.fits?pose({...at(fit.zoom),screenOffset:fit.offset}):null,fit};
}
