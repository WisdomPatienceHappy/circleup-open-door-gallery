import {roomAnchor,seatPoints,projectPoint,fitWorldCamera} from './geometry/world.mjs';
import {createAttentionController} from './cinematic-attention/controller.mjs';
import {centerSizing} from './geometry/center.mjs';
import {placeRoomLabels} from './geometry/labels.mjs';
import {placeRoomPopup,popupBlocker} from './geometry/popup.mjs';
import {fitProjectedEnvelope} from './geometry/framing.mjs';
const plane=depth=>Math.round(depth*1000)/1000;
const RAD=Math.PI/180,BASE=1/.24,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// Host off-axis landing projection: shared by rendering and policy callbacks.
function projectScenePoint(point,frame,screen){const q=projectPoint(point,frame,screen),o=frame.screenOffset??{x:0,y:0};return{...q,x:q.x+o.x,y:q.y+o.y};}
export function createScene({element,getState,roomMembers,onInspect,onPerson,onView}){
 const layer=element.querySelector('#world-layer'),list=element.querySelector('.ring'),neighbors=element.querySelector('#neighbors'),centers=element.querySelector('#centers'),canvas=element.querySelector('canvas'),ctx=canvas.getContext('2d');
 const layout={arrangement:'arc',spacing:1.14,roomScale:.25,rotation:0},tuning={faceSize:1.75,circleSpacing:1.4,basePitch:38*RAD,centerMode:'world',centerSize:1,baseZoom:1,viewMode:'recency',pattern:'mixed',turnSpeed:1};
 let camera={yaw:0,pitch:tuning.basePitch,distance:BASE,target:{x:0,y:0,z:0},screenOffset:{x:0,y:0}},width=1,height=1,focal=1,browsing=false,editing=false,selection=false,dirty=true,rosterKey='',speaker=null,holder=null,running=false,logical=0,deadline=0,sequence,cinematic,priorTime=0,usefulBase=1,initialView=true,records=new Map(),centerNodes=new Map(),centerDimensions=new Map(),selectedIds=[],planMetrics=null;
 const seats=new Map(),labelNodes=new Map();let renderedLabels=[],popupPlacement=null,popupNatural=null,landingFit=null,framingRequest=0,framingForce=false,pendingFraming=false,lastFramingSignature='';
 const paint=CircleUpPortraitPaint.create({getSeats:()=>[...seats.values()].map(v=>v.element),getId:s=>s.dataset.person,getSpeaker:()=>speaker,getHolder:()=>holder});
 const visibleRooms=()=>Object.values(getState().rooms).filter(r=>!['hidden','ended'].includes(r.status));
 function bounds(){return{width,height,focal,padding:18};}
 function anchor(r){const a=roomAnchor(r,layout);if(r.id===getState().joinedRoomId){a.radius=tuning.circleSpacing;a.yaw=layout.rotation;}return a;}
 function worldPoints(room,n){if(!n)return[];const a=anchor(room),c=Math.cos(a.yaw),s=Math.sin(a.yaw);return seatPoints(n,a.radius).map(([x,y,z])=>[a.x+x*c+z*s,a.y+y,a.z-x*s+z*c]);}
 function diameter(n,joined){return(n<=7?.52+.045*(7-n):.52*(7/n)**.77)*tuning.faceSize*(joined?1:layout.roomScale);}
 function projection(point,frame=camera){return projectScenePoint(point,frame,bounds());}
 function currentFrame(){return{yaw:camera.yaw,pitch:camera.pitch,zoom:BASE/camera.distance};}
 function frameCamera(f){return{...camera,yaw:f.yaw,pitch:f.pitch,distance:BASE/f.zoom};}
 function captureRoster(){
  const state=getState(),joined=roomMembers(state,state.joinedRoomId),key=state.joinedRoomId+'|'+joined.map(p=>p.id).join('|');
  if(rosterKey!==key){
   for(const[id,node]of seats)if(!joined.some(p=>p.id===id)){node.element.remove();seats.delete(id);}
   for(const p of joined)if(!seats.has(p.id)){
    const li=document.createElement('li');li.className='seat';li.dataset.person=p.id;li.tabIndex=0;li.setAttribute('role','button');li.setAttribute('aria-label',p.name);li.innerHTML=`<span class="photo"><img alt="" draggable="false" src="../baseline/portraits/${p.portraitKey}.webp"></span><span class="name"></span>`;li.querySelector('.name').textContent=p.name;list.append(li);seats.set(p.id,{element:li});
   }
   rosterKey=key;speaker=joined[0]?.id??null;holder=joined.at(-1)?.id??null;sequence=null;logical=0;deadline=0;cinematic?.reset();
  }
  const wanted=new Set();for(const room of visibleRooms())if(room.id!==state.joinedRoomId){const people=roomMembers(state,room.id);for(const p of people){const id=p.id;wanted.add(id);if(!records.has(id)){
   const el=document.createElement('button');el.className='neighbor-person';el.dataset.room=room.id;el.dataset.person=p.id;el.setAttribute('aria-label',`Inspect ${room.name}, sample portrait of ${p.name}`);el.innerHTML=`<span class="photo"><img alt="" draggable="false" src="../baseline/portraits/${p.portraitKey}.webp"></span>`;neighbors.append(el);records.set(id,{element:el,roomId:room.id});
  }const current=records.get(id);current.roomId=room.id;current.element.dataset.room=room.id;current.element.setAttribute('aria-label',`Inspect ${room.name}, sample portrait of ${p.name}`);}}
  for(const[id,r]of records)if(!wanted.has(id)){r.element.remove();records.delete(id);}
  for(const room of visibleRooms())if(!centerNodes.has(room.id)){const el=document.createElement('div');el.className='world-center';el.dataset.room=room.id;centers.append(el);centerNodes.set(room.id,el);}
  for(const[id,el]of centerNodes)if(!visibleRooms().some(r=>r.id===id)){el.remove();centerNodes.delete(id);}
  for(const room of visibleRooms())if(!labelNodes.has(room.id)){const el=document.createElement('button');el.className='room-navigation-label';el.dataset.inspect=room.id;el.setAttribute('aria-label','Inspect '+room.name);layer.append(el);labelNodes.set(room.id,el);}
  for(const[id,el]of labelNodes)if(!centerNodes.has(id)){el.remove();labelNodes.delete(id);}
  refreshCenters();rebuildPlanner();dirty=true;
 }
 function measureCenter(el){const hidden=el.hidden,visibility=el.style.visibility;el.style.visibility='hidden';el.hidden=false;const size={width:el.offsetWidth,height:el.offsetHeight};el.hidden=hidden;el.style.visibility=visibility;return size;}
 function refreshCenters(){const state=getState();for(const room of visibleRooms()){
  const el=centerNodes.get(room.id),joined=room.id===state.joinedRoomId,c=room.center;el.dataset.joined=String(joined);el.dataset.centerMode=c.mode;
  if(el.querySelector('.inline-center-form'))continue;
  el.replaceChildren();
  if(['image','both'].includes(c.mode)&&c.imageUrl){const img=document.createElement('img');img.src=c.imageUrl;img.draggable=false;img.alt='Local circle centerpiece';el.append(img);}
  const button=document.createElement('button');button.dataset.centerRoom=room.id;
  if(joined){button.textContent=['text','both'].includes(c.mode)?c.text:state.role==='host'?'Add a topic':'';button.setAttribute('aria-label',state.role==='host'?'Edit center text':c.text||'Circle centerpiece');button.disabled=state.role!=='host';button.hidden=c.mode==='empty'&&state.role!=='host';if(state.role==='host'){const hint=document.createElement('span');hint.className='edit-pencil';hint.textContent='✎';button.append(hint);}}
  else{button.textContent=room.name;button.setAttribute('aria-label','Inspect '+room.name);const small=document.createElement('small');small.textContent=roomMembers(state,room.id).length+' / '+room.capacity+(room.status==='locked'?' · Locked':'');button.append(small);}
  el.append(button);centerDimensions.set(room.id,measureCenter(el));
 }}
 function selectedProjection(){
  const state=getState(),people=roomMembers(state,state.joinedRoomId),world=worldPoints(state.rooms[state.joinedRoomId],people.length),positions=new Map(people.map((p,i)=>[p.id,world[i]])),ids=[...seats.keys()],screen={...bounds()},target={...camera.target},screenOffset={...(camera.screenOffset??{x:0,y:0})},worldDiameter=diameter(people.length,true);
  return{ids,project(id,f){const q=projectScenePoint(positions.get(id),{yaw:f.yaw,pitch:f.pitch,distance:BASE/f.zoom,target,screenOffset},screen);return{...q,depth:plane(q.depth),diameter:worldDiameter*q.scale,paintPadding:Math.max(worldDiameter*q.scale*.12+3,31)};}};
 }
 function usableBounds(){
  const stage=element.getBoundingClientRect(),b={left:-width/2+12,right:width/2-12,top:-height/2+12,bottom:height/2-12};
  for(const selector of ['#navigation-help','#browse-state','#topic-nav','#sample-caption','#zoom-rail']){const el=element.querySelector(selector);if(!el||el.hidden)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const top=r.top-stage.top,bottom=r.bottom-stage.top,left=r.left-stage.left;
   if(selector==='#zoom-rail')b.right=Math.min(b.right,left-width/2-8);
   else if(selector==='#topic-nav'||selector==='#sample-caption')b.bottom=Math.min(b.bottom,top-height/2-8);
   else b.top=Math.max(b.top,bottom-height/2+8);
  }
  return b;
 }
 function computeUsefulBase(){
  if(width<40||height<40||!seats.size){landingFit={fits:!seats.size,zoom:.08,offset:{x:0,y:0},reason:'unmeasured-or-empty'};return .08;}
  const state=getState(),people=roomMembers(state,state.joinedRoomId),a=anchor(state.rooms[state.joinedRoomId]),world=worldPoints(state.rooms[state.joinedRoomId],people.length),worldDiameter=diameter(people.length,true),b=usableBounds(),target={x:a.x,y:a.y,z:a.z};
  if(b.left>=b.right||b.top>=b.bottom){landingFit={fits:false,zoom:.08,offset:{x:0,y:0},reason:'no-unobstructed-viewport',bounds:b};return .08;}
  // A pooled native name probe measures both its backing and painted glyph range
  // at each landing candidate. It is outside .ring and never enters media/paint rosters.
  const probe=document.createElement('li');probe.className='seat';probe.setAttribute('aria-hidden','true');probe.style.cssText='position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';const name=document.createElement('span');name.className='name';probe.append(name);layer.append(probe);
  const projected=z=>world.map((point,i)=>{const q=projectScenePoint(point,{yaw:0,pitch:tuning.basePitch,distance:BASE/z,target,screenOffset:{x:0,y:0}},bounds());if(!q.visible)return{visible:false};const d=worldDiameter*q.scale,pad=Math.max(d*.12+3,31),rect={left:q.x-d/2-pad,right:q.x+d/2+pad,top:q.y-d/2-pad,bottom:q.y+d/2+pad};
   if(people.length<=10||people[i].id===speaker||people[i].id==='you'){probe.style.setProperty('--size',d+'px');name.textContent=people[i].name;const seatRect=probe.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(name);for(const r of [name.getBoundingClientRect(),range.getBoundingClientRect()]){rect.left=Math.min(rect.left,q.x+r.left-seatRect.left-d/2);rect.right=Math.max(rect.right,q.x+r.right-seatRect.left-d/2);rect.top=Math.min(rect.top,q.y+r.top-seatRect.top-d/2);rect.bottom=Math.max(rect.bottom,q.y+r.bottom-seatRect.top-d/2);}}
   return rect;
  });
  try{const ds=world.map(point=>worldDiameter*projectScenePoint(point,{yaw:0,pitch:tuning.basePitch,distance:BASE,target,screenOffset:{x:0,y:0}},bounds()).scale).sort((a,b)=>a-b),median=ds[Math.floor(ds.length/2)],targetPx=clamp(Math.min(width,height)*.24,64,170),desired=clamp(targetPx/median*tuning.baseZoom,.08,2.15);landingFit=fitProjectedEnvelope(projected,b,{preferredZoom:desired,minZoom:.08,maxZoom:2.15,allowOffset:true});return landingFit.zoom;}finally{probe.remove();}
 }
 function framingSignature(){return JSON.stringify({width,height,bounds:usableBounds(),layout,faceSize:tuning.faceSize,circleSpacing:tuning.circleSpacing,pitch:tuning.basePitch,baseZoom:tuning.baseZoom,rosterKey});}
 function refreshViewport(force=false){framingForce=framingForce||force;if(framingRequest)return;framingRequest=requestAnimationFrame(()=>{framingRequest=0;const needed=framingForce||framingSignature()!==lastFramingSignature;framingForce=false;if(needed){if(pointers.size)pendingFraming=true;else if(!browsing&&!editing&&!selection)home();else rebuildPlanner();}dirty=true;render();});}
 function speakerYaw(id){const state=getState(),people=roomMembers(state,state.joinedRoomId),i=people.findIndex(p=>p.id===id),a=anchor(state.rooms[state.joinedRoomId]),point=worldPoints(state.rooms[state.joinedRoomId],people.length)[i];return Math.atan2(point[0]-a.x,point[2]-a.z);}
 function rebuildPlanner(){
  usefulBase=computeUsefulBase();
  if(!cinematic)cinematic=createAttentionController({getHolder:()=>holder,getRoster:()=>[...seats.keys()],getProjection:selectedProjection,getBounds:usableBounds,getBlockers:f=>blockers(frameCamera(f)),getSpeakerYaw:speakerYaw,getFrame:currentFrame,applyFrame:f=>{camera={...camera,yaw:f.yaw,pitch:f.pitch,distance:BASE/f.zoom};dirty=true;},getBaseZoom:()=>usefulBase,getRestPitch:()=>tuning.basePitch,config:{minZoom:.08,maxZoom:2.15,planIntervalMs:800}});else cinematic.rebuild();
  if(speaker)cinematic.observe(speaker,logical);
 }
 function positionPopup(frame=camera,apply=true){
  const el=element.querySelector('#inspect-card');if(apply)popupPlacement=null;if(!el||el.hidden)return null;
  const state=getState(),room=state.rooms[el.dataset.room];if(!room||['hidden','ended'].includes(room.status)){if(apply)el.hidden=true;return null;}
  const a=anchor(room),q=projectScenePoint([a.x,a.y,a.z],frame,bounds()),people=roomMembers(state,room.id),joined=room.id===state.joinedRoomId;
  const rect={left:q.x-10,right:q.x+10,top:q.y-8,bottom:q.y+8};for(const point of worldPoints(room,people.length)){const p=projectScenePoint(point,frame,bounds());if(!p.visible)continue;const radius=diameter(people.length,joined)*p.scale*.6+3;rect.left=Math.min(rect.left,p.x-radius);rect.right=Math.max(rect.right,p.x+radius);rect.top=Math.min(rect.top,p.y-radius);rect.bottom=Math.max(rect.bottom,p.y+radius);}
  if(apply){el.style.display='';el.style.maxHeight=Math.max(1,height-24)+'px';popupNatural={width:el.offsetWidth,height:el.scrollHeight};}const natural=popupNatural||{width:el.offsetWidth,height:el.scrollHeight};const stageRect=element.getBoundingClientRect(),avoidRects=[];
  for(const selector of ['#topic-nav','#zoom-rail','#navigation-help','#browse-state','#sample-caption']){const control=element.querySelector(selector);if(!control||control.hidden)continue;const r=control.getBoundingClientRect();if(r.width&&r.height)avoidRects.push({left:r.left-stageRect.left,right:r.right-stageRect.left,top:r.top-stageRect.top,bottom:r.bottom-stageRect.top});}
  const placement=placeRoomPopup({anchor:{x:width/2+(rect.left+rect.right)/2,y:height/2+(rect.top+rect.bottom)/2,width:rect.right-rect.left,height:rect.bottom-rect.top,visible:q.visible},popup:natural,stage:{width,height},avoidRects});const result={...placement,roomId:room.id,roomPoint:{x:width/2+q.x,y:height/2+q.y}};
  if(apply){popupPlacement=result;el.style.display=placement.visible?'':'none';if(placement.visible){el.style.left=placement.x+'px';el.style.top=placement.y+'px';el.style.maxHeight=placement.height+'px';el.dataset.popupSide=placement.side;}}return result;
 }
 function navigationLabels(frame=camera){
  const state=getState(),candidates=[],footprints=[];
  for(const room of visibleRooms()){
   const joined=room.id===state.joinedRoomId,a=anchor(room),q=projectScenePoint([a.x,a.y,a.z],frame,bounds());if(!q.visible)continue;
   const people=roomMembers(state,room.id),ds=[],rect={left:q.x-12,right:q.x+12,top:q.y-8,bottom:q.y+8};
   worldPoints(room,people.length).forEach(point=>{const p=projectScenePoint(point,frame,bounds());if(!p.visible)return;const d=diameter(people.length,joined)*p.scale;ds.push(d);rect.left=Math.min(rect.left,p.x-d*.62);rect.right=Math.max(rect.right,p.x+d*.62);rect.top=Math.min(rect.top,p.y-d*.62);rect.bottom=Math.max(rect.bottom,p.y+d*.62+8);});
   if(rect.right < -width/2 || rect.left > width/2 || rect.bottom < -height/2 || rect.top > height/2)continue;
   footprints.push(rect);ds.sort((a,b)=>a-b);if(joined&&(editing||selection||(ds[Math.floor(ds.length/2)]??100)>=65))continue;
   candidates.push({id:room.id,x:q.x,y:q.y,footprint:rect,title:room.name,topic:['text','both'].includes(room.center.mode)?room.center.text:room.topic,priority:joined?10:0,depth:q.depth,joined});
  }
  const b=element.getBoundingClientRect(),avoidRects=[...footprints];for(const selector of ['#topic-nav','#zoom-rail','#navigation-help','#browse-state','#sample-caption']){const el=element.querySelector(selector);if(!el||el.hidden)continue;const r=el.getBoundingClientRect();if(r.width&&r.height)avoidRects.push({left:r.left-b.left-width/2,right:r.right-b.left-width/2,top:r.top-b.top-height/2,bottom:r.bottom-b.top-height/2});}
  const popup=positionPopup(frame,false);if(popup?.visible)avoidRects.push({left:popup.x-width/2,right:popup.x+popup.width-width/2,top:popup.y-height/2,bottom:popup.y+popup.height-height/2});
  return placeRoomLabels(candidates,{width,height,padding:12,avoidRects}).map(label=>({...candidates.find(c=>c.id===label.id),...label}));
 }
 function blockers(frame=camera){const out=[],state=getState(),labels=navigationLabels(frame),labelIds=new Set(labels.filter(l=>l.visible).map(l=>l.id));for(const room of visibleRooms()){
  if(room.id!==state.joinedRoomId){const people=roomMembers(state,room.id),points=worldPoints(room,people.length);people.forEach((p,i)=>{const q=projectScenePoint(points[i],frame,bounds());if(q.visible)out.push({shape:'disc',x:q.x,y:q.y,diameter:diameter(people.length,false)*q.scale,depth:plane(q.depth),order:seats.size+[...records.keys()].indexOf(p.id),opacityPolicy:'opaque-neighbor-sample-disc'});});}
  const el=centerNodes.get(room.id);if(!el||labelIds.has(room.id)&&room.id!==state.joinedRoomId&&!['image','both'].includes(room.center.mode))continue;const a=anchor(room),q=projectScenePoint([a.x,a.y,a.z],frame,bounds());if(q.visible){const face=diameter(roomMembers(state,room.id).length||3,room.id===state.joinedRoomId),natural=centerDimensions.get(room.id)||measureCenter(el),sizing=centerSizing({mode:tuning.centerMode,projectedScale:q.scale,faceWorldDiameter:face,sizeRatio:tuning.centerSize});out.push({shape:'rect',x:q.x,y:q.y,width:natural.width*sizing.cssScale,height:natural.height*sizing.cssScale,depth:plane(q.depth),order:1000,opacityPolicy:'conservative opaque center text/image bounds'});}
 }for(const l of labels)if(l.visible)out.push({shape:'rect',x:l.x,y:l.y,width:l.width,height:l.height,depth:plane(l.depth)+.001,order:1001,opacityPolicy:'opaque world-anchored readable navigation label'});const popupSupport=popupBlocker(positionPopup(frame,false),{width,height});if(popupSupport)out.push(popupSupport);for(const selector of ['#topic-nav','#zoom-rail','#navigation-help','#browse-state','#sample-caption']){const overlay=element.querySelector(selector);if(!overlay||overlay.hidden)continue;const r=overlay.getBoundingClientRect(),b=element.getBoundingClientRect();if(r.width&&r.height)out.push({shape:'rect',x:r.left+r.width/2-b.left-width/2,y:r.top+r.height/2-b.top-height/2,width:r.width,height:r.height,front:true,order:1000000,opacityPolicy:'conservative opaque native overlay '+selector});}return out;}
 function resize(){width=element.clientWidth;height=element.clientHeight;if(width<1||height<1)return;focal=Math.min(width*.346,height*.435)/.24;canvas.width=Math.round(width*devicePixelRatio);canvas.height=Math.round(height*devicePixelRatio);rebuildPlanner();if(pointers.size)pendingFraming=true;else if(initialView||!browsing&&!editing&&!selection){initialView=false;home();}dirty=true;render();}
 function render(){
  if(width<1||height<1)return;const state=getState(),rooms=visibleRooms();ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.clearRect(0,0,width,height);
  positionPopup();const painted=[];renderedLabels=navigationLabels();const labelIds=new Set(renderedLabels.filter(l=>l.visible).map(l=>l.id));
  for(const room of rooms){const a=anchor(room),people=roomMembers(state,room.id),points=worldPoints(room,people.length),isJoined=room.id===state.joinedRoomId;
   // Two low-amplitude irregular contours projected point-by-point on the shared ground plane.
   for(let echo=0;echo<2;echo++){ctx.beginPath();let drawing=false;for(let i=0;i<=144;i++){const angle=i/144*Math.PI*2,jitter=1+.006*Math.sin(angle*7+room.id.length)+.003*Math.cos(angle*13),rad=a.radius*jitter+(echo?.013:0),p=projection([a.x+Math.sin(angle)*rad,a.y,a.z+Math.cos(angle)*rad]);if(!p.visible){drawing=false;continue;}const x=width/2+p.x,y=height/2+p.y;if(!drawing){ctx.moveTo(x,y);drawing=true;}else ctx.lineTo(x,y);}ctx.strokeStyle=isJoined?(echo?'#46664936':'#46664975'):(echo?'#46664920':'#46664950');ctx.lineWidth=echo?.55:1;ctx.stroke();}
   people.forEach((p,i)=>{const node=isJoined?seats.get(p.id):records.get(p.id);if(!node)return;const q=projection(points[i]),d=diameter(people.length,isJoined)*q.scale,el=node.element;el.hidden=!q.visible||d<2||Math.abs(q.x)>width/2+d||Math.abs(q.y)>height/2+d;el.style.left=(width/2+q.x)+'px';el.style.top=(height/2+q.y)+'px';el.style.setProperty('--size',d+'px');el.style.setProperty('--depth',String(1000000+Math.round(q.depth*1000)));node.world=points[i];node.projected={...q,diameter:d};if(!el.hidden)painted.push({id:p.id,roomId:room.id,...q,diameter:d});if(isJoined){el.toggleAttribute('data-selectable',selection);el.setAttribute('aria-pressed',String(selectedIds.includes(p.id)));el.querySelector('.name').hidden=people.length>10&&p.id!==speaker&&p.id!=='you';}});
   const center=centerNodes.get(room.id),q=projection([a.x,a.y,a.z]),s=q.visible?centerSizing({mode:tuning.centerMode,projectedScale:q.scale,faceWorldDiameter:diameter(people.length||3,isJoined),sizeRatio:tuning.centerSize}).cssScale:0;const natural=centerDimensions.get(room.id)||measureCenter(center),cw=natural.width*s,ch=natural.height*s;center.hidden=(!isJoined&&labelIds.has(room.id)&&!['image','both'].includes(room.center.mode))||!q.visible||cw<2||q.x+cw/2 < -width/2||q.x-cw/2 > width/2||q.y+ch/2 < -height/2||q.y-ch/2 > height/2;center.style.left=width/2+q.x+'px';center.style.top=height/2+q.y+'px';center.style.transform=`translate(-50%,-50%) scale(${s})`;center.style.setProperty('--depth',String(1000000+Math.round(q.depth*1000)));
  }
  for(const[id,el]of labelNodes){const l=renderedLabels.find(l=>l.id===id);el.hidden=!l?.visible;if(!l?.visible)continue;const room=state.rooms[id];el.replaceChildren();const title=document.createElement('strong');title.textContent=room.name;const topic=document.createElement('span');topic.textContent=l.topic||'Open conversation';const occupancy=document.createElement('small');occupancy.textContent=roomMembers(state,id).length+' / '+room.capacity+(l.joined?' · Your circle':room.status==='locked'?' · Locked':'');el.append(title,topic,occupancy);el.style.left=width/2+l.x+'px';el.style.top=height/2+l.y+'px';el.style.width=l.width+'px';el.style.height=l.height+'px';el.style.setProperty('--title-size',l.fontSize+'px');el.style.setProperty('--depth',String(1000000+Math.round(l.depth*1000)+1));el.setAttribute('aria-label','Inspect '+room.name+', '+(l.topic||'Open conversation'));if(Math.hypot(l.x-l.anchorX,l.y-l.anchorY)>14){ctx.beginPath();ctx.moveTo(width/2+l.anchorX,height/2+l.anchorY);ctx.lineTo(width/2+l.x,height/2+l.y-l.height/2);ctx.strokeStyle='#46664966';ctx.lineWidth=.8;ctx.stroke();}}
  if(popupPlacement?.visible){const p=popupPlacement,a=p.roomPoint,x=clamp(a.x,p.x,p.x+p.width),y=clamp(a.y,p.y,p.y+p.height);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(x,y);ctx.strokeStyle='#46664966';ctx.lineWidth=.8;ctx.stroke();}
  $('#zoom-level').textContent=Math.round(BASE/camera.distance*100)+'%';writeStatus();onView?.({camera:{...camera},browsing,painted});dirty=false;
 }
 function $(s){return element.querySelector(s);}
 function browse(){browsing=true;cinematic?.suspend('spatial-browse');dirty=true;}
 function zoom(factor){browse();camera.distance=clamp(camera.distance/factor,BASE/3,BASE/.08);dirty=true;}
 function writeStatus(looking=browsing){const state=getState(),label=$('#browse-state');label.hidden=!looking&&!running;label.textContent=looking?'Looking around · still in '+state.rooms[state.joinedRoomId].name:(state.persons[speaker]?.name||'Someone')+' speaking · '+(tuning.viewMode==='manual'?'Manual view':tuning.viewMode==='recency'?'Cinematic':tuning.viewMode+' view');}
 function home(){const s=getState(),a=anchor(s.rooms[s.joinedRoomId]),label=$('#browse-state'),priorStatus={hidden:label.hidden,textContent:label.textContent};writeStatus(false);usefulBase=computeUsefulBase();if(!landingFit?.fits){Object.assign(label,priorStatus);dirty=true;return false;}camera={yaw:0,pitch:tuning.basePitch,distance:BASE/usefulBase,target:{x:a.x,y:a.y,z:a.z},screenOffset:{...landingFit.offset}};browsing=false;lastFramingSignature=framingSignature();pendingFraming=false;cinematic?.resume();dirty=true;return true;}
 function all(){browse();camera=fitWorldCamera(visibleRooms(),layout,{...bounds(),padding:tuning.centerMode==='screen'?Math.min(Math.min(width,height)/2-2,65*tuning.centerSize+15):18},{yaw:camera.yaw,pitch:Math.max(.5,camera.pitch),target:camera.target});dirty=true;}
 function setLayout(next){Object.assign(layout,next);rebuildPlanner();refreshViewport();dirty=true;}
 function setTuning(next){if(next.viewMode==='manual'){browsing=true;cinematic?.suspend('manual-mode');}if(next.pattern!==undefined&&next.pattern!==tuning.pattern)sequence=null;Object.assign(tuning,next);if(next.basePitch!==undefined)camera.pitch=next.basePitch;rebuildPlanner();refreshViewport();dirty=true;}
 function nextTurn(){const ids=[...seats.keys()];if(!sequence)sequence=CircleUpConversationPatterns.create({ids:ids.map((_,i)=>i),kind:tuning.pattern});const turn=sequence.next();speaker=ids[turn.speaker];deadline=logical+turn.durationMs*tuning.turnSpeed;cinematic.observe(speaker,logical);dirty=true;}
 function playbackOverlay(started){const before=framingSignature();writeStatus();if(running&&started)refreshViewport();else if(!running){if(before===lastFramingSignature&&!pendingFraming&&!framingForce)lastFramingSignature=framingSignature();else refreshViewport();dirty=true;}}
 function play(on=!running){const wasRunning=running;running=on;if(running&&!sequence)nextTurn();playbackOverlay(running&&!wasRunning);return running;}
 function tick(time){const dt=Math.min(.05,Math.max(0,(time-(priorTime||time))/1000));priorTime=time;if(!document.hidden){
  if(running){logical+=dt*1000;if(logical>=deadline)nextTurn();}
  if(running&&cinematic){const mode=['equal','current'].includes(tuning.viewMode)?tuning.viewMode:'cinematic';const result=cinematic.step(logical,dt,{paused:browsing||editing||selection||tuning.viewMode==='manual'||pointers.size>0,mode,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});planMetrics=result.metrics;if(result.applied)dirty=true;}
  paint.update(time,running?.42+.18*Math.sin(time/250):0);if(dirty)render();
 }requestAnimationFrame(tick);}
 const editableTarget=e=>{const target=e.target instanceof Element?e.target:e.target?.parentElement;return Boolean(target?.closest('input,textarea,[contenteditable="true"]'));};
 element.addEventListener('dragstart',e=>{if(!editableTarget(e))e.preventDefault();},true);
 element.addEventListener('selectstart',e=>{if(!editableTarget(e))e.preventDefault();},true);
 const pointers=new Map();let gesture=null,dragged=false;
 function dist(){const p=[...pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):1;}
 element.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('#zoom-rail,#inspect-card,#topic-nav,.inline-center-form')||selection||editing)return;e.preventDefault();element.focus({preventScroll:true});pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture={x:e.clientX,y:e.clientY,camera:structuredClone(camera),distance:dist(),shift:e.shiftKey};dragged=false;});
 element.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){browse();dragged=true;camera.distance=clamp(gesture.camera.distance*gesture.distance/dist(),BASE/3,BASE/.08);}else{const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.hypot(dx,dy)<4&&!dragged)return;dragged=true;browse();if(!element.hasPointerCapture(e.pointerId))element.setPointerCapture(e.pointerId);if(gesture.shift||document.querySelector('#drag-mode').value==='move'){const scale=gesture.camera.distance/focal,yaw=gesture.camera.yaw;camera.target.x=gesture.camera.target.x-dx*scale*Math.cos(yaw)-dy*scale*Math.sin(yaw);camera.target.z=gesture.camera.target.z+dx*scale*Math.sin(yaw)-dy*scale*Math.cos(yaw);}else{camera.yaw=wrap(gesture.camera.yaw-dx*.006);camera.pitch=clamp(gesture.camera.pitch+dy*.005,-.18,1.48);}}dirty=true;});
 function end(e){pointers.delete(e.pointerId);if(pointers.size===1){const p=[...pointers.values()][0];gesture={x:p.x,y:p.y,camera:structuredClone(camera),distance:1,shift:e.shiftKey};}else{gesture=null;if(pendingFraming){pendingFraming=false;if(!browsing)refreshViewport(true);}}}
 element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);
 element.addEventListener('click',e=>{if(dragged){e.preventDefault();e.stopPropagation();dragged=false;return;}const person=e.target.closest('.seat');if(person&&selection){onPerson(person.dataset.person);return;}const room=e.target.closest('.neighbor-person');if(room){browse();onInspect(room.dataset.room);}},true);
 element.addEventListener('wheel',e=>{if(editing||e.target.closest('#inspect-card,.inline-center-form'))return;e.preventDefault();zoom(Math.exp(-e.deltaY*.0015));},{passive:false});
 element.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,.world-center,#inspect-card'))return;if(selection&&e.target.closest('.seat')&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();onPerson(e.target.closest('.seat').dataset.person);return;}if(['+','=','-','0'].includes(e.key)){e.preventDefault();e.key==='0'?home():zoom(e.key==='-'?1/1.2:1.2);}const delta={ArrowLeft:[-.18,0],ArrowRight:[.18,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]}[e.key];if(delta){e.preventDefault();browse();if(e.shiftKey){camera.target.x+=delta[0]*2;camera.target.z+=delta[1]*2;}else{camera.yaw=wrap(camera.yaw+delta[0]);camera.pitch=clamp(camera.pitch+delta[1],-.18,1.48);}dirty=true;}});
 new ResizeObserver(resize).observe(element);captureRoster();resize();requestAnimationFrame(tick);
 return Object.freeze({sync:captureRoster,refreshCenters,refreshViewport,refreshPopup(){positionPopup();dirty=true;},home,all,zoom,browse,setLayout,setTuning,play,freshExample(replay=false){logical=0;deadline=0;cinematic?.reset();const seed=replay?sequence?.seed:undefined;sequence=CircleUpConversationPatterns.create({ids:[...seats.keys()].map((_,i)=>i),kind:tuning.pattern,...(seed===undefined?{}:{seed})});const wasRunning=running;nextTurn();running=true;playbackOverlay(!wasRunning);},setHolder(id){if(id!=null&&!seats.has(id))throw Error('Unknown holder');holder=id;dirty=true;},setStickImage:file=>paint.setStickImage(file),setHolderRing:value=>paint.setHolderRing(value),setSelection(active,ids=[]){selection=active;selectedIds=ids;dirty=true;},setEditing(active){editing=active;dirty=true;},getCenter:id=>centerNodes.get(id),getView:()=>structuredClone(camera),setView(view){camera=structuredClone(view);browse();},getSeats:()=>[...seats.values()].map(r=>r.element),getBlockers:f=>blockers(f?.zoom?frameCamera(f):f??camera),snapshot:()=>({camera:structuredClone(camera),layout:{...layout},tuning:{...tuning},browsing,editing,running,speaker,holder,heard:sequence?.snapshot(),frame:currentFrame(),usefulBase,cinematic:cinematic?.snapshot(),planMetrics,paint:paint.snapshot(),seats:[...seats].map(([id,r])=>({id,world:r.world,projected:r.projected})),neighbors:[...records].map(([id,r])=>({id,roomId:r.roomId,world:r.world,projected:r.projected,visible:!r.element.hidden})),anchors:visibleRooms().map(r=>({id:r.id,...anchor(r)})),labels:structuredClone(renderedLabels),popup:structuredClone(popupPlacement),landing:structuredClone(landingFit),usableBounds:usableBounds(),bounds:{width,height,focal}})});
}
