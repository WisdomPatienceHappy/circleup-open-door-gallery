/** Fixed CSS-pixel support outside the actual photo radius; no audio/camera authority. */
export function portraitPaintPadding(diameter,{style='warm-echo'}={}){
 if(!Number.isFinite(diameter)||diameter<=0)throw new RangeError('diameter must be finite and positive');
 if(style!=='warm-echo'&&style!=='feather-ink')throw new RangeError('style must be warm-echo or feather-ink');
 return Math.max(style==='warm-echo'?.30*diameter:0,.14*diameter+4,31);
}
