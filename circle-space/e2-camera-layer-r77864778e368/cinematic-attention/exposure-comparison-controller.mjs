import {createExposureOrbitController} from './exposure-orbit-controller.mjs';
import {createSteadyActivity as createRollingActivity} from './rolling-duration.mjs';

/** New experiment adapter only: original E bytes and exponential control stay exact. */
export function createExposureComparisonController(options={}){
 const policy=options.config?.memoryPolicy??'exponential';
 if(policy==='exponential')return createExposureOrbitController(options);
 if(policy!=='rolling')throw RangeError('Known comparison memory policy required');
 const fresh=()=>createRollingActivity({ids:options.getRoster().map(x=>x&&typeof x==='object'?x.id:x),memoryMs:options.config?.memoryMs??8000});
 let base=createExposureOrbitController({...options,activityHelper:options.activityHelper??fresh()});
 const methods=Object.fromEntries(Object.keys(base).map(key=>[key,(...args)=>base[key](...args)]));
 methods.reset=()=>{base=createExposureOrbitController({...options,activityHelper:fresh(),attentionState:null,initialNow:null,initialOwnerId:null});};
 methods.snapshot=()=>{const s=base.snapshot();return{...s,configuration:{...s.configuration,memoryPolicy:'rolling'},comparisonAdapter:'original-E-with-reset-safe-rolling-memory'};};
 return Object.freeze(methods);
}
