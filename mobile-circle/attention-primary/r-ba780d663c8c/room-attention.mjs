import {createAttentionController} from './handoff-controller.mjs';

// Host ownership/geometry only. Policy, safety, dynamics and flight stay pinned.
let nextInstance = 0;
const styles = Object.freeze({
  gentle: {paceSeconds:28,profile:{yawRate:.20943951023931953,pitchRate:.08726646259971647,zoomOutLogRate:.9,zoomInLogRate:.035}},
  balanced: {paceSeconds:14,profile:{yawRate:.2792526803190927,pitchRate:.12217304763960307,zoomOutLogRate:1,zoomInLogRate:.07}},
  lively: {paceSeconds:8,profile:{yawRate:.3490658503988659,pitchRate:.15707963267948966,zoomOutLogRate:1.1,zoomInLogRate:.12}}
});
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function createPrimaryAttention({getSpeaker,getStyle,getResponse,isPaused,notify}) {
  let blockerCache=[],bridge, instance, projection, baseline=1, alive=true, manual=pointers.size>0, suspended=isPaused();
  let realClock=performance.now(), logical=0, lastStep=0, raf, manualTimer, geometryDirty=false;
  let generation=0, pending=null, lastHolder=demoStickHolder, lastResult=null;
  const commits=[], cancellations=[];
  let observedSpeaker,voiceAt=0;
  const selectedMode=()=>getResponse()==='calm'?'cinematic':'current';
  const time=()=>{const now=performance.now();if(!isPaused())logical+=Math.max(0,now-realClock);realClock=now;return logical;};
  function refreshBlockers(cameraRect) {
    // Conservative occupied-control rectangles: rounded corners and glyph holes
    // remain opaque supports. Transparent wrapper gaps are never blockers.
    const selectors='.camera-controls .zoom-group, .camera-controls > button, .orbit-hint [data-gesture], #gesture-help[open]';
    blockerCache=[...document.querySelectorAll(selectors)].flatMap((element,index)=>{
      const style=getComputedStyle(element),r=element.getBoundingClientRect();
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||!r.width||!r.height)return [];
      const left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
      if(right<=left||bottom<=top)return [];
      return [{id:'ui:'+ (element.id||element.dataset.gesture||(element.classList.contains('zoom-group')?'zoom-group':index)),shape:'rect',front:true,depth:5000,
        x:(left+right)/2-cameraRect.left-cameraRect.width/2,y:(top+bottom)/2-cameraRect.top-cameraRect.height/2,
        width:right-left,height:bottom-top}];
    });
  }
  function bounds() {
    const r=camera.getBoundingClientRect(),h=document.querySelector('.table-top').getBoundingClientRect(),bar=document.querySelector('.call-tools').getBoundingClientRect();
    refreshBlockers(r);
    return {left:Math.max(0,r.left)-r.left-r.width/2+4,right:Math.min(innerWidth,r.right)-r.left-r.width/2-4,
      top:Math.max(0,r.top,h.bottom+4)-r.top-r.height/2+8,bottom:Math.min(innerHeight,r.bottom,bar.top)-r.top-r.height/2-8};
  }
  function capture() {
    projection=captureCameraProjection();
    const b=bounds(),pitch=Number(restAngle.value)*radians;
    const basePitch=restMode.value==='fixed'?pitch:clamp(pitch,18*radians,85*radians);
    const view={yaw:0,pitch:basePitch,zoom:1};
    const diameters=projection.ids.map(id=>projection.project(id,view).diameter).sort((a,b)=>a-b);
    const density=clamp((seats.length-3)/15,0,1),targetPx=clamp(Math.min(stage.width,stage.height)*(.35-.12*density),64,520);
    const desired=clamp(targetPx/diameters[Math.floor(diameters.length/2)],minZoom,maxZoom);
    let low=minZoom,high=desired;
    for(let i=0;i<18;i++){const zoom=(low+high)/2;const fits=projection.ids.every(id=>{const q=projection.project(id,{...view,zoom}),radius=q.diameter*(.5+portraitPaintMarginRatio)+5;return q.y-radius>=b.top&&q.y+radius<=b.bottom;});if(fits)low=zoom;else high=zoom;}
    baseline=low;
    return {ids:projection.ids,project(id,f){const q=projection.project(id,f);return {...q,depth:1001+Math.round(q.depth*1000),paintPadding:q.diameter*portraitPaintMarginRatio+5};}};
  }
  function build() {
    const now=time(),history=bridge?.snapshot().history??[],selected=styles[getStyle()]??styles.balanced;
    bridge=createAttentionController({getRoster:()=>seats.map((_,id)=>id),getProjection:capture,getBounds:bounds,
      getSpeakerYaw:id=>-Math.atan2(seatPoints[id][0],seatPoints[id][2]),getFrame:cameraFrame,applyFrame:applyCameraFrame,
      getHolder:()=>demoStickHolder,getBlockers:()=>blockerCache.map(rect=>({...rect})),getBaseZoom:()=>baseline,getRestPitch:()=>Number(restAngle.value)*radians,
      getFixedPitch:()=>restMode.value==='fixed'?Number(restAngle.value)*radians:null,
      config:{minZoom,maxZoom,memorySeconds:seats.length<=4?4:8,paceSeconds:selected.paceSeconds,profile:selected.profile}});
    instance=++nextInstance;
    for(const event of history)bridge.observe(event.id===null||seats[event.id]?event.id:null,event.at);
    if(!history.length||history.at(-1).id!==getSpeaker())bridge.observe(getSpeaker(),now);
    if(observedSpeaker!==getSpeaker()){observedSpeaker=getSpeaker();voiceAt=now;}
    bridge.step(now,0,{mode:selectedMode(),reducedMotion:reducedMotion.matches});
    if(manual||suspended)bridge.suspend(manual?'manual':'preview-paused');
    geometryDirty=false;lastStep=now;lastResult=null;
  }
  function cancelHandoff(reason='Handoff cancelled.') {
    if(!pending)return false;
    const cancelled={...pending,reason,at:time()};
    bridge.cancelHandoff(cancelled.at);lastResult=null;pending=null;generation++;cancellations.push(cancelled);if(cancellations.length>64)cancellations.shift();
    window.dispatchEvent(new CustomEvent('circleup:handoff-cancel',{detail:{reason,generation}}));
    return true;
  }
  const owner={
    beginManual(){if(!alive)return;clearTimeout(manualTimer);cancelHandoff('Manual view takes priority.');if(!manual){manual=true;bridge.suspend('manual');}lastStep=time();},
    manualChange(){owner.beginManual();manualTimer=setTimeout(()=>{if(!pointers.size)owner.requestReturn();},550);},
    requestReturn(){if(!alive||pointers.size)return;clearTimeout(manualTimer);if(manual){manual=false;bridge.resume();}lastStep=time();},
    layoutChanged(){if(!alive)return;cancelHandoff('The layout changed.');geometryDirty=true;}
  };
  build();
  const release=takeCameraAutomation(owner);
  function tick(){
    if(!alive)return;
    let now=time(),dt=Math.max(0,(now-lastStep)/1000);lastStep=now;
    if(demoStickHolder!==lastHolder){cancelHandoff('The actual stick holder changed.');lastHolder=demoStickHolder;geometryDirty=true;notify();}
    if(geometryDirty){build();now=time();dt=Math.max(0,(now-lastStep)/1000);lastStep=now;}
    const settling=getResponse()==='settled'&&observedSpeaker!==null&&now-voiceAt<350;
    lastResult=bridge.step(now,settling?0:dt,{mode:selectedMode(),paused:suspended||manual||pointers.size>0,reducedMotion:reducedMotion.matches});
    window.dispatchEvent(new Event('circleup:attention-frame'));
    raf=requestAnimationFrame(tick);
  }
  raf=requestAnimationFrame(tick);
  return Object.freeze({
    observe(id){if(alive){const now=time();if(id!==observedSpeaker){observedSpeaker=id;voiceAt=now;lastResult=null;}bridge.observe(id,now);}},
    setStyle(){if(alive){cancelHandoff('The camera style changed.');build();}},
    pause(){if(!alive)return;cancelHandoff('The preview paused.');time();suspended=true;bridge.suspend('preview-paused');lastStep=logical;},
    resume(){if(!alive)return;suspended=false;realClock=performance.now();if(manual&&!pointers.size)manual=false;if(!manual)bridge.resume();lastStep=time();},
    beginHandoff(id){
      if(!alive||manual||suspended||pointers.size||isPaused()||!Number.isInteger(id)||!seats[id]||id===demoStickHolder)return null;
      cancelHandoff('A newer handoff replaced this one.');
      if(geometryDirty)build();
      const now=time();pending={generation:++generation,from:demoStickHolder,to:id,beganAt:now,instance};bridge.beginHandoff(id,now);lastResult=null;return {...pending};
    },
    handoffReady(token){if(!pending||pending.generation!==token||manual||suspended||pointers.size||demoStickHolder!==pending.from)return {ready:false,reason:'obsolete-or-manual-handoff'};const readiness=bridge.handoffReady();return {...readiness,constraintConflict:lastResult?.metrics.proposal?.constraintConflict??false,constraintReason:lastResult?.metrics.proposal?.constraintReason??null};},
    commitHandoff(id,token){
      if(!pending||pending.to!==id||pending.generation!==token||manual||suspended||pointers.size||demoStickHolder!==pending.from||!bridge.handoffReady().ready)return false;
      const before=bridge.snapshot(),accepted={...pending,at:time()};
      demoStickHolder=id;lastHolder=id;bridge.commitHandoff(accepted.at);lastResult=null;pending=null;generation++;
      const after=bridge.snapshot();commits.push({...accepted,before:{frame:before.frame,motion:before.motion},after:{frame:after.frame,motion:after.motion},actualSpeaker:getSpeaker()});if(commits.length>64)commits.shift();notify();return true;
    },
    cancelHandoff,
    destroy(){if(!alive)return;cancelHandoff('The camera owner stopped.');alive=false;clearTimeout(manualTimer);cancelAnimationFrame(raf);release();},
    snapshot(){const s=bridge.snapshot();return {...s,instance,alive,manual,suspended,generation,pending:pending?{...pending}:null,hostGeometry:{depth:'1001+Math.round(projectedDepth*1000), DOM order ties',blockers:blockerCache.map(rect=>({...rect})),blockerApproximation:'Visible occupied control rectangles; rounded corners/glyph holes treated as opaque; no transparent wrapper gaps'},response:getResponse(),settledUntil:voiceAt+350,baseline,commits:[...commits],cancellations:[...cancellations]};}
  });
}
