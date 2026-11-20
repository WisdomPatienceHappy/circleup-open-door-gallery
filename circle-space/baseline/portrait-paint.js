/* Isolated paint. No camera, seat coordinates, speech detection or stick authority.
 * Feather/contour geometry adapted from circle-edges-2026-11-19/edge-component.js.
 */
(function (global) {
  'use strict';
  const clamp = x => Math.max(0, Math.min(1, Number(x) || 0));
  const markup = `<svg class="conversation-ink" viewBox="0 0 110 110" aria-hidden="true" focusable="false">
    <path class="paint-contour" d="M55 5.5 C83 4.7 103.9 25.8 104.6 53.8 C105.2 81.2 83.5 104.9 55.8 104.3 C28.1 105.4 5.7 84.1 5.1 56.1 C4.4 29.4 27 5.1 55 5.5Z"/>
    <path class="paint-echo" d="M27 12 C52 -2 81 5 97 25 M107 48 C112 77 94 103 66 108 M43 108 C17 104 0 80 1 56 C0 41 7 26 17 17"/>
    <g class="paint-voice" style="--pose-opacity:1"><path d="M87 6 Q89 3 90 1 M98 15 Q101 13 103 12 M105 28 L110 27"/></g>
    <g class="paint-voice"><path d="M86 6 Q88 2 90 0 M98 15 Q101 12 105 11 M106 28 Q109 27 112 27"/></g>
    <g class="paint-voice"><path d="M86 6 Q88 1 91 -1 M98 15 Q102 11 106 10 M106 28 Q110 26 114 27"/></g>
    <g class="paint-voice"><path d="M86 6 Q89 0 92 -3 M98 15 Q103 10 108 9 M106 28 Q111 25 116 26"/></g>
    <path class="paint-held-ring" d="M53 1 C84 0 109 25 109 55 C110 85 85 109 55 109 C24 110 1 86 1 55 C0 25 24 1 53 1Z"/>
    <g class="paint-stick"><path d="M7 3 Q10 7 17 16 M6 4 L10 1 M10 9 L14 5 M13 12 L10 15"/><path d="M8 2 L17 15"/></g>
    <image class="paint-stick-image" x="-5" y="-7" width="28" height="28" preserveAspectRatio="xMidYMid meet"/>
  </svg>`;

  function create(options = {}) {
    const getSeats = options.getSeats || (() => document.querySelectorAll('.ring .seat'));
    const getSpeaker = options.getSpeaker || (() => null);
    const getHolder = options.getHolder || (() => null);
    const getId = options.getId || ((seat, index) => seat.dataset.person ?? seat.dataset.index ?? index);
    const prefersReduced = () => global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mounted = new Map();
    let level = 0, lastTime = null, destroyed = false, imageURL = null, generation = 0;
    let showRing = options.holderRing !== false;
    let lastSnapshot = {speaker: null, holder: null, amplitude: 0, reducedMotion: prefersReduced(), seats: 0};
    const same = (a, b) => a != null && b != null && String(a) === String(b);

    function unmount(seat, state) {
      state.svg.remove();
      ['data-conversation-paint', 'data-paint-speaking', 'data-paint-holder', 'data-paint-holder-ring', 'data-paint-image'].forEach(name => seat.removeAttribute(name));
      if (state.description == null) seat.removeAttribute('aria-description');
      else seat.setAttribute('aria-description', state.description);
      mounted.delete(seat);
    }
    function mount(seat) {
      if (mounted.has(seat)) return mounted.get(seat);
      const photo = seat.querySelector('.photo, .portrait');
      if (!photo) return null;
      photo.insertAdjacentHTML('beforeend', markup);
      const svg = photo.lastElementChild;
      const state = {svg, poses: [...svg.querySelectorAll('.paint-voice')], image: svg.querySelector('image'), description: seat.getAttribute('aria-description')};
      if (imageURL) state.image.setAttribute('href', imageURL);
      seat.setAttribute('data-conversation-paint', '');
      mounted.set(seat, state);
      return state;
    }
    function update(timeMs = performance.now(), amplitude = 0) {
      if (destroyed) return lastSnapshot;
      const time = Number.isFinite(timeMs) ? timeMs : performance.now();
      const dt = lastTime == null ? 0 : Math.min(.1, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      level += (clamp(amplitude) - level) * (1 - Math.exp(-dt / .16));
      const speaker = getSpeaker(), holder = getHolder(), reducedMotion = prefersReduced();
      const seats = [...getSeats()];
      const live = new Set(seats);
      for (const [seat, state] of mounted) if (!live.has(seat)) unmount(seat, state);
      // At silence retain a subtle drawn pose; do not animate the whole portrait.
      const position = reducedMotion ? 1 : Math.min(3, Math.max(0, level * 2.7 + Math.sin(time / 620) * .12));
      for (let i = 0; i < seats.length; i++) {
        const seat = seats[i], state = mount(seat);
        if (!state) continue;
        const id = getId(seat, i), speaking = same(id, speaker), holding = same(id, holder);
        seat.toggleAttribute('data-paint-speaking', speaking);
        seat.toggleAttribute('data-paint-holder', holding);
        seat.toggleAttribute('data-paint-holder-ring', holding && showRing);
        seat.toggleAttribute('data-paint-image', Boolean(imageURL));
        seat.setAttribute('aria-description', [speaking ? 'Speaking' : 'Listening', holding ? 'Holding the stick' : ''].filter(Boolean).join('; '));
        state.poses.forEach((pose, n) => pose.style.setProperty('--pose-opacity', String(Math.max(0, 1 - Math.abs(position - n)))));
        state.svg.style.setProperty('--paint-breath', String(reducedMotion || !speaking ? .7 : .7 + level * .2));
      }
      lastSnapshot = {speaker, holder, amplitude: level, reducedMotion, seats: seats.length, stickImage: Boolean(imageURL), holderRing: showRing};
      return {...lastSnapshot};
    }
    async function setStickImage(file) {
      if (destroyed) throw new Error('Portrait paint has been destroyed.');
      const token = ++generation;
      if (file == null) {
        if (imageURL) URL.revokeObjectURL(imageURL);
        imageURL = null;
        for (const state of mounted.values()) state.image.removeAttribute('href');
        update(lastTime ?? performance.now(), level);
        return;
      }
      if (!(file instanceof Blob) || !/^image\//.test(file.type)) throw new TypeError('Choose an image file.');
      const candidate = URL.createObjectURL(file);
      try {
        await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = resolve;
          image.onerror = () => reject(new Error('This image could not be decoded.'));
          image.src = candidate;
        });
        if (destroyed || token !== generation) { URL.revokeObjectURL(candidate); return; }
        if (imageURL) URL.revokeObjectURL(imageURL);
        imageURL = candidate;
        for (const state of mounted.values()) state.image.setAttribute('href', imageURL);
        update(lastTime ?? performance.now(), level);
      } catch (error) { URL.revokeObjectURL(candidate); throw error; }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; generation++;
      if (imageURL) URL.revokeObjectURL(imageURL);
      imageURL = null;
      for (const [seat, state] of mounted) unmount(seat, state);
    }
    return Object.freeze({update, setStickImage, setHolderRing(value) { showRing = Boolean(value); update(lastTime ?? performance.now(), level); }, snapshot: () => ({...lastSnapshot}), destroy});
  }
  global.CircleUpPortraitPaint = Object.freeze({create});
})(window);
