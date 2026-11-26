/** Consumer chrome only. Existing view, mic, room and demo handlers remain authoritative. */
import {ink} from './ink.mjs';
export function mountConsumerChrome({getRole,onHostToolsChange,closeViewPicker}){
 const trigger=document.querySelector('#demo-trigger'),panel=document.querySelector('#demo-panel');
 const hostToggle=document.querySelector('#host-tools-toggle'),roleLabel=document.querySelector('#demo-role-status');
 const center=document.querySelector('#centers');
 document.body.dataset.hostTools='false';
 let open=false;
 function close(returnFocus=false){if(!open)return;open=false;panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(returnFocus)trigger.focus({preventScroll:true});}
 trigger.addEventListener('click',()=>{open=!open;panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open){closeViewPicker();ink(panel);}});
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.demo-disclosure'))close();});
 document.addEventListener('focusin',e=>{if(open&&!e.target.closest('.demo-disclosure'))close();});
 document.addEventListener('keydown',e=>{if(open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close(true);}},true);
 for(const id of ['open-tune','my-circle'])document.querySelector('#'+id).addEventListener('click',()=>{close();if(id==='open-tune')requestAnimationFrame(()=>document.querySelector('#tuning-panel [data-close]')?.focus({preventScroll:true}));else trigger.focus({preventScroll:true});});
 hostToggle.addEventListener('change',()=>{document.body.dataset.hostTools=String(hostToggle.checked&&getRole()==='host');onHostToolsChange();sync();});
 function promptAffordances(){const canEdit=getRole()==='host'&&document.body.dataset.hostTools==='true';for(const node of center.querySelectorAll('.world-center[data-joined=true]>.center-topic-text,.world-center[data-joined=true]>.center-add')){if(!canEdit&&node.classList.contains('center-topic-text')&&node.tagName==='BUTTON'){const text=document.createElement('span');text.className=node.className;text.textContent=node.textContent;text.dataset.centerRoom=node.dataset.centerRoom;node.replaceWith(text);}else if(node.tagName==='BUTTON'){node.disabled=!canEdit;if(canEdit)node.setAttribute('aria-label',node.classList.contains('center-add')?'Add center text':'Edit center text');}}}
 new MutationObserver(promptAffordances).observe(center,{childList:true,subtree:true});
 function sync(){const host=getRole()==='host';hostToggle.disabled=!host;if(!host){hostToggle.checked=false;document.body.dataset.hostTools='false';}roleLabel.textContent='Sample role: '+(host?'Host':'Guest');promptAffordances();}
 sync();ink(document.querySelector('.consumer-header'));
 return Object.freeze({sync,close});
}
