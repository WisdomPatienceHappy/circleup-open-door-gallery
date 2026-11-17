const variants = [
  { id: "one-step-closer", name: "One step closer", vector: "one-step-closer.svg", size: 50 },
  { id: "saved-seat", name: "Saved seat", vector: "saved-seat.svg", size: 50 },
  { id: "shared-ink", name: "Shared ink", vector: "shared-ink.svg", size: 50 },
  { id: "shared-edge", name: "Shared edge", vector: "shared-edge.svg", size: 50 },
  { id: "three-at-the-table", name: "Three at the table", vector: "three-at-the-table.svg", size: 50 },
  { id: "room-for-one", name: "Room for one", vector: "room-for-one.svg", size: 50 },
  { id: "paired-ink", name: "Paired ink", vector: "paired-ink.svg", size: 50 },
  { id: "warm-dots", name: "Warm dots", vector: "warm-dots.svg", size: 50 },
  { id: "brush-dots", name: "Brush dots", vector: "brush-dots.svg", size: 50 },
  { id: "close-ring", name: "Close ring", vector: "close-ring.svg", size: 50 },
  { id: "open-ring", name: "Open ring", vector: "open-ring.svg", size: 50 },
  { id: "deep-tones", name: "Deep tones", vector: "deep-tones.svg", size: 50 },
  { id: "table-soft-ink", name: "Around the Table · Soft ink", vector: "table-soft-ink.svg" },
  { id: "table-loose-ink", name: "Around the Table · Loose ink", vector: "table-loose-ink.svg" },
  { id: "table-original", name: "Around the Table · Original", vector: "table-original.svg" },
  { id: "wordmark", name: "Wordmark only" },
  { id: "room", name: "Room for one more", sheet: "welcome-and-listening.png", crop: [202, 71, 621, 479] },
  { id: "listeners", name: "Two listeners", sheet: "welcome-and-listening.png", crop: [890, 101, 1336, 464] },
  { id: "chair", name: "Pull up a chair", sheet: "welcome-and-listening.png", crop: [248, 565, 632, 966] },
  { id: "door", name: "Open door", sheet: "welcome-and-listening.png", crop: [856, 579, 1343, 965] },
  { id: "ground", name: "Common ground", sheet: "coming-together.png", crop: [231, 72, 634, 476] },
  { id: "thread", name: "Returning thread", sheet: "coming-together.png", crop: [903, 75, 1281, 463] },
  { id: "center", name: "Shared center", sheet: "coming-together.png", crop: [221, 555, 632, 968] },
  { id: "turn", name: "Passing the turn", sheet: "coming-together.png", crop: [899, 563, 1299, 960] }
];

const picker = document.querySelector(".topic-picker");
const choices = picker.querySelector(".logo-choices");
const mark = picker.querySelector(".picker-mark");
const sheet = mark.querySelector("image");
const base = picker.dataset.assetBase ?? "";
const syncHash = picker.hasAttribute("data-sync-hash");
const referenceWidth = 1536;
const referenceHeight = 1024;
const padding = 12;

function show(variant) {
  const source = variant.vector ?? variant.sheet;
  mark.toggleAttribute("hidden", !source);
  if (!source) return;

  const [imageWidth, imageHeight] = variant.vector ? [144, 144] : [1536, 1024];
  const [left, top, right, bottom] = variant.crop ?? [0, 0, imageWidth, imageHeight];
  const inset = variant.crop ? padding : 0;
  const width = right - left + 2 * inset;
  const height = bottom - top + 2 * inset;
  const maxHeight = variant.size ?? 38;
  const maxWidth = variant.size ?? 45;
  const scale = Math.min(maxHeight / height, maxWidth / width);
  const displayWidth = width * scale;
  const displayHeight = height * scale;
  mark.setAttribute("viewBox", [left - inset, top - inset, width, height].join(" "));
  sheet.setAttribute("width", imageWidth);
  sheet.setAttribute("height", imageHeight);
  sheet.setAttribute("href", base + source);
  mark.style.left = 243 / referenceWidth * 100 + "%";
  mark.style.top = (31 - displayHeight / 2) / referenceHeight * 100 + "%";
  mark.style.width = displayWidth / referenceWidth * 100 + "%";
  mark.style.height = displayHeight / referenceHeight * 100 + "%";
}

for (const variant of variants) {
  const label = document.createElement("label");
  label.className = "logo-choice";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "logo";
  input.value = variant.id;
  const copy = document.createElement("span");
  copy.textContent = variant.name;
  label.append(input, copy);
  choices.append(label);
}

const defaultVariant = variants.find(variant => variant.id === picker.dataset.defaultVariant) ?? variants[0];

function showFromHash() {
  const id = location.hash.slice(1);
  const variant = variants.find(candidate => candidate.id === id) ?? defaultVariant;
  choices.querySelector(`input[value="${variant.id}"]`).checked = true;
  show(variant);
}

choices.addEventListener("change", event => {
  const variant = variants.find(candidate => candidate.id === event.target.value);
  if (syncHash) location.hash = variant.id;
  show(variant);
});

if (syncHash) {
  window.addEventListener("hashchange", showFromHash);
  showFromHash();
} else {
  choices.querySelector(`input[value="${defaultVariant.id}"]`).checked = true;
  show(defaultVariant);
}
