/** Tiny optional desktop overlays: no extra scene, camera controller, audio source or transport. */
import {cornerRoomOverview} from './corner-map-model.mjs';
import {ink} from './ink.mjs';
const NS='http://www.w3.org/2000/svg';
const expandIcon='<svg class="corner-expand" viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3h6v6M17 3l-8 8M8 4H3v13h13v-5"/></svg>';
export function mountCornerPreviews({getState,getAnchors,mapAction}){
 const stage=document.querySelector('#scene-stage'),controls=document.querySelector('.view-controls');
 const wrapper=document.createElement('aside');wrapper.id='corner-previews';wrapper.setAttribute('aria-label','Corner previews');
 const map=document.createElement('button');map.type='button';map.id='corner-map';map.className='corner-preview corner-map';map.setAttribute('aria-label','Expand breakout map');map.setAttribute('aria-describedby','corner-map-summary');map.innerHTML='<svg class="corner-room-diagram" viewBox="0 0 100 76" aria-hidden="true"></svg><span class="corner-map-caption"><span>Map</span>'+expandIcon+'</span><span id="corner-map-summary" class="corner-sr-only"></span>';
 const diagram=map.querySelector('.corner-room-diagram'),summary=map.querySelector('#corner-map-summary');
 const self=document.createElement('div');self.id='corner-self';self.className='corner-preview corner-self';self.setAttribute('role','group');self.setAttribute('aria-label','Your self preview');self.innerHTML='<img class="corner-self-photo" alt=""><span class="corner-self-label"></span>';
 const back=document.createElement('button');back.type='button';back.id='corner-map-back';back.className='corner-map-back';back.hidden=true;back.textContent='← Back';back.setAttribute('aria-label','Back to circle');controls.prepend(back);
 wrapper.append(map,self);stage.append(wrapper);document.body.dataset.cornerComparison='true';
 const wide=matchMedia('(min-width:900px)');let latestView=null,lastKey='',anchorsDirty=true;
 map.onclick=()=>mapAction();back.onclick=()=>{mapAction();requestAnimationFrame(()=>{if(!wrapper.hidden)map.focus({preventScroll:true});});};
 // Buttons are overlays, not scene drag/pinch targets.
 wrapper.addEventListener('pointerdown',event=>event.stopPropagation());
 wrapper.addEventListener('wheel',event=>event.stopPropagation());
 for(const id of ['arrangement','room-spacing','room-scale','world-rotation','circle-spacing']){
  const control=document.getElementById(id);for(const type of ['input','change'])control?.addEventListener(type,()=>{anchorsDirty=true;sync(latestView);});
 }
 wide.addEventListener('change',()=>sync(latestView));
 function paint(model){
  diagram.replaceChildren();
  // Paint the current room last so its highlight is never lost behind another cluster.
  for(const room of [...model.rooms].sort((a,b)=>Number(a.current)-Number(b.current))){
   const group=document.createElementNS(NS,'g');group.dataset.room=room.id;group.dataset.status=room.status;group.classList.toggle('current-room',room.current);
   const ring=document.createElementNS(NS,'circle');ring.setAttribute('cx',String(room.cx));ring.setAttribute('cy',String(room.cy));ring.setAttribute('r',String(room.r));
   const count=document.createElementNS(NS,'text');count.setAttribute('x',String(room.cx));count.setAttribute('y',String(room.cy+.3));count.textContent=String(room.count);
   const title=document.createElementNS(NS,'title');title.textContent=room.name+' · '+room.count+(room.current?' · Your circle':'')+(room.status==='locked'?' · Locked':'');
   group.append(title,ring,count);diagram.append(group);
  }
  const current=model.rooms.find(room=>room.current),details=model.rooms.map(room=>room.name+': '+room.count+(room.current?' (your circle)':'')+(room.status==='locked'?' (locked)':'')).join('; ');
  const intro=model.breakoutCount?model.breakoutCount+' breakout '+(model.breakoutCount===1?'room':'rooms'):'No breakout rooms yet';
  summary.textContent=intro+'. '+details+'. Expand map for room names and details.';map.title=intro+'. Expand map';map.dataset.breakoutCount=String(model.breakoutCount);map.setAttribute('aria-label','Expand map'+(current?' from '+current.name:''));
  self.hidden=!model.self;
  if(model.self){const image=self.querySelector('img'),src='../baseline/portraits/'+model.self.portraitKey+'.webp';if(image.getAttribute('src')!==src)image.src=src;image.alt=model.self.name+(model.self.sample?', sample portrait':'');self.querySelector('.corner-self-label').textContent=model.self.name+(model.self.sample?' · sample':'');}
 }
 function sync(view){
  if(view)latestView=view;const state=getState();const isMap=latestView?.kind==='map';
  wrapper.hidden=!wide.matches||isMap||!document.querySelector('#inspect-card').hidden;
  back.hidden=!wide.matches||!isMap;map.setAttribute('aria-expanded',String(Boolean(isMap)));
  const records=Object.values(state.rooms).map(room=>[room.id,room.name,room.status,room.anchor]);
  const membership=Object.values(state.persons).map(person=>[person.id,person.roomId,person.portraitKey,person.sample]);
  const key=JSON.stringify([state.joinedRoomId,state.userId,records,membership]);
  if(key!==lastKey||anchorsDirty){lastKey=key;anchorsDirty=false;paint(cornerRoomOverview(state,getAnchors()));}
 }
 sync();ink(map);ink(back);
 return Object.freeze({sync,markAnchorsDirty(){anchorsDirty=true;}});
}
