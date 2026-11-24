/** Explicit room-local seating choices. No camera, room anchors, IDs or DOM writes. */
import {seatPoints} from './world.mjs';
const SHAPES=new Set(['circle','oval','double-ring']);
function options(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Seating options must be an object');
 const shape=value.shape??'circle',ovality=value.ovality??1.35;
 if(!SHAPES.has(shape))throw new RangeError('shape must be circle, oval or double-ring');
 if(!Number.isFinite(ovality))throw new TypeError('ovality must be finite');
 if(ovality<1||ovality>2)throw new RangeError('ovality must be an aspect ratio in1..2');
 return{shape,ovality};
}
function radiusValue(radius){if(!Number.isFinite(radius))throw new TypeError('radius must be finite');if(radius<0||radius>1000000)throw new RangeError('radius must be in0..1000000');return radius;}
/** Array index remains roster/seat index; sort projected paint, never this array. */
export function seatLayoutPoints(count,radius=.75,config={}){
 const {shape,ovality}=options(config);
 // Delegate validation and default circle arithmetic to the existing source.
 const circle=seatPoints(count,radius);
 if(shape==='circle')return circle;
 if(shape==='oval')return circle.map(([x,y,z])=>[x*ovality,y,z]);
 const innerCount=Math.floor(count/3),outerCount=count-innerCount;
 if(innerCount===0)return circle;
 const inner=seatPoints(innerCount,radius*.5),offset=Math.PI/outerCount;
 const outer=Array.from({length:outerCount},(_,i)=>{const u=i/outerCount*2*Math.PI+offset;return[radius*Math.sin(u),0,radius*Math.cos(u)];});
 return [...inner,...outer];
}
/** Closed ground-plane contours, inner first for explicit double-ring. */
export function ringLayoutPoints(radius=.75,config={}){
 const {shape,ovality}=options(config),segments=config.segments??144;
 radiusValue(radius);
 if(!Number.isInteger(segments)||segments<3||segments>4096)throw new RangeError('segments must be an integer in3..4096');
 const radii=shape==='double-ring'?[radius*.5,radius]:[radius];
 return radii.map(r=>{
  const loop=seatPoints(segments,r).map(([x,y,z])=>[x*(shape==='oval'?ovality:1),y,z]);
  loop.push([...loop[0]]);return loop;
 });
}
/** Room-local support only; parent expands for portraits/paint and rotates it. */
export function seatLayoutExtents(radius=.75,config={}){
 const {shape,ovality}=options(config);radiusValue(radius);
 const radiusX=radius*(shape==='oval'?ovality:1),radiusZ=radius;
 return{minX:-radiusX,maxX:radiusX,minY:0,maxY:0,minZ:-radiusZ,maxZ:radiusZ,radiusX,radiusZ,maxRadius:Math.max(radiusX,radiusZ)};
}
