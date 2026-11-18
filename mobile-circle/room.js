const camera = document.querySelector('.camera');
const ring = camera.querySelector('.ring');
const rim = camera.querySelector('.rim');
const context = rim.getContext('2d');
const groupSize = document.querySelector('#group-size');
const seatTemplate = document.querySelector('#seat-template');
const seatingLayout = document.querySelector('#seating-layout');
const names = [
  'Maya', 'Sam', 'Ana', 'Noor', 'You', 'Alex', 'Jordan', 'Elise', 'Ben',
  'Priya', 'Omar', 'Tessa', 'Luis', 'Nia', 'June', 'Ramon', 'Leila', 'Kit'
];
const holderText = document.querySelector('#holder-text');
const passStick = document.querySelector('#pass-stick');
const request = document.querySelector('.turn-button');
const turnLabel = request.querySelector('.face');
const zoomIn = document.querySelector('#zoom-in');
const zoomOut = document.querySelector('#zoom-out');
const zoomLevel = document.querySelector('#zoom-level');
const resetView = document.querySelector('#reset-view');
const faceSize = document.querySelector('#face-size');
const circleSpacing = document.querySelector('#circle-spacing');
const previewWidth = document.querySelector('#preview-width');
const ovality = document.querySelector('#ovality');
const ovalityValue = document.querySelector('#ovality-value');
const shapeMode = document.querySelector('#shape-mode');
const restMode = document.querySelector('#rest-mode');
const restAngle = document.querySelector('#rest-angle');
const restAngleValue = document.querySelector('#rest-angle-value');
const previewShell = document.querySelector('.preview-shell');
const faceSizeValue = document.querySelector('#face-size-value');
const circleSpacingValue = document.querySelector('#circle-spacing-value');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const minZoom = .72;
const baseMaxZoom = 2.15;
const pointers = new Map();
const radians = Math.PI / 180;

const closePitch = 7 * radians;
const framePadding = { x: 7, y: 12 };
let seats = [];
let seatPoints = [];
let guidePaths;
let baseDiameter = .52;
let worldDiameter = .52;
let spacing = 1;
let horizontalStretch = 1;
let verticalStretch = 1;
let chosenRestAngle = null;
let maxZoom = baseMaxZoom;
let holder = 0;
let orientation = { pitch: 0, yaw: 0 };
let zoom = 1;
let focusPitch = 38 * radians;
let stage = { width: 0, height: 0, radius: 0, pixelRatio: 1 };
let previous;
let momentum;
let animation;
let keyTimer;

// Adapted from Uni's glyph-sphere.tsx ringPoints: equal, fixed positions on a
// unit great circle. A different starting axis keeps the speaker in front.
function ringPoints(count, radius = 1, offset = 0) {
  return Array.from({ length: count }, (_, i) => {
    const u = (i / count) * Math.PI * 2 + offset;
    return [radius * Math.sin(u), 0, radius * Math.cos(u)];
  });
}

const outerGuide = ringPoints(96);
const innerGuide = ringPoints(64, .5);

function speakerView() {
  const [x, , z] = seatPoints[holder];
  return { pitch: 0, yaw: -Math.atan2(x, z) };
}

