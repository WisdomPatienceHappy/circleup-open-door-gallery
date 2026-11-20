/* Stateful camera dynamics only. The existing planner still owns framing. */
(function (root) {
  'use strict';
  const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const axes = ['yaw', 'pitch', 'logZoom'];
  const zero = () => ({yaw: 0, pitch: 0, logZoom: 0});
  const coordinate = frame => ({yaw: frame.yaw, pitch: frame.pitch, logZoom: Math.log(frame.zoom)});
  const frame = value => ({yaw: wrap(value.yaw), pitch: value.pitch, zoom: Math.exp(value.logZoom)});
  function create({stepFrame, responseSeconds = .12} = {}) {
    if (typeof stepFrame !== 'function' || !Number.isFinite(responseSeconds) || responseSeconds <= 0) throw new TypeError('Motion needs a safe planner step and positive response');
    let velocity = zero(), acceleration = zero();
    const metrics = {steps: 0, resets: 0, safetyLimits: 0, boundLimits: 0};
    function reset() { velocity = zero(); acceleration = zero(); metrics.resets++; }
    function step(current, target, seconds, profile = {}, reducedMotion = false, safety) {
      if (![current.yaw, current.pitch, current.zoom, target.yaw, target.pitch, target.zoom, seconds].every(Number.isFinite) || current.zoom <= 0 || target.zoom <= 0 || seconds < 0) throw new TypeError('Finite camera frames and elapsed time required');
      const dt = Math.min(seconds, .1);
      const low = safety?.minZoom ?? 1e-6, high = safety?.maxZoom ?? Infinity;
      const fixed = Number.isFinite(safety?.fixedPitch) ? safety.fixedPitch : null;
      const bounded = candidate => ({yaw: wrap(candidate.yaw), pitch: candidate.pitch, zoom: clamp(candidate.zoom, low, high)});
      const destination = fixed === null ? target : {...target, pitch: fixed};
      if (reducedMotion) { reset(); return bounded(destination); }
      if (!dt) return bounded(current);
      metrics.steps++;
      // This chooses the existing widen/turn/tighten phase. It is not the
      // rendered step; acceleration below retains state through retargeting.
      const intent = stepFrame(current, destination, .1, profile, false, safety);
      const from = coordinate(current), goal = coordinate(destination), direction = coordinate(intent);
      goal.yaw = from.yaw + wrap(goal.yaw - from.yaw);
      direction.yaw = from.yaw + wrap(direction.yaw - from.yaw);
      const rates = {yaw: profile.yawRate ?? .20943951023931953, pitch: profile.pitchRate ?? .08726646259971647,
        logZoom: direction.logZoom < from.logZoom ? profile.zoomOutLogRate ?? .9 : profile.zoomInLogRate ?? .035};
      const next = {...from};
      for (const axis of axes) {
        if (axis === 'pitch' && fixed !== null && Math.abs(current.pitch - fixed) < 1e-7 && Math.abs(velocity.pitch) < 1e-6) { next.pitch = fixed; velocity.pitch = 0; acceleration.pitch = 0; continue; }
        const intended = direction[axis] - from[axis], error = goal[axis] - from[axis], rate = rates[axis];
        if (Math.abs(intended) < 1e-12 && Math.abs(error) > 1e-12) goal[axis] = from[axis];
        else if (intended * error <= 0 && Math.abs(intended) > 1e-12) {
          // Safety can require widening before a turn even when the final
          // target is closer. Keep that phase, not a tiny per-frame waypoint.
          goal[axis] = from[axis] + Math.sign(intended) * Math.max(Math.abs(error), rate * .5);
          if (axis === 'logZoom') goal[axis] = Math.max(Math.log(low), Math.min(goal[axis], Math.log(safety?.overviewZoom ?? 1)));
        }
        // Without the speed bound this seek/filter pair is critically damped.
        // The acceleration's slew bound also removes the first-frame kick.
        const desired = clamp((goal[axis] - from[axis]) / (4 * responseSeconds), -rate, rate);
        const wantedAcceleration = (desired - velocity[axis]) * -Math.expm1(-dt / responseSeconds) / dt;
        // Slow inward speed must not also remove the braking authority needed
        // after a fast outward fit correction changes direction.
        const brakingRate = axis === 'logZoom' ? Math.max(profile.zoomOutLogRate ?? .9, profile.zoomInLogRate ?? .035) : rate;
        const jerkLimit = 2 * brakingRate / (responseSeconds * responseSeconds);
        const nextAcceleration = acceleration[axis] + clamp(wantedAcceleration - acceleration[axis], -jerkLimit * dt, jerkLimit * dt);
        const nextVelocity = velocity[axis] + nextAcceleration * dt;
        next[axis] += (velocity[axis] + nextVelocity) * dt / 2;
        velocity[axis] = nextVelocity;
        acceleration[axis] = nextAcceleration;
      }
      let candidate = bounded(frame(next));
      if (candidate.zoom !== Math.exp(next.logZoom)) { velocity.logZoom = 0; acceleration.logZoom = 0; metrics.boundLimits++; }
      if (safety && typeof safety.fit === 'function') {
        const assess = pose => {
          const result = safety.fit(pose, safety.context);
          return {fits: result.fits && safety.context.requiredIds.every(id => result.visibleIds.includes(id)),
            debt: Number.isFinite(result.overflowPenalty) ? result.overflowPenalty : Infinity};
        };
        const before = assess(current), allowed = pose => {
          const result = assess(pose);
          return result.fits || !before.fits && result.debt <= before.debt + 1e-8;
        };
        if (!allowed(candidate)) {
          // Hard fit boundaries outrank momentum. Find the safe part of this
          // actual smooth step; do not hide faces, translate or reseat them.
          let lo = 0, hi = 1;
          const delta = {yaw: wrap(candidate.yaw - current.yaw), pitch: candidate.pitch - current.pitch, logZoom: Math.log(candidate.zoom / current.zoom)};
          const at = amount => bounded({yaw: current.yaw + delta.yaw * amount, pitch: current.pitch + delta.pitch * amount, zoom: current.zoom * Math.exp(delta.logZoom * amount)});
          for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (allowed(at(mid))) lo = mid; else hi = mid; }
          candidate = lo > 1e-5 ? at(lo) : bounded(current);
          const actual = {yaw: wrap(candidate.yaw - current.yaw), pitch: candidate.pitch - current.pitch, logZoom: Math.log(candidate.zoom / current.zoom)};
          for (const axis of axes) { velocity[axis] = actual[axis] / dt; acceleration[axis] = 0; }
          metrics.safetyLimits++;
        }
      }
      return candidate;
    }
    return Object.freeze({step, reset, snapshot: () => ({velocity: {...velocity}, acceleration: {...acceleration}, responseSeconds, metrics: {...metrics}})});
  }
  const api = Object.freeze({create});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmoothConversationMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
