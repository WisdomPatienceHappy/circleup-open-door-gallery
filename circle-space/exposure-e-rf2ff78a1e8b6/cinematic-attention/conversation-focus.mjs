/** Pure causal conversation focus membership. Caller owns speech, owner and all camera/paint execution. */
const defaults=Object.freeze({pairWindowMs:12000,overlapMs:350,thirdSustainMs:1800,thirdTurns:2,monologueMs:8000,silenceGraceMs:4000,focusIdleMs:8000,minFocusResidenceMs:1200,replacementConfirmMs:350});
const keyOf=id=>{
 if(typeof id==='string'&&id.length)return'string:'+id;
 if(typeof id==='number'&&Number.isSafeInteger(id))return'number:'+id;
 throw new TypeError('IDs must be nonempty strings or safe integers.');
};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const same=(a,b)=>a.length===b.length&&a.every((k,i)=>k===b[i]);
function readActivity(activity){
 const entries=activity instanceof Map?[...activity]:activity&&typeof activity==='object'&&!Array.isArray(activity)?Object.entries(activity):null;
 if(!entries)throw new TypeError('A complete roster activity Map or record is required.');
 const result=new Map();
 for(const[id,value]of entries){
  let active;
  if(typeof value==='boolean')active=value;
  else if(typeof value==='number'&&Number.isFinite(value))active=value>0;
  else if(value&&typeof value==='object'&&typeof value.active==='boolean')active=value.active;
  else throw new TypeError('Activity values must be booleans, finite levels or records with boolean active.');
  result.set(keyOf(id),{id,active});
 }
 return result;
}

