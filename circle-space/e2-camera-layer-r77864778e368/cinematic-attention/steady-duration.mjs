/** Proportional recent measured speaking time. Supersedes the rejected equal D qualifier. */
const finite=Number.isFinite;
const plain=value=>value!==null&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function rawActive(value){
 if(typeof value==='boolean')return value;
 if(typeof value==='number'&&finite(value))return value>0;
 if(plain(value)){
  const active=value.active;
  if(typeof active==='boolean')return active; // Authoritative; do not read amplitude or other metadata.
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
 const known=new Set(roster),configuration=Object.freeze({ids:Object.freeze([...roster]),memoryMs});
 let active=roster.map(()=>false),speaking=roster.map(()=>0),clock=null,version=0,rawQuietSince=null;
 function snapshot(){
  let maximum=0;for(const value of speaking)maximum=Math.max(maximum,value);
  const scaled=maximum>0?speaking.map(value=>value/maximum):speaking.map(()=>0),sum=scaled.reduce((a,b)=>a+b,0);
  const weights=[];
  if(sum>0)for(let i=0;i<roster.length;i++){const weight=scaled[i]/sum;if(weight>0)weights.push({id:roster[i],weight,speakingMs:speaking[i]});}
  return{roster:[...roster],rawActiveIds:roster.filter((id,i)=>active[i]),rawQuietSince,effectiveIds:weights.map(row=>row.id),weights,version,now:clock};
 }
 function update({now,activity}={}){
  if(!finite(now)||clock!==null&&now<clock)throw new RangeError('A finite monotonic observation clock is required.');
  let entries;
  if(activity instanceof Map)entries=[...Map.prototype.entries.call(activity)];
  else if(plain(activity)){
   const keys=Reflect.ownKeys(activity);
   for(const id of keys)if(!known.has(id))throw new RangeError('Activity ID is outside the fixed roster.');
   entries=keys.map(id=>[id,activity[id]]);
  }else throw new TypeError('Activity must be a complete Map or plain participant record.');
  for(const[id]of entries)if(!known.has(id))throw new RangeError('Activity ID is outside the fixed roster.');
  const observed=new Map(entries.map(([id,value])=>[id,rawActive(value)])),nextActive=roster.map(id=>observed.get(id)??false),dt=clock===null?0:now-clock;
  const gain=-Math.expm1(-dt/memoryMs),decay=Math.exp(-dt/memoryMs);
  // Exact exponential integration of PREVIOUS observed activity. The active
  // approach form avoids cancellation/overflow; its mathematical bound is tau.
  const nextSpeaking=speaking.map((value,i)=>active[i]?Math.min(memoryMs,value+(memoryMs-value)*gain):value*decay);
  if(nextActive.some((value,i)=>value!==active[i])||nextSpeaking.some((value,i)=>value!==speaking[i]))version++;
  rawQuietSince=nextActive.some(Boolean)?null:rawQuietSince??now;
  active=nextActive;speaking=nextSpeaking;clock=now;return snapshot();
 }
 return Object.freeze({update,snapshot,configuration});
}
