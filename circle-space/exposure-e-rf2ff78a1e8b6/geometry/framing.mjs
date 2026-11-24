/** Host landing/reset framing only. No speaker policy, state, DOM or camera writes. */
const finite = (value, name) => {
 if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
 return value;
};
const positive = (value, name) => {
 finite(value, name);if(value<=0)throw new RangeError(`${name} must be positive`);return value;
};
function rect(value,name){
 if(!value||typeof value!=='object')throw new TypeError(`${name} rectangle required`);
 const out={left:finite(value.left,`${name}.left`),right:finite(value.right,`${name}.right`),top:finite(value.top,`${name}.top`),bottom:finite(value.bottom,`${name}.bottom`)};
 if(out.right<out.left||out.bottom<out.top)throw new RangeError(`${name} rectangle has reversed edges`);
 return out;
}
function usableBounds(value){
 if(!value||typeof value!=='object')throw new TypeError('Bounds required');
 const b=['left','right','top','bottom'].every(k=>Number.isFinite(value[k]))?rect(value,'bounds'):(()=>{const width=positive(value.width,'bounds.width'),height=positive(value.height,'bounds.height');return {left:-width/2,right:width/2,top:-height/2,bottom:height/2};})();
 if(b.right<=b.left||b.bottom<=b.top)throw new RangeError('Bounds must have positive width and height');return b;
}
function unionOf(value){
 if(value?.visible===false)return {projectable:false,raw:null};
 const list=Array.isArray(value)?value:Array.isArray(value?.rects)?value.rects:value&&typeof value==='object'&&'left'in value?[value]:null;
 if(!list)throw new TypeError('projectAtZoom must return rectangle array, rectangle, or {rects}');
 if(list.some(r=>r?.visible===false))return {projectable:false,raw:null};
 const rectangles=list.map((r,i)=>rect(r,`projected[${i}]`));
 if(!rectangles.length)return {projectable:true,raw:null};
 return {projectable:true,raw:{left:Math.min(...rectangles.map(r=>r.left)),right:Math.max(...rectangles.map(r=>r.right)),top:Math.min(...rectangles.map(r=>r.top)),bottom:Math.max(...rectangles.map(r=>r.bottom))}};
}
const translated=(raw,offset)=>({left:raw.left+offset.x,right:raw.right+offset.x,top:raw.top+offset.y,bottom:raw.bottom+offset.y});
function nearestZero(min,max){
 if(min>max)return (min+max)/2;
 if(min<=0&&max>=0)return 0;
 const nearest=min>0?min:max;
 // A tiny inward arithmetic margin prevents adding the boundary translation
 // from landing a rounding unit outside. Never permits an overflowing result.
 const margin=Math.min((max-min)/2,1e-12*Math.max(1,Math.abs(min),Math.abs(max)));
 return min>0?nearest+margin:nearest-margin;
}
function evaluate(raw,bounds,allowOffset){
 if(!raw)return {fits:true,offset:{x:0,y:0},envelope:null,rawEnvelope:null,overflow:{left:0,right:0,top:0,bottom:0},overflowPx:0};
 const offset=allowOffset?{x:nearestZero(bounds.left-raw.left,bounds.right-raw.right),y:nearestZero(bounds.top-raw.top,bounds.bottom-raw.bottom)}:{x:0,y:0};
 const envelope=translated(raw,offset),overflow={left:Math.max(0,bounds.left-envelope.left),right:Math.max(0,envelope.right-bounds.right),top:Math.max(0,bounds.top-envelope.top),bottom:Math.max(0,envelope.bottom-bounds.bottom)},overflowPx=overflow.left+overflow.right+overflow.top+overflow.bottom;
 return {fits:overflowPx===0,offset,envelope,rawEnvelope:raw,overflow,overflowPx};
}
export function fitProjectedEnvelope(projectAtZoom,bounds,{
 preferredZoom=1,minZoom=.08,maxZoom=3,allowOffset=false,maxIterations=28
}={}){
 if(typeof projectAtZoom!=='function')throw new TypeError('projectAtZoom callback required');
 positive(preferredZoom,'preferredZoom');positive(minZoom,'minZoom');positive(maxZoom,'maxZoom');
 if(minZoom>maxZoom||preferredZoom<minZoom||preferredZoom>maxZoom)throw new RangeError('Require minZoom <= preferredZoom <= maxZoom');
 if(typeof allowOffset!=='boolean')throw new TypeError('allowOffset must be boolean');
 if(!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>64)throw new RangeError('maxIterations must be an integer in1..64');
 const b=usableBounds(bounds);let evaluations=0;
 function at(zoom){
  evaluations++;const sample=unionOf(projectAtZoom(zoom));
  if(!sample.projectable)return {zoom,fits:false,projectable:false,offset:{x:0,y:0},envelope:null,rawEnvelope:null,overflow:null,overflowPx:null};
  return {zoom,projectable:true,...evaluate(sample.raw,b,allowOffset)};
 }
 function result(sample,reason,iterations=0){return {...sample,reason,preferredZoom,minZoom,maxZoom,bounds:{...b},evaluations,iterations};}
 const preferred=at(preferredZoom);
 if(preferred.fits)return result(preferred,preferred.rawEnvelope?'preferred-fits':'empty-envelope');
 if(preferredZoom===minZoom)return result(preferred,preferred.projectable?'minimum-does-not-fit':'minimum-unprojectable');
 let safe=at(minZoom);
 if(!safe.fits)return result(safe,safe.projectable?'minimum-does-not-fit':'minimum-unprojectable');
 let high=preferredZoom,iterations=0;
 // Safe is a witnessed fitting projection, never an assumed hardcoded floor.
 // Even for a nonmonotone callback this cannot return an untested unsafe zoom;
 // monotone perspective envelopes are required for a largest-fit interpretation.
 for(;iterations<maxIterations;iterations++){
  const middle=safe.zoom+(high-safe.zoom)/2;if(middle===safe.zoom||middle===high)break;
  const candidate=at(middle);if(candidate.fits)safe=candidate;else high=middle;
 }
 return result(safe,'fitted-below-preferred',iterations);
}
