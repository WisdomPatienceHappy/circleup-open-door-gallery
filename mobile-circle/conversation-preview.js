/** Simulated open-time conversation; the live-call view uses real room authority. */
(() => {
  const grid = document.querySelector('.tuning-grid');
  if (!grid || document.querySelector('#conversation-preview')) return;
  const section = document.createElement('section');
  section.id = 'conversation-preview';
  section.className = 'conversation-preview';
  section.setAttribute('aria-labelledby', 'conversation-preview-title');
  section.innerHTML = `
    <h2 id="conversation-preview-title">Open conversation</h2>
    <p class="tuning-note">Simulated speaker changes. Compare quick back-and-forth with a calmer camera response.</p>
    <label class="tuning-control" for="conversation-speed"><span>Conversation pace</span>
      <select id="conversation-speed"><option value="slow">Slower turns</option><option value="natural" selected>Natural exchange</option><option value="quick">Quick back-and-forth</option></select>
    </label>
    <label class="tuning-control" for="conversation-response"><span>Focus response</span>
      <select id="conversation-response"><option value="every" selected>Follow every change</option><option value="settled">Brief pause before moving</option></select>
    </label>
    <button id="conversation-play" type="button" class="conversation-play paper-outline" aria-pressed="false"><span class="paper-stroke" aria-hidden="true"></span><span>Start conversation preview</span></button>
    <p id="conversation-status" class="tuning-note" role="status">Preview stopped. No real call is running.</p>
    <p class="tuning-note">Drag takes priority. Let go to refocus on whoever is speaking. Pause mode waits at least 350ms, with 900ms between camera moves.</p>`;
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

  const speed = section.querySelector('#conversation-speed');
  const response = section.querySelector('#conversation-response');
  const status = section.querySelector('#conversation-status');
  // Stable seat choices and durations make both camera policies comparable.
  const pattern = [0, 1, 0, 1, 2, 0, 2, 1, 0, 3, 1, 3, 0, 1];
  const durations = [1800, 700, 1200, 550, 2400, 850, 1350, 600, 1750, 900, 650, 1450, 700, 2100];
  let running = false, paused = false;
  let step = 0;
  let turnTimer;
  let focusTimer;
  let releaseTimer;
  let turnDeadline = 0, remainingTurn = 0;
  let lastFocusAt = -Infinity;
  let rosterSize = seats.length;

  function syncControls() {
    play.setAttribute('aria-pressed', String(running));
    play.querySelector('span:last-child').textContent = running ? 'Stop conversation preview' : paused ? 'Restart conversation preview' : 'Start conversation preview';
    quick.setAttribute('aria-pressed', String(running));
    const label = running ? 'Pause example conversation' : 'Play example conversation';
    quick.setAttribute('aria-label', label);
    quick.setAttribute('title', label + ' (simulated)');
    quick.querySelector('.conversation-quick-icon').textContent = running ? 'Ⅱ' : '▶';
  }
  function scheduleTurn(duration) {
    remainingTurn = duration;
    turnDeadline = performance.now() + duration;
    turnTimer = setTimeout(advance, duration);
  }
  function speakerFor(index) {
    // Four seats distributed around the current roster, rather than four
    // tiny neighboring steps in a large group.
    const count = Math.min(4, seats.length);
    const ordinal = pattern[index % pattern.length] % count;
    return Math.floor(ordinal * seats.length / count);
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
    holder = speakerFor(step);
    markSpeaker();
    holderText.textContent = names[holder] + ' is speaking · preview';
    // Keep the user's held view stable, including the adaptive pitch. The
    // current speaking mark remains truthful while focus waits.
    if (!pointers.size) updateFocusPitch();
    render();
    requestFocus();
    const factor = {slow: 1.7, natural: 1, quick: .5}[speed.value] ?? 1;
    const duration = Math.round(durations[step % durations.length] * factor);
    status.textContent = 'Simulated: ' + names[holder] + ' is speaking · next change in ' + (duration / 1000).toFixed(1) + 's.';
    step++;
    scheduleTurn(duration);
  }
  function stopPreview(message = 'Preview stopped. No real call is running.') {
    if (!running && !paused) return;
    running = false; paused = false;
    clearTimeout(turnTimer); clearTimeout(focusTimer); clearTimeout(releaseTimer);
    stop();
    remainingTurn = 0;
    syncControls();
    status.textContent = message;
    if (holder < seats.length) markSpeaker();
  }
  function startPreview() {
    clearTimeout(turnTimer); clearTimeout(focusTimer); clearTimeout(releaseTimer);
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
    syncControls();
    holderText.textContent = names[holder] + ' · paused preview';
    status.textContent = 'Simulated conversation paused. Play resumes this turn.';
  }
  function resumePreview() {
    if (!paused || seats.length !== rosterSize) { startPreview(); return; }
    running = true; paused = false;
    syncControls();
    holderText.textContent = names[holder] + ' is speaking · preview';
    status.textContent = 'Simulated: ' + names[holder] + ' is speaking · resumed.';
    requestFocus();
    scheduleTurn(remainingTurn);
  }
  play.addEventListener('click', () => running ? stopPreview() : startPreview());
  quick.addEventListener('click', () => running ? pausePreview() : paused ? resumePreview() : startPreview());
  response.addEventListener('change', () => { if (running) requestFocus(); });
  speed.addEventListener('change', () => {
    if (!running) return;
    clearTimeout(turnTimer);
    // Restart the same deterministic sequence for a fair pace comparison.
    step = 0;
    advance();
  });
  const stopForChange = () => stopPreview('Preview stopped because the layout changed.');
  groupSize.addEventListener('change', stopForChange);
  seatingLayout.addEventListener('change', stopForChange);
  document.querySelector('#reset-layout').addEventListener('click', stopForChange);
  // The ordinary manual handoff should not compete with the simulator.
  passStick.addEventListener('click', () => stopPreview('Preview stopped for a manual handoff.'), {capture: true});
  camera.addEventListener('pointerdown', () => clearTimeout(focusTimer));
  const released = () => {
    if (!running) return;
    releaseTimer = setTimeout(() => { if (running && !pointers.size) { updateFocusPitch(); render(); } }, 0);
  };
  camera.addEventListener('pointerup', released);
  camera.addEventListener('pointercancel', released);
  window.addEventListener('pagehide', () => stopPreview());
})();
