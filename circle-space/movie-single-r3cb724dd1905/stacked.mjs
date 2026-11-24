import {createScene} from './scene.mjs';

export function mountStackedView({scene,getState,roomMembers}) {
  const main=document.querySelector('#main-layout'),stage=document.querySelector('#scene-stage');
  const bar=document.createElement('nav');bar.className='stack-toolbar';bar.setAttribute('aria-label','Simultaneous camera comparison');
  bar.innerHTML='<button id="stack-toggle" aria-pressed="false">Two views</button><button id="stack-replay">Replay same input</button><span>One circle · one audio</span><select id="dual-mode" aria-label="Camera movement"><option value="continuous">Independent E</option><option value="cuts">E + automatic cuts</option></select>';
  main.before(bar);
  const topic=document.createElement('div');topic.className='stack-topic';topic.innerHTML='<span></span><button data-open="center" aria-label="Edit shared center text">Edit topic</button>';main.before(topic);
  const host=document.createElement('div');host.id='stack-companion';host.setAttribute('role','group');host.setAttribute('aria-label','Camera 2 independent view');
  const shadow=host.attachShadow({mode:'open'});
  for(const link of document.querySelectorAll('head link[rel="stylesheet"]')){const copy=link.cloneNode();copy.href=link.href;shadow.append(copy);}
  const style=document.createElement('style');style.textContent=':host{display:block;position:relative;min-height:0;overflow:hidden}#scene-stage{position:absolute;inset:0;width:100%;height:100%;min-height:0}#scene-stage>*:not(canvas,#world-layer){display:none!important}.world-center,.room-navigation-label{display:none!important}.stack-pane-label{position:absolute;top:7px;left:12px;z-index:2400000;font-size:11px;background:#faf0e3c9;padding:2px 5px;border-radius:5px}.stack-media{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;object-fit:cover;mask-image:var(--portrait-mask);-webkit-mask-image:var(--portrait-mask)}';style.textContent+='.free-controls{position:absolute;right:7px;bottom:7px;z-index:2600000;display:flex;gap:4px}.free-controls button{min-width:38px;min-height:38px;font-size:13px}.free-controls button:last-child{font-size:11px}.free-controls button{border:1px solid #466649;border-radius:7px;background:#faf0e3e8;color:#263c2c}';shadow.append(style);
  const clone=stage.cloneNode(true);clone.querySelector('.ring').replaceChildren();clone.querySelector('#neighbors').replaceChildren();clone.querySelector('#centers').replaceChildren();clone.querySelectorAll('.room-navigation-label,video').forEach(e=>e.remove());clone.inert=true;shadow.append(clone);
  const label=document.createElement('span');label.className='stack-pane-label';label.textContent='Camera 2 · independent E';shadow.append(label);main.append(host);
  const passive=createScene({element:clone,getState,roomMembers,passive:true,independent:true});
  const audit=document.createElement('details');audit.className='stack-audit';audit.innerHTML='<summary>Two-view measurements</summary><pre id="stack-audit-state">Waiting for a frame</pre>';document.querySelector('.tuning-grid').append(audit);
  let enabled=false,lastAudit=-Infinity,lastFrame=null,lastReport=null;
  const mirrors=new Map();
  function mirrorMedia(){
    for(const seat of stage.querySelectorAll('.ring .seat')){
      const id=seat.dataset.person,video=seat.querySelector('video'),other=clone.querySelector(`.seat[data-person="${id}"] .photo`);if(!other)continue;
      let canvas=mirrors.get(id);
      if(video&&!video.hidden&&video.readyState>=2){if(!canvas){canvas=document.createElement('canvas');canvas.className='stack-media';canvas.width=180;canvas.height=180;other.append(canvas);mirrors.set(id,canvas);}canvas.hidden=false;canvas.getContext('2d').drawImage(video,0,0,180,180);}
      else if(canvas)canvas.hidden=true;
    }
    for(const[id,c]of mirrors)if(!clone.querySelector(`.seat[data-person="${id}"]`)){c.remove();mirrors.delete(id);}
  }
  function setEnabled(value){
    scene.holdZoomForStackLayout(Boolean(value));enabled=Boolean(value);main.classList.toggle('stacked',enabled);
    document.querySelector('#stack-toggle').setAttribute('aria-pressed',String(enabled));
    document.querySelector('#stack-toggle').textContent=enabled?'Single E view':'Two views';
    host.hidden=!enabled;
  }
  document.querySelector('#stack-toggle').onclick=()=>setEnabled(!enabled);
  document.querySelector('#stack-replay').onclick=()=>{try{scene.replayComparison({allowStackViewport:true});}catch(e){document.querySelector('#notice').textContent=e.message;}};
  function render(frame,time){
    lastFrame=frame;if(!frame.initialFitDone)return;
    const visible=enabled&&frame.view.kind==='circle';topic.hidden=!visible;const state=getState(),room=state.rooms[state.joinedRoomId];topic.querySelector('span').textContent=['text','both'].includes(room.center.mode)?room.center.text:room.topic||room.name;topic.querySelector('button').hidden=state.role!=='host';host.hidden=!visible;main.classList.toggle('stacked',visible);
    if(visible){lastReport=passive.renderShared(frame,time);mirrorMedia();}
    if(time-lastAudit<250)return;lastAudit=time;
    const primary=scene.viewMetrics(),secondary=visible?passive.viewMetrics():null;
    const extra=secondary?secondary.people.filter(p=>p.fraction>=.6&&primary.people.find(q=>q.id===p.id)?.fraction<.6).map(p=>p.id):[];
    const data={mode:visible?'two shared-world views':'single E view',geometry:'Fixed shared circle; independent E camera poses; cameras do not move seats',logical:frame.logical,running:frame.running,primary,secondary,extraVisibleInSecond:extra,input:frame.input,activity:frame.activity,sharedZoom:1/.24/frame.camera.distance,audioOwners:1,secondaryControllers:1,secondarySamplers:0,mirroredVideoCanvases:mirrors.size};
    document.querySelector('#stack-audit-state').textContent=JSON.stringify(data,null,2);
    bar.dataset.mode=visible?'stacked':'single';
  }
  const controls=document.createElement('div');controls.className='free-controls';controls.innerHTML='<button aria-label="Zoom camera 2 in">+</button><button aria-label="Zoom camera 2 out">−</button><button aria-label="Resume camera 2 automatic focus">Auto</button>';shadow.append(controls);
  controls.children[0].onclick=()=>passive.zoomView(1.2);controls.children[1].onclick=()=>passive.zoomView(1/1.2);controls.children[2].onclick=()=>passive.resumeView();
  let drag=null;host.addEventListener('pointerdown',e=>{if(e.composedPath().some(x=>x.tagName==='BUTTON'))return;drag={x:e.clientX,y:e.clientY};passive.beginNavigation();host.setPointerCapture(e.pointerId);});
  host.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;passive.panView(dx*.006,dy*.005);drag={x:e.clientX,y:e.clientY};});host.addEventListener('pointerup',()=>{drag=null;passive.endNavigation();});host.addEventListener('pointercancel',()=>{drag=null;passive.endNavigation();});
  document.querySelector('#dual-mode').onchange=e=>scene.setDualMode(e.target.value);
  const adaptive=document.querySelector('#adaptive-oval');adaptive.hidden=true;adaptive.checked=false;adaptive.parentElement.childNodes.forEach(n=>{if(n.nodeType===3)n.textContent='Fixed shared circle · only cameras move';});
  if(adaptive.parentElement.nextElementSibling)adaptive.parentElement.nextElementSibling.textContent='Each E camera has its own view. Seat geometry stays fixed in this trial.';
  // The first requested mobile comparison opens with two panes; no automatic zoom command.
  setEnabled(true);
  requestAnimationFrame(()=>scene.fitInitialStackView(100));
  return Object.freeze({render,observe:e=>passive.observeShared(e)});
}
