/** Neighbors stay below their circles; joined text may supply an explicit vertical center. No packing or camera writes. */
const finite=(value,name)=>{if(!Number.isFinite(value))throw new TypeError(`${name} must be finite`);return value;};
function rectangle(value,name,allowZero=false){
 if(!value||typeof value!=='object')throw new TypeError(`${name} rectangle required`);
 const result={left:finite(value.left,`${name}.left`),right:finite(value.right,`${name}.right`),top:finite(value.top,`${name}.top`),bottom:finite(value.bottom,`${name}.bottom`)};
 if(allowZero?result.right<result.left||result.bottom<result.top:result.right<=result.left||result.bottom<=result.top)throw new RangeError(`${name} rectangle has invalid extents`);
 return result;
}
function viewport(value){
 if(!value||typeof value!=='object')throw new TypeError('Bounds required');
 if(['left','right','top','bottom'].every(k=>Number.isFinite(value[k])))return rectangle(value,'bounds');
 const width=finite(value.width,'width'),height=finite(value.height,'height');
 if(width<=0||height<=0)throw new RangeError('Positive viewport dimensions required');
 return {left:-width/2,right:width/2,top:-height/2,bottom:height/2};
}
const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const labelRect=label=>({left:label.x-label.width/2,right:label.x+label.width/2,top:label.y-label.height/2,bottom:label.y+label.height/2});
export function placeAnchoredRoomLabels(records,bounds){
 if(!Array.isArray(records))throw new TypeError('records must be an array');
 const b=viewport(bounds),fontSize=b.right-b.left<=699?14:18,seen=new Set();
 const labels=records.map(record=>{
  if(!record||typeof record!=='object'||typeof record.id!=='string'||!record.id.trim())throw new TypeError('Each label needs a nonempty string id');
  if(seen.has(record.id))throw new RangeError('Label ids must be unique');seen.add(record.id);
  if(typeof record.title!=='string'||!record.title.trim())throw new TypeError('Each label needs a nonempty title');
  if(record.topic!==undefined&&typeof record.topic!=='string')throw new TypeError('topic must be text');
  if(record.visible!==undefined&&typeof record.visible!=='boolean')throw new TypeError('visible must be boolean');
  if(record.depth!==undefined)finite(record.depth,'depth');
  const x=finite(record.x,'x'),anchorY=finite(record.y,'y'),footprint=rectangle(record.footprint,'footprint',true),width=150,height=70,y=record.centerY===undefined?footprint.bottom+8+height/2:finite(record.centerY,'centerY');
  finite(y,'label.y');
  const label={id:record.id,x,y,width,height,fontSize,anchorX:x,anchorY,offset:{x:0,y:record.centerY===undefined?0:y-anchorY},visible:false,overlap:false,unplacedReason:null,...(record.depth===undefined?{}:{depth:record.depth})};
  const roomVisible=record.visible!==false&&intersects(footprint,b),labelVisible=intersects(labelRect(label),b);
  label.visible=roomVisible&&labelVisible;
  if(!roomVisible)label.unplacedReason='room-outside-viewport';else if(!labelVisible)label.unplacedReason='label-outside-viewport';
  return label;
 });
 // Report overlap honestly. It never participates in placement or visibility.
 for(let i=0;i<labels.length;i++)if(labels[i].visible)for(let j=i+1;j<labels.length;j++)if(labels[j].visible&&intersects(labelRect(labels[i]),labelRect(labels[j]))){labels[i].overlap=true;labels[j].overlap=true;}
 return labels;
}
