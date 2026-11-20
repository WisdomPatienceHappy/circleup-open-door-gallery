const categories = [
  {id: 'all', label: 'All topics', color: '#cdd0a6'},
  {id: 'listening', label: 'Listening', color: '#f7ae8c'},
  {id: 'creativity', label: 'Creativity', color: '#ffc86b'},
  {id: 'community', label: 'Community', color: '#cdd0a6'},
  {id: 'dialogue', label: 'Dialogue', color: '#e8bca5'},
  {id: 'ideas', label: 'Ideas & books', color: '#e5d7a3'}
];

const topics = document.querySelector('#topics');
const boards = document.querySelector('#boards');
const boardLinks = document.querySelector('#board-links');
const grouping = document.querySelector('#grouping');
const kind = document.querySelector('#kind');
const locationSelect = document.querySelector('#location');
const kindLabels = {
  event: ['Gathering', 'Gatherings'],
  facilitator: ['Facilitator', 'Facilitators'],
  community: ['Community', 'Communities']
};
const kindOf = item => item.kind || 'event';
const placeOf = item => item.region || (item.format === 'Online' ? item.format : item.place) || '';
const listingKey = item => item.source || item.id;
let listings = [...wallGatherings];
const search = document.querySelector('#search');
const count = document.querySelector('#results-count');
const empty = document.querySelector('#empty');
const listingAction = empty.querySelector('.listing-flyer');
prepareListingFlyer(listingAction);
const dialog = document.querySelector('#details');
const pacific = 'America/Los_Angeles';
const dateFormats = new Map();
function datesFor(timeZone) {
  if (!dateFormats.has(timeZone)) {
    dateFormats.set(timeZone, {
      key: new Intl.DateTimeFormat('sv-SE', {timeZone, dateStyle: 'short'}),
      label: new Intl.DateTimeFormat('en-US', {timeZone, weekday: 'short', month: 'short', day: 'numeric'}),
      time: new Intl.DateTimeFormat('en-US', {timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short'})
    });
  }
  return dateFormats.get(timeZone);
}
function daysFor(item) {
  const {key} = datesFor(item.timeZone || pacific);
  const today = key.format(new Date());
  const sunday = new Date(today + 'T00:00:00Z');
  sunday.setUTCDate(sunday.getUTCDate() + (7 - sunday.getUTCDay()) % 7);
  return {today, day: key.format(new Date(item.startsAt)), endOfWeek: sunday.toISOString().slice(0, 10)};
}
const categoryFor = id => categories.find(category => category.id === id) || categories[0];
const byTime = (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
const params = new URLSearchParams(location.search);
const sizeControl = document.querySelector('#flyer-size');
const infoChoices = [...document.querySelectorAll('input[name="flyer-info"]')];
const requestedSize = Number(params.get('size') || 100);
let flyerScale = (Number.isFinite(requestedSize) ? Math.round(Math.min(150, Math.max(65, requestedSize)) / 5) * 5 : 100) / 100;
let infoMode = params.get('info') === 'below' ? 'below' : 'hover';
const infoBubble = document.querySelector('#flyer-info-bubble');
let infoAnchor;
let infoHideTimer;

let activeTopic = categoryFor(params.get('topic')).id;
let awaitingLocation = params.get('place');
let activeBoards = [];
let openFlyer;
const pinnedRows = new WeakMap();

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
}

// The creation action is paper in the artwork flow, not a board-heading button.
function prepareListingFlyer(link) {
  link.classList.add('listing-card');
  link.setAttribute('aria-label', 'Add your listing: share a gathering, community or facilitator');
  const paper = element('span', 'poster listing-paper');
  paper.style.setProperty('--ratio', '4 / 5');
  const plus = element('span', 'listing-flyer-plus', '+');
  plus.setAttribute('aria-hidden', 'true');
  paper.append(plus, element('strong', 'listing-paper-title', 'Add your listing'),
    element('span', 'listing-paper-copy', 'Share a gathering, community or facilitator'));
  link.replaceChildren(paper);
  return link;
}

function listingEntry() {
  const link = listingAction.cloneNode(true);
  return {item: {width: 4, height: 5}, button: link};
}

function makeArtwork(item, className, lazy = false) {
  const frame = element('span', className);
  frame.style.setProperty('--ratio', item.width + ' / ' + item.height);
  frame.style.setProperty('--fallback', categoryFor(item.topic).color);

  const usePaper = () => {
    const paper = element('span', 'poster-fallback');
    paper.dataset.kind = kindOf(item);
    if (item.starter) paper.append(element('span', 'starter-kind', kindLabels[kindOf(item)][0]));
    paper.append(element('span', 'starter-title', item.name));
    if (item.starter) paper.append(element('span', 'starter-topic', categoryFor(item.topic).label));
    frame.replaceChildren(paper);
  };
  if (item.image) {
    const image = element('img');
    image.alt = '';
    image.decoding = 'async';
    if (lazy) image.loading = 'lazy';
    image.width = item.width;
    image.height = item.height;
    image.addEventListener('error', usePaper, {once: true});
    if (className === 'poster') image.addEventListener('load', () => {
      const measuredRatio = image.naturalWidth / image.naturalHeight;
      if (!image.naturalHeight || Math.abs(measuredRatio - item.width / item.height) < .025) return;
      item.width = image.naturalWidth;
      item.height = image.naturalHeight;
      frame.style.setProperty('--ratio', item.width + ' / ' + item.height);
      frame.dispatchEvent(new Event('flyer-dimensions', {bubbles: true}));
    }, {once: true});
    image.src = item.image;
    frame.append(image);
  } else {
    usePaper();
  }
  return frame;
}

function factsFor(item, detail = false) {
  if (!item.startsAt) {
    if (kindOf(item) === 'trial') return [item.width + ' × ' + item.height + ' px'];
    return [kindLabels[kindOf(item)][0], item.place, item.sample ? 'Sample profile' : 'CircleUp starter flyer'].filter(Boolean);
  }
  const start = new Date(item.startsAt);
  const dates = datesFor(item.timeZone || pacific);
  const {today, day} = daysFor(item);
  const status = item.sample ? 'Sample' : day < today ? 'Archived' : '';
  const place = item.place || item.format;
  return [dates.label.format(start), detail ? dates.time.format(start) : '', place, detail ? item.venue : '', status].filter(Boolean);
}

function previewFormat(width, height) {
  const ratio = Number(width) / Number(height);
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return safeRatio > 1.22 ? 'landscape' : safeRatio < .88 ? 'portrait' : 'square';
}

function openEvent(item) {
  hideFlyerInfo();
  const artwork = makeArtwork(item, 'detail-art');
  dialog.dataset.format = previewFormat(item.width, item.height);
  const previewImage = artwork.querySelector('img');
  const useNaturalFormat = () => {
    if (document.querySelector('#event-art') !== artwork || !previewImage.naturalWidth || !previewImage.naturalHeight) return;
    dialog.dataset.format = previewFormat(previewImage.naturalWidth, previewImage.naturalHeight);
    artwork.style.setProperty('--ratio', previewImage.naturalWidth + ' / ' + previewImage.naturalHeight);
  };
  if (previewImage) previewImage.addEventListener('load', useNaturalFormat, {once: true});
  artwork.id = 'event-art';
  document.querySelector('#event-art').replaceWith(artwork);
  document.querySelector('#event-topic').textContent = categoryFor(item.topic).label;
  document.querySelector('#event-title').textContent = item.name;
  document.querySelector('#event-meta').replaceChildren(...factsFor(item, true).map(fact => element('li', 'ticket-line', fact)));
  document.querySelector('#event-description').textContent = item.description || '';
  const source = document.querySelector('#event-source');
  source.href = item.source || '#';
  source.hidden = !item.source;
  document.querySelector('#event-source-label').textContent = kindOf(item) === 'event' ? 'View original listing ↗' : 'Visit official site ↗';
  const editor = document.querySelector('#event-editor');
  editor.hidden = !item.editor;
  if (item.editor) editor.href = 'editor/?profile=' + encodeURIComponent(item.editor);
  const credit = document.querySelector('#event-credit');
  credit.textContent = item.credit ? 'Artwork · ' + item.credit : '';
  credit.hidden = !item.credit;
  dialog.showModal();
  artwork.scrollTop = 0;
  dialog.scrollTop = 0;
  if (previewImage?.complete) useNaturalFormat();
}

function hideFlyerInfo() {
  clearTimeout(infoHideTimer);
  if (infoAnchor) infoAnchor.removeAttribute('aria-describedby');
  infoAnchor = undefined;
  infoBubble.hidden = true;
}

function positionFlyerInfo() {
  if (!infoAnchor?.isConnected || infoBubble.hidden) return;
  const anchor = infoAnchor.getBoundingClientRect();
  if (anchor.bottom < 0 || anchor.top > innerHeight || anchor.right < 0 || anchor.left > innerWidth) { hideFlyerInfo(); return; }
  const box = infoBubble.getBoundingClientRect();
  const inset = 12, gap = 12;
  const clamp = (value, maximum) => Math.max(inset, Math.min(maximum - inset, value));
  let side = 'below';
  let left = clamp(anchor.left + anchor.width / 2 - box.width / 2, innerWidth - box.width);
  let top;
  if (anchor.bottom + gap + box.height <= innerHeight - inset) top = anchor.bottom + gap;
  else if (anchor.top - gap - box.height >= inset) { side = 'above'; top = anchor.top - gap - box.height; }
  else if (anchor.right + gap + box.width <= innerWidth - inset) { side = 'right'; left = anchor.right + gap; top = clamp(anchor.top + anchor.height / 2 - box.height / 2, innerHeight - box.height); }
  else if (anchor.left - gap - box.width >= inset) { side = 'left'; left = anchor.left - gap - box.width; top = clamp(anchor.top + anchor.height / 2 - box.height / 2, innerHeight - box.height); }
  else top = clamp(anchor.bottom + gap, innerHeight - box.height);
  const overlaps = left < anchor.right && left + box.width > anchor.left && top < anchor.bottom && top + box.height > anchor.top;
  infoBubble.style.pointerEvents = overlaps ? 'none' : 'auto';
  infoBubble.dataset.side = side;
  infoBubble.style.left = left + 'px';
  infoBubble.style.top = top + 'px';
  infoBubble.style.visibility = 'visible';
}

function showFlyerInfo(button, item) {
  if (infoMode !== 'hover' || dialog.open) return;
  hideFlyerInfo();
  infoAnchor = button;
  button.setAttribute('aria-describedby', infoBubble.id);
  document.querySelector('#bubble-kind').textContent = kindLabels[kindOf(item)]?.[0] || 'Image preview';
  document.querySelector('#bubble-title').textContent = item.name;
  document.querySelector('#bubble-facts').textContent = factsFor(item).join(' · ');
  const description = document.querySelector('#bubble-description');
  description.textContent = item.description || '';
  description.hidden = !item.description;
  infoBubble.hidden = false;
  infoBubble.style.visibility = 'hidden';
  positionFlyerInfo();
}

function deferHideFlyerInfo(button) {
  clearTimeout(infoHideTimer);
  infoHideTimer = setTimeout(() => {
    if (infoAnchor === button && document.activeElement !== button && !infoBubble.matches(':hover')) hideFlyerInfo();
  }, 120);
}
infoBubble.addEventListener('pointerenter', () => clearTimeout(infoHideTimer));
infoBubble.addEventListener('pointerleave', () => deferHideFlyerInfo(infoAnchor));
let lastPointerType = 'mouse';
document.addEventListener('pointerdown', event => { lastPointerType = event.pointerType; if (lastPointerType === 'touch') hideFlyerInfo(); }, true);
document.addEventListener('keydown', event => {
  lastPointerType = 'keyboard';
  if (event.key === 'Escape' && !infoBubble.hidden) hideFlyerInfo();
});
window.addEventListener('scroll', () => { if (infoAnchor === document.activeElement) positionFlyerInfo(); else hideFlyerInfo(); }, {passive: true});
window.addEventListener('resize', () => { if (infoAnchor === document.activeElement) positionFlyerInfo(); else hideFlyerInfo(); }, {passive: true});

function createFlyer(item, lazy) {
  const button = element('button', 'flyer');
  button.type = 'button';
  button.dataset.flyerId = item.id;
  button.setAttribute('aria-label', [item.name, ...factsFor(item), 'Open details'].join('. '));
  button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') showFlyerInfo(button, item); });
  button.addEventListener('pointerleave', () => deferHideFlyerInfo(button));
  button.addEventListener('focus', () => { if (lastPointerType !== 'touch') showFlyerInfo(button, item); });
  button.addEventListener('blur', () => deferHideFlyerInfo(button));
  const hash = [...item.id].reduce((total, character) => total * 31 + character.charCodeAt(0) >>> 0, 0);
  button.style.setProperty('--tilt', ((hash % 35) / 10 - 1.7) + 'deg');
  button.style.setProperty('--pin', categoryFor(item.topic).color);
  if (hash % 3 === 0) button.dataset.pin = 'tape';
  const note = element('span', 'flyer-note');
  const cardFacts = factsFor(item);
  if (item.startsAt) cardFacts.splice(1, 0, datesFor(item.timeZone || pacific).time.format(new Date(item.startsAt)));
  note.append(element('span', 'flyer-kind', kindLabels[kindOf(item)]?.[0] || 'Image'),
    element('strong', '', item.name), element('small', 'flyer-facts', cardFacts.join(' · ')));
  if (item.description) note.append(element('span', 'flyer-description', item.description));
  note.append(element('span', 'flyer-open', 'View details ↗'));
  button.append(makeArtwork(item, 'poster', lazy), note);
  button.addEventListener('click', () => {
    openFlyer = button;
    openEvent(item);
  });
  return button;
}

// Keep source order. Only the row width changes as the board gets narrower.
function packRows(entries, width) {
  const compact = width < 570;
  const target = (compact ? Math.max(105, width * .43) : Math.min(240, width * .21)) * flyerScale;
  const gap = compact ? 14 : 26;
  const capacity = Math.max(compact ? 1 : 2, Math.round((compact ? 2 : 5) / flyerScale));
  const rows = [];
  let row = [];
  let ratios = 0;

  function finish() {
    const available = width - gap * (row.length - 1);
    rows.push({entries: row, height: Math.min(target * 1.10, available / ratios), gap});
    row = [];
    ratios = 0;
  }

  for (const [index, entry] of entries.entries()) {
    const naturalRatio = entry.item.width / entry.item.height;
    const ratio = infoMode === 'below' && entry.button.classList.contains('flyer')
      ? Math.max(naturalRatio, Math.min(compact ? 145 : 165, width) / (target * .71))
      : naturalRatio;
    const predicted = (width - gap * row.length) / (ratios + ratio);
    if (row.length && (predicted < target * .71 || row.length >= capacity)) finish();
    row.push({...entry, ratio});
    ratios += ratio;
    const last = entries[index + 1];
    const lastFits = index === entries.length - 2 && row.length < capacity
      && (width - gap * row.length) / (ratios + last.item.width / last.item.height) >= target * .71;
    if (!lastFits && (width - gap * (row.length - 1)) / ratios <= target) finish();
  }
  if (row.length) finish();
  return rows;
}

function layOut(board) {
  const width = board.wall.clientWidth;
  if (!width || (width === board.width && flyerScale === board.scale && infoMode === board.infoMode)) return;
  board.width = width;
  board.scale = flyerScale;
  board.infoMode = infoMode;
  const focused = document.activeElement;
  const rows = packRows(board.entries, width).map(row => {
    const line = element('div', 'flyer-row');
    line.style.setProperty('--gap', row.gap + 'px');
    for (const entry of row.entries) {
      entry.button.style.setProperty('--width', row.height * entry.ratio + 'px');
      entry.button.style.setProperty('--art-height', row.height + 'px');
      line.append(entry.button);
    }
    return line;
  });
  board.wall.replaceChildren(...rows);
  if (focused?.matches('.flyer, .listing-card') && board.wall.contains(focused)) focused.focus({preventScroll: true});
}

const resize = new ResizeObserver(entries => {
  requestAnimationFrame(() => {
    for (const {target} of entries) {
      const board = pinnedRows.get(target);
      if (board) layOut(board);
    }
  });
});

function createBoard(group) {
  const section = element('section', 'board');
  section.id = 'board-' + group.id;
  const header = element('header', 'board-head');
  const title = element('h2', '', group.label);
  title.id = section.id + '-title';
  section.setAttribute('aria-labelledby', title.id);
  const label = group.items.length + (group.items.length === 1 ? ' flyer' : ' flyers');
  header.append(title, element('p', '', label));

  const wall = element('div', 'flyers');
  const sill = element('div', 'board-sill');
  sill.setAttribute('aria-hidden', 'true');
  section.append(header, wall, sill);
  const entries = group.items.map((item, index) => ({item, button: createFlyer(item, index >= 5)}));
  if (group.id !== 'trial') entries.splice(Math.min(4, entries.length), 0, listingEntry());
  const board = {section, wall, entries};
  wall.addEventListener('flyer-dimensions', () => {
    board.width = undefined;
    requestAnimationFrame(() => {
      if (wall.isConnected) layOut(board);
    });
  });
  pinnedRows.set(wall, board);
  return board;
}

function groupFlyers(items) {
  if (grouping.value === 'topic') {
    return categories.slice(1).map(category => ({
      ...category, items: items.filter(item => item.topic === category.id)
    }));
  }
  const ofKind = type => ({id: type, label: kindLabels[type][1], items: items.filter(item => kindOf(item) === type)});
  if (grouping.value === 'kind') return Object.keys(kindLabels).map(ofKind);
  if (grouping.value === 'date') {
    const groups = [
      {id: 'today', label: 'Today', items: []},
      {id: 'this-week', label: 'This week', items: []},
      {id: 'later', label: 'Later', items: []},
      {id: 'archive', label: 'From the archive', items: []}
    ];
    for (const item of items.filter(item => item.startsAt).sort(byTime)) {
      const {day, today, endOfWeek} = daysFor(item);
      const index = day < today ? 3 : day === today ? 0 : day <= endOfWeek ? 1 : 2;
      groups[index].items.push(item);
    }
    return groups.concat(['facilitator', 'community'].map(ofKind));
  }
  const label = activeTopic !== 'all' ? categoryFor(activeTopic).label : kindLabels[kind.value]?.[1] || 'All flyers';
  return [{id: 'all', label, items}];
}

function render() {
  hideFlyerInfo();
  const term = search.value.toLowerCase().trim();
  const matches = listings.filter(item => {
    const text = [item.name, categoryFor(item.topic).label, item.place, item.format].join(' ').toLowerCase();
    return (activeTopic === 'all' || item.topic === activeTopic)
      && (!kind.value || kindOf(item) === kind.value)
      && (!locationSelect.value || placeOf(item) === locationSelect.value)
      && text.includes(term);
  });
  const groups = groupFlyers(matches).filter(group => group.items.length);
  for (const board of activeBoards) resize.unobserve(board.wall);
  activeBoards = groups.map(createBoard);
  const focusedActionBoard = document.activeElement?.closest('.board')?.id;
  const actionWasFocused = document.activeElement?.classList.contains('listing-card');
  boards.replaceChildren(...activeBoards.map(board => board.section));

  activeBoards.forEach(board => {
    layOut(board);
    resize.observe(board.wall);
  });
  boardLinks.hidden = groups.length < 2;
  boardLinks.replaceChildren(...groups.map(group => {
    const link = element('a', '', group.label);
    link.href = '#board-' + group.id;
    return link;
  }));
  empty.hidden = Boolean(matches.length);
  if (actionWasFocused) {
    const boardAction = document.getElementById(focusedActionBoard)?.querySelector('.listing-card');
    (matches.length ? boardAction || boards.querySelector('.listing-card') : listingAction)?.focus({preventScroll: true});
  }
  count.textContent = matches.length + (matches.length === 1 ? ' flyer' : ' flyers');
  for (const button of topics.children) {
    button.setAttribute('aria-pressed', String(button.dataset.topic === activeTopic));
  }
}

for (const category of categories) {
  const button = element('button', 'topic');
  button.type = 'button';
  button.dataset.topic = category.id;
  button.style.setProperty('--chip', category.color);
  button.style.setProperty('--dot', category.id === 'all' ? 'var(--ink)' : category.color);
  const dot = element('span', 'topic-dot');
  dot.setAttribute('aria-hidden', 'true');
  button.append(dot, element('span', '', category.label));
  button.addEventListener('click', () => {
    activeTopic = category.id;
    refresh();
  });
  topics.append(button);
}

function populateLocations(wanted = locationSelect.value) {
  const locations = [...new Set(listings.map(placeOf).filter(Boolean))].sort();
  locationSelect.replaceChildren(new Option('All locations', ''), ...locations.map(place => new Option(place, place)));
  if (locations.includes(wanted)) locationSelect.value = wanted;
}

function refresh() {
  render();
  updateAddress();
}

function updateAddress() {
  if (location.protocol === 'file:') return;
  const state = new URLSearchParams();
  if (activeTopic !== 'all') state.set('topic', activeTopic);
  if (kind.value) state.set('type', kind.value);
  if (locationSelect.value) state.set('place', locationSelect.value);
  if (grouping.value !== 'wall') state.set('by', grouping.value);
  if (search.value.trim()) state.set('q', search.value.trim());
  if (flyerScale !== 1) state.set('size', Math.round(flyerScale * 100));
  if (infoMode !== 'hover') state.set('info', infoMode);
  history.replaceState(null, '', location.pathname + (state.size ? '?' + state : '') + location.hash);
}

grouping.value = ['topic', 'date', 'kind'].includes(params.get('by')) ? params.get('by') : 'wall';
if (Object.hasOwn(kindLabels, params.get('type'))) kind.value = params.get('type');
search.value = params.get('q') || '';
populateLocations(params.get('place'));
dialog.addEventListener('close', () => {
  if (openFlyer) {
    const returnTarget = openFlyer.isConnected ? openFlyer
      : boards.querySelector('[data-flyer-id="' + CSS.escape(openFlyer.dataset.flyerId) + '"]');
    (returnTarget || search).focus({preventScroll: true});
    openFlyer = undefined;
  }
});
grouping.addEventListener('change', refresh);
kind.addEventListener('change', refresh);
locationSelect.addEventListener('change', () => {
  awaitingLocation = null;
  refresh();
});
search.addEventListener('input', refresh);
function syncAppearanceControls() {
  sizeControl.value = Math.round(flyerScale * 100);
  sizeControl.style.setProperty('--range-progress', ((sizeControl.value - 65) / 85 * 100) + '%');
  document.querySelector('#flyer-size-value').value = sizeControl.value + '%';
  document.body.dataset.info = infoMode;
  for (const choice of infoChoices) choice.checked = choice.value === infoMode;
  document.querySelector('#flyer-hint').textContent = infoMode === 'hover'
    ? 'Hover or focus a flyer for a little more. Tap to open it.'
    : 'Each paper card keeps its title, details and summary below the artwork. Tap or click to open.';
}
sizeControl.addEventListener('input', () => {
  flyerScale = Number(sizeControl.value) / 100;
  syncAppearanceControls();
  hideFlyerInfo();
  activeBoards.forEach(layOut);
  if (trialBoard) layOut(trialBoard);
  updateAddress();
});
for (const choice of infoChoices) choice.addEventListener('change', () => {
  if (!choice.checked) return;
  infoMode = choice.value;
  syncAppearanceControls();
  hideFlyerInfo();
  activeBoards.forEach(layOut);
  if (trialBoard) layOut(trialBoard);
  updateAddress();
});
document.querySelector('#reset-view').addEventListener('click', () => {
  flyerScale = 1;
  infoMode = 'hover';
  syncAppearanceControls();
  hideFlyerInfo();
  activeBoards.forEach(layOut);
  if (trialBoard) layOut(trialBoard);
  updateAddress();
});
syncAppearanceControls();
render();

const trialFiles = document.querySelector('#trial-files');
const trialMount = document.querySelector('#trial-board');
const trialStatus = document.querySelector('#trial-status');
const clearTrial = document.querySelector('#clear-trial');
let trialVersion = 0;
let trialBoard;
let previewUrls = [];

function removeTrial() {
  hideFlyerInfo();
  if (trialBoard) resize.unobserve(trialBoard.wall);
  trialMount.replaceChildren();
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
  clearTrial.hidden = true;
}

async function readPhoto(file, index) {
  const url = URL.createObjectURL(file);
  try {
    const photo = new Image();
    photo.src = url;
    await photo.decode();
    if (!photo.naturalWidth || !photo.naturalHeight) throw new Error('Empty image');
    return {id: 'trial-' + index, kind: 'trial', topic: 'all', name: file.name, image: url, width: photo.naturalWidth, height: photo.naturalHeight};
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

trialFiles.addEventListener('change', async () => {
  const version = ++trialVersion;
  const files = Array.from(trialFiles.files);
  if (!files.length) return;
  trialStatus.textContent = 'Measuring images…';
  const outcomes = await Promise.allSettled(files.map(readPhoto));
  const items = outcomes.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (version !== trialVersion) {
    items.forEach(item => URL.revokeObjectURL(item.image));
    return;
  }
  removeTrial();
  previewUrls = items.map(item => item.image);
  trialStatus.textContent = items.length + ' of ' + files.length + ' images loaded.';
  if (!items.length) return;
  trialBoard = createBoard({id: 'trial', label: 'Your images', items});
  trialMount.append(trialBoard.section);
  layOut(trialBoard);
  resize.observe(trialBoard.wall);
  clearTrial.hidden = false;
});
clearTrial.addEventListener('click', () => {
  trialVersion++;
  removeTrial();
  trialFiles.value = '';
  trialStatus.textContent = '';
  trialFiles.focus();
});

async function loadPublicFeed() {
  const urls = ['./live-gatherings.json'];
  if (location.hostname === 'wisdompatiencehappy.github.io') {
    urls.unshift('https://raw.githubusercontent.com/WisdomPatienceHappy/circleup-open-door-gallery/main/flyer-wall/live-gatherings.json');
  }
  for (const url of urls) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(5500)});
      if (!response.ok) continue;
      const {events, checkedAt} = await response.json();
      if (!Array.isArray(events)) continue;
      const publicEvents = new Map(events.map(item => [listingKey(item), item]));
      const editorial = listings.map(item => {
        const liveItem = publicEvents.get(listingKey(item));
        publicEvents.delete(listingKey(item));
        return liveItem ? {...liveItem, topic: item.topic, region: item.region} : item;
      });
      listings = [...editorial, ...publicEvents.values()];
      populateLocations(locationSelect.value || awaitingLocation);
      awaitingLocation = null;
      render();
      if (checkedAt && Number.isFinite(Date.parse(checkedAt))) {
        const status = document.querySelector('#feed-status');
        status.textContent = 'CircleUp listings checked ' + datesFor(pacific).label.format(new Date(checkedAt)) + '.';
        status.hidden = false;
      }
      return;
    } catch {
      // The saved board remains available if a feed request fails.
    }
  }
}

loadPublicFeed();
