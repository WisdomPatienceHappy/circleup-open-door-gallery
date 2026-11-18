const pan = document.querySelector('#pan');
const seats = [...pan.querySelectorAll('.seat')];
const viewLabel = document.querySelector('#view-label');
const status = document.querySelector('#turn-status');
const find = document.querySelector('#back');
const speakerPhoto = find.querySelector('img');
const speakerName = find.querySelector('strong');
const pass = document.querySelector('#pass');
const layouts = [...document.querySelectorAll('[name="layout"]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Each mark stores the offset from center, diameter and vertical position
// as fractions of the viewport width.
const layoutsByDistance = {
  vertical: [
    [0, [0, .56, -.03]],
    [.5, [.24, .44, .006]],
    [1, [.335, .305, .053]],
    [2, [.455, .27, -.145]],
    [3, [.78, .20, -.17]]
  ],
  stack: [
    [0, [0, .56, -.03]],
    [.5, [.24, .44, .006]],
    [1, [.31, .29, .047]],
    [2, [.525, .26, .09]],
    [3, [.82, .20, .10]]
  ],
  open: [
    [0, [0, .56, -.03]],
    [.5, [.27, .49, .005]],
    [1, [.514, .38, .042]],
    [2, [.96, .27, .080]],
    [3, [1.40, .20, .10]]
  ]
};

const requestedLayout = new URLSearchParams(location.search).get('layout');
let layout = Object.hasOwn(layoutsByDistance, requestedLayout) ? requestedLayout : 'vertical';
let position = 1;
let target = 1;
let holder = 'Maya';
let frame;
let gesture;

function wrap(index) {
  return ((index % seats.length) + seats.length) % seats.length;
}

function nearestOffset(index, origin) {
  return wrap(index - origin + seats.length / 2) - seats.length / 2;
}

function render() {
  const width = pan.clientWidth;
  const marks = layoutsByDistance[layout];
  seats.forEach((seat, index) => {
    const offset = nearestOffset(index, position);
    const distance = Math.abs(offset);
    seat.hidden = distance > 3;
    if (seat.hidden) return;

    const end = marks.findIndex(([position], index) => index > 0 && position >= distance);
    const [startDistance, from] = marks[end - 1];
    const [endDistance, to] = marks[end];
    const progress = (distance - startDistance) / (endDistance - startDistance);
    const [x, size, y] = from.map((value, index) => value + (to[index] - value) * progress);
    seat.style.setProperty('--x', (x * width * Math.sign(offset)) + 'px');
    seat.style.setProperty('--y', (y * width) + 'px');
    seat.style.setProperty('--size', (size * width) + 'px');
    seat.style.setProperty('--depth', String(Math.round(1000 * (3 - distance))));
  });
}

function updateLabel() {
  const name = seats[wrap(target)].dataset.name;
  const speaking = name === holder;
  const label = speaking ? name + ' · Has the stick' : name;
  if (viewLabel.textContent !== label) viewLabel.textContent = label;
  find.hidden = speaking;
}

function go(index) {
  cancelAnimationFrame(frame);
  target = index;
  const start = position;
  const startTime = performance.now();
  const duration = reducedMotion.matches ? 0 : 225;

  function tick(now) {
    const fraction = duration ? Math.min(1, (now - startTime) / duration) : 1;
    position = start + (target - start) * (1 - (1 - fraction) ** 3);
    render();
    if (fraction < 1) {
      frame = requestAnimationFrame(tick);
    } else {
      target = position = wrap(index);
      updateLabel();
    }
  }

  if (duration) frame = requestAnimationFrame(tick);
  else tick(startTime);
}

function updateSpeaker() {
  seats.forEach(seat => seat.toggleAttribute('data-speaker', seat.dataset.name === holder));
  status.textContent = holder + ' has the stick';
  speakerName.textContent = holder;
  speakerPhoto.src = seats.find(seat => seat.dataset.name === holder).querySelector('img').getAttribute('src');
  find.setAttribute('aria-label', 'Find speaker: ' + holder);
  pass.textContent = 'Demo · Pass the stick to ' + (holder === 'Maya' ? 'Noor' : 'Maya');
  updateLabel();
}

pan.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || gesture) return;
  const seat = event.target.closest('.seat');
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    index: seats.indexOf(seat),
    axis: null
  };
});
pan.addEventListener('pointermove', event => {
  if (!gesture || event.pointerId !== gesture.id) return;
  const distance = gesture.x - event.clientX;
  if (!gesture.axis) {
    const vertical = Math.abs(gesture.y - event.clientY);
    if (Math.max(Math.abs(distance), vertical) < 8) return;
    gesture.axis = vertical > Math.abs(distance) ? 'vertical' : 'horizontal';
    if (gesture.axis === 'horizontal') {
      cancelAnimationFrame(frame);
      gesture.start = position;
      pan.setPointerCapture(event.pointerId);
      pan.setAttribute('data-dragging', '');
    }
  }
  if (gesture.axis !== 'horizontal') return;
  position = gesture.start + distance / (pan.clientWidth * .50);
  render();
});

function finish(event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  const { start, index, axis } = gesture;
  gesture = null;
  pan.removeAttribute('data-dragging');
  if (axis !== 'horizontal') {
    if (!axis && event.type === 'pointerup' && index >= 0) {
      go(Math.round(position + nearestOffset(index, position)));
    }
    return;
  }
  const distance = position - start;
  if (event.type === 'pointercancel') {
    go(Math.round(position));
  } else if (Math.abs(distance) > .20 && Math.round(position) === Math.round(start)) {
    go(Math.round(start) + Math.sign(distance));
  } else {
    go(Math.round(position));
  }
}

window.addEventListener('pointerup', finish);
window.addEventListener('pointercancel', finish);
pan.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  go(target + (event.key === 'ArrowLeft' ? -1 : 1));
});

document.querySelector('#previous').addEventListener('click', () => go(target - 1));
document.querySelector('#next').addEventListener('click', () => go(target + 1));
find.addEventListener('click', () => {
  const index = seats.findIndex(seat => seat.dataset.name === holder);
  go(Math.round(position + nearestOffset(index, position)));
  pan.focus({ preventScroll: true });
});
pass.addEventListener('click', () => {
  holder = holder === 'Maya' ? 'Noor' : 'Maya';
  updateSpeaker();
});
layouts.forEach(input => {
  input.checked = input.value === layout;
  input.addEventListener('change', () => {
    layout = input.value;
    render();
  });
});

new ResizeObserver(render).observe(pan);
seats.forEach(seat => seat.setAttribute('aria-label', seat.dataset.name));
updateSpeaker();
render();
