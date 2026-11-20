/** Fixture-only domain model. No network, persistence or actual media authority. */
const ROSTER = ['Maya','Sam','Ana','Noor','You','Alex','Jordan','Elise','Ben','Priya','Omar','Tessa','Luis','Nia','June','Ramon','Leila','Kit'];
const STATUSES = new Set(['open','locked','hidden','ended']);
const CENTER_MODES = new Set(['text','image','both','empty']);
const modes = new Set(['overlay','pullback']);
const clone = value => structuredClone(value);
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function requireHost(s) { if (s.role !== 'host') fail('HOST_ONLY','Only the host can do that.'); }
function getRoom(s,id) { const r=Object.hasOwn(s.rooms,id)?s.rooms[id]:null; if(!r) fail('ROOM_NOT_FOUND','That circle is unavailable.'); return r; }
function timestamp(now) { if(!Number.isFinite(now)||now<0) fail('INVALID_TIME','A valid sample timestamp is required.'); return now; }
function label(value, fallback='', max=100) { if(value===undefined) return fallback; if(typeof value!=='string') fail('INVALID_TEXT','Use text for this field.'); return value.trim().slice(0,max); }
function viewValue(view) { if(!view || !['yaw','pitch','zoom'].every(k=>Number.isFinite(view[k])) || view.zoom<=0) fail('INVALID_VIEW','View needs finite yaw, pitch and positive zoom.'); return {yaw:view.yaw,pitch:view.pitch,zoom:view.zoom}; }
export function roomMembers(state, roomId) { return Object.values(state.persons).filter(p=>p.roomId===roomId).sort((a,b)=>a.seatIndex-b.seatIndex || a.id.localeCompare(b.id)); }
export function canJoin(s, roomId) {
 const room=Object.hasOwn(s.rooms,roomId)?s.rooms[roomId]:null;
 if(!room) return {allowed:false,reason:'This circle is unavailable.'};
 if(room.status==='hidden') return {allowed:false,reason:'This circle is private.'};
 if(room.status==='ended') return {allowed:false,reason:'This circle has ended.'};
 if(room.status==='locked') return {allowed:false,reason:'This circle is locked.'};
 if(s.joinedRoomId===roomId) return {allowed:true,reason:null};
 if(roomMembers(s,roomId).length>=room.capacity) return {allowed:false,reason:'This circle is full.'};
 return {allowed:true,reason:null};
}
function allocateSeats(s,roomId) { roomMembers(s,roomId).forEach((p,index)=>{p.seatIndex=index;}); }
function syncYou(s) { s.joinedRoomId=s.persons.you.roomId; s.audioRoomId=s.persons.you.roomId; }
function movePeople(s,ids,targetId) {
 const target=getRoom(s,targetId), incoming=ids.filter(id=>s.persons[id].roomId!==targetId);
 if(roomMembers(s,targetId).length+incoming.length>target.capacity) fail('ROOM_FULL','The destination circle is full.');
 const origins=new Set(incoming.map(id=>s.persons[id].roomId));
 let nextSeat=roomMembers(s,targetId).reduce((n,p)=>Math.max(n,p.seatIndex+1),0);
 for(const id of incoming) { s.persons[id].roomId=targetId; s.persons[id].seatIndex=nextSeat++; }
 for(const id of origins) allocateSeats(s,id);
 syncYou(s);
}
function closeMap(s) { if(s.mapOpen && s.savedView) s.view=clone(s.savedView); s.mapOpen=false; s.savedView=null; }
function cancelSelection(s) { s.selection={active:false,personIds:[],sourceRoomId:null}; }
function visibleRoom(s,id) { const r=getRoom(s,id); if(r.status==='hidden') fail('ROOM_HIDDEN','This circle is private.'); return r; }
function imageValue(value) {
 if(value===null || value==='') return null;
 if(typeof value!=='string'||value.length>4000000||!(/^(blob:|data:image\/(png|jpeg|webp|gif|avif);base64,)/.test(value))) fail('LOCAL_IMAGE_ONLY','Choose a local image preview.');
 return value;
}
function makeRoom(id,name,topic,capacity,status,x,z,now) {
 return {id,name,topic,capacity,status,anchor:{x,z},center:{mode:'text',text:topic,imageUrl:null},snapshot:{kind:'sample',capturedAt:now-30000,frozen:false,intervalMs:30000},createdBy:'fixture'};
}
export function initialState({count=7,role='host',now=Date.now()}={}) {
 if(!Number.isInteger(count)||count<3||count>18) fail('INVALID_COUNT','Choose 3 to 18 people.');
 if(!['host','guest'].includes(role)) fail('INVALID_ROLE','Choose host or guest.');
 timestamp(now);
 const rooms={
  main:makeRoom('main','Listening together','What is alive for you?',60,'open',0,0,now),
  'new-beginnings':makeRoom('new-beginnings','New beginnings','What are you beginning?',6,'open',3.8,-2.7,now),
  'quiet-corner':makeRoom('quiet-corner','A quiet moment','Room to reflect',4,'locked',-3.8,-2.7,now),
  'full-circle':makeRoom('full-circle','Small joys','What made you smile?',3,'open',3.8,2.7,now),
  'empty-circle':makeRoom('empty-circle','An open circle','Start something together',6,'open',-3.8,2.7,now),
  'hidden-circle':makeRoom('hidden-circle','Private circle','',4,'hidden',-7.6,0,now),
  'ended-circle':makeRoom('ended-circle','Earlier conversation','',6,'ended',0,5.5,now)
 };
 const chosen=ROSTER.slice(0,count); if(!chosen.includes('You')) chosen[chosen.length-1]='You';
 const persons={};
 chosen.forEach((name,i)=>{const id=name.toLowerCase();persons[id]={id,name,portraitKey:id,roomId:'main',seatIndex:i,sample:true};});
 for(const [roomId,ids] of [['new-beginnings',['Elise','Priya','Omar']],['quiet-corner',['June','Kit']],['full-circle',['Nia','Ramon','Leila']]]) {
  ids.forEach((name,i)=>{ const id=`sample-${roomId}-${i}`; persons[id]={id,name,portraitKey:name.toLowerCase(),roomId,seatIndex:i,sample:true}; });
 }
 const s={version:1,role,userId:'you',mainRoomId:'main',joinedRoomId:'main',audioRoomId:'main',selectedRoomId:'main',mapOpen:false,mapMode:'overlay',view:{yaw:0,pitch:.48,zoom:1},savedView:null,selection:{active:false,personIds:[],sourceRoomId:null},persons,rooms,nextRoomNumber:1,now,notice:''};
 assertInvariants(s); return s;
}
export function reduce(state,event) {
 if(!event||typeof event.type!=='string') fail('INVALID_EVENT','An event type is required.');
 assertInvariants(state);
 const s=clone(state);s.notice='';
 switch(event.type) {
  case 'OPEN_MAP': {
   const mode=event.mode??s.mapMode; if(!modes.has(mode)) fail('INVALID_MAP_MODE','Choose overlay or pullback.');
   if(s.selection.active) fail('SELECTION_ACTIVE','Finish or cancel selecting people first.');
   if(!s.mapOpen) s.savedView=viewValue(event.view??s.view);
   s.mapOpen=true;s.mapMode=mode;break;
  }
  case 'SET_MAP_MODE': if(!modes.has(event.mode)) fail('INVALID_MAP_MODE','Choose overlay or pullback.');s.mapMode=event.mode;break;
  case 'INSPECT_ROOM': visibleRoom(s,event.roomId);s.selectedRoomId=event.roomId;break;
  case 'CLOSE_MAP': closeMap(s);break;
  case 'SET_VIEW': s.view=viewValue(event.view);break;
  case 'JOIN_ROOM': {
   const gate=canJoin(s,event.roomId);if(!gate.allowed) fail('CANNOT_JOIN',gate.reason);
   movePeople(s,['you'],event.roomId);s.selectedRoomId=event.roomId;closeMap(s);cancelSelection(s);
   s.notice=`You joined ${s.rooms[event.roomId].name}.`;break;
  }
  case 'RETURN_MAIN': {
   const gate=canJoin(s,'main');if(!gate.allowed) fail('CANNOT_JOIN',gate.reason);
   movePeople(s,['you'],'main');s.selectedRoomId='main';closeMap(s);cancelSelection(s);s.notice='You returned to Listening together.';break;
  }
  case 'SET_ROLE': if(!['host','guest'].includes(event.role)) fail('INVALID_ROLE','Choose host or guest.');s.role=event.role;cancelSelection(s);break;
  case 'START_SELECTION': requireHost(s);closeMap(s);s.selection={active:true,personIds:[],sourceRoomId:s.joinedRoomId};break;
  case 'TOGGLE_PERSON': {
   requireHost(s);if(!s.selection.active) fail('NOT_SELECTING','Choose Select people first.');
   const p=s.persons[event.personId];if(!p || p.roomId!==s.selection.sourceRoomId || p.roomId!==s.joinedRoomId) fail('WRONG_ROOM','Select people in your current circle.');
   const ids=s.selection.personIds; const i=ids.indexOf(p.id);if(i>=0) ids.splice(i,1);else ids.push(p.id);break;
  }
  case 'CLEAR_SELECTION': requireHost(s);if(s.selection.active)s.selection.personIds=[];break;
  case 'CANCEL_SELECTION': requireHost(s);cancelSelection(s);break;
  case 'CREATE_BREAKOUT': {
   requireHost(s);if(!s.selection.active||!s.selection.personIds.length) fail('EMPTY_SELECTION','Choose at least one person.');
   const topic=label(event.topic,'',160),name=label(event.name,topic||'A new circle',80);
   if(!name) fail('NAME_REQUIRED','Give the breakout a name.');
   const ids=s.selection.personIds; if(ids.some(id=>s.persons[id]?.roomId!==s.selection.sourceRoomId)) fail('STALE_SELECTION','Someone has moved. Select people again.');
   const capacity=event.capacity??Math.max(6,ids.length);if(!Number.isInteger(capacity)||capacity<ids.length||capacity>60) fail('INVALID_CAPACITY','Choose enough seats, up to 60.');
   const n=s.nextRoomNumber++,id=`breakout-${n}`,angle=(n-1)*2.399963;
   s.rooms[id]=makeRoom(id,name,topic,capacity,'open',7*Math.cos(angle),7*Math.sin(angle),s.now);s.rooms[id].createdBy='you';
   movePeople(s,ids,id);s.selectedRoomId=id;cancelSelection(s);s.notice=`Created ${name} with ${ids.length} ${ids.length===1?'person':'people'}.`;break;
  }
  case 'RENAME_ROOM': {
   requireHost(s);const r=visibleRoom(s,event.roomId),name=label(event.name,'',80);if(!name)fail('NAME_REQUIRED','Give the circle a name.');if(r.status==='ended')fail('ROOM_ENDED','This circle has ended.');r.name=name;if(event.topic!==undefined)r.topic=label(event.topic,'',160);s.notice='Circle renamed.';break;
  }
  case 'RECALL_ROOM':
  case 'CLOSE_ROOM': {
   requireHost(s);const r=visibleRoom(s,event.roomId);if(r.id==='main')fail('MAIN_PROTECTED','Keep the main circle open.');if(r.status==='ended')fail('ROOM_ENDED','This circle has already ended.');
   movePeople(s,roomMembers(s,r.id).map(p=>p.id),'main');
   if(event.type==='CLOSE_ROOM')r.status='ended';
   if(s.selectedRoomId===r.id)s.selectedRoomId='main';cancelSelection(s);s.notice=event.type==='CLOSE_ROOM'?'Circle closed. Everyone returned to the main circle.':'Everyone returned to the main circle.';break;
  }
  case 'SET_ROOM_STATUS': {
   requireHost(s);const r=getRoom(s,event.roomId);if(!STATUSES.has(event.status)||event.status==='ended')fail('INVALID_STATUS','Use Close room to end a circle.');if(r.id==='main'&&event.status!=='open')fail('MAIN_PROTECTED','Keep the main circle open.');if(r.status==='ended')fail('ROOM_ENDED','An ended circle cannot reopen.');
   if(event.status==='hidden'&&roomMembers(s,r.id).length)fail('ROOM_OCCUPIED','An occupied circle cannot become hidden.');r.status=event.status;if(r.status==='hidden'&&s.selectedRoomId===r.id)s.selectedRoomId=s.joinedRoomId;break;
  }
  case 'SET_CENTER': {
   requireHost(s);const r=visibleRoom(s,event.roomId);if(r.status==='ended')fail('ROOM_ENDED','This circle has ended.');
   if(!CENTER_MODES.has(event.mode))fail('INVALID_CENTER','Choose text, image, both or empty.');
   const text=label(event.text,r.center.text,240),imageUrl=event.imageUrl===undefined?r.center.imageUrl:imageValue(event.imageUrl);
   if(['image','both'].includes(event.mode)&&!imageUrl)fail('IMAGE_REQUIRED','Choose an image first.');
   r.center={mode:event.mode,text,imageUrl};s.notice='Centerpiece updated.';break;
  }
  case 'SET_SNAPSHOT': {
   const r=visibleRoom(s,event.roomId);if(event.frozen!==undefined){if(typeof event.frozen!=='boolean')fail('INVALID_SNAPSHOT','Frozen must be true or false.');r.snapshot.frozen=event.frozen;}
   if(event.intervalMs!==undefined){if(!Number.isFinite(event.intervalMs)||event.intervalMs<30000||event.intervalMs>600000)fail('INVALID_INTERVAL','Choose 30 seconds to 10 minutes.');r.snapshot.intervalMs=event.intervalMs;}
   break;
  }
  case 'REFRESH_SNAPSHOT': {
   const r=visibleRoom(s,event.roomId);const now=timestamp(event.now??s.now);if(now<r.snapshot.capturedAt)fail('INVALID_TIME','A snapshot cannot move backwards.');r.snapshot.capturedAt=now;s.now=Math.max(s.now,now);s.notice='Sample snapshot refreshed.';break;
  }
  case 'TICK': {
   const now=timestamp(event.now);if(now<s.now)fail('INVALID_TIME','The sample clock cannot move backwards.');s.now=now;
   for(const r of Object.values(s.rooms))if(!r.snapshot.frozen&&r.status!=='ended'&&r.status!=='hidden'&&now-r.snapshot.capturedAt>=r.snapshot.intervalMs)r.snapshot.capturedAt=now;
   break;
  }
  default: fail('UNKNOWN_EVENT',`Unknown event: ${event.type}`);
 }
 assertInvariants(s);return s;
}
export function assertInvariants(s) {
 if(!s||s.version!==1||!s.rooms||!s.persons||!['host','guest'].includes(s.role))fail('INVALID_STATE','Invalid room state.');
 if(s.userId!=='you'||!s.persons.you||!s.rooms.main)fail('INVALID_STATE','Missing your participant or main circle.');
 if(s.rooms.main.status!=='open')fail('INVALID_STATE','Main circle must remain open.');
 if(s.joinedRoomId!==s.persons.you.roomId||s.audioRoomId!==s.joinedRoomId)fail('INVALID_STATE','Joined room, audio room and your membership must agree.');
 if(!s.rooms[s.selectedRoomId]||s.rooms[s.selectedRoomId].status==='hidden')fail('INVALID_STATE','Selected circle must be visible.');
 if(!modes.has(s.mapMode)||typeof s.mapOpen!=='boolean')fail('INVALID_STATE','Invalid map state.');
 viewValue(s.view);if(s.savedView)viewValue(s.savedView);if(s.mapOpen!==Boolean(s.savedView))fail('INVALID_STATE','Map needs an exact restoration view.');
 const allSeatKeys=new Set();
 for(const [id,p] of Object.entries(s.persons)) {
  const r=s.rooms[p.roomId];if(p.id!==id||!r||r.status==='ended'||r.status==='hidden'||!Number.isInteger(p.seatIndex)||p.seatIndex<0)fail('INVALID_STATE','Invalid participant membership.');
  const key=`${p.roomId}:${p.seatIndex}`;if(allSeatKeys.has(key))fail('INVALID_STATE','Seat positions must be unique within a circle.');allSeatKeys.add(key);
 }
 for(const [id,r] of Object.entries(s.rooms)) {
  if(r.id!==id||!STATUSES.has(r.status)||!Number.isInteger(r.capacity)||r.capacity<1||roomMembers(s,id).length>r.capacity)fail('INVALID_STATE','Invalid circle capacity/status.');
  if(!Number.isFinite(r.anchor.x)||!Number.isFinite(r.anchor.z)||!CENTER_MODES.has(r.center.mode))fail('INVALID_STATE','Invalid circle presentation.');
  if(r.snapshot.kind!=='sample'||!Number.isFinite(r.snapshot.capturedAt)||typeof r.snapshot.frozen!=='boolean'||r.snapshot.intervalMs<30000||r.snapshot.intervalMs>600000)fail('INVALID_STATE','Invalid sample snapshot.');
 }
 const ids=s.selection.personIds;
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length)fail('INVALID_STATE','Duplicate selected participant.');
 if(s.selection.active) {
  if(s.role!=='host'||s.mapOpen||s.selection.sourceRoomId!==s.joinedRoomId||ids.some(id=>s.persons[id]?.roomId!==s.joinedRoomId))fail('INVALID_STATE','Selection must remain in your current circle.');
 } else if(ids.length||s.selection.sourceRoomId!==null)fail('INVALID_STATE','Inactive selection must be empty.');
 return true;
}
