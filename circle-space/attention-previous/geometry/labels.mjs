/** Screen-space room-label placement only. Never mutates world points or camera. */
const finite = (value, name) => {
 if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
 return value;
};
function rectangle(value, name, allowZero = false) {
 if (!value || typeof value !== 'object') throw new TypeError(`${name} rectangle required`);
 let left, right, top, bottom;
 if (['left','right','top','bottom'].every(k => Number.isFinite(value[k]))) {
  ({left,right,top,bottom} = value);
 } else {
  const x = finite(value.x, `${name}.x`), y = finite(value.y, `${name}.y`);
  const width = finite(value.width, `${name}.width`), height = finite(value.height, `${name}.height`);
  left=x-width/2;right=x+width/2;top=y-height/2;bottom=y+height/2;
 }
 if (allowZero ? right < left || bottom < top : right <= left || bottom <= top) throw new RangeError(`${name} must have nonnegative/positive extents`);
 return {left,right,top,bottom};
}
function boundsValue(bounds) {
 if (!bounds || typeof bounds !== 'object') throw new TypeError('Bounds required');
 const explicit = ['left','right','top','bottom'].every(k => Number.isFinite(bounds[k]));
 const rect = explicit ? rectangle(bounds,'bounds') : rectangle({x:0,y:0,width:bounds.width,height:bounds.height},'bounds');
 const padding=finite(bounds.padding??12,'padding');if(padding<0)throw new RangeError('padding must be nonnegative');
 if (bounds.avoidRects !== undefined && !Array.isArray(bounds.avoidRects)) throw new TypeError('avoidRects must be an array');
 const avoidRects=(bounds.avoidRects??[]).map((r,i)=>rectangle(r,`avoidRects[${i}]`));
 return {left:rect.left+padding,right:rect.right-padding,top:rect.top+padding,bottom:rect.bottom-padding,avoidRects};
}
function dimensions(record, availableWidth) {
 // Native text measurement belongs to the caller; these reserve a conservative
 // 2–3-line frame without letting camera zoom shrink the font.
 const fontSize=availableWidth<=600?14:record.title.length<=26?18:record.title.length<=44?16:14;
 const width=Math.min(150,Math.max(104,Math.ceil(Math.max(record.title.length,Math.min(record.topic.length,30))*fontSize*.53+18)));
 const charsPerLine=Math.max(1,Math.floor((width-18)/(fontSize*.53)));
 const neededLines=Math.ceil(record.title.length/charsPerLine)+(record.topic?Math.ceil(record.topic.length/charsPerLine):0);
 const lineCount=Math.max(2,Math.min(3,neededLines));
 // Reserve occupancy + title/topic + padding in the exact blocker frame.
 const height=70;
 return {width,height,fontSize,lineCount,truncated:neededLines>3};
}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const rectFor=(x,y,w,h)=>({left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2});
const intersects=(a,b,gap=8)=>a.left<b.right+gap-1e-6&&a.right>b.left-gap+1e-6&&a.top<b.bottom+gap-1e-6&&a.bottom>b.top-gap+1e-6;
function candidates(preferred,size,bounds) {
 const maxX=Math.min(160,Math.max(0,(bounds.right-bounds.left)*.48));
 const maxY=Math.min(180,Math.max(0,(bounds.bottom-bounds.top)*.42));
 const xs=[0,-40,40,-80,80,-120,120,-160,160],step=size.height+8;
 const ys=[0,step,-step,step*2,-step*2,Math.min(180,step*3),-Math.min(180,step*3)];
 const found=new Map();
 for(const dx of xs)for(const dy of ys){
  const x=clamp(preferred.x+dx,bounds.left+size.width/2,bounds.right-size.width/2);
  const y=clamp(preferred.y+dy,bounds.top+size.height/2,bounds.bottom-size.height/2);
  const ox=x-preferred.x,oy=y-preferred.y;
  if(Math.abs(ox)>maxX+1e-6||Math.abs(oy)>maxY+1e-6)continue;
  const score=Math.hypot(ox,oy)+Math.abs(ox)*.04+(oy<0?14:0);
  const key=`${x.toFixed(5)},${y.toFixed(5)}`;
  if(!found.has(key))found.set(key,{x,y,score,offset:{x:ox,y:oy}});
 }
 return [...found.values()].sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
}
export function placeRoomLabels(records,bounds) {
 if(!Array.isArray(records))throw new TypeError('records must be an array');
 const area=boundsValue(bounds),seen=new Set();
 const normalized=records.map((record,index)=>{
  if(!record||typeof record!=='object'||typeof record.id!=='string'||!record.id.trim())throw new TypeError('Each label needs a nonempty string id');
  if(seen.has(record.id))throw new RangeError('Label ids must be unique');seen.add(record.id);
  if(typeof record.title!=='string'||!record.title.trim())throw new TypeError('Each label needs a nonempty title');
  if(record.topic!==undefined&&typeof record.topic!=='string')throw new TypeError('topic must be text');
  return {id:record.id,index,x:finite(record.x,'label.x'),y:finite(record.y,'label.y'),footprint:rectangle(record.footprint,'footprint',true),title:record.title,topic:record.topic??'',priority:finite(record.priority??0,'priority')};
 });
 const ordered=[...normalized].sort((a,b)=>b.priority-a.priority||(a.id<b.id?-1:a.id>b.id?1:0));
 const definitions=ordered.map(record=>{
  const size=dimensions(record,area.right-area.left),preferred={x:record.x,y:record.footprint.bottom+8+size.height/2};
  const base={id:record.id,x:preferred.x,y:preferred.y,width:size.width,height:size.height,fontSize:size.fontSize,anchorX:record.x,anchorY:record.y,offset:{x:0,y:0},visible:false,overlap:false,unplacedReason:null,lineCount:size.lineCount,truncated:size.truncated};
  if(area.right-area.left<size.width||area.bottom-area.top<size.height)return {record,size,base:{...base,unplacedReason:'viewport-too-small'},options:[]};
  const options=candidates(preferred,size,area).map(candidate=>({...candidate,rect:rectFor(candidate.x,candidate.y,size.width,size.height)}));
  if(!options.length)return {record,size,base:{...base,unplacedReason:'outside-placement-range'},options:[]};
  const fallback=options[0];
  const valid=options.filter(candidate=>!area.avoidRects.some(control=>intersects(candidate.rect,control)));
  return {record,size,base,options:valid,preferred:fallback,collision:{...base,x:fallback.x,y:fallback.y,offset:fallback.offset,overlap:true,unplacedReason:'collision'}};
 });
 function placementCost(candidate,definition){
  const twoColumns=normalized.length>=5&&area.right-area.left>=2*definition.size.width+8;
  const sideSpace=Math.max(candidate.rect.left-area.left,area.right-candidate.rect.right);
  return candidate.score+(twoColumns&&sideSpace<definition.size.width+8?100:0);
 }
 function placedLabel(definition,match){return {...definition.base,x:match.x,y:match.y,offset:match.offset,visible:true};}
 const output=new Map(),placed=[];
 for(const definition of definitions){
  if(definition.base.unplacedReason){output.set(definition.record.id,definition.base);continue;}
  const valid=definition.options.filter(candidate=>!placed.some(p=>intersects(candidate.rect,p)));
  const match=valid.includes(definition.preferred)?definition.preferred:valid.sort((a,b)=>placementCost(a,definition)-placementCost(b,definition)||a.score-b.score||a.y-b.y||a.x-b.x)[0];
  if(match){placed.push(match.rect);output.set(definition.record.id,placedLabel(definition,match));}
  else output.set(definition.record.id,definition.collision);
 }
 // A small bounded fallback can shift an earlier screen label when its greedy
 // position blocks a later one beside real controls. It never moves world data.
 // Max12 states x8 choices x8 rooms, with prefiltered static blocker geometry.
 const greedyVisible=[...output.values()].filter(l=>l.visible).length;
 if(greedyVisible<normalized.length&&normalized.length<=8){
  let beam=[{rects:[],labels:[],unplaced:0,cost:0}];
  for(const definition of definitions){
   const next=[];
   for(const state of beam){
    if(definition.base.unplacedReason){next.push({...state,labels:[...state.labels,definition.base],unplaced:state.unplaced+1});continue;}
    const valid=definition.options.filter(candidate=>!state.rects.some(p=>intersects(candidate.rect,p))).sort((a,b)=>placementCost(a,definition)-placementCost(b,definition)||a.score-b.score||a.y-b.y||a.x-b.x);
    // Preserve high-priority room labels at their closest valid position.
    const choices=definition.record.priority>0?(valid.includes(definition.preferred)?[definition.preferred]:valid.slice(0,1)):valid.slice(0,8);
    if(!choices.length){next.push({...state,labels:[...state.labels,definition.collision],unplaced:state.unplaced+1});continue;}
    for(const choice of choices)next.push({rects:[...state.rects,choice.rect],labels:[...state.labels,placedLabel(definition,choice)],unplaced:state.unplaced,cost:state.cost+placementCost(choice,definition)});
   }
   beam=next.sort((a,b)=>a.unplaced-b.unplaced||a.cost-b.cost).slice(0,12);
  }
  const best=beam[0];
  if(best&&normalized.length-best.unplaced>greedyVisible)for(const label of best.labels)output.set(label.id,label);
 }

 return normalized.map(r=>output.get(r.id));
}
