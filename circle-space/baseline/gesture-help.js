/** Shared passive cues: movement is learned only after a real gesture. */
(() => {
  const surface = document.querySelector('.camera');
  const hint = document.querySelector('.orbit-hint');
  const help = document.querySelector('#gesture-help');
  const button = document.querySelector('#gesture-help-button');
  if (!surface || !hint || !help || !button) return;
  const points = new Map();
  let moved = false, zoomed = false, startSpan = null;
  const learned = kind => {
    if (kind === 'drag') moved = true;
    if (kind === 'zoom') zoomed = true;
    hint.querySelector('[data-gesture="drag"]').hidden = moved;
    hint.querySelector('[data-gesture="zoom"]').hidden = zoomed;
    hint.setAttribute('aria-hidden', String(moved && zoomed));
  };
  const span = () => {
    const [a,b] = [...points.values()];
    return a && b ? Math.hypot(a.x-b.x,a.y-b.y) : null;
  };
  surface.addEventListener('pointerdown', e => {
    points.set(e.pointerId, {x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});
    if (points.size === 2) startSpan = span();
  });
  surface.addEventListener('pointermove', e => {
    const point = points.get(e.pointerId); if (!point) return;
    point.x=e.clientX;point.y=e.clientY;
    if (points.size===1 && Math.hypot(point.x-point.startX,point.y-point.startY)>12) learned('drag');
    if (points.size===2 && startSpan!==null && Math.abs(span()-startSpan)>10) learned('zoom');
  });
  const end = e => { points.delete(e.pointerId);startSpan=null; };
  surface.addEventListener('pointerup',end);surface.addEventListener('pointercancel',end);surface.addEventListener('lostpointercapture',end);
  surface.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)learned('zoom');},{passive:true});
  surface.addEventListener('keydown',e=>{if(e.key.startsWith('Arrow'))learned('drag');if(['+','=','-'].includes(e.key))learned('zoom');});
  document.querySelectorAll('#zoom-in,#zoom-out').forEach(b=>b.addEventListener('click',()=>learned('zoom')));
  button.addEventListener('click',()=>help.showModal());
  help.querySelector('button').addEventListener('click',()=>help.close());
  help.addEventListener('click',e=>{if(e.target===help){const r=help.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)help.close();}});
})();
