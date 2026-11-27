/**
 * Place an already-measured prompt above actual caller-owned circle support.
 * CSS-pixel inputs share one coordinate space. No wrapping, camera or world
 * inference occurs here. Measured layout metadata is preserved in a shallow copy.
 */
export function placePromptAboveCircle({
 anchor, footprint, bounds, layouts, preferredScale, minScale, gapPx=12, insetPx=8,
}={}){
 const finite=(v,n)=>{if(typeof v!=='number'||!Number.isFinite(v))throw TypeError(`${n} must be finite`);return v;};
 const positive=(v,n)=>{finite(v,n);if(v<=0)throw RangeError(`${n} must be positive`);return v;};
 const readRect=(r,n)=>{const c={};for(const k of['left','right','top','bottom'])c[k]=finite(r?.[k],`${n}.${k}`);if(c.right<=c.left||c.bottom<=c.top)throw RangeError(`${n} must have positive area`);return c;};
 const semanticAnchor={x:finite(anchor?.x,'anchor.x'),y:finite(anchor?.y,'anchor.y')};
 const support=readRect(footprint,'footprint'),viewport=readRect(bounds,'bounds');
 positive(preferredScale,'preferredScale');positive(minScale,'minScale');if(minScale>preferredScale)throw RangeError('minScale exceeds preferredScale');
 finite(gapPx,'gapPx');finite(insetPx,'insetPx');if(gapPx<0||insetPx<0)throw RangeError('gapPx and insetPx must be nonnegative');
 if(!Array.isArray(layouts)||!layouts.length)throw TypeError('Nonempty measured layouts required');
 const measured=layouts.map((layout,index)=>{
  if(!layout||typeof layout!=='object')throw TypeError(`layouts[${index}] must be an object`);
  const copy={...layout};positive(copy.width,`layouts[${index}].width`);positive(copy.height,`layouts[${index}].height`);positive(copy.cssWidth,`layouts[${index}].cssWidth`);
  return{layout:copy,index};
 });
 const usable={left:viewport.left+insetPx,right:viewport.right-insetPx,top:viewport.top+insetPx,bottom:viewport.bottom-insetPx};
 const bottom=support.top-gapPx,availableWidth=usable.right-usable.left,availableHeight=bottom-usable.top;
 if(![...Object.values(usable),bottom,availableWidth,availableHeight].every(Number.isFinite))throw RangeError('Caption geometry overflows');
 function candidate(entry,scale){
  const width=entry.layout.width*scale,height=entry.layout.height*scale;
  const canClamp=availableWidth>0&&width<=availableWidth;
  const x=canClamp?Math.max(usable.left+width/2,Math.min(usable.right-width/2,semanticAnchor.x)):semanticAnchor.x;
  const y=bottom-height/2,left=x-width/2,right=x+width/2,top=bottom-height;
  const overflowPx={left:Math.max(0,usable.left-left),right:Math.max(0,right-usable.right),top:Math.max(0,usable.top-top),bottom:Math.max(0,bottom-usable.bottom)};
  overflowPx.total=overflowPx.left+overflowPx.right+overflowPx.top+overflowPx.bottom;overflowPx.max=Math.max(overflowPx.left,overflowPx.right,overflowPx.top,overflowPx.bottom);
  const offset={x:x-semanticAnchor.x,y:y-semanticAnchor.y};
  if(![width,height,x,y,left,right,top,bottom,...Object.values(overflowPx),...Object.values(offset)].every(Number.isFinite)||width<=0||height<=0)throw RangeError('Scaled caption geometry overflows');
  return{layout:entry.layout,layoutIndex:entry.index,x,y,width,height,left,right,top,bottom,cssScale:scale,scale,offset,placement:'above-circle',fits:overflowPx.total===0,infeasible:overflowPx.total!==0,overflowPx,clampedX:x!==semanticAnchor.x,semanticAnchor:{...semanticAnchor}};
 }
 // Validate all scales and layouts before selecting any result.
 for(const entry of measured){candidate(entry,minScale);candidate(entry,preferredScale);}
 const fitting=[];
 for(const entry of measured){
  let scale=Math.min(preferredScale,availableWidth/entry.layout.width,availableHeight/entry.layout.height);
  if(scale<minScale)continue;
  let c=candidate(entry,scale);
  // Only retreat for arithmetic rounding; never waive an overflow as a fit.
  if(!c.fits&&scale>minScale){scale=Math.max(minScale,scale*(1-4*Number.EPSILON));c=candidate(entry,scale);}
  if(c.fits)fitting.push(c);
 }
 const best=fitting.sort((a,b)=>b.scale-a.scale||b.layout.width-a.layout.width||a.layoutIndex-b.layoutIndex)[0];
 if(best)return{...best,reason:best.scale===preferredScale?'preferred-fits':'scaled-above-circle'};
 const floor=measured.map(entry=>candidate(entry,minScale)).sort((a,b)=>a.overflowPx.total-b.overflowPx.total||b.layout.width-a.layout.width||a.layoutIndex-b.layoutIndex)[0];
 return{...floor,reason:'minimum-infeasible'};
}
