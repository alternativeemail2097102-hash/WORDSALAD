# WordSalad Live — TikTok LIVE Word Game

A fully-automated themed word-search game for TikTok LIVE, verified
against the real **wordsalad.online** game (official app description +
reviews): each round has a **theme** (like "Pizza Toppings" or "Greek
Mythology") and a grid of letters with several theme-related words
hidden inside it. Your viewers find the hidden words by typing them as
normal TikTok comments — different viewers can find different words in
the same round, so the whole chat works together to clear the board.

Matching the real game exactly:
- A letter that's shared between two hidden words stays on the board
  until **both** words are found — it only disappears once nothing
  else needs it, exactly like the original.
- Found words flash across their letters in sequence (like the
  original's swipe trace) before falling away.
- Word length increases with difficulty: **Easy = 3–5 letters,
  Medium = 5–7, Hard = 7–9** — a real difficulty curve, not just a
  label.
- Clearing the whole board triggers a colorful celebration flourish,
  the same kind of flourish the real game uses on some puzzles.

Scoring is intentionally small (single digits to low twenties per
word) rather than triple-digit point values, so the leaderboard stays
readable and doesn't feel like it's fighting the puzzle for attention.

There's also a **combo system**: words found in quick succession (within
14 seconds of each other) build a streak that boosts points — up to a
×1.5 multiplier at a 4+ streak — shown as a "🔥 x1.5" badge next to the
timer. A short chime plays on every find (a bigger one on a combo, and
a fanfare when the whole board clears) — this is generated in the
browser itself, so there are no sound files to upload. There's a
🔊 Sound On/Off toggle in the ⚙ settings panel if you'd rather it stay
quiet.

### Latest update

- **Fixed a duplicate-guess bug**: TikTok's unofficial connection can
  occasionally redeliver the same chat message more than once (a known
  quirk of the underlying library). The game now recognizes and
  ignores exact repeats, so one viewer's single comment is never
  counted 2-3 times.
- **Fullscreen toggle** — the ⛶ button in the top bar enters/exits
  fullscreen, useful when broadcasting this screen directly.
- **Top-10 news ticker** — a continuously scrolling strip under the top
  bar always shows the top 10 scorers, with 🥇🥈🥉 medals for the top 3.
- **Leaderboard moved off the main screen** — it's now behind the 🏆
  button (view it any time) and automatically appears for a few
  seconds after each round, alongside a recap of who found what for
  how many points, with a celebration animation.
- **The live comments/activity panel has been removed** from the main
  screen to keep things clean and fully visible on one phone screen —
  you can still see the single most recent comment and troubleshoot
  via the ⚙ diagnostics panel.
- **Answer blanks now wrap into as many rows as needed** so every
  hidden word's letter-count is always visible without scrolling.
- **New Timing settings** in the ⚙ panel: "Delay before next round"
  (defaults to 3 seconds) and "Leaderboard display time" (defaults to
  3 seconds), both adjustable live.
- Error/status messages now stay on screen for 9 seconds instead of 6,
  so they're easier to read.

This README assumes **zero coding experience**. Follow it top to bottom.

---

## What you're getting

- `server.js` — the whole backend (connects to TikTok, runs the game)
- `puzzles.js` — the puzzle bank: themes and their hidden words, split
  by difficulty, with word length increasing at each level
- `grid-generator.js` — builds a real word-search grid for each
  puzzle, placing every word along a straight line of connected
  letters (just like the real game)
- `public/theme.css` — the shared visual design system (colors, type,
  buttons, animations) used by every screen
- `public/game-render.js` — the shared game-rendering logic (grid,
  answers, leaderboard, feed) so every screen behaves identically
- `public/audio.js` — tiny synthesized sound effects (no audio files
  needed) for finds, combos, and puzzle-complete
- `public/host.html` — **the one-page app** — open this on your phone.
  It has the full game board plus your controls, all on one screen
  with no scrolling, so a single phone is all you need to both host
  and broadcast.
- `public/display.html` — an optional clean, controls-free version of
  the same board, only useful if you happen to have a *second* screen
  (a monitor, tablet, or OBS browser source) to show your audience —
  you do not need this if you're on one phone.
- Everything else is configuration Render/GitHub need

You will never open or edit any of these files yourself. You'll just
upload the folder and click a few buttons.

---

## The design

The board uses a distinct dark "garden at dusk" palette — deep pine
backgrounds with three purposeful accent colors: leafy green for found
words, warm citrus for the theme title and scores, and soft berry for
host messages and alerts — paired with a characterful serif (Fraunces)
for the theme title and a clean modern sans (Manrope) for everything
else. When a word is found, its letters flash green in sequence
tracing the word's path, then any letters no longer needed by any
other hidden word fall away, revealing the board underneath — exactly
the "watch the letters fall away" mechanic the real game is known for.
Clearing a whole puzzle triggers a brief colorful celebration.

---

## One phone is all you need

Everything — the game board your audience sees, your connection
status, round controls, and live diagnostics — lives on **one page**
(`host.html`), sized to fit a single phone screen with **no
scrolling**. Advanced controls (connecting to TikTok, difficulty,
diagnostics) live behind the small **⚙** button in the top-right,
which slides up a panel without leaving the page — so if you're
broadcasting this screen directly (e.g. via your phone's screen-share
into TikTok LIVE, or propping the phone next to your camera), your
audience always sees the board, and you tap ⚙ only when you need to
change a setting.

---

## Part 1 — Get your TikTok "sign-in key" (EulerStream)

TikTok doesn't officially support this kind of connection, so the game
needs a small third-party service called **EulerStream** to establish
the connection reliably. This is a **required first step** — skipping
it means the game will frequently fail to connect.

1. Go to **https://www.eulerstream.com** and sign up for a free account.
2. Once logged in, find your **API Key** (it'll be on your dashboard —
   look for a button like "Create API Key" or "API Keys").
3. Copy that key somewhere safe (a notes app). You'll paste it into
   Render in Part 4. You will **not** paste it into GitHub.

---

## Part 2 — Put the project on GitHub

1. Go to **https://github.com** and log in.
2. Click the **"+"** icon (top right) → **"New repository"**.
3. Name it something like `wordsalad-tiktok-live`. Leave it **Public**
   or **Private** (either is fine). Do **not** check "Add a README" —
   we already have one. Click **Create repository**.
4. On the new repository's page, click **"uploading an existing file"**
   (a blue link in the middle of the page).
5. Open the project folder you downloaded from this conversation on your
   computer, select **all the files and folders inside it** (not the
   outer folder itself), and drag them into the GitHub upload box.
   - Make sure `server.js`, `words.js`, `package.json`, the `public`
     folder, `render.yaml`, `.gitignore`, and `.env.example` all appear
     in the upload list.
6. Scroll down and click the green **"Commit changes"** button.

Your code is now on GitHub. You never need to touch it directly.

---

## Part 3 — Create the Render web service

1. Go to **https://render.com** and log in.
2. Click **"New +"** → **"Web Service"**.
3. Choose **"Build and deploy from a Git repository"**, then connect
   your GitHub account if asked, and select the `wordsalad-tiktok-live`
   repository you just created.
4. Render will detect the settings automatically (because of the
   included `render.yaml`). Confirm these fields:
   - **Name**: anything you like
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type / Plan**: Free is fine to start
5. **Do not click "Create Web Service" yet** — first go to Part 4 below
   to add your key, then come back and click it.

---

## Part 4 — Add your EulerStream key to Render

Still on the Render "New Web Service" setup page:

1. Find the **"Environment Variables"** section.
2. Click **"Add Environment Variable"**.
3. For **Key**, type exactly: `EULERSTREAM_API_KEY`
4. For **Value**, paste the API key you copied from EulerStream in Part 1.
5. Now click **"Create Web Service"**.

Render will now build and start your game. This takes 2–5 minutes the
first time. You'll see a live log on screen — you can ignore it; the
game itself will tell you if anything's wrong (see Part 6).

When it finishes, Render gives you a web address that looks like:
`https://wordsalad-tiktok-live.onrender.com`

---

## Part 5 — Open your game

Your Render address gives you one main page:

- **`https://YOUR-RENDER-ADDRESS.onrender.com/host.html`**
  Open this on your phone. This is the whole game — the board, the
  theme, the timer, the leaderboard, and your controls (behind the ⚙
  icon) — all on one screen with no scrolling. This is what you'll use
  every stream, and it's the screen you broadcast.

If you ever have a *second* device (a laptop, tablet, or a capture
setup like OBS) and want a clean, controls-free version of the board
for your audience specifically, `display.html` at the same address is
that plain screen — but it's optional, not required.

Bookmark the host.html link. You'll use it every stream.

---

## Part 6 — Using it, step by step

1. **Before going live**, open the game and tap **"🧪 Test Mode"**
   inside the ⚙ settings panel. This simulates fake viewers commenting
   — no TikTok login needed — so you can confirm everything works: tap
   **▶ Start**, watch a theme and grid appear, watch fake guesses find
   words on the board, and confirm the leaderboard updates. Tap
   **Test Mode** again to stop it.
2. **When you go live on TikTok**, tap ⚙, type your TikTok username
   into the box (no `@`), and tap **Connect**. The status pill at the
   top will show what's happening. If it fails, it automatically
   retries a couple of times before showing a plain-English reason.
3. In the same ⚙ panel, pick a **difficulty** (Easy / Medium / Hard) —
   this controls the grid size and word length (Easy = 3–5 letters,
   Medium = 5–7, Hard = 7–9).
4. Tap **▶ Start**. The board shows the theme and letter grid; your
   audience types a word they think is hidden in the grid as a TikTok
   comment. Different viewers can find different words in the same
   round — the whole chat works together.
5. As each word is found, its letters flash green in sequence tracing
   the word, then fall away once nothing else needs them — a letter
   shared by two words stays until *both* are found, exactly like the
   real game. While playing, the strip under the top bar shows a
   continuously scrolling ticker of the top 10 scorers (🥇🥈🥉 for the
   top 3). The round ends automatically once every word is found or
   time runs out; either way, a celebration screen pops up recapping
   who found what for how many points, then shows the leaderboard for
   a few seconds (3 by default — adjustable in ⚙ → Timing) before the
   next puzzle starts on its own — you can also open ⚙ and tap
   **⏭ Skip to Next Puzzle** any time.
6. Tap **💡** any time to reveal one extra letter of a still-hidden
   word — useful if chat is stuck.
7. Use the **message box at the bottom** to type anything yourself —
   it pops up as a bold banner across the top of the screen for a few
   seconds, visible to your audience too.
8. Tap **🏆** at the top any time to check the full leaderboard on
   demand — tap ✕ to close it. Reset the leaderboard from the ⚙ panel.
9. Tap **⛶** to enter or exit fullscreen — handy if you're broadcasting
   this screen directly.

---

## Understanding the diagnostics (so you never need to "debug")

The ⚙ settings panel has a **"Live diagnostics"** section right below the connect
button:

- **Events received** — a number that goes up every single time a chat
  message arrives, whether the game understood it or not. If this stays
  at 0 while you're live and people are commenting, the connection
  itself isn't receiving anything (check you typed your username
  correctly, and that you are actually LIVE on TikTok, not just
  recording).
