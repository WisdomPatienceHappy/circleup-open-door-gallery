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
