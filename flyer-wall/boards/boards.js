// Additive category-board comparison, using the main wall's records and actions.
const photoBoardArt = {listening:'listening',creativity:'creativity',community:'community',dialogue:'connection',ideas:'reflection'};
let photoBoardIndex = 0;
let photoBoardId;
let photoBoardFrame;
const photoBoardPrev = document.querySelector('#board-prev');
const photoBoardNext = document.querySelector('#board-next');
const photoBoardPosition = document.querySelector('#board-position');
const photoBoardRender = render;
const photoBoardResize = new ResizeObserver(() => photoBoardSchedule());
function photoBoardSchedule() {
  if (photoBoardFrame) return;
  photoBoardFrame = requestAnimationFrame(() => {photoBoardFrame = 0; photoBoardSync();});
}
function photoBoardSync() {
  if (!activeBoards.length) {boards.style.height = ''; photoBoardPrev.disabled = photoBoardNext.disabled = true; photoBoardPosition.textContent = 'No matching boards'; return;}
  const viewport = boards.getBoundingClientRect();
  photoBoardIndex = activeBoards.reduce((best, b, i) => Math.abs(b.section.getBoundingClientRect().left - viewport.left) < Math.abs(activeBoards[best].section.getBoundingClientRect().left - viewport.left) ? i : best, 0);
  const current = activeBoards[photoBoardIndex];
  photoBoardId = current.section.id;
  boards.style.height = Math.ceil(current.section.getBoundingClientRect().height + 24) + 'px';
  photoBoardPrev.disabled = photoBoardIndex === 0;
  photoBoardNext.disabled = photoBoardIndex === activeBoards.length - 1;
  photoBoardPrev.textContent = photoBoardIndex ? '← ' + activeBoards[photoBoardIndex - 1].section.querySelector('h2').textContent : '← Previous board';
  photoBoardNext.textContent = photoBoardIndex < activeBoards.length - 1 ? 'Next: ' + activeBoards[photoBoardIndex + 1].section.querySelector('h2').textContent + ' →' : 'Next board →';
  photoBoardPosition.textContent = (photoBoardIndex + 1) + ' of ' + activeBoards.length;
}
function photoBoardGo(index) {
  const target = activeBoards[index];
  if (!target) return;
  boards.scrollTo({left: target.section.offsetLeft - activeBoards[0].section.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
}
render = function() {
  const wanted = photoBoardId;
  photoBoardResize.disconnect();
  photoBoardRender();
  for (const board of activeBoards) {
    const id = board.section.id.replace('board-', '');
    const scene = element('span', 'category-scene');
    const image = element('img');
    image.src = '../cut-paper-topics/art/' + (photoBoardArt[id] || 'community') + '.png';
    image.alt = '';
    image.width = image.height = 88;
    scene.append(image);
    board.section.style.setProperty('--category-paper', categoryFor(id).color);
    board.section.querySelector('.board-head').prepend(scene);
    photoBoardResize.observe(board.section);
  }
  const nextIndex = Math.max(0, activeBoards.findIndex(b => b.section.id === wanted));
  requestAnimationFrame(() => {photoBoardGo(nextIndex); photoBoardSchedule();});
};
photoBoardPrev.addEventListener('click', () => photoBoardGo(photoBoardIndex - 1));
photoBoardNext.addEventListener('click', () => photoBoardGo(photoBoardIndex + 1));
boards.addEventListener('scroll', () => {hideFlyerInfo(); photoBoardSchedule();}, {passive:true});
boards.addEventListener('keydown', e => {
  if (e.target !== boards) return;
  if (e.key === 'ArrowRight') {e.preventDefault(); photoBoardGo(photoBoardIndex + 1);}
  if (e.key === 'ArrowLeft') {e.preventDefault(); photoBoardGo(photoBoardIndex - 1);}
});
window.addEventListener('resize', photoBoardSchedule);
if (!params.has('size')) {flyerScale = 1.3; syncAppearanceControls();}
grouping.value = 'topic';
kind.value = '';
activeTopic = 'all';
refresh();