function shortestArc(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// The same yaw-then-pitch projection as Uni. The final X-axis rotation
// keeps the ring level on screen even through a full vertical flip.
function project([bx, by, bz], angles) {
  bx *= spacing;
  by *= spacing;
  bz *= spacing;
  const x = bx * angles.cosYaw + bz * angles.sinYaw;
  const turnedZ = -bx * angles.sinYaw + bz * angles.cosYaw;
  const y = by * angles.cosPitch - turnedZ * angles.sinPitch;
  const z = by * angles.sinPitch + turnedZ * angles.cosPitch;
  const perspective = 1 / (1 - .24 * z);
  const pixelScale = stage.radius * zoom * perspective;
  return {
    x: x * pixelScale * horizontalStretch,
    y: -y * pixelScale * verticalStretch,
    diameter: worldDiameter * pixelScale,
    depth: z
  };
}

function rotationAngles() {
  const pitch = focusPitch + orientation.pitch;
  return {
    cosYaw: Math.cos(orientation.yaw), sinYaw: Math.sin(orientation.yaw),
    cosPitch: Math.cos(pitch), sinPitch: Math.sin(pitch)
  };
}

function updateOvality() {
  // Adapt only at layout/zoom changes, never while orbiting. Photos stay round.
  const amount = Number(ovality.value) / 100;
  const adaptive = shapeMode.value === 'adaptive';
  const tall = shapeMode.value === 'tall' || (adaptive && stage.height >= stage.width);
  const aspect = tall ? stage.height / stage.width : stage.width / stage.height;
  const density = Math.min(1, .75 + seats.length / 72);
  const closeness = Math.max(0, Math.min(1, (zoom - 1) / (maxZoom - 1)));
  const strength = shapeMode.value === 'round' ? 0 : amount * (adaptive ? density * (1 - .4 * closeness) : 1);
  const extension = Math.max(1.4, Math.min(1.85, Math.sqrt(Math.max(1, aspect)) * 1.15));
  horizontalStretch = tall ? 1 - .16 * strength : 1 + (extension - 1) * strength;
  verticalStretch = tall ? 1 + (extension - 1) * strength : 1 - .16 * strength;
  ovalityValue.value = ovality.value + '%';
}

function updateFocusPitch() {
  if (restMode.value === 'fixed') {
    focusPitch = Number(restAngle.value) * radians;
    return;
  }
  const density = Math.max(0, seats.length - 7);
  const normal = (38 + density * 2.2) * radians;
  // Apply user tuning after automatic framing so it remains effective at full zoom.
  const tuning = (Number(restAngle.value) * radians) - normal;
  const overview = (66 + density * .85) * radians;
  const out = (1 - zoom) / (1 - minZoom);
  const inside = (zoom - 1) / (maxZoom - 1);
  const desired = zoom <= 1
    ? normal + (overview - normal) * out
    : normal + (Math.min(closePitch, normal) - normal) * inside;
  const [speakerX, , speakerZ] = seatPoints[holder];
  const focusRadius = zoom <= 1 ? 1 : Math.hypot(speakerX, speakerZ);
  const bottomAt = pitch => {
    const pose = project([0, 0, focusRadius], {
      cosYaw: 1, sinYaw: 0, cosPitch: Math.cos(pitch), sinPitch: Math.sin(pitch)
    });
    return pose.y + pose.diameter / 2;
  };
  const padding = 9 + (framePadding.y - 9) * Math.min(1, Math.max(0, (zoom - 1) * 4));
  const limit = stage.height / 2 - padding;
  let low = 0;
  let high = desired;
  if (bottomAt(high) <= limit) {
    focusPitch = high + tuning;
    return;
  }
  // Find the steepest safe angle before applying any manual orbit offset.
  for (let iteration = 0; iteration < 15; iteration++) {
    const middle = (low + high) / 2;
    if (bottomAt(middle) <= limit) low = middle;
    else high = middle;
  }
  focusPitch = low + tuning;
}

function render() {
  const { width, height, pixelRatio } = stage;
  document.querySelector('#effective-angle').value = Math.round(focusPitch / radians) + '°';
  document.querySelector('#rest-angle-label').textContent = restMode.value === 'adaptive' ? 'Base rest angle' : 'Rest angle';
  const angles = rotationAngles();
  const projections = seatPoints.map(point => project(point, angles));
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  for (const [index, guide] of guidePaths.entries()) {
    context.beginPath();
    guide.forEach((point, step) => {
      const { x, y } = project(point, angles);
      if (step === 0) context.moveTo(centerX + x, centerY + y);
      else context.lineTo(centerX + x, centerY + y);
    });
    context.closePath();
    if (index === 0) {
      context.fillStyle = '#e7debf3b';
      context.fill();
    }
    context.strokeStyle = '#3d594a61';
    context.lineWidth = 1;
    context.stroke();
  }

  seats.forEach((seat, index) => {
    const { x, y, diameter, depth } = projections[index];
    seat.style.setProperty('--x', x + 'px');
    seat.style.setProperty('--y', y + 'px');
    seat.style.setProperty('--size', diameter + 'px');
    seat.style.setProperty('--depth', String(1001 + Math.round(depth * 1000)));
  });
}

function measure() {
  const width = camera.clientWidth;
  const height = camera.clientHeight;
  const pixelRatio = devicePixelRatio;
  stage = { width, height, radius: Math.min(width * .346, height * .435), pixelRatio };
  rim.width = Math.round(width * pixelRatio);
  rim.height = Math.round(height * pixelRatio);
  if (!seats.length) return;
  updateOvality();
  updateFocusPitch();
  render();
}

function zoomTo(next) {
  zoom = Math.min(maxZoom, Math.max(minZoom, next));
  zoomLevel.textContent = Math.round(zoom * 100) + '%';
  zoomOut.disabled = zoom === minZoom;
  zoomIn.disabled = zoom === maxZoom;
  updateOvality();
  updateFocusPitch();
  render();
  const target = speakerView();
  if (!pointers.size && animation === undefined && (Math.abs(orientation.pitch) > .001 ||
      Math.abs(shortestArc(orientation.yaw - target.yaw)) > .001)) {
    returnToSpeaker();
  }
}

function stop() {
  cancelAnimationFrame(animation);
  animation = undefined;
  clearTimeout(keyTimer);
}

function returnToSpeaker(withGlide = false) {
  stop();
  const target = speakerView();
  if (reducedMotion.matches) {
    orientation = target;
    render();
    return;
  }

  const start = performance.now();
  const from = orientation;
  const pitchArc = shortestArc(target.pitch - from.pitch);
  const yawArc = shortestArc(target.yaw - from.yaw);
  const release = withGlide && momentum && start - momentum.at < 115 ? momentum : null;

  function tick(now) {
    const time = Math.max(0, (now - start) / 1000);
    if (time >= 1.15) {
      animation = undefined;
      orientation = target;
      render();
      return;
    }

    // Underdamped return, plus a short velocity-matched glide that decays.
    const falloff = 6.4;
    const frequency = 10;
    const spring = 1 - Math.exp(-falloff * time) *
      (Math.cos(frequency * time) + falloff / frequency * Math.sin(frequency * time));
    const glide = release ? time * Math.exp(-time / .12) : 0;
    orientation = {
      pitch: from.pitch + pitchArc * spring + (release?.pitch ?? 0) * glide,
      yaw: from.yaw + yawArc * spring + (release?.yaw ?? 0) * glide
    };
    render();
    animation = requestAnimationFrame(tick);
  }

  animation = requestAnimationFrame(tick);
}

function gesture() {
  const [first, second] = pointers.values();
  if (!first) return null;
  if (!second) return { ...first, span: 0 };
  return { span: Math.hypot(second.x - first.x, second.y - first.y) };
}

function turn(yaw, pitch) {
  orientation = {
    yaw: shortestArc(orientation.yaw + yaw),
    pitch: shortestArc(orientation.pitch + pitch)
  };
  render();
}

function drag(yaw, pitch, now) {
  turn(yaw, pitch);
  const interval = Math.max(.012, (now - (momentum?.at ?? now - 16)) / 1000);
  const cap = value => Math.max(-9, Math.min(9, value / interval));
  momentum = { at: now, yaw: cap(yaw), pitch: cap(pitch) };
}

camera.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pointers.size >= 2) return;
  stop();
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  previous = gesture();
  momentum = null;
  camera.setPointerCapture(event.pointerId);
  camera.setAttribute('data-dragging', '');
});

