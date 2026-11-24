/** Host presentation rules. They confer no cinematic zoom or speaker authority. */
export const defaultMapThreshold = mobile => mobile ? .35 : .68;
export function mapSeating(kind, joined, tuning) {
 return kind === 'map' || !joined ? {shape:'circle'} : tuning;
}
export function mapCutoffs(referenceZoom, threshold, mobile) {
 if(!Number.isFinite(referenceZoom)||referenceZoom<=0)throw RangeError('Positive Circle reference required');
 if(!Number.isFinite(threshold)||threshold<.1||threshold>.9)throw RangeError('Map threshold must be in .1...9');
 const exitRatio=mobile?Math.min(.99,threshold+.12):threshold*1.14;
 return {referenceZoom,enterRatio:threshold,exitRatio,enter:referenceZoom*threshold,exit:referenceZoom*exitRatio};
}
export function zoomModeDecision({kind,zoom,referenceZoom,threshold,mobile,pointerCount=0}) {
 if(!Number.isFinite(zoom)||zoom<=0)throw RangeError('Positive zoom required');
 const cut=mapCutoffs(referenceZoom,threshold,mobile);
 const next=kind==='circle'&&zoom<cut.enter?'map':kind==='map'&&zoom>cut.exit?'circle':kind;
 return {kind:pointerCount>0?kind:next,pending:pointerCount>0&&next!==kind,cutoffs:cut};
}
/** Input can cancel a pose animation, but must not inherit its stale distance. */
export function settleModeOrientation(camera,transition,kind) {
 if(!transition)return camera;
 if(kind==='map')return {...camera,pitch:Math.PI/2};
 if(kind==='circle'&&transition.zoomGate)return {...camera,yaw:transition.to.yaw,pitch:transition.to.pitch};
 return camera;
}
export function presentationDistance(from,to,progress) {
 return Object.is(from,to)?from:Math.exp(Math.log(from)+(Math.log(to)-Math.log(from))*progress);
}
