const scene = document.querySelector('#scene');
const motionToggle = document.querySelector('#motion');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function resetMotion() {
  scene.style.removeProperty('--px');
  scene.style.removeProperty('--py');
}
function updatePreference() {
  motionToggle.disabled = reduced.matches;
  if (reduced.matches) motionToggle.checked = false;
  if (!motionToggle.checked) resetMotion();
}
scene.addEventListener('pointermove', event => {
  if (!motionToggle.checked || reduced.matches || event.pointerType === 'touch') return;
  const bounds = scene.getBoundingClientRect();
  scene.style.setProperty('--px', ((event.clientX - bounds.left) / bounds.width - .5) * 17 + 'px');
  scene.style.setProperty('--py', ((event.clientY - bounds.top) / bounds.height - .5) * 14 + 'px');
});
scene.addEventListener('pointerleave', resetMotion);
motionToggle.addEventListener('change', updatePreference);
reduced.addEventListener('change', updatePreference);
updatePreference();

const pickers = {
  date: document.querySelector('#date-picker'),
  format: document.querySelector('#format-picker'),
};
const filters = { date: '', format: '' };
const results = document.querySelector('#results');
const clear = document.querySelector('#clear-date');
const cards = [...document.querySelectorAll('.paper-ticket')];
function render() {
  let count = 0;
  for (const card of cards) {
    card.hidden = Object.entries(filters).some(([key, value]) => value && value !== card.dataset[key]);
    if (!card.hidden) count += 1;
  }
  results.textContent = count === 1 ? '1 gathering' : count + ' gatherings';
  clear.hidden = Boolean(count) || !filters.date;
}
function choose(key, choice) {
  const picker = pickers[key];
  filters[key] = choice.dataset.value;
  const summary = picker.querySelector('summary');
  summary.textContent = choice.textContent;
  for (const button of picker.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button === choice));
  }
  picker.open = false;
  render();
  summary.focus();
}
for (const [key, picker] of Object.entries(pickers)) {
  const buttons = [...picker.querySelectorAll('button')];
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(!button.dataset.value));
    button.addEventListener('click', () => choose(key, button));
  }
  picker.addEventListener('toggle', () => {
    if (!picker.open) return;
    for (const other of Object.values(pickers)) if (other !== picker) other.open = false;
  });
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picker.open) {
      picker.open = false;
      picker.querySelector('summary').focus();
      event.stopPropagation();
    }
  });
}
clear.addEventListener('click', () => choose('date', pickers.date.querySelector('button')));
render();
