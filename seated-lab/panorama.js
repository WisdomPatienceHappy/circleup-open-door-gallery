(function () {
  "use strict";

  /**
   * Candidate only; no application/provider connection.
   * Owner: Codex /root/attention_transport, parent session
   * 01a1f0dd-94e0-77b1-9463-c4248c261033, 2026-11-18.
   *
   * World: a fixed Euclidean ring with the observer at its first seat/origin.
   * Observation: azimuth/elevation panorama, NOT a pinhole camera or overhead map.
   * Horizontal angular FOV gives f = viewportWidth / fovRadians. Yaw/pitch are
   * translations of this angular chart. Vertical chart translation is not a full
   * rigid rotation of a sphere about a camera-local horizontal axis.
   *
   * All pairwise center offsets are invariant under pan away from the wrap seam;
   * zoom scales every chart coordinate and footprint by the same focal ratio.
   * Ground points use exactly the same observation map. Their projected shape is
   * whatever the fixed ground curve projects to; the eye-level ring is a line at
   * the horizon, not an ellipse seen from above.
   *
   * localPlaneAffine is an explicit first-order angular-projection approximation
   * for optional world-oriented video planes. It is exact at the center and in
   * its differential, not an exact projection of a large finite plane. The exact
   * nonlinear plane-point projection is supplied for comparison, not production.
   * Screen-facing circles should instead use billboard2D without plane warping.
   */

  const TAU = 2 * Math.PI;
  const EPS = 1e-10;
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const add = (a, b, s = 1) => ({
    x: a.x + b.x * s,
    y: a.y + b.y * s,
    z: a.z + b.z * s,
  });

  function finite(...values) {
    if (!values.every(Number.isFinite))
      throw new RangeError("Non-finite geometry");
  }

  function seats(count, radius = 1) {
    if (!Number.isInteger(count) || count < 3 || count > 18)
      throw new RangeError("Count must be 3–18");
    finite(radius);
    if (radius <= EPS) throw new RangeError("Radius must be positive");
    return Array.from({ length: count }, (_, id) => {
      const theta = (id / count) * TAU;
      return {
        id,
        x: radius * Math.sin(theta),
        y: 0,
        z: radius * (1 - Math.cos(theta)),
      };
    });
  }

  function direction(point) {
    finite(point.x, point.y, point.z);
    const horizontalRange = Math.hypot(point.x, point.z);
    const range = Math.hypot(horizontalRange, point.y);
    if (range <= EPS)
      return { valid: false, reason: "camera-origin", range, horizontalRange };
    if (horizontalRange <= EPS)
      return { valid: false, reason: "angular-pole", range, horizontalRange };
    return {
      valid: true,
      bearing: Math.atan2(point.x, point.z),
      elevation: Math.atan2(point.y, horizontalRange),
      range,
      horizontalRange,
    };
  }

  function focalFromHorizontalFov(viewportWidth, fovRadians) {
    finite(viewportWidth, fovRadians);
    if (viewportWidth <= 0 || fovRadians <= 0 || fovRadians >= TAU)
      throw new RangeError(
        "Require positive width and horizontal FOV below 360°"
      );
    return viewportWidth / fovRadians;
  }

  function seamSafety(viewportWidth, focal, footprintRadius = 0) {
    finite(viewportWidth, focal, footprintRadius);
    if (viewportWidth <= 0 || focal <= 0 || footprintRadius < 0)
      throw new RangeError("Invalid viewport");
    const halfExtent = (viewportWidth / 2 + footprintRadius) / focal;
    return {
      safe: halfExtent < Math.PI,
      angularHalfExtent: halfExtent,
      seamMargin: Math.PI - halfExtent,
    };
  }

  function project(point, { yaw = 0, pitch = 0, focal = 1 } = {}) {
    finite(yaw, pitch, focal);
    if (focal <= 0) throw new RangeError("Focal must be positive");
    const ray = direction(point);
    if (!ray.valid) return ray;
    const delta = wrap(ray.bearing - yaw);
    return {
      ...ray,
      x: focal * delta,
      y: focal * (pitch - ray.elevation),
      delta,
    };
  }

  function billboard2D(
    point,
    { yaw = 0, pitch = 0, focal = 1, diameterPx } = {}
  ) {
    finite(diameterPx);
    if (diameterPx < 0) throw new RangeError("Diameter cannot be negative");
    const q = project(point, { yaw, pitch, focal });
    if (!q.valid) return q;
    const scale = diameterPx / 100;
    return {
      ...q,
      size: diameterPx,
      matrix: [scale, 0, 0, scale, q.x - diameterPx / 2, q.y - diameterPx / 2],
    };
  }

  /** Small-angle angular-size policy. At strength=1, f*D/r = f*baseD/ref. */
  function compensatedWorldDiameter(
    point,
    baseDiameter,
    strength,
    referenceRange
  ) {
    finite(baseDiameter, strength, referenceRange);
    if (
      baseDiameter < 0 ||
      strength < 0 ||
      strength > 1 ||
      referenceRange <= EPS
    )
      throw new RangeError("Invalid compensation policy");
    const ray = direction(point);
    if (!ray.valid) return null;
    return (
      baseDiameter * (1 - strength + (strength * ray.range) / referenceRange)
    );
  }

  function normalBasis(yaw, pitch) {
    finite(yaw, pitch);
    return {
      right: { x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) },
      down: {
        x: Math.sin(yaw) * Math.sin(pitch),
        y: -Math.cos(pitch),
        z: Math.cos(yaw) * Math.sin(pitch),
      },
      normal: {
        x: Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: Math.cos(yaw) * Math.cos(pitch),
      },
    };
  }

  function angularJacobian(point) {
    const ray = direction(point);
    if (!ray.valid) return ray;
    const h = ray.horizontalRange,
      r2 = ray.range ** 2,
      h2 = h ** 2;
    return {
      ...ray,
      bearingGradient: { x: point.z / h2, y: 0, z: -point.x / h2 },
      elevationGradient: {
        x: (-point.x * point.y) / (h * r2),
        y: h / r2,
        z: (-point.z * point.y) / (h * r2),
      },
    };
  }

  function localPlaneAffine(
    point,
    pose,
    { yaw = 0, pitch = 0, focal = 1, worldDiameter } = {}
  ) {
    finite(worldDiameter);
    if (worldDiameter < 0) throw new RangeError("Diameter cannot be negative");
    const center = project(point, { yaw, pitch, focal });
    if (!center.valid) return center;
    const j = angularJacobian(point),
      basis = normalBasis(pose.yaw, pose.pitch),
      k = worldDiameter / 100;
    const a = focal * dot(j.bearingGradient, basis.right) * k;
    const b = -focal * dot(j.elevationGradient, basis.right) * k;
    const c = focal * dot(j.bearingGradient, basis.down) * k;
    const d = -focal * dot(j.elevationGradient, basis.down) * k;
    return {
      ...center,
      approximation: "local angular Jacobian; finite plane is nonlinear",
      reverse: dot(basis.normal, point) > 0,
      matrix: [a, b, c, d, center.x - 50 * (a + c), center.y - 50 * (b + d)],
    };
  }

  function exactPlanePoint(
    point,
    pose,
    u,
    v,
    { yaw = 0, pitch = 0, focal = 1 } = {}
  ) {
    const basis = normalBasis(pose.yaw, pose.pitch);
    return project(add(add(point, basis.right, u), basis.down, v), {
      yaw,
      pitch,
      focal,
    });
  }

  function facingObserver(point) {
    const ray = direction(point);
    if (!ray.valid) return ray;
    return {
      valid: true,
      yaw: wrap(ray.bearing + Math.PI),
      pitch: -ray.elevation,
    };
  }

  const claims = Object.freeze({
    exact: [
      "Fixed world seats and camera origin; no dolly, reseating or group rotation",
      "Remote eye-level seat bearing equals pi/2-pi*i/count; adjacent difference -pi/count",
      "Yaw/pitch translate angular-chart centers and ground-guide points equally away from seam",
      "Changing focal uniformly scales chart centers and screen-facing footprints",
      "Screen-facing circles use exact 2D transforms at unchanged angular centers",
      "Local plane differential and its center are exact; its affine finite footprint is approximate",
    ],
    limits: [
      "Not pinhole perspective; equirectangular angular chart intentionally preserves spacing",
      "Pitch is chart offset, not full camera-local rigid spherical rotation",
      "Pair differences crossing a 360-degree wrap seam change by 2*pi*f; seam must remain outside frustum",
      "Own seat is the camera origin and has no bearing/elevation; retain separate self preview",
      "Ray-distance compensation is correct for angular local size; forward-depth compensation depends on yaw",
      "Large oriented planes need nonlinear angular rendering or a declared local-affine approximation",
      "Angular poles are undefined; current eye-level ring excludes them",
      "Equal circles can still overlap; fit must use angular center gaps without moving seats",
    ],
  });

  window.SeatPanorama = Object.freeze({
    project,
    billboard2D,
    compensatedWorldDiameter,
    localPlaneAffine,
    focalFromHorizontalFov,
    seamSafety,
    facingObserver,
  });
})();
