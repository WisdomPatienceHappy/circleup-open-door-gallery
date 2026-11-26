import {createScene} from './scene.mjs';
import {mountSpeakerScreen} from './speaker-screen.mjs';
import {speakerFrameQuality} from './geometry/stack-framing.mjs';
import {ink} from './ink.mjs';

/** One active room/producer; a passive overview projects its exact joined world. */
export function mountOverviewSpeaker({scene,getState,roomMembers,getConversation}){
 const app=document.querySelector('#app'),main=document.querySelector('#main-layout'),stage=document.querySelector('#scene-stage');
 let enabled=true,flipped=false,visible=true,lastAudit=0,lastCue=null,lastReport=null,splitMovement='cuts';
 let single={movement:'hybrid',framing:'speaker',shape:'circle',adaptiveOval:false};
 const ui=mountSpeakerScreen({scene,getState,roomMembers,getConversation,initialFacePixels:165,getScreenInfo:()=>({cutPolicy:visible?'large-speaker-quality':'outside-stage-or-certified-cull-only',oneScreen:!visible,secondaryRenderers:1,activeSecondaryRenderers:visible?1:0})});
 const options=document.querySelector('#demo-options-panel'),toolbar=options.querySelector('.speaker-toolbar');
 const layout=document.createElement('label');layout.innerHTML='Layout<select id="speaker-layout" aria-label="View layout"><option value="split">Circle + speaker</option><option value="single">Single camera</option></select>';toolbar.prepend(layout);
 const swap=document.createElement('button');swap.id='swap-speaker-views';swap.type='button';swap.textContent='Swap';swap.setAttribute('aria-label','Swap overview and speaker positions');swap.setAttribute('aria-pressed','false');document.querySelector('.header-actions').prepend(swap);
 const largeLabel=document.createElement('p');largeLabel.className='speaker-pane-label';largeLabel.setAttribute('aria-live','polite');largeLabel.textContent='Speaker view';stage.append(largeLabel);
 const host=document.createElement('section');host.id='joined-overview';host.setAttribute('aria-label','Whole joined circle overview');host.setAttribute('role','group');main.append(host);
 const shadow=host.attachShadow({mode:'open'});
 for(const link of document.querySelectorAll('head link[rel="stylesheet"]')){const copy=link.cloneNode();copy.href=link.href;shadow.append(copy);}
 const style=document.createElement('style');style.textContent=`:host{display:block;position:relative;min-height:0;overflow:hidden}#scene-stage{position:absolute;inset:0;width:100%;height:100%;min-height:0}#scene-stage>*:not(canvas,#world-layer){display:none!important}.world-center,.room-navigation-label,.seat .name{display:none!important}.overview-label{position:absolute;top:5px;left:8px;right:8px;height:18px;margin:0;z-index:2400000;font:12px/18px var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink);background:#faf0e3c9}.overview-label::before{content:'○ ';color:#b47825}.seat[data-shown=true] .photo::after{display:none;content:'';position:absolute;inset:-5px;border:3px solid #b47825;border-radius:50%;box-shadow:0 0 0 1px #fff9;pointer-events:none}.overview-cue{position:absolute;border:3px solid #b47825;border-radius:48% 52% 49% 51%;outline:1px solid #fff9;translate:-50% -50%;z-index:2400000;pointer-events:none}.overview-cue[hidden]{display:none}.stack-media{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;object-fit:cover;mask-image:var(--portrait-mask);-webkit-mask-image:var(--portrait-mask)}`;shadow.append(style);
 const clone=stage.cloneNode(true);clone.querySelector('.ring').replaceChildren();clone.querySelector('#neighbors').replaceChildren();clone.querySelector('#centers').replaceChildren();clone.querySelectorAll('.room-navigation-label,video').forEach(e=>e.remove());clone.inert=true;shadow.append(clone);
 const overviewLabel=document.createElement('p');overviewLabel.className='overview-label';overviewLabel.setAttribute('aria-live','polite');overviewLabel.textContent='Whole circle · waiting for a speaker view';shadow.append(overviewLabel);
 const cue=document.createElement('span');cue.className='overview-cue';cue.hidden=true;cue.setAttribute('aria-hidden','true');shadow.append(cue);
 const overview=createScene({element:clone,getState,roomMembers,passive:true,passiveRole:'overview'});
 const audit=document.createElement('script');audit.id='overview-speaker-state';audit.type='application/json';document.body.append(audit);
 const mirrors=new Map();
 function mirrorMedia(){
  for(const seat of stage.querySelectorAll('.ring .seat')){const id=seat.dataset.person,video=seat.querySelector('video'),photo=clone.querySelector(`.seat[data-person="${id}"] .photo`);if(!photo)continue;let canvas=mirrors.get(id);if(video&&!video.hidden&&video.readyState>=2){if(!canvas){canvas=document.createElement('canvas');canvas.className='stack-media';canvas.width=180;canvas.height=180;photo.append(canvas);mirrors.set(id,canvas);}canvas.hidden=false;canvas.getContext('2d').drawImage(video,0,0,180,180);}else if(canvas)canvas.hidden=true;}
  for(const[id,c]of mirrors)if(!clone.querySelector(`.seat[data-person="${id}"]`)){c.remove();mirrors.delete(id);}
 }
 function setEnabled(value){
  if(enabled&&!value){splitMovement=document.querySelector('#speaker-shot-mode').value;scene.setStackCloseup(false);scene.setSpeakerShotMode(single.movement);document.querySelector('#speaker-shot-mode').value=single.movement;scene.setSpeakerFramingMode(single.framing);scene.setTuning({shape:single.shape,adaptiveOval:single.adaptiveOval});}
  if(!enabled&&value){const t=scene.snapshot().tuning;single={movement:document.querySelector('#speaker-shot-mode').value,framing:document.querySelector('#speaker-framing-mode').value,shape:t.shape,adaptiveOval:t.adaptiveOval};scene.setStackCloseup(true);scene.setSpeakerFramingMode('speaker');scene.setSpeakerShotMode(splitMovement);document.querySelector('#speaker-shot-mode').value=splitMovement;}
  enabled=Boolean(value);document.querySelector('#speaker-layout').value=enabled?'split':'single';main.classList.toggle('overview-split',enabled);app.classList.toggle('overview-speaker-demo',enabled);host.hidden=!enabled;swap.hidden=!enabled;
  for(const id of ['speaker-framing-mode','speaker-seating-mode','adaptive-oval','shape-mode','ovality']){const el=document.getElementById(id);el.disabled=enabled;el.title=enabled?'Both views use the same fixed circle. Single camera restores the other comparisons.':'';}
  document.querySelector('#speaker-framing-mode').value=enabled?'speaker':single.framing;
 }
 document.querySelector('#speaker-layout').onchange=e=>setEnabled(e.target.value==='split');
 swap.onclick=()=>{flipped=!flipped;main.classList.toggle('speaker-first',flipped);swap.setAttribute('aria-pressed',String(flipped));};
 scene.setStackCloseup(true);scene.setSpeakerFramingMode('speaker');scene.setSpeakerShotMode('cuts');document.querySelector('#speaker-shot-mode').value='cuts';setEnabled(true);ink(options);ink();
 function render(frame,time){
  visible=enabled&&frame.view.kind==='circle';ui.render(frame,time);if(!frame.initialFitDone)return;
  host.hidden=!visible;swap.hidden=!visible;main.classList.toggle('overview-split',visible);app.classList.toggle('overview-speaker-demo',visible);
  if(enabled){document.querySelector('#speaker-framing-mode').value='speaker';document.querySelector('#speaker-seating-mode').value='fixed';}
  const applied=scene.appliedComposition(),mixed=(applied.frame.focusRefs??[]).filter(r=>r.weight>.001).length>1,transition=applied.transition||mixed;
  const quality=speakerFrameQuality({photo:applied.photo,fraction:applied.fraction,bounds:applied.bounds,targetPixels:applied.targetPixels??165,retained:lastCue===applied.appliedSubjectId});
  const framedId=!transition&&quality.framed?applied.appliedSubjectId:null,state=getState(),name=framedId?state.persons[framedId]?.name??framedId:null;
  const caption=transition?'Speaker view · moving':name?'Large view: '+name+(applied.limited?' · limited at this zoom':''):applied.browsing?'Speaker view · manual':'Speaker view · circle context';if(largeLabel.textContent!==caption)largeLabel.textContent=caption;
  if(visible){lastReport=overview.renderShared(frame,time);mirrorMedia();const point=lastReport?.points.find(p=>p.id===framedId)?.projected;cue.hidden=!point?.visible;if(point?.visible){cue.style.left=lastReport.bounds.width/2+point.x+'px';cue.style.top=lastReport.bounds.height/2+point.y+'px';cue.style.width=point.diameter+10+'px';cue.style.height=point.diameter+10+'px';cue.dataset.subject=framedId;cue.dataset.largePaintRevision=String(applied.renderRevision);}for(const seat of clone.querySelectorAll('.ring .seat'))seat.dataset.shown=String(seat.dataset.person===framedId);const text=name?'Whole circle · large view: '+name:transition?'Whole circle · view moving':'Whole circle · circle context';if(overviewLabel.textContent!==text)overviewLabel.textContent=text;host.dataset.framed=framedId??'';host.dataset.largePaintRevision=String(applied.renderRevision);}
  lastCue=framedId;
  if(time-lastAudit<200)return;lastAudit=time;
  const conversation=getConversation?.();audit.textContent=JSON.stringify({layout:visible?'overview-speaker':'single',speakerFirst:flipped,sourceLogical:frame.logical,running:frame.running,currentOwner:frame.speaker,pendingSubjectId:applied.pendingSubjectId,appliedSubjectId:applied.appliedSubjectId,framedId,transition,quality,limited:applied.limited,largePaintRevision:applied.renderRevision,cueForLargePaintRevision:applied.renderRevision,appliedFrameRevision:applied.appliedFrameRevision,large:{camera:frame.camera,frame:frame.appliedFrame,metrics:scene.viewMetrics()},overview:visible?{report:lastReport,metrics:overview.viewMetrics()}:null,sharedWorld:frame.world[state.joinedRoomId],sharedWorldDiameter:frame.worldDiameter,activity:frame.activity,audioOwners:1,secondarySamplers:0,secondaryControllers:0,mirroredVideoCanvases:mirrors.size,audio:conversation?{createdAt:conversation.history[0]?.wallTimeMs,graph:conversation.graph,participants:conversation.participants.length,statistics:conversation.statistics,status:conversation.status}:null});
 }
 return Object.freeze({render,observe:e=>ui.observe(e)});
}
