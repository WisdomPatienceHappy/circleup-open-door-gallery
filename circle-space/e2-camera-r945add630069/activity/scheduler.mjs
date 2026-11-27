/** Host-private finite-utterance scheduler. Only starts due NOW leave this closure. */
const MODES=new Set(['natural','pair','overlap','silence']);
const KINDS=new Set(['statement','reply','interjection']);
const randomFor=seed=>{let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};};
export function createUtteranceScheduler({participants,seed=17}={}){
 if(!Array.isArray(participants)||participants.length<2||participants.length>18)throw RangeError('Use 2–18 participants.');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw RangeError('Seed must be an unsigned32 integer.');
 const unique=new Set();
 const people=participants.map(p=>{
  if(typeof p?.id!=='string'||!p.id.trim()||unique.has(p.id))throw TypeError('Unique nonempty participant IDs required.');unique.add(p.id);
  if(!Array.isArray(p.clips)||!p.clips.length||p.clips.length>12)throw RangeError('Use1–12 finite clips per participant.');
  const keys=new Set();
  const clips=p.clips.map(c=>{
   if(typeof c?.key!=='string'||!c.key.trim()||keys.has(c.key)||!KINDS.has(c.kind))throw TypeError('Unique clip keys and known kinds required.');keys.add(c.key);
   if(!Number.isFinite(c.durationMs)||c.durationMs<250||c.durationMs>6000)throw RangeError('Each utterance must contain250–6000ms of PCM.');
   return{key:c.key,kind:c.kind,durationMs:c.durationMs};
  });return{id:p.id,clips};
 });
 const ids=people.map(p=>p.id),byId=new Map(people.map(p=>[p.id,p]));
 let rng,mode='natural',pending=[],notBefore=0,last=0,bag=[],cycle=0,primaryOrdinal=0,cycleStarts=0,motifs=[],pairBouts=0,overlapBouts=0,serial=0;
 const shuffle=values=>{const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const between=(a,b)=>a+rng()*(b-a);
 const clip=(id,kind)=>{const all=byId.get(id).clips,matching=all.filter(c=>c.kind===kind),choices=matching.length?matching:all;return choices[Math.floor(rng()*choices.length)];};
 function add(id,kind,at,{primary=true,cycle:observedCycle=null}={}){const c=clip(id,kind);pending.push({id,key:c.key,at,serial:serial++,primary,cycle:observedCycle});return at+c.durationMs;}
 function setup(now){pending=[];notBefore=last=now;bag=[];cycle=primaryOrdinal=cycleStarts=0;motifs=[];pairBouts=overlapBouts=serial=0;}
 function observedTime(now){if(!Number.isFinite(now)||now<0)throw RangeError('Finite nonnegative observed audio time required.');}
 function setScenario(next,now=last){if(!MODES.has(next))throw RangeError('Unknown conversation scenario.');observedTime(now);if(now<last)throw RangeError('Observed audio time must be monotonic.');mode=next;setup(now);}
 function reset(now=0){observedTime(now);rng=randomFor(seed);setup(now);}
 // Bouts never cross a bag boundary or begin before all prior jobs/sources drain.
 // Bag selection stays private; audit counters increment only for emitted starts.
 function takePrimary(count){if(!bag.length){bag=shuffle(ids);cycle++;cycleStarts=0;}return bag.splice(0,Math.min(count,bag.length));}
 function makeBout(now){
  if(mode==='pair'){
   const a=ids[0],b=ids[1];let end=add(a,'statement',now+150),bAt=end+between(180,450);end=add(b,'reply',bAt);
   if(ids.length>2&&pairBouts%2===0)add(ids[2+Math.floor(pairBouts/2)%(ids.length-2)],'interjection',bAt+450,{primary:false});
   end=add(a,'reply',end+between(180,450));end=add(b,'statement',end+between(180,450));notBefore=end+between(350,850);pairBouts++;return;
  }
  if(mode==='overlap'){
   const chosen=takePrimary(overlapBouts++%2===0?2:3);let end=now;
   chosen.forEach((id,i)=>{end=Math.max(end,add(id,'reply',now+i*260,{cycle}));});notBefore=end+between(350,750);return;
  }
  if(!motifs.length)motifs=shuffle(['dialogue','interruption','triple','quiet','single']);const motif=motifs.shift();
  if(motif==='quiet'){notBefore=now+between(1200,2400);return;}
  const wanted=motif==='triple'?3:motif==='single'?1:2,chosen=takePrimary(wanted),[a,b]=chosen;let end;
  if(motif==='triple'){
   end=now;chosen.forEach((id,i)=>{end=Math.max(end,add(id,'reply',now+i*280,{cycle}));});
  }else if(motif==='dialogue'&&b){
   end=add(a,'statement',now+100,{cycle});end=add(b,'reply',end+between(160,500),{cycle});end=add(a,'reply',end+between(160,500),{primary:false,cycle});
  }else if(motif==='interruption'&&b){
   end=add(a,'statement',now+100,{cycle});const interjectEnd=add(b,'interjection',now+800,{cycle});end=add(b,'reply',Math.max(end,interjectEnd)+250,{primary:false,cycle});
  }else end=add(a,'statement',now+between(100,400),{cycle});
  notBefore=end+between(300,900);
 }
 function advance(now,busyIds=[]){
  observedTime(now);if(now<last)throw RangeError('Observed audio time must be monotonic.');
  if(!Array.isArray(busyIds)||new Set(busyIds).size!==busyIds.length||busyIds.some(id=>!unique.has(id)))throw TypeError('Busy IDs must be unique configured participants.');
  last=now;if(mode==='silence')return[];const busy=new Set(busyIds);
  if(!pending.length&&!busy.size&&now>=notBefore)makeBout(now);
  const due=[];pending.sort((a,b)=>a.at-b.at||a.serial-b.serial);const keep=[];
  for(const job of pending){
   if(job.at>now||busy.has(job.id)||busy.size>=3){keep.push(job);continue;}
   busy.add(job.id);if(job.primary)primaryOrdinal++;
   due.push({id:job.id,clipKey:job.key,primary:job.primary,cycle:job.cycle,cycleIndex:job.primary&&job.cycle!==null?cycleStarts++:null,primaryOrdinal:job.primary?primaryOrdinal:null});
  }
  pending=keep;return due;
 }
 reset(0);return Object.freeze({advance,setScenario,reset});
}
