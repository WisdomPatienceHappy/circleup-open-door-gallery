import {createAttentionController} from './views-controller.mjs';
import {createStableSpeakerPolicy} from './stable-speaker-corridor-margin.mjs';

/** Event-driven B. The caller owns actual speech, camera-owner selection,
 * membership and all mode/manual fences. No schedule or activity forecast API.
 * The imported A adapter is byte-exact be662; only its policy is injected.
 */
export function createCurrentSpeakerController(options = {}) {
  const libraries = options.libraries ?? {
    policy: globalThis.AttentionConversationCamera,
    calm: globalThis.CalmConversationCamera,
    motion: globalThis.RoundConversationMotion,
  };
  if (typeof libraries.policy?.create !== 'function') {
    throw new TypeError('The frozen assessment policy library is required');
  }
  const configKeys = ['minZoom','maxZoom','manualRecoveryMaxZoom','memorySeconds','paceSeconds','restPitch','restMode','portraitFraming','faceGoalFraction','stableFaceGoalFraction','profile','motion','zoomIntent','sizeObjective','focusRecovery','speakerSizeFloor','visibilityRecovery','focusObjective','visibilityRecoveryZoom'];
  const config = Object.fromEntries(configKeys.filter(k => options.config?.[k] !== undefined).map(k => [k, options.config[k]]));
  const fraction = config.stableFaceGoalFraction ?? config.faceGoalFraction ?? .46;
  if (!Number.isFinite(fraction) || fraction < .14 || fraction > .60) {
    throw new RangeError('stableFaceGoalFraction must be in .14.. .60');
  }
  let stablePolicy = null, heldPlan = null;
  const injected = {
    create(args) {
      stablePolicy = createStableSpeakerPolicy({
        ...args,
        assessmentLibrary: libraries.policy,
        faceGoalFraction: fraction,
      });
      heldPlan = null;
      return {...stablePolicy, plan(input) { heldPlan = stablePolicy.plan(input); return heldPlan; }};
    },
  };
  const wrappedMotion = {
    create(settings) {
      const round = libraries.motion.create(settings);
      let policyInstance = null, revision = null, phase = 0, travel = null;
      const angle = x => Math.atan2(Math.sin(x), Math.cos(x));
      const equal = (a,b) => a && b && Math.abs(angle(a.yaw-b.yaw)) < 1e-10 && Math.abs(a.pitch-b.pitch) < 1e-10 && Math.abs(Math.log(a.zoom/b.zoom)) < 1e-10;
      return Object.freeze({
        reset() { round.reset(); },
        snapshot() { return {...round.snapshot(), stableTravel: travel ? {phase, waypoint: {...travel[phase]}} : null}; },
        step(current, target, dt, profile, reduced, safety) {
          const p = heldPlan;
          // Recovery/manual paths owned by the base adapter keep their exact
          // destination. Only a validated held speaker-goal owns this route.
          if (!p || !equal(target,p.frame) || !p.metrics.stableTravel?.corridorFits || reduced) {
            return round.step(current,target,dt,profile,reduced,safety);
          }
          if (policyInstance !== stablePolicy || revision !== p.metrics.goalRevision) {
            policyInstance = stablePolicy; revision = p.metrics.goalRevision;
            travel = p.metrics.stableTravel.waypoints.map(f => ({...f})); phase = equal(current,p.frame) ? 2 : 0;
          }
          if (equal(current,p.frame)) phase = 2;
          while (phase < 2) {
            const f = travel[phase], v = round.snapshot().velocity;
            const near = Math.abs(angle(current.yaw-f.yaw)) < .002 && Math.abs(current.pitch-f.pitch) < .002 && Math.abs(Math.log(current.zoom/f.zoom)) < .002;
            if (!near || phase === 1 && (Math.abs(v.yaw) > .02 || Math.abs(v.pitch) > .02)) break;
            phase++;
          }
          return round.step(current,travel[phase],dt,profile,reduced,safety);
        },
      });
    },
  };
  const controller = createAttentionController({
    ...Object.fromEntries(['getRoster','getProjection','getBounds','getSpeakerYaw','getFrame','applyFrame','getBlockers','getContentRects','getBaseZoom','getRestPitch','getHolder'].filter(k => options[k] !== undefined).map(k => [k, options[k]])),
    libraries: {calm: libraries.calm, motion: wrappedMotion, policy: injected},
    // Dirty owner, explicit basis, mode and handoff events still wake planning.
    // Elapsed wall time does not reselect a destination during an ordinary turn.
    config: {...config, planIntervalMs: Number.MAX_SAFE_INTEGER},
  });
  let owner = null;
  return Object.freeze({
    ...controller,
    observe(id, now) { controller.observe(id,now); owner = id; },
    reset() { controller.reset(); owner = null; },
    step(now, dt, stepOptions = {}) {
      if (owner !== null && !options.getRoster().some(p => (p && typeof p === 'object' ? p.id : p) === owner)) owner = null;
      // A silent actual holder is not a new speaker or camera-owner mandate.
      // Domain holder/intent state is retained; B stops automatic travel on null.
      return controller.step(now,dt,{
        paused: Boolean(stepOptions.paused) || owner === null,
        mode: stepOptions.mode,
        reducedMotion: stepOptions.reducedMotion,
      });
    },
    snapshot() {
      const s = controller.snapshot();
      return {
        ...s,
        algorithm: 'stable-current-speaker',
        cameraOwnerId: owner,
        configuration: {
          ...s.configuration,
          algorithm: 'stable-current-speaker',
          planIntervalMs: null,
          targetCadence: 'owner-or-explicit-basis-event',
          stableFaceGoalFraction: fraction,
          recentSpeakerBlending: false,
        },
        stableGoal: stablePolicy?.snapshot() ?? null,
      };
    },
  });
}

export default createCurrentSpeakerController;
