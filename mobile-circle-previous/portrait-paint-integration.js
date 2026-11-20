// The room owns the demo stick. The conversation preview owns simulated speech.
(() => {
  const choice = document.querySelector('#portrait-style');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let paint;

  function updatePortraits() {
    // The sample conversation supplies state only, with no measured audio level.
    paint?.update(performance.now());
  }

  function setPortraitStyle() {
    if (choice.value === 'original') {
      paint?.destroy();
      paint = undefined;
      return;
    }
    paint ??= CircleUpPortraitPaint.create({
      getSeats: () => seats,
      getId: (_seat, index) => index,
      getSpeaker: () => CircleUpConversationPreview.speakingId(),
      getHolder: () => demoStickHolder,
      holderRing: false
    });
    updatePortraits();
  }

  if (new URLSearchParams(location.search).get('portrait') === 'original') {
    choice.value = 'original';
  }
  choice.addEventListener('change', setPortraitStyle);
  ring.addEventListener('circleup:portrait-state', updatePortraits);
  motion.addEventListener('change', updatePortraits);
  setPortraitStyle();
})();
