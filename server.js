// =============================================================
// WordSalad Live — server.js
// A TikTok LIVE-powered themed word-search game (the real WordSalad
// mechanic): each round shows a theme and a letter grid; several
// theme-related words are hidden in the grid. Viewers find them by
// typing the word as a normal TikTok LIVE comment. This single file
// runs the whole backend: the web server, the real-time connection to
// the game screens, the TikTok LIVE chat connection, and game logic.
// =============================================================

require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const tiktokLib = require("tiktok-live-connector");
const PUZZLES = require("./puzzles");
const { generatePuzzleGrid } = require("./grid-generator");

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
  connection: {
    mode: "idle",           // idle | connecting | live | test | error
    tiktokUsername: null,
    statusMessage: "Not connected yet.",
    eventCount: 0,          // increments on EVERY raw chat event, matched or not
    lastReceived: null,     // { user, text, time }
    rawSamplesLogged: 0,    // how many raw samples we've captured (cap at 5)
  },
  game: {
    status: "waiting",      // waiting | playing | roundEnd
    difficulty: "easy",
    theme: null,
    gridSize: 0,
    grid: null,             // 2D array of letters
    words: [],              // [{ word, length, cells, found, foundBy, points, hintMask }]
    hintsUsed: 0,
    roundStartedAt: null,
    timeLimitSeconds: 90,
    timeLeft: 90,
    usedThemes: [],
    comboCount: 0,          // consecutive finds within the combo window
    lastFindAt: 0,
    bestCombo: 0,
  },
  leaderboard: {},          // { username: { score, name } }
  feed: [],                 // recent chat feed, most recent first, capped
  settings: {
    autoAdvanceDelaySeconds: 3,     // pause after a round ends before the next one starts
    leaderboardDisplaySeconds: 3,   // how long the post-round recap + leaderboard shows
  },
};

const COMBO_WINDOW_SECONDS = 14;

// -------------------------------------------------------------
// 1b. DUPLICATE-EVENT PROTECTION
// TikTok's unofficial connection can occasionally redeliver the same
// chat message more than once (a known quirk of the underlying
// reverse-engineered library, especially around reconnects). Without
// this, one viewer's single comment could be processed 2-3 times.
// We dedupe on the platform's own message id when it's present, and
// fall back to a short same-text/same-user time window otherwise.
// -------------------------------------------------------------
const recentMsgIds = new Set();
const recentMsgIdOrder = [];
const MAX_MSGID_CACHE = 300;
let recentTextSignatures = []; // [{ sig, time }]
const DEDUP_TEXT_WINDOW_MS = 4000;

function resetDedupCaches() {
  recentMsgIds.clear();
  recentMsgIdOrder.length = 0;
  recentTextSignatures = [];
}

function isDuplicateEvent(rawData, username, text) {
  const msgId = getFirst(rawData, ["msgId", "common.msgId", "data.msgId", "data.common.msgId", "messageId"]);
  if (msgId) {
    const key = String(msgId);
    if (recentMsgIds.has(key)) return true;
    recentMsgIds.add(key);
    recentMsgIdOrder.push(key);
    if (recentMsgIdOrder.length > MAX_MSGID_CACHE) {
      recentMsgIds.delete(recentMsgIdOrder.shift());
    }
    return false;
  }
  const now = Date.now();
  const sig = username + "\u0001" + (text || "").trim().toLowerCase();
  recentTextSignatures = recentTextSignatures.filter((e) => now - e.time <= DEDUP_TEXT_WINDOW_MS);
  const isDup = recentTextSignatures.some((e) => e.sig === sig);
  recentTextSignatures.push({ sig, time: now });
  return isDup;
}

function comboMultiplier(count) {
  if (count >= 4) return 1.5;
  if (count === 3) return 1.3;
  if (count === 2) return 1.15;
  return 1;
}

let roundTimer = null;
let autoAdvanceTimer = null;
let testModeTimer = null;
let tiktokConnection = null;

const DIFFICULTY_SETTINGS = {
  easy:   { gridSize: 5, timeLimit: 70,  basePoints: 8,  perLetter: 1, timeDecay: 0.12, hintPenalty: 1 },
  medium: { gridSize: 6, timeLimit: 95,  basePoints: 12, perLetter: 1, timeDecay: 0.10, hintPenalty: 2 },
  hard:   { gridSize: 7, timeLimit: 125, basePoints: 16, perLetter: 1, timeDecay: 0.08, hintPenalty: 2 },
};

