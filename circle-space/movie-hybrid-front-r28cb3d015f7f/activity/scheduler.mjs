/** Host-private utterance scheduler. Returns starts due NOW, never its pending plan. */
const MODES=new Set(['natural','pair','overlap','silence']);
const randomFor=seed=>{let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};};
export function createUtteranceScheduler({participants,seed=17}){
 if(!Array.isArray(participants)||participants.length<2||participants.length>6)throw RangeError('Use 2–6 participants');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw RangeError('seed must be an unsigned32 integer');
 const people=participants.map(p=>({id:p.id,clips:p.clips.map(c=>({...c}))})),ids=people.map(p=>p.id);
 if(new Set(ids).size!==ids.length)throw TypeError('Unique participant ids required');
 for(const p of people)if(!p.clips.length||p.clips.some(c=>!c.key||!Number.isFinite(c.durationMs)||c.durationMs<250||c.durationMs>6000))throw RangeError('Each utterance must contain250–6000ms of PCM');
 let rng,mode='natural',pending=[],notBefore=0,last=-Infinity,intro=[],motifs=[],pairBouts=0,overlapBouts=0,serial=0;
 const shuffle=values=>{const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const between=(a,b)=>a+rng()*(b-a);
 const clip=(id,kind)=>{const all=people.find(p=>p.id===id).clips,choices=all.filter(c=>c.kind===kind);return(choices.length?choices:all)[Math.floor(rng()*(choices.length||all.length))];};
 function add(id,kind,at){const c=clip(id,kind);pending.push({id,key:c.key,at,serial:serial++});return at+c.durationMs;}
 function setup(now){pending=[];notBefore=now;last=now;intro=shuffle(ids);motifs=[];pairBouts=overlapBouts=0;serial=0;}
 function setScenario(next,now=0){if(!MODES.has(next))throw RangeError('Unknown conversation scenario');if(!Number.isFinite(now))throw TypeError('Finite observed time required');mode=next;setup(now);}
 function reset(now=0){if(!Number.isFinite(now))throw TypeError('Finite observed time required');rng=randomFor(seed);setup(now);}
 function makeBout(now){
  if(mode==='natural'&&intro.length){const id=intro.shift(),end=add(id,intro.length===ids.length-1?'statement':'reply',now+between(100,350));notBefore=end+between(180,550);return;}
  if(mode==='pair'){
   const a=ids[0],b=ids[1];let end=add(a,'statement',now+150),bAt=end+between(180,450);end=add(b,'reply',bAt);
   if(ids.length>2&&pairBouts%2===0)add(ids[2+Math.floor(pairBouts/2)%(ids.length-2)],'interjection',bAt+450);
   end=add(a,'reply',end+between(180,450));end=add(b,'statement',end+between(180,450));notBefore=end+between(350,850);pairBouts++;return;
  }
  const chosen=shuffle(ids);
  if(mode==='overlap'){const n=Math.min(ids.length,overlapBouts++%2===0?2:3);let end=now;for(let i=0;i<n;i++)end=Math.max(end,add(chosen[i],'reply',now+i*260));notBefore=end+between(350,750);return;}
  if(!motifs.length)motifs=shuffle(['dialogue','interruption','triple','quiet','single']);const motif=motifs.shift();
  if(motif==='quiet'){notBefore=now+between(1200,2400);return;}
  const a=chosen[0],b=chosen[1];let end;
  if(motif==='dialogue'){end=add(a,'statement',now+100);end=add(b,'reply',end+between(160,500));end=add(a,'reply',end+between(160,500));}
  else if(motif==='interruption'){end=add(a,'statement',now+100);const interjectEnd=add(b,'interjection',now+800);end=add(b,'reply',Math.max(end,interjectEnd)+250);}
  else if(motif==='triple'){end=now;for(let i=0;i<Math.min(3,ids.length);i++)end=Math.max(end,add(chosen[i],'reply',now+i*280));}
  else end=add(a,'statement',now+between(100,400));
  notBefore=end+between(300,900);
 }
 function advance(now,busyIds=[]){
  if(!Number.isFinite(now)||now<last)throw RangeError('Observed audio time must be monotonic');last=now;
  if(mode==='silence')return[];const busy=new Set(busyIds);
  if(!pending.length&&!busy.size&&now>=notBefore)makeBout(now);
  const due=[];pending.sort((a,b)=>a.at-b.at||a.serial-b.serial);const keep=[];
  for(const job of pending){if(job.at>now||busy.has(job.id)||busy.size>=3){keep.push(job);continue;}busy.add(job.id);due.push({id:job.id,clipKey:job.key});}
  pending=keep;return due;
 }
 reset(0);return Object.freeze({advance,setScenario,reset});
}
