const categories = [
  {id: 'all', label: 'All flyers', color: '#cdd0a6'},
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
const search = document.querySelector('#search');
const count = document.querySelector('#results-count');
const empty = document.querySelector('#empty');
const dialog = document.querySelector('#details');
const pacific = 'America/Los_Angeles';
const dateKey = new Intl.DateTimeFormat('sv-SE', {timeZone: pacific, dateStyle: 'short'});
const dateLabel = new Intl.DateTimeFormat('en-US', {timeZone: pacific, weekday: 'short', month: 'short', day: 'numeric'});
const timeLabel = new Intl.DateTimeFormat('en-US', {timeZone: pacific, hour: 'numeric', minute: '2-digit'});
const today = dateKey.format(new Date());
const lastThisWeek = new Date(today + 'T00:00:00Z');
lastThisWeek.setUTCDate(lastThisWeek.getUTCDate() + (7 - lastThisWeek.getUTCDay()) % 7);
const endOfWeek = lastThisWeek.toISOString().slice(0, 10);
const categoryFor = id => categories.find(category => category.id === id);
const byTime = (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
const archive = item => dateKey.format(new Date(item.startsAt)) < today;
const params = new URLSearchParams(location.search);
let activeTopic = categoryFor(params.get('topic'))?.id ?? 'all';
let activeBoards = [];
let openFlyer;
let pinnedRows = new WeakMap();

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
}

function makeArtwork(item, className) {
  const frame = element('span', className);
  frame.style.setProperty('--ratio', item.width + ' / ' + item.height);
  frame.style.setProperty('--fallback', categoryFor(item.topic).color);

  const usePaper = () => {
    frame.replaceChildren(element('span', 'poster-fallback', item.name));
  };
  if (item.image) {
    const image = element('img');
    image.alt = '';
    image.decoding = 'async';
    image.width = item.width;
    image.height = item.height;
    image.addEventListener('error', usePaper, {once: true});
    image.src = item.image;
    frame.append(image);
  } else {
    usePaper();
  }
  return frame;
}

function eventMeta(item, detail = false) {
  const start = new Date(item.startsAt);
  const status = item.sample ? 'Sample' : archive(item) ? 'Archived' : '';
  const location = item.place || item.format;
  const time = detail ? timeLabel.format(start) + ' PT' : '';
  return [dateLabel.format(start), time, location, status].filter(Boolean).join(' · ');
}

function openEvent(item) {
  const artwork = makeArtwork(item, 'detail-art');
  artwork.id = 'event-art';
  document.querySelector('#event-art').replaceWith(artwork);
  document.querySelector('#event-topic').textContent = categoryFor(item.topic).label;
  document.querySelector('#event-title').textContent = item.name;
  document.querySelector('#event-meta').textContent = eventMeta(item, true);
  document.querySelector('#event-description').textContent = item.description;
  const source = document.querySelector('#event-source');
  source.href = item.source || '#';
  source.hidden = !item.source;
  const credit = document.querySelector('#event-credit');
  credit.textContent = item.credit ? 'Artwork · ' + item.credit : '';
  credit.hidden = !item.credit;
  dialog.showModal();
}

function createFlyer(item) {
  const button = element('button', 'flyer');
  button.type = 'button';
  const hash = [...item.id].reduce((total, character) => total * 31 + character.charCodeAt(0) >>> 0, 0);
  button.style.setProperty('--tilt', ((hash % 35) / 10 - 1.7) + 'deg');
  button.style.setProperty('--pin', categoryFor(item.topic).color);
  if (hash % 3 === 0) button.dataset.pin = 'tape';
  const note = element('span', 'flyer-note');
  note.append(element('strong', '', item.name), element('small', '', eventMeta(item)));
  button.append(makeArtwork(item, 'poster'), note);
  button.addEventListener('click', () => {
    openFlyer = button;
    openEvent(item);
  });
  return button;
}

// Keep source order. Only the row width changes as the board gets narrower.
function packRows(entries, width) {
  const compact = width < 570;
  const target = compact ? Math.max(105, width * .43) : Math.min(240, width * .21);
  const gap = compact ? 14 : 26;
  const capacity = compact ? 2 : 5;
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
    const ratio = entry.item.width / entry.item.height;
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
  if (!width || width === board.width) return;
  board.width = width;
  const focused = document.activeElement;
  const rows = packRows(board.entries, width).map(row => {
    const line = element('div', 'flyer-row');
    line.style.setProperty('--gap', row.gap + 'px');
    for (const entry of row.entries) {
      entry.button.style.setProperty('--width', row.height * entry.ratio + 'px');
      line.append(entry.button);
    }
    return line;
  });
  board.wall.replaceChildren(...rows);
  if (focused?.classList.contains('flyer') && board.wall.contains(focused)) focused.focus({preventScroll: true});
}

const resize = new ResizeObserver(entries => {
  for (const {target} of entries) {
    const board = pinnedRows.get(target);
    if (board) layOut(board);
  }
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
  const board = {section, wall, entries: group.items.map(item => ({item, button: createFlyer(item)}))};
  pinnedRows.set(wall, board);
  return board;
}

function groupFlyers(items) {
  if (grouping.value === 'topic') {
    return categories.slice(1).map(category => ({
      ...category, items: items.filter(item => item.topic === category.id)
    }));
  }
  if (grouping.value === 'date') {
    const groups = [
      {id: 'today', label: 'Today', items: []},
      {id: 'this-week', label: 'This week', items: []},
      {id: 'later', label: 'Later', items: []},
      {id: 'archive', label: 'From the archive', items: []}
    ];
    for (const item of [...items].sort(byTime)) {
      const day = dateKey.format(new Date(item.startsAt));
      const index = day < today ? 3 : day === today ? 0 : day <= endOfWeek ? 1 : 2;
      groups[index].items.push(item);
    }
    return groups;
  }
  return [{id: 'all', label: categoryFor(activeTopic).label, items}];
}

function render() {
  const term = search.value.toLowerCase().trim();
  const matches = wallGatherings.filter(item => {
    const text = [item.name, categoryFor(item.topic).label, item.place, item.format].join(' ').toLowerCase();
    return (activeTopic === 'all' || item.topic === activeTopic) && text.includes(term);
  });
  const groups = groupFlyers(matches).filter(group => group.items.length);
  for (const board of activeBoards) resize.unobserve(board.wall);
  pinnedRows = new WeakMap();
  activeBoards = groups.map(createBoard);
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
    render();
  });
  topics.append(button);
}

grouping.value = ['topic', 'date'].includes(params.get('by')) ? params.get('by') : 'wall';
dialog.addEventListener('close', () => {
  openFlyer?.focus({preventScroll: true});
  openFlyer = undefined;
});
grouping.addEventListener('change', render);
search.addEventListener('input', render);
document.querySelector('#reset').addEventListener('click', () => {
  activeTopic = 'all';
  search.value = '';
  render();
  topics.firstElementChild.focus();
});
render();
