/** Simulated open-time conversation; the live-call view uses real room authority. */
window.CircleUpConversationPreview = Object.freeze({speakingId: () => null, snapshot: () => ({ready:false,running:false,paused:false})});
window.CircleUpConversationPreviewReady = (async () => {
  const {createPrimaryAttention} = await import('./attention-primary/r-ba780d663c8c/room-attention.mjs');
  const grid = document.querySelector('.tuning-grid');
  if (!grid || document.querySelector('#conversation-preview')) return;
  const section = document.createElement('section');
  section.id = 'conversation-preview';
  section.className = 'conversation-preview';
  section.setAttribute('aria-labelledby', 'conversation-preview-title');
  section.innerHTML = `
    <h2 id="conversation-preview-title">Open conversation</h2>
    <p class="tuning-note">Simulated speaker changes. Compare quick back-and-forth with a calmer camera response.</p>
    <label class="tuning-control" for="conversation-trace"><span>Example conversation</span>
      <select id="conversation-trace"><option value="mixed" selected>Whole-circle conversation</option><option value="backforth">Small-group exchange (2–4)</option><option value="sustained">Long turn, then replies</option></select>
    </label>
    <label class="tuning-control" for="conversation-speed"><span>Conversation pace</span>
      <select id="conversation-speed"><option value="slow">Slower turns</option><option value="natural" selected>Natural exchange</option><option value="quick">Quick back-and-forth</option></select>
    </label>
    <label class="tuning-control" for="conversation-response"><span>Focus response</span>
      <select id="conversation-response"><option value="calm" selected>Calm cinematic camera</option><option value="every">Follow every change</option><option value="settled">Brief pause before moving</option></select>
    </label>
    <label class="tuning-control" for="camera-style"><span>Camera style</span>
      <select id="camera-style" aria-describedby="camera-style-help"><option value="gentle">Gentle · less motion</option><option value="balanced" selected>Balanced · closer sooner</option><option value="lively">Lively · more motion</option></select>
    </label>
    <p id="camera-style-help" class="tuning-note">Camera motion is separate from turn timing. Gentle, Balanced and Lively use 28, 14 and 8-second attention paces.</p>
    <button id="conversation-play" type="button" class="conversation-play paper-outline" aria-pressed="false"><span class="paper-stroke" aria-hidden="true"></span><span>Start conversation preview</span></button>
    <p id="conversation-status" class="tuning-note" role="status">Preview stopped. No real call is running.</p>
    <p class="tuning-note">Drag takes priority. Let go to refocus on whoever is speaking. Calm keeps attending through a sustained turn and frames replies without moving the portraits. Compare the original follow-every-change or brief-pause modes.</p>`;
  grid.append(section);

  const play = section.querySelector('#conversation-play');
  const quick = document.createElement('button');
  quick.id = 'conversation-quick-play';
  quick.className = 'conversation-quick-play paper-outline';
  quick.type = 'button';
  quick.setAttribute('aria-pressed', 'false');
  quick.setAttribute('aria-label', 'Play example conversation');
  quick.setAttribute('title', 'Play example conversation (simulated)');
  quick.innerHTML = '<span class="paper-stroke" aria-hidden="true"></span><span class="conversation-quick-icon" aria-hidden="true">▶</span>';
  const header = document.querySelector('.table-top');
  if (header) { header.classList.add('conversation-quick-header'); header.append(quick); }

  const trace = section.querySelector('#conversation-trace');
  const speed = section.querySelector('#conversation-speed');
  const response = section.querySelector('#conversation-response');
  const cameraStyle = section.querySelector('#camera-style');
  const styleHelp = section.querySelector('#camera-style-help');
  const status = section.querySelector('#conversation-status');
  // Fresh runs are randomized; explicit seeds support matched test replay.
  let sequence = null, sequenceSeed = null;
  let running = false, paused = false;
  let previewSpeaker = null;
  let calm = null;
  let step = 0;
  let turnTimer;
  let focusTimer;
  let releaseTimer;
  let turnDeadline = 0, remainingTurn = 0;
  let lastFocusAt = -Infinity;
  let rosterSize = seats.length;

  function updateRoles() {
    const actual = running || paused ? previewSpeaker : null;
    seats.forEach((seat,id) => seat.toggleAttribute('data-speaker',id === actual));
    const voice = actual === null ? 'Listening' : names[actual] + ' speaking';
    const label = voice + ' · ' + names[demoStickHolder] + ' has the stick';
    if (holderText.textContent !== label) holderText.textContent = label;
    holderText.title = label;
    ring.dispatchEvent(new Event('circleup:portrait-state'));
  }
  function createCalmController() {
    return createPrimaryAttention({getSpeaker: () => running || paused ? previewSpeaker : null,
      getStyle: () => cameraStyle.value, getResponse: () => response.value, isPaused: () => paused, notify: updateRoles});
  }

  function syncControls() {
    play.setAttribute('aria-pressed', String(running));
    play.querySelector('span:last-child').textContent = running ? 'Stop conversation preview' : paused ? 'Restart conversation preview' : 'Start conversation preview';
    quick.setAttribute('aria-pressed', String(running));
    const label = running ? 'Pause example conversation' : 'Play example conversation';
    quick.setAttribute('aria-label', label);
    quick.setAttribute('title', label + ' (simulated)');
    quick.querySelector('.conversation-quick-icon').textContent = running ? 'Ⅱ' : '▶';
    ring.dispatchEvent(new Event('circleup:portrait-state'));
  }
  function scheduleTurn(duration) {
    remainingTurn = duration;
    turnDeadline = performance.now() + duration;
    turnTimer = setTimeout(advance, duration);
  }
  function focusNow(expectedHolder) {
    if (!running || holder !== expectedHolder || pointers.size) return;
    updateFocusPitch();
    render();
    lastFocusAt = performance.now();
    // The room's existing spring restarts from its current orientation.
    returnToSpeaker();
  }
  function requestFocus() {
    clearTimeout(focusTimer);
    if (response.value === 'calm' || calm) {
      if (!calm) calm = createCalmController();
      calm.observe(holder);
      return;
    }
    if (pointers.size) return;
    if (response.value === 'every') focusNow(holder);
    else {
      const expectedHolder = holder;
      const delay = Math.max(350, lastFocusAt + 900 - performance.now());
      focusTimer = setTimeout(() => focusNow(expectedHolder), delay);
    }
  }
  function advance() {
    if (!running) return;
    if (seats.length !== rosterSize || seats.length < 2) { stopPreview('Preview stopped because the group changed.'); return; }
    const turn = sequence.next();
    previewSpeaker = turn.speaker;
    holder = previewSpeaker;
    markSpeaker();
    updateRoles();
    // Keep the user's held view stable, including the adaptive pitch. The
    // current speaking mark remains truthful while focus waits.
    if (!pointers.size && response.value !== 'calm') updateFocusPitch();
    render();
    requestFocus();
    const factor = {slow: 1.7, natural: 1, quick: .5}[speed.value] ?? 1;
    const duration = Math.round(turn.durationMs * factor);
    const coverage = sequence.snapshot();
    status.textContent = 'Simulated: ' + names[holder] + ' is speaking · next change in ' + (duration / 1000).toFixed(1) + 's · ' + coverage.heardCount + ' of ' + coverage.totalCount + ' voices heard.';
    step++;
    scheduleTurn(duration);
  }
  function stopPreview(message = 'Preview stopped. No real call is running.') {
    if (!running && !paused && !calm) return;
    running = false; paused = false; previewSpeaker = null;
    clearTimeout(turnTimer); clearTimeout(focusTimer); clearTimeout(releaseTimer);
    calm?.destroy(); calm = null;
    stop();
    remainingTurn = 0;
    syncControls();
    status.textContent = message;
    if (holder < seats.length) markSpeaker();
    updateRoles();
  }
  function startPreview() {
    clearTimeout(turnTimer); clearTimeout(focusTimer); clearTimeout(releaseTimer);
    calm?.destroy(); calm = null;
    if (!window.CircleUpConversationPatterns) throw Error('Conversation examples unavailable');
    sequence = window.CircleUpConversationPatterns.create({ids: seats.map((_, index) => index), kind: trace.value});
    sequenceSeed = sequence.seed;
    rosterSize = seats.length;
    step = 0;
    lastFocusAt = -Infinity;
    running = true; paused = false;
    syncControls();
    advance();
  }
  function pausePreview() {
    if (!running) return;
    remainingTurn = Math.max(0, turnDeadline - performance.now());
    running = false; paused = true;
    clearTimeout(turnTimer); clearTimeout(focusTimer); clearTimeout(releaseTimer);
    stop();
    calm?.pause();
    syncControls();
    updateRoles();
    status.textContent = 'Simulated conversation paused. Play resumes this turn.';
  }
  function resumePreview() {
    if (!paused || seats.length !== rosterSize) { startPreview(); return; }
    running = true; paused = false;
    syncControls();
    updateRoles();
    status.textContent = 'Simulated: ' + names[holder] + ' is speaking · resumed.';
    calm?.resume();
    if (!calm) requestFocus();
    scheduleTurn(remainingTurn);
  }
  play.addEventListener('click', () => running ? stopPreview() : startPreview());
  quick.addEventListener('click', () => running ? pausePreview() : paused ? resumePreview() : startPreview());
  function updateStyleControl() {
    cameraStyle.disabled = response.value !== 'calm';
    styleHelp.textContent = cameraStyle.disabled ? 'These modes follow the current voice; Brief pause waits before moving. After a pass, the same continuous planner keeps this response.' : 'Camera motion is separate from turn timing. Gentle, Balanced and Lively use 28, 14 and 8-second attention paces.';
  }
  cameraStyle.addEventListener('change', () => { if (response.value === 'calm') calm?.setStyle(); });
  updateStyleControl();
  response.addEventListener('change', () => {
    updateStyleControl();
    calm?.destroy(); calm = null; stop();
    if (running) requestFocus();
    updateRoles();
  });
  trace.addEventListener('change', () => { if (running || paused) startPreview(); });
  speed.addEventListener('change', () => {
    if (!running) return;
    clearTimeout(turnTimer);
    // Pace/trace changes explicitly start a fresh randomized example.
    startPreview();
  });
  const stopForChange = () => stopPreview('Preview stopped because the layout changed.');
  groupSize.addEventListener('change', stopForChange, {capture:true});
  seatingLayout.addEventListener('change', stopForChange, {capture:true});
  document.querySelector('#reset-layout').addEventListener('click', stopForChange, {capture:true});
  // The ordinary manual handoff should not compete with the simulator.
  // The talking-stick adapter intercepts the room's legacy pass before its spring.
  camera.addEventListener('pointerdown', () => clearTimeout(focusTimer));
  const released = () => {
    if (!running || calm) return;
    releaseTimer = setTimeout(() => { if (running && !pointers.size) { updateFocusPitch(); render(); } }, 0);
  };
  camera.addEventListener('pointerup', released);
  camera.addEventListener('pointercancel', released);
  window.addEventListener('pagehide', () => stopPreview());
  window.CircleUpConversationPreview = Object.freeze({
    speakingId: () => running || paused ? previewSpeaker : null,
    beginHandoff(id) {
      if (paused || pointers.size) return null;
      clearTimeout(focusTimer); stop();
      calm ??= createCalmController();
      return calm.beginHandoff(id);
    },
    handoffReady: token => calm?.handoffReady(token) ?? {ready:false,reason:'no-owner'},
    commitHandoff: (id,token) => calm?.commitHandoff(id,token) ?? false,
    cancelHandoff: reason => calm?.cancelHandoff(reason) ?? false,
    pauseForHandoff: () => pausePreview(),
    stopForHandoff: () => stopPreview('Preview stopped for a manual handoff.'),
    snapshot: () => {const attention=calm?.snapshot() ?? null;return {ready:true, actualSpeaker: running || paused ? previewSpeaker : null, actualHolder:demoStickHolder, running, paused, response: response.value, trace: trace.value, sequenceSeed, step, coverage: sequence?.snapshot() ?? null, remainingTurn: paused ? remainingTurn : Math.max(0, turnDeadline - performance.now()), calm: attention, attention};}
  });
  const roles = new MutationObserver(() => updateRoles());
  roles.observe(ring,{childList:true});
  reducedMotion.addEventListener('change', () => calm?.cancelHandoff('Motion preference changed.'));
  camera.addEventListener('keydown', event => {if(event.key === '0')calm?.cancelHandoff('The view reset.');}, {capture:true});
  resetView.addEventListener('click', () => calm?.cancelHandoff('The view reset.'), {capture:true});
  updateRoles();
})();
