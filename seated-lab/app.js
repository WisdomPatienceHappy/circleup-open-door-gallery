(function () {
  "use strict";
  const M = SeatModel,
    P = SeatPanorama,
    F = SeatFixtures,
    $ = (s) => document.querySelector(s),
    scene = $("#scene"),
    list = $("#participants"),
    canvas = $("#ring"),
    ctx = canvas.getContext("2d"),
    reduced = matchMedia("(prefers-reduced-motion: reduce)"),
    pointers = new Map();
  const defaults = {
    fov: 72,
    pitch: 0,
    sensitivity: 100,
    face: 100,
    compensation: 100,
    clearance: 10,
    curve: 60,
    spacing: 100,
    follow: 100,
    delay: 0,
    speed: 100,
    damping: 85,
    turn: 100,
    "remote-pitch": 0,
    latency: 150,
    smooth: 200,
  };
  let settings = { ...defaults },
    camera = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 },
    count = 7,
    speaker = 3,
    mode = "billboard",
    projection = "panorama",
    autoFit = true,
    fitInfo = {},
    guideAnchors = [],
    pan = { x: 0, y: 0 },
    panVelocity = { x: 0, y: 0 },
    panGoal = { x: 0, y: 0 },
    ownSeat = null,
    world = [],
    people = [],
    remote = [],
    width = 0,
    height = 0,
    frame = 0,
    lastTime = 0,
    velocity = { yaw: 0, pitch: 0 },
    returning = false,
    returnAt = 0,
    returnGoal = 0,
    returnPitchGoal = 0,
    playing = false,
    nextTurn = 0,
    turnIndex = 0,
    ended = false,
    lastGesture = null,
    keyReturn = null,
    lastHeartbeat = 0,
    selected = 1,
    sharing = false,
    selfPose = { yaw: 0, pitch: 0 },
    selfPending = null,
    selfReceived = 0;
  const sequence = [3, 1, 3, 2, 4, 2, 5, 1, 6, 4, 3];
  const fmt = {
    fov: (v) => v + "°",
    pitch: (v) => v + "°",
    sensitivity: (v) => v + "%",
    clearance: (v) => v + "%",
    curve: (v) => (v === 0 ? "0% · straight" : v + "%"),
    face: (v) => v + "%",
    compensation: (v) =>
      v === 0
        ? "Off · natural"
        : v + "%" + (v === 100 ? " · equal-looking" : ""),
    spacing: (v) => (v / 100).toFixed(2) + "×",
    follow: (v) => v + "%",
    delay: (v) => v + " ms",
    speed: (v) => v + "%",
    damping: (v) =>
      (v / 100).toFixed(2) + (v < 100 ? " · bounce" : " · settle"),
    turn: (v) => v + "%",
    "remote-pitch": (v) => v + "°",
    latency: (v) => v + " ms",
    smooth: (v) => v + " ms",
  };
  function values() {
    for (const [id, value] of Object.entries(settings)) {
      const input = $("#" + id);
      input.value = value;
      $('output[for="' + id + '"]').value = fmt[id](value);
    }
  }
  function options(select, items, value) {
    select.replaceChildren(
      ...items.map(([id, name]) => {
        const o = document.createElement("option");
        o.value = id;
        o.textContent = name;
        return o;
      })
    );
    select.value = value;
  }
  function neutral(i) {
    return M.toward(world[i], { x: 0, y: 0, z: settings.spacing / 100 });
  }
  function rebuild() {
    world = M.seats(count, settings.spacing / 100);
  }
  function poseToward(i, target, pitch = 0) {
    return { ...M.toward(world[i], world[target]), pitch: M.rad(pitch) };
  }
  function schedulePose(i, pose, now = performance.now()) {
    const r = remote[i];
    if (!r || r.availability !== "live") return;
    if (r.pending) r.queued = pose;
    else r.pending = { pose, at: now + settings.latency };
  }
  function desiredPoses(now) {
    for (let i = 1; i < count; i++) {
      const r = remote[i],
        target =
          r.override === null ? (i === speaker ? 0 : speaker) : r.override;
      const p = r.away
        ? { yaw: neutral(i).yaw + Math.PI, pitch: M.rad(r.pitch) }
        : poseToward(i, target, r.pitch);
      schedulePose(i, p, now);
    }
  }
  function setCount(n) {
    count = n;
    speaker = Math.min(Math.max(1, Math.floor(n / 2)), n - 1);
    selected = 1;
    turnIndex = 0;
    returning = false;
    velocity = { yaw: 0, pitch: 0 };
    rebuild();
    list.replaceChildren();
    people = [];
    remote = Array.from({ length: n }, () => ({
      yaw: 0,
      pitch: 0,
      received: performance.now(),
      availability: "live",
      pending: null,
      override: null,
      away: false,
    }));
    for (let i = 1; i < n; i++) {
      const li = document.createElement("li");
      li.className = "person";
      li.setAttribute("aria-label", F[i].name);
      li.innerHTML =
        '<div class="surface"><img draggable="false" alt="" src="' +
        F[i].photo +
        '"><div class="reverse" aria-hidden="true"></div></div><span class="name torn">' +
        F[i].name +
        "<small></small></span>";
      list.append(li);
      people.push({
        id: i,
        li,
        surface: li.querySelector(".surface"),
        name: li.querySelector(".name"),
        small: li.querySelector("small"),
      });
      const p = poseToward(i, i === speaker ? 0 : speaker);
      remote[i] = { ...remote[i], ...p, goal: p, pitch: 0 };
    }
    options(
      $("#pose-person"),
      F.slice(1, n).map((p) => [p.id, p.name]),
      1
    );
    options(
      $("#pose-target"),
      [
        ...F.slice(0, n)
          .filter((p) => p.id !== selected)
          .map((p) => [p.id, p.name]),
        ["away", "Away from the circle"],
      ],
      speaker === 1 ? 0 : speaker
    );
    $("#count").value = n;
    camera.yaw = M.toward(world[0], world[speaker]).yaw;
    camera.pitch = M.rad(settings.pitch);
    ownSeat = document.createElement("li");
    ownSeat.className = "person self-person";
    ownSeat.innerHTML =
      '<div class="surface"><img draggable="false" src="assets/you.webp" alt="Your simulated video"><div class="reverse"></div></div><span class="name torn">You<small>Direction private</small></span>';
    list.append(ownSeat);
    pan = { x: 0, y: 0 };
    panVelocity = { x: 0, y: 0 };
    if (projection === "stable") syncStableGaze();
    markSpeaker();
    syncPerson();
    render();
  }
  function markSpeaker() {
    $("#speaker").textContent = F[speaker].name + " · speaking";
    $("#next").textContent = "Next →";
  }
  function speakerTo(i) {
    if (ended || !Number.isInteger(i) || i < 1 || i >= count) return;
    speaker = i;
    markSpeaker();
    desiredPoses(performance.now());
    if (!pointers.size) beginReturn();
    render();
  }
  function beginReturn(force = false) {
    if (ended || pointers.size) return;
    returning = true;
    returnAt = performance.now() + (force === true ? 0 : settings.delay);
    const strength = force === true ? 1 : settings.follow / 100;
    returnPitchGoal =
      camera.pitch + (M.rad(settings.pitch) - camera.pitch) * strength;
    returnGoal =
      camera.yaw +
      M.wrap(M.toward(world[0], world[speaker]).yaw - camera.yaw) * strength;
    panGoal = {
      x: pan.x + (world[speaker].x - pan.x) * strength,
      y:
        pan.y +
        (settings.spacing / 100 -
          world[speaker].z +
          Math.tan(M.rad(settings.pitch)) -
          pan.y) *
          strength,
    };
  }
  function pauseReturn() {
    returning = false;
    velocity = { yaw: 0, pitch: 0 };
    panVelocity = { x: 0, y: 0 };
  }
  function stableFocal() {
    return (
      (Math.min(width, height) * 0.36 * Math.tan(M.rad(36))) /
      Math.tan(M.rad(settings.fov) / 2)
    );
  }
  function syncStableGaze() {
    camera.yaw = Math.atan2(pan.x, settings.spacing / 100 - pan.y);
    camera.pitch = M.rad(settings.pitch);
  }
  function setProjection(v) {
    projection = v;
    pauseReturn();
    pan = { x: 0, y: Math.tan(M.rad(settings.pitch)) };
    $(".room").dataset.projection = v;
    $("#projection").value = v;
    $("#compensation").disabled = v === "stable" || autoFit;
    $("#curve").disabled = v !== "panorama";
    $("#compensation-note").textContent =
      v === "stable"
        ? "Stable circle already uses equal video sizes. Try Perspective seat to compare near/far compensation."
        : "0% keeps natural perspective;100% makes nearby surfaces smaller and distant ones larger to equalize apparent size.";
    for (const r of remote) r.visualDelta = undefined;
    if (v === "stable") syncStableGaze();
    $("#hint span").innerHTML =
      (v === "stable" ? "Drag to pan" : "Drag to look") +
      " · Pinch to zoom<br><small>Let go to face the speaker</small>";
    $("#help-content p").textContent =
      v === "stable"
        ? "Stable circle is an overview. Pan translates the ring; zoom scales it uniformly."
        : "Your camera stays at your seat. Drag turns your look; release faces the current speaker. Panoramic seat keeps angular spacing steady, including the bottom guide.";
    if (v === "panorama")
      $("#compensation-note").textContent =
        "100% gives equal apparent circles using distance from your fixed seat. Prevent overlap shrinks them in place to fit the gaps.";
    render();
  }
  function zoomTo(v) {
    settings.fov = M.clamp(v, 30, 110);
    settings.fov = Math.round(settings.fov * 10) / 10;
    $("#fov").value = settings.fov;
    $("output[for=fov]").value = settings.fov + "°";
    render();
  }
  function syncPerson() {
    const r = remote[selected];
    if (!r) return;
    $("#availability").value = r.availability;
    settings["remote-pitch"] = r.pitch || 0;
    $("#remote-pitch").value = settings["remote-pitch"];
    $('output[for="remote-pitch"]').value = fmt["remote-pitch"](
      settings["remote-pitch"]
    );
    options(
      $("#pose-target"),
      [
        ...F.slice(0, count)
          .filter((p) => p.id !== selected)
          .map((p) => [p.id, p.name]),
        ["away", "Away from the circle"],
      ],
      r.away
        ? "away"
        : r.override === null
        ? selected === speaker
          ? 0
          : speaker
        : r.override
    );
  }
  function drawer(open, help = false) {
    $("#drawer").hidden = !open;
    $("#adjust").setAttribute("aria-expanded", String(open));
    $("#help-content").hidden = !help;
    $("#drawer-title").textContent = help
      ? "How to look around"
      : "Adjust your view";
    if (open) {
      if (help) $("#drawer .drawer-scroll").scrollTop = 0;
      $("#close-drawer").focus();
    } else $("#adjust").focus();
  }
  function arcOffset(seat, focal) {
    const maxBearing = Math.PI / 2 - Math.PI / count;
    const ref = M.clamp(M.wrap(camera.yaw), -maxBearing, maxBearing);
    const range = ((2 * settings.spacing) / 100) * Math.cos(ref);
    return (
      focal *
      (M.arcAngle(seat, settings.spacing / 100, settings.curve / 100) -
        M.arcAngle(
          { x: 0, z: range },
          settings.spacing / 100,
          settings.curve / 100
        ))
    );
  }
  function angularSurface(seat, pose, opts) {
    const q = P.project(seat, { ...camera, focal: opts.focal });
    const worldDiameter = P.compensatedWorldDiameter(
      seat,
      opts.diameter,
      opts.compensation,
      opts.referenceDepth
    );
    const size = Math.min(
      (opts.focal * worldDiameter) / q.range,
      opts.maxApparentDiameter
    );
    const base = P.facingObserver(seat),
      mix = mode === "shared" ? opts.strength : 0;
    let delta =
      (Number.isFinite(opts.relativeYaw)
        ? opts.relativeYaw
        : M.wrap(pose.yaw - base.yaw)) * mix;
    let pitch = pose.pitch * mix;
    if (opts.limit) {
      delta = M.clamp(M.wrap(delta), -opts.limit, opts.limit);
      pitch = M.clamp(pitch, -opts.limit, opts.limit);
    }
    const turned = { yaw: base.yaw + delta, pitch };
    const plane =
      mode === "shared" && opts.strength !== 0
        ? P.localPlaneAffine(seat, turned, {
            ...camera,
            focal: opts.focal,
            worldDiameter: (size * q.range) / opts.focal,
          })
        : P.billboard2D(seat, {
            ...camera,
            focal: opts.focal,
            diameterPx: size,
          });
    const lift = arcOffset(seat, opts.focal);
    q.y += lift;
    plane.matrix[5] += lift;
    return {
      ...q,
      size,
      depth: q.range,
      behind: !q.valid,
      clipPath: "",
      reverse: plane.reverse || false,
      css2d: plane.matrix,
    };
  }
  function render() {
    if (!width || !height) return;
    const focal =
        projection === "stable"
          ? stableFocal()
          : projection === "panorama"
          ? P.focalFromHorizontalFov(width, M.rad(settings.fov))
          : Math.min(width, height) / (2 * Math.tan(M.rad(settings.fov) / 2)),
      diameter =
        ((projection === "stable" ? 0.42 : 0.78) *
          Math.min(1, (7 / count) ** 0.42) *
          settings.face) /
        100,
      now = performance.now();
    const centers = world.slice(projection === "stable" ? 0 : 1).map((seat) => {
      if (projection === "stable")
        return {
          ...M.stablePoint(seat, pan, focal, settings.spacing / 100),
          visible: true,
        };
      if (projection === "panorama") {
        const q = P.project(seat, { ...camera, focal });
        return { ...q, y: q.y + arcOffset(seat, focal), visible: true };
      }
      const c = M.view(seat, camera);
      return {
        x: (focal * c.x) / Math.max(0.025, c.d),
        y: (focal * c.y) / Math.max(0.025, c.d),
        visible: c.d > 0.025,
      };
    });
    const requested =
      (focal * diameter) /
      (projection === "stable" ? 1 : (2 * settings.spacing) / 100);
    fitInfo = autoFit
      ? M.fitDiameter(centers, requested, settings.clearance / 100)
      : { diameter: requested, separation: null, limited: false };
    const fitText = autoFit
      ? "Auto size · " +
        Math.round(fitInfo.diameter) +
        "px" +
        (fitInfo.limited ? " · fitted between seats" : "") +
        " · seats unchanged"
      : "Overlap allowed · manual size";
    if ($("#fit-status").textContent !== fitText)
      $("#fit-status").textContent = fitText;
    if (autoFit && projection !== "stable")
      $("#compensation-note").textContent =
        "Automatic fitting equalizes circle sizes. Turn Prevent circle overlap off to compare natural distance scaling.";
    const availableCount = remote
      .slice(1)
      .filter(
        (r) => r.availability === "live" && now - r.received < 2000
      ).length;
    for (const p of people) {
      const r = remote[p.id],
        stale = r.availability === "stopped" && now - r.received > 2000,
        offline = r.availability === "offline",
        pending = r.availability === "live" && !Number.isFinite(r.received),
        unavailable = stale || offline || pending,
        pose = unavailable
          ? neutral(p.id)
          : { yaw: r.yaw, pitch: r.currentPitch || 0 };
      const baseYaw =
        projection === "stable" || projection === "panorama"
          ? M.toward(world[p.id], world[0]).yaw
          : M.wrap(camera.yaw + Math.PI);
      const delta = M.wrap(pose.yaw - baseYaw);
      r.visualDelta =
        mode === "billboard" || !Number.isFinite(r.visualDelta)
          ? delta
          : r.visualDelta + M.wrap(delta - r.visualDelta);
      const opts = {
        focal,
        diameter,
        mode,
        strength: settings.turn / 100,
        relativeYaw: r.visualDelta,
        limit: M.rad(Number($("#limit").value)),
        radius: settings.spacing / 100,
        compensation: settings.compensation / 100,
        referenceDepth: (2 * settings.spacing) / 100,
        maxApparentDiameter: autoFit ? fitInfo.diameter : Infinity,
      };
      const q =
        projection === "stable"
          ? M.stableSurface(world[p.id], pose, pan, {
              ...opts,
              diameter: autoFit
                ? Math.min(diameter, fitInfo.diameter / focal)
                : diameter,
            })
          : projection === "panorama"
          ? angularSurface(world[p.id], pose, opts)
          : M.surface(world[p.id], pose, camera, opts);
      p.projection = { x: q.x, y: q.y, size: q.size };
      p.li.hidden = q.behind;
      p.li.style.zIndex = Math.round(10000 - q.depth * 1000);
      const flat = mode === "billboard" || settings.turn === 0;
      p.surface.toggleAttribute("data-flat", flat);
      p.surface.style.transform = q.css2d
        ? "matrix(" + q.css2d.join(",") + ")"
        : flat
        ? "matrix(" +
          [
            q.size / 100,
            0,
            0,
            q.size / 100,
            q.x - q.size / 2,
            q.y - q.size / 2,
          ].join(",") +
          ")"
        : "matrix3d(" + q.matrix.join(",") + ")";
      p.surface.style.clipPath = flat ? "" : q.clipPath;
      p.surface.toggleAttribute("data-reverse", q.reverse);
      p.surface.toggleAttribute("data-speaker", p.id === speaker);
      p.surface.dataset.state = unavailable
        ? offline
          ? "offline"
          : pending
          ? "pending"
          : "stale"
        : "live";
      p.name.style.left = q.x + "px";
      p.name.style.top = q.y + q.size / 2 + 7 + "px";
      p.small.textContent = unavailable
        ? offline
          ? "direction offline"
          : pending
          ? "waiting for direction"
          : "direction stale"
        : q.reverse
        ? "turned away"
        : "";
      p.li.setAttribute(
        "aria-label",
        F[p.id].name +
          (unavailable
            ? " · direction unavailable"
            : q.reverse
            ? " · turned away"
            : "")
      );
    }
    guideAnchors =
      projection === "panorama"
        ? people.map((p) => ({
            id: p.id,
            x: p.projection.x,
            y: p.projection.y + fitInfo.diameter / 2 + 28,
          }))
        : [];
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    let connected = false,
      lastGroundX = 0;
    const R = settings.spacing / 100;
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * Math.PI * 2,
        point = {
          x: R * Math.sin(a),
          y: projection === "stable" ? 0 : -0.55,
          z: R * (1 - Math.cos(a)),
        };
      let q;
      if (projection === "stable") q = M.stablePoint(point, pan, focal, R);
      else if (projection === "panorama") {
        const v = P.project({ ...point, y: 0 }, { ...camera, focal });
        if (!v.valid) {
          connected = false;
          continue;
        }
        if (connected && Math.abs(v.x - lastGroundX) > Math.PI * focal) {
          connected = false;
        }
        v.y += arcOffset(point, focal) + fitInfo.diameter / 2 + 28;
        q = v;
        lastGroundX = v.x;
      } else {
        const v = M.view(point, camera);
        if (v.d < 0.05) {
          connected = false;
          continue;
        }
        q = { x: (focal * v.x) / v.d, y: (focal * v.y) / v.d };
      }
      const x = width / 2 + q.x,
        y = height * 0.48 + q.y;
      if (connected) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        connected = true;
      }
    }
    if (ownSeat) {
      ownSeat.hidden = projection !== "stable";
      if (projection === "stable") {
        const q = M.stableSurface(
          world[0],
          sharing ? selfPose : { yaw: 0, pitch: 0 },
          pan,
          {
            focal,
            diameter: autoFit
              ? Math.min(diameter, fitInfo.diameter / focal)
              : diameter,
            radius: R,
            mode: sharing ? mode : "billboard",
            strength: settings.turn / 100,
            limit: 0,
            relativeYaw: selfPose.yaw,
          }
        );
        const face = ownSeat.querySelector(".surface");
        face.style.transform = "matrix3d(" + q.matrix.join(",") + ")";
        face.toggleAttribute("data-reverse", q.reverse);
        face.querySelector("img").style.visibility =
          $("#camera").getAttribute("aria-pressed") === "true"
            ? "visible"
            : "hidden";
        const label = ownSeat.querySelector(".name");
        label.style.left = q.x + "px";
        label.style.top = q.y + q.size / 2 + 7 + "px";
        label.querySelector("small").textContent = sharing
          ? "Shared locally"
          : "Direction private";
      }
    }
    ctx.strokeStyle = "#52675750";
    ctx.lineWidth = 1;
    ctx.stroke();
    $("#zoom-value").value = Math.round(settings.fov) + "°";
    $("#zoom-in").disabled = settings.fov <= 30;
    $("#zoom-out").disabled = settings.fov >= 110;
    $("#self-surface").style.transform =
      "rotateY(" +
      M.deg(sharing ? selfPose.yaw : 0) +
      "deg) rotateX(" +
      M.deg(sharing ? selfPose.pitch : 0) +
      "deg)";
    $("#self-surface img").style.visibility =
      $("#camera").getAttribute("aria-pressed") === "true"
        ? "visible"
        : "hidden";
    $("#self-status").textContent = sharing
      ? "Shared locally · " + Math.round(M.deg(selfPose.yaw)) + "°"
      : "Direction private";
    $("#scene-note").textContent =
      mode === "shared"
        ? "Shared turns · " +
          availableCount +
          "/" +
          (count - 1) +
          " live fixture directions"
        : projection === "stable"
        ? "Stable circle · pan keeps spacing fixed"
        : projection === "panorama"
        ? "Panoramic seat · steady spacing"
        : "Perspective seat · depth changes apparent spacing";
  }
  function measure() {
    width = scene.clientWidth;
    height = scene.clientHeight;
    canvas.width = width * (devicePixelRatio || 1);
    canvas.height = height * (devicePixelRatio || 1);
    render();
  }
  function tick(now) {
    const dt = Math.min(0.032, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (!ended) {
      if (playing && now >= nextTurn) {
        const seq = $("#rapid").checked
          ? [1, Math.min(count - 1, 3), 1, Math.min(count - 1, 3), 2]
          : sequence;
        const raw = seq[turnIndex++ % seq.length];
        speakerTo(((raw - 1) % (count - 1)) + 1);
        nextTurn =
          now + ($("#rapid").checked ? 850 : 2400 + (turnIndex % 3) * 450);
      }
      if (
        projection === "stable" &&
        returning &&
        !pointers.size &&
        now >= returnAt
      ) {
        const omega = (7.8 * settings.speed) / 100,
          damping = settings.damping / 100;
        if (reduced.matches) {
          pan = { ...panGoal };
          returning = false;
          panVelocity = { x: 0, y: 0 };
        } else {
          for (const axis of ["x", "y"]) {
            panVelocity[axis] +=
              (-omega * omega * (pan[axis] - panGoal[axis]) -
                2 * damping * omega * panVelocity[axis]) *
              dt;
            pan[axis] += panVelocity[axis] * dt;
          }
          if (
            Math.hypot(pan.x - panGoal.x, pan.y - panGoal.y) < 0.0001 &&
            Math.hypot(panVelocity.x, panVelocity.y) < 0.0005
          ) {
            pan = { ...panGoal };
            returning = false;
            panVelocity = { x: 0, y: 0 };
          }
        }
        syncStableGaze();
      }
      if (
        projection !== "stable" &&
        returning &&
        !pointers.size &&
        now >= returnAt
      ) {
        if (reduced.matches) {
          camera.yaw = returnGoal;
          camera.pitch = returnPitchGoal;
          returning = false;
          velocity = { yaw: 0, pitch: 0 };
        } else {
          const omega = (7.8 * settings.speed) / 100,
            damping = settings.damping / 100,
            error = M.wrap(camera.yaw - returnGoal);
          velocity.yaw +=
            (-omega * omega * error - 2 * damping * omega * velocity.yaw) * dt;
          velocity.pitch +=
            (-omega * omega * (camera.pitch - returnPitchGoal) -
              2 * damping * omega * velocity.pitch) *
            dt;
          camera.yaw = M.wrap(camera.yaw + velocity.yaw * dt);
          camera.pitch = M.clamp(camera.pitch + velocity.pitch * dt, -0.6, 0.6);
          if (
            Math.abs(error) < 0.0001 &&
            Math.abs(velocity.yaw) < 0.0005 &&
            Math.abs(camera.pitch - returnPitchGoal) < 0.0001 &&
            Math.abs(velocity.pitch) < 0.0005
          ) {
            camera.yaw = M.wrap(returnGoal);
            camera.pitch = returnPitchGoal;
            returning = false;
            velocity = { yaw: 0, pitch: 0 };
          }
        }
      }
      if (now - lastHeartbeat > 1000) {
        desiredPoses(now);
        lastHeartbeat = now;
      }
      for (let i = 1; i < count; i++) {
        const r = remote[i];
        if (r.pending && now >= r.pending.at && r.availability === "live") {
          r.goal = r.pending.pose;
          r.received = now;
          r.pending = r.queued
            ? { pose: r.queued, at: now + settings.latency }
            : null;
          r.queued = null;
        }
        if (r.availability === "stopped" && now - r.received > 2000)
          r.goal = null;
        const goal = r.goal;
        if (goal) {
          const t =
            reduced.matches || !settings.smooth
              ? 1
              : 1 - Math.exp((-dt * 1000) / settings.smooth);
          r.yaw = M.mixAngle(r.yaw, goal.yaw, t);
          r.currentPitch =
            (r.currentPitch || 0) + (goal.pitch - (r.currentPitch || 0)) * t;
          r.pitchValue = r.currentPitch;
        }
      }
      // Own observer preview simulates the same delayed direction, never publishes it.
      if (sharing) {
        if (!selfPending)
          selfPending = {
            pose: { yaw: camera.yaw, pitch: camera.pitch },
            at: now + settings.latency,
          };
        if (now >= selfPending.at) {
          selfPose = selfPending.pose;
          selfReceived = now;
          selfPending = null;
        }
      }
      render();
    }
    frame = requestAnimationFrame(tick);
  }
  function gesture() {
    const [a, b] = pointers.values();
    if (!a) return null;
    if (!b) return { x: a.x, y: a.y, span: 0 };
    return { span: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  scene.addEventListener("pointerdown", (e) => {
    if (ended || e.button !== 0 || pointers.size >= 2) return;
    pauseReturn();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastGesture = gesture();
    scene.setPointerCapture(e.pointerId);
    scene.setAttribute("data-dragging", "");
  });
  scene.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture();
    if (g.span && lastGesture.span)
      zoomTo(
        M.deg(
          2 *
            Math.atan(
              (Math.tan(M.rad(settings.fov) / 2) * lastGesture.span) / g.span
            )
        )
      );
    else if (!g.span && !lastGesture.span) {
      if (projection === "stable") {
        const scale = settings.sensitivity / 100 / stableFocal();
        pan.x -= (g.x - lastGesture.x) * scale;
        pan.y -= (g.y - lastGesture.y) * scale;
        syncStableGaze();
      } else {
        const scale =
          projection === "panorama"
            ? settings.sensitivity /
              100 /
              P.focalFromHorizontalFov(width, M.rad(settings.fov))
            : (((0.006 * settings.sensitivity) / 100) * settings.fov) / 72;
        camera.yaw = M.wrap(camera.yaw - (g.x - lastGesture.x) * scale);
        camera.pitch = M.clamp(
          camera.pitch + (g.y - lastGesture.y) * scale,
          -M.rad(25),
          M.rad(25)
        );
      }
      render();
    }
    lastGesture = g;
  });
  function release(e) {
    if (!pointers.delete(e.pointerId)) return;
    lastGesture = gesture();
    if (pointers.size) return;
    scene.removeAttribute("data-dragging");
    beginReturn();
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    scene.addEventListener(type, release);
  scene.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(settings.fov * Math.exp(e.deltaY * 0.005));
    },
    { passive: false }
  );
  scene.addEventListener("keydown", (e) => {
    if (ended) return;
    const turns = {
      ArrowLeft: [-0.15, 0],
      ArrowRight: [0.15, 0],
      ArrowUp: [0, 0.1],
      ArrowDown: [0, -0.1],
    };
    if (turns[e.key]) {
      pauseReturn();
      if (projection === "stable") {
        pan.x += turns[e.key][0];
        pan.y -= turns[e.key][1];
        syncStableGaze();
      } else {
        camera.yaw = M.wrap(camera.yaw + turns[e.key][0]);
        camera.pitch = M.clamp(
          camera.pitch + turns[e.key][1],
          -M.rad(25),
          M.rad(25)
        );
      }
      clearTimeout(keyReturn);
      keyReturn = setTimeout(beginReturn, 450);
    } else if (e.key === "+" || e.key === "=") zoomTo(settings.fov - 5);
    else if (e.key === "-") zoomTo(settings.fov + 5);
    else if (e.key === "0") beginReturn(true);
    else return;
    e.preventDefault();
    render();
  });
  for (const id of Object.keys(defaults))
    $("#" + id).addEventListener("input", (e) => {
      const previous = settings[id];
      settings[id] = Number(e.target.value);
      $('output[for="' + id + '"]').value = fmt[id](settings[id]);
      if (id === "spacing") {
        rebuild();
        desiredPoses(performance.now());
        if (!pointers.size) beginReturn();
      }
      if (id === "pitch") {
        if (projection === "stable") {
          const shift =
            Math.tan(M.rad(settings.pitch)) - Math.tan(M.rad(previous));
          pan.y += shift;
          if (returning) panGoal.y += shift;
        }
        camera.pitch = M.rad(settings.pitch);
        returnPitchGoal = camera.pitch;
        velocity.pitch = 0;
      }
      if (id === "remote-pitch") {
        remote[selected].pitch = settings[id];
        desiredPoses(performance.now());
      }
      if (id === "follow") beginReturn();
      render();
    });
  $("#billboard").onclick = () => setMode("billboard");
  $("#shared").onclick = () => setMode("shared");
  function setMode(v) {
    mode = v;
    $("#billboard").setAttribute("aria-pressed", v === "billboard");
    $("#shared").setAttribute("aria-pressed", v === "shared");
    render();
  }
  $("#sharing").onchange = (e) => {
    if (ended) {
      e.target.checked = false;
      return;
    }
    sharing = e.target.checked;
    selfPending = null;
    selfPose = { yaw: camera.yaw, pitch: camera.pitch };
    $("#sharing-note").textContent = sharing
      ? "On · observer preview receives local simulated direction."
      : "Off · only your local view changes.";
    render();
  };
  $("#pose-person").onchange = (e) => {
    selected = Number(e.target.value);
    syncPerson();
  };
  $("#pose-target").onchange = (e) => {
    const r = remote[selected];
    r.away = e.target.value === "away";
    r.override = r.away ? null : Number(e.target.value);
    desiredPoses(performance.now());
  };
  $("#availability").onchange = (e) => {
    const r = remote[selected];
    r.availability = e.target.value;
    r.pending = null;
    r.queued = null;
    r.goal = null;
    if (r.availability === "live") {
      r.received = -Infinity;
      desiredPoses(performance.now());
    }
    render();
  };
  $("#restore-poses").onclick = () => {
    for (const r of remote) {
      r.override = null;
      r.away = false;
      r.availability = "live";
      r.received = -Infinity;
      r.pending = null;
      r.queued = null;
      r.goal = null;
    }
    desiredPoses(performance.now());
    syncPerson();
  };
  $("#count").onchange = (e) => setCount(Number(e.target.value));
  $("#limit").onchange = render;
  $("#fit-circles").onchange = (e) => {
    autoFit = e.target.checked;
    $("#compensation").disabled = projection === "stable" || autoFit;
    if (!autoFit)
      $("#compensation-note").textContent =
        "0% uses natural distance size;100% equalizes apparent sizes. Seats stay fixed.";
    render();
  };
  $("#projection").onchange = (e) => setProjection(e.target.value);
  $("#zoom-in").onclick = () => zoomTo(settings.fov - 5);
  $("#zoom-out").onclick = () => zoomTo(settings.fov + 5);
  $("#face-speaker").onclick = () => beginReturn(true);
  $("#next").onclick = () => speakerTo((speaker % (count - 1)) + 1);
  $("#play").onclick = () => {
    if (ended) return;
    playing = !playing;
    $("#play").setAttribute("aria-pressed", playing);
    $("#play").textContent = playing
      ? "Ⅱ Pause conversation"
      : "▶ Play conversation";
    nextTurn = performance.now() + 200;
  };
  $("#reset-view").onclick = () => {
    zoomTo(defaults.fov);
    settings.pitch = 0;
    values();
    camera.pitch = 0;
    if (projection === "stable") {
      pauseReturn();
      pan = { x: 0, y: 0 };
      syncStableGaze();
      render();
    } else beginReturn(true);
  };
  $("#adjust").onclick = () => drawer($("#drawer").hidden);
  $("#close-drawer").onclick = () => drawer(false);
  $("#help").onclick = () => drawer(true, true);
  $("#show-hint").onclick = () => {
    $("#hint").classList.remove("dismissed");
    drawer(false);
  };
  $("#dismiss-hint").onclick = () => $("#hint").classList.add("dismissed");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#drawer").hidden) drawer(false);
  });
  $("#request").onclick = (e) => {
    if (ended) return;
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", on);
    e.currentTarget.firstElementChild.textContent = on
      ? "Turn requested"
      : "Request a turn";
  };
  for (const [id, on, off] of [
    ["mic", "Mic on", "Mic off"],
    ["camera", "Camera on", "Camera off"],
  ])
    $("#" + id).onclick = (e) => {
      if (ended) return;
      const state = e.currentTarget.getAttribute("aria-pressed") !== "true";
      e.currentTarget.setAttribute("aria-pressed", state);
      e.currentTarget.textContent = state ? on : off;
      render();
    };
  function reset() {
    settings = { ...defaults };
    playing = false;
    ended = false;
    autoFit = true;
    $("#fit-circles").checked = true;
    sharing = false;
    selfPending = null;
    selfPose = { yaw: 0, pitch: 0 };
    selfReceived = 0;
    lastHeartbeat = 0;
    $("#sharing").checked = false;
    $("#sharing-note").textContent = "Off · only your local view changes.";
    $("#rapid").checked = false;
    $("#limit").value = 0;
    $("#play").setAttribute("aria-pressed", "false");
    $("#play").textContent = "▶ Play conversation";
    $(".room").removeAttribute("data-ended");
    $("#session-status").textContent = "Preview running · no call connected.";
    $("#leave").textContent = "Leave";
    $("#request").setAttribute("aria-pressed", "false");
    $("#request span").textContent = "Request a turn";
    $("#mic").setAttribute("aria-pressed", "false");
    $("#mic").textContent = "Mic off";
    $("#camera").setAttribute("aria-pressed", "true");
    $("#camera").textContent = "Camera on";
    values();
    setCount(7);
    setMode("billboard");
    setProjection("panorama");
    pointers.clear();
    scene.removeAttribute("data-dragging");
    clearTimeout(keyReturn);
  }
  $("#reset-all").onclick = reset;
  $("#leave").onclick = () => {
    if (ended) {
      reset();
      return;
    }
    ended = true;
    playing = false;
    sharing = false;
    $("#sharing").checked = false;
    selfPending = null;
    pauseReturn();
    pointers.clear();
    clearTimeout(keyReturn);
    $(".room").setAttribute("data-ended", "");
    $("#session-status").textContent = "Preview ended. No call was connected.";
    $("#leave").textContent = "Reopen";
    $("#play").setAttribute("aria-pressed", false);
    $("#play").textContent = "▶ Play conversation";
    $("#sharing-note").textContent = "Off · preview ended.";
    for (const r of remote) {
      r.pending = null;
      r.queued = null;
    }
    drawer(true);
    $("#drawer-title").textContent = "Preview ended";
  };
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(frame);
    clearTimeout(keyReturn);
    selfPending = null;
    sharing = false;
    for (const r of remote) {
      r.pending = null;
      r.queued = null;
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pointers.clear();
      lastGesture = null;
      scene.removeAttribute("data-dragging");
      pauseReturn();
      clearTimeout(keyReturn);
      for (const r of remote) {
        r.pending = null;
        r.queued = null;
      }
      playing = false;
      sharing = false;
      $("#sharing").checked = false;
      selfPending = null;
      $("#play").setAttribute("aria-pressed", false);
      $("#play").textContent = "▶ Play conversation";
      $("#sharing-note").textContent =
        "Off · sharing stopped when this page became hidden.";
    } else if (!ended) {
      beginReturn();
      render();
    }
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      lastTime = performance.now();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
      beginReturn();
    }
  });
  options(
    $("#count"),
    Array.from({ length: 16 }, (_, i) => [i + 3, i + 3 + " people"]),
    7
  );
  values();
  const urlParams = new URLSearchParams(location.search),
    requestedCount = Number(urlParams.get("people"));
  setCount(
    Number.isInteger(requestedCount) &&
      requestedCount >= 3 &&
      requestedCount <= 18
      ? requestedCount
      : 7
  );
  setProjection(
    ["panorama", "stable", "perspective"].includes(urlParams.get("projection"))
      ? urlParams.get("projection")
      : "panorama"
  );
  new ResizeObserver(measure).observe(scene);
  frame = requestAnimationFrame(tick);
  window.SeatPreview = Object.freeze({
    setSpeaker: speakerTo,
    setView: (yaw, pitch = 0) => {
      if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
      pauseReturn();
      camera.yaw = M.wrap(yaw);
      camera.pitch = M.clamp(pitch, -M.rad(25), M.rad(25));
      render();
    },
    snapshot: () => ({
      count,
      speaker,
      mode,
      projection,
      pan: { ...pan },
      autoFit,
      guideAnchors: guideAnchors.map((p) => ({ ...p })),
      fitInfo: { ...fitInfo },
      sharing,
      playing,
      ended,
      settings: { ...settings },
      camera: { ...camera },
      returning,
      pointers: pointers.size,
      world: world.map((p) => ({ ...p })),
      scene: { width, height },
      selfPose: { ...selfPose },
      surfaces: people.map((p) => {
        const r = remote[p.id];
        return {
          id: p.id,
          projected: p.projection,
          hidden: p.li.hidden,
          state: p.surface.dataset.state,
          reverse: p.surface.hasAttribute("data-reverse"),
          matrix: p.surface.style.transform,
          pose: { yaw: r.yaw, pitch: r.pitchValue || 0 },
          opacity: getComputedStyle(p.surface.querySelector("img")).opacity,
        };
      }),
    }),
  });
})();
