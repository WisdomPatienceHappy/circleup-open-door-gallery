const headlineFonts = new Map([
  ["Cormorant Garamond", 700],
  ["Instrument Serif", 400],
  ["Baskervville", 600],
  ["Young Serif", 400],
  ["Fraunces", 650],
  ["DM Serif Text", 400],
  ["Literata", 650],
  ["Crimson Text", 700],
  ["Bricolage Grotesque", 650],
  ["News Cycle", 700],
]);

const controlFonts = new Map([
  ["Inter", 500],
  ["Instrument Sans", 500],
  ["Source Sans 3", 500],
  ["DM Sans", 500],
  ["News Cycle", 700],
  ["Atkinson Hyperlegible Next", 500],
  ["Work Sans", 500],
  ["Barlow Semi Condensed", 500],
]);

const pairs = [
  { id: "current", name: "Current welcome", headline: "Cormorant Garamond", controls: "Inter" },
  { id: "instrument", name: "Contemporary editorial", headline: "Instrument Serif", controls: "Instrument Sans" },
  { id: "baskervville", name: "Bookish and clear", headline: "Baskervville", controls: "Source Sans 3" },
  { id: "young", name: "Broad and friendly", headline: "Young Serif", controls: "DM Sans" },
  { id: "fraunces", name: "Rounded and playful", headline: "Fraunces", controls: "DM Sans" },
  { id: "humanist", name: "Humanist controls", headline: "Cormorant Garamond", support: "Source Sans 3", controls: "Atkinson Hyperlegible Next" },
  { id: "literata", name: "Quiet book face", headline: "Literata", controls: "Source Sans 3" },
  { id: "journal", name: "Neighborhood journal", headline: "DM Serif Text", controls: "News Cycle" },
  { id: "crimson", name: "Paperback", headline: "Crimson Text", controls: "Work Sans" },
  { id: "bricolage", name: "Drawn warmth in sans", headline: "Bricolage Grotesque", support: "Work Sans", controls: "Work Sans" },
  { id: "club", name: "Local club notice", headline: "News Cycle", support: "Source Sans 3", controls: "Source Sans 3" },
  { id: "poster", name: "Print poster", headline: "Young Serif", support: "Barlow Semi Condensed", controls: "Barlow Semi Condensed" },
  { id: "slim", name: "Tall and spare", headline: "Instrument Serif", support: "News Cycle", controls: "News Cycle" },
  { id: "open", name: "Open and steady", headline: "DM Serif Text", support: "Atkinson Hyperlegible Next", controls: "Atkinson Hyperlegible Next" },
];

const preview = document.querySelector("#preview");
const comparison = document.querySelector("#comparison");
const pickers = document.querySelector("#pickers");
const pairing = document.querySelector("#pairing");
const headline = document.querySelector("#headline");
const support = document.querySelector("#support");
const controls = document.querySelector("#controls");
const modeButtons = document.querySelectorAll("[data-mode]");
const status = document.querySelector("#font-status");
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const startingParams = new URLSearchParams(location.search);

function setupScene(scene) {
  scene.append(
    document.querySelector("#welcome-template").content.cloneNode(true),
    document.querySelector("#directory-template").content.cloneNode(true),
  );

  const directoryHeading = scene.querySelector(".directory h2");
  scene.querySelector(".find-gathering").addEventListener("click", () => {
    directoryHeading.focus({ preventScroll: true });
    directoryHeading.scrollIntoView({ behavior: motion.matches ? "instant" : "smooth", block: "start" });
  });

  const search = scene.querySelector(".search input");
  const event = scene.querySelector(".event");
  const noMatch = scene.querySelector(".no-match");
  const searchText = event.querySelector(".event-text").textContent.toLowerCase();
  search.addEventListener("input", () => {
    event.hidden = !searchText.includes(search.value.trim().toLowerCase());
    noMatch.hidden = !event.hidden;
  });

  const action = event.querySelector(".event-action");
  const detail = event.querySelector(".event-detail");
  action.addEventListener("click", () => {
    detail.hidden = !detail.hidden;
    action.setAttribute("aria-expanded", String(!detail.hidden));
  });
}

