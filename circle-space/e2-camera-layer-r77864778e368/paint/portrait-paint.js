/* Selected Warm echo over the retained Feather + ink portrait treatment.
 * Caller-owned participant activity and holder only. No media/camera/authority writes.
 * Watercolor ring/material adapted from warm-echo-circle-2026-11-21/paint/watercolor.js.
 */
(function (global) {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
  const now = () => global.performance?.now?.() ?? 0;
  let serial = 0;
function ring(radius,amp,seed){let points=[];for(let i=0;i<120;i++){const a=i/120*Math.PI*2;const r=radius+amp*(Math.sin(a*3+seed)*.4+Math.cos(a*7+seed*.7)*.27+Math.sin(a*13+.3)*.16+Math.cos(a*19+seed)*.08);points.push([50+Math.cos(a)*r,50+Math.sin(a)*r]);}return points.map((v,i)=>(i?'L':'M')+v.map(x=>x.toFixed(2)).join(' ')).join(' ')+'Z';}
function filter(id,seed,scale=2){return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".038" numOctaves="3" seed="${seed}" result="edge"/><feDisplacementMap in="SourceGraphic" in2="edge" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="bleed"/><feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="3" seed="5" result="pools"/><feColorMatrix in="pools" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .7 .35 0 0 .12" result="pool-alpha"/><feComposite in="bleed" in2="pool-alpha" operator="in" result="pooled"/><feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="2" seed="${seed+3}" result="grain"/><feColorMatrix in="grain" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .25 .25 .25 0 .35" result="pigment"/><feComposite in="pooled" in2="pigment" operator="in"/></filter>`;}
function echoMarkup(){const kind='echo',id='conversation-wc'+(++serial),seed={wash:4,ripples:8,pigment:13,echo:19}[kind];const outer=kind==='pigment'?61:kind==='echo'?62:58;const contour=ring(outer,kind==='pigment'?4:2,seed);const ripple=kind==='ripples'||kind==='echo';const markup=`<svg class="conversation-warm-echo echo-voice" data-kind="${kind}" viewBox="-20 -20 140 140" aria-hidden="true" focusable="false"><defs>${filter(id+'rough',seed,kind==='pigment'?10:7)}<mask id="${id}clear"><rect x="-20" y="-20" width="140" height="140" fill="white"/><circle cx="50" cy="50" r="50.2" fill="black"/></mask><linearGradient id="${id}green"><stop stop-color="var(--warm-echo-start,#c8cfa6)"/><stop offset=".5" stop-color="var(--warm-echo-middle,#a4b079)"/><stop offset="1" stop-color="var(--warm-echo-end,#b9c492)"/></linearGradient></defs><g mask="url(#${id}clear)"><g class="wash-breath"><g class="wash-material" filter="url(#${id}rough)">${kind==='echo'?`<path d="${ring(61,3.9,8)}" fill="none" stroke="var(--warm-echo-echo,#d4b67d)" stroke-width="12" opacity=".42"/>`:''}<path d="${ring(55.8,4.5,seed)}" fill="none" stroke="url(#${id}green)" stroke-width="${kind==='pigment'?16:13}" opacity=".8"/><path d="${ring(57.4,4.9,seed+1)}" fill="none" stroke="var(--warm-echo-shade,#9cac71)" stroke-width="${kind==='pigment'?9:6}" opacity="${kind==='pigment'?'.7':'.32'}"/><path d="${ring(53.6,2.7,seed+2)}" fill="none" stroke="var(--warm-echo-highlight,#c9d0a1)" stroke-width="8" opacity=".32"/></g>${kind==='pigment'?`<path class="pool-edge" d="${contour}" fill="none" stroke="#6a7b4f" stroke-width=".55" opacity=".55"/>`:''}</g>${ripple?`<path class="ripple ripple-one" d="${ring(56,1.5,7)}"/><path class="ripple ripple-two" d="${ring(60,1.4,9)}"/>`:''}</g></svg>`;return markup;}

  const inkMarkup = `<svg class="conversation-ink" viewBox="0 0 110 110" aria-hidden="true" focusable="false">
    <path class="paint-contour" d="M55 5.5 C83 4.7 103.9 25.8 104.6 53.8 C105.2 81.2 83.5 104.9 55.8 104.3 C28.1 105.4 5.7 84.1 5.1 56.1 C4.4 29.4 27 5.1 55 5.5Z"/>
    <path class="paint-echo" d="M27 12 C52 -2 81 5 97 25 M107 48 C112 77 94 103 66 108 M43 108 C17 104 0 80 1 56 C0 41 7 26 17 17"/>
    <g class="paint-voice"><path d="M87 6 Q89 3 90 1 M98 15 Q101 13 103 12 M105 28 L110 27"/></g>
    <g class="paint-voice"><path d="M86 6 Q88 2 90 0 M98 15 Q101 12 105 11 M106 28 Q109 27 112 27"/></g>
    <g class="paint-voice"><path d="M86 6 Q88 1 91 -1 M98 15 Q102 11 106 10 M106 28 Q110 26 114 27"/></g>
    <g class="paint-voice"><path d="M86 6 Q89 0 92 -3 M98 15 Q103 10 108 9 M106 28 Q111 25 116 26"/></g>
    <path class="paint-held-ring" d="M53 1 C84 0 109 25 109 55 C110 85 85 109 55 109 C24 110 1 86 1 55 C0 25 24 1 53 1Z"/>
  </svg>`;
  const pieceMarkup = '<span class="conversation-piece" aria-hidden="true"><img alt=""></span>';

  function create(options = {}) {
    const getSeats = options.getSeats ?? (() => global.document.querySelectorAll('.ring .seat'));
    const getSpeaker = options.getSpeaker ?? (() => null);
    const getHolder = options.getHolder ?? (() => null);
    const getId = options.getId ?? ((seat, index) => seat.dataset.person ?? seat.dataset.index ?? index);
    const getActivity = options.getActivity;
    for (const callback of [getSeats, getSpeaker, getHolder, getId]) if (typeof callback !== 'function') throw new TypeError('Paint callbacks must be functions.');
    if (getActivity !== undefined && typeof getActivity !== 'function') throw new TypeError('getActivity must be a callback.');
    const style = options.style ?? 'warm-echo';
    if (!['warm-echo', 'feather-ink'].includes(style)) throw new RangeError('Portrait style must be warm-echo or feather-ink.');
    const prefersReduced = () => global.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const mounted = new Map(), levels = new Map();
    let lastTime = null, destroyed = false, imageURL = null, generation = 0;
    let showRing = options.holderRing === true, lastActivity = new Map();
    let lastSnapshot = {speaker: null, speakers: [], holder: null, amplitude: 0, activity: {}, reducedMotion: prefersReduced(), seats: 0, stickImage: false, holderRing: showRing, style, destroyed};
    const key = id => String(id);
    const same = (a, b) => a != null && b != null && key(a) === key(b);

    function activityMap(input, speaker) {
      // Scalar compatibility is deliberately a single-speaker adapter. A map
      // is complete state and never inherits the camera's primary speaker.
      if (typeof input === 'number') return new Map(speaker == null ? [] : [[key(speaker), {active: true, level: clamp(input)}]]);
      if (input == null) return new Map();
      const entries = input instanceof Map ? input : typeof input === 'object' && !Array.isArray(input) ? Object.entries(input) : null;
      if (!entries) throw new TypeError('Activity must be a scalar, Map or participant record.');
      const result = new Map();
      for (const [id, value] of entries) {
        const record = typeof value === 'number' ? {level: value} : value;
        if (!record || typeof record !== 'object' || !Number.isFinite(record.level) || record.active !== undefined && typeof record.active !== 'boolean') throw new TypeError('Each activity entry requires a finite level and optional boolean active.');
        const level = clamp(record.level), active = record.active ?? level > 0;
        result.set(key(id), {active, level: active ? level : 0});
      }
      return result;
    }
    function unmount(seat, state) {
      state.ink.remove(); state.halo.remove(); state.piece.remove();
      for (const name of ['data-conversation-paint', 'data-paint-style', 'data-paint-speaking', 'data-paint-holder', 'data-paint-holder-ring', 'data-paint-image']) seat.removeAttribute(name);
      if (state.description == null) seat.removeAttribute('aria-description'); else seat.setAttribute('aria-description', state.description);
      mounted.delete(seat);
    }
    function mount(seat) {
      if (mounted.has(seat)) return mounted.get(seat);
      const photo = seat.querySelector('.photo, .portrait');
      if (!photo) return null;
      photo.insertAdjacentHTML('beforeend', echoMarkup()); const halo = photo.lastElementChild;
      photo.insertAdjacentHTML('beforeend', inkMarkup); const ink = photo.lastElementChild;
      photo.insertAdjacentHTML('beforeend', pieceMarkup); const piece = photo.lastElementChild;
      const state = {ink, halo, piece, poses: [...ink.querySelectorAll('.paint-voice')], image: piece.querySelector('img'), description: seat.getAttribute('aria-description')};
      if (imageURL) state.image.src = imageURL;
      seat.setAttribute('data-conversation-paint', ''); seat.setAttribute('data-paint-style', style);
      mounted.set(seat, state); return state;
    }
    function render(time, dt, activity, speaker, holder) {
      const reducedMotion = prefersReduced(), seats = [...getSeats()], live = new Set(seats), liveIds = new Set(), records = [];
      for (const [seat, state] of mounted) if (!live.has(seat)) unmount(seat, state);
      for (let i = 0; i < seats.length; i++) {
        const seat = seats[i], id = getId(seat, i), idKey = key(id), input = activity.get(idKey) ?? {active: false, level: 0};
        liveIds.add(idKey);
        const old = levels.get(idKey) ?? 0, tau = input.level > old ? .10 : .28;
        const level = old + (input.level - old) * (1 - Math.exp(-dt / tau)); levels.set(idKey, level);
        const state = mount(seat); if (!state) continue;
        const speaking = input.active, holding = same(id, holder);
        seat.toggleAttribute('data-paint-speaking', speaking); seat.toggleAttribute('data-paint-holder', holding);
        seat.toggleAttribute('data-paint-holder-ring', holding && showRing); seat.toggleAttribute('data-paint-image', holding && Boolean(imageURL));
        seat.setAttribute('aria-description', [speaking ? 'Speaking' : 'Listening', holding ? 'Holding the stick' : ''].filter(Boolean).join('; '));
        const position = reducedMotion ? 1 : Math.min(3, Math.max(0, level * 2.7 + Math.sin(time / 620) * .12));
        state.poses.forEach((pose, n) => pose.style.setProperty('--pose-opacity', String(Math.max(0, 1 - Math.abs(position - n)))));
        state.ink.style.setProperty('--paint-breath', String(reducedMotion || !speaking ? .7 : .7 + level * .2));
        state.halo.style.setProperty('--echo-level', String(speaking ? level : 0));
        state.halo.style.setProperty('--echo-strength', String(speaking ? .25 + .75 * level : 0));
        state.halo.style.setProperty('--echo-scale', String(reducedMotion || !speaking ? 1 : 1 + level * .04));
        records.push({id, active: speaking, level, inputLevel: input.level});
      }
      for (const id of levels.keys()) if (!liveIds.has(id)) levels.delete(id);
      lastSnapshot = {speaker, speakers: records.filter(p => p.active).map(p => p.id), holder, amplitude: speaker == null ? 0 : levels.get(key(speaker)) ?? 0, activity: Object.fromEntries(records.map(p => [key(p.id), {active: p.active, level: p.level, inputLevel: p.inputLevel}])), reducedMotion, seats: mounted.size, stickImage: Boolean(imageURL), holderRing: showRing, style, destroyed};
      return snapshot();
    }
    function update(timeMs = now(), input) {
      if (destroyed) return snapshot();
      const time = Number.isFinite(timeMs) ? timeMs : now(), speaker = getSpeaker(), holder = getHolder();
      const activity = activityMap(arguments.length >= 2 ? input : getActivity ? getActivity() : 0, speaker);
      const dt = lastTime == null ? 0 : Math.min(.1, Math.max(0, (time - lastTime) / 1000)); lastTime = time; lastActivity = activity;
      return render(time, dt, activity, speaker, holder);
    }
    const snapshot = () => ({...lastSnapshot, speakers: [...lastSnapshot.speakers], activity: Object.fromEntries(Object.entries(lastSnapshot.activity).map(([id, state]) => [id, {...state}]))});
    const refresh = () => render(lastTime ?? now(), 0, lastActivity, getSpeaker(), getHolder());
    async function setStickImage(file) {
      if (destroyed) throw new Error('Portrait paint has been destroyed.');
      if (file != null && (!(file instanceof global.Blob) || !/^image\//.test(file.type))) throw new TypeError('Choose an image file.');
      const token = ++generation;
      if (file == null) {
        if (imageURL) global.URL.revokeObjectURL(imageURL); imageURL = null;
        for (const state of mounted.values()) state.image.removeAttribute('src'); refresh(); return;
      }
      const candidate = global.URL.createObjectURL(file);
      try {
        await new Promise((resolve, reject) => {const image = new global.Image(); image.onload = resolve; image.onerror = () => reject(new Error('This image could not be decoded.')); image.src = candidate;});
        if (destroyed || token !== generation) {global.URL.revokeObjectURL(candidate); return;}
        if (imageURL) global.URL.revokeObjectURL(imageURL); imageURL = candidate;
        for (const state of mounted.values()) state.image.src = imageURL; refresh();
      } catch (error) {global.URL.revokeObjectURL(candidate); throw error;}
    }
    function destroy() {
      if (destroyed) return; destroyed = true; generation++;
      if (imageURL) global.URL.revokeObjectURL(imageURL); imageURL = null;
      for (const [seat, state] of mounted) unmount(seat, state);
      levels.clear(); lastActivity.clear(); lastSnapshot = {...lastSnapshot, seats: 0, speakers: [], activity: {}, stickImage: false, destroyed: true};
    }
    return Object.freeze({update, setStickImage, setHolderRing(value) {if (!destroyed) {showRing = Boolean(value); refresh();}}, snapshot, destroy});
  }
  global.CircleUpPortraitPaint = Object.freeze({create, geometry: Object.freeze({haloPaddingFraction: .30, holderImageDiameterRatio: .5, holderImageGapPx: 8})});
})(window);
