"use strict";
const $ = (selector) => document.querySelector(selector);
const stage = $("#stage");
const settings = $("#settings");
const controls = Object.fromEntries(
  [
    "count",
    "quality",
    "layout",
    "footage",
    "policy",
    "duration",
    "repeats",
  ].map((id) => [id, $("#" + id)])
);
const query = new URLSearchParams(location.search);
for (const [key, control] of Object.entries(controls)) {
  if ([...control.options].some((option) => option.value === query.get(key)))
    control.value = query.get(key);
}
const build = "http-video-lab-v1.1-2026-11-18";
let manifest = null;
let manifestDigest = null;
let records = [];
let tiles = [];
let trial = null;
let sequence = 0;
let batchRemaining = 0;
let batchTarget = 0;
let nextTrialTimer = null;
let focus = 0;
let yaw = 0;
let pitch = 0.58;
let zoom = 1;
let dirty = true;
let lastRaf = null;
const pointers = new Map();
let gesture = null;

function config() {
  return Object.fromEntries(
    Object.entries(controls).map(([key, control]) => [
      key,
      ["count", "duration", "repeats"].includes(key)
        ? Number(control.value)
        : control.value,
    ])
  );
}
function event(type, detail = {}) {
  if (trial)
    trial.events.push({
      elapsedMs: performance.now() - trial.startedMono,
      phase: trial.phase,
      type,
      ...detail,
    });
}
function fail(type, detail = {}) {
  event(type, detail);
  if (trial)
    trial.errors.push({
      elapsedMs: performance.now() - trial.startedMono,
      type,
      ...detail,
    });
}
function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}
const msText = (value) => (value === null ? "—" : value.toFixed(1) + " ms");
function qualityCounters(video) {
  if (video.getVideoPlaybackQuality) {
    const result = video.getVideoPlaybackQuality();
    return {
      source: "getVideoPlaybackQuality",
      total: result.totalVideoFrames,
      dropped: result.droppedVideoFrames,
    };
  }
  if (typeof video.webkitDecodedFrameCount === "number")
    return {
      source: "webkitDecodedFrameCount",
      total: video.webkitDecodedFrameCount,
      dropped: video.webkitDroppedFrameCount,
    };
  return { source: null, total: null, dropped: null };
}
function streamCounters(record) {
  const raw = qualityCounters(record.video);
  return {
    source: raw.source,
    total: raw.total === null ? null : record.decodedBeforeUnload + raw.total,
    dropped:
      raw.dropped === null ? null : record.droppedBeforeUnload + raw.dropped,
    currentElementTotal: raw.total,
    currentElementDropped: raw.dropped,
  };
}
function viewportSnapshot() {
  const visual = window.visualViewport;
  const rectangle = stage.getBoundingClientRect();
  const viewport = {
    left: visual?.offsetLeft ?? 0,
    top: visual?.offsetTop ?? 0,
    width: visual?.width ?? innerWidth,
    height: visual?.height ?? innerHeight,
    scale: visual?.scale ?? 1,
  };
  return {
    viewport,
    scrollX,
    scrollY,
    stage: {
      left: rectangle.left,
      top: rectangle.top,
      width: rectangle.width,
      height: rectangle.height,
    },
  };
}
function intersection(record, view) {
  const rectangle = record.element.getBoundingClientRect();
  const clipLeft = Math.max(view.stage.left, view.viewport.left);
  const clipTop = Math.max(view.stage.top, view.viewport.top);
  const clipRight = Math.min(
    view.stage.left + view.stage.width,
    view.viewport.left + view.viewport.width
  );
  const clipBottom = Math.min(
    view.stage.top + view.stage.height,
    view.viewport.top + view.viewport.height
  );
  const width = Math.max(
    0,
    Math.min(rectangle.right, clipRight) - Math.max(rectangle.left, clipLeft)
  );
  const height = Math.max(
    0,
    Math.min(rectangle.bottom, clipBottom) - Math.max(rectangle.top, clipTop)
  );
  return {
    bounds: {
      left: rectangle.left,
      top: rectangle.top,
      width: rectangle.width,
      height: rectangle.height,
    },
    viewportIntersectionRatio:
      rectangle.width * rectangle.height > 0
        ? (width * height) / (rectangle.width * rectangle.height)
        : 0,
    visiblyFacingCamera: record.element.style.opacity !== "0",
    method:
      "axis-aligned rectangle clipped by stage and visual viewport; other tile occlusion unmeasured",
  };
}
function environment() {
  const network = navigator.connection;
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    viewportCoverageAtStart: viewportSnapshot(),
    viewport: {
      width: innerWidth,
      height: innerHeight,
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      dpr: devicePixelRatio,
    },
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    visibility: document.visibilityState,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    networkHint: network
      ? {
          effectiveType: network.effectiveType,
          downlinkMbps: network.downlink,
          rttMs: network.rtt,
          saveData: network.saveData,
        }
      : null,
    capabilities: {
      videoFrameCallback:
        "requestVideoFrameCallback" in HTMLVideoElement.prototype,
      playbackQuality: "getVideoPlaybackQuality" in HTMLVideoElement.prototype,
      longTasks:
        PerformanceObserver.supportedEntryTypes?.includes("longtask") ?? false,
    },
    operatorDevice: query.get("device") || null,
    operatorNetwork: query.get("network") || null,
  };
}
function stopTile(record) {
  if (!record.active) return;
  const counters = qualityCounters(record.video);
  record.decodedBeforeUnload += counters.total ?? 0;
  record.droppedBeforeUnload += counters.dropped ?? 0;
  record.resumeTime = record.video.currentTime;
  record.video.pause();
  if (record.callbackId !== null && record.video.cancelVideoFrameCallback)
    record.video.cancelVideoFrameCallback(record.callbackId);
  record.callbackId = null;
  record.active = false;
  record.element.setAttribute("data-suspended", "");
  record.video.removeAttribute("src");
  record.video.load();
}
function clearTiles() {
  for (const record of tiles) {
    record.retired = true;
    stopTile(record);
  }
  tiles = [];
  $("#tiles").replaceChildren();
}
function frameProbe(record) {
  if (!record.video.requestVideoFrameCallback) return;
  record.callbackId = record.video.requestVideoFrameCallback(
    (now, metadata) => {
      if (record.retired || !record.active) return;
      record.callbacks += 1;
      record.lastFrameAt = now;
      if (record.firstFrameMs === null && trial)
        record.firstFrameMs = now - trial.startedMono;
      if (record.previousMediaTime !== null) {
        if (metadata.mediaTime < record.previousMediaTime) record.loops += 1;
        if (metadata.mediaTime !== record.previousMediaTime)
          record.advancingFrames += 1;
      }
      record.previousMediaTime = metadata.mediaTime;
      record.lastMediaTime = metadata.mediaTime;
      record.lastPresentedFrames = metadata.presentedFrames;
      frameProbe(record);
    }
  );
}
function playTile(record) {
  if (record.active || record.retired) return;
  record.active = true;
  record.element.removeAttribute("data-suspended");
  record.video.src = record.url;
  record.video.load();
  frameProbe(record);
  const promise = record.video.play();
  if (promise)
    promise.catch((error) => {
      if (record.retired || !record.active || error.name === "AbortError")
        return;
      record.refusals.push({ name: error.name, message: error.message });
      fail("play-refused", {
        stream: record.id,
        name: error.name,
        message: error.message,
      });
    });
}
function buildTiles() {
  clearTiles();
  const cfg = config();
  for (let index = 0; index < cfg.count; index++) {
    const id = index + 1;
    const element = document.createElement("div");
    element.className = "tile";
    element.setAttribute("aria-label", "Stream " + String(id).padStart(2, "0"));
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = String(id).padStart(2, "0");
    element.append(video, label);
    $("#tiles").append(element);
    const fixture = manifest.files.find(
      (file) =>
        file.kind === cfg.footage &&
        file.preset === cfg.quality &&
        file.stream === id
    );
    const record = {
      id,
      element,
      video,
      url: fixture.url,
      fixture,
      active: false,
      retired: false,
      resumeTime: null,
      callbacks: 0,
      advancingFrames: 0,
      decodedBeforeUnload: 0,
      droppedBeforeUnload: 0,
      lastFrameAt: null,
      lastMediaTime: null,
      previousMediaTime: null,
      loops: 0,
      callbackId: null,
      lastPresentedFrames: null,
      firstFrameMs: null,
      readyMs: null,
      playingMs: null,
      waitingEvents: 0,
      stalledEvents: 0,
      errors: [],
      refusals: [],
      observedGapWindows: 0,
      gapOpen: false,
    };
    video.addEventListener("loadedmetadata", () => {
      const start = record.resumeTime ?? (index * 0.67) % 10;
      try {
        video.currentTime = Math.min(start, Math.max(0, video.duration - 0.2));
      } catch (error) {
        fail("seek-error", { stream: id, message: error.message });
      }
    });
    video.addEventListener("loadeddata", () => {
      if (record.readyMs === null && trial)
        record.readyMs = performance.now() - trial.startedMono;
    });
    video.addEventListener("playing", () => {
      if (record.playingMs === null && trial)
        record.playingMs = performance.now() - trial.startedMono;
      event("playing", { stream: id });
    });
    for (const type of ["waiting", "stalled"])
      video.addEventListener(type, () => {
        if (!record.active || record.retired) return;
        record[type === "waiting" ? "waitingEvents" : "stalledEvents"] += 1;
        event(type, { stream: id, mediaTime: video.currentTime });
      });
    video.addEventListener("error", () => {
      if (!record.active || record.retired) return;
      const error = {
        code: video.error?.code ?? null,
        message: video.error?.message ?? "media error",
      };
      record.errors.push(error);
      fail("media-error", { stream: id, ...error });
    });
    tiles.push(record);
  }
  focus = Math.min(focus, cfg.count - 1);
  updatePolicy();
  dirty = true;
}
function expectedActive(record) {
  if (controls.policy.value === "all") return true;
  // Rank all seats deterministically so the policy always requests exactly six or fewer.
  const ordered = tiles
    .map((other) => ({
      id: other.id,
      distance: Math.min(
        (other.id - 1 - focus + tiles.length) % tiles.length,
        (focus - other.id + 1 + tiles.length) % tiles.length
      ),
    }))
    .sort((a, b) => a.distance - b.distance || a.id - b.id);
  return ordered.slice(0, 6).some((other) => other.id === record.id);
}
function updatePolicy() {
  if (!trial) return;
  const active = [];
  for (const record of tiles) {
    if (expectedActive(record)) {
      playTile(record);
      active.push(record.id);
    } else stopTile(record);
  }
  event("active-set", { streams: active, focus: focus + 1 });
}
function render() {
  dirty = false;
  const cfg = config();
  stage.dataset.layout = cfg.layout;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const radius = Math.min(width * 0.346, height * 0.435);
  const columns = Math.ceil(Math.sqrt((cfg.count * width) / height));
  const rows = Math.ceil(cfg.count / columns);
  const gridSize = Math.min(width / columns - 12, height / rows - 12);
  for (let index = 0; index < tiles.length; index++) {
    const record = tiles[index];
    const angle = (index / tiles.length) * Math.PI * 2;
    let x,
      y,
      size,
      depth = 0,
      visible = true;
    if (cfg.layout === "grid") {
      x = (((index % columns) + 0.5) * width) / columns - width / 2;
      y = ((Math.floor(index / columns) + 0.5) * height) / rows - height / 2;
      size = gridSize;
    } else if (cfg.layout === "orbit") {
      // Same fixed-ring yaw/pitch projection as the supplied mobile-circle-sphere proposal.
      const baseX = Math.sin(angle),
        baseZ = Math.cos(angle);
      const turnedX = baseX * Math.cos(yaw) + baseZ * Math.sin(yaw);
      const turnedZ = -baseX * Math.sin(yaw) + baseZ * Math.cos(yaw);
      const projectedY = -turnedZ * Math.sin(pitch);
      depth = turnedZ * Math.cos(pitch);
      const scale = (radius * zoom) / (1 - 0.24 * depth);
      x = turnedX * scale;
      y = -projectedY * scale;
      size = 0.55 * Math.min(1.2, (7 / tiles.length) ** 0.52) * scale;
    } else {
      // Camera just outside a fixed seat ring. This comparison keeps all N videos as workload.
      const dx = Math.sin(angle),
        dz = 1.14 - Math.cos(angle);
      const viewYaw = -yaw;
      const turnedX = dx * Math.cos(viewYaw) - dz * Math.sin(viewYaw);
      depth = dx * Math.sin(viewYaw) + dz * Math.cos(viewYaw);
      const focal = (width / (2 * Math.tan((72 * Math.PI) / 360))) * zoom;
      visible = depth > 0.035;
      x = (turnedX * focal) / Math.max(0.035, depth);
      y = Math.tan(pitch - 0.58) * focal;
      size =
        (0.57 * Math.min(1.12, (7 / tiles.length) ** 0.63) * focal) /
        Math.max(0.035, depth);
    }
    const element = record.element;
    element.style.setProperty("--x", x + "px");
    element.style.setProperty("--y", y + "px");
    element.style.setProperty("--size", Math.max(1, size) + "px");
    element.style.setProperty(
      "--z",
      String(Math.round(1000 + (cfg.layout === "seat" ? -depth : depth) * 100))
    );
    // Opacity preserves active elements even behind the camera. Log geometric visibility separately.
    element.style.opacity = visible ? "1" : "0";
    record.geometricallyVisible =
      visible &&
      Math.abs(x) < width / 2 + size / 2 &&
      Math.abs(y) < height / 2 + size / 2;
    element.toggleAttribute("data-focused", index === focus);
  }
  $("#focus-label").textContent =
    "Stream " + String(focus + 1).padStart(2, "0");
  $("#zoom-value").value = Math.round(zoom * 100) + "%";
}
function mediaSnapshot(record, now, view = viewportSnapshot()) {
  const video = record.video;
  const counters = streamCounters(record);
  const gap =
    record.active &&
    !video.paused &&
    record.lastFrameAt !== null &&
    now - record.lastFrameAt > 1500;
  if (gap && !record.gapOpen) {
    record.observedGapWindows += 1;
    event("no-video-frame-1500ms", { stream: record.id });
  }
  record.gapOpen = gap;
  return {
    stream: record.id,
    active: record.active,
    geometricallyVisible: record.geometricallyVisible,
    viewportCoverage: intersection(record, view),
    paused: video.paused,
    readyState: video.readyState,
    networkState: video.networkState,
    mediaTime: video.currentTime,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    callbacks: record.video.requestVideoFrameCallback ? record.callbacks : null,
    advancingFrames: record.video.requestVideoFrameCallback
      ? record.advancingFrames
      : null,
    lastFrameAgeMs:
      record.lastFrameAt === null ? null : now - record.lastFrameAt,
    loops: record.loops,
    quality: counters,
    waitingEvents: record.waitingEvents,
    stalledEvents: record.stalledEvents,
    observedGapWindows: record.observedGapWindows,
    errorCount: record.errors.length,
    playRefusals: record.refusals.length,
  };
}
function takeSample() {
  if (!trial) return;
  const now = performance.now();
  const view = viewportSnapshot();
  const streams = tiles.map((record) => mediaSnapshot(record, now, view));
  const sample = {
    elapsedMs: now - trial.startedMono,
    phase: trial.phase,
    viewportCoverage: view,
    streams,
  };
  trial.samples.push(sample);
  const playing = streams.filter(
    (stream) => stream.active && !stream.paused && stream.readyState >= 2
  ).length;
  $("#playing").textContent = playing + " / " + trial.config.count;
  $("#cadence").textContent = msText(percentile(trial.rafIntervalsMs, 0.95));
  $("#latency").textContent = msText(
    percentile(
      trial.inputLatency
        .filter((item) => item.phase === "measurement")
        .map((item) => item.delayMs),
      0.95
    )
  );
  $("#stalls").textContent = streams.reduce(
    (sum, stream) => sum + stream.observedGapWindows + stream.stalledEvents,
    0
  );
  $("#stream-rows").replaceChildren(
    ...streams.map((stream) => {
      const row = document.createElement("tr");
      const state = stream.playRefusals
        ? "refused"
        : stream.errorCount
        ? "error"
        : !stream.active
        ? "unloaded"
        : stream.paused
        ? "paused"
        : stream.readyState < 2
        ? "loading"
        : "playing";
      for (const value of [
        stream.stream,
        state,
        stream.quality.total ?? stream.callbacks ?? "n/a",
        stream.quality.dropped ?? "n/a",
        stream.observedGapWindows,
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    })
  );
  $("#errors").textContent = trial.errors.length
    ? JSON.stringify(trial.errors, null, 2)
    : "No errors recorded.";
}
function setPhase(phase) {
  trial.phase = phase;
  trial.phaseStarted = performance.now();
  event("phase", { value: phase });
  if (phase === "measurement") {
    trial.measurementStartMs = trial.phaseStarted - trial.startedMono;
    trial.frameBaseline = tiles.map((record) => ({
      stream: record.id,
      callbacks: record.callbacks,
      advancingFrames: record.advancingFrames,
      waitingEvents: record.waitingEvents,
      stalledEvents: record.stalledEvents,
      observedGapWindows: record.observedGapWindows,
      ...streamCounters(record),
    }));
    lastRaf = null;
    takeSample();
  }
}
function tickTrial() {
  if (!trial) return;
  const elapsed = performance.now() - trial.phaseStarted;
  if (trial.phase === "loading") {
    const ready = tiles
      .filter((record) => record.active)
      .every(
        (record) =>
          record.video.readyState >= 2 ||
          record.errors.length ||
          record.refusals.length
      );
    if (ready || elapsed > 10000) {
      if (!ready) fail("loading-deadline", { deadlineMs: 10000 });
      setPhase("warmup");
    }
    $("#status").textContent =
      "Loading " +
      tiles.filter((record) => record.active).length +
      " independent video URLs…";
  } else if (trial.phase === "warmup") {
    $("#status").textContent =
      "Warmup · " +
      Math.max(0, Math.ceil((5000 - elapsed) / 1000)) +
      " seconds remaining";
    $("#progress").value = Math.min(15, (elapsed / 5000) * 15);
    if (elapsed >= 5000) setPhase("measurement");
  } else {
    const remaining = Math.max(
      0,
      Math.ceil(trial.config.duration - elapsed / 1000)
    );
    $("#status").textContent =
      "Measuring · " + remaining + " seconds · drag, zoom or change focus";
    $("#progress").value =
      15 + Math.min(85, (elapsed / (trial.config.duration * 1000)) * 85);
    if (elapsed >= trial.config.duration * 1000) finish("complete");
  }
}
function resourcesForCurrentTrial() {
  return performance
    .getEntriesByType("resource")
    .filter(
      (entry) =>
        entry.startTime >= trial.startedMono && entry.name.includes("/media/")
    )
    .map((entry) => ({
      url: new URL(entry.name).pathname.split("/").pop(),
      startMs: entry.startTime - trial.startedMono,
      durationMs: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      responseStatus: entry.responseStatus ?? null,
      deliveryType: entry.deliveryType ?? null,
    }));
}
function playbackCoverage(streamId, samples) {
  const windows = [];
  let previous = null;
  for (const sample of samples) {
    if (sample.phase !== "measurement") continue;
    const current = sample.streams.find((stream) => stream.stream === streamId);
    if (previous) {
      const durationMs = sample.elapsedMs - previous.elapsedMs;
      // A very short final sample cannot establish a missing-frame interval.
      if (durationMs < 500) continue;
      const was = previous.stream;
      const activeThroughoutEndpoints = was.active && current.active;
      const browserDelta =
        current.quality.total === null || was.quality.total === null
          ? null
          : current.quality.total - was.quality.total;
      const droppedDelta =
        current.quality.dropped === null || was.quality.dropped === null
          ? null
          : current.quality.dropped - was.quality.dropped;
      const callbackDelta =
        current.advancingFrames === null || was.advancingFrames === null
          ? null
          : current.advancingFrames - was.advancingFrames;
      const available = browserDelta !== null || callbackDelta !== null;
      const browserProgress =
        browserDelta === null ? null : browserDelta - (droppedDelta ?? 0) > 0;
      const callbackProgress =
        callbackDelta === null ? null : callbackDelta > 0;
      windows.push({
        startMs: previous.elapsedMs,
        endMs: sample.elapsedMs,
        durationMs,
        activeThroughoutEndpoints,
        browserFrameDelta: browserDelta,
        droppedDelta,
        advancingCallbackDelta: callbackDelta,
        geometryVisibleAtEnd: current.geometricallyVisible,
        browserProgress,
        callbackProgress,
        mediaTimeChanged: was.mediaTime !== current.mediaTime,
        observedProgress:
          activeThroughoutEndpoints && available
            ? browserProgress === true || callbackProgress === true
            : null,
      });
    }
    previous = { elapsedMs: sample.elapsedMs, stream: current };
  }
  const expectedWindows = windows.filter(
    (window) => window.activeThroughoutEndpoints
  );
  const noProgressWindows = expectedWindows.filter(
    (window) => window.observedProgress === false
  );
  const longestGap = (property) => {
    let currentGapMs = 0,
      maxMs = 0;
    for (const window of windows) {
      if (window.activeThroughoutEndpoints && window[property] === false)
        currentGapMs += window.durationMs;
      else currentGapMs = 0;
      maxMs = Math.max(maxMs, currentGapMs);
    }
    return maxMs;
  };
  return {
    sampling:
      "nominal one second, final intervals below 500ms excluded; progress inside an interval cannot rule out a shorter freeze",
    windows,
    activeWindows: expectedWindows.length,
    progressWindows: expectedWindows.filter(
      (window) => window.observedProgress === true
    ).length,
    noProgressWindows: noProgressWindows.length,
    unavailableWindows: expectedWindows.filter(
      (window) => window.observedProgress === null
    ).length,
    allActiveWindowsProgressed:
      expectedWindows.length > 0 &&
      expectedWindows.every((window) => window.observedProgress === true),
    maxSampledNoProgressMs: longestGap("observedProgress"),
    maxSampledBrowserFrameGapMs: windows.some(
      (window) => window.browserProgress !== null
    )
      ? longestGap("browserProgress")
      : null,
    maxSampledCallbackGapMs: windows.some(
      (window) => window.callbackProgress !== null
    )
      ? longestGap("callbackProgress")
      : null,
  };
}
function finish(reason) {
  if (!trial) return;
  clearInterval(trial.sampleTimer);
  clearInterval(trial.phaseTimer);
  takeSample();
  event("finished", { reason });
  const now = performance.now();
  trial.finishedISO = new Date().toISOString();
  trial.elapsedMs = now - trial.startedMono;
  trial.measurementDurationMs =
    trial.measurementStartMs === null
      ? 0
      : Math.max(0, trial.elapsedMs - trial.measurementStartMs);
  trial.resources = resourcesForCurrentTrial();
  trial.streamResults = tiles.map((record) => {
    const final = mediaSnapshot(record, now);
    const base = trial.frameBaseline.find(
      (entry) => entry.stream === record.id
    );
    const callbackDelta =
      base && record.video.requestVideoFrameCallback
        ? record.callbacks - base.callbacks
        : null;
    const advancingDelta =
      base && record.video.requestVideoFrameCallback
        ? record.advancingFrames - base.advancingFrames
        : null;
    const browserFrameDelta =
      base && base.total !== null && final.quality.total !== null
        ? final.quality.total - base.total
        : null;
    const droppedDelta =
      base && base.dropped !== null && final.quality.dropped !== null
        ? final.quality.dropped - base.dropped
        : null;
    const everProgressed =
      record.errors.length === 0 &&
      record.refusals.length === 0 &&
      (advancingDelta > 1 || browserFrameDelta > 1);
    const continuity = playbackCoverage(record.id, trial.samples);
    return {
      stream: record.id,
      url: record.url,
      fixtureSha256: record.fixture.sha256,
      firstReadyMs: record.readyMs,
      firstPlayingMs: record.playingMs,
      firstFrameMs: record.firstFrameMs,
      callbackDelta,
      advancingDelta,
      browserFrameDelta,
      droppedDelta,
      measuredStalledEvents: base
        ? record.stalledEvents - base.stalledEvents
        : null,
      measuredGapWindows:
        base && record.video.requestVideoFrameCallback
          ? record.observedGapWindows - base.observedGapWindows
          : null,
      everProgressed,
      continuity,
      final,
      errors: record.errors,
      playRefusals: record.refusals,
    };
  });
  const completed = trial.streamResults.filter(
    (record) => record.everProgressed
  ).length;
  const expectedConcurrent =
    trial.config.policy === "all"
      ? trial.config.count
      : Math.min(6, trial.config.count);
  const measuredSamples = trial.samples.filter(
    (sample) => sample.phase === "measurement"
  );
  const minPlaying = measuredSamples.length
    ? Math.min(
        ...measuredSamples.map(
          (sample) =>
            sample.streams.filter(
              (stream) =>
                stream.active && !stream.paused && stream.readyState >= 2
            ).length
        )
      )
    : 0;
  const sustained = trial.streamResults.filter(
    (record) =>
      record.everProgressed && record.continuity.allActiveWindowsProgressed
  ).length;
  trial.summary = {
    finishReason: reason,
    requestedVideos: trial.config.count,
    expectedConcurrent,
    distinctVideosWithMeasuredProgress: completed,
    streamsWithAdvancingFrameCallbacks: trial.environment.capabilities
      .videoFrameCallback
      ? trial.streamResults.filter((record) => record.advancingDelta > 1).length
      : null,
    streamsWithBrowserFrameProgress: trial.environment.capabilities
      .playbackQuality
      ? trial.streamResults.filter((record) => record.browserFrameDelta > 1)
          .length
      : null,
    streamsWithProgressInEveryActiveSampleWindow: sustained,
    minimumPlayingDuringMeasurement: minPlaying,
    requiredWorkComplete:
      reason === "complete" &&
      (trial.config.policy === "all"
        ? sustained === trial.config.count
        : minPlaying >= expectedConcurrent &&
          trial.streamResults
            .filter((record) => record.continuity.activeWindows > 0)
            .every((record) => record.continuity.allActiveWindowsProgressed)) &&
      trial.errors.length === 0,
    raf: {
      sampleCount: trial.rafIntervalsMs.length,
      p50Ms: percentile(trial.rafIntervalsMs, 0.5),
      p95Ms: percentile(trial.rafIntervalsMs, 0.95),
      maxMs: trial.rafIntervalsMs.length
        ? Math.max(...trial.rafIntervalsMs)
        : null,
    },
    input: {
      sampleCount: trial.inputLatency.filter(
        (item) => item.phase === "measurement"
      ).length,
      p50Ms: percentile(
        trial.inputLatency
          .filter((item) => item.phase === "measurement")
          .map((item) => item.delayMs),
        0.5
      ),
      p95Ms: percentile(
        trial.inputLatency
          .filter((item) => item.phase === "measurement")
          .map((item) => item.delayMs),
        0.95
      ),
    },
    longTasks: {
      supported: trial.environment.capabilities.longTasks,
      count: trial.environment.capabilities.longTasks
        ? trial.longTasks.length
        : null,
      totalDurationMs: trial.environment.capabilities.longTasks
        ? trial.longTasks.reduce((sum, item) => sum + item.durationMs, 0)
        : null,
    },
    http: {
      resourceEntries: trial.resources.length,
      transferBytesReported: trial.resources.reduce(
        (sum, item) => sum + item.transferSize,
        0
      ),
      encodedBodyBytesReported: trial.resources.reduce(
        (sum, item) => sum + item.encodedBodySize,
        0
      ),
      loadingTransferMbps:
        (trial.resources.reduce((sum, item) => sum + item.transferSize, 0) *
          8) /
        (trial.elapsedMs * 1000),
      caveat:
        "Resource timing includes protocol/cache/partial-file effects across setup and measurement. Zero transfer may mean cache or unavailable reporting. Loop playback continues after full file download.",
    },
  };
  const saved = { ...trial };
  delete saved.sampleTimer;
  delete saved.phaseTimer;
  delete saved.phaseStarted;
  records.push(saved);
  for (const record of tiles) {
    record.video.pause();
    if (record.callbackId !== null)
      record.video.cancelVideoFrameCallback?.(record.callbackId);
  }
  trial = null;
  batchRemaining -= 1;
  $("#export").disabled = false;
  $("#run-count").textContent =
    records.length + " saved trial" + (records.length === 1 ? "" : "s");
  $("#result-note").textContent =
    completed +
    " / " +
    saved.config.count +
    " videos ever progressed. " +
    saved.summary.streamsWithProgressInEveryActiveSampleWindow +
    " progressed in every active sample window. " +
    (saved.summary.requiredWorkComplete
      ? "Sampled playback coverage met."
      : "Review incomplete work and errors in the JSON.") +
    " Input samples " +
    saved.inputLatency.length +
    ".";
  $("#status").textContent =
    reason === "complete"
      ? "Trial saved in this page. Download JSON to keep the evidence."
      : "Stopped · " + reason + ". Partial evidence saved.";
  if (reason === "complete") $("#progress").value = 100;
  if (reason === "complete" && batchRemaining > 0) {
    $("#status").textContent =
      "Trial " +
      (batchTarget - batchRemaining) +
      " saved · next repeat starts in 2 seconds";
    nextTrialTimer = setTimeout(() => {
      nextTrialTimer = null;
      startTrial();
    }, 2000);
  } else {
    batchRemaining = 0;
    setRunning(false);
  }
}
function setRunning(running) {
  for (const control of Object.values(controls)) control.disabled = running;
  $("#start").disabled = running || !manifest;
  $("#stop").disabled = !running;
}
function startTrial() {
  if (!manifest || document.hidden) {
    $("#status").textContent = "Keep this page visible to start a trial.";
    batchRemaining = 0;
    setRunning(false);
    return;
  }
  clearTiles();
  stage.scrollIntoView({ block: "start", behavior: "instant" });
  sequence += 1;
  const now = performance.now();
  trial = {
    schema: "circleup.http-video-trial.v1",
    build,
    id: new Date().toISOString().replaceAll(":", "-") + "-" + sequence,
    startedISO: new Date().toISOString(),
    startedMono: now,
    config: config(),
    environment: environment(),
    manifestSha256: manifestDigest,
    phase: "loading",
    phaseStarted: now,
    measurementStartMs: null,
    frameBaseline: [],
    events: [],
    errors: [],
    samples: [],
    rafIntervalsMs: [],
    startupRafIntervals: [],
    inputLatency: [],
    longTasks: [],
    cacheContext: {
      trialOrdinalThisPage: records.length + 1,
      cacheClearedByLab: false,
      note: "Distinct fixture URLs reused across repeats. Browser cache and decoder reuse are permitted and unmeasured.",
    },
  };
  $("#progress").value = 0;
  $("#stage-placeholder").hidden = true;
  setRunning(true);
  event("trial-start");
  buildTiles();
  trial.sampleTimer = setInterval(takeSample, 1000);
  trial.phaseTimer = setInterval(tickTrial, 100);
  takeSample();
}
function inputResponse(type, sourceEvent = null) {
  if (!trial) return;
  const current = trial;
  const phase = trial.phase;
  const handlerStart = performance.now();
  const stamp = sourceEvent?.timeStamp;
  const usesEventTimestamp =
    Number.isFinite(stamp) &&
    stamp >= 0 &&
    stamp <= handlerStart &&
    handlerStart - stamp < 60000;
  const start = usesEventTimestamp ? stamp : handlerStart;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (trial === current)
        current.inputLatency.push({
          phase,
          elapsedMs: start - current.startedMono,
          type,
          timingOrigin: usesEventTimestamp ? "event.timeStamp" : "handlerStart",
          handlerDelayMs: handlerStart - start,
          delayMs: performance.now() - start,
        });
    })
  );
}
function focusNext(sourceEvent) {
  focus = (focus + 1) % Number(controls.count.value);
  yaw = (-focus / Number(controls.count.value)) * Math.PI * 2;
  dirty = true;
  updatePolicy();
  event("focus", { stream: focus + 1 });
  inputResponse("next-focus", sourceEvent);
}
function zoomBy(scale, sourceEvent) {
  zoom = Math.max(0.65, Math.min(2.3, zoom * scale));
  dirty = true;
  inputResponse("zoom", sourceEvent);
}
function gestureState() {
  const [a, b] = pointers.values();
  if (!a) return null;
  return b
    ? {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        span: Math.hypot(a.x - b.x, a.y - b.y),
      }
    : { x: a.x, y: a.y, span: 0 };
}
stage.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || pointers.size >= 2) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  gesture = gestureState();
  stage.setPointerCapture(e.pointerId);
  inputResponse("pointerdown", e);
});
stage.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const next = gestureState();
  if (next.span && gesture.span) zoomBy(next.span / gesture.span, e);
  else if (!next.span && !gesture.span) {
    yaw += ((next.x - gesture.x) * 0.008) / zoom;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + (next.y - gesture.y) * 0.006));
  }
  gesture = next;
  dirty = true;
  inputResponse("drag", e);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  stage.addEventListener(type, (e) => {
    pointers.delete(e.pointerId);
    gesture = gestureState();
  });
