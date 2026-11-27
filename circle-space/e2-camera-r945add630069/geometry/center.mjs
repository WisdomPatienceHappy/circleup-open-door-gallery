/** Perspective-faithful center sizing. Renderer owns content, DOM bounds and culling. */
const positive = (value, name) => {
 if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
 return value;
};
export function centerSizing({
 mode = 'world', projectedScale, faceWorldDiameter, sizeRatio = 1,
 referencePixels = 130, screenPixels = 130, maxTextLines
} = {}) {
 if (mode !== 'world' && mode !== 'screen') throw new RangeError('Choose world or screen center sizing');
 positive(projectedScale, 'projectedScale');
 positive(faceWorldDiameter, 'faceWorldDiameter');
 positive(sizeRatio, 'sizeRatio');
 positive(referencePixels, 'referencePixels');
 positive(screenPixels, 'screenPixels');
 if (maxTextLines !== undefined && (!Number.isInteger(maxTextLines) || maxTextLines < 1)) throw new RangeError('maxTextLines must be a positive integer');
 const worldDiameter = mode === 'world'
  ? positive(faceWorldDiameter * sizeRatio, 'world diameter')
  : positive(screenPixels * sizeRatio / projectedScale, 'equivalent world diameter');
 const target = positive(mode === 'world' ? worldDiameter * projectedScale : screenPixels * sizeRatio, 'projected center diameter');
 const cssScale = positive(target / referencePixels, 'cssScale');
 return {
  width: target,
  height: target,
  cssScale,
  worldDiameter,
  opacityPolicy: 'conservative opaque square for scaled text/image backing; caller measures actual scaled DOM support'
 };
}

/** Place joined text at a signed circle-relative offset, or legacy below-support position.
 * Image positioning, DOM identity, culling and policy ownership stay caller-owned.
 */
export function placeJoinedCenterText({anchor,footprint,naturalSize,cssScale=1,gap=8,verticalOffset}={}) {
 const coordinate=(value,name)=>{
  if(!Number.isFinite(value))throw new TypeError(`${name} must be finite`);
  return value;
 };
 if(!anchor||!naturalSize||verticalOffset===undefined&&!footprint)throw new TypeError('anchor, naturalSize and a verticalOffset or footprint are required');
 const x=coordinate(anchor.x,'anchor.x'),anchorY=coordinate(anchor.y,'anchor.y'),depth=coordinate(anchor.depth,'anchor.depth');
 const support=verticalOffset===undefined?{left:coordinate(footprint.left,'footprint.left'),right:coordinate(footprint.right,'footprint.right'),top:coordinate(footprint.top,'footprint.top'),bottom:coordinate(footprint.bottom,'footprint.bottom')}:null;
 if(support&&(support.right<support.left||support.bottom<support.top))throw new RangeError('footprint edges must not be reversed');
 positive(cssScale,'cssScale');
 coordinate(gap,'gap');if(gap<0)throw new RangeError('gap must be nonnegative');
 const width=positive(positive(naturalSize.width,'naturalSize.width')*cssScale,'scaled text width');
 const height=positive(positive(naturalSize.height,'naturalSize.height')*cssScale,'scaled text height');
 const top=coordinate(verticalOffset===undefined?support.bottom+gap:anchorY+coordinate(verticalOffset,'verticalOffset')-height/2,'text.top'),bottom=coordinate(top+height,'text.bottom');
 const y=coordinate(top+height/2,'text.y'),left=coordinate(x-width/2,'text.left'),right=coordinate(x+width/2,'text.right');
 return {x,y,width,height,left,right,top,bottom,depth,cssScale,offset:{x:0,y:coordinate(y-anchorY,'text.offset.y')}};
}

/** Seat-only screen caption; no camera or world-position changes. */
export function placeSeatCaption({bounds,naturalSize,verticalPosition=0,editing=false}={}){
 if(!bounds||!naturalSize)throw new TypeError('bounds and naturalSize required');
 const {left,right,top,bottom}=bounds;
 if(![left,right,top,bottom,verticalPosition].every(Number.isFinite)||right<=left||bottom<=top)throw new RangeError('Finite usable caption bounds required');
 if(verticalPosition< -1.5||verticalPosition>1.5)throw new RangeError('Caption position must be in -1.5..1.5');
 const w=positive(naturalSize.width,'caption width'),h=positive(naturalSize.height,'caption height'),availableWidth=Math.max(1,right-left-8),availableHeight=Math.max(1,bottom-top-8);
 const captionHeight=Math.min(availableHeight*.32,bottom>16?bottom-12:availableHeight*.32),cssScale=editing?1:Math.min(1,availableWidth/w,captionHeight/h),width=w*cssScale,height=h*cssScale;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),x=clamp(0,left+width/2+4,Math.max(left+width/2+4,right-width/2-4)),y=clamp(bottom-height/2-8+verticalPosition*availableHeight/3,top+height/2+4,Math.max(top+height/2+4,bottom-height/2-4));
 return{x,y,width,height,left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2,cssScale,front:true,caption:true};
}
