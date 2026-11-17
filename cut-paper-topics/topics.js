const topicOptions = [
  { id: "listening", title: "Listening", color: "coral" },
  { id: "creativity", title: "Creativity", color: "gold" },
  { id: "connection", title: "Connection", color: "sage" },
  { id: "community", title: "Community", color: "coral" },
  { id: "nature", title: "Nature", color: "sage" },
  { id: "making", title: "Making", color: "gold" },
  { id: "storytelling", title: "Storytelling", color: "coral" },
  { id: "reflection", title: "Reflection", color: "sage" }
];

const eventTopics = {
  stories: ["storytelling", "community", "connection"],
  listening: ["listening", "connection"],
  clay: ["creativity", "making"],
  reading: ["reflection", "listening"]
};

const entries = [...gatherings].sort((a, b) => Number(b.id === "stories") - Number(a.id === "stories"));
const filters = document.querySelector("#filters");
const topicButtons = document.querySelector("#topic-buttons");
const selectedTopics = document.querySelector("#selected-topics");
const clearTopics = document.querySelector("#clear-topics");
const panel = document.querySelector("#topic-picker");
const openTopics = document.querySelector("#open-topics");
const editTopics = document.querySelector("#edit-topics");
const topicReopen = document.querySelector("#topic-reopen");
const resultsHeading = document.querySelector("#results-heading");
const results = document.querySelector("#results");
const status = document.querySelector("#result-count");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const paperCircles = document.querySelector(".paper-circles");
let paperFrame = 0;
function movePaperCircles() {
  if (reducedMotion.matches || paperFrame) return;
  paperFrame = requestAnimationFrame(() => {
    paperCircles.style.setProperty("--paper-scroll", window.scrollY + "px");
    paperFrame = 0;
  });
}
window.addEventListener("scroll", movePaperCircles, { passive: true });
window.addEventListener("pageshow", movePaperCircles);
reducedMotion.addEventListener("change", movePaperCircles);

const draft = new Set(["listening", "storytelling"]);
let applied = new Set(draft);

function makeTopic(topic) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "topic";
  button.dataset.topic = topic.id;
  button.dataset.color = topic.color;

  const photo = document.createElement("span");
  photo.className = "photo";
  const image = document.createElement("img");
  image.src = "cut-paper-topics/art/" + topic.id + ".png";
  image.alt = "";
  photo.append(image);

  const label = document.createElement("span");
  label.className = "topic-name torn";
  label.textContent = topic.title;
  button.append(photo, label);
  button.addEventListener("click", () => {
    if (draft.has(topic.id)) draft.delete(topic.id);
    else draft.add(topic.id);
    renderDraft();
  });
  return button;
}

function renderDraft() {
  for (const button of topicButtons.children) {
    button.setAttribute("aria-pressed", String(draft.has(button.dataset.topic)));
  }

  const chosen = topicOptions.filter(topic => draft.has(topic.id));
  selectedTopics.replaceChildren(...chosen.map((topic, index) => {
    const item = document.createElement("li");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-topic torn";
    remove.setAttribute("aria-label", "Remove " + topic.title);

    const name = document.createElement("span");
    name.textContent = topic.title;
    const cross = document.createElement("span");
    cross.className = "cross";
    cross.setAttribute("aria-hidden", "true");
    remove.append(name, cross);
    remove.addEventListener("click", () => {
      draft.delete(topic.id);
      renderDraft();
      const next = selectedTopics.children[Math.min(index, selectedTopics.children.length - 1)];
      (next?.firstElementChild ?? topicButtons.querySelector('[data-topic="' + topic.id + '"]')).focus();
    });
    item.append(remove);
    return item;
  }));
  clearTopics.disabled = !chosen.length;
  document.querySelector("#none-selected").hidden = chosen.length > 0;
}

function renderResults() {
  const { day, format, query } = Object.fromEntries(new FormData(filters));
  const terms = query.trim().toLowerCase();
  const matches = entries.filter(entry => {
    const topics = eventTopics[entry.id];
    const searchable = [entry.name, entry.format, entry.place, ...topics].join(" ").toLowerCase();
    return (!day || entry.day === day) && (!format || entry.format === format)
      && (!terms || searchable.includes(terms))
      && (!applied.size || topics.some(topic => applied.has(topic)));
  });
  results.replaceChildren(...matches.map(makeEvent));
  status.textContent = matches.length === 1 ? "1 gathering" : matches.length + " gatherings";
  document.querySelector("#no-results").hidden = matches.length > 0;
}

