/** Optional HTTP sample clips in the actual photo layouts; never joins a call. */
(() => {
  const panel = document.querySelector('.tuning-grid, #options .options-body');
  const participantList = document.querySelector('.ring, #participants');
  if (!panel || !participantList || document.querySelector('#sample-video-controls')) return;
  const lab = new URL('../http-video-lab/', location.href);
  const section = document.createElement('section');
  section.id = 'sample-video-controls';
  section.className = 'sample-video-controls';
  section.setAttribute('aria-labelledby', 'sample-video-title');
  section.innerHTML = `
    <h2 id="sample-video-title">Example videos</h2>
    <p>Play independent server clips in these exact circles. This is sample playback, not a video call. Names are illustrative.</p>
    <label class="sample-video-quality" for="sample-video-quality"><span>Video quality</span>
      <select id="sample-video-quality"><option value="180p15">180p · 15 fps</option><option value="360p15">360p · 15 fps</option><option value="360p30">360p · 30 fps</option></select>
    </label>
    <button type="button" id="sample-video-toggle" class="sample-video-toggle paper-outline" aria-pressed="false"><span class="paper-stroke" aria-hidden="true"></span><span>Play example videos</span></button>
    <button type="button" id="sample-video-retry" class="sample-video-retry" hidden>Resume blocked videos</button>
    <p id="sample-video-status" role="status">Videos off. Photos are unchanged.</p>
    <p>NASA interview samples show two people, repeated as separately numbered clips with varied offsets. <a href="${new URL('credits.html', lab).href}" target="_blank" rel="noopener">Footage and credits ↗</a> · <a href="${lab.href}" target="_blank" rel="noopener">Detailed video lab ↗</a></p>`;
  panel.append(section);
  const toggle = section.querySelector('#sample-video-toggle');
  const quality = section.querySelector('#sample-video-quality');
  const retry = section.querySelector('#sample-video-retry');
  const status = section.querySelector('#sample-video-status');
  const edgeNote = document.querySelector('.edge-note');
  const originalEdgeNote = edgeNote?.textContent;
  const caption = edgeNote ?? document.createElement('p');
  if (!edgeNote) {
    caption.className = 'sample-video-caption';
    caption.hidden = true;
    participantList.parentElement.append(caption);
  }
  function showCaption(on) {
    if (edgeNote) caption.textContent = on ? 'NASA sample clips · illustrative names' : originalEdgeNote;
    else { caption.hidden = !on; caption.textContent = 'NASA sample clips · illustrative names'; }
  }
  const entries = new Map();
  let enabled = false, loading = false, generation = 0, manifestPromise = null, manifest = null;
  let monitor = null, reconcileQueued = false;

  function images() {
    return [...document.querySelectorAll('.ring .seat .photo > img, #participants .person .portrait > img, .self-view > img')].slice(0, 18);
  }
  function setText(element, value) { if (element.textContent !== value) element.textContent = value; }
  function report() {
    if (!enabled || loading) return;
    const all = [...entries.values()];
    const playing = all.filter(e => e.ready && !e.video.paused && !e.video.ended && !e.video.error).length;
    const failed = all.filter(e => e.failed).length;
    const self = all.some(e => e.self) ? ' Includes the self-view sample.' : '';
    setText(status, `${all.length} requested · ${playing} playing · ${failed} failed.${self}`);
    retry.hidden = !all.some(e => e.blocked);
  }
  function syncVisibility(entry) {
    const selfOff = entry.self && (entry.image.style.visibility === 'hidden' || document.querySelector('#camera-toggle')?.getAttribute('aria-pressed') === 'false');
    const show = entry.ready && !entry.failed && !selfOff;
    entry.video.hidden = !show;
    entry.image.classList.toggle('sample-video-covered', show);
    if (entry.self) entry.video.style.height = entry.image.clientHeight + 'px';
  }
  function retire(entry) {
    entry.active = false;
    for (const [type, handler] of entry.listeners) entry.video.removeEventListener(type, handler);
    entry.video.pause();
    entry.video.removeAttribute('src');
    entry.video.load();
    entry.video.remove();
    entry.image.classList.remove('sample-video-covered');
    resize?.unobserve(entry.image);
    entry.selfObserver?.disconnect();
  }
  function clearEntries() { for (const entry of entries.values()) retire(entry); entries.clear(); }
  function play(entry) {
    entry.blocked = false;
    const result = entry.video.play();
    if (result) result.catch(() => {
      if (!entry.active || !enabled) return;
      entry.blocked = true; entry.failed = true;
      syncVisibility(entry); report();
    });
  }
  function attach(image, file) {
    const video = document.createElement('video');
    video.className = 'sample-video-media';
    video.muted = true; video.defaultMuted = true;
    video.autoplay = true; video.playsInline = true; video.loop = true; video.preload = 'auto';
    video.hidden = true;
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('disablepictureinpicture', '');
    const entry = {image, video, self: image.parentElement.classList.contains('self-view'), ready: false, failed: false, blocked: false, active: true, listeners: [], selfObserver: null, url: file.url};
    if (entry.self) video.classList.add('sample-video-self');
    const listen = (type, handler) => { video.addEventListener(type, handler); entry.listeners.push([type, handler]); };
    const validFrame = () => {
      if (!entry.active || !video.videoWidth || video.readyState < 2) return;
      entry.ready = true;
      if (!video.paused) { entry.failed = false; entry.blocked = false; }
      syncVisibility(entry); report();
    };
    listen('playing', () => {
      validFrame();
      report();
    });
    listen('loadeddata', validFrame);
    listen('error', () => { if (!entry.active) return; entry.failed = true; syncVisibility(entry); report(); });
    listen('pause', report); listen('waiting', report);
    image.insertAdjacentElement('afterend', video);
    entries.set(image, entry);
    resize?.observe(image);
    if (entry.self) {
      entry.selfObserver = new MutationObserver(() => syncVisibility(entry));
      entry.selfObserver.observe(image, {attributes: true, attributeFilter: ['style']});
    }
    video.src = new URL(file.url, lab).href;
    play(entry);
  }
  function reconcile() {
    if (!enabled || !manifest) return;
    const wanted = images();
    const keep = new Set(wanted);
    for (const [image, entry] of entries) if (!keep.has(image)) { retire(entry); entries.delete(image); }
    const files = manifest.files.filter(f => f.kind === 'faces' && f.preset === quality.value).sort((a, b) => a.stream - b.stream);
    wanted.forEach((image, index) => {
      if (entries.has(image)) return;
      // The self-view survives roster changes. Reserve the final clip for it.
      const file = image.parentElement.classList.contains('self-view') ? files.at(-1) : files[index];
      attach(image, file);
    });
    report();
  }
  function queueReconcile() {
    if (!enabled || reconcileQueued) return;
    reconcileQueued = true;
    queueMicrotask(() => { reconcileQueued = false; reconcile(); });
  }
  async function loadManifest() {
    if (!manifestPromise) manifestPromise = fetch(new URL('media-manifest.json', lab), {credentials: 'omit'}).then(response => {
      if (!response.ok) throw Error('Sample video manifest unavailable');
      return response.json();
    }).then(value => {
      if (value.schema !== 'circleup.http-fixtures.v1' || !Array.isArray(value.files)) throw Error('Invalid sample video manifest');
      for (const preset of ['180p15', '360p15', '360p30']) {
        const files = value.files.filter(f => f.kind === 'faces' && f.preset === preset);
        const urls = new Set(); const streams = new Set();
        for (const file of files) {
          if (typeof file.url !== 'string' || !/^media\/[a-z0-9-]+\.mp4$/.test(file.url) || !Number.isInteger(file.stream) || file.stream < 1 || file.stream > 18) throw Error('Invalid sample video file');
          urls.add(file.url); streams.add(file.stream);
        }
        if (files.length !== 18 || urls.size !== 18 || streams.size !== 18) throw Error('Sample set is incomplete');
      }
      return value;
    });
    return manifestPromise;
  }
  async function enable() {
    enabled = true; loading = true; const request = ++generation;
    toggle.setAttribute('aria-pressed', 'true');
    setText(toggle.querySelector('span:last-child'), 'Stop example videos');
    setText(status, 'Loading sample clips…');
    try {
      const value = await loadManifest();
      if (!enabled || generation !== request) return;
      manifest = value; loading = false; showCaption(true); reconcile();
      monitor = setInterval(report, 1000);
    } catch {
      if (!enabled || generation !== request) return;
      disable('Sample videos could not load. Photos are unchanged. Try again when the video lab is available.');
      manifestPromise = null;
    }
  }
  function disable(message = 'Videos off. Photos are unchanged.') {
    enabled = false; loading = false; generation++;
    clearInterval(monitor); monitor = null;
    clearEntries(); retry.hidden = true; showCaption(false);
    toggle.setAttribute('aria-pressed', 'false');
    setText(toggle.querySelector('span:last-child'), 'Play example videos');
    setText(status, message);
  }
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(changes => {
    for (const {target} of changes) { const entry = entries.get(target); if (entry) syncVisibility(entry); }
  }) : null;
  const observer = new MutationObserver(queueReconcile);
  observer.observe(participantList, {childList: true});
  toggle.addEventListener('click', () => enabled ? disable() : void enable());
  quality.addEventListener('change', () => { if (enabled && manifest) { clearEntries(); reconcile(); } });
  retry.addEventListener('click', () => { for (const entry of entries.values()) if (entry.blocked) play(entry); report(); });
  window.addEventListener('pagehide', () => { disable(); observer.disconnect(); resize?.disconnect(); });
  window.addEventListener('pageshow', event => { if (event.persisted) observer.observe(participantList, {childList: true}); });
})();
