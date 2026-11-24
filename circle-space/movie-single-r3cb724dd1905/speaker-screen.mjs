export function mountSpeakerScreen({scene,getState,roomMembers}){
 const main=document.querySelector('#main-layout'),toolbar=document.createElement('div');toolbar.className='speaker-toolbar';
 toolbar.innerHTML='<label>Speaker view <select id="speaker-shot-mode" aria-label="Speaker camera rule"><option value="fixed">Keep angle + center</option><option value="best">Automatic angle cuts</option></select></label><button id="speaker-replay" type="button">Replay</button>';
 const topic=document.createElement('div');topic.className='speaker-topic';topic.innerHTML='<span></span><button type="button" data-open="center" aria-label="Edit circle topic">Edit topic</button>';
 const hint=document.createElement('div');hint.className='speaker-hint';hint.textContent='One circle · drag to look around · zoom stays yours';
 main.before(toolbar,topic,hint);const audit=document.createElement('script');audit.type='application/json';audit.id='speaker-audit-state';document.body.append(audit);
 toolbar.querySelector('select').addEventListener('change',e=>scene.setSpeakerShotMode(e.target.value));
 toolbar.querySelector('button').addEventListener('click',()=>{try{scene.replayComparison();}catch(e){hint.textContent=e.message;}});
 scene.holdZoomForStackLayout(true);requestAnimationFrame(()=>scene.fitInitialStackView(112));let last=0;
 return {observe(){},render(frame,time){
  const state=getState(),room=state.rooms[state.joinedRoomId];topic.querySelector('span').textContent=room.center.text||room.name;
  if(time-last<200)return;last=time;const s=scene.snapshot(),v=scene.viewMetrics();
  audit.textContent=JSON.stringify({mode:toolbar.querySelector('select').value,oneScreen:true,audioOwners:1,secondaryRenderers:0,world:frame.world,camera:frame.camera,metrics:v,input:frame.input,speaker:frame.speaker,holder:frame.holder,activity:frame.activity,logical:frame.logical,running:frame.running,browsing:s.browsing,view:s.view,paint:s.paint,roster:roomMembers(state,room.id).map(p=>p.id),zoom:v.camera.zoom});
 }};
}
