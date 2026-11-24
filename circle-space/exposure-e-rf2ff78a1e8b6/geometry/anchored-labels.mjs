/** Fixed above-room labels. Collision changes detail/visibility, never the anchor. */
const finite=(n,name)=>{if(!Number.isFinite(n))throw TypeError(name+' must be finite');return n;};
function rectangle(r,name,zero=false){if(!r)throw TypeError(name+' rectangle required');const out=Object.fromEntries(['left','right','top','bottom'].map(k=>[k,finite(r[k],name+'.'+k)]));if(zero?out.right<out.left||out.bottom<out.top:out.right<=out.left||out.bottom<=out.top)throw RangeError(name+' invalid extents');return out;}
const intersects=(a,b,gap=0)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
const rect=l=>({left:l.x-l.width/2,right:l.x+l.width/2,top:l.y-l.height/2,bottom:l.y+l.height/2});
export function placeAnchoredRoomLabels(records,bounds,{mobile=false,avoid=[],forFit=false}={}){
 if(!Array.isArray(records)||!Array.isArray(avoid))throw TypeError('Records and avoid rectangles required');
 const b=Number.isFinite(bounds?.width)?rectangle({left:-bounds.width/2,right:bounds.width/2,top:-bounds.height/2,bottom:bounds.height/2},'bounds'):rectangle(bounds,'bounds'),seen=new Set();
 const labels=records.map(r=>{if(typeof r?.id!=='string'||!r.id.trim()||seen.has(r.id))throw TypeError('Unique room id required');seen.add(r.id);if(typeof r.title!=='string'||!r.title.trim())throw TypeError('Room title required');if(r.visible!==undefined&&typeof r.visible!=='boolean')throw TypeError('Visibility must be boolean');if(r.topic!==undefined&&typeof r.topic!=='string')throw TypeError('Topic must be text');const footprint=rectangle(r.footprint,'footprint',true),height=mobile?44:60,x=finite(r.x,'x'),anchorY=finite(r.y,'y'),y=r.centerY===undefined?footprint.top-finite(r.labelGap??8,'labelGap')-height/2:finite(r.centerY,'centerY');return{id:r.id,x,y,width:mobile?140:150,height,fontSize:mobile?14:18,anchorX:x,anchorY,offset:{x:0,y:y-anchorY},tier:'detail',visible:false,overlap:false,unplacedReason:null,footprint,...(r.depth===undefined?{}:{depth:finite(r.depth,'depth')}),joined:Boolean(r.joined),sourceVisible:r.visible!==false};});
 const obstacles=avoid.map(r=>r.shape==='disc'?{shape:'disc',x:finite(r.x,'disc.x'),y:finite(r.y,'disc.y'),radius:Math.max(0,finite(r.radius,'disc.radius'))}:rectangle(r,'avoid',true)),accepted=[];const hits=(r,o)=>o.shape==='disc'?Math.hypot(o.x-Math.max(r.left,Math.min(r.right,o.x)),o.y-Math.max(r.top,Math.min(r.bottom,o.y)))<o.radius+4:intersects(r,o,4);
 for(const label of [...labels].sort((a,b)=>Number(b.joined)-Number(a.joined)||a.id.localeCompare(b.id))){
  if(!label.sourceVisible){label.unplacedReason='room-hidden';continue;}if(forFit){label.visible=true;continue;}
  if(!intersects(label.footprint,b)){label.unplacedReason='room-outside-viewport';continue;}
  const tiers=mobile?[[140,'detail'],[112,'title'],[88,'title']]:[[150,'detail'],[112,'title']];
  for(const[width,tier]of tiers){label.width=width;label.tier=tier;const r=rect(label);if(r.left<b.left||r.right>b.right||r.top<b.top||r.bottom>b.bottom){label.unplacedReason='label-outside-viewport';continue;}if(obstacles.some(o=>hits(r,o))||accepted.some(o=>intersects(r,o,6))){label.unplacedReason='label-collision';continue;}label.visible=true;label.unplacedReason=null;accepted.push(r);break;}
 }
 return labels;
}
