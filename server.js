// =============================================================
// WordSalad Live — server.js
// A TikTok LIVE-powered word guessing game.
// This single file runs the whole backend: the web server, the
// real-time connection to the game screens, the TikTok LIVE
// chat connection, and the game logic.
// =============================================================

require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const tiktokLib = require("tiktok-live-connector");
const WORDS = require("./words");

// The tiktok-live-connector library has renamed its main class before
// (WebcastPushConnection -> TikTokLiveConnection) and may do so again.
// Rather than hardcode one name, grab whichever one actually exists.
const TikTokConnectionClass =
  tiktokLib.TikTokLiveConnection ||
  tiktokLib.WebcastPushConnection ||
  tiktokLib.default;
if (!TikTokConnectionClass) {
  console.error("[startup] Could not find a usable class in tiktok-live-connector. Real TikTok connections will fail, but Test Mode will still work.");
}
// Some versions expose event names as strings ('chat'), others as an
// enum (WebcastEvent.CHAT). Prefer the enum when present, fall back to the string.
const CHAT_EVENT_NAME = (tiktokLib.WebcastEvent && tiktokLib.WebcastEvent.CHAT) || "chat";

// -------------------------------------------------------------
// 0. BASIC SETUP
// -------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.redirect("/host.html"));

const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------
// 0b. SAFETY NET — never let one bad message take the whole
// server down. These two handlers are the last line of defense.
// -------------------------------------------------------------
process.on("uncaughtException", (err) => {
  console.error("[SAFETY NET] Uncaught exception:", err);
  broadcastDiagnostic("error", "Something went wrong internally, but the server kept running: " + safeMsg(err));
});
process.on("unhandledRejection", (err) => {
  console.error("[SAFETY NET] Unhandled rejection:", err);
  broadcastDiagnostic("error", "A background task failed, but the server kept running: " + safeMsg(err));
});
function safeMsg(err) {
  try { return (err && err.message) ? err.message : String(err); } catch (e) { return "unknown error"; }
}

// -------------------------------------------------------------
// 1. GAME STATE
// -------------------------------------------------------------
const state = {
  // connection info
  connection: {
    mode: "idle",           // idle | connecting | live | test | error
    tiktokUsername: null,
    statusMessage: "Not connected yet.",
    eventCount: 0,          // increments on EVERY raw chat event, matched or not
    lastReceived: null,     // { user, text, time }
    rawSamplesLogged: 0,    // how many raw samples we've captured (cap at 5)
  },
  // game info
  game: {
    status: "waiting",      // waiting | playing | roundEnd
    difficulty: "easy",
    currentWord: null,
    scrambled: null,
    revealedMask: null,     // array of booleans, one per letter
    hintsUsed: 0,
    roundStartedAt: null,
    timeLimitSeconds: 45,
    timeLeft: 45,
    usedWords: [],
  },
  leaderboard: {},          // { username: { score, name } }
  feed: [],                 // recent chat feed, most recent first, capped
};

let roundTimer = null;
let testModeTimer = null;
let tiktokConnection = null;

const DIFFICULTY_SETTINGS = {
  easy:   { basePoints: 60,  timeLimit: 40, hintEvery: 8  },
  medium: { basePoints: 100, timeLimit: 55, hintEvery: 10 },
  hard:   { basePoints: 160, timeLimit: 75, hintEvery: 12 },
};

// -------------------------------------------------------------
// 2. HELPERS
// -------------------------------------------------------------
function broadcastState() {
  io.emit("state", buildPublicState());
}

function buildPublicState() {
  const g = state.game;
  let display = null;
  if (g.currentWord) {
    display = g.currentWord
      .split("")
      .map((ch, i) => (g.revealedMask[i] ? ch : "_"))
      .join(" ");
  }
  return {
    connection: state.connection,
    game: {
      status: g.status,
      difficulty: g.difficulty,
      scrambled: g.scrambled,
      display,
      wordLength: g.currentWord ? g.currentWord.length : 0,
      hintsUsed: g.hintsUsed,
      timeLeft: g.timeLeft,
      timeLimitSeconds: g.timeLimitSeconds,
    },
    leaderboard: getTopN(10),
    feed: state.feed.slice(0, 30),
  };
}