camera.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const next = gesture();
  if (next.span > 1 && previous.span > 1) {
    zoomTo(zoom * next.span / previous.span);
  } else if (!next.span && !previous.span && next.x !== undefined && previous.x !== undefined) {
    if (animation !== undefined) stop();
    drag((next.x - previous.x) * .012, (next.y - previous.y) * .014, performance.now());
  }
  previous = next;
});

function release(event) {
  if (!pointers.delete(event.pointerId)) return;
  previous = gesture();
  if (pointers.size) {
    momentum = null;
    return;
  }
  camera.removeAttribute('data-dragging');
  returnToSpeaker(event.type === 'pointerup');
}

camera.addEventListener('pointerup', release);
camera.addEventListener('pointercancel', release);
camera.addEventListener('lostpointercapture', release);

camera.addEventListener('wheel', event => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  zoomTo(zoom * Math.exp(-event.deltaY * .015));
}, { passive: false });

const keyTurns = new Map([
  ['arrowleft', [-.22, 0]], ['arrowright', [.22, 0]],
  ['arrowup', [0, -.22]], ['arrowdown', [0, .22]]
]);

function reset() {
  zoomTo(1);
  returnToSpeaker();
}

camera.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (key === '+' || key === '=') zoomTo(zoom * 1.25);
  else if (key === '-') zoomTo(zoom / 1.25);
  else if (key === '0') reset();
  else if (keyTurns.has(key)) {
    stop();
    turn(...keyTurns.get(key));
    keyTimer = setTimeout(returnToSpeaker, 480);
  } else return;
  event.preventDefault();
});

zoomOut.addEventListener('click', () => zoomTo(zoom / 1.25));
zoomIn.addEventListener('click', () => zoomTo(zoom * 1.25));
resetView.addEventListener('click', reset);

function markSpeaker() {
  seats.forEach((seat, index) => seat.toggleAttribute('data-speaker', index === holder));
  holderText.textContent = names[holder] + ' has the stick';
  passStick.textContent = 'Demo · Pass the stick to ' + names[(holder + 1) % seats.length];
}

