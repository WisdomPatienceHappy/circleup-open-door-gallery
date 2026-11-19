/** Deliberate visual handoff. The host alone owns the holder and camera. */
(() => {
  'use strict';
  const stick = `<svg viewBox="0 0 76 32" aria-hidden="true" focusable="false"><path class="stick-body" d="M7 21 Q22 16 35 14 L65 8 Q69 8 69 12 L39 19 Q23 22 9 26 Z"/><path d="M9 21 Q28 18 39 15 L65 10 M25 18l2 5 M44 13l2 5 M49 12l2 5"/><path class="stick-wrap" d="m33 13 5-1 3 9-5 1z"/></svg>`;
  let instance = 0;

  function create(options) {
    const {mount, quickMount, getHolder, getAnchorRect, getTravelBounds, onCommit, onBegin} = options;
    if (!mount || typeof getHolder !== 'function' || typeof getAnchorRect !== 'function' || typeof onCommit !== 'function') {
      throw new TypeError('TalkingStickDemo needs mount, getHolder, getAnchorRect and onCommit');
    }
    const doc = mount.ownerDocument, win = doc.defaultView;
    const prefix = `talking-stick-${++instance}`;
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
    let roster = validateRoster(options.roster), flight = null, disposed = false;
    const section = doc.createElement('section');
    section.className = 'talking-stick-demo';
    section.setAttribute('aria-labelledby', `${prefix}-title`);
    section.innerHTML = `
      <h2 id="${prefix}-title">Talking stick</h2>
      <p class="talking-stick-holder">${stick}<span></span></p>
      <p class="talking-stick-note">One person holds the turn. Pass it when you’re ready.</p>
      <button type="button" class="talking-stick-next paper-outline"><i class="paper-stroke" aria-hidden="true"></i><span></span></button>
      <label class="talking-stick-choice"><span>Or choose someone</span><select aria-label="Pass the talking stick to"></select></label>
      <button type="button" class="talking-stick-send paper-outline"><i class="paper-stroke" aria-hidden="true"></i><span>Pass to this person →</span></button>
      <p class="talking-stick-status" role="status" aria-live="polite">A simulated handoff. Try passing the stick.</p>`;
    mount.append(section);
    const held = section.querySelector('.talking-stick-holder span');
    const next = section.querySelector('.talking-stick-next');
    const select = section.querySelector('select');
    const send = section.querySelector('.talking-stick-send');
    const status = section.querySelector('.talking-stick-status');
    let quick = null;
    if (quickMount) {
      quick = doc.createElement('button');
      quick.type = 'button';
      quick.className = 'talking-stick-quick paper-outline';
      quick.innerHTML = `<i class="paper-stroke" aria-hidden="true"></i>${stick}<span>Pass stick</span>`;
      quickMount.append(quick);
    }

    function validateRoster(rows) {
      if (!Array.isArray(rows) || rows.some(row => !row || row.id == null || typeof row.name !== 'string') || new Set(rows.map(row => row.id)).size !== rows.length) {
        throw new TypeError('Talking stick roster needs unique non-null IDs and names');
      }
      return rows.map(({id, name}) => ({id, name}));
    }
    const person = id => roster.find(row => row.id === id);
    const following = () => {
      const index = roster.findIndex(row => row.id === getHolder());
      return index < 0 || roster.length < 2 ? null : roster[(index + 1) % roster.length];
    };
    function refresh() {
      if (disposed) return;
      const holder = getHolder();
      if (flight && holder !== flight.from) cancel('The speaking turn changed.');
      held.textContent = person(holder) ? `${person(holder).name} holds the stick` : 'No current stick holder';
      const selectedId = select.selectedIndex >= 0 ? select.options[select.selectedIndex]._stickId : undefined;
      select.replaceChildren();
      for (const row of roster) {
        if (row.id === holder) continue;
        const option = doc.createElement('option');
        option.textContent = row.name;
        option._stickId = row.id;
        if (row.id === selectedId) option.selected = true;
        select.append(option);
      }
      const target = following();
      next.querySelector('span').textContent = flight ? 'Passing the stick…' : target ? `Pass to ${target.name} →` : 'Pass the stick';
      next.disabled = !target || !!flight;
      send.disabled = !target || !!flight;
      select.disabled = !target || !!flight;
      if (quick) {
        quick.disabled = !target || !!flight;
        quick.querySelector('span').textContent = flight ? 'Passing…' : 'Pass stick';
        quick.setAttribute('aria-label', target ? `Pass the stick to ${target.name} (simulated)` : 'Pass the stick (simulated)');
        quick.title = target ? `Demo · Pass the stick to ${target.name}` : 'Talking stick demo';
      }
      section.setAttribute('aria-busy', String(!!flight));
    }
    function removeFlight() {
      if (!flight) return;
      win.cancelAnimationFrame(flight.frame);
      flight.token?.remove();
      flight = null;
    }
    function cancel(reason = 'Handoff cancelled.') {
      if (disposed) return;
      const passing = !!flight;
      removeFlight();
      if (passing) status.textContent = reason;
      refresh();
    }
    function anchor(id) {
      const rect = getAnchorRect(id);
      if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
      // Arrive beside the lower edge of the video circle, clear of the face.
      return {x: rect.left + rect.width * .82, y: rect.top + rect.height + 18};
    }
    function travelBounds() {
      const rect = getTravelBounds ? getTravelBounds() : {left: 0, top: 0, width: win.innerWidth, height: win.innerHeight};
      if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width < 78 || rect.height < 52) return null;
      return {left: rect.left + 6, top: rect.top + 6, right: rect.left + rect.width - 6, bottom: rect.top + rect.height - 6,
        x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    }
    function constrainedPoint(point, angle, bounds) {
      const radians = angle * Math.PI / 180;
      // Clamp the rotated 56×26 shape, rather than only its center point.
      const halfWidth = Math.abs(Math.cos(radians)) * 28 + Math.abs(Math.sin(radians)) * 13;
      const halfHeight = Math.abs(Math.sin(radians)) * 28 + Math.abs(Math.cos(radians)) * 13;
      const x = Math.max(bounds.left + halfWidth, Math.min(bounds.right - halfWidth, point.x));
      const y = Math.max(bounds.top + halfHeight, Math.min(bounds.bottom - halfHeight, point.y));
      return {x, y};
    }
    function positionToken(token, point, angle, bounds) {
      const {x, y} = constrainedPoint(point, angle, bounds);
      token.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}deg)`;
    }
    function finish(pending) {
      if (disposed || flight !== pending) return;
      if (getHolder() !== pending.from || !person(pending.to)) { cancel('The speaking turn changed.'); return; }
      const toName = person(pending.to).name;
      removeFlight();
      try {
        onCommit(pending.to, {from: pending.from});
        status.textContent = getHolder() === pending.to ? `${toName} has the stick. Their turn.` : 'The handoff is ready.';
      } catch (error) {
        status.textContent = 'The handoff could not finish. Try again.';
        refresh();
        throw error;
      }
      refresh();
    }
    function passTo(id) {
      if (disposed || flight || !person(id) || id === getHolder() || !person(getHolder())) return false;
      const pending = {from: getHolder(), to: id, token: null, frame: 0, started: null};
      const fromName = person(pending.from).name, toName = person(id).name;
      flight = pending;
      try { onBegin?.(id, {from: pending.from}); }
      catch (error) { cancel('The handoff could not start.'); throw error; }
      if (flight !== pending || disposed) return false;
      if (getHolder() !== pending.from) { cancel('The speaking turn changed.'); return false; }
      status.textContent = `${fromName} → ${toName} · passing the stick…`;
      refresh();
      if (reduced.matches) { finish(pending); return true; }
      if (!anchor(pending.from) || !anchor(id) || !travelBounds()) { cancel('The circle is out of view. Try again when it is visible.'); return false; }
      const token = doc.createElement('div');
      token.className = 'talking-stick-flight';
      token.setAttribute('aria-hidden', 'true');
      token.innerHTML = stick;
      const start = anchor(pending.from);
      positionToken(token, start, -12, travelBounds());
      doc.body.append(token);
      pending.token = token;
      function tick(now) {
        if (disposed || flight !== pending) return;
        if (getHolder() !== pending.from) { cancel('The speaking turn changed.'); return; }
        const from = anchor(pending.from), to = anchor(pending.to), bounds = travelBounds();
        if (!from || !to || !bounds) { cancel('The circle changed. Handoff cancelled.'); return; }
        const a = constrainedPoint(from, -12, bounds), b = constrainedPoint(to, 12, bounds);
        if (pending.started === null) pending.started = now;
        const progress = Math.min(1, (now - pending.started) / 1100);
        const t = progress * progress * (3 - 2 * progress);
        // Bend toward the open circle interior, away from a direct eye-line.
        const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * bounds.x + t ** 2 * b.x;
        const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * bounds.y + t ** 2 * b.y;
        positionToken(token, {x, y}, -12 + 24 * t, bounds);
        if (progress >= 1) finish(pending);
        else pending.frame = win.requestAnimationFrame(tick);
      }
      pending.frame = win.requestAnimationFrame(tick);
      return true;
    }
    const passNext = () => { const target = following(); if (target) passTo(target.id); };
    const passChosen = () => { const option = select.options[select.selectedIndex]; if (option) passTo(option._stickId); };
    const hide = () => cancel('Handoff cancelled while the preview is away.');
    const visibility = () => { if (doc.hidden) hide(); };
    next.addEventListener('click', passNext);
    send.addEventListener('click', passChosen);
    quick?.addEventListener('click', passNext);
    win.addEventListener('pagehide', hide);
    doc.addEventListener('visibilitychange', visibility);
    refresh();
    return Object.freeze({
      passTo, refresh, cancel,
      updateRoster(rows) { const validated = validateRoster(rows); cancel('The group changed. Handoff cancelled.'); roster = validated; refresh(); },
      snapshot() { return {disposed, passing: !!flight, from: flight?.from ?? null, to: flight?.to ?? null, holder: getHolder(), rosterSize: roster.length}; },
      dispose() {
        if (disposed) return;
        removeFlight(); disposed = true;
        next.removeEventListener('click', passNext);
        send.removeEventListener('click', passChosen);
        quick?.removeEventListener('click', passNext);
        win.removeEventListener('pagehide', hide);
        doc.removeEventListener('visibilitychange', visibility);
        section.remove(); quick?.remove();
      }
    });
  }
  window.TalkingStickDemo = Object.freeze({create});
})();
