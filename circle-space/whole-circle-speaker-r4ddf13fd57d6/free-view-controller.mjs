import {createExposureOrbitController} from './cinematic-attention/exposure-orbit-controller.mjs';
import {createExposureOrbitPolicy} from './cinematic-attention/exposure-orbit-policy.mjs';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

/** Original E continuous behavior, with an optional explicitly separate endpoint-cut path. */
export function createFreeViewController(options) {
  const original=createExposureOrbitController(options);
  let lastCut=-Infinity,dominant=null,dominantSince=0,previousMode='continuous';
  const cuts=[];
  function resetCuts(){lastCut=-Infinity;dominant=null;dominantSince=0;cuts.length=0;}
  return Object.freeze({...original,
    reset(){resetCuts();original.reset();},
    step(now,dt,flags={}){
      const mode=options.getShotRule?.()??'continuous';
      if(mode==='continuous')return original.step(now,dt,flags);
      const plan=original.step(now,0,flags),focus=original.focusSnapshot();
      const leading=[...focus.weights].sort((a,b)=>b.weight-a.weight)[0]?.id??null;
      if(mode!==previousMode||leading!==dominant){dominant=leading;dominantSince=now;}previousMode=mode;
      const current=options.getFrame(),target=plan.target;
      const far=target&&(Math.abs(wrap(target.yaw-current.yaw))>=Math.PI/3||Math.abs(target.pitch-current.pitch)>=Math.PI/9);
      if(dt>0&&!plan.paused&&!flags.paused&&target&&far&&focus.rawActiveIds.length&&now-dominantSince>=240&&now-lastCut>=1500){
        const beforeBasis=JSON.stringify([options.getGeometryVersion?.(),options.getBounds(),options.getRoster(),current.zoom]);
        const projection=options.getProjection(),project=typeof projection==='function'?projection:projection.project.bind(projection);
        const preferredPixels=options.getPreferredPixels?.()??options.config?.preferredPixels??160;
        const policy=createExposureOrbitPolicy({ids:options.getRoster(),project,getBounds:options.getBounds,
          speakerYaw:options.getSpeakerYaw,getHolder:options.getHolder??(()=>null),getBlockers:options.getBlockers??(()=>[]),
          getContentRects:options.getContentRects??(()=>[]),measureVisibility:globalThis.AttentionConversationCamera.measureVisibility,
          pitchMin:options.config?.pitchMin??Math.PI/36,pitchMax:options.config?.pitchMax??Math.PI/4,preferredPixels});
        const weights=focus.weights.map(({id,weight})=>({id,weight})),owner=original.snapshot().activeId;
        const assess=f=>policy.assess(f,{reference:plan.metrics.reference,weights,activeIds:focus.rawActiveIds,actualSpeakerId:owner});
        const from=assess(current),to=assess({...target,zoom:current.zoom});
        const fresh=beforeBasis===JSON.stringify([options.getGeometryVersion?.(),options.getBounds(),options.getRoster(),options.getFrame().zoom]);
        if(fresh&&to.contentFits&&to.weightedUtility-from.weightedUtility>=.08){
          const frame={yaw:target.yaw,pitch:target.pitch,zoom:current.zoom};
          const proposal={kind:'cut',at:now,owner,focusIds:weights.filter(x=>x.weight>.05).map(x=>x.id),from:{...current},frame,
            gain:to.weightedUtility-from.weightedUtility,contentFits:to.contentFits,basis:beforeBasis};
          if((options.applyCutFrame??options.applyFrame)(frame,proposal)!==false){
            original.suspend('explicit-cut-rebase');original.resume();lastCut=now;cuts.push(proposal);if(cuts.length>128)cuts.shift();
            return {...plan,frame,target:frame,applied:true,reason:'automatic-exposure-cut',metrics:{...plan.metrics,actual:to,cut:proposal}};
          }
        }
      }
      return original.step(now,dt,flags);
    },
    cutSnapshot:()=>({rule:options.getShotRule?.()??'continuous',cuts:structuredClone(cuts),holdMs:1500,confirmationMs:240,yawThresholdDegrees:60,pitchThresholdDegrees:20,gainThreshold:.08}),
    snapshot:()=>({...original.snapshot(),cuts:structuredClone(cuts)})
  });
}
