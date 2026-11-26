import {projectPoint} from './geometry/world.mjs';
import {fitViewPose} from './geometry/views.mjs';
import {placeAnchoredRoomLabels} from './geometry/anchored-labels.mjs';
export const compactPhotoPadding=d=>Math.max(.30*d,.14*d+4,8);
/** Exact world projection + existing fitter/anchored labels; no source or room mutation. */
export function fitBreakoutMap({rooms,viewport}){
 if(!Array.isArray(rooms)||!rooms.length)throw TypeError('Visible rooms required');
 const {width,height,focal}=viewport;if(![width,height,focal].every(v=>Number.isFinite(v)&&v>0))throw TypeError('Valid map viewport required');
 const b={left:-width/2+12,right:width/2-12,top:-height/2+12,bottom:height/2-12},all=rooms.flatMap(r=>[...r.points,...r.ringPoints]);
 if(!all.length)throw TypeError('Map world geometry required');
 const target={x:(Math.min(...all.map(p=>p[0]))+Math.max(...all.map(p=>p[0])))/2,y:0,z:(Math.min(...all.map(p=>p[2]))+Math.max(...all.map(p=>p[2])))/2};
 function at(camera,forFit){
  const supports=[],records=[],avoid=[],project=p=>{const q=projectPoint(p,camera,viewport),o=camera.screenOffset??{x:0,y:0};return{...q,x:q.x+o.x,y:q.y+o.y};};
  for(const room of rooms){
   const a=project([room.anchor.x,room.anchor.y,room.anchor.z]),rects=[];
   for(const p of room.points){const q=project(p);if(!q.visible)return {supports:[{visible:false}],labels:[]};const d=room.worldDiameter*q.scale,r=d/2+compactPhotoPadding(d),rect={left:q.x-r,right:q.x+r,top:q.y-r,bottom:q.y+r};rects.push(rect);supports.push(rect);avoid.push({shape:'disc',x:q.x,y:q.y,radius:d/2+3});}
   for(const p of room.ringPoints){const q=project(p);if(!q.visible)return {supports:[{visible:false}],labels:[]};const rect={left:q.x-3,right:q.x+3,top:q.y-3,bottom:q.y+3};rects.push(rect);supports.push(rect);}
   if(!rects.length||!a.visible)continue;
   const footprint={left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))};
   records.push({id:room.id,title:room.name,topic:'',x:a.x,y:a.y,depth:a.depth,joined:room.joined,footprint});
  }
  const labels=placeAnchoredRoomLabels(records,b,{mobile:true,avoid,forFit});
  return{supports:[...supports,...labels.filter(l=>l.visible).map(l=>({left:l.x-l.width/2,right:l.x+l.width/2,top:l.y-l.height/2,bottom:l.y+l.height/2}))],labels};
 }
 const result=fitViewPose((z,c)=>at(c,true).supports,b,{pose:{yaw:height>=width?Math.PI/2:0,pitch:Math.PI/2,distance:1/.24,target,screenOffset:{x:0,y:0}},preferredZoom:1,minZoom:.02,maxZoom:3});
 // Label placement runs at the exact applied camera, including fitted screen offset.
 const labels=result.camera?at(result.camera,false).labels: [];
 return {...result,bounds:b,labels,roomIds:rooms.map(r=>r.id),target:'shared-world-breakout-map'};
}
