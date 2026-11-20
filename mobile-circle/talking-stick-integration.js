/** Product transport adapter. The preview's one Attention owner controls framing. */
(async () => {
  'use strict';
  await window.CircleUpConversationPreviewReady;
  const preview=window.CircleUpConversationPreview,grid=document.querySelector('.tuning-grid'),header=document.querySelector('.table-top'),shell=document.querySelector('.preview-shell');
  if(!grid||!header||!window.TalkingStickDemo||window.CircleUpTalkingStick)return;
  const oldDemo=document.querySelector('.sample-turn'),oldHidden=oldDemo?.hidden;
  if(oldDemo)oldDemo.hidden=true;
  header.classList.add('talking-stick-header');shell?.classList.add('talking-stick-ready');
  let disposed=false,pending=null,rosterCount=seats.length,starting=false;
  const roster=()=>seats.map((_,id)=>({id,name:names[id]}));
  function safeBounds(){const r=camera.getBoundingClientRect(),h=header.getBoundingClientRect(),bar=document.querySelector('.call-tools').getBoundingClientRect();const left=Math.max(0,r.left),top=Math.max(0,r.top,h.bottom+4),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom,bar.top);return {left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};}
  const demo=TalkingStickDemo.create({mount:grid,quickMount:header,roster:roster(),getHolder:()=>demoStickHolder,
    getAnchorRect:id=>seats[id]?.querySelector('.photo').getBoundingClientRect(),getTravelBounds:safeBounds,durationMs:2000,easing:'smootherstep',
    onBegin(id,{from}){if(!pending||pending.to!==id||pending.from!==from||!preview.handoffReady(pending.generation).ready)throw Error('Handoff readiness changed before flight');},
    onCommit(id){const accepted=pending;if(!accepted||accepted.to!==id)return;pending=null;if(!preview.commitHandoff(id,accepted.generation)){const reason='The view changed before arrival. Pass cancelled; the actual holder is unchanged.';preview.cancelHandoff(reason);queueMicrotask(()=>{if(!disposed)status.textContent=reason;});}refresh();}
  });
  const section=grid.querySelector('.talking-stick-demo'),status=section.querySelector('.talking-stick-status');
  const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='talking-stick-cancel paper-outline';cancelButton.innerHTML='<i class="paper-stroke" aria-hidden="true"></i><span>Cancel pass</span>';cancelButton.hidden=true;cancelButton.style.minHeight='44px';status.before(cancelButton);
  const quickPass=header.querySelector('.talking-stick-quick');
  function refresh(){if(disposed)return;if(rosterCount!==seats.length){rosterCount=seats.length;demo.updateRoster(roster());}else demo.refresh();cancelButton.hidden=!pending;if(pending&&quickPass){quickPass.disabled=false;quickPass.querySelector('span').textContent='Cancel pass';quickPass.setAttribute('aria-label','Cancel this talking-stick pass');quickPass.title='Cancel this pass; the actual holder stays unchanged';}if(pending&&!pending.started){section.setAttribute('aria-busy','true');status.textContent=pending.explanation??`Preparing ${names[pending.to]}'s view. ${names[pending.from]} still holds the stick. You can cancel this pass.`;}}
  function cancel(reason='Handoff cancelled.') {if(disposed)return;const hadPending=!!pending||demo.snapshot().passing;pending=null;demo.cancel(reason);preview.cancelHandoff(reason);if(hadPending)status.textContent=reason;refresh();}
  function passTo(id){if(disposed)return false;cancel('A newer handoff replaced this one.');const intent=preview.beginHandoff(id);if(!intent){status.textContent='Return to the circle or resume the preview before passing.';return false;}pending={...intent,started:false};refresh();advance();return true;}
  function advance(){if(disposed||starting||!pending||pending.started)return;if(demoStickHolder!==pending.from){cancel('The actual stick holder changed.');return;}const readiness=preview.handoffReady(pending.generation);if(!readiness.ready){if(readiness.constraintConflict){pending.explanation=restMode.value==='fixed'?'This fixed view cannot yet fit the voice, holder and recipient. Choose Adaptive or another angle, or cancel this pass.':'The voice, holder and recipient do not yet fit together. You can cancel this pass.';status.textContent=pending.explanation;}return;}const intended=pending;intended.started=true;starting=true;let began;try{began=demo.passTo(intended.to);}finally{starting=false;}if(!began&&pending===intended)cancel('The handoff could not start.');else refresh();}
  const listeners=[];
  cancelButton.addEventListener('click',()=>cancel('Pass cancelled. The actual holder is unchanged.'));
  function intercept(element,choose,cancelCurrent=false){if(!element)return;const listener=event=>{event.preventDefault();event.stopImmediatePropagation();if(cancelCurrent&&pending)cancel('Pass cancelled. The actual holder is unchanged.');else passTo(choose());};element.addEventListener('click',listener,{capture:true});listeners.push([element,'click',listener]);}
  const next=()=> (demoStickHolder+1)%seats.length;
  intercept(section.querySelector('.talking-stick-next'),next);
  intercept(quickPass,next,true);
  intercept(section.querySelector('.talking-stick-send'),()=>section.querySelector('select').selectedOptions[0]?._stickId);
  intercept(passStick,next);
  const changed=()=>cancel('The preview or layout changed. Handoff cancelled.');
  for(const selector of ['#conversation-play','#conversation-quick-play','#conversation-trace','#conversation-speed','#conversation-response','#camera-style','#group-size','#seating-layout','#reset-layout','#reset-view','#gesture-help-button']){
    const element=document.querySelector(selector),event=element?.tagName==='SELECT'?'change':'click';element?.addEventListener(event,changed,{capture:true});if(element)listeners.push([element,event,changed]);
  }
  const hostCancelled=event=>{pending=null;const reason=event.detail?.reason??'Handoff cancelled.';demo.cancel(reason);status.textContent=reason;refresh();};
  const away=()=>cancel('Handoff cancelled while the preview is away.');
  const visibility=()=>{if(document.hidden)away();};
  const observer=new MutationObserver(refresh);observer.observe(ring,{childList:true,subtree:true,attributes:true,attributeFilter:['data-speaker']});
  window.addEventListener('circleup:attention-frame',advance);window.addEventListener('circleup:handoff-cancel',hostCancelled);window.addEventListener('pagehide',away);document.addEventListener('visibilitychange',visibility);
  window.CircleUpTalkingStick=Object.freeze({passTo,cancel,refresh,snapshot:()=>({...demo.snapshot(),preparing:!!pending&&!pending.started,pending:pending?{...pending}:null,travelBounds:safeBounds()}),dispose(){if(disposed)return;cancel();disposed=true;observer.disconnect();for(const [element,event,listener]of listeners)element.removeEventListener(event,listener,{capture:true});window.removeEventListener('circleup:attention-frame',advance);window.removeEventListener('circleup:handoff-cancel',hostCancelled);window.removeEventListener('pagehide',away);document.removeEventListener('visibilitychange',visibility);demo.dispose();header.classList.remove('talking-stick-header');shell?.classList.remove('talking-stick-ready');if(oldDemo)oldDemo.hidden=oldHidden;}});
})();
