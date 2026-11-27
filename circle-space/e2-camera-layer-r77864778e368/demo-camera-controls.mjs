/** Demo-only adapters to the E host API. No camera or speech-memory algorithm lives here. */
export function cameraDemoState({view={},comparison={},tuning={}}={}){
 const strategy=comparison.strategy||tuning.cameraStrategy,isOrbit=['exposure','exposure2'].includes(strategy),supportsMemory=['rolling','exponential'].includes(view.speechMemoryPolicy??view.effectiveSpeechMemoryPolicy??tuning.speechMemoryPolicy);
 const selected=Number.isFinite(view.steadyPitch)?view.steadyPitch:tuning.steadyPitch,current=view.cameraFrame?.pitch;
 return{strategy,isOrbit,supportsMemory,policy:view.speechMemoryPolicy??view.effectiveSpeechMemoryPolicy??tuning.speechMemoryPolicy,memorySeconds:view.memorySeconds??tuning.memorySeconds,selectedDegrees:Number.isFinite(selected)?Math.round(selected*180/Math.PI):null,currentDegrees:Number.isFinite(current)?Math.round(current*180/Math.PI):null,restEnabled:isOrbit&&view.kind==='circle'};
}
export function mountDemoCameraControls({getTuning,setTuning,onError=()=>{}}){
 const $=id=>document.getElementById(id);let tuning=getTuning(),latestView={},latestComparison={};
 const apply=change=>{try{setTuning(change);tuning=getTuning();sync();}catch(error){onError(error.message);}};
 $('demo-rest-angle').addEventListener('input',event=>apply({steadyPitch:Number(event.target.value)*Math.PI/180}));
 for(const button of document.querySelectorAll('[data-demo-camera-strategy]'))button.addEventListener('click',()=>apply({cameraStrategy:button.dataset.demoCameraStrategy}));
 $('speech-memory-policy').addEventListener('change',event=>apply({speechMemoryPolicy:event.target.value}));
 $('demo-preview-height').addEventListener('input',event=>{const value=Number(event.target.value);document.body.style.setProperty('--phone-preview-row-height',value+'px');$('demo-preview-height-value').textContent=value+' px';});
 $('demo-preview-placement').addEventListener('change',event=>{document.body.dataset.previewPlacement=event.target.value;});
 // Event at target runs before the preview module's target listener, so placement is source-of-truth first.
 document.body.dataset.previewPlacement='bottom';
 const refresh=()=>{tuning=getTuning();sync();};$('demo-trigger').addEventListener('click',refresh);$('open-tune').addEventListener('click',refresh);$('interest-memory').addEventListener('input',refresh);
 function sync({view,comparison}={}){
  if(view)latestView=view;if(comparison)latestComparison=comparison;const model=cameraDemoState({view:latestView,comparison:latestComparison,tuning});
  for(const button of document.querySelectorAll('[data-camera-strategy=exposure2]'))button.disabled=!model.supportsMemory;
  for(const button of document.querySelectorAll('[data-demo-camera-strategy]')){button.setAttribute('aria-checked',String(button.dataset.demoCameraStrategy===model.strategy));button.disabled=button.dataset.demoCameraStrategy==='exposure2'&&!model.supportsMemory;button.title=button.disabled?'E.2 requires the experimental camera host.':'';}
  $('demo-rest-angle').disabled=!model.restEnabled;if(model.selectedDegrees!==null){$('demo-rest-angle').value=model.selectedDegrees;$('demo-rest-angle-value').textContent=model.selectedDegrees+'°';$('demo-rest-angle-value').setAttribute('aria-label','Rest angle '+model.selectedDegrees+' degrees');}
  $('demo-rest-current').textContent=model.restEnabled&&model.currentDegrees!==null?'Current '+model.currentDegrees+'°':'Choose Cinematic with E or E.2 to adjust the rest angle.';
  $('speech-memory-policy').disabled=!model.supportsMemory||!model.isOrbit;if(model.supportsMemory)$('speech-memory-policy').value=model.policy;
  const allowMemory=model.strategy==='recent'||model.isOrbit&&model.supportsMemory;$('interest-memory').disabled=!allowMemory;$('interest-memory').title=allowMemory?'Speaking history measured in elapsed seconds':'Available in A or the E/E.2 experiment';
  $('speech-memory-help').textContent=model.supportsMemory?'Same memory for E and E.2. Rolling expires old speech after '+model.memorySeconds+' s; exponential keeps a fading tail.':'Memory policy becomes available in the E.2 experimental host.';
 }
 sync();return Object.freeze({sync,refresh});
}
