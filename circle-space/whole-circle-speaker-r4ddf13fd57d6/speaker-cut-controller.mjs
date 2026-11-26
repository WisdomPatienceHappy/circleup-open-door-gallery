import {createExposureOrbitController} from './cinematic-attention/exposure-orbit-controller.mjs';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
/** One camera writer. Original E retains observed duration history; this director owns endpoint cuts. */
export function chooseSpeakerShot({owner,current,mode,projection,bounds,blockers,measureVisibility,contentRects=()=>[]}){
 const poses=mode==='fixed'?[current]:[current,...Array.from({length:8},(_,i)=>({yaw:i*Math.PI/4,pitch:current.pitch,zoom:current.zoom}))];
 const ids=projection.ids;
 const assess=pose=>{
  const frame={...pose,zoom:current.zoom,focusId:owner},people=ids.map((id,order)=>({id,order,...projection.project(id,frame)}));
  const target=people.find(p=>p.id===owner);if(!target?.visible||target.diameter<=0)return null;
  const contentFits=contentRects(frame).every(r=>{const left=r.left??r.x-r.width/2,right=r.right??r.x+r.width/2,top=r.top??r.y-r.height/2,bottom=r.bottom??r.y+r.height/2;return left>=bounds.left&&right<=bounds.right&&top>=bounds.top&&bottom<=bounds.bottom;});if(!contentFits)return null;
  const obs=blockers(frame),nearer=(p,q)=>q.front||q.depth>p.depth||q.depth===p.depth&&q.order>p.order;
  const visibility=p=>{if(!p.visible||p.diameter<=0)return 0;const v=measureVisibility({target:p,occluders:[...people.filter(q=>q.id!==p.id&&q.visible&&nearer(p,q)),...obs.filter(q=>nearer(p,q))],bounds,rows:32});return v.fullArea?v.lower/v.fullArea:0;};
  const fraction=visibility(target),others=people.filter(p=>p.id!==owner).map(p=>({id:p.id,fraction:visibility(p)})),context=others.reduce((s,p)=>s+p.fraction,0)/Math.max(1,others.length);
  const score=.84*fraction+.15*context-.01*Math.abs(wrap(frame.yaw-current.yaw))/Math.PI;
  return {frame,fraction,context,contentFits,visibleOthers:others.filter(p=>p.fraction>.5).map(p=>p.id),score,center:{x:target.x,y:target.y},diameter:target.diameter};
 };
 const candidates=poses.map(assess).filter(Boolean).sort((a,b)=>b.score-a.score);return candidates[0]??null;
}
export function createSpeakerCutController(options){
 const original=createExposureOrbitController(options);let suspended=null,owner=null,since=0,focused=options.initialCutState?.shotFocus??null,lastCut=options.initialCutState?.cuts?.at(-1)?.at??-Infinity,lastMode=options.initialCutState?.shotRule??null,paused=false,directorResult=null;const cuts=structuredClone(options.initialCutState?.cuts??[]);const remember=v=>(directorResult=v,v);
 const cancel=()=>{owner=null;since=0;};
 return Object.freeze({...original,
  suspend(why){suspended=why??'manual-browse';cancel();focused=null;original.suspend(why);},
  resume(){suspended=null;cancel();focused=null;original.resume();},
  reset(){cancel();focused=null;lastCut=-Infinity;cuts.length=0;original.reset();},
  step(now,dt,flags={}){
   // Do not run the continuous E planner as a second writer.
   const retained=original.step(now,0,{...flags,paused:true});
   const state=original.snapshot(),fs=original.focusSnapshot(),next=state.activeId,mode=options.getShotRule?.()??'fixed';
   const blocked=flags.paused||suspended!==null||flags.mode==='manual';paused=Boolean(blocked);
   const hold={...retained,paused:Boolean(blocked),applied:false,reason:blocked?suspended??'external-pause':'speaker-shot-held',metrics:{...retained.metrics,cuts:cuts.length}};
   if(blocked||!next||!fs.rawActiveIds.includes(next)){cancel();return remember(hold);}
   if(next!==owner||mode!==lastMode){owner=next;since=now;lastMode=mode;}
   if(!dt||now-since<240||now-lastCut<1500||focused===owner)return remember(hold);
   const basis=()=>JSON.stringify([options.getGeometryVersion?.(),options.getBounds(),options.getRoster(),options.getFrame(),state.activeId,mode]);
   const beforeBasis=basis(),current=options.getFrame(),projection=options.getProjection(),b=options.getBounds();
   const shot=chooseSpeakerShot({owner,current,mode,projection,bounds:b,blockers:options.getBlockers??(()=>[]),measureVisibility:globalThis.AttentionConversationCamera.measureVisibility,contentRects:options.getContentRects});
   if(!shot||shot.fraction<.55||basis()!==beforeBasis||original.snapshot().activeId!==owner)return remember({...hold,reason:'speaker-shot-obscured-or-stale'});
   const proposal={kind:'cut',at:now,owner,mode,from:{...current},...shot,basis:beforeBasis};
   if((options.applyCutFrame??options.applyFrame)(shot.frame,proposal)===false)return remember(hold);
   focused=owner;lastCut=now;cuts.push(proposal);if(cuts.length>128)cuts.shift();original.suspend('explicit-cut-rebase');original.resume();
   return remember({...hold,applied:true,frame:shot.frame,target:shot.frame,reason:'centered-speaker-cut',metrics:{...hold.metrics,shot:proposal}});
  },
  snapshot:()=>({...original.snapshot(),algorithm:'single-screen-speaker-cuts',reason:directorResult?.reason??'not-stepped',lastResult:directorResult,suspended,paused,cuts:structuredClone(cuts),shotFocus:focused,pendingOwner:owner,shotRule:options.getShotRule?.(),confirmationMs:240,minimumHoldMs:1500})
 });
}