passStick.addEventListener('click', () => {
  holder = (holder + 1) % seats.length;
  updateFocusPitch();
  markSpeaker();
  render();
  if (!pointers.size) returnToSpeaker();
});

request.addEventListener('click', () => {
  const pressed = request.getAttribute('aria-pressed') !== 'true';
  request.setAttribute('aria-pressed', String(pressed));
  turnLabel.textContent = pressed ? 'Turn requested' : 'Request a turn';
});

function setGroupSize(count) {
  stop();
  groupSize.value = count;
  seats = names.slice(0, count).map(name => {
    const seat = seatTemplate.content.firstElementChild.cloneNode(true);
    seat.querySelector('img').src = 'portraits/' + name.toLowerCase() + '.webp';
    seat.querySelector('.name').textContent = name;
    seat.setAttribute('aria-label', name);
    return seat;
  });
  ring.replaceChildren(...seats);
  ring.toggleAttribute('data-dense', count >= 11);
  seatingLayout.closest('label').hidden = count !== 18;
  const twoRings = count === 18 && seatingLayout.value === 'double';
  seatPoints = twoRings ? [...ringPoints(6, .5), ...ringPoints(12, 1, Math.PI / 12)] : ringPoints(count);
  guidePaths = twoRings ? [outerGuide, innerGuide] : [outerGuide];
  baseDiameter = count <= 7 ? .52 + .045 * (7 - count) : .52 * (7 / count) ** .77;
  if (twoRings) baseDiameter = .33;
  worldDiameter = baseDiameter * Number(faceSize.value) / 100;
  maxZoom = Math.max(baseMaxZoom, baseMaxZoom * .52 / worldDiameter);
  if (holder >= count) holder = 0;
  orientation = speakerView();
  if (chosenRestAngle === null) {
    restAngle.value = String(Math.round(38 + Math.max(0, count - 7) * 2.2));
  }
  restAngleValue.value = restAngle.value + '°';
  updateOvality();
  markSpeaker();
  document.querySelector('.classic-link').href = '../mobile-circle-classic/?people=' + count + (twoRings ? '&layout=double' : '');
  document.querySelector('.inside-link').href = '../inside-circle/?people=' + count;
  zoomTo(zoom);
}

function updateLayout() {
  spacing = Number(circleSpacing.value) / 100;
  worldDiameter = baseDiameter * Number(faceSize.value) / 100;
  maxZoom = Math.max(baseMaxZoom, baseMaxZoom * .52 / worldDiameter);
  faceSizeValue.value = faceSize.value + '%';
  circleSpacingValue.value = circleSpacing.value + '%';
  updateOvality();
  zoomTo(zoom);
}

faceSize.addEventListener('input', updateLayout);
circleSpacing.addEventListener('input', updateLayout);
ovality.addEventListener('input', updateLayout);
shapeMode.addEventListener('change', updateLayout);
restMode.addEventListener('change', () => {
  updateFocusPitch();
  render();
  if (!pointers.size) returnToSpeaker();
});
restAngle.addEventListener('input', () => {
  chosenRestAngle = Number(restAngle.value);
  restAngleValue.value = restAngle.value + '°';
  updateFocusPitch();
  render();
  if (!pointers.size) returnToSpeaker();
});
previewWidth.addEventListener('change', () => {
  previewShell.toggleAttribute('data-phone', previewWidth.value !== 'auto');
  previewShell.style.setProperty('--preview-width', previewWidth.value === 'auto' ? '100%' : previewWidth.value + 'px');
});
document.querySelector('#reset-layout').addEventListener('click', () => {
  faceSize.value = '110';
  circleSpacing.value = '100';
  ovality.value = '100';
  shapeMode.value = 'adaptive';
  restMode.value = 'adaptive';
  chosenRestAngle = null;
  restAngle.value = String(Math.round(38 + Math.max(0, seats.length - 7) * 2.2));
  restAngleValue.value = restAngle.value + '°';
  previewWidth.value = 'auto';
  previewShell.style.removeProperty('--preview-width');
  previewShell.removeAttribute('data-phone');
  updateLayout();
});

groupSize.addEventListener('change', () => setGroupSize(Number(groupSize.value)));
seatingLayout.addEventListener('change', () => setGroupSize(Number(groupSize.value)));
const options = new URLSearchParams(location.search);
if (options.get('layout') === 'double') seatingLayout.value = 'double';
const initialSize = Number(options.get('people'));
measure();
setGroupSize(Number.isInteger(initialSize) && initialSize >= 3 && initialSize <= names.length ? initialSize : 7);
new ResizeObserver(measure).observe(camera);
