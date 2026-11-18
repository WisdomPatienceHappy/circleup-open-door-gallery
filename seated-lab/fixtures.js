// Synthetic photo fixtures, copied from the existing mobile-circle proposal.
window.SeatFixtures = Object.freeze(
  [
    "You",
    "Maya",
    "Sam",
    "Ana",
    "Noor",
    "Alex",
    "Jordan",
    "Elise",
    "Ben",
    "Priya",
    "Omar",
    "Tessa",
    "Luis",
    "Nia",
    "June",
    "Ramon",
    "Leila",
    "Kit",
  ].map((name, id) =>
    Object.freeze({ id, name, photo: "assets/" + name.toLowerCase() + ".webp" })
  )
);