- **Last received** — shows the very last comment the game saw, exactly
  as it understood it (`username: text`). If this updates but scores
  never do, the words being typed just aren't matching any of the
  current puzzle's hidden words.
- **Raw message samples** — an expandable section showing the first 5
  messages exactly as TikTok sent them, in full detail. You'll never
  need this normally — it's there in case something looks broken and
  you want to see, in plain view, exactly what the game is receiving.

If anything goes wrong elsewhere, a small message banner pops up at the
top of the screen in plain English — you never need to check
Render's server logs.

---

## Good to know / limitations

- **Free Render plans "sleep"** after periods of inactivity and take
  ~30–60 seconds to wake back up on the next visit. If you're going
  live on a schedule, open both links a couple of minutes early so the
  service is already awake, or upgrade to a paid Render plan for
  always-on hosting.
- **The leaderboard resets** if the Render service restarts (e.g. after
  a redeploy, or a free-plan sleep/wake cycle in some cases). For
  single-stream sessions this is rarely noticeable; if you want scores
  to persist across days, let me know and this can be upgraded to save
  to a permanent database.
- **This uses an unofficial, reverse-engineered connection to TikTok**
  (via EulerStream) because TikTok has no official public API for
  reading LIVE comments. It's the same approach almost all TikTok LIVE
  games and chat-readers use, but TikTok could change something on
  their end at any time that requires the underlying library to be
  updated — if the status pill ever shows a connection error you can't
  resolve, that's the most likely cause, and it's an update to the
  `tiktok-live-connector` dependency (not your setup) that fixes it.

---

## Making future changes safely

Because **Test Mode** needs no TikTok login and no external connection,
it's your safety net: any time you (or I) change something about the
game, open the game, tap Test Mode in the ⚙ panel, and run through a full round
before ever going live with it. If it behaves correctly in Test Mode,
it will behave correctly on a real stream.
