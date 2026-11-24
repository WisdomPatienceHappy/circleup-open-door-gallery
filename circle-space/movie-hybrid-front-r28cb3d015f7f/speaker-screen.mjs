import {ink} from './ink.mjs';
export function mountSpeakerScreen({scene,getState,roomMembers}){
 const app=document.querySelector('#app'),main=document.querySelector('#main-layout'),stage=document.querySelector('#scene-stage'),header=app.querySelector('.header-actions');app.classList.add('compact-demo');
 const toggle=document.createElement('button');toggle.type='button';toggle.id='demo-options';toggle.textContent='Options ▾';toggle.setAttribute('aria-haspopup','dialog');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','demo-options-panel');
 const panel=document.createElement('section');panel.id='demo-options-panel';panel.className='demo-options-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','View options');panel.setAttribute('aria-modal','false');panel.hidden=true;
 panel.innerHTML='<div class="demo-options-heading"><h2>View options</h2><button type="button" id="demo-options-close" aria-label="Close view options">×</button></div>';
 const toolbar=document.createElement('div');toolbar.className='speaker-toolbar';toolbar.innerHTML='<label>Framing<select id="speaker-framing-mode" aria-label="Circle centering"><option value="circle">Circle centered</option><option value="speaker">Circle off-center</option></select></label><label>Movement<select id="speaker-shot-mode" aria-label="Camera movement"><option value="hybrid">Motion + cuts</option><option value="cuts">Cuts only</option></select></label>';
 const nav=document.querySelector('.view-controls'),actions=document.createElement('div');actions.className='demo-options-actions';
 const replay=document.createElement('button');replay.id='speaker-replay';replay.type='button';replay.textContent='Replay same input';
 const edit=document.createElement('button');edit.type='button';edit.dataset.open='center';edit.textContent='Edit topic';edit.setAttribute('aria-label','Edit circle topic');
 actions.append(document.querySelector('#my-circle'),document.querySelector('#open-tune'),replay,edit);
 const hint=document.createElement('p');hint.className='speaker-hint';hint.textContent='Drag to look around. Pinch or use + / −. Your zoom stays yours.';
 const status=document.createElement('p');status.className='muted';status.id='demo-camera-status';
 panel.append(nav,toolbar,actions,hint,status,document.querySelector('.fixture-note'));header.append(toggle);app.append(panel);
 const topic=document.createElement('div');topic.className='speaker-topic';topic.innerHTML='<span></span>';stage.append(topic);
 let opened=false;
 function close(returnFocus=true){if(!opened)return;opened=false;panel.hidden=true;toggle.setAttribute('aria-expanded','false');scene.setOptionsOpen(false);if(returnFocus)toggle.focus({preventScroll:true});}
 function open(){opened=true;panel.hidden=false;toggle.setAttribute('aria-expanded','true');scene.setOptionsOpen(true);ink(panel);toolbar.querySelector('select').focus({preventScroll:true});}
 toggle.addEventListener('click',()=>opened?close():open());panel.querySelector('#demo-options-close').addEventListener('click',()=>close());
 document.addEventListener('pointerdown',e=>{if(opened&&!panel.contains(e.target)&&!toggle.contains(e.target))close(false);},true);
 document.addEventListener('focusin',e=>{if(opened&&!panel.contains(e.target)&&!toggle.contains(e.target))close(false);});
 panel.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const stops=[...panel.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);if((e.shiftKey&&e.target===stops[0])||(!e.shiftKey&&e.target===stops.at(-1))){e.preventDefault();close();}});
 document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}},true);
 panel.addEventListener('click',e=>{const target=e.target.closest('#open-tune,[data-open],#my-circle');if(!target)return;const tuning=target.id==='open-tune',center=target.dataset.open==='center';close(!tuning&&!center);if(tuning||center)requestAnimationFrame(()=>{const drawer=document.querySelector(tuning?'#tuning-panel':'#action-panel');drawer?.querySelector('input,textarea,button')?.focus({preventScroll:true});});});
 toolbar.querySelector('#speaker-shot-mode').addEventListener('change',e=>scene.setSpeakerShotMode(e.target.value));toolbar.querySelector('#speaker-framing-mode').addEventListener('change',e=>scene.setSpeakerFramingMode(e.target.value));
 replay.addEventListener('click',()=>{close();try{scene.replayComparison();}catch(e){hint.textContent=e.message;}});
 const audit=document.createElement('script');audit.type='application/json';audit.id='speaker-audit-state';document.body.append(audit);
 scene.holdZoomForStackLayout(true);requestAnimationFrame(()=>{scene.fitInitialStackView(112);if(new URLSearchParams(location.search).get('ownerFenceProbe')==='1'){scene.setTuning({inputMode:'conversation',pattern:'backforth'});scene.setSpeakerFramingMode('speaker');toolbar.querySelector('#speaker-framing-mode').value='speaker';scene.setView({...scene.getView(),yaw:0,pitch:Math.PI/4});hint.textContent='Owner-change probe · existing back-and-forth seed15741 · press Play';const badge=document.createElement('p');badge.className='probe-label';badge.textContent='Owner-change test · seed15741';stage.append(badge);}});new ResizeObserver(()=>scene.refreshViewport()).observe(topic);ink();let last=0;
 return {observe(){},render(frame,time){
  const state=getState(),room=state.rooms[state.joinedRoomId];topic.querySelector('span').textContent=room.center.text||room.name;topic.title=room.center.text||room.name;
  if(time-last<200)return;last=time;const s=scene.snapshot(),v=scene.viewMetrics();status.textContent=stage.querySelector('#browse-state').textContent;
  audit.textContent=JSON.stringify({movement:toolbar.querySelector('#speaker-shot-mode').value,centering:toolbar.querySelector('#speaker-framing-mode').value,optionsOpen:opened,oneScreen:true,audioOwners:1,secondaryRenderers:0,world:frame.world,camera:frame.camera,metrics:v,input:frame.input,speaker:frame.speaker,holder:frame.holder,activity:frame.activity,logical:frame.logical,running:frame.running,browsing:s.browsing,view:s.view,centeringState:s.steady?.centering,paint:s.paint,roster:roomMembers(state,room.id).map(p=>p.id),zoom:v.camera.zoom});
 }};
}
