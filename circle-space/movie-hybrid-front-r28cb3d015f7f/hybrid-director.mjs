import {createExposureOrbitController} from './cinematic-attention/exposure-orbit-controller.mjs';
import {interpolateHybridFrame} from './geometry/hybrid-framing.mjs';
const RAD=Math.PI/180,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),copy=v=>structuredClone(v);
export function assessHybridFrame({frame,owner,weights,projection,bounds,blockers=()=>[],contentRects=()=>[],measureVisibility}){
 const people=projection.ids.map((id,order)=>({id,order,...projection.project(id,frame)}));
 const fits=contentRects(frame).every(r=>(r.left??r.x-r.width/2)>=bounds.left&&(r.right??r.x+r.width/2)<=bounds.right&&(r.top??r.y-r.height/2)>=bounds.top&&(r.bottom??r.y+r.height/2)<=bounds.bottom);
 const obs=blockers(frame),fraction=p=>{if(!p?.visible||p.diameter<=0)return 0;const near=q=>q.front||q.depth>p.depth||q.depth===p.depth&&q.order>p.order;const v=measureVisibility({target:p,occluders:[...people.filter(q=>q.id!==p.id&&q.visible&&near(q)),...obs.filter(near)],bounds,rows:32});return v.fullArea?v.lower/v.fullArea:0;};
 const measured=people.map(p=>({...p,fraction:fraction(p)})),speaker=measured.find(p=>p.id===owner),others=measured.filter(p=>p.id!==owner),context=others.reduce((s,p)=>s+p.fraction,0)/Math.max(1,others.length);
 const past=weights.filter(w=>w.id!==owner),total=past.reduce((s,w)=>s+w.weight,0),group=total?past.reduce((s,w)=>s+w.weight*(measured.find(p=>p.id===w.id)?.fraction??0),0)/total:context;
 const cx=(bounds.left+bounds.right)/2,cy=(bounds.top+bounds.bottom)/2,center=speaker?.visible?1-clamp(Math.hypot((speaker.x-cx)/(bounds.right-bounds.left),(speaker.y-cy)/(bounds.bottom-bounds.top)),0,1):0;
 const score=.62*(speaker?.fraction??0)+.20*group+.10*context+.08*center;
 return {frame,score,fraction:speaker?.fraction??0,group,context,contentFits:fits,visibleOthers:others.filter(p=>p.fraction>.55).map(p=>p.id),observedGroup:weights.filter(w=>w.weight>.05).map(w=>({id:w.id,weight:w.weight,fraction:measured.find(p=>p.id===w.id)?.fraction??0})),frontDepth:projection.frontDepth?.(owner,frame)??NaN,speaker:speaker?{x:speaker.x,y:speaker.y,diameter:speaker.diameter}:null};
}
export function chooseHybridShot(o){
 const {current,owner,framing,speakerYaw}=o,focusAmount=framing==='circle'?0:1;
 const yaws=[current.yaw,speakerYaw,speakerYaw+Math.PI,...Array.from({length:8},(_,i)=>i*Math.PI/4)],pitches=[clamp(current.pitch,5*RAD,45*RAD),30*RAD,45*RAD];
 const poses=[];for(const yaw of yaws)for(const pitch of pitches)if(!poses.some(f=>Math.abs(wrap(f.yaw-yaw))<1e-8&&Math.abs(f.pitch-pitch)<1e-8))poses.push({yaw:wrap(yaw),pitch,zoom:current.zoom,focusId:owner,focusWorld:focusAmount?o.projection.worldPoint(owner,{yaw:wrap(yaw),pitch,zoom:current.zoom}):null,focusRefs:focusAmount?[{id:owner,weight:1}]:[],focusAmount});
 const from=assessHybridFrame({...o,frame:current});
 const candidates=poses.map(frame=>assessHybridFrame({...o,frame})).filter(s=>s.contentFits&&s.fraction>=.55&&s.frontDepth>1e-8).sort((a,b)=>{
  const utility=s=>s.score-.012*Math.abs(wrap(s.frame.yaw-current.yaw))/Math.PI-.008*Math.abs(s.frame.pitch-current.pitch)/(40*RAD);
  return utility(b)-utility(a);
 });
 return {from,best:candidates[0]??null,evaluated:poses.length};
}
export function hybridDistance(current,target,projection,owner,viewport){
 const a=projection.project(owner,current),b=projection.project(owner,target),screenAngle=a.visible&&b.visible?Math.atan2(Math.hypot(a.x-b.x,a.y-b.y),viewport.focal):Math.PI;
 return Math.max(Math.abs(wrap(target.yaw-current.yaw)),Math.abs(target.pitch-current.pitch),screenAngle);
}
export function createHybridDirector(options){
 const retained=createExposureOrbitController(options),old=options.initialCutState;
 let suspended=null,owner=null,since=0,lastChange=old?.lastChange??-Infinity,focused=null,plannedWeights=[],lastSettings='',motion=null,lastResult=null;
 const poseTrace=copy(old?.poseTrace??[]),poseStats={glideSteps:old?.poseStats?.glideSteps??0,cutCommits:old?.poseStats?.cutCommits??0};const recordPose=(frame,at,kind)=>{poseTrace.push({at,kind,frame:copy(frame)});if(poseTrace.length>120)poseTrace.shift();poseStats[kind==='glide'?'glideSteps':'cutCommits']++;};
 const changes=copy(old?.changes??[]),cancel=()=>{owner=null;since=0;motion=null;};
 const settings=()=>({movement:options.getShotRule?.()??'hybrid',framing:options.getFramingMode?.()??'circle'});
 const basis=()=>JSON.stringify([options.getGeometryVersion?.(),options.getBounds(),options.getRoster(),options.getFrame().zoom,settings()]);
 const context=(projection,weights,who)=>({owner:who,weights,projection,bounds:options.getBounds(),blockers:options.getBlockers,contentRects:options.getContentRects,measureVisibility:globalThis.AttentionConversationCamera.measureVisibility});
 const variation=(a,b)=>{const ids=new Set([...a.map(x=>x.id),...b.map(x=>x.id)]);return [...ids].reduce((s,id)=>s+Math.abs((a.find(x=>x.id===id)?.weight??0)-(b.find(x=>x.id===id)?.weight??0)),0)/2;};
 const finish=v=>(lastResult=v,v);
 return Object.freeze({...retained,
  suspend(why){suspended=why??'manual-browse';cancel();focused=null;retained.suspend(why);},
  resume(){suspended=null;cancel();focused=null;retained.resume();},
  reset(){cancel();focused=null;changes.length=0;poseTrace.length=0;poseStats.glideSteps=0;poseStats.cutCommits=0;lastChange=-Infinity;plannedWeights=[];retained.reset();},
  step(now,dt,flags={}){
   const delegated=retained.step(now,0,{...flags,paused:true}),fs=retained.focusSnapshot(),next=retained.snapshot().activeId,s=settings(),key=JSON.stringify(s);
   const blocked=Boolean(flags.paused||suspended!==null||flags.mode==='manual');
   const hold={...delegated,paused:blocked,applied:false,reason:blocked?suspended??'external-pause':'hybrid-hold',metrics:{changes:changes.length}};
   if(blocked||!next||!fs.rawActiveIds.includes(next)){cancel();return finish({...hold,reason:blocked?hold.reason:'quiet-or-owner-inactive'});}
   if(next!==owner||key!==lastSettings){owner=next;since=now;lastSettings=key;}
   // A stabilized observed-owner change fences any older destination before applying another pose.
   if(motion&&motion.owner!==next){motion=null;focused=null;}
   const weights=fs.weights.map(({id,weight})=>({id,weight}));
   if(motion){
    if(motion.basis!==basis()){motion=null;focused=null;}
    else{
     const projection=options.getProjection(),ctx=context(projection,weights,motion.owner),u=clamp((now-motion.at)/motion.duration,0,1),ease=u*u*(3-2*u),frame=interpolateHybridFrame(motion.from,motion.to,ease),actual=assessHybridFrame({...ctx,frame});
     if(!actual.contentFits||actual.fraction+1e-6<motion.minimumFraction){motion=null;focused=null;return finish({...hold,reason:'glide-route-refused'});}
     if(options.applyFrame(frame)===false){motion=null;focused=null;return finish({...hold,reason:'glide-apply-refused'});}recordPose(frame,now,'glide');const done=u>=1;if(done)motion=null;
     return finish({...hold,frame,target:done?frame:motion.to,applied:true,reason:done?'glide-complete':'nearby-glide',metrics:{actual,changes:changes.length}});
    }
   }
   if(!dt||now-since<240||now-lastChange<1500)return finish(hold);
   if(focused===owner&&variation(weights,plannedWeights)<.12&&key===lastSettings)return finish(hold);
   const beforeBasis=basis(),current=options.getFrame(),projection=options.getProjection(),ctx=context(projection,weights,owner);
   const {from,best,evaluated}=chooseHybridShot({...ctx,current,framing:s.framing,speakerYaw:options.getSpeakerYaw(owner)});
   plannedWeights=weights;if(!best)return finish({...hold,reason:'no-valid-front-shot-at-user-zoom'});
   if(beforeBasis!==basis()||retained.snapshot().activeId!==owner)return finish({...hold,reason:'stale-shot'});
   const framingChanged=Math.abs((current.focusAmount??0)-best.frame.focusAmount)>.01||best.frame.focusAmount&&current.focusId!==owner;
   if(best.score-from.score<.025&&!framingChanged&&from.fraction>=.55&&from.frontDepth>1e-8){focused=owner;return finish({...hold,reason:'already-useful-view',metrics:{actual:from,evaluated}});}
   const distance=hybridDistance(current,best.frame,projection,owner,options.getViewport()),near=distance<=25*RAD&&Math.abs(best.frame.pitch-current.pitch)<=12*RAD;
   const minimumFraction=Math.max(0,Math.min(from.fraction,best.fraction)-.08);
   const route=s.movement==='hybrid'&&near&&Array.from({length:8},(_,i)=>assessHybridFrame({...ctx,frame:interpolateHybridFrame(current,best.frame,(i+1)/8)})).every(v=>v.contentFits&&v.fraction+1e-6>=minimumFraction);
   const proposal={kind:route?'glide':'cut',at:now,owner,...s,from:copy(current),frame:copy(best.frame),distanceDegrees:distance/RAD,near,routeFits:Boolean(route),minimumFraction,evaluated,...best};
   focused=owner;lastChange=now;changes.push(proposal);if(changes.length>128)changes.shift();
   if(route){motion={at:now,duration:clamp(distance/.25*1000,600,1800),from:copy(current),to:copy(best.frame),owner,basis:beforeBasis,minimumFraction};return finish({...hold,target:best.frame,reason:'glide-started',metrics:{shot:proposal}});}
   if((options.applyCutFrame??options.applyFrame)(best.frame,proposal)===false){changes.pop();focused=null;return finish({...hold,reason:'cut-refused'});}
   recordPose(best.frame,now,'cut');retained.suspend('explicit-cut-rebase');retained.resume();
   return finish({...hold,frame:best.frame,target:best.frame,applied:true,reason:'distant-or-obscured-cut',metrics:{shot:proposal}});
  },
  snapshot:()=>({...retained.snapshot(),algorithm:'four-way-hybrid-director',suspended,paused:lastResult?.paused??false,reason:lastResult?.reason??'not-stepped',lastResult,shotFocus:focused,pendingOwner:owner,lastChange,changes:copy(changes),poseTrace:copy(poseTrace),poseStats:{...poseStats},cuts:copy(changes.filter(c=>c.kind==='cut')),glides:copy(changes.filter(c=>c.kind==='glide')),settings:settings(),motion:copy(motion),confirmationMs:240,minimumHoldMs:1500,nearDegrees:25})
 });
}
