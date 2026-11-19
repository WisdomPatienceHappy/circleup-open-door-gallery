/* Dependency-free observed-conversation camera policy. Radians; milliseconds.
 * Browser: CalmConversationCamera. Node: require('./calm-camera.js').
 * Does not own seats, media, active-speaker detection, animation or wall clocks.
 */
(function (root) {
  'use strict';
  const rad = x => x * Math.PI / 180;
  const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const DEFAULTS = Object.freeze({
    minZoom: .72, maxZoom: 2.15, overviewZoom: 1,
    overviewPitch: rad(66), closePitch: rad(7),
    wideHoldMs: 4000, recentHoldMs: 8000, memoryMs: 18000,
    decayMs: 9000, tightenStartMs: 8000, fullTightMs: 40000,
    silenceOverviewMs: 3000, yawDeadband: rad(2), pitchDeadband: rad(2),
    zoomDeadbandLog: .018,
    yawRate: rad(12), pitchRate: rad(5),
    zoomOutLogRate: .9, zoomInLogRate: .035,
  });
  function view(v) {
    if (!v || ![v.yaw, v.pitch, v.zoom].every(Number.isFinite) || v.zoom <= 0) throw new TypeError('Expected finite yaw/pitch and positive zoom');
    return { yaw: wrap(v.yaw), pitch: v.pitch, zoom: v.zoom };
  }
  function unique(values) { return [...new Set(values.map(x => Math.round(x * 1e9) / 1e9))]; }
  function createCalmCamera({ roster, config = {}, speakerYaw, pitchCandidates } = {}) {
    const cfg = Object.freeze({ ...DEFAULTS, ...config });
    if (!Array.isArray(roster) || !roster.length || new Set(roster).size !== roster.length) throw new TypeError('Unique roster IDs required');
    if (roster.some(id => !['string', 'number'].includes(typeof id) || typeof id === 'number' && !Number.isFinite(id))) throw new TypeError('IDs must be finite numbers or strings');
    if (!Object.values(cfg).every(Number.isFinite) || cfg.minZoom <= 0 || cfg.maxZoom < cfg.minZoom || cfg.fullTightMs <= cfg.tightenStartMs || cfg.decayMs <= 0) throw new RangeError('Invalid camera configuration');
    const ids = [...roster], known = new Set(ids);
    let realLast = null, logical = 0, paused = false, manual = false;
    let active = [], heldSince = null, silenceSince = 0, wideUntil = cfg.wideHoldMs;
    let records = new Map(), lastTarget = null;
    function advance(now) {
      if (!Number.isFinite(now) || realLast !== null && now < realLast) throw new RangeError('Clock must be finite and monotonic');
      const dt = realLast === null || paused ? 0 : now - realLast;
      realLast = now;
      logical += dt;
      const decay = Math.exp(-dt / cfg.decayMs);
      for (const [id, r] of records) {
        const speaking = active.includes(id);
        r.weight = r.weight * decay + (speaking ? (1 - decay) : 0);
        if (speaking) { r.lastHeard = logical; r.spokeMs += dt; }
      }
    }
    function observeSpeakers(next, now) {
      advance(now);
      if (paused) return update(now);
      if (!Array.isArray(next) || next.some(id => !known.has(id))) throw new TypeError('Speaker not in roster');
      next = [...new Set(next)];
      const same = next.length === active.length && next.every(id => active.includes(id));
      if (!same) {
        const priorSingle = active.length === 1 ? active[0] : null;
        active = next;
        heldSince = next.length === 1 && next[0] === priorSingle && heldSince !== null ? heldSince : next.length === 1 ? logical : null;
        silenceSince = next.length ? null : logical;
        // A turn change retains recent people, not the entire roster. Initial
        // entry/manual release have their own full-group hold in wideUntil.
        for (const id of next) {
          if (!records.has(id)) records.set(id, {weight: 0, lastHeard: logical, spokeMs: 0});
          records.get(id).lastHeard = logical;
        }
      }
      return update(now);
    }
    function update(now) {
      advance(now);
      const primary = active.length === 1 ? active[0] : null;
      const heldMs = heldSince === null ? 0 : logical - heldSince;
      const silenceMs = silenceSince === null ? 0 : logical - silenceSince;
      const weights = [...records].map(([id, r]) => ({id, weight: r.weight, ageMs: logical - r.lastHeard, active: active.includes(id)})).filter(r => r.ageMs <= cfg.memoryMs);
      const recent = weights.filter(r => r.ageMs <= cfg.recentHoldMs).map(r => r.id);
      const fullGroup = logical < wideUntil || silenceMs >= cfg.silenceOverviewMs || !records.size;
      const requiredIds = fullGroup ? [...ids] : [...new Set([...active, ...recent])];
      if (!requiredIds.length) requiredIds.push(...ids);
      const exchange = requiredIds.length > 1 || active.length !== 1;
      const progress = fullGroup || exchange ? 0 : smooth((heldMs - cfg.tightenStartMs) / (cfg.fullTightMs - cfg.tightenStartMs));
      const baseZoom = clamp(cfg.overviewZoom, cfg.minZoom, cfg.maxZoom);
      return {
        now: logical, paused, manual, primary, activeIds: [...active], requiredIds,
        weights, heldMs, silenceMs, fullGroup, progress,
        phase: paused ? 'paused' : manual ? 'manual' : fullGroup ? 'overview' : exchange ? 'conversation' : progress ? 'settling' : 'holding',
        desiredZoom: baseZoom * Math.exp(Math.log(cfg.maxZoom / baseZoom) * progress),
        desiredPitch: cfg.overviewPitch + (cfg.closePitch - cfg.overviewPitch) * progress,
      };
    }
    function proposeFrame(currentView, fit, now) {
      const current = view(currentView), context = update(now);
      if (typeof fit !== 'function') throw new TypeError('Real projection/fit callback required');
      const motion = { yawRate: cfg.yawRate, pitchRate: cfg.pitchRate, zoomOutLogRate: cfg.zoomOutLogRate, zoomInLogRate: cfg.zoomInLogRate };
      if (manual || paused) return {target: current, context, motion, evaluation: null, fitFailed: false, changed: false, candidates: 0};
      // Expanding/relaxing the recent set never forces an arbitrary overview.
      // Keep current magnification if the actual engine can fit the context.
      const preferredZoom = context.fullGroup ? context.desiredZoom : Math.max(current.zoom, context.desiredZoom);
      const maxZoom = Math.min(cfg.maxZoom, preferredZoom);
      const yawOptions = [current.yaw];
      if (lastTarget) yawOptions.push(lastTarget.yaw);
      if (context.progress > .02 && context.primary !== null && typeof speakerYaw === 'function') {
        const target = speakerYaw(context.primary);
        if (Number.isFinite(target)) yawOptions.push(wrap(target));
      }
      yawOptions.push(wrap(current.yaw - rad(15)), wrap(current.yaw + rad(15)));
      const pOptions = typeof pitchCandidates === 'function' ? pitchCandidates(context, current) : Array.isArray(pitchCandidates) ? pitchCandidates : [current.pitch, context.desiredPitch, cfg.overviewPitch, cfg.closePitch, clamp(current.pitch - rad(5), cfg.closePitch, cfg.overviewPitch), clamp(current.pitch + rad(5), cfg.closePitch, cfg.overviewPitch)];
      if (!Array.isArray(pOptions) || !pOptions.length || !pOptions.every(Number.isFinite)) throw new TypeError('Finite allowed pitch candidates required');
      const zOptions = [clamp(current.zoom, cfg.minZoom, maxZoom), maxZoom, cfg.minZoom];
      for (let i = 1; i < 7; i++) zOptions.push(cfg.minZoom * Math.exp(Math.log(maxZoom / cfg.minZoom) * i / 7));
      let best = null, closestFailure = null, candidates = 0;
      const evaluate = target => {
        candidates++;
        const result = fit(target, context);
        if (!result || typeof result.fits !== 'boolean' || !Array.isArray(result.visibleIds)) throw new TypeError('fit must return {fits, visibleIds, overflowPenalty?}');
        // A callback cannot call a target safe while omitting a required person.
        const fits = result.fits && context.requiredIds.every(id => result.visibleIds.includes(id));
        const movementYaw = Math.abs(wrap(target.yaw - current.yaw));
        const movementZoom = Math.abs(Math.log(target.zoom / current.zoom));
        const movementPitch = Math.abs(target.pitch - current.pitch);
        const score = (6 * (1 - context.progress) ** 4 + .05) * movementYaw +
          .5 * movementZoom + .3 * movementPitch +
          3 * Math.abs(Math.log(target.zoom / preferredZoom)) +
          Math.abs(target.pitch - context.desiredPitch) +
          .2 * Math.max(0, Number(result.centeringPenalty) || 0) +
          (lastTarget ? .025 * Math.abs(wrap(target.yaw - lastTarget.yaw)) : 0);
        return {target, evaluation: {...result, fits}, score};
      };
      for (const yaw of unique(yawOptions)) for (const pitch of unique(pOptions)) for (const zoom of unique(zOptions)) {
        const candidate = evaluate({yaw, pitch, zoom});
        if (candidate.evaluation.fits && (!best || candidate.score < best.score - 1e-9)) best = candidate;
        if (!closestFailure || (candidate.evaluation.overflowPenalty || 0) < (closestFailure.evaluation.overflowPenalty || 0)) closestFailure = candidate;
      }
      if (!best) return {target: current, context, motion, evaluation: fit(current, context), fitFailed: true, bestAttempt: closestFailure, changed: false, candidates};
      const withinDeadband = Math.abs(wrap(best.target.yaw - current.yaw)) < cfg.yawDeadband && Math.abs(best.target.pitch - current.pitch) < cfg.pitchDeadband && Math.abs(Math.log(best.target.zoom / current.zoom)) < cfg.zoomDeadbandLog;
      // Never hold a clipped current frame merely because the new target is close.
      if (withinDeadband && pOptions.some(p => Math.abs(p - current.pitch) < 1e-8)) {
        const held = evaluate(current);
        if (held.evaluation.fits) best = held;
      }
      lastTarget = {...best.target};
      return {...best, context, motion, fitFailed: false, candidates,
        changed: Math.abs(wrap(best.target.yaw - current.yaw)) + Math.abs(best.target.pitch - current.pitch) + Math.abs(Math.log(best.target.zoom / current.zoom)) > 1e-8};
    }
    return Object.freeze({
      observeSpeakers, update, proposeFrame,
      beginManual(now) { advance(now); manual = true; lastTarget = null; return update(now); },
      endManual(now) { advance(now); manual = false; wideUntil = logical + cfg.wideHoldMs; heldSince = active.length === 1 ? logical : null; lastTarget = null; return update(now); },
      pause(now) { advance(now); paused = true; return update(now); },
      resume(now) { advance(now); paused = false; wideUntil = Math.max(wideUntil, logical + cfg.wideHoldMs); return update(now); },
      reset(now = 0) { realLast = now; logical = 0; paused = false; manual = false; active = []; heldSince = null; silenceSince = 0; wideUntil = cfg.wideHoldMs; records = new Map(); lastTarget = null; return update(now); },
      config: cfg,
    });
  }

  /** One continuous controller; use the ACTUAL elapsed renderer dt, no springs. */
  function stepFrame(currentView, targetView, dtSeconds, profile = {}, reducedMotion = false, safety) {
    const current = view(currentView), target = view(targetView);
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new RangeError('Invalid renderer dt');
    if (reducedMotion) return target;
    const p = {...DEFAULTS, ...profile}, dt = Math.min(dtSeconds, .1);
    const towards = (a, b, limit) => a + clamp(b - a, -limit, limit);
    const logZoom = Math.log(current.zoom), targetLog = Math.log(target.zoom);
    const trial = {
      yaw: wrap(current.yaw + clamp(wrap(target.yaw - current.yaw), -p.yawRate * dt, p.yawRate * dt)),
      pitch: towards(current.pitch, target.pitch, p.pitchRate * dt),
      zoom: Math.exp(towards(logZoom, targetLog, (target.zoom < current.zoom ? p.zoomOutLogRate : p.zoomInLogRate) * dt)),
    };
    if (!safety || typeof safety.fit !== 'function') return trial;
    if (Math.abs(wrap(target.yaw - current.yaw)) + Math.abs(target.pitch - current.pitch) + Math.abs(Math.log(target.zoom / current.zoom)) < 1e-10) return current;
    const minZoom = safety.minZoom ?? p.minZoom, overviewZoom = safety.overviewZoom ?? p.overviewZoom;
    const required = safety.context.requiredIds;
    const assess = v => {const e = safety.fit(v, safety.context); return {...e, fits: e.fits && required.every(id => e.visibleIds.includes(id))};};
    const safe = v => assess(v).fits;
    // Deliberate sequence: first widen, then turn, finally tighten. The fit
    // guard below also checks every actual intermediate frame, not just goals.
    const largeTurn = Math.abs(wrap(target.yaw - current.yaw)) > rad(25);
    const widen = { ...current, zoom: Math.max(minZoom, current.zoom * Math.exp(-p.zoomOutLogRate * dt)) };
    if (largeTurn && current.zoom > Math.min(overviewZoom, target.zoom) * 1.02) return widen;
    if (safe(trial)) return trial;
    // Zoom alone cannot separate overlapping circles at an edge-on pitch.
    // Improve real fit debt with widening AND pitch, retaining yaw first.
    const pitchOnly = {...current, pitch: trial.pitch};
    const wideningPitch = {...widen, pitch: trial.pitch};
    const alternatives = [wideningPitch, pitchOnly, widen];
    const currentEvaluation = assess(current);
    for (const candidate of alternatives) if (safe(candidate)) return candidate;
    if (!currentEvaluation.fits) {
      const penalty = e => Number.isFinite(e.overflowPenalty) ? e.overflowPenalty : 1e9;
      let best = current, bestPenalty = penalty(currentEvaluation);
      // Once wide, permit the planned small angular step if it reduces debt.
      if (current.zoom <= Math.min(overviewZoom, target.zoom) * 1.02) alternatives.push(trial);
      for (const candidate of alternatives) {
        const score = penalty(assess(candidate));
        if (score < bestPenalty - 1e-8) {best = candidate; bestPenalty = score;}
      }
      return best;
    }
    return current; // Honest blocked transition at the minimum; caller monitors fit.
  }

  /** Bounds are centered pixel coordinates; include real header/dock clearances. */
  function createProjectionFit({ids, project, bounds, padding = 0, pairSeparationRatio = 0}) {
    return (frame, context) => {
      const box = typeof bounds === 'function' ? bounds() : bounds;
      if (!box || ![box.left, box.right, box.top, box.bottom].every(Number.isFinite) || box.right <= box.left || box.bottom <= box.top) throw new TypeError('Finite fit bounds required');
      const visibleIds = [], clippedIds = [], projected = new Map(), overlappingPairs = []; let overflowPenalty = 0, centeringPenalty = 0, centeringWeight = 0;
      for (const id of ids) {
        const q = project(id, frame), required = context.requiredIds.includes(id);
        const valid = q && [q.x, q.y, q.diameter].every(Number.isFinite) && q.diameter >= 0 && q.visible !== false;
        if (valid) projected.set(id, q);
        const overflow = !valid ? 1e6 : Math.max(0, box.left + padding - (q.x - q.diameter / 2)) + Math.max(0, q.x + q.diameter / 2 - box.right + padding) + Math.max(0, box.top + padding - (q.y - q.diameter / 2)) + Math.max(0, q.y + q.diameter / 2 - box.bottom + padding);
        if (valid && overflow < 1e-6) visibleIds.push(id); else clippedIds.push(id);
        if (required) {
          overflowPenalty += overflow;
          if (valid) {
            const memory = (context.weights || []).find(row => row.id === id);
            const weight = .1 + (memory?.weight || 0) + (memory?.active ? .2 : 0);
            centeringPenalty += weight * Math.hypot((q.x - (box.left + box.right) / 2) / (box.right - box.left), (q.y - (box.top + box.bottom) / 2) / (box.bottom - box.top));
            centeringWeight += weight;
          }
        }
      }
      if (pairSeparationRatio > 0) for (let i = 0; i < context.requiredIds.length; i++) for (let j = i + 1; j < context.requiredIds.length; j++) {
        const aId = context.requiredIds[i], bId = context.requiredIds[j], a = projected.get(aId), b = projected.get(bId);
        if (!a || !b) continue;
        const deficit = pairSeparationRatio * (a.diameter + b.diameter) / 2 - Math.hypot(a.x - b.x, a.y - b.y);
        if (deficit > 1e-6) {overlappingPairs.push([aId, bId]); overflowPenalty += deficit;}
      }
      return {fits: context.requiredIds.every(id => visibleIds.includes(id)) && !overlappingPairs.length, visibleIds, clippedIds, overlappingPairs, overflowPenalty, centeringPenalty: centeringPenalty / Math.max(.01, centeringWeight)};
    };
  }
  const api = Object.freeze({createCalmCamera, createProjectionFit, stepFrame, DEFAULTS, wrap, rad});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CalmConversationCamera = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
