/** Passive room summary over the same records and world anchors as the real map. */
export function cornerRoomOverview(state,anchors=[]){
 if(!state?.rooms||!state?.persons)return{rooms:[],currentId:null,breakoutCount:0,self:null};
 const byAnchor=new Map(anchors.map(a=>[a.id,a]));
 const counts=new Map();for(const person of Object.values(state.persons))counts.set(person.roomId,(counts.get(person.roomId)||0)+1);
 const rooms=Object.values(state.rooms).filter(room=>!['hidden','ended'].includes(room.status)).map(room=>{
  const anchor=byAnchor.get(room.id)||room.anchor||{};
  return{id:room.id,name:room.name,count:counts.get(room.id)||0,status:room.status,current:room.id===state.joinedRoomId,
   x:Number.isFinite(anchor.x)?anchor.x:0,z:Number.isFinite(anchor.z)?anchor.z:0,radius:Number.isFinite(anchor.radius)?Math.max(.1,anchor.radius):1};
 });
 const minX=Math.min(0,...rooms.map(r=>r.x-r.radius)),maxX=Math.max(0,...rooms.map(r=>r.x+r.radius));
 const minZ=Math.min(0,...rooms.map(r=>r.z-r.radius)),maxZ=Math.max(0,...rooms.map(r=>r.z+r.radius));
 const scale=Math.min(76/Math.max(.1,maxX-minX),54/Math.max(.1,maxZ-minZ));
 for(const room of rooms){room.cx=50+(room.x-(minX+maxX)/2)*scale;room.cy=38+(room.z-(minZ+maxZ)/2)*scale;room.r=Math.max(4,Math.min(20,room.radius*scale));}
 const person=state.persons[state.userId||'you'];
 const self=person&&/^[a-z0-9-]+$/.test(person.portraitKey||'')?{id:person.id,name:person.name,portraitKey:person.portraitKey,sample:Boolean(person.sample)}:null;
 return{rooms,currentId:state.joinedRoomId,breakoutCount:rooms.filter(room=>!room.current).length,self};
}

/** Joined-room membership and emphasis from the existing Scene.onView payload. */
export function joinedCircleOverview(state,{comparison,running=false}={}){
 const levels=comparison?.levels||{},roomId=state.joinedRoomId;
 const people=Object.values(state.persons).filter(p=>p.roomId===roomId).sort((a,b)=>a.seatIndex-b.seatIndex||a.id.localeCompare(b.id)).map(p=>({
  id:p.id,name:p.name,portraitKey:/^[a-z0-9-]+$/.test(p.portraitKey||'')?p.portraitKey:null,
  active:Boolean(running&&levels[p.id]?.active),level:running&&Number.isFinite(levels[p.id]?.level)?Math.max(0,Math.min(1,levels[p.id].level)):0
 }));
 return{roomId,roomName:state.rooms[roomId]?.name||'Your circle',people,owner:people.some(p=>p.id===comparison?.owner)?comparison.owner:null,logicalTime:comparison?.recordedMs??0,source:comparison?.source??null,running:Boolean(running)};
}