function makeEvent(entry) {
  const row = document.createElement("li");
  row.className = "event";
  row.innerHTML = '<div class="event-art"></div><div class="event-meta"><h3></h3><p></p></div><button type="button" class="text-action event-link" aria-expanded="false">View gathering</button><p class="event-details" hidden></p>';
  const artwork = row.querySelector(".event-art");
  if (entry.art) {
    const image = document.createElement("img");
    image.src = entry.id === "stories" ? "cut-paper-topics/art/story-flyer.png" : entry.art;
    image.alt = "";
    artwork.append(image);
    if (entry.id === "stories") artwork.classList.add("story-art");
  }
  row.querySelector("h3").textContent = entry.name;
  const logistics = [entry.date, entry.time.replace(" PT", ""), entry.place || entry.format, entry.price ? "$" + entry.price : "Free"];
  row.querySelector(".event-meta p").textContent = logistics.join("  ·  ");

  const details = row.querySelector(".event-details");
  details.id = "detail-" + entry.id;
  details.textContent = entry.expectation;
  const toggle = row.querySelector("button");
  toggle.setAttribute("aria-controls", details.id);
  function reveal(open) {
    details.hidden = !open;
    toggle.textContent = open ? "Hide details" : "View gathering";
    toggle.setAttribute("aria-label", toggle.textContent + " for " + entry.name);
    toggle.setAttribute("aria-expanded", String(open));
  }
  reveal(false);
  toggle.addEventListener("click", () => reveal(details.hidden));
  row.addEventListener("keydown", event => {
    if (event.key === "Escape" && !details.hidden) {
      reveal(false);
      toggle.focus();
    }
  });
  return row;
}

function setPanel(open, destination) {
  panel.classList.toggle("is-closed", !open);
  panel.inert = !open;
  openTopics.setAttribute("aria-expanded", String(open));
  editTopics.setAttribute("aria-expanded", String(open));
  topicReopen.hidden = open;
  document.querySelector("#applied-topics").textContent = topicOptions
    .filter(topic => applied.has(topic.id)).map(topic => topic.title).join(" · ");
  destination?.focus({ preventScroll: true });
}

topicButtons.append(...topicOptions.map(makeTopic));
renderDraft();
renderResults();

filters.addEventListener("submit", event => event.preventDefault());
filters.elements.query.addEventListener("input", renderResults);
filters.addEventListener("change", event => {
  if (event.target.name !== "query") renderResults();
});
const pickerHeading = document.querySelector("#picker-heading");
const revealTopics = () => {
  setPanel(true, pickerHeading);
  pickerHeading.scrollIntoView({ block: "nearest", behavior: reducedMotion.matches ? "instant" : "smooth" });
};
openTopics.addEventListener("click", revealTopics);
editTopics.addEventListener("click", revealTopics);
document.querySelector("#close-picker").addEventListener("click", () => setPanel(false, editTopics));
panel.addEventListener("keydown", event => {
  if (event.key === "Escape") setPanel(false, editTopics);
});
clearTopics.addEventListener("click", () => {
  draft.clear();
  renderDraft();
  topicButtons.firstElementChild.focus();
});
document.querySelector("#show-gatherings").addEventListener("click", () => {
  applied = new Set(draft);
  renderResults();
  setPanel(false, resultsHeading);
  setTimeout(() => {
    if (panel.inert && document.activeElement === resultsHeading) {
      resultsHeading.scrollIntoView({ block: "nearest", behavior: reducedMotion.matches ? "instant" : "smooth" });
    }
  }, reducedMotion.matches ? 0 : 245);
});
document.querySelector("#reset-filters").addEventListener("click", () => {
  filters.reset();
  applied.clear();
  draft.clear();
  renderDraft();
  renderResults();
  document.querySelector("#applied-topics").textContent = "";
  filters.elements.query.focus();
});
