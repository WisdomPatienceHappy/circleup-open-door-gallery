/** Passive room summary over the same records and world anchors as the real map. */
export function cornerRoomOverview(state,anchors=[]){
 if(!state?.rooms||!state?.persons)return{rooms:[],currentId:null,breakoutCount:0,self:null};
 const byAnchor=new Map(anchors.map(a=>[a.id,a]));
 const counts=new Map();for(const person of Object.values(state.persons))counts.set(person.roomId,(counts.get(person.roomId)||0)+1);
 const rooms=Object.values(state.rooms).filter(room=>!['hidden','ended'].includes(room.status)).map(room=>{
  const anchor=byAnchor.get(room.id)||room.anchor||{};
  return{id:room.id,name:room.name,count:counts.get(room.id)||0,capacity:room.capacity,status:room.status,current:room.id===state.joinedRoomId,
   members:Object.values(state.persons).filter(p=>p.roomId===room.id).sort((a,b)=>a.seatIndex-b.seatIndex||a.id.localeCompare(b.id)).map(p=>({id:p.id,name:p.name,portraitKey:/^[a-z0-9-]+$/.test(p.portraitKey||'')?p.portraitKey:null})),
   x:Number.isFinite(anchor.x)?anchor.x:0,z:Number.isFinite(anchor.z)?anchor.z:0,radius:Number.isFinite(anchor.radius)?Math.max(.1,anchor.radius):1};
 });
 packRoomGlyphs(rooms);
 const person=state.persons[state.userId||'you'];
 const self=person&&/^[a-z0-9-]+$/.test(person.portraitKey||'')?{id:person.id,name:person.name,portraitKey:person.portraitKey,sample:Boolean(person.sample)}:null;
 return{rooms,currentId:state.joinedRoomId,breakoutCount:rooms.filter(room=>!room.current).length,self};
}

/** Semantic map glyphs, deliberately independent of world-metre radii. */
export function packRoomGlyphs(rooms){
 const current=rooms.find(room=>room.current)||rooms[0];if(!current)return rooms;
 const others=rooms.filter(room=>room!==current).sort((a,b)=>a.id.localeCompare(b.id));
 if(others.length<=4){
  Object.assign(current,{cx:50,cy:42,r:22.5});
  const slots=[{x:13,y:14},{x:87,y:14},{x:13,y:57},{x:87,y:57}];let best=null;
  const search=(index,used,cost,chosen)=>{if(index===others.length){if(!best||cost<best.cost)best={cost,chosen};return;}
   const room=others[index],angle=Math.atan2(room.z-current.z,room.x-current.x);
   slots.forEach((slot,i)=>{if(used.includes(i))return;const direction=Math.atan2(slot.y-42,slot.x-50),delta=Math.atan2(Math.sin(angle-direction),Math.cos(angle-direction));search(index+1,[...used,i],cost+delta*delta,[...chosen,i]);});
  };search(0,[],0,[]);
  others.forEach((room,i)=>Object.assign(room,{cx:slots[best.chosen[i]].x,cy:slots[best.chosen[i]].y,r:9}));
 }else{
  // More rooms than the reference fixture use a compact ordered grid, never omit records.
  const ordered=[...rooms].sort((a,b)=>a.z-b.z||a.x-b.x||a.id.localeCompare(b.id)),columns=Math.ceil(Math.sqrt(ordered.length*100/76)),rows=Math.ceil(ordered.length/columns),w=100/columns,h=76/rows;
  ordered.forEach((room,i)=>Object.assign(room,{cx:(i%columns+.5)*w,cy:(Math.floor(i/columns)+.5)*h-2,r:Math.max(2,Math.min(w,h)*.27)}));
 }
 return rooms;
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