// -------------------------------------------------------------
// 2. HELPERS
// -------------------------------------------------------------
function broadcastState() {
  io.emit("state", buildPublicState());
}

function buildPublicState() {
  const g = state.game;
  return {
    connection: state.connection,
    settings: state.settings,
    game: {
      status: g.status,
      difficulty: g.difficulty,
      theme: g.theme,
      gridSize: g.gridSize,
      grid: g.grid,
      words: g.words.map((w) => ({
        length: w.length,
        found: w.found,
        foundBy: w.foundBy,
        cells: w.found ? w.cells : null,     // only reveal the path once found
        word: w.found ? w.word : null,        // only reveal the word once found
        hint: buildHintString(w),
      })),
      wordsFound: g.words.filter((w) => w.found).length,
      wordsTotal: g.words.length,
      clearedGrid: g.grid ? computeClearedGrid(g.gridSize, g.words) : null,
      combo: { count: g.comboCount, multiplier: comboMultiplier(g.comboCount) },
      timeLeft: g.timeLeft,
      timeLimitSeconds: g.timeLimitSeconds,
    },
    leaderboard: getTopN(10),
    feed: state.feed.slice(0, 30),
  };
}

function buildHintString(w) {
  if (w.found) return w.word;
  return w.hintMask.map((revealed, i) => (revealed ? w.word[i] : "_")).join("");
}

