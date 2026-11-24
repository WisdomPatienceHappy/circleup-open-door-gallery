/** Experimental B route amendment. Original final-goal solver is unchanged. */
import {createStableSpeakerPolicy as createGoalPolicy} from './stable-speaker-policy.mjs';
const copy=x=>JSON.parse(JSON.stringify(x)),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
export function createStableSpeakerPolicy(options={}){
 const goalPolicy=createGoalPolicy(options),minZoom=options.minZoom??.72,maxZoom=options.maxZoom??2.15;
 let cachedTravel=null;
 function plan(input){
  const result=goalPolicy.plan(input),revision=result.metrics.goalRevision;
  if(cachedTravel?.goalRevision!==revision){
   const onset={...input.current},goal={...result.frame},upper=Math.min(onset.zoom,goal.zoom,maxZoom),samples=17;
   let zoomProbeCount=0,assessmentCount=0,unavailableCount=0;
   function corridor(zoom){zoomProbeCount++;for(let i=0;i<samples;i++){
     const t=i/(samples-1),frame={yaw:wrap(onset.yaw+wrap(goal.yaw-onset.yaw)*t),pitch:onset.pitch+(goal.pitch-onset.pitch)*t,zoom};
     let a;try{assessmentCount++;a=goalPolicy.assess(frame,{focusId:input.focusId??null});}catch(e){if(e?.code!=='CAMERA_PROJECTION_UNAVAILABLE')throw e;unavailableCount++;return false;}
     if(!a.frameFits||!a.contentFits)return false;
     // Planning-only interior reserve on ACTUAL paint/content supports. This
     // does not change projected diameter, padding, occlusion, or live guards.
     const b=a.bounds,reserve=1;
     for(const p of a.portraits){const role=p.id===a.activeId||p.id===a.holderId||p.id===a.intendedId,r=p.diameter/2+Math.max(0,p.paintPadding??0);
      if((a.portraitFraming==='all'||role)&&(p.y-r<b.top+reserve||p.y+r>b.bottom-reserve))return false;
      if(role&&(p.x-r<b.left+reserve||p.x+r>b.right-reserve))return false;}
     for(const r of a.contentRects)if(r.x-r.width/2<b.left+reserve||r.x+r.width/2>b.right-reserve||r.y-r.height/2<b.top+reserve||r.y+r.height/2>b.bottom-reserve)return false;
    }return true;}
   let wideZoom=null;
   if(result.metrics.goalOwnerId!==null&&upper>=minZoom){
    if(corridor(upper))wideZoom=upper;
    else{let above=upper;for(let j=1;j<=16&&wideZoom===null;j++){
      const z=upper*Math.exp(Math.log(minZoom/upper)*j/16);
      if(corridor(z)){wideZoom=z;let low=z,high=above;for(let k=0;k<12;k++){const middle=(low+high)/2;if(corridor(middle)){wideZoom=middle;low=middle;}else high=middle;}}
      above=z;
    }}
   }
   const fits=wideZoom!==null;
   cachedTravel={goalRevision:revision,wideZoom,waypoints:fits?[{...onset,zoom:wideZoom},{...goal,zoom:wideZoom},{...goal}]:[],corridorFits:fits,onset,corridorSamples:samples,framingReservePx:1,zoomProbeCount,assessmentCount,unavailableCount,upperZoom:upper,visibilityCertified:false,reason:fits?'sampled-framing-corridor':result.metrics.goalOwnerId===null?'silent-no-owner':upper<minZoom?'corridor-under-minimum':'no-sampled-framing-corridor'};
  }
  result.metrics.stableTravel=copy(cachedTravel);
  if(!cachedTravel.corridorFits&&result.metrics.goalOwnerId!==null){result.metrics.constraintConflict=true;result.metrics.constraintReason=cachedTravel.reason;}
  return result;
 }
 return Object.freeze({observe:goalPolicy.observe,assess:goalPolicy.assess,plan,rebase(){goalPolicy.rebase();cachedTravel=null;},snapshot:()=>({...goalPolicy.snapshot(),stableTravel:cachedTravel?copy(cachedTravel):null})});
}
