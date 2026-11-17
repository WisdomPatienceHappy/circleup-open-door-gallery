const catalog = window.CIRCLEUP_CATALOG;
const filterBar = document.querySelector('#filters');
const gallery = document.querySelector('#gallery');
const savedButton = document.querySelector('#saved');
const viewer = document.querySelector('#viewer');
const storageKey = 'circleup-open-door-gallery-saved-v1';
let saved = new Set();
try {
  saved = new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
} catch {}
let visible = [];
let position = 0;
let opener;
let savedOnly = false;
let lane = 'all';

function fromHash() {
  const value = location.hash.slice(1);
  if (value === 'all' || Object.hasOwn(catalog.lanes, value)) return value;
  return 'all';
}

function itemNode(item) {
  const figure = document.createElement('figure');
  figure.className = item.device === 'mobile' ? 'study mobile' : 'study';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'open';
  open.setAttribute('aria-label', 'Open ' + item.title);
  const image = document.createElement('img');
  image.src = item.thumbnail ?? item.image;
  image.alt = item.title + ' · CircleUp interface study';
  image.width = item.width;
  image.height = item.height;
  image.loading = 'lazy';
  open.append(image);
  open.addEventListener('click', () => {
    opener = open;
    position = visible.indexOf(item);
    updateViewer();
    viewer.showModal();
  });

  const caption = document.createElement('figcaption');
  const title = document.createElement('strong');
  title.textContent = item.title;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'star';
  const updateSaved = () => {
    toggle.textContent = saved.has(item.id) ? 'Saved' : 'Save';
    toggle.setAttribute('aria-pressed', String(saved.has(item.id)));
    toggle.setAttribute('aria-label', 'Save ' + item.title);
  };
  updateSaved();
  toggle.addEventListener('click', () => {
    if (!saved.delete(item.id)) saved.add(item.id);
    try { localStorage.setItem(storageKey, JSON.stringify([...saved])); } catch {}
    if (savedOnly) {
      render();
      savedButton.focus();
    } else {
      updateSaved();
    }
  });
  caption.append(title, toggle);
  figure.append(open, caption);
  if (item.note) {
    const note = document.createElement('p');
    note.textContent = item.note;
    figure.append(note);
  }
  return figure;
}

function render() {
  lane = fromHash();
  for (const control of filterBar.children) {
    control.setAttribute('aria-pressed', String(control.dataset.lane === lane));
  }
  savedButton.setAttribute('aria-pressed', String(savedOnly));
  savedButton.textContent = savedOnly ? 'Show all studies' : 'Show saved';
  gallery.classList.toggle('single', lane !== 'all');
  gallery.replaceChildren();
  visible = [];
  for (const [key, title] of Object.entries(catalog.lanes)) {
    if (lane !== 'all' && lane !== key) continue;
    const items = catalog.items.filter(item => item.lane === key && (!savedOnly || saved.has(item.id)));
    if (!items.length && savedOnly) continue;
    const section = document.createElement('section');
    section.className = 'lane';
    const heading = document.createElement('h2');
    heading.textContent = title;
    section.append(heading);
    if (!items.length) {
      const pending = document.createElement('p');
      pending.className = 'pending';
      pending.textContent = 'Images in progress';
      section.append(pending);
    } else {
      visible.push(...items);
      const studies = document.createElement('div');
      studies.className = 'studies';
      studies.append(...items.map(itemNode));
      section.append(studies);
    }
    gallery.append(section);
  }
  if (savedOnly && !visible.length) {
    gallery.textContent = 'Save a study to find it here.';
  }
}
function updateViewer() {
  const item = visible[position];
  document.querySelector('#view-title').textContent = item.title;
  document.querySelector('#view-note').textContent = item.note;
  const image = document.querySelector('#view-img');
  image.src = item.image;
  image.alt = item.title + ' · CircleUp interface study';
  document.querySelector('#original').href = item.image;
  const prompt = document.querySelector('#prompt');
  prompt.hidden = !item.prompt;
  if (item.prompt) prompt.href = item.prompt;
  document.querySelector('#previous').disabled = position === 0;
  document.querySelector('#next').disabled = position >= visible.length - 1;
}
function move(step) {
  const nextPosition = position + step;
  if (nextPosition < 0 || nextPosition >= visible.length) return;
  position = nextPosition;
  updateViewer();
}
for (const [id, title] of [['all', 'All pages'], ...Object.entries(catalog.lanes)]) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'filter';
  control.dataset.lane = id;
  control.textContent = title;
  control.addEventListener('click', () => { location.hash = id; });
  filterBar.append(control);
}
document.querySelector('#count').textContent = catalog.total + ' / ' + catalog.target + ' generated images';
savedButton.addEventListener('click', () => { savedOnly = !savedOnly; render(); });
window.addEventListener('hashchange', () => {
  if (viewer.open) viewer.close();
  render();
});
document.querySelector('#close').addEventListener('click', () => viewer.close());
document.querySelector('#previous').addEventListener('click', () => move(-1));
document.querySelector('#next').addEventListener('click', () => move(1));
viewer.addEventListener('close', () => opener?.focus());
viewer.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') move(-1);
  if (event.key === 'ArrowRight') move(1);
});
render();
