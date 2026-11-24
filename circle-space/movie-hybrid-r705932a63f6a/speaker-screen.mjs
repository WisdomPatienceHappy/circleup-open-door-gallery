export function mountSpeakerScreen({scene,getState,roomMembers}){
 const main=document.querySelector('#main-layout'),toolbar=document.createElement('div');toolbar.className='speaker-toolbar';
 toolbar.innerHTML='<label><select id="speaker-framing-mode" aria-label="Circle centering"><option value="circle">Circle centered</option><option value="speaker">Circle off-center</option></select></label><label><select id="speaker-shot-mode" aria-label="Camera movement"><option value="hybrid">Motion + cuts</option><option value="cuts">Cuts only</option></select></label><button id="speaker-replay" type="button">Replay</button>';
 const topic=document.createElement('div');topic.className='speaker-topic';topic.innerHTML='<span></span><button type="button" data-open="center" aria-label="Edit circle topic">Edit topic</button>';
 const hint=document.createElement('div');hint.className='speaker-hint';hint.textContent='One circle · drag to look around · zoom stays yours';
 main.before(toolbar,topic,hint);const audit=document.createElement('script');audit.type='application/json';audit.id='speaker-audit-state';document.body.append(audit);
 toolbar.querySelector('#speaker-shot-mode').addEventListener('change',e=>scene.setSpeakerShotMode(e.target.value));
 toolbar.querySelector('#speaker-framing-mode').addEventListener('change',e=>scene.setSpeakerFramingMode(e.target.value));
 toolbar.querySelector('button').addEventListener('click',()=>{try{scene.replayComparison();}catch(e){hint.textContent=e.message;}});
 scene.holdZoomForStackLayout(true);requestAnimationFrame(()=>{scene.fitInitialStackView(112);if(new URLSearchParams(location.search).get('ownerFenceProbe')==='1'){scene.setTuning({inputMode:'conversation',pattern:'backforth'});scene.setView({...scene.getView(),yaw:Math.PI/2,pitch:33.5*Math.PI/180});hint.textContent='Owner-change probe · existing back-and-forth seed15741 · press Play';}});let last=0;
 return {observe(){},render(frame,time){
  const state=getState(),room=state.rooms[state.joinedRoomId];topic.querySelector('span').textContent=room.center.text||room.name;
  if(time-last<200)return;last=time;const s=scene.snapshot(),v=scene.viewMetrics();
  audit.textContent=JSON.stringify({movement:toolbar.querySelector('#speaker-shot-mode').value,centering:toolbar.querySelector('#speaker-framing-mode').value,oneScreen:true,audioOwners:1,secondaryRenderers:0,world:frame.world,camera:frame.camera,metrics:v,input:frame.input,speaker:frame.speaker,holder:frame.holder,activity:frame.activity,logical:frame.logical,running:frame.running,browsing:s.browsing,view:s.view,centeringState:s.steady?.centering,paint:s.paint,roster:roomMembers(state,room.id).map(p=>p.id),zoom:v.camera.zoom});
 }};
}