function getTopN(n) {
  return Object.entries(state.leaderboard)
    .map(([username, v]) => ({ username, score: v.score, name: v.name || username }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// The real WordSalad mechanic: letters can belong to more than one
// hidden word. A tile only disappears once every word that uses it has
// been found -- not the moment any single word is found. This computes
// which cells are fully used ("cleared") for the current word list.
function computeClearedGrid(gridSize, words) {
  const usedByAnyWord = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
  const remainingUsers = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  words.forEach((w) => {
    w.cells.forEach(([r, c]) => {
      usedByAnyWord[r][c] = true;
      if (!w.found) remainingUsers[r][c]++;
    });
  });
  return Array.from({ length: gridSize }, (_, r) =>
    Array.from({ length: gridSize }, (_, c) => usedByAnyWord[r][c] && remainingUsers[r][c] === 0)
  );
}

function broadcastDiagnostic(level, message) {
  io.emit("diagnostic", { level, message, time: Date.now() });
}

function pushFeed(entry) {
  state.feed.unshift(entry);
  if (state.feed.length > 50) state.feed.pop();
}

function pickPuzzle(difficulty) {
  const bank = PUZZLES[difficulty] || PUZZLES.easy;
  const unused = bank.filter((p) => !state.game.usedThemes.includes(p.theme));
  const pool = unused.length ? unused : bank;
  if (!unused.length) state.game.usedThemes = [];
  const puzzle = pool[Math.floor(Math.random() * pool.length)];
  state.game.usedThemes.push(puzzle.theme);
  return puzzle;
}

// -------------------------------------------------------------
// 3. ROUND / GAME LOGIC
// -------------------------------------------------------------
function startRound() {
  clearInterval(roundTimer);
  clearTimeout(autoAdvanceTimer);

  const settings = DIFFICULTY_SETTINGS[state.game.difficulty] || DIFFICULTY_SETTINGS.easy;
  const puzzle = pickPuzzle(state.game.difficulty);
  const { grid, placements, size } = generatePuzzleGrid(puzzle.words, settings.gridSize);

  state.game.status = "playing";
  state.game.theme = puzzle.theme;
  state.game.gridSize = size;
  state.game.grid = grid;
  state.game.hintsUsed = 0;
  state.game.roundStartedAt = Date.now();
  state.game.comboCount = 0;
  state.game.lastFindAt = 0;
  state.game.bestCombo = 0;
  state.game.timeLimitSeconds = settings.timeLimit;
  state.game.timeLeft = settings.timeLimit;
  state.game.words = puzzle.words.map((word) => {
    const upper = word.toUpperCase();
    return {
      word: upper,
      length: upper.length,
      cells: placements[upper] || [],
      found: false,
      foundBy: null,
      points: 0,
      hintMask: new Array(upper.length).fill(false),
    };
  });

  pushFeed({ type: "system", text: `New puzzle: "${puzzle.theme}" — find ${state.game.words.length} hidden words!`, time: Date.now() });
  broadcastState();

  let secondsElapsed = 0;
  roundTimer = setInterval(() => {
    try {
      secondsElapsed++;
      state.game.timeLeft = Math.max(0, settings.timeLimit - secondsElapsed);

      if (state.game.timeLeft <= 0) {
        endRound("timeout");
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
  if (g.status !== "playing") return;
  const candidates = g.words.filter((w) => {
    if (w.found) return false;
    const hiddenCount = w.hintMask.filter((h) => !h).length;
    return hiddenCount > 1; // always leave at least 1 letter hidden per word
  });
  if (!candidates.length) return;
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const hiddenIdx = target.hintMask
    .map((revealed, i) => (revealed ? -1 : i))
    .filter((i) => i !== -1);
  const idx = hiddenIdx[Math.floor(Math.random() * hiddenIdx.length)];
  target.hintMask[idx] = true;
  g.hintsUsed++;
}

function endRound(reason) {
  clearInterval(roundTimer);
  const g = state.game;
  g.status = "roundEnd";

  if (reason === "timeout") {
    const remaining = g.words.filter((w) => !w.found);
    remaining.forEach((w) => { w.found = true; w.foundBy = null; });
    pushFeed({
      type: "system",
      text: remaining.length
        ? `⏱️ Time's up! The remaining word${remaining.length > 1 ? "s were" : " was"}: ${remaining.map((w) => w.word).join(", ")}.`
        : "⏱️ Time's up!",
      time: Date.now(),
    });
  } else {
    const comboNote = g.bestCombo >= 2 ? ` (best combo x${comboMultiplier(g.bestCombo)})` : "";
    pushFeed({ type: "win", text: `🎉 Puzzle cleared! Great teamwork, chat!${comboNote}`, time: Date.now() });
  }

  const recap = g.words
    .filter((w) => w.foundBy)
    .map((w) => ({ word: w.word, foundBy: w.foundBy, points: w.points }));

  broadcastState();
  io.emit("puzzleComplete", {
    cleared: reason === "cleared",
    bestCombo: g.bestCombo,
    recap,
    theme: g.theme,
    leaderboard: getTopN(10),
    leaderboardDisplaySeconds: state.settings.leaderboardDisplaySeconds,
  });

  // Automatically move on after a short pause so the show keeps
  // flowing; the host can also press "Next Puzzle" any time sooner.
  autoAdvanceTimer = setTimeout(() => startRound(), state.settings.autoAdvanceDelaySeconds * 1000);
}

function computeWordScore(settings, word, hintsUsedAtGuessTime, elapsedSeconds) {
  const base = settings.basePoints + word.length * settings.perLetter;
  const timePenalty = Math.min(elapsedSeconds * settings.timeDecay, base * 0.5);
  const hintPenalty = hintsUsedAtGuessTime * settings.hintPenalty;
  return Math.max(3, Math.round(base - timePenalty - hintPenalty));
}

function handleGuess(username, displayName, rawText) {
  const g = state.game;
  if (g.status !== "playing") return false;
  const guess = (rawText || "").trim().toLowerCase();
  if (!guess) return false;

  const target = g.words.find((w) => !w.found && w.word.toLowerCase() === guess);
  if (!target) return false;

  const settings = DIFFICULTY_SETTINGS[g.difficulty] || DIFFICULTY_SETTINGS.easy;
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - g.roundStartedAt) / 1000);
  const basePoints = computeWordScore(settings, target.word, g.hintsUsed, elapsedSeconds);

  // Combo: consecutive finds within the window build a streak multiplier.
  const withinWindow = g.lastFindAt && (now - g.lastFindAt) / 1000 <= COMBO_WINDOW_SECONDS;
  g.comboCount = withinWindow ? g.comboCount + 1 : 1;
  g.lastFindAt = now;
  g.bestCombo = Math.max(g.bestCombo, g.comboCount);
  const multiplier = comboMultiplier(g.comboCount);
  const points = Math.round(basePoints * multiplier);

  target.found = true;
  target.foundBy = displayName || username;
  target.points = points;

  if (!state.leaderboard[username]) state.leaderboard[username] = { score: 0, name: displayName };
  state.leaderboard[username].score += points;
  state.leaderboard[username].name = displayName || username;

  const comboTag = multiplier > 1 ? ` 🔥 combo x${multiplier}` : "";
  pushFeed({ type: "win", text: `✅ ${target.foundBy} found "${target.word}" (+${points} pts)${comboTag}`, time: Date.now() });
  io.emit("wordFound", { word: target.word, foundBy: target.foundBy, points, comboCount: g.comboCount, multiplier });

  const allFound = g.words.every((w) => w.found);
  if (allFound) {
    endRound("cleared");
  } else {
    broadcastState();
  }
  return true;
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
    "uniqueId", "userId",
    "user.uniqueId", "user.uniqueid", "user.userId", "user.id",
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
    const username = extractUsername(rawData) || "unknown";
    const displayName = extractDisplayName(rawData);
    const text = extractComment(rawData) || "";

    if (isDuplicateEvent(rawData, username, text)) return; // same message redelivered -- ignore it

    state.connection.eventCount++;

    // Requirement: log the FULL raw shape of the first few incoming
    // messages so we can see the real field names, not the documented
    // ones. Shown right on the host screen, not just server logs.
    if (state.connection.rawSamplesLogged < 5) {
      state.connection.rawSamplesLogged++;
      console.log(`[RAW SAMPLE #${state.connection.rawSamplesLogged}]`, JSON.stringify(rawData));
      broadcastDiagnostic(
        "raw",
        `Raw sample #${state.connection.rawSamplesLogged}: ${JSON.stringify(rawData).slice(0, 800)}`
      );
    }

    state.connection.lastReceived = { user: displayName, text, time: Date.now() };
    pushFeed({ type: "chat", user: displayName, text, time: Date.now() });

    const matched = handleGuess(username, displayName, text);
    if (!matched) broadcastState();
  } catch (err) {
    // One bad message must never crash the server.
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
  resetDedupCaches();
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
const FAKE_CHATTER = ["hi!", "this is fun", "hmm let me think", "lol", "gogogo", "not sure", "🔥🔥🔥", "wait i see one"];

function startTestMode() {
  stopTestMode();
  state.connection.mode = "test";
  state.connection.tiktokUsername = null;
  state.connection.statusMessage = "🧪 Test Mode running — simulated viewers are commenting.";
  state.connection.eventCount = 0;
  resetDedupCaches();
  state.connection.rawSamplesLogged = 0;
  broadcastState();

  testModeTimer = setInterval(() => {
    try {
      const user = FAKE_USERS[Math.floor(Math.random() * FAKE_USERS.length)];
      let text;
      const g = state.game;
      const unfound = g.status === "playing" ? g.words.filter((w) => !w.found) : [];
      if (unfound.length && Math.random() < 0.18) {
        text = unfound[Math.floor(Math.random() * unfound.length)].word;
      } else {
        text = FAKE_CHATTER[Math.floor(Math.random() * FAKE_CHATTER.length)];
      }
      processIncomingChat({ uniqueId: user, nickname: user, comment: text }, "testmode");
    } catch (err) {
      console.error("[testMode] error:", err);
    }
  }, 1200);
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

  socket.on("host:updateSettings", (payload) => {
    const clamp = (n, min, max, fallback) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return fallback;
      return Math.min(max, Math.max(min, Math.round(v)));
    };
    if (payload && payload.autoAdvanceDelaySeconds !== undefined) {
      state.settings.autoAdvanceDelaySeconds = clamp(payload.autoAdvanceDelaySeconds, 1, 30, state.settings.autoAdvanceDelaySeconds);
    }
    if (payload && payload.leaderboardDisplaySeconds !== undefined) {
      state.settings.leaderboardDisplaySeconds = clamp(payload.leaderboardDisplaySeconds, 1, 30, state.settings.leaderboardDisplaySeconds);
    }
    broadcastState();
  });

  socket.on("host:sendMessage", (payload) => {
    const text = (payload && payload.text || "").trim();
    if (!text) return;
    pushFeed({ type: "host", user: "HOST", text, time: Date.now() });
    io.emit("hostMessage", { text, time: Date.now() });
  });

  socket.on("disconnect", () => {});
});

// -------------------------------------------------------------
// 8. START SERVER
// -------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`WordSalad Live server running on port ${PORT}`);
});
