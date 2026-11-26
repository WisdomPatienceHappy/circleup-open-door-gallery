import {fitViewPose} from './views.mjs';
import {projectPoint} from './world.mjs';
import {portraitPaintPadding} from './portrait-paint-padding.mjs';

/** Pure joined-circle overview fit. Never accepts other-room geometry. */
export function fitJoinedOverview({points,ringPoints,worldDiameter,viewport,anchor={x:0,y:0,z:0},topInset=26}){
 const {width,height}=viewport;
 if(![width,height,viewport.focal,worldDiameter].every(n=>Number.isFinite(n)&&n>0))throw TypeError('Valid overview geometry required');
 if(!points.length)throw TypeError('Joined participants required');
 const bounds={left:-width/2+8,right:width/2-8,top:-height/2+topInset,bottom:height/2-8};
 const support=(zoom,camera)=>{
  const rects=[];
  for(const p of points){const q=projectPoint(p,camera,viewport);if(!q.visible)return [{visible:false}];const d=worldDiameter*q.scale,r=d/2+portraitPaintPadding(d);rects.push({left:q.x-r,right:q.x+r,top:q.y-r,bottom:q.y+r});}
  for(const p of ringPoints){const q=projectPoint(p,camera,viewport);if(!q.visible)return [{visible:false}];rects.push({left:q.x-3,right:q.x+3,top:q.y-3,bottom:q.y+3});}
  return rects;
 };
 const result=fitViewPose(support,bounds,{pose:{yaw:0,pitch:Math.PI/2,distance:1/.24,target:anchor,screenOffset:{x:0,y:0}},preferredZoom:3,minZoom:.02,maxZoom:3});
 return {...result,bounds,participantCount:points.length,target:'joined-circle-only'};
}

/** New large-view role; these bounded trial thresholds do not alter the presence-only control. */
export function speakerFrameQuality({photo,fraction,bounds,targetPixels=165,retained=false}){
 if(!photo||!bounds||![photo.x,photo.y,photo.diameter,fraction,targetPixels,...Object.values(bounds)].every(Number.isFinite)||photo.diameter<=0||targetPixels<=0)return {valid:false,framed:false,reason:'unknown-frame'};
 const width=bounds.right-bounds.left,height=bounds.bottom-bounds.top;
 if(width<=0||height<=0)return {valid:false,framed:false,reason:'unknown-frame'};
 const centerError=Math.hypot((photo.x-(bounds.left+bounds.right)/2)/width,(photo.y-(bounds.top+bounds.bottom)/2)/height);
 const centerLimit=retained?.18:.12,sizeRatio=retained?.75:.9,minFraction=retained?.5:.6;
 return {valid:true,framed:centerError<=centerLimit&&photo.diameter>=targetPixels*sizeRatio&&fraction>=minFraction,centerError,diameter:photo.diameter,fraction,targetPixels,centerLimit,sizeRatio,minFraction};
}
