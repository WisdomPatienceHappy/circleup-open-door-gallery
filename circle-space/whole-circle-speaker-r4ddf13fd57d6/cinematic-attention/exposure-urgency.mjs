/** Pure rate scheduling. The caller owns actual, duration-weighted composition signals. */
const finite = Number.isFinite;
const defaults = Object.freeze({
  attackSeconds: .35, releaseSeconds: .9,
  yawRateMin: .08, yawRateMax: .30,
  pitchRateMin: .035, pitchRateMax: .12,
  stopAngle: 2 * Math.PI / 180,
});
function unit(value, name) {
  if (!finite(value) || value < 0 || value > 1) throw new RangeError(`${name} must be finite in [0,1].`);
  return value;
}
function bool(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean.`);
  return value;
}
export function createExposureUrgency(options = {}) {
  const configuration = Object.freeze(Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, options[key] === undefined ? fallback : options[key]])));
  for (const key of ['attackSeconds', 'releaseSeconds', 'stopAngle']) {
    if (!finite(configuration[key]) || configuration[key] <= 0) throw new RangeError(`${key} must be finite and positive.`);
  }
  for (const axis of ['yaw', 'pitch']) {
    const min = configuration[`${axis}RateMin`], max = configuration[`${axis}RateMax`];
    if (!finite(min) || !finite(max) || min < 0 || max < min) throw new RangeError(`${axis} rate bounds must be finite, nonnegative and ordered.`);
  }
  const initial = options.initialState;
  let filteredUrgency = initial === undefined ? 0 : unit(initial?.urgency, 'initialState.urgency');
  let urgency = 0, targetUrgency = 0, angleFactor = 0, lastInput = null, reason = 'unobserved';
  function snapshot() {
    return {
      urgency, filteredUrgency, targetUrgency, angleFactor,
      yawRate: configuration.yawRateMin + (configuration.yawRateMax - configuration.yawRateMin) * urgency,
      pitchRate: configuration.pitchRateMin + (configuration.pitchRateMax - configuration.pitchRateMin) * urgency,
      reason, input: lastInput && { ...lastInput },
    };
  }
  function update({ seconds, need, opportunity, remainingAngle, blocked = false, quiet = false, paused = false } = {}) {
    // Validate the entire observation before touching retained state.
    if (!finite(seconds) || seconds < 0) throw new RangeError('seconds must be finite and nonnegative.');
    unit(need, 'need'); unit(opportunity, 'opportunity');
    if (!finite(remainingAngle) || remainingAngle < 0) throw new RangeError('remainingAngle must be finite and nonnegative radians.');
    bool(blocked, 'blocked'); bool(quiet, 'quiet'); bool(paused, 'paused');
    const x = Math.min(1, remainingAngle / configuration.stopAngle);
    const nextAngleFactor = x * x * (3 - 2 * x);
    const nextTarget = blocked || quiet || paused ? 0 : need * opportunity * nextAngleFactor;
    const timeConstant = nextTarget > filteredUrgency ? configuration.attackSeconds : configuration.releaseSeconds;
    const gain = -Math.expm1(-seconds / timeConstant);
    const nextFiltered = paused ? 0 : Math.max(0, Math.min(1, filteredUrgency + (nextTarget - filteredUrgency) * gain));
    filteredUrgency = nextFiltered;
    targetUrgency = nextTarget;
    // Current weighted need is an upper bound, even after a strong prior view.
    // Downward clipping/hard gates are intentional; this helper is not a motion integrator.
    urgency = Math.min(nextFiltered, nextTarget);
    angleFactor = nextAngleFactor;
    reason = paused ? 'paused' : blocked ? 'blocked' : quiet ? 'quiet' : remainingAngle === 0 ? 'attained' : opportunity === 0 ? 'unreachable' : need === 0 ? 'no-need' : 'eligible';
    lastInput = { seconds, need, opportunity, remainingAngle, blocked, quiet, paused };
    return snapshot();
  }
  function reset() {
    filteredUrgency = urgency = targetUrgency = angleFactor = 0;
    lastInput = null; reason = 'reset';
    return snapshot();
  }
  return Object.freeze({ update, snapshot, reset, configuration });
}
