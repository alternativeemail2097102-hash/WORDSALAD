// puzzles.js
// Each puzzle has a THEME and a list of words that all relate to it —
// this is the real WordSalad mechanic: a themed set of hidden words,
// not a single scrambled word. Viewers guess theme words in chat;
// correct guesses are revealed and highlighted on the shared grid.

module.exports = {
  easy: [
    { theme: "Fruits", words: ["apple", "mango", "grape", "lemon", "peach"] },
    { theme: "Farm Animals", words: ["horse", "sheep", "goat", "duck", "pig"] },
    { theme: "Pizza Toppings", words: ["cheese", "bacon", "onion", "olive", "basil"] },
    { theme: "Colors", words: ["red", "blue", "green", "black", "white"] },
    { theme: "Kitchen Items", words: ["spoon", "plate", "knife", "bowl", "cup"] },
    { theme: "Ocean Animals", words: ["shark", "whale", "crab", "squid", "seal"] },
    { theme: "Breakfast Foods", words: ["toast", "bacon", "syrup", "waffle", "egg"] },
    { theme: "School Supplies", words: ["pencil", "eraser", "ruler", "paper", "glue"] },
  ],
  medium: [
    { theme: "Dog Breeds", words: ["poodle", "beagle", "boxer", "husky", "collie"] },
    { theme: "Greek Mythology", words: ["zeus", "athena", "hades", "apollo", "hermes"] },
    { theme: "US States", words: ["texas", "idaho", "maine", "nevada", "oregon"] },
    { theme: "Musical Instruments", words: ["guitar", "violin", "trumpet", "flute", "piano"] },
    { theme: "Card Games", words: ["poker", "bridge", "rummy", "hearts", "euchre"] },
    { theme: "Board Games", words: ["chess", "sorry", "risk", "clue", "monopoly"] },
    { theme: "Types Of Pasta", words: ["penne", "fusilli", "ravioli", "linguine", "gnocchi"] },
    { theme: "Superheroes", words: ["batman", "thor", "flash", "hulk", "storm"] },
  ],
  hard: [
    { theme: "Chemical Elements", words: ["helium", "carbon", "sodium", "oxygen", "argon"] },
    { theme: "Shakespeare Plays", words: ["hamlet", "macbeth", "othello", "tempest"] },
    { theme: "World Capitals", words: ["nairobi", "lisbon", "jakarta", "ottawa", "canberra"] },
    { theme: "Constellations", words: ["orion", "lyra", "draco", "pegasus", "cygnus"] },
    { theme: "Programming Languages", words: ["python", "java", "rust", "swift", "ruby"] },
    { theme: "Classical Composers", words: ["mozart", "chopin", "brahms", "handel", "verdi"] },
    { theme: "Extinct Animals", words: ["dodo", "mammoth", "moa", "aurochs", "quagga"] },
    { theme: "Renaissance Artists", words: ["titian", "raphael", "donatello", "bellini"] },
  ],
};
