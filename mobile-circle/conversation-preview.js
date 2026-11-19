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
    <label class="tuning-control" for="conversation-trace"><span>Example conversation</span>
      <select id="conversation-trace"><option value="mixed" selected>Mixed open conversation</option><option value="backforth">Short back-and-forth</option><option value="sustained">Long turn, then replies</option></select>
    </label>
    <label class="tuning-control" for="conversation-speed"><span>Conversation pace</span>
      <select id="conversation-speed"><option value="slow">Slower turns</option><option value="natural" selected>Natural exchange</option><option value="quick">Quick back-and-forth</option></select>
    </label>
    <label class="tuning-control" for="conversation-response"><span>Focus response</span>
      <select id="conversation-response"><option value="calm" selected>Calm cinematic camera</option><option value="every">Follow every change</option><option value="settled">Brief pause before moving</option></select>
    </label>
    <button id="conversation-play" type="button" class="conversation-play paper-outline" aria-pressed="false"><span class="paper-stroke" aria-hidden="true"></span><span>Start conversation preview</span></button>
    <p id="conversation-status" class="tuning-note" role="status">Preview stopped. No real call is running.</p>
    <p class="tuning-note">Drag takes priority. Let go to refocus on whoever is speaking. Calm starts wide, tightens gradually after a sustained turn, and widens for replies. Compare the original follow-every-change or brief-pause modes.</p>`;
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
  const status = section.querySelector('#conversation-status');
  // Stable seat choices and durations make both camera policies comparable.
  const pattern = [0, 1, 0, 1, 2, 0, 2, 1, 0, 3, 1, 3, 0, 1];
  const durations = [1800, 700, 1200, 550, 2400, 850, 1350, 600, 1750, 900, 650, 1450, 700, 2100];
  let running = false, paused = false;
  let calm = null;
  let step = 0;
  let turnTimer;
  let focusTimer;
  let releaseTimer;
  let turnDeadline = 0, remainingTurn = 0;
  let lastFocusAt = -Infinity;
  let rosterSize = seats.length;

  function createCalmController() {
    const api = window.CalmConversationCamera;
    if (!api) throw Error('Calm camera policy unavailable');
    let policy, proposal, fit, alive = true, suspended = false, manual = pointers.size > 0;
    let frameRequest, manualTimer, lastTick = null, nextProposal = 0, dirty = true;
    let needsRebuild = false, context = null;
    const metrics = {ticks: 0, frames: 0, proposals: 0, proposalMs: [], tickMs: [], fitFailed: false};
    function configure(now) {
      const density = Math.max(0, seats.length - 7);
      const tuning = Number(restAngle.value) * radians - (38 + density * 2.2) * radians;
      const fixed = restMode.value === 'fixed';
      const overviewPitch = fixed ? Number(restAngle.value) * radians : (66 + density * .85) * radians + tuning;
      const close = fixed ? overviewPitch : closePitch + tuning;
      policy = api.createCalmCamera({
        roster: seats.map((_, index) => index),
        config: {minZoom, maxZoom, overviewZoom: 1, overviewPitch, closePitch: close},
        speakerYaw: id => -Math.atan2(seatPoints[id][0], seatPoints[id][2]),
        pitchCandidates: (observed, current) => fixed ? [Number(restAngle.value) * radians] : [current.pitch, observed.desiredPitch, overviewPitch, close,
          Math.max(Math.min(close, overviewPitch), Math.min(Math.max(close, overviewPitch), current.pitch - 5 * radians)),
          Math.max(Math.min(close, overviewPitch), Math.min(Math.max(close, overviewPitch), current.pitch + 5 * radians))]
      });
      policy.reset(now);
      context = policy.observeSpeakers([holder], now);
      if (suspended) policy.pause(now);
      if (manual) policy.beginManual(now);
      proposal = null; nextProposal = 0; dirty = true; needsRebuild = false;
      return {overviewPitch};
    }
    function evaluate(now, current) {
      const geometry = captureCameraProjection();
      fit = api.createProjectionFit({ids: geometry.ids, project: geometry.project, bounds: geometry.bounds, padding: 9});
      const began = performance.now();
      proposal = policy.proposeFrame(current, fit, now);
      metrics.proposalMs.push(performance.now() - began);
      if (metrics.proposalMs.length > 300) metrics.proposalMs.shift();
      metrics.proposals++; metrics.fitFailed = proposal.fitFailed;
      context = proposal.context;
      nextProposal = now + 200; dirty = false;
    }
    const owner = {
      beginManual() {
        if (!alive) return;
        clearTimeout(manualTimer);
        if (!manual) { manual = true; context = policy.beginManual(performance.now()); }
        lastTick = null;
      },
      manualChange() {
        owner.beginManual();
        manualTimer = setTimeout(() => { if (!pointers.size) owner.requestReturn(); }, 550);
      },
      requestReturn() {
        if (!alive || pointers.size) return;
        clearTimeout(manualTimer);
        manual = false;
        context = policy.endManual(performance.now());
        dirty = true; lastTick = null;
      },
      layoutChanged() { if (alive) { needsRebuild = true; dirty = true; } }
    };
    const initialNow = performance.now();
    const initial = configure(initialNow);
    const releaseOwner = takeCameraAutomation(owner);
    // Explicit Play starts with a group overview, using the selected exact
    // pitch in fixed mode. Geometry is never translated or rearranged.
    const overview = {...cameraFrame(), pitch: initial.overviewPitch, zoom: 1};
    evaluate(initialNow, manual ? cameraFrame() : overview);
    if (!manual && !proposal.fitFailed) { applyCameraFrame(proposal.target); metrics.frames++; }
    function tick() {
      if (!alive || suspended) return;
      // RAF timestamps can precede a timer/event observed in the same frame.
      // Policy observations and renderer ticks must share this monotonic clock.
      const now = performance.now();
      const tickBegan = now;
      metrics.ticks++;
      if (needsRebuild) configure(now);
      const dt = lastTick === null ? 0 : Math.max(0, (now - lastTick) / 1000);
      lastTick = now;
      if (manual || pointers.size) {
        context = policy.update(now);
      } else {
        if (dirty || now >= nextProposal) evaluate(now, cameraFrame());
        if (proposal) {
          const current = cameraFrame();
          const next = api.stepFrame(current, proposal.target, dt, proposal.motion, reducedMotion.matches,
            {fit, context: proposal.context, minZoom, overviewZoom: 1});
          if (Math.abs(shortestArc(next.yaw - current.yaw)) + Math.abs(next.pitch - current.pitch) + Math.abs(Math.log(next.zoom / current.zoom)) > 1e-10) {
            applyCameraFrame(next);
            metrics.frames++;
          }
        }
      }
      metrics.tickMs.push(performance.now() - tickBegan);
      if (metrics.tickMs.length > 300) metrics.tickMs.shift();
      frameRequest = requestAnimationFrame(tick);
    }
    frameRequest = requestAnimationFrame(tick);
    return {
      observe(id) { if (alive) { context = policy.observeSpeakers([id], performance.now()); dirty = true; } },
      pause() { if (!alive) return; suspended = true; clearTimeout(manualTimer); cancelAnimationFrame(frameRequest); context = policy.pause(performance.now()); lastTick = null; },
      resume() {
        if (!alive) return;
        suspended = false;
        // Pause cancels transient key/wheel timers. Release that ownership on
        // resume, while retaining ownership of fingers actually still down.
        if (manual && !pointers.size) owner.requestReturn();
        context = policy.resume(performance.now());
        dirty = true; lastTick = null; frameRequest = requestAnimationFrame(tick);
      },
      destroy() { if (!alive) return; alive = false; clearTimeout(manualTimer); cancelAnimationFrame(frameRequest); releaseOwner(); },
      snapshot() { return {alive, suspended, manual, context, target: proposal?.target ?? null, metrics: {...metrics, proposalMs: [...metrics.proposalMs], tickMs: [...metrics.tickMs]}}; }
    };
  }

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
    const currentPattern = trace.value === 'backforth' ? pattern : trace.value === 'sustained' ? [0, 1, 0, 2, 1, 0] : [0, 1, 0, 1, 2, 0, 2, 1];
    const ordinal = currentPattern[index % currentPattern.length] % count;
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
    if (response.value === 'calm') {
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
    holder = speakerFor(step);
    markSpeaker();
    holderText.textContent = names[holder] + ' is speaking · preview';
    // Keep the user's held view stable, including the adaptive pitch. The
    // current speaking mark remains truthful while focus waits.
    if (!pointers.size && response.value !== 'calm') updateFocusPitch();
    render();
    requestFocus();
    const factor = {slow: 1.7, natural: 1, quick: .5}[speed.value] ?? 1;
    const currentDurations = trace.value === 'backforth' ? durations : trace.value === 'sustained' ? [45000, 700, 1000, 800, 1200, 18000] : [12000, 900, 1200, 650, 42000, 1100, 2100, 900];
    const duration = Math.round(currentDurations[step % currentDurations.length] * factor);
    status.textContent = 'Simulated: ' + names[holder] + ' is speaking · next change in ' + (duration / 1000).toFixed(1) + 's.';
    step++;
    scheduleTurn(duration);
  }
  function stopPreview(message = 'Preview stopped. No real call is running.') {
    if (!running && !paused) return;
    running = false; paused = false;
    clearTimeout(turnTimer); clearTimeout(focusTimer); clearTimeout(releaseTimer);
    calm?.destroy(); calm = null;
    stop();
    remainingTurn = 0;
    syncControls();
    status.textContent = message;
    if (holder < seats.length) markSpeaker();
  }
  function startPreview() {
    clearTimeout(turnTimer); clearTimeout(focusTimer); clearTimeout(releaseTimer);
    calm?.destroy(); calm = null;
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
    holderText.textContent = names[holder] + ' · paused preview';
    status.textContent = 'Simulated conversation paused. Play resumes this turn.';
  }
  function resumePreview() {
    if (!paused || seats.length !== rosterSize) { startPreview(); return; }
    running = true; paused = false;
    syncControls();
    holderText.textContent = names[holder] + ' is speaking · preview';
    status.textContent = 'Simulated: ' + names[holder] + ' is speaking · resumed.';
    calm?.resume();
    if (!calm) requestFocus();
    scheduleTurn(remainingTurn);
  }
  play.addEventListener('click', () => running ? stopPreview() : startPreview());
  quick.addEventListener('click', () => running ? pausePreview() : paused ? resumePreview() : startPreview());
  response.addEventListener('change', () => {
    calm?.destroy(); calm = null; stop();
    if (running) requestFocus();
  });
  trace.addEventListener('change', () => { if (running || paused) startPreview(); });
  speed.addEventListener('change', () => {
    if (!running) return;
    clearTimeout(turnTimer);
    // Restart the same deterministic sequence for a fair pace comparison.
    startPreview();
  });
  const stopForChange = () => stopPreview('Preview stopped because the layout changed.');
  groupSize.addEventListener('change', stopForChange);
  seatingLayout.addEventListener('change', stopForChange);
  document.querySelector('#reset-layout').addEventListener('click', stopForChange);
  // The ordinary manual handoff should not compete with the simulator.
  passStick.addEventListener('click', () => stopPreview('Preview stopped for a manual handoff.'), {capture: true});
  camera.addEventListener('pointerdown', () => clearTimeout(focusTimer));
  const released = () => {
    if (!running || calm) return;
    releaseTimer = setTimeout(() => { if (running && !pointers.size) { updateFocusPitch(); render(); } }, 0);
  };
  camera.addEventListener('pointerup', released);
  camera.addEventListener('pointercancel', released);
  window.addEventListener('pagehide', () => stopPreview());
  window.CircleUpConversationPreview = Object.freeze({snapshot: () => ({running, paused, response: response.value, trace: trace.value, step, remainingTurn: paused ? remainingTurn : Math.max(0, turnDeadline - performance.now()), calm: calm?.snapshot() ?? null})});
})();
