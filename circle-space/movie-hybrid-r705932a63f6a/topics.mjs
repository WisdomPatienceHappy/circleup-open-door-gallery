/** Prepared topic deck only. Parent owns per-room storage and visible-center sync. */
function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function textValue(value,{allowBlank=false}={}){
 if(typeof value!=='string')fail('INVALID_TEXT','Each topic must be text.');
 const text=value.trim();
 if(text.length>240)fail('INVALID_TEXT','Keep each topic to 240 characters.');
 if(!allowBlank&&!text)fail('INVALID_TEXT','Give each topic some text.');
 return text;
}
function validateDeck(deck){
 if(!deck||!Array.isArray(deck.topics)||deck.topics.length<1||deck.topics.length>50||!Number.isInteger(deck.index)||deck.index<0||deck.index>=deck.topics.length)fail('INVALID_DECK','Invalid prepared topic deck.');
 const ids=new Set();
 for(const topic of deck.topics){
  if(!topic||typeof topic.id!=='string'||!topic.id||ids.has(topic.id)||typeof topic.text!=='string'||topic.text!==topic.text.trim()||topic.text.length>240||(!topic.text&&deck.topics.length!==1))fail('INVALID_DECK','Invalid prepared topic entry.');
  ids.add(topic.id);
 }
 return deck;
}
export function createTopicDeck(text=''){
 return {topics:[{id:'topic-1',text:textValue(text,{allowBlank:true})}],index:0};
}
export function activeTopic(deck){
 validateDeck(deck);return {...deck.topics[deck.index]};
}
export function updateTopicDeck(deck,event,{role='host'}={}){
 if(role!=='host')fail('HOST_ONLY','Only the host can change prepared topics.');
 validateDeck(deck);
 if(!event||typeof event.type!=='string')fail('INVALID_EVENT','A topic event type is required.');
 const next=structuredClone(deck);
 switch(event.type){
  case 'SET_TOPICS': {
   if(!Array.isArray(event.texts)||event.texts.length<1||event.texts.length>50)fail('INVALID_TOPICS','Prepare 1 to 50 topics.');
   const texts=event.texts.map(text=>textValue(text));
   const used=new Set(next.topics.slice(0,texts.length).map(topic=>topic.id));let serial=1;
   next.topics=texts.map((text,index)=>{
    if(next.topics[index])return {id:next.topics[index].id,text};
    while(used.has('topic-'+serial))serial++;
    const id='topic-'+serial++;used.add(id);return {id,text};
   });
   next.index=Math.min(next.index,next.topics.length-1);break;
  }
  case 'EDIT_CURRENT': next.topics[next.index].text=textValue(event.text);break;
  case 'NEXT': next.index=Math.min(next.topics.length-1,next.index+1);break;
  case 'PREVIOUS': next.index=Math.max(0,next.index-1);break;
  case 'SELECT':
   if(!Number.isInteger(event.index))fail('INVALID_INDEX','Choose a whole topic index.');
   next.index=Math.max(0,Math.min(next.topics.length-1,event.index));break;
  default:fail('UNKNOWN_EVENT','Unknown topic event: '+event.type);
 }
 validateDeck(next);return next;
}
// Short reducer alias for adapters which already call their room reducer `reduce`.
export const reduceTopics=updateTopicDeck;