export function createConversationFocus(options={}){
 const config={};
 for(const name of Object.keys(defaults))config[name]=options[name]??defaults[name];
 for(const[name,value]of Object.entries(config))if(!Number.isFinite(value)||value<0||name==='pairWindowMs'&&value===0)throw new RangeError('Focus timings must be finite nonnegative milliseconds; pair window must be positive.');
 if(!Number.isSafeInteger(config.thirdTurns)||config.thirdTurns<2)throw new RangeError('thirdTurns must be an integer of at least two.');
 let clock=null,ownerKey=null,ownerId=null,lastTalker=null,lastTalkerAt=null;
 let people=new Map(),turns=[],edges=[],focus=[],joined=new Map(),version=0,focusSince=null,silenceSince=null,monoKey=null,monoSince=null,pending=null;
 let last={focusIds:[],version:0,changed:false,reason:'not-updated',observedActiveIds:[],ownerId:null,unframedActiveIds:[]};
 const validateTime=now=>{if(!Number.isFinite(now)||clock!==null&&now<clock)throw new RangeError('One finite monotonic millisecond clock is required.');};
 function trimEvidence(now){const since=now-config.pairWindowMs;turns=turns.filter(t=>t.at>=since).slice(-512);edges=edges.filter(e=>e.at>=since&&e.fromAt>=since).slice(-512);}
 function observe(id,now){
  validateTime(now);const key=id===null?null:keyOf(id);
  if(key!==ownerKey){
   ownerKey=key;ownerId=id;
   if(key!==null){
    turns.push({key,id,at:now});
    if(lastTalker!==null&&lastTalker!==key)edges.push({from:lastTalker,to:key,fromAt:lastTalkerAt,at:now});
    lastTalker=key;lastTalkerAt=now;
   }
  }
  trimEvidence(now);clock=now;return id;
 }
 function reciprocal(anchor,now){
  if(anchor===null)return null;
  const partners=new Map(),since=now-config.pairWindowMs;
  for(const e of edges){
   if(e.at<since||e.fromAt<since||!people.has(e.from)||!people.has(e.to))continue;
   const other=e.from===anchor?e.to:e.to===anchor?e.from:null;if(other===null)continue;
   const p=partners.get(other)??{key:other,out:false,back:false,at:-Infinity};
   if(e.from===anchor)p.out=true;else p.back=true;p.at=Math.max(p.at,e.at);partners.set(other,p);
  }
  const found=[...partners.values()].filter(p=>p.out&&p.back).sort((a,b)=>b.at-a.at||compare(a.key,b.key))[0];
  return found?[anchor,found.key].sort(compare):null;
 }
 function decision(now,why){
  const active=[...people].filter(([,p])=>p.active).map(([k])=>k).sort(compare);
  last={focusIds:focus.map(k=>people.get(k).id),version,changed:why.changed,reason:why.reason,observedActiveIds:active.map(k=>people.get(k).id),ownerId,unframedActiveIds:active.filter(k=>!focus.includes(k)).map(k=>people.get(k).id)};
  return snapshot();
 }
 function snapshot(){return{...last,focusIds:[...last.focusIds],observedActiveIds:[...last.observedActiveIds],unframedActiveIds:[...last.unframedActiveIds]};}
 function update({now,activity}={}){
  validateTime(now);const input=readActivity(activity),next=new Map(),oldFocus=[...focus];
  for(const[k,p]of input){const old=people.get(k);next.set(k,{...p,activeSince:p.active?(old?.active?old.activeSince:now):null,lastActive:p.active?now:old?.lastActive??null});}
  clock=now;people=next;
  trimEvidence(now);turns=turns.filter(t=>people.has(t.key));edges=edges.filter(e=>people.has(e.from)&&people.has(e.to));
  if(lastTalker!==null&&!people.has(lastTalker)){lastTalker=null;lastTalkerAt=null;}
  else if(lastTalker!==null&&people.get(lastTalker).active)lastTalkerAt=now;
  if(ownerKey!==null&&!people.has(ownerKey)){ownerKey=null;ownerId=null;}
  focus=focus.filter(k=>people.has(k));
  let reason=focus.length!==oldFocus.length?'participant-removed':'focus-held';
  const active=[...people].filter(([,p])=>p.active).map(([k])=>k).sort(compare),ownerActive=ownerKey!==null&&people.get(ownerKey)?.active;
  if(focus.length!==oldFocus.length){focusSince=now;pending=null;}
  if(active.length===0){
   monoKey=null;monoSince=null;pending=null;silenceSince??=now;
   if(now-silenceSince>=config.silenceGraceMs){focus=[];turns=[];edges=[];lastTalker=null;lastTalkerAt=null;reason='silence-expired';}
   else if(reason!=='participant-removed')reason='silence-grace';
  }else{
   silenceSince=null;
   const only=active.length===1&&ownerActive&&active[0]===ownerKey?ownerKey:null;
   if(only===null){monoKey=null;monoSince=null;}else if(monoKey!==only){monoKey=only;monoSince=now;}
   if(only!==null&&focus.length>1&&now-monoSince>=config.monologueMs){focus=[only];reason='sustained-monologue';turns=[];edges=[];lastTalker=only;lastTalkerAt=now;}
   else if(focus.length<2){
    const exchange=ownerActive?reciprocal(ownerKey,now):null;
    if(exchange){focus=exchange;reason='reciprocal-exchange';}
    else{
     if(ownerActive){focus=[ownerKey];reason='canonical-owner';}
     const anchor=ownerActive?ownerKey:focus[0],qualified=active.filter(k=>now-people.get(k).activeSince>=config.overlapMs);
     if(anchor!==undefined&&qualified.includes(anchor)){
      const partner=qualified.filter(k=>k!==anchor).sort((a,b)=>people.get(a).activeSince-people.get(b).activeSince||compare(a,b))[0];
      if(partner!==undefined){focus=[anchor,partner].sort(compare);reason='measured-overlap';}
     }
    }
   }else{
    // The incumbents hold through a brief outsider. Evidence qualifies a
    // third participant, never a louder-amplitude winner.
    if(focus.length===2){
     const since=Math.max(focusSince??now,now-config.pairWindowMs),qualified=[];
     for(const[k,p]of people){if(focus.includes(k))continue;
      const starts=turns.filter(t=>t.key===k&&t.at>=since),sustain=p.active&&now-p.activeSince>=config.thirdSustainMs?p.activeSince+config.thirdSustainMs:Infinity,repeat=starts.length>=config.thirdTurns?starts[config.thirdTurns-1].at:Infinity,at=Math.min(sustain,repeat);
      if(Number.isFinite(at))qualified.push({key:k,at});
     }
     qualified.sort((a,b)=>a.at-b.at||compare(a.key,b.key));
     if(qualified.length){focus=[...focus,qualified[0].key].sort(compare);reason='third-participant';}
    }
    // Lease expiry prevents a quiet full group from permanently excluding
    // a different already-observed conversation. No continuous reranking.
    if(same(focus,oldFocus)){
     const replacement=ownerActive?reciprocal(ownerKey,now):null,engaged=replacement?.some(k=>people.get(k).active);
     const leaving=replacement?focus.filter(k=>!replacement.includes(k)):[],stale=leaving.length>0&&leaving.every(k=>{
      let evidence=Math.max(joined.get(k)??now,people.get(k).lastActive??-Infinity);for(const t of turns)if(t.key===k)evidence=Math.max(evidence,t.at);return now-evidence>=config.focusIdleMs;
     });
     if(replacement&&engaged&&stale&&now-(focusSince??now)>=config.minFocusResidenceMs){
      if(!pending||!same(pending.keys,replacement))pending={keys:replacement,since:now};
      if(now-pending.since>=config.replacementConfirmMs){focus=[...replacement];reason='conversation-shift';pending=null;}else reason='confirming-conversation-shift';
     }else pending=null;
    }
   }
  }
  focus=[...new Set(focus)].sort(compare).slice(0,3);
  const changed=!same(oldFocus,focus);
  if(changed){version++;focusSince=now;pending=null;for(const k of joined.keys())if(!focus.includes(k))joined.delete(k);for(const k of focus)if(!joined.has(k))joined.set(k,now);}
  return decision(now,{changed,reason});
 }
 return Object.freeze({observe,update,snapshot,configuration:Object.freeze({...config,maxFocusIds:3,historyLimit:512})});
}
