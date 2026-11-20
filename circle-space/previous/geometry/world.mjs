/** Pure perspective geometry. No UI, media, membership or speaker policy. */
const PI = Math.PI;
const finite = (value,name) => { if(!Number.isFinite(value)) throw new TypeError(`${name} must be finite`); return value; };
const point = value => {
 if(!Array.isArray(value) || value.length!==3) throw new TypeError('Expected [x,y,z]');
 return value.map((v,i)=>finite(v,`point[${i}]`));
};
function targetValue(value={x:0,y:0,z:0}) { return {x:finite(value.x,'target.x'),y:finite(value.y,'target.y'),z:finite(value.z,'target.z')}; }
function bounded(value,min,max,name) { finite(value,name);if(value<min||value>max)throw new RangeError(`${name} must be in ${min}..${max}`);return value; }
function layoutValue(layout={}) {
 const arrangement=String(layout.arrangement??'arc').toLowerCase();
 if(!['arc','ring','scatter'].includes(arrangement))throw new RangeError('Unknown arrangement');
 return {arrangement,spacing:bounded(layout.spacing??1,.65,2,'spacing'),roomScale:bounded(layout.roomScale??1,.6,1.4,'roomScale'),rotation:bounded(layout.rotation??0,-PI,PI,'rotation'),portraitPadding:bounded(layout.portraitPadding??.65,0,100,'portraitPadding')};
}
function hash(text) { let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296; }
export function seatPoints(count,radius=.75) {
 if(!Number.isInteger(count)||count<1||count>10000)throw new RangeError('count must be an integer in1..10000');
 bounded(radius,0,1000000,'radius');
 return Array.from({length:count},(_,i)=>{const u=i/count*2*PI;return [radius*Math.sin(u),0,radius*Math.cos(u)];});
}
export function roomAnchor(room,layout={}) {
 if(!room||typeof room!=='object')throw new TypeError('Room required');
 const cfg=layoutValue(layout),a=room.anchor??room.center;
 if(!a)throw new TypeError('Room anchor required');
 let x=finite(a.x,'anchor.x'),z=finite(a.z,'anchor.z');const y=finite(a.y??0,'anchor.y'),r=Math.hypot(x,z);
 if(r>0){
  if(cfg.arrangement==='arc'){
   const angle=Math.atan2(x,-z)*.62;x=Math.sin(angle)*r;z=-Math.cos(angle)*r;
  }else if(cfg.arrangement==='ring'){
   const radius=4.5+(r-4.5)*.16;x=x/r*radius;z=z/r*radius;
  }else{
   const seed=hash(room.id??`${x},${z}`)*2*PI;x+=Math.sin(seed)*.85;z+=Math.cos(seed*1.37)*.85;
  }
 }
 const c=Math.cos(cfg.rotation),s=Math.sin(cfg.rotation);
 return {x:(x*c+z*s)*cfg.spacing,y,z:(-x*s+z*c)*cfg.spacing,radius:bounded(room.radius??.75,0,1000000,'room.radius')*cfg.roomScale,yaw:finite(room.yaw??0,'room.yaw')+cfg.rotation};
}
export function worldSeatPoints(room,count,layout={}) {
 const a=roomAnchor(room,layout),c=Math.cos(a.yaw),s=Math.sin(a.yaw);
 return seatPoints(count,a.radius).map(([x,y,z])=>[a.x+x*c+z*s,a.y+y,a.z-x*s+z*c]);
}
export function viewportBounds(value) {
 if(!value||typeof value!=='object')throw new TypeError('Bounds required');
 let left,right,top,bottom;
 if(Number.isFinite(value.width)&&Number.isFinite(value.height)){
  if(value.width<=0||value.height<=0)throw new RangeError('Positive width/height required');
  left=-value.width/2;right=value.width/2;top=-value.height/2;bottom=value.height/2;
 }else{left=finite(value.left,'left');right=finite(value.right,'right');top=finite(value.top,'top');bottom=finite(value.bottom,'bottom');if(right<=left||bottom<=top)throw new RangeError('Nonempty bounds required');}
 const width=right-left,height=bottom-top;
 const result={left,right,top,bottom,width,height,padding:bounded(value.padding??12,0,Math.min(width,height)/2-.001,'padding')};
 if(value.focal!==undefined){result.focal=finite(value.focal,'focal');if(result.focal<=0)throw new RangeError('Positive focal required');}
 return result;
}
function cameraValue(camera,bounds){
 if(!camera||typeof camera!=='object')throw new TypeError('Camera required');
 const yaw=finite(camera.yaw??0,'yaw'),pitch=finite(camera.pitch??PI/5,'pitch'),distance=finite(camera.distance??1/.24,'distance');
 if(distance<=0)throw new RangeError('Positive camera distance required');
 const target=targetValue(camera.target),b=viewportBounds(bounds);
 let focal=b.focal??Math.min(b.width,b.height)*1.25;
 if(b.focal===undefined&&camera.fov!==undefined){const fov=bounded(camera.fov,.001,PI-.001,'fov');focal=b.height/(2*Math.tan(fov/2));}
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 return {yaw,pitch,distance,target,bounds:b,focal,right:[cy,0,-sy],up:[-sy*sp,cp,-cy*sp],toward:[sy*cp,sp,cy*cp]};
}
function basisPoint(value,c){const [x,y,z]=point(value),v=[x-c.target.x,y-c.target.y,z-c.target.z],dot=a=>v[0]*a[0]+v[1]*a[1]+v[2]*a[2];return {screenX:dot(c.right),screenY:-dot(c.up),depth:dot(c.toward)};}
export function projectPoint(value,camera,bounds){
 const c=cameraValue(camera,bounds),v=basisPoint(value,c),cameraDepth=c.distance-v.depth;
 if(cameraDepth<=.15+1e-12)return {x:0,y:0,scale:0,depth:v.depth,cameraDepth,visible:false};
 const scale=c.focal/cameraDepth;
 return {x:v.screenX*scale,y:v.screenY*scale,scale,depth:v.depth,cameraDepth,visible:true};
}
function activeRooms(rooms){if(!Array.isArray(rooms))throw new TypeError('Room array required');return rooms.filter(r=>!['hidden','ended'].includes(r.status));}
function supports(rooms,layout){const cfg=layoutValue(layout);return activeRooms(rooms).map(room=>{const a=roomAnchor(room,layout);return {...a,support:a.radius+cfg.portraitPadding*cfg.roomScale};});}
export function fitWorldCamera(rooms,layout={},bounds,pose={}){
 const all=supports(rooms,layout),b=viewportBounds(bounds),target=pose.target?targetValue(pose.target):all.length?{x:(Math.min(...all.map(a=>a.x-a.support))+Math.max(...all.map(a=>a.x+a.support)))/2,y:(Math.min(...all.map(a=>a.y-a.support))+Math.max(...all.map(a=>a.y+a.support)))/2,z:(Math.min(...all.map(a=>a.z-a.support))+Math.max(...all.map(a=>a.z+a.support)))/2}:{x:0,y:0,z:0};
 const base={yaw:pose.yaw??0,pitch:pose.pitch??PI/4,distance:1,target,...(pose.fov===undefined?{}:{fov:pose.fov})};
 const c=cameraValue(base,b),left=b.left+b.padding,right=b.right-b.padding,top=b.top+b.padding,bottom=b.bottom-b.padding;
 if(left>=0||right<=0||top>=0||bottom<=0)throw new RangeError('Fitting bounds must contain the centered principal point');
 let distance=.25;
 for(const a of all)for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
  const v=basisPoint([a.x+sx*a.support,a.y+sy*a.support,a.z+sz*a.support],c);
  const xNeed=v.screenX>=0?v.screenX*c.focal/right:v.screenX*c.focal/left;
  const yNeed=v.screenY>=0?v.screenY*c.focal/bottom:v.screenY*c.focal/top;
  distance=Math.max(distance,v.depth+Math.max(.150001,xNeed,yNeed));
 }
 return {...base,distance:distance*(1+1e-9)};
}
