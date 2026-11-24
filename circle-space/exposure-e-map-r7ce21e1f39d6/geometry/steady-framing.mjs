/** D-only visual framing. Pure candidate geometry; never changes zoom/target/seats. */
import {projectPoint} from './world.mjs';
const finite=(x,n)=>{if(!Number.isFinite(x))throw TypeError(n+' must be finite');return x;};
const positive=(x,n)=>{finite(x,n);if(x<=0)throw RangeError(n+' must be positive');return x;};
const readOffset=v=>({x:finite(v?.x??0,'offset.x'),y:finite(v?.y??0,'offset.y')});
function geometry({points,worldDiameter,camera,viewport}){if(!Array.isArray(points)||!points.length)throw TypeError('Joined points required');positive(worldDiameter,'worldDiameter');positive(camera?.distance,'distance');return points.map(p=>projectPoint(p,camera,viewport));}
export function centerSteadyFrame({camera,points,ringPoints=[],worldDiameter,viewport,usableBounds,fallbackOffset=camera?.screenOffset}={}){
 const b=usableBounds;if(!b||![b.left,b.right,b.top,b.bottom].every(Number.isFinite)||b.left>=b.right||b.top>=b.bottom)throw TypeError('Usable bounds required');
 const desiredCenter={x:(b.left+b.right)/2,y:(b.top+b.bottom)/2},photos=geometry({points,worldDiameter,camera,viewport}),ring=ringPoints.map(p=>projectPoint(p,camera,viewport)),all=[...photos,...ring];
 if(all.some(q=>!q.visible))return{valid:false,reason:'partial-near-plane-envelope',camera:{...camera,screenOffset:readOffset(fallbackOffset)},offset:readOffset(fallbackOffset),desiredCenter,unavailableCount:all.filter(q=>!q.visible).length,envelope:null};
 const supports=[...photos.map(q=>{const r=q.scale*worldDiameter/2;return{left:q.x-r,right:q.x+r,top:q.y-r,bottom:q.y+r};}),...ring.map(q=>({left:q.x,right:q.x,top:q.y,bottom:q.y}))];
 const envelope={left:Math.min(...supports.map(q=>q.left)),right:Math.max(...supports.map(q=>q.right)),top:Math.min(...supports.map(q=>q.top)),bottom:Math.max(...supports.map(q=>q.bottom))},center={x:(envelope.left+envelope.right)/2,y:(envelope.top+envelope.bottom)/2},offset={x:desiredCenter.x-center.x,y:desiredCenter.y-center.y};
 return{valid:true,reason:'visual-photo-envelope-centered',camera:{...camera,screenOffset:offset},offset,desiredCenter,envelope,center,unavailableCount:0};
}
/** Explicit median-pixel target with optional starting near-face cap; no full-circle-fit objective. */
export function autoSteadyZoom({camera,points,worldDiameter,viewport,targetPixels=160,maxFacePixels=targetPixels*1.8,minZoom=.08,maxZoom=3,baseDistance=1/.24}={}){
 positive(targetPixels,'targetPixels');positive(maxFacePixels,'maxFacePixels');positive(minZoom,'minZoom');positive(maxZoom,'maxZoom');positive(baseDistance,'baseDistance');if(maxZoom<minZoom)throw RangeError('Zoom range reversed');
 const samples=geometry({camera,points,worldDiameter,viewport}),origin=projectPoint([camera.target.x,camera.target.y,camera.target.z],camera,viewport);if(!origin.visible)throw RangeError('Auto camera origin is unavailable');const focal=origin.scale*camera.distance,depths=samples.map(q=>q.depth).sort((a,b)=>a-b),medianDepth=depths[Math.floor(depths.length/2)],preferredDistance=medianDepth+focal*worldDiameter/targetPixels,nearDistance=Math.max(...depths)+.150001,frontDistance=Math.max(...depths)+focal*worldDiameter/maxFacePixels,minDistance=Math.max(baseDistance/maxZoom,nearDistance,frontDistance),distance=Math.min(baseDistance/minZoom,Math.max(minDistance,preferredDistance)),zoom=baseDistance/distance;
 const final=geometry({camera:{...camera,distance},points,worldDiameter,viewport}),ds=final.filter(q=>q.visible).map(q=>q.scale*worldDiameter).sort((a,b)=>a-b),medianPixels=ds[Math.floor(ds.length/2)]??0;
 return{zoom,distance,targetPixels,maxFacePixels,nearestPixels:Math.max(...ds),frontLimited:frontDistance>preferredDistance+1e-9,medianPixels,exactTarget:Math.abs(medianPixels-targetPixels)<1e-7,projectable:final.every(q=>q.visible),limited:Math.abs(distance-preferredDistance)>1e-9,range:{minZoom,maxZoom},reason:'explicit-auto-pixel-size'};
}
/** Explicit viewport/setting boundary only. Prefer edge-on tilt before smaller Auto faces. */
export function planSteadyViewport({camera,points,ringPoints=[],worldDiameter,viewport,usableBounds,targetPixels=160,autoSize=false,preferredPitch=24*Math.PI/180,minPitch=5*Math.PI/180}={}){
 positive(targetPixels,'targetPixels');finite(preferredPitch,'preferredPitch');finite(minPitch,'minPitch');if(minPitch<0||preferredPitch<minPitch||preferredPitch>Math.PI/4)throw RangeError('Ordered acute viewport pitch required');
 const availableHeight=usableBounds?.bottom-usableBounds?.top;positive(availableHeight,'availableHeight');const cap=targetPixels*1.8,limit=availableHeight*.98;
 function evaluate(pitch,maxFacePixels=cap){const pose={...camera,pitch},sizing=autoSize?autoSteadyZoom({camera:pose,points,worldDiameter,viewport,targetPixels,maxFacePixels}):null,actual=sizing?{...pose,distance:sizing.distance}:pose,g=centerSteadyFrame({camera:actual,points,ringPoints,worldDiameter,viewport,usableBounds}),photoHeight=g.valid?g.envelope.bottom-g.envelope.top:Infinity;return{camera:actual,sizing,centering:g,photoHeight,verticalFits:photoHeight<=limit};}
 let chosen=null;const count=Math.max(1,Math.ceil((preferredPitch-minPitch)/(Math.PI/360)));
 for(let i=0;i<=count;i++){const q=evaluate(i===count?minPitch:preferredPitch-(preferredPitch-minPitch)*i/count);chosen=q;if(q.verticalFits)break;}
 let fallbackSteps=0;if(autoSize&&!chosen.verticalFits){let low=1,high=cap,best=evaluate(minPitch,low);if(best.verticalFits){for(let i=0;i<24;i++){fallbackSteps++;const middle=(low+high)/2,q=evaluate(minPitch,middle);if(q.verticalFits){low=middle;best=q;}else high=middle;}chosen=best;}}
 return{...chosen,adaptive:{requestedPitch:preferredPitch,pitch:chosen.camera.pitch,pitchMax:chosen.camera.pitch,minPitch,availableHeight,plannedPhotoHeight:chosen.photoHeight,plannedVerticalFits:chosen.verticalFits,zoomChanged:!Object.is(chosen.camera.distance,camera.distance),autoSize,fallbackSteps,nearFaceCapPx:chosen.sizing?.maxFacePixels??null,reason:chosen.verticalFits?(fallbackSteps?'angle-then-size-fallback':chosen.camera.pitch<preferredPitch-1e-9?'angle-first-height-adaptation':'preferred-angle-fits'):'fixed-scale-vertical-crop'}};
}