function getTopN(n) {
  return Object.entries(state.leaderboard)
    .map(([username, v]) => ({ username, score: v.score, name: v.name || username }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function broadcastDiagnostic(level, message) {
  io.emit("diagnostic", { level, message, time: Date.now() });
}

function pushFeed(entry) {
  state.feed.unshift(entry);
  if (state.feed.length > 50) state.feed.pop();
}

function scrambleWord(word) {
  let letters = word.split("");
  let attempt = 0;
  let result;
  do {
    result = [...letters].sort(() => Math.random() - 0.5).join("");
    attempt++;
  } while (result === word && attempt < 10);
  return result;
}

function pickNextWord(difficulty) {
  const bank = WORDS[difficulty] || WORDS.easy;
  const unused = bank.filter((w) => !state.game.usedWords.includes(w));
  const pool = unused.length ? unused : bank; // reset if we've used them all
  if (!unused.length) state.game.usedWords = [];
  const word = pool[Math.floor(Math.random() * pool.length)];
  state.game.usedWords.push(word);
  return word;
}

// -------------------------------------------------------------
// 3. ROUND / GAME LOGIC
// -------------------------------------------------------------
function startRound() {
  clearInterval(roundTimer);
  const settings = DIFFICULTY_SETTINGS[state.game.difficulty] || DIFFICULTY_SETTINGS.easy;
  const word = pickNextWord(state.game.difficulty);

  state.game.status = "playing";
  state.game.currentWord = word;
  state.game.scrambled = scrambleWord(word);
  state.game.revealedMask = word.split("").map(() => false);
  state.game.hintsUsed = 0;
  state.game.roundStartedAt = Date.now();
  state.game.timeLimitSeconds = settings.timeLimit;
  state.game.timeLeft = settings.timeLimit;

  pushFeed({ type: "system", text: `New round started! Word has ${word.length} letters.`, time: Date.now() });
  broadcastState();

  let secondsElapsed = 0;
  roundTimer = setInterval(() => {
    try {
      secondsElapsed++;
      state.game.timeLeft = Math.max(0, settings.timeLimit - secondsElapsed);

      // auto-reveal a hint letter periodically
      if (secondsElapsed % settings.hintEvery === 0) {
        revealOneHintLetter();
      }

      if (state.game.timeLeft <= 0) {
        endRound(null); // nobody guessed in time
      } else {
        broadcastState();
      }
    } catch (err) {
      console.error("[roundTimer] error:", err);
    }
  }, 1000);
}

function revealOneHintLetter() {
  const g = state.game;
  if (!g.currentWord) return;
  const hidden = g.revealedMask
    .map((revealed, i) => (revealed ? -1 : i))
    .filter((i) => i !== -1);
  if (hidden.length <= 1) return; // always leave at least 1 letter hidden
  const idx = hidden[Math.floor(Math.random() * hidden.length)];
  g.revealedMask[idx] = true;
  g.hintsUsed++;
}

function endRound(winner) {
  clearInterval(roundTimer);
  const g = state.game;
  const word = g.currentWord;
  g.status = "roundEnd";

  if (winner) {
    pushFeed({ type: "win", text: `🎉 ${winner.name} guessed it! The word was "${word}" (+${winner.points} pts)`, time: Date.now() });
  } else {
    pushFeed({ type: "system", text: `⏱️ Time's up! The word was "${word}".`, time: Date.now() });
  }
  io.emit("roundResult", { winner, word });
  broadcastState();
}

function computeScore(settings, elapsedSeconds, hintsUsed) {
  const timePenalty = Math.min(elapsedSeconds * 2, settings.basePoints * 0.5);
  const hintPenalty = hintsUsed * 15;
  return Math.max(15, Math.round(settings.basePoints - timePenalty - hintPenalty));
}

function handleGuess(username, displayName, rawText) {
  const g = state.game;
  if (g.status !== "playing" || !g.currentWord) return false;
  const guess = (rawText || "").trim().toLowerCase();
  if (!guess) return false;
  if (guess === g.currentWord.toLowerCase()) {
    const settings = DIFFICULTY_SETTINGS[g.difficulty] || DIFFICULTY_SETTINGS.easy;
    const elapsedSeconds = Math.floor((Date.now() - g.roundStartedAt) / 1000);
    const points = computeScore(settings, elapsedSeconds, g.hintsUsed);

    if (!state.leaderboard[username]) state.leaderboard[username] = { score: 0, name: displayName };
    state.leaderboard[username].score += points;
    state.leaderboard[username].name = displayName || username;

    endRound({ username, name: displayName || username, points });
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// 4. FIELD EXTRACTION — never trust one hardcoded field name.
// TikTok's reverse-engineered event shape changes between
// library versions, so we check every plausible path.
// -------------------------------------------------------------
function getFirst(obj, paths) {
  for (const p of paths) {
    try {
      const parts = p.split(".");
      let cur = obj;
      for (const part of parts) {
        if (cur == null) break;
        cur = cur[part];
      }
      if (cur !== undefined && cur !== null && cur !== "") return cur;
    } catch (e) {
      // ignore and try next path
    }
  }
  return null;
}

function extractComment(data) {
  return getFirst(data, [
    "comment", "text", "content", "message",
    "data.comment", "data.text",
  ]);
}

function extractUsername(data) {
  return getFirst(data, [
    // v1-style flat fields
    "uniqueId", "userId",
    // v2-style, nested under "user"
    "user.uniqueId", "user.uniqueid", "user.userId", "user.id",
    // other possible wrappers seen across versions/forks
    "author.uniqueId", "data.uniqueId", "data.user.uniqueId",
  ]);
}

function extractDisplayName(data) {
  return getFirst(data, [
    "nickname", "user.nickname", "user.nickName", "displayName",
    "author.nickname", "data.nickname", "data.user.nickname",
  ]) || extractUsername(data) || "viewer";
}

// -------------------------------------------------------------
// 5. TIKTOK LIVE CONNECTION
// -------------------------------------------------------------
function processIncomingChat(rawData, source) {
  try {
    state.connection.eventCount++;

    // Requirement #1: log the FULL raw shape of the first few
    // incoming messages so we can see the real field names,
    // not the documented ones. Shown right on the host screen.
    if (state.connection.rawSamplesLogged < 5) {
      state.connection.rawSamplesLogged++;
      console.log(`[RAW SAMPLE #${state.connection.rawSamplesLogged}]`, JSON.stringify(rawData));
      broadcastDiagnostic(
        "raw",
        `Raw sample #${state.connection.rawSamplesLogged}: ${JSON.stringify(rawData).slice(0, 800)}`
      );
    }

    const username = extractUsername(rawData) || "unknown";
    const displayName = extractDisplayName(rawData);
    const text = extractComment(rawData) || "";

    state.connection.lastReceived = { user: displayName, text, time: Date.now() };

    pushFeed({ type: "chat", user: displayName, text, time: Date.now() });

    const matched = handleGuess(username, displayName, text);
    if (!matched) broadcastState();
  } catch (err) {
    // Requirement #5: one bad message must never crash the server.
    console.error(`[processIncomingChat:${source}] error:`, err);
    broadcastDiagnostic("error", "A chat message caused an error but was safely skipped.");
  }
}

async function connectToTikTok(username, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  state.connection.mode = "connecting";
  state.connection.tiktokUsername = username;
  state.connection.statusMessage = `Connecting to @${username} (attempt ${attempt} of ${MAX_ATTEMPTS})...`;
  state.connection.eventCount = 0;
  state.connection.rawSamplesLogged = 0;
  broadcastState();

  try {
    if (tiktokConnection) {
      try { tiktokConnection.disconnect(); } catch (e) {}
    }

    if (!TikTokConnectionClass) {
      throw new Error("The tiktok-live-connector library did not load correctly (no connection class found).");
    }

    const options = {};
    if (process.env.EULERSTREAM_API_KEY) {
      options.signApiKey = process.env.EULERSTREAM_API_KEY;
    }

    tiktokConnection = new TikTokConnectionClass(username, options);

    tiktokConnection.on(CHAT_EVENT_NAME, (data) => processIncomingChat(data, "chat"));

    tiktokConnection.on("streamEnd", () => {
      state.connection.statusMessage = "The TikTok LIVE stream ended.";
      state.connection.mode = "idle";
      broadcastState();
    });

    tiktokConnection.on("disconnected", () => {
      if (state.connection.mode === "live") {
        state.connection.statusMessage = "Disconnected from TikTok LIVE.";
        state.connection.mode = "idle";
        broadcastState();
      }
    });

    tiktokConnection.on("error", (err) => {
      console.error("[tiktokConnection:error]", err);
      broadcastDiagnostic("error", "TikTok connection reported an error: " + safeMsg(err));
    });

    await tiktokConnection.connect();

    state.connection.mode = "live";
    state.connection.statusMessage = `✅ Connected! Reading live chat from @${username}.`;
    broadcastState();
  } catch (err) {
    console.error(`[connectToTikTok] attempt ${attempt} failed:`, err);
    if (attempt < MAX_ATTEMPTS) {
      const backoffMs = attempt * 2000;
      state.connection.statusMessage = `Connection attempt ${attempt} failed. Retrying in ${backoffMs / 1000}s...`;
      broadcastState();
      setTimeout(() => connectToTikTok(username, attempt + 1), backoffMs);
    } else {
      state.connection.mode = "error";
      state.connection.statusMessage =
        "Could not connect after 3 tries. Common causes: the account is not currently LIVE, the username is misspelled, or the sign-in key (EulerStream) is missing/invalid. " +
        friendlyErrorHint(err);
      broadcastState();
    }
  }
}

function friendlyErrorHint(err) {
  const msg = safeMsg(err).toLowerCase();
  if (msg.includes("live") || msg.includes("offline")) return "That account does not look like it is live right now.";
  if (msg.includes("sign") || msg.includes("key") || msg.includes("401") || msg.includes("403")) return "This usually means the EulerStream sign-in key is missing or incorrect.";
  return "";
}

function disconnectTikTok() {
  if (tiktokConnection) {
    try { tiktokConnection.disconnect(); } catch (e) {}
  }
  tiktokConnection = null;
  state.connection.mode = "idle";
  state.connection.statusMessage = "Disconnected.";
  broadcastState();
}

// -------------------------------------------------------------
// 6. TEST MODE — fully self-contained, no external connection,
// no TikTok login needed. Simulates viewers commenting.
// -------------------------------------------------------------
const FAKE_USERS = ["alex_98", "gamerqueen", "tiktok_fan22", "wordwiz", "night_owl", "sunnyday", "quickfox", "letterluv"];
const FAKE_CHATTER = ["hi!", "this is fun", "hmm let me think", "lol", "gogogo", "not sure", "🔥🔥🔥"];

function startTestMode() {
  stopTestMode();
  state.connection.mode = "test";
  state.connection.tiktokUsername = null;
  state.connection.statusMessage = "🧪 Test Mode running — simulated viewers are commenting.";
  state.connection.eventCount = 0;
  state.connection.rawSamplesLogged = 0;
  broadcastState();

  testModeTimer = setInterval(() => {
    try {
      const user = FAKE_USERS[Math.floor(Math.random() * FAKE_USERS.length)];
      let text;
      // occasionally send a correct guess so scoring can be tested end-to-end
      const g = state.game;
      if (g.status === "playing" && Math.random() < 0.12) {
        text = g.currentWord;
      } else {
        text = FAKE_CHATTER[Math.floor(Math.random() * FAKE_CHATTER.length)];
      }
      processIncomingChat({ uniqueId: user, nickname: user, comment: text }, "testmode");
    } catch (err) {
      console.error("[testMode] error:", err);
    }
  }, 1400);
}

function stopTestMode() {
  clearInterval(testModeTimer);
  testModeTimer = null;
}

// -------------------------------------------------------------
// 7. SOCKET.IO — host controls
// -------------------------------------------------------------
io.on("connection", (socket) => {
  socket.emit("state", buildPublicState());

  socket.on("host:connectTikTok", (payload) => {
    const username = (payload && payload.username || "").trim().replace(/^@/, "");
    if (!username) {
      broadcastDiagnostic("error", "Please enter a TikTok username first.");
      return;
    }
    stopTestMode();
    connectToTikTok(username);
  });

  socket.on("host:disconnectTikTok", () => disconnectTikTok());

  socket.on("host:toggleTestMode", () => {
    if (state.connection.mode === "test") {
      stopTestMode();
      state.connection.mode = "idle";
      state.connection.statusMessage = "Test Mode stopped.";
      broadcastState();
    } else {
      disconnectTikTok();
      startTestMode();
    }
  });

  socket.on("host:setDifficulty", (payload) => {
    const d = payload && payload.difficulty;
    if (["easy", "medium", "hard"].includes(d)) {
      state.game.difficulty = d;
      broadcastState();
    }
  });

  socket.on("host:startGame", () => startRound());
  socket.on("host:nextWord", () => startRound());

  socket.on("host:revealHint", () => {
    revealOneHintLetter();
    broadcastState();
  });

  socket.on("host:resetLeaderboard", () => {
    state.leaderboard = {};
    broadcastState();
  });

  socket.on("host:sendMessage", (payload) => {
    const text = (payload && payload.text || "").trim();
    if (!text) return;
    pushFeed({ type: "host", user: "HOST", text, time: Date.now() });
    broadcastState();
  });

  socket.on("disconnect", () => {});
});

// -------------------------------------------------------------
// 8. START SERVER
// -------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`WordSalad Live server running on port ${PORT}`);
});
