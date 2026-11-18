/* Pure fixed-seat geometry. World +y is up, +z is forward. No dolly or roll. */
(function (root) {
  "use strict";
  const TAU = Math.PI * 2,
    rad = (d) => (d * Math.PI) / 180,
    deg = (r) => (r * 180) / Math.PI;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const mixAngle = (a, b, t) => a + wrap(b - a) * t;
  function seats(count, radius = 1) {
    return Array.from({ length: count }, (_, id) => {
      const a = (id / count) * TAU;
      return {
        id,
        x: radius * Math.sin(a),
        y: 0,
        z: radius * (1 - Math.cos(a)),
      };
    });
  }
  function toward(a, b) {
    return {
      yaw: Math.atan2(b.x - a.x, b.z - a.z),
      pitch: Math.atan2(
        (b.y || 0) - (a.y || 0),
        Math.hypot(b.x - a.x, b.z - a.z)
      ),
    };
  }
  function view(v, c) {
    const x = v.x * Math.cos(c.yaw) - v.z * Math.sin(c.yaw),
      d = v.x * Math.sin(c.yaw) + v.z * Math.cos(c.yaw);
    return {
      x,
      y: d * Math.sin(c.pitch) - v.y * Math.cos(c.pitch),
      d: d * Math.cos(c.pitch) + v.y * Math.sin(c.pitch),
    };
  }
  function basis(yaw, pitch) {
    return {
      u: { x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) },
      v: {
        x: Math.sin(yaw) * Math.sin(pitch),
        y: -Math.cos(pitch),
        z: Math.cos(yaw) * Math.sin(pitch),
      },
      n: {
        x: Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: Math.cos(yaw) * Math.cos(pitch),
      },
    };
  }
  function surface(
    seat,
    pose,
    camera,
    {
      focal,
      diameter,
      mode,
      strength,
      limit,
      relativeYaw,
      compensation = 0,
      referenceDepth = 2,
      maxApparentDiameter = Infinity,
    }
  ) {
    const face = { yaw: wrap(camera.yaw + Math.PI), pitch: -camera.pitch },
      mix = mode === "shared" ? strength : 0;
    let yaw =
        face.yaw +
        (Number.isFinite(relativeYaw)
          ? relativeYaw
          : wrap(pose.yaw - face.yaw)) *
          mix,
      pitch = face.pitch + (pose.pitch - face.pitch) * mix;
    if (limit) {
      yaw = face.yaw + clamp(wrap(yaw - face.yaw), -limit, limit);
      pitch = face.pitch + clamp(pitch - face.pitch, -limit, limit);
    }
    const b = basis(yaw, pitch),
      C = view(seat, camera),
      U = view(b.u, camera),
      V = view(b.v, camera),
      effectiveDiameter = Math.min(
        diameter *
          (1 -
            compensation +
            (compensation * Math.max(0.025, C.d)) / referenceDepth),
        (maxApparentDiameter * Math.max(0.025, C.d)) / focal
      ),
      k = effectiveDiameter / 100;

    const reverse = b.n.x * -seat.x + b.n.y * -seat.y + b.n.z * -seat.z < 0;
    const D = Math.max(0.025, C.d),
      ox = C.x - 50 * k * (U.x + V.x),
      oy = C.y - 50 * k * (U.y + V.y),
      od = C.d - 50 * k * (U.d + V.d);
    const matrix = [
      (focal * U.x * k) / D,
      (focal * U.y * k) / D,
      0,
      (U.d * k) / D,
      (focal * V.x * k) / D,
      (focal * V.y * k) / D,
      0,
      (V.d * k) / D,
      0,
      0,
      1,
      0,
      (focal * ox) / D,
      (focal * oy) / D,
      0,
      od / D,
    ];
    // Near-plane clipping is geometric, never an overlap/readability shortcut.
    let poly = [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      cut = [];
    const depth = (p) => od + k * (U.d * p[0] + V.d * p[1]);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        da = depth(a),
        db = depth(b),
        ina = da >= 0.025,
        inb = db >= 0.025;
      if (ina) cut.push(a);
      if (ina !== inb) {
        const t = (0.025 - da) / (db - da);
        cut.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    const clipPath =
      cut.length === 4 &&
      poly.every((p, i) => cut[i] && p[0] === cut[i][0] && p[1] === cut[i][1])
        ? ""
        : "polygon(" +
          cut.map((p) => p[0] + "px " + p[1] + "px").join(",") +
          ")";
    return {
      matrix,
      behind: !cut.length,
      clipPath,
      reverse,
      depth: C.d,
      x: (focal * C.x) / D,
      y: (focal * C.y) / D,
      size: (focal * effectiveDiameter) / D,
      effectiveDiameter,
      flat: mode !== "shared" || strength === 0,
      yaw,
      pitch,
    };
  }
  // Stable view is a rigid, scaled map of the actual Euclidean x/z ring.
  // Pan contributes one common translation; it never changes pairwise distances.
  function stablePoint(seat, pan, focal, radius) {
    return {
      x: focal * (seat.x - pan.x),
      y: focal * (radius - seat.z - pan.y),
    };
  }
  function stableSurface(
    seat,
    pose,
    pan,
    { focal, diameter, radius, mode, strength, limit, relativeYaw }
  ) {
    const center = stablePoint(seat, pan, focal, radius);
    const base = toward(seat, { x: 0, y: 0, z: 0 });
    let yaw =
      mode === "shared"
        ? (Number.isFinite(relativeYaw)
            ? relativeYaw
            : wrap(pose.yaw - base.yaw)) * strength
        : 0;
    let pitch = mode === "shared" ? pose.pitch * strength : 0;
    if (limit) {
      yaw = clamp(wrap(yaw), -limit, limit);
      pitch = clamp(pitch, -limit, limit);
    }
    const k = (focal * diameter) / 100;
    const a = k * Math.cos(yaw),
      b = 0,
      c = k * Math.sin(yaw) * Math.sin(pitch),
      d = k * Math.cos(pitch);
    return {
      ...center,
      size: focal * diameter,
      depth: seat.z,
      behind: false,
      clipPath: "",
      reverse: Math.cos(yaw) * Math.cos(pitch) < 0,
      yaw: base.yaw + yaw,
      pitch,
      matrix: [
        a,
        b,
        0,
        0,
        c,
        d,
        0,
        0,
        0,
        0,
        1,
        0,
        center.x - 50 * (a + c),
        center.y - 50 * (b + d),
        0,
        1,
      ],
    };
  }
  function fitDiameter(points, requested, clearance = 0.1) {
    const valid = points.filter(
      (p) =>
        p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.visible !== false
    );
    let separation = Infinity;
    for (let i = 0; i < valid.length; i++)
      for (let j = i + 1; j < valid.length; j++)
        separation = Math.min(
          separation,
          Math.hypot(valid[i].x - valid[j].x, valid[i].y - valid[j].y)
        );
    const safeRequest = Number.isFinite(requested) ? Math.max(0, requested) : 0;
    const cap = Number.isFinite(separation)
      ? Math.max(0, separation * (1 - clearance) - 5)
      : safeRequest;
    return {
      diameter: Math.min(safeRequest, cap),
      separation: Number.isFinite(separation) ? separation : null,
      limited: cap < safeRequest,
    };
  }
  function arcAngle(seat, radius, strength) {
    const range = Math.hypot(seat.x, seat.z);
    if (range < 1e-8) return 0;
    return 0.4 * strength * Math.max(0, 1 - range / (2 * radius));
  }
  const api = {
    rad,
    deg,
    clamp,
    wrap,
    mixAngle,
    seats,
    toward,
    view,
    basis,
    surface,
    stablePoint,
    stableSurface,
    fitDiameter,
    arcAngle,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.SeatModel = Object.freeze(api);
})(typeof window === "undefined" ? globalThis : window);
