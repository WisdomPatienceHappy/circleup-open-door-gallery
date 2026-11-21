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

/** Place only the joined topic below complete projected painted/name support.
 * Image positioning, DOM identity, culling and policy ownership stay caller-owned.
 */
export function placeJoinedCenterText({anchor,footprint,naturalSize,cssScale=1,gap=8}={}) {
 const coordinate=(value,name)=>{
  if(!Number.isFinite(value))throw new TypeError(`${name} must be finite`);
  return value;
 };
 if(!anchor||!footprint||!naturalSize)throw new TypeError('anchor, footprint and naturalSize are required');
 const x=coordinate(anchor.x,'anchor.x'),anchorY=coordinate(anchor.y,'anchor.y'),depth=coordinate(anchor.depth,'anchor.depth');
 const support={left:coordinate(footprint.left,'footprint.left'),right:coordinate(footprint.right,'footprint.right'),top:coordinate(footprint.top,'footprint.top'),bottom:coordinate(footprint.bottom,'footprint.bottom')};
 if(support.right<support.left||support.bottom<support.top)throw new RangeError('footprint edges must not be reversed');
 positive(cssScale,'cssScale');
 coordinate(gap,'gap');if(gap<0)throw new RangeError('gap must be nonnegative');
 const width=positive(positive(naturalSize.width,'naturalSize.width')*cssScale,'scaled text width');
 const height=positive(positive(naturalSize.height,'naturalSize.height')*cssScale,'scaled text height');
 const top=coordinate(support.bottom+gap,'text.top'),bottom=coordinate(top+height,'text.bottom');
 const y=coordinate(top+height/2,'text.y'),left=coordinate(x-width/2,'text.left'),right=coordinate(x+width/2,'text.right');
 return {x,y,width,height,left,right,top,bottom,depth,cssScale,offset:{x:0,y:coordinate(y-anchorY,'text.offset.y')}};
}
