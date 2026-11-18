/* Standalone review prototype. No accounts, bookings, or application data writes. */
const events = window.flyerEvents;
const boardTypes = [
  { id: 'conversation', title: 'Good conversation', subtitle: 'A question. A different view. A little connection.', note: 'Pull up a chair.' },
  { id: 'practice', title: 'A little practice', subtitle: 'Come as you are. Try something together.', note: 'Room to listen, too.' },
  { id: 'creative', title: 'Make & wonder', subtitle: 'Follow an idea. See where it takes you.', note: 'Curiosity welcome.' },
];
const rail = document.querySelector('#rail');
const detail = document.querySelector('#detail');
let selectedCategory = 'all';
let lastFlyer;
const angles = [-2.4, 2.1, -1.1, 1.4];
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}
function showEvent(event, trigger) {
  lastFlyer = trigger;
  document.querySelector('#detail-title').textContent = event.title;
  document.querySelector('#detail-kind').textContent = event.sample ? 'CONCEPT GATHERING · SAMPLE ARTWORK' : 'ARCHIVED PUBLIC LISTING';
  const image = document.querySelector('#detail-image');
  image.src = event.image;
  image.alt = event.alt;
  document.querySelector('#detail-host').textContent = event.host;
  document.querySelector('#detail-note').textContent = event.note;
  document.querySelector('#detail-attribution').textContent = event.attribution ? `Artwork: ${event.attribution}. Source archived October 2026; event availability has not been refreshed.` : 'Sample artwork from the CircleUp November 16 design studies.';
  const link = document.querySelector('#detail-source');
  link.hidden = !event.source;
  if (event.source) link.href = event.source;
  else link.removeAttribute('href');
  detail.showModal();
}
function makeFlyer(event, index) {
  const flyer = element('button','flyer');
  flyer.type = 'button';
  flyer.dataset.event = event.id;
  flyer.setAttribute('aria-haspopup','dialog');
  flyer.setAttribute('aria-label', `${event.title}. ${event.sample ? 'Concept gathering' : 'Archived public listing'}. Open details.`);
  flyer.style.setProperty('--angle', `${angles[index % angles.length]}deg`);
  const image = element('img');
  image.src = event.image;
  image.alt = event.alt;
  image.draggable = false;
  if (event.width && event.height) { image.width=event.width; image.height=event.height; }
  const title = element('span','flyer-title',event.title);
  const meta = element('span','flyer-meta',event.sample ? 'Concept gathering · sample flyer' : 'Archived listing · view source ↗');
  flyer.append(image,title,meta);
  flyer.addEventListener('click',()=>showEvent(event,flyer));
  image.addEventListener('error',()=>{ image.hidden=true;flyer.prepend(element('span','flyer-title','Artwork unavailable')); });
  return flyer;
}
function updatePosition() {
  const boards = [...rail.querySelectorAll('.board')];
  const max = rail.scrollWidth - rail.clientWidth;
  document.querySelector('#previous').disabled = rail.scrollLeft < 5;
  document.querySelector('#next').disabled = rail.scrollLeft >= max - 5;
  const current = Math.min(boards.length,Math.max(1,1+Math.round(rail.scrollLeft/(boards[0]?.getBoundingClientRect().width+27||1))));
  document.querySelector('#board-position').textContent = rail.clientWidth > 1.5 * boards[0].getBoundingClientRect().width ? `${boards.length} ${boards.length===1?'board':'boards'}` : `${current} / ${boards.length} ${boards.length===1?'board':'boards'}`;
}
function render() {
  const types=boardTypes.filter(type=>selectedCategory==='all'||type.id===selectedCategory);
  rail.replaceChildren();
  let total=0;
  let boardCount=0;
  for (const type of types) {
    const categoryItems=events.filter(e=>e.category===type.id);total+=categoryItems.length;
    for(let start=0;start<categoryItems.length;start+=3){
    const items=categoryItems.slice(start,start+3);boardCount++;
    const board=element('article',`board ${type.id}`);
    board.setAttribute('aria-label',`${type.title}: ${items.length} gatherings`);
    const top=element('div','board-top');
    const heading=element('div');heading.append(element('h3','',type.title),element('p','',type.subtitle));
    top.append(heading,element('span','chalk-number',String(items.length)));
    const pins=element('div','pinboard');pins.append(...items.map(makeFlyer));
    board.append(top,pins,element('span','board-bottom',type.note));
    rail.append(board);
    }
  }
  document.querySelector('#result-count').textContent=`${total} gatherings across ${boardCount} ${boardCount===1?'board':'boards'}`;
  rail.scrollLeft=0;
  requestAnimationFrame(updatePosition);
}
document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{
  selectedCategory=button.dataset.category;
  document.querySelectorAll('[data-category]').forEach(other=>{
    const active=other===button;other.classList.toggle('active',active);other.setAttribute('aria-pressed',String(active));
  });
  render();
}));
function move(direction) {
  const width=rail.querySelector('.board').getBoundingClientRect().width;
  rail.scrollBy({left:direction*(width+27),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
document.querySelector('#previous').addEventListener('click',()=>move(-1));
document.querySelector('#next').addEventListener('click',()=>move(1));
rail.addEventListener('keydown',event=>{
  if(event.target!==rail)return;
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
});
rail.addEventListener('scroll',updatePosition,{passive:true});
window.addEventListener('resize',updatePosition);
document.querySelector('.close').addEventListener('click',()=>detail.close());
detail.addEventListener('click',event=>{
  if(event.target!==detail)return;const r=detail.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)detail.close();
});
detail.addEventListener('close',()=>lastFlyer?.focus({preventScroll:true}));
render();