function applyType(scene, selection) {
  const supportingFace = selection.support || selection.headline;
  const supportWeight = selection.support ? (controlFonts.get(supportingFace) ?? headlineFonts.get(supportingFace)) : headlineFonts.get(supportingFace);
  scene.style.setProperty("--headline-font", JSON.stringify(selection.headline));
  scene.style.setProperty("--headline-weight", headlineFonts.get(selection.headline));
  scene.style.setProperty("--support-font", JSON.stringify(supportingFace));
  scene.style.setProperty("--support-weight", supportWeight);
  scene.style.setProperty("--control-font", JSON.stringify(selection.controls));
}

function selectPair(pair) {
  pairing.value = pair.id;
  headline.value = pair.headline;
  support.value = pair.support ?? "";
  controls.value = pair.controls;
}

function updatePreview() {
  const selection = { headline: headline.value, support: support.value, controls: controls.value };
  const matched = pairs.find(pair =>
    pair.headline === selection.headline &&
    (pair.support ?? "") === selection.support &&
    pair.controls === selection.controls
  );
  pairing.value = matched?.id ?? "custom";
  applyType(preview, selection);
  saveView();
}

function saveView() {
  if (location.protocol === "file:") return;

  const params = new URLSearchParams();
  if (!comparison.hidden) params.set("view", "compare");
  if (pairing.value === "custom") {
    params.set("headline", headline.value);
    params.set("support", support.value);
    params.set("controls", controls.value);
  } else if (pairing.value !== pairs[0].id) {
    params.set("pair", pairing.value);
  }
  history.replaceState(null, "", `${location.pathname}${params.size ? "?" + params : ""}${location.hash}`);
}

function setMode(mode, focusPreview = false) {
  const isCompare = mode === "compare";
  preview.hidden = isCompare;
  pickers.hidden = isCompare;
  comparison.hidden = !isCompare;
  modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
  if (focusPreview) headline.focus();
  saveView();
}

function addComparison(pair) {
  const card = document.querySelector("#pair-template").content.firstElementChild.cloneNode(true);
  card.dataset.pair = pair.id;
  card.querySelector(".pair-heading h2").textContent = pair.name;
  const fonts = [pair.headline, pair.controls];
  if (pair.support && pair.support !== pair.controls) fonts.splice(1, 0, pair.support);
  card.querySelector(".pair-families").textContent = fonts.join(" + ");
  const button = card.querySelector(".try-pair");
  button.setAttribute("aria-label", `Try ${pair.name} in live preview`);
  button.addEventListener("click", () => {
    selectPair(pair);
    updatePreview();
    setMode("preview", true);
    window.scrollTo(0, 0);
  });

  const scene = card.querySelector(".type-scene");
  setupScene(scene);
  applyType(scene, pair);
  comparison.append(card);
}

pairing.add(new Option("Custom pairing", "custom"));
pairing.options[0].disabled = true;
pairs.forEach(pair => pairing.add(new Option(pair.name, pair.id)));
headlineFonts.forEach((weight, family) => headline.add(new Option(family, family)));
support.add(new Option("Same as headline", ""));
const supportFonts = new Map([...headlineFonts, ...controlFonts]);
supportFonts.forEach((weight, family) => support.add(new Option(family, family)));
controlFonts.forEach((weight, family) => controls.add(new Option(family, family)));

pairing.addEventListener("change", () => {
  selectPair(pairs.find(pair => pair.id === pairing.value));
  updatePreview();
});
[headline, support, controls].forEach(picker => picker.addEventListener("change", updatePreview));
modeButtons.forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));

setupScene(preview);
pairs.forEach(addComparison);
selectPair(pairs.find(pair => pair.id === startingParams.get("pair")) ?? pairs[0]);
if (headlineFonts.has(startingParams.get("headline"))) headline.value = startingParams.get("headline");
if (supportFonts.has(startingParams.get("support"))) support.value = startingParams.get("support");
if (controlFonts.has(startingParams.get("controls"))) controls.value = startingParams.get("controls");
updatePreview();
setMode(startingParams.get("view") === "compare" ? "compare" : "preview");

Promise.allSettled([...document.fonts].map(face => face.load())).then(results => {
  const missing = [...document.fonts].filter((_, index) => results[index].status === "rejected");
  if (missing.length) {
    status.textContent = `Couldn’t load ${missing.map(face => face.family).join(", ")}. Those samples may use a fallback face.`;
    status.hidden = false;
  }
});
