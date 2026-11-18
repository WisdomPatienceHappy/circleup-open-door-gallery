/* A local-only design demo: no account, ownership, messaging or publishing API. */
const PROFILES = {
  'maya-chen': {kind:'Facilitator',eyebrow:'A PERSON TO GATHER WITH',title:'Maya Chen',subtitle:'Listening, with room for you.',location:'Oakland',detail:'Gentle conversation. A little curiosity.',theme:'forest'},
  'common-table': {kind:'Community',eyebrow:'A COMMUNITY TO COME BACK TO',title:'The Common Table',subtitle:'Make something. Meet someone.',location:'Berkeley',detail:'Creativity, conversation & a shared table.',theme:'plum'},
  'listening-hour': {kind:'Gathering',eyebrow:'AN HOUR TO COME TOGETHER',title:'A little room to listen',subtitle:'A conversation where you can be yourself.',location:'Online',detail:'A fictional gathering · Come as you are.',theme:'clay'},
};
const STORAGE_PREFIX = 'circleup.flyerDraft.v1:';
const SCHEMA = 'circleup.flyer-draft.v1';
const themes = ['forest','plum','clay','cream'];
const query = new URLSearchParams(location.search);
const entityAlias={facilitator:'maya-chen',community:'common-table',gathering:'listening-hour'};
let profileId=Object.hasOwn(PROFILES,query.get('profile'))?query.get('profile'):(Object.hasOwn(entityAlias,query.get('entity'))?entityAlias[query.get('entity')]:'maya-chen');
const drafts=new Map();
const opened=new Set();
const saved=new Set();
const form=document.querySelector('#editor');
const claimDialog=document.querySelector('#claim-dialog');
const boardDialog=document.querySelector('#board-dialog');
const flyer=document.querySelector('#flyer');
let lastDialogTrigger;
let artworkRequest=0;
function readStored(id) {
  try {
    const value=JSON.parse(localStorage.getItem(STORAGE_PREFIX+id));
    if (!value||value.schema!==SCHEMA||value.profileId!==id||value.demo!==true) return null;
    const limits={title:48,subtitle:100,location:45,detail:80};
    const clean={...PROFILES[id],artwork:null};
    for(const [key,limit] of Object.entries(limits))if(typeof value[key]==='string')clean[key]=value[key].slice(0,limit);
    if(themes.includes(value.theme))clean.theme=value.theme;
    if(typeof value.artwork==='string'&&value.artwork.length<3000000&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value.artwork))clean.artwork=value.artwork;
    saved.add(id);return clean;
  } catch {return null;}
}
function getDraft(id=profileId) {
  if(!drafts.has(id))drafts.set(id,readStored(id)||{...PROFILES[id],artwork:null});
  return drafts.get(id);
}
function status(text) {document.querySelector('#save-status').textContent=text;}
function renderFlyer() {
  const value=getDraft();
  flyer.dataset.theme=value.theme;
  flyer.classList.toggle('has-artwork',Boolean(value.artwork));
  document.querySelector('#flyer-eyebrow').textContent=PROFILES[profileId].eyebrow;
  document.querySelector('#flyer-title').textContent=value.title||'Your invitation';
  document.querySelector('#flyer-title').style.fontSize=value.title.length>32?'34px':'';
  document.querySelector('#flyer-subtitle').textContent=value.subtitle;
  document.querySelector('#flyer-location').textContent=`${PROFILES[profileId].kind.toUpperCase()} · ${value.location||'Your corner of the world'}`;
  document.querySelector('#flyer-detail').textContent=value.detail;
  const image=document.querySelector('#flyer-image');
  image.hidden=!value.artwork;
  if(value.artwork)image.src=value.artwork;else image.removeAttribute('src');
  document.querySelector('#flyer-motif').hidden=Boolean(value.artwork);
  document.querySelector('#remove-artwork').hidden=!value.artwork;
  document.querySelector('#preview-status').textContent=opened.has(profileId)?(saved.has(profileId)?'Your saved device draft':'Your live draft preview'):'CircleUp-made example';
  document.querySelector('#profile-kind').textContent=PROFILES[profileId].kind.toUpperCase();
}
function selectProfile(id,updateUrl=true) {
  if(!Object.hasOwn(PROFILES,id))return;
  profileId=id;artworkRequest++;
  const value=getDraft();
  for(const key of ['title','subtitle','location','detail'])form.elements.namedItem(key).value=value[key];
  form.elements.namedItem('theme').value=value.theme;
  document.querySelector('#artwork').value='';
  document.querySelector('#artwork-status').textContent='';status('');
  document.querySelectorAll('[data-profile]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.profile===id)));
  form.hidden=!opened.has(id);
  document.querySelector('#handoff').hidden=opened.has(id);
  document.querySelector('#begin').textContent=saved.has(id)?'Edit your device draft':'Make this flyer yours';
  document.querySelector('#board-caption').textContent=opened.has(id)?'Your voice, in a little space on the board.':'A flyer made from the basics, ready for a personal touch.';
  if(updateUrl){try{const url=new URL(location.href);url.searchParams.set('profile',id);history.replaceState(null,'',url);}catch{}}
  renderFlyer();
}
document.querySelectorAll('[data-profile]').forEach(button=>button.addEventListener('click',()=>selectProfile(button.dataset.profile)));
document.querySelector('#begin').addEventListener('click',event=>{
  lastDialogTrigger=event.currentTarget;
  document.querySelector('#claim-copy').textContent=`This is the ${PROFILES[profileId].kind.toLowerCase()} example for ${PROFILES[profileId].title}. Start with the CircleUp-made design, then add your own words and artwork.`;
  claimDialog.showModal();
});
document.querySelector('#try-editor').addEventListener('click',()=>{
  claimDialog.close();opened.add(profileId);selectProfile(profileId,false);
  form.elements.namedItem('title').focus();
});
form.addEventListener('input',event=>{
  if(!['title','subtitle','location','detail','theme'].includes(event.target.name))return;
  const value=getDraft();value[event.target.name]=event.target.value;
  saved.delete(profileId);status('Unsaved changes · preview only');renderFlyer();
});
form.addEventListener('submit',event=>{
  event.preventDefault();
  const draft=getDraft();
  if(!draft.title.trim()){form.elements.namedItem('title').setCustomValidity('Add a name or flyer title.');form.reportValidity();return;}
  form.elements.namedItem('title').setCustomValidity('');
  const output={schema:SCHEMA,profileId,kind:PROFILES[profileId].kind,title:draft.title,subtitle:draft.subtitle,location:draft.location,detail:draft.detail,theme:draft.theme,artwork:draft.artwork,demo:true,savedAt:new Date().toISOString()};
  try{localStorage.setItem(STORAGE_PREFIX+profileId,JSON.stringify(output));saved.add(profileId);status('Draft saved on this device. Your public flyer has not changed.');renderFlyer();}
  catch{status('This browser couldn’t save the draft. Keep this tab open or download your flyer. Nothing was published.');}
});
form.elements.namedItem('title').addEventListener('input',()=>form.elements.namedItem('title').setCustomValidity(''));
document.querySelector('#artwork').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  const output=document.querySelector('#artwork-status');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){output.textContent='Choose a PNG, JPEG or WebP image under 2 MB.';event.target.value='';return;}
  const request=++artworkRequest;const id=profileId;
  try{
    output.textContent='Adding your artwork…';
    const image=await createImageBitmap(file);
    if(image.width*image.height>30000000){image.close();throw new Error('Too many pixels');}
    const ratio=Math.min(1,1000/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
    if(request!==artworkRequest||id!==profileId)return;
    getDraft().artwork=canvas.toDataURL(file.type==='image/png'?'image/png':'image/jpeg',.86);saved.delete(id);output.textContent='Artwork added to this local preview.';status('Unsaved artwork · preview only');renderFlyer();
  }catch{if(request===artworkRequest)output.textContent='That image couldn’t be opened. Try a smaller PNG, JPEG or WebP.';}
});
document.querySelector('#remove-artwork').addEventListener('click',()=>{
  artworkRequest++;getDraft().artwork=null;saved.delete(profileId);document.querySelector('#artwork').value='';document.querySelector('#artwork-status').textContent='CircleUp design restored.';status('Unsaved changes · preview only');renderFlyer();
});
document.querySelector('#reset').addEventListener('click',()=>{
  artworkRequest++;try{localStorage.removeItem(STORAGE_PREFIX+profileId);}catch{}
  drafts.set(profileId,{...PROFILES[profileId],artwork:null});saved.delete(profileId);selectProfile(profileId,false);status('This example is reset. Other device drafts are unchanged.');
});
document.querySelector('#board-preview').addEventListener('click',event=>{
  lastDialogTrigger=event.currentTarget;
  const copy=flyer.cloneNode(true);copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  document.querySelector('#mini-board').replaceChildren(copy);boardDialog.showModal();
});
document.querySelectorAll('dialog .close').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
for(const dialog of [claimDialog,boardDialog])dialog.addEventListener('close',()=>{if(lastDialogTrigger?.isConnected&&!lastDialogTrigger.hidden)lastDialogTrigger.focus();});
document.querySelector('#download').addEventListener('click',async()=>{
  const button=document.querySelector('#download');button.disabled=true;
  try{
    await document.fonts.ready;
    const value={...getDraft()};const colors={forest:['#263d33','#fff0d0'],plum:['#603f54','#fff0d0'],clay:['#b86849','#fff4df'],cream:['#ede3bd','#263d33']};
    const [background,ink]=colors[value.theme];const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1350;const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=ink;
    const text=(words,x,y,width,font,lineHeight)=>{ctx.font=font;const lines=[];let line='';for(const word of words.split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);for(const row of lines){ctx.fillText(row,x,y);y+=lineHeight;}return y;};
    text(PROFILES[profileId].eyebrow,75,95,750,'500 20px Inter',26);
    if(value.artwork){const image=new Image();image.src=value.artwork;await image.decode();const scale=Math.min(750/image.width,330/image.height);ctx.drawImage(image,75+(750-image.width*scale)/2,140,image.width*scale,image.height*scale);}else{ctx.strokeStyle=ink;ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(365+i*85,290,115,0,Math.PI*2);ctx.stroke();}}
    ctx.fillStyle=ink;let y=text(value.title||'Your invitation',75,565,750,(value.title.length>26?'500 80px Cormorant':'500 110px Cormorant'),(value.title.length>26?78:99));y=text(value.subtitle,75,y+32,750,'400 34px Cormorant',41);
    ctx.fillRect(75,Math.max(1010,y+28),750,1);text(`${PROFILES[profileId].kind.toUpperCase()} · ${value.location}`,75,Math.max(1080,y+80),750,'500 22px Inter',30);text(value.detail,75,Math.max(1150,y+130),750,'400 23px Inter',31);text('CircleUp · Come together.',75,1290,750,'400 23px Inter',30);
    const link=document.createElement('a');link.download=`circleup-${profileId}-device-draft.png`;link.href=canvas.toDataURL('image/png');link.click();status('Flyer PNG downloaded from this draft. Nothing was published.');
  }catch{status('The download couldn’t be made. Your draft is still here.');}finally{button.disabled=false;}
});
window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.search).get('profile');if(Object.hasOwn(PROFILES,id))selectProfile(id,false);});
selectProfile(profileId,false);
