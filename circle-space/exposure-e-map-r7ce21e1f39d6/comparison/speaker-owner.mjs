/** Pure causal camera focus selection. This is neither speech detection nor paint/turn authority. */
const finite=Number.isFinite;
function idKey(id){
 if(typeof id==='string'&&id.length)return 'string:'+id;
 if(typeof id==='number'&&Number.isSafeInteger(id))return 'number:'+id;
 throw new TypeError('Participant IDs must be nonempty strings or safe integers.');
}
function nextClock(now,previous){
 if(!finite(now)||previous!==null&&now<previous)throw new RangeError('A finite monotonic millisecond clock is required.');
 return now;
}
function readActivity(input){
 const entries=input instanceof Map?[...input]:input&&typeof input==='object'&&!Array.isArray(input)?Object.entries(input):null;
 if(!entries)throw new TypeError('Activity must be a complete participant Map or record.');
 const result=new Map();
 for(const [id,value]of entries){
  const key=idKey(id),record=typeof value==='number'?{level:value}:value;
  if(!record||typeof record!=='object')throw new TypeError('Each activity value needs a finite level and optional boolean active.');
  const level=record.level,active=record.active;
  if(!finite(level)||active!==undefined&&typeof active!=='boolean')throw new TypeError('Each activity value needs a finite level and optional boolean active.');
  result.set(key,{id,key,level:Math.max(0,Math.min(1,level)),explicitActive:active});
 }
 return result;
}

export function createSpeakerOwner(options={}){
 const config={onThreshold:.08,offThreshold:.04,attackMs:200,releaseMs:600,minHoldMs:1200,...options};
 if(![config.onThreshold,config.offThreshold].every(x=>finite(x)&&x>=0&&x<=1)||config.offThreshold>config.onThreshold)throw new RangeError('Thresholds must satisfy0<=offThreshold<=onThreshold<=1.');
 if(![config.attackMs,config.releaseMs,config.minHoldMs].every(x=>finite(x)&&x>=0))throw new RangeError('Attack, release and minimum hold must be finite nonnegative milliseconds.');
 let clock=null,participants=new Map(),ownerKey=null,ownerSince=null,reason='not-updated';
 function snapshot(){
  const owner=participants.get(ownerKey);
  return {source:'activity',now:clock,owner:owner?.id??null,ownerActive:owner?.active??false,ownerSince,reason,configuration:{onThreshold:config.onThreshold,offThreshold:config.offThreshold,attackMs:config.attackMs,releaseMs:config.releaseMs,minHoldMs:config.minHoldMs},participants:[...participants.values()].map(p=>({id:p.id,level:p.level,active:p.active,activeSince:p.activeSince,inactiveSince:p.inactiveSince}))};
 }
 function update({now,activity,preferredSpeaker=null}={}){
  nextClock(now,clock);
  const input=readActivity(activity),preferredKey=preferredSpeaker===null?null:idKey(preferredSpeaker),next=new Map();
  // Parse and validate the complete input before committing any state.
  for(const [key,value]of input){
   const old=participants.get(key),active=value.explicitActive??(value.level>0&&value.level>=(old?.active?config.offThreshold:config.onThreshold));
   next.set(key,{...value,active,activeSince:active?(old?.active?old.activeSince:now):null,inactiveSince:active?null:old&&!old.active?old.inactiveSince:now});
  }
  clock=now;participants=next;
  if(ownerKey!==null&&!participants.has(ownerKey)){ownerKey=null;ownerSince=null;reason='owner-removed';}
  const owner=participants.get(ownerKey);
  if(owner?.active){reason='active-owner';return owner.id;}
  if(owner&&now-owner.inactiveSince<config.releaseMs){reason='release-grace';return owner.id;}
  if(owner&&now-ownerSince<config.minHoldMs){reason='minimum-hold';return owner.id;}
  const eligible=[...participants.values()].filter(p=>p.active&&now-p.activeSince>=config.attackMs);
  eligible.sort((a,b)=>a.activeSince-b.activeSince||(a.key<b.key?-1:a.key>b.key?1:0));
  const candidate=eligible.find(p=>p.key===preferredKey)??eligible[0];
  if(candidate){ownerKey=candidate.key;ownerSince=now;reason='selected';return candidate.id;}
  ownerKey=null;ownerSince=null;reason=[...participants.values()].some(p=>p.active)?'awaiting-attack':'silence';return null;
 }
 return Object.freeze({update,snapshot});
}
/** Separate direct path for an already-canonical causal speaker-event stream. */
export function createEventSpeakerOwner(){
 let clock=null,owner=null,ownerSince=null;
 return Object.freeze({
  observe(id,now){nextClock(now,clock);if(id!==null)idKey(id);if(!Object.is(id,owner))ownerSince=id===null?null:now;clock=now;owner=id;return owner;},
  snapshot(){return {source:'events',now:clock,owner,ownerSince};}
 });
}
