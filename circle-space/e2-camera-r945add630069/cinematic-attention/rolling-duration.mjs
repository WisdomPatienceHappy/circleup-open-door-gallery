/** Exact rolling elapsed-time speaking duration. No loudness, onset or grace credit. */
const finite=Number.isFinite;
const plain=value=>value!==null&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function rawActive(value){
 if(typeof value==='boolean')return value;
 if(typeof value==='number'&&finite(value))return value>0;
 if(plain(value)){
  const active=value.active;
  if(typeof active==='boolean')return active;
  if(active===undefined){const level=value.level;if(typeof level==='number'&&finite(level))return level>0;}
 }
 throw new TypeError('Activity entries require a boolean, finite level, or active/level record.');
}
export function createSteadyActivity(options={}){
 if(Object.prototype.hasOwnProperty.call(options,'onsetMs')||Object.prototype.hasOwnProperty.call(options,'releaseMs'))throw new TypeError('Proportional speaking duration has no onset or release-grace credit.');
 const {ids,memoryMs=8000}=options;
 if(!Array.isArray(ids))throw new TypeError('A distinct typed roster is required.');
 const roster=[...ids];
 if(roster.some(id=>!(typeof id==='string'&&id.length||typeof id==='number'&&Number.isSafeInteger(id)))||new Set(roster).size!==roster.length)throw new TypeError('A distinct typed roster of nonempty strings or safe integers is required.');
 if(!finite(memoryMs)||memoryMs<=0)throw new RangeError('memoryMs must be finite and positive.');
 const known=new Set(roster),configuration=Object.freeze({ids:Object.freeze([...roster]),memoryMs,memoryPolicy:'rolling'});
 let active=roster.map(()=>false),speaking=roster.map(()=>0),clock=null,version=0,rawQuietSince=null;
 const intervals=roster.map(()=>[]),heads=roster.map(()=>0);
 function snapshot(){
  let maximum=0;for(const value of speaking)maximum=Math.max(maximum,value);
  const scaled=maximum>0?speaking.map(value=>value/maximum):speaking.map(()=>0),sum=scaled.reduce((a,b)=>a+b,0),weights=[];
  if(sum>0)for(let i=0;i<roster.length;i++){const weight=scaled[i]/sum;if(weight>0)weights.push({id:roster[i],weight,speakingMs:speaking[i]});}
  return{roster:[...roster],rawActiveIds:roster.filter((id,i)=>active[i]),rawQuietSince,effectiveIds:weights.map(row=>row.id),weights,version,now:clock};
 }
 function validateTime(now){if(!finite(now)||clock!==null&&now<clock)throw new RangeError('A finite monotonic observation clock is required.');}
 function commit(now,nextActive){
  // A new observation applies from NOW onward. Only the previous flags earn
  // duration over [clock,now); adjacent active intervals merge regardless of
  // observation cadence. A zero-length observation cannot invent speech.
  if(clock!==null&&now>clock)for(let i=0;i<roster.length;i++)if(active[i]){
   const list=intervals[i],tail=list[list.length-1];
   if(tail&&tail.end===clock)tail.end=now;else list.push({start:clock,end:now});
  }
  const nextSpeaking=intervals.map((list,i)=>{
   let head=heads[i];while(head<list.length&&now-list[head].end>=memoryMs)head++;
   if(head===list.length){list.length=0;heads[i]=0;return 0;}
   if(head>64&&head*2>=list.length){list.splice(0,head);head=0;}heads[i]=head;
   let total=0;
   for(let j=head;j<list.length;j++){
    // Clip endpoint AGES into [0,memoryMs]. This is the interval intersection
    // length, but never subtracts a small window from a huge absolute clock.
    const older=Math.min(memoryMs,now-list[j].start),younger=Math.min(memoryMs,now-list[j].end);
    total+=Math.max(0,older-younger);
   }
   return Math.min(memoryMs,total);
  });
  if(nextActive.some((value,i)=>value!==active[i])||nextSpeaking.some((value,i)=>value!==speaking[i]))version++;
  rawQuietSince=nextActive.some(Boolean)?null:rawQuietSince??now;
  active=nextActive;speaking=nextSpeaking;clock=now;return snapshot();
 }
 function update({now,activity}={}){
  validateTime(now);let entries;
  if(activity instanceof Map)entries=[...Map.prototype.entries.call(activity)];
  else if(plain(activity)){
   const keys=Reflect.ownKeys(activity);for(const id of keys)if(!known.has(id))throw new RangeError('Activity ID is outside the fixed roster.');
   entries=keys.map(id=>[id,activity[id]]);
  }else throw new TypeError('Activity must be a complete Map or plain participant record.');
  for(const[id]of entries)if(!known.has(id))throw new RangeError('Activity ID is outside the fixed roster.');
  // Validate the complete observation before changing clocks, intervals or scores.
  const observed=new Map(entries.map(([id,value])=>[id,rawActive(value)]));
  return commit(now,roster.map(id=>observed.get(id)??false));
 }
 /** Advance the same causal zero-order hold; this does not invent inactivity. */
 function advance(now){validateTime(now);return commit(now,[...active]);}
 return Object.freeze({update,advance,snapshot,configuration});
}