stage.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") yaw -= 0.15;
  else if (e.key === "ArrowRight") yaw += 0.15;
  else if (e.key === "ArrowUp") pitch -= 0.1;
  else if (e.key === "ArrowDown") pitch += 0.1;
  else return;
  e.preventDefault();
  dirty = true;
  inputResponse("keyboard", e);
});
$("#next").onclick = focusNext;
$("#zoom-in").onclick = (e) => zoomBy(1.15, e);
$("#zoom-out").onclick = (e) => zoomBy(1 / 1.15, e);
$("#start").onclick = () => {
  batchTarget = Number(controls.repeats.value);
  batchRemaining = batchTarget;
  startTrial();
};
$("#stop").onclick = () => {
  if (nextTrialTimer) {
    clearTimeout(nextTrialTimer);
    nextTrialTimer = null;
    batchRemaining = 0;
    setRunning(false);
    $("#status").textContent =
      "Repeat sequence stopped. Completed trials remain available.";
  } else finish("operator-stop");
};
settings.onchange = () => {
  focus = 0;
  yaw = 0;
  pitch = 0.58;
  zoom = 1;
  clearTiles();
  dirty = true;
  $("#stage-placeholder").hidden = false;
};
settings.onsubmit = (e) => e.preventDefault();
$("#export").onclick = () => {
  const bundle = {
    schema: "circleup.http-video-bundle.v1",
    build,
    exportedISO: new Date().toISOString(),
    trials: records,
    interpretation:
      "HTTP prerecorded decode/compositing workload, muted audio. Twelve-second clips can fully buffer during warmup and loop from cache during measurement; loading resource observations are separate. This device and current browser only. Separate warmup, measured work and errors. physicalDevice requires operator confirmation.",
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    "circleup-video-trials-" +
    new Date().toISOString().slice(0, 19).replaceAll(":", "-") +
    ".json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
window.addEventListener("error", (e) =>
  fail("javascript-error", { message: e.message })
);
window.addEventListener("unhandledrejection", (e) =>
  fail("unhandled-promise", { message: String(e.reason) })
);
document.addEventListener("visibilitychange", () => {
  event("visibility", { state: document.visibilityState });
  if (document.hidden) {
    if (nextTrialTimer) {
      clearTimeout(nextTrialTimer);
      nextTrialTimer = null;
      batchRemaining = 0;
      setRunning(false);
    }
    if (trial) finish("page-hidden");
  }
});
window.addEventListener("scroll", () => event("scroll", viewportSnapshot()), {
  passive: true,
});
window.addEventListener("pagehide", () => {
  if (trial) finish("page-left");
});
new ResizeObserver(() => {
  dirty = true;
  event("resize", {
    width: stage.clientWidth,
    height: stage.clientHeight,
    dpr: devicePixelRatio,
  });
}).observe(stage);
if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
  const observer = new PerformanceObserver((list) => {
    if (!trial || trial.phase !== "measurement") return;
    for (const item of list.getEntries())
      if (item.startTime >= trial.startedMono + trial.measurementStartMs)
        trial.longTasks.push({
          elapsedMs: item.startTime - trial.startedMono,
          durationMs: item.duration,
        });
  });
  observer.observe({ entryTypes: ["longtask"] });
}
function animation(now) {
  if (dirty) render();
  if (trial) {
    if (lastRaf !== null) {
      if (trial.phase === "measurement")
        trial.rafIntervalsMs.push(now - lastRaf);
      else
        trial.startupRafIntervals.push({
          phase: trial.phase,
          elapsedMs: now - trial.startedMono,
          intervalMs: now - lastRaf,
        });
    }
    lastRaf = now;
  } else lastRaf = null;
  requestAnimationFrame(animation);
}
requestAnimationFrame(animation);
$("#start").disabled = true;
fetch("media-manifest.json")
  .then((response) => {
    if (!response.ok)
      throw new Error("Fixture manifest HTTP " + response.status);
    return response.text();
  })
  .then(async (source) => {
    manifest = JSON.parse(source);
    if (crypto.subtle) {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(source)
      );
      manifestDigest = [...new Uint8Array(bytes)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    }
    $("#start").disabled = false;
  })
  .catch((error) => {
    $("#status").textContent = "Cannot load fixtures · " + error.message;
    $("#errors").textContent = error.stack;
  });
// Read-only test seam for local validation and raw evidence collection.
window.CircleUpVideoLab = Object.freeze({
  snapshot: () => ({
    build,
    phase: trial?.phase ?? null,
    config: config(),
    records,
    current: trial
      ? { id: trial.id, samples: trial.samples, errors: trial.errors }
      : null,
    videos: tiles.map((record) => ({
      id: record.id,
      src: record.video.currentSrc,
      time: record.video.currentTime,
      paused: record.video.paused,
      readyState: record.video.readyState,
      callbacks: record.callbacks,
    })),
  }),
});
