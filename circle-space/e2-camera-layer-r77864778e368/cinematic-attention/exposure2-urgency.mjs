import {createExposureUrgency} from './exposure-urgency.mjs';

const unit=(x,name)=>{if(!Number.isFinite(x)||x<0||x>1)throw RangeError(`${name} must be in [0,1]`);return x;};
const clamp=x=>Math.max(0,Math.min(1,x));

/** CSS PHOTO size and hidden fraction stay separate; watercolor halos are not faces. */
export function measureReadabilityNeeds({members,bounds,preferredPixels,fractionTarget=.95}){
 if(!Array.isArray(members)||!bounds||![bounds.left,bounds.right].every(Number.isFinite)||bounds.right<=bounds.left||!Number.isFinite(preferredPixels)||preferredPixels<=0)throw TypeError('Actual members, horizontal CSS bounds and positive preferred pixels required');
 unit(fractionTarget,'fractionTarget');if(!fractionTarget)throw RangeError('Positive fraction target required');
 let sizeDeficit=0,obstructionDeficit=0,total=0;const perId=[];
 for(const m of members){
  const weight=unit(m.weight,'duration weight');total+=weight;
  let diameter=null,fraction=0,sideDeficit=1;
  if(m.projected!==false){diameter=m.projectedDiameterPx??m.diameter;fraction=m.photoFractionLower??m.fraction;
   if(!Number.isFinite(diameter)||diameter<=0||!Number.isFinite(m.x)||!Number.isFinite(fraction)||fraction<0||fraction>1+1e-8)throw TypeError('Finite actual photo diameter, x and visible fraction required');
   fraction=clamp(fraction);const r=diameter/2;sideDeficit=clamp((Math.max(0,bounds.left-(m.x-r))+Math.max(0,m.x+r-bounds.right))/diameter);
  }
  const size=diameter===null?1:clamp(1-diameter/preferredPixels),hidden=clamp(1-fraction/fractionTarget),obstruction=Math.max(hidden,sideDeficit);
  sizeDeficit+=weight*size;obstructionDeficit+=weight*obstruction;
  perId.push({id:m.id,weight,projected:m.projected!==false,diameterPx:diameter,visibleFraction:fraction,visibleAreaLowerPx2:m.areaLower??null,visibleEquivalentDiameterPx:m.visibleEquivalentDiameterLowerPx??null,sizeDeficit:size,hiddenFractionDeficit:hidden,sideDeficit,obstructionDeficit:obstruction});
 }
 if(members.length&&Math.abs(total-1)>1e-6&&total!==0)throw RangeError('Duration weights must sum to one');
 return{sizeDeficit,obstructionDeficit,severity:.5*sizeDeficit+.5*obstructionDeficit,preferredPixels,fractionTarget,perId};
}

/** Same E reachable opportunity, smoothing and limits; additional absolute CSS need. */
export function createExposure2Urgency(options={}){
 const base=createExposureUrgency(options);let readability=null,originalNeed=null;
 const snapshot=()=>({...base.snapshot(),model:'css-size-and-obstruction-v2',originalNeed,readability:readability&&structuredClone(readability)});
 function update({members=[],bounds,preferredPixels,fractionTarget=.95,...input}={}){
  unit(input.need,'need');
  const measured=members.length?measureReadabilityNeeds({members,bounds,preferredPixels,fractionTarget}):{sizeDeficit:0,obstructionDeficit:0,severity:0,perId:[]};
  // Do not recompute opportunity from this new need: that would cancel the signal.
  const boostFactor=1+2*measured.severity,effectiveNeed=Math.min(1,input.need*boostFactor);
  base.update({...input,need:effectiveNeed});readability={...measured,boostFactor,maximumUsefulGainMultiplier:3};originalNeed=input.need;return snapshot();
 }
 function reset(){base.reset();readability=null;originalNeed=null;return snapshot();}
 return Object.freeze({update,snapshot,reset,configuration:base.configuration});
}
