/** Stage-local inspector placement only. No DOM, world, camera, room or media mutation. */
const SIDES=['right','left','below','above'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function number(value,name,{min=0}={}){if(!Number.isFinite(value))throw new TypeError(name+' must be finite');if(value<min)throw new RangeError(name+' must be at least '+min);return value;}
function point(value,name){if(!Number.isFinite(value))throw new TypeError(name+' must be finite');return value;}
function hidden(reason){return{visible:false,reason,x:null,y:null,width:0,height:0,side:null,clamped:false,overlapsAnchor:false,overlapsControls:false,scrollable:{x:false,y:false}};}
function rect(x,y,width,height){return{left:x,top:y,right:x+width,bottom:y+height};}
function intersection(a,b){return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));}
function overlap(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
function avoidRect(r){if(!r||!['left','right','top','bottom'].every(k=>Number.isFinite(r[k]))||r.right<r.left||r.bottom<r.top)throw new TypeError('avoidRects need finite left/right/top/bottom extents');return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};}
export function placeRoomPopup({anchor,popup,stage,padding=12,gap=12,preferredSide='right',avoidRects=[]}={}){
 if(!stage||!popup)throw new TypeError('stage and popup dimensions are required');
 const sw=number(stage.width,'stage.width'),sh=number(stage.height,'stage.height'),pw=number(popup.width,'popup.width'),ph=number(popup.height,'popup.height');
 number(padding,'padding');number(gap,'gap');
 if(!SIDES.includes(preferredSide))throw new RangeError('preferredSide must be right, left, below or above');
 if(!Array.isArray(avoidRects))throw new TypeError('avoidRects must be an array');const controls=avoidRects.map(avoidRect);
 if(!sw||!sh)return hidden('stage-unmeasured');
 if(sw<=2*padding||sh<=2*padding)return hidden('stage-too-small');
 if(!anchor||anchor.visible===false)return hidden('anchor-unavailable');
 const ax=point(anchor.x,'anchor.x'),ay=point(anchor.y,'anchor.y'),aw=number(anchor.width??0,'anchor.width'),ah=number(anchor.height??0,'anchor.height');
 const target=rect(ax-aw/2,ay-ah/2,aw,ah);
 if(target.right<0||target.left>sw||target.bottom<0||target.top>sh)return hidden('anchor-offstage');
 if(!pw||!ph)return hidden('popup-unmeasured');
 const inner={left:padding,top:padding,right:sw-padding,bottom:sh-padding},width=Math.min(pw,sw-2*padding),height=Math.min(ph,sh-2*padding);
 const order=[preferredSide,...SIDES.filter(side=>side!==preferredSide)],placements=[];
 for(const side of order){
  const raw=side==='right'?{x:target.right+gap,y:ay-height/2}:side==='left'?{x:target.left-gap-width,y:ay-height/2}:side==='below'?{x:ax-width/2,y:target.bottom+gap}:{x:ax-width/2,y:target.top-gap-height};
  const x=clamp(raw.x,inner.left,inner.right-width),y=clamp(raw.y,inner.top,inner.bottom-height),box=rect(x,y,width,height),distance=Math.hypot(x-raw.x,y-raw.y);
  const pointCovered=ax>x&&ax<x+width&&ay>y&&ay<y+height,anchorArea=intersection(box,target),overlapsAnchor=overlap(box,target)||pointCovered;
  const controlArea=controls.reduce((sum,r)=>sum+intersection(box,r),0),overlapsControls=controls.some(r=>overlap(box,r));
  const candidate={x,y,width,height,side,clamped:distance>1e-7,overlapsAnchor,overlapsControls,score:controlArea*4+anchorArea+(pointCovered&&anchorArea===0?width*height*.15:0)+distance*2+order.indexOf(side)*4};
  if(!candidate.clamped&&!overlapsAnchor&&!overlapsControls){placements.push(candidate);break;}
  placements.push(candidate);
 }
 // Prefer a fully fitting candidate before a constrained fallback, while
 // retaining deterministic side preference when equally clear alternatives fit.
 const exact=placements.find(p=>!p.clamped&&!p.overlapsAnchor&&!p.overlapsControls),chosen=exact??placements.reduce((a,b)=>b.score<a.score?b:a);
 const {score,...placed}=chosen;
 return{visible:true,reason:placed.clamped||placed.overlapsAnchor||placed.overlapsControls?'constrained':'placed',...placed,anchorX:ax,anchorY:ay,scrollable:{x:pw>width,y:ph>height}};
}
/** Same-frame inspector support in the centered coordinates used by visibility policy. */
export function popupBlocker(placement,stage){
 if(!placement?.visible)return null;
 if(!stage||!Number.isFinite(stage.width)||!Number.isFinite(stage.height)||stage.width<=0||stage.height<=0)throw new RangeError('A positive measured stage is required');
 if(!['x','y','width','height'].every(k=>Number.isFinite(placement[k]))||placement.width<=0||placement.height<=0)throw new TypeError('A visible popup needs finite positive dimensions');
 return{shape:'rect',x:placement.x+placement.width/2-stage.width/2,y:placement.y+placement.height/2-stage.height/2,width:placement.width,height:placement.height,front:true,order:1000000,opacityPolicy:'opaque anchored room-inspector popup'};
}
