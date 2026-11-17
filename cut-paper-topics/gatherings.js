/* Shared comparison fixtures. Times explicitly use Pacific time. */
const gatherings = [
  {
    id: "listening", name: "Listening Together", topic: "listening",
    day: "thursday", date: "Thu, Nov 19", time: "7–8 PM PT", startsAt: "2026-11-19T19:00:00-08:00",
    format: "Online", price: 0, art: "media/listening-poster.png",
    expectation: "We’ll start with a brief check-in and take turns listening and sharing. You’re welcome to listen or pass. Set aside one hour.",
  },
  {
    id: "clay", name: "Clay at the Common Table", topic: "creativity",
    day: "saturday", date: "Sat, Nov 21", time: "11 AM–12:30 PM PT", startsAt: "2026-11-21T11:00:00-08:00",
    format: "In person", place: "Oakland", price: 12, art: "media/workshop.png",
    expectation: "Work with clay at a shared table, then take a turn sharing what you noticed. Come as you are. The sample gathering lasts 90 minutes.",
  },
  {
    id: "stories", name: "Neighborhood Story Exchange", topic: "community",
    day: "sunday", date: "Sun, Nov 22", time: "3–4 PM PT", startsAt: "2026-11-22T15:00:00-08:00",
    format: "In person", place: "Berkeley", price: 0, art: "media/story-flyer.png",
    expectation: "Bring a neighborhood story if you have one. We’ll take turns sharing short stories. You can listen the whole time.",
  },
  {
    id: "reading", name: "Sunday Reading Circle", topic: "reading",
    day: "sunday", date: "Sun, Nov 22", time: "5–6 PM PT", startsAt: "2026-11-22T17:00:00-08:00",
    format: "Online", price: 0,
    expectation: "Bring a short passage to read, or come to listen. We’ll make room for a few minutes of reflection after each reading.",
  },
];
