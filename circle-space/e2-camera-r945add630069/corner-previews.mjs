/** Passive previews of one existing world/source; never create a media stream or clock. */
import {cornerRoomOverview,joinedCircleOverview} from './corner-map-model.mjs';
import {ink} from './ink.mjs';
const NS='http://www.w3.org/2000/svg',portrait=key=>'../baseline/portraits/'+key+'.webp';
const expandIcon='<svg class="corner-expand" viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3h6v6M17 3l-8 8M8 4H3v13h13v-5"/></svg>';
const svg=(name,attrs={})=>{const node=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));return node;};
export function mountCornerPreviews({getState,getAnchors,getCall=()=>({camera:true}),mapAction}){
 const stage=document.querySelector('#scene-stage'),controls=document.querySelector('.view-controls');
 const wrapper=document.createElement('aside');wrapper.id='corner-previews';wrapper.setAttribute('aria-label','Corner previews');
 const map=document.createElement('button');map.type='button';map.id='corner-map';map.className='corner-preview corner-map';map.setAttribute('aria-describedby','corner-map-summary');map.innerHTML='<svg class="corner-room-diagram" viewBox="0 0 100 76" aria-hidden="true"></svg><span class="corner-map-caption"><span>Map</span>'+expandIcon+'</span><span id="corner-map-summary" class="corner-sr-only"></span>';
 const diagram=map.querySelector('.corner-room-diagram'),summary=map.querySelector('#corner-map-summary'),caption=map.querySelector('.corner-map-caption>span');
 const self=document.createElement('button');self.type='button';self.id='corner-self';self.className='corner-preview corner-self';self.setAttribute('aria-label','Open your preview');self.setAttribute('aria-haspopup','dialog');self.setAttribute('aria-expanded','false');self.innerHTML='<span class="corner-self-media"><img class="corner-self-photo" alt=""><canvas class="corner-self-canvas" width="320" height="320" hidden></canvas></span><span class="corner-self-label"></span>';
 const back=document.createElement('button');back.type='button';back.id='corner-map-back';back.className='corner-map-back';back.hidden=true;back.textContent='← Back';back.setAttribute('aria-label','Back to circle');controls.prepend(back);
 const dialog=document.createElement('dialog');dialog.id='corner-self-dialog';dialog.setAttribute('aria-labelledby','corner-self-title');dialog.setAttribute('aria-describedby','corner-self-description');dialog.innerHTML='<button type="button" class="corner-dialog-close" aria-label="Close your preview">×</button><h2 id="corner-self-title">Your preview</h2><div class="corner-closeup-media"><img alt=""><canvas width="640" height="640" hidden></canvas></div><p id="corner-self-description"></p>';
 document.body.append(dialog);const slots={};for(const [key,preview,label]of [['map',map,'Map'],['self',self,'You']]){const slot=document.createElement('div');slot.id='corner-'+key+'-slot';slot.className='corner-preview-slot';slot.dataset.collapsed='false';const minimize=document.createElement('button');minimize.type='button';minimize.className='corner-minimize';minimize.id='corner-minimize-'+key;minimize.textContent='−';minimize.setAttribute('aria-label','Minimize '+label+' preview');minimize.setAttribute('aria-controls',preview.id);const restore=document.createElement('button');restore.type='button';restore.className='corner-restore';restore.id='corner-restore-'+key;restore.textContent=label+' +';restore.setAttribute('aria-label','Restore '+label+' preview');restore.hidden=true;slot.append(preview,minimize,restore);slots[key]={slot,preview,minimize,restore};wrapper.append(slot);minimize.onclick=()=>setCollapsed(key,true);restore.onclick=()=>setCollapsed(key,false);}stage.append(wrapper);document.body.dataset.cornerComparison='true';
 const phone=matchMedia('(max-width:699px)');let latestView=null,latestComparison=null,latestRunning=false,lastKey='',anchorsDirty=true,diagramKey='',latestSelf=null;
 map.onclick=()=>{const wasMap=latestView?.kind==='map';mapAction();if(wasMap)requestAnimationFrame(()=>{if(!wrapper.hidden)map.focus({preventScroll:true});});};
 back.onclick=()=>map.click();
 self.onclick=()=>{if(!latestSelf)return;updateSelf(latestSelf);dialog.showModal();self.setAttribute('aria-expanded','true');dialog.querySelector('.corner-dialog-close').focus();};
 const closeSelf=()=>{if(dialog.open)dialog.close();};dialog.querySelector('.corner-dialog-close').onclick=closeSelf;
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeSelf();});
 dialog.addEventListener('close',()=>{self.setAttribute('aria-expanded','false');if(!self.hidden&&!wrapper.hidden)self.focus({preventScroll:true});});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSelf();});
 // Window capture prevents the app's existing document Escape handler from changing a panel behind the modal.
 window.addEventListener('keydown',event=>{if(dialog.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeSelf();}},true);
 wrapper.addEventListener('pointerdown',event=>event.stopPropagation());wrapper.addEventListener('wheel',event=>event.stopPropagation());
 for(const id of ['arrangement','room-spacing','room-scale','world-rotation','circle-spacing'])for(const type of ['input','change'])document.getElementById(id)?.addEventListener(type,()=>{anchorsDirty=true;sync();});
 phone.addEventListener('change',()=>{placePreviews();sync();});
 function setCollapsed(key,value){const entry=slots[key];entry.slot.dataset.collapsed=String(value);entry.preview.hidden=value;entry.minimize.hidden=value;entry.restore.hidden=!value;wrapper.dataset.allCollapsed=String(Object.values(slots).every(item=>item.slot.dataset.collapsed==='true'));if(value)entry.restore.focus({preventScroll:true});else entry.minimize.focus({preventScroll:true});}
 function placePreviews(){const dock=document.querySelector('.call-dock');if(phone.matches){document.querySelector('#app').insertBefore(wrapper,document.body.dataset.previewPlacement==='top'?document.querySelector('#main-layout'):dock);}else stage.append(wrapper);}
 for(const type of ['input','change'])document.querySelector('#demo-preview-placement')?.addEventListener(type,placePreviews);
 placePreviews();
 function paintMap(model){
  diagram.replaceChildren();const defs=svg('defs');diagram.append(defs);
  for(const room of [...model.rooms].sort((a,b)=>Number(a.current)-Number(b.current))){
   const full=room.status==='open'&&room.count>=room.capacity,group=svg('g',{'data-room':room.id,'data-status':room.status,'data-full':full});group.classList.toggle('current-room',room.current);group.classList.toggle('empty-room',!room.count);
   const ring=svg('circle',{class:'corner-room-ring',cx:room.cx,cy:room.cy,r:room.r}),count=svg('text',{class:'corner-room-count',x:room.cx,y:room.cy+.3}),title=svg('title');count.textContent=String(room.count);title.textContent=room.name+' · '+room.count+' of '+room.capacity+(room.current?' · Your circle':'')+(room.status==='locked'?' · Locked':full?' · Full':room.count?' · Open':' · Empty, open');group.append(ring,count,title);
   room.members.forEach((person,i)=>{if(!person.portraitKey)return;const angle=-Math.PI/2+i*Math.PI*2/room.members.length,r=Math.min(4,Math.max(3.5,Math.PI*room.r/Math.max(1,room.count)*.9)),x=room.cx+room.r*.94*Math.cos(angle),y=room.cy+room.r*.94*Math.sin(angle),id='corner-room-'+room.id+'-'+i,clip=svg('clipPath',{id});clip.append(svg('circle',{cx:x,cy:y,r}));defs.append(clip);const image=svg('image',{'data-room-person':person.id,x:x-r,y:y-r,width:r*2,height:r*2,preserveAspectRatio:'xMidYMid slice','clip-path':'url(#'+id+')',href:portrait(person.portraitKey)});group.append(image);});
   if(room.status==='locked'){const lock=svg('g',{class:'corner-room-lock',transform:'translate('+room.cx+','+(room.cy+room.r+6)+')'});lock.append(svg('rect',{x:-2,y:-1,width:4,height:3.8,rx:.5}),svg('path',{d:'M-1.2-1v-1.2a1.2 1.2 0 0 1 2.4 0V-1'}));group.append(lock);}
   if(full){const badge=svg('text',{class:'corner-room-full',x:room.cx,y:room.cy+room.r+7});badge.textContent='Full';group.append(badge);}
   diagram.append(group);
  }
  const current=model.rooms.find(r=>r.current);caption.textContent='Map';summary.textContent=(model.breakoutCount?model.breakoutCount+' breakout circles. ':'No breakout circles. ')+model.rooms.map(r=>r.name+': '+r.count+(r.status==='locked'?', locked':r.count>=r.capacity?', full':r.count?'':', empty, open')).join('. ')+'. Expand map for details.';map.setAttribute('aria-label','Expand map'+(current?' from '+current.name:''));map.title='Expand map';map.dataset.breakoutCount=String(model.breakoutCount);
 }
 function paintJoined(model){
  const key=JSON.stringify(model.people.map(p=>[p.id,p.name,p.portraitKey]));
  if(diagramKey!==key){diagram.replaceChildren();const defs=svg('defs');diagram.append(defs);
   model.people.forEach((p,i)=>{const angle=-Math.PI/2+i*Math.PI*2/model.people.length,cx=50+30*Math.cos(angle),cy=38+30*Math.sin(angle),r=Math.min(11,Math.max(3.3,Math.PI*30/Math.max(1,model.people.length)*.9));
    const clipId='corner-joined-portrait-'+i,clip=svg('clipPath',{id:clipId});clip.append(svg('circle',{cx,cy,r}));defs.append(clip);
    const group=svg('g',{'data-person':p.id}),halo=svg('circle',{class:'corner-speaking-halo',cx,cy,r:r+1.3}),image=svg('image',{x:cx-r,y:cy-r,width:r*2,height:r*2,preserveAspectRatio:'xMidYMid slice','clip-path':'url(#'+clipId+')'}),title=svg('title');if(p.portraitKey)image.setAttribute('href',portrait(p.portraitKey));title.textContent=p.name;group.append(halo,image,title);diagram.append(group);
   });diagramKey=key;
  }
  for(const p of model.people){const node=[...diagram.querySelectorAll('[data-person]')].find(n=>n.dataset.person===p.id);node.dataset.active=String(p.active);node.dataset.level=String(p.level);node.dataset.owner=String(model.owner===p.id);node.style.setProperty('--activity-level',String(p.level));}
  caption.textContent='Your circle';summary.textContent=model.roomName+'. '+model.people.length+' people. '+model.people.filter(p=>p.active).map(p=>p.name+' speaking').join(', ')+'. Return to your circle.';map.setAttribute('aria-label','Return to your circle, '+model.roomName);map.title='Return to your circle';
 }
 function updateSelf(person){
  slots.self.slot.hidden=!person;self.hidden=!person||slots.self.slot.dataset.collapsed==='true';if(!person)return;latestSelf=person;
  const cameraOn=getCall().camera!==false,video=document.querySelector('#participants .seat[data-person="'+person.id+'"] video'),hasFrame=Boolean(cameraOn&&video&&!video.hidden&&video.readyState>=2&&video.videoWidth);
  const sourceKind=hasFrame?'existing-video':'portrait';self.dataset.mediaSource=sourceKind;dialog.dataset.mediaSource=sourceKind;
  for(const container of [self,dialog]){const image=container.querySelector('img'),canvas=container.querySelector('canvas'),src=portrait(person.portraitKey);if(image.getAttribute('src')!==src)image.src=src;image.alt=person.name+(person.sample?', sample portrait':'');image.hidden=hasFrame;canvas.hidden=!hasFrame;if(hasFrame)canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);}
  self.querySelector('.corner-self-label').textContent=person.name+(person.sample?' · sample':'')+' ↗';dialog.querySelector('p').textContent=person.name+(person.sample?(hasFrame?' · sample video':' · sample portrait'):(hasFrame?' · camera preview':' · portrait'))+(cameraOn?'':' · camera off');
 }
 function sync(frame={}){
  if(frame.view)latestView=frame.view;if(frame.comparison)latestComparison=frame.comparison;if(frame.running!==undefined)latestRunning=frame.running;
  const state=getState(),isMap=latestView?.kind==='map';wrapper.hidden=false;back.hidden=!isMap;map.dataset.mode=isMap?'return':'map';map.setAttribute('aria-expanded',String(isMap));
  const key=JSON.stringify({view:isMap,rooms:Object.values(state.rooms).map(r=>[r.id,r.name,r.status,r.capacity,r.anchor]),members:Object.values(state.persons).map(p=>[p.id,p.name,p.roomId,p.seatIndex,p.portraitKey,p.sample]),joined:state.joinedRoomId,user:state.userId});
  if(isMap){if(key!==lastKey)diagramKey='';const joined=joinedCircleOverview(state,{comparison:latestComparison,running:latestRunning});paintJoined(joined);map.dataset.room=joined.roomId;map.dataset.logicalTime=String(joined.logicalTime);map.dataset.source=joined.source||'';map.dataset.owner=joined.owner||'';map.dataset.running=String(joined.running);}
  else if(key!==lastKey||anchorsDirty){paintMap(cornerRoomOverview(state,getAnchors()));anchorsDirty=false;diagramKey='';}
  lastKey=key;updateSelf(cornerRoomOverview(state).self);
 }
 sync();ink(map);ink(self);ink(back);for(const entry of Object.values(slots)){ink(entry.restore);}return Object.freeze({sync});
}
