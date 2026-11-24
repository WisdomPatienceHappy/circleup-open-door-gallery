/** Select-only paper picker. The original select remains the mode-change adapter. */
import {ink} from './ink.mjs?v=48243700e9ed';
export function createViewPicker(select){
 const wrapper=document.createElement('div');wrapper.className='view-picker';
 const trigger=document.createElement('button');trigger.type='button';trigger.id='view-picker-trigger';trigger.className='view-picker-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-label','View perspective');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','view-picker-options');
 const label=document.createElement('span');label.className='view-picker-label';const caret=document.createElementNS('http://www.w3.org/2000/svg','svg');caret.setAttribute('viewBox','0 0 16 12');caret.setAttribute('aria-hidden','true');caret.innerHTML='<path d="M2 3.5 8 9l6-5.5"/>';trigger.append(label,caret);
 const popup=document.createElement('div');popup.id='view-picker-options';popup.className='view-picker-popover field-wrap';popup.setAttribute('role','listbox');popup.setAttribute('aria-label','Room views');popup.hidden=true;
 const options=[...select.options].map((source,index)=>{const node=document.createElement('div');node.id='view-option-'+source.value;node.className='view-option';node.setAttribute('role','option');node.setAttribute('aria-selected','false');node.dataset.value=source.value;const text=document.createElement('span');text.textContent=source.textContent;const check=document.createElementNS('http://www.w3.org/2000/svg','svg');check.setAttribute('viewBox','0 0 18 18');check.setAttribute('aria-hidden','true');check.classList.add('view-option-check');check.innerHTML='<path d="m3.5 9 3.5 4 7.5-8"/>';node.append(text,check);popup.append(node);return{node,source,index};});
 select.before(wrapper);wrapper.append(select,trigger,popup);select.dataset.customPicker='';select.classList.add('view-picker-native');select.setAttribute('aria-hidden','true');select.removeAttribute('aria-label');select.tabIndex=-1;
 let opened=false,current=null,active=0,typed='',typedAt=0;
 function markActive(index){active=Math.max(0,Math.min(options.length-1,index));for(const option of options)option.node.toggleAttribute('data-active',option.index===active);if(opened)trigger.setAttribute('aria-activedescendant',options[active].node.id);}
 function close(returnFocus=false){const wasOpen=opened;opened=false;typed='';typedAt=0;popup.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');if(wasOpen&&returnFocus)trigger.focus({preventScroll:true});}
 function sync(){trigger.disabled=select.disabled;if(current===select.value)return;current=select.value;const selected=options.find(o=>o.source.value===current)??options[0];label.textContent=selected.source.textContent;for(const option of options)option.node.setAttribute('aria-selected',String(option===selected));markActive(selected.index);if(opened)close();}
 function open(){if(select.disabled)return;sync();opened=true;popup.hidden=false;trigger.setAttribute('aria-expanded','true');markActive(options.findIndex(o=>o.source.value===select.value));ink(wrapper);}
 function choose(index){const option=options[index];if(!option||option.source.disabled)return;close();select.value=option.source.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();trigger.focus({preventScroll:true});}
 trigger.addEventListener('click',()=>{trigger.focus({preventScroll:true});if(opened)close();else open();});
 trigger.addEventListener('keydown',event=>{
  const key=event.key;
  if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(key)){
   event.preventDefault();
   if(key==='Enter'||key===' '){if(opened)choose(active);else open();}
   else if(key==='Home'||key==='End'){if(!opened)open();markActive(key==='Home'?0:options.length-1);}
   else if(!opened)open();else markActive((active+(key==='ArrowDown'?1:-1)+options.length)%options.length);
  }else if(key==='Tab')close();
  else if(key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
   const now=performance.now(),character=key.toLocaleLowerCase();typed=now-typedAt>700?character:typed+character;typedAt=now;if(!opened)open();
   const repeating=[...typed].every(c=>c===character),query=repeating?character:typed,start=repeating?active+1:active;
   for(let i=0;i<options.length;i++){const index=(start+i)%options.length;if(options[index].source.textContent.trim().toLocaleLowerCase().startsWith(query)){markActive(index);break;}}
  }
 });
 options.forEach(option=>{option.node.addEventListener('pointerdown',event=>event.preventDefault());option.node.addEventListener('pointermove',()=>{if(opened)markActive(option.index);});option.node.addEventListener('click',()=>choose(option.index));});
 document.addEventListener('pointerdown',event=>{if(opened&&!wrapper.contains(event.target))close();});
 document.addEventListener('focusin',event=>{if(opened&&!wrapper.contains(event.target))close();});
 // Register before the app's Escape handler so closing this popup doesn't close another panel.
 document.addEventListener('keydown',event=>{if(opened&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);}},true);
 select.addEventListener('change',sync);sync();ink(wrapper);
 return Object.freeze({sync,close});
}
