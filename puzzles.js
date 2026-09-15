// puzzles.js
// Each puzzle has a THEME and a list of words that all relate to it —
// this is the real WordSalad mechanic: a themed set of hidden words,
// not a single scrambled word. Viewers guess theme words in chat;
// correct guesses are revealed and highlighted on the shared grid.
//
// Word length increases with difficulty, matching the real game's
// progression: Easy = 3-5 letters, Medium = 5-7 letters, Hard = 7-9 letters.

module.exports = {
  easy: [ // 3-5 letters
    { theme: "Fruits", words: ["mango", "grape", "lemon", "plum", "kiwi"] },
    { theme: "Farm Animals", words: ["horse", "sheep", "goat", "duck", "pig"] },
    { theme: "Pizza Toppings", words: ["bacon", "onion", "olive", "basil", "corn"] },
    { theme: "Colors", words: ["green", "black", "white", "brown", "pink"] },
    { theme: "Kitchen Items", words: ["spoon", "plate", "knife", "bowl", "cup"] },
    { theme: "Ocean Animals", words: ["shark", "whale", "squid", "crab", "seal"] },
    { theme: "Breakfast Foods", words: ["toast", "bacon", "syrup", "bagel", "egg"] },
    { theme: "School Supplies", words: ["ruler", "paper", "glue", "pen", "book"] },
  ],
  medium: [ // 5-7 letters
    { theme: "Dog Breeds", words: ["poodle", "beagle", "boxer", "husky", "collie"] },
    { theme: "Greek Mythology", words: ["athena", "hades", "apollo", "hermes", "medusa"] },
    { theme: "US States", words: ["texas", "idaho", "maine", "nevada", "oregon"] },
    { theme: "Musical Instruments", words: ["guitar", "violin", "trumpet", "flute", "piano"] },
    { theme: "Card Games", words: ["poker", "bridge", "rummy", "hearts", "euchre"] },
    { theme: "Board Games", words: ["chess", "sorry", "trouble", "yahtzee", "taboo"] },
    { theme: "Types Of Pasta", words: ["penne", "rotini", "ravioli", "gnocchi", "fusilli"] },
    { theme: "Superheroes", words: ["batman", "flash", "storm", "robin", "cyclops"] },
  ],
  hard: [ // 7-9 letters
    { theme: "Chemical Elements", words: ["hydrogen", "nitrogen", "fluorine", "chlorine", "platinum"] },
    { theme: "Shakespeare Plays", words: ["macbeth", "othello", "tempest", "cymbeline", "pericles"] },
    { theme: "World Capitals", words: ["nairobi", "jakarta", "canberra", "budapest", "singapore"] },
    { theme: "Constellations", words: ["pegasus", "cepheus", "hercules", "aquarius", "andromeda"] },
    { theme: "Programming Languages", words: ["assembly", "haskell", "fortran", "clojure", "graphql"] },
    { theme: "Classical Composers", words: ["debussy", "sibelius", "paganini", "beethoven", "schubert"] },
    { theme: "Extinct Animals", words: ["mammoth", "aurochs", "thylacine", "megalodon"] },
    { theme: "Renaissance Artists", words: ["raphael", "donatello", "bellini", "giorgione"] },
  ],
};
