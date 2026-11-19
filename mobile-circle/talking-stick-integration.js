/** Classic-script room adapter: existing room/preview retain all turn authority. */
(() => {
  'use strict';
  const grid = document.querySelector('.tuning-grid');
  const header = document.querySelector('.table-top');
  const shell = document.querySelector('.preview-shell');
  if (!grid || !header || !window.TalkingStickDemo || window.CircleUpTalkingStick) return;
  const oldDemo = document.querySelector('.sample-turn');
  const oldHidden = oldDemo?.hidden;
  if (oldDemo) oldDemo.hidden = true;
  header.classList.add('talking-stick-header');
  shell?.classList.add('talking-stick-ready');
  let disposed = false, passingLabel = false, rosterCount = seats.length;
  const roster = () => seats.map((_, id) => ({id, name: names[id]}));
  function safeBounds() {
    const stage = camera.getBoundingClientRect();
    const bar = document.querySelector('.call-tools')?.getBoundingClientRect();
    const headerBottom = header.getBoundingClientRect().bottom;
    const left = Math.max(0, stage.left), top = Math.max(0, stage.top, headerBottom + 4);
    const right = Math.min(innerWidth, stage.right), bottom = Math.min(innerHeight, stage.bottom, bar?.top ?? innerHeight);
    return {left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top)};
  }
  function restoreLabel() {
    if (!passingLabel) return;
    passingLabel = false;
    holderText.removeAttribute('title');
    if (!window.CircleUpConversationPreview?.snapshot().running) holderText.textContent = `${names[holder]} has the stick`;
  }
  const demo = window.TalkingStickDemo.create({
    mount: grid, quickMount: header, roster: roster(), getHolder: () => holder,
    getAnchorRect: id => seats[id]?.querySelector('.photo').getBoundingClientRect(),
    getTravelBounds: safeBounds,
    onBegin(target, {from}) {
      const preview = window.CircleUpConversationPreview;
      if (!preview?.pauseForHandoff || !preview?.stopForHandoff) throw Error('Conversation handoff hooks unavailable');
      preview.pauseForHandoff();
      passingLabel = true;
      const label = `${names[from]} → ${names[target]} · passing`;
      holderText.textContent = label;
      holderText.title = label;
    },
    onCommit(target) {
      window.CircleUpConversationPreview.stopForHandoff();
      passingLabel = false;
      holderText.removeAttribute('title');
      setDemoHolder(target);
    }
  });
  function refresh() {
    if (disposed) return;
    if (rosterCount !== seats.length) {
      rosterCount = seats.length;
      demo.updateRoster(roster());
    } else demo.refresh();
    if (!demo.snapshot().passing) restoreLabel();
  }
  function cancel(reason = 'Handoff cancelled.') {
    if (disposed) return;
    demo.cancel(reason);
    restoreLabel();
  }
  const changed = () => cancel('The preview changed. Handoff cancelled.');
  const groupChanged = () => cancel('The group or layout changed. Handoff cancelled.');
  const away = () => cancel('Handoff cancelled while the preview is away.');
  const visibility = () => { if (document.hidden) away(); };
  const controls = ['#conversation-play', '#conversation-quick-play', '#conversation-trace', '#conversation-speed', '#conversation-response'];
  const listeners = [];
  for (const selector of controls) {
    const element = document.querySelector(selector);
    const event = element?.tagName === 'SELECT' ? 'change' : 'click';
    element?.addEventListener(event, changed, {capture: true});
    if (element) listeners.push([element, event, changed]);
  }
  for (const selector of ['#group-size', '#seating-layout', '#reset-layout', '#pass-stick']) {
    const element = document.querySelector(selector);
    const event = element?.tagName === 'SELECT' ? 'change' : 'click';
    element?.addEventListener(event, groupChanged, {capture: true});
    if (element) listeners.push([element, event, groupChanged]);
  }
  const observer = new MutationObserver(refresh);
  observer.observe(ring, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-speaker']});
  observer.observe(holderText, {childList: true, characterData: true, subtree: true});
  const flightObserver = new MutationObserver(() => { if (!demo.snapshot().passing) restoreLabel(); });
  flightObserver.observe(grid.querySelector('.talking-stick-demo'), {attributes: true, attributeFilter: ['aria-busy']});
  window.addEventListener('pagehide', away);
  document.addEventListener('visibilitychange', visibility);
  window.CircleUpTalkingStick = Object.freeze({
    passTo: demo.passTo, cancel, refresh,
    snapshot: () => ({...demo.snapshot(), travelBounds: safeBounds()}),
    dispose() {
      if (disposed) return;
      cancel(); disposed = true; observer.disconnect(); flightObserver.disconnect();
      for (const [element, event, listener] of listeners) element.removeEventListener(event, listener, {capture: true});
      window.removeEventListener('pagehide', away);
      document.removeEventListener('visibilitychange', visibility);
      demo.dispose(); header.classList.remove('talking-stick-header'); shell?.classList.remove('talking-stick-ready');
      if (oldDemo) oldDemo.hidden = oldHidden;
    }
  });
})();
