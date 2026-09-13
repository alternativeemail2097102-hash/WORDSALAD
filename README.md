# WordSalad Live — TikTok LIVE Word Game

A fully-automated word guessing game for TikTok LIVE. Your viewers guess a
scrambled word by typing in your TikTok comments — the game reads their
comments in real time, scores correct guesses, and shows a live top-10
leaderboard.

This README assumes **zero coding experience**. Follow it top to bottom.

---

## What you're getting

- `server.js` — the whole backend (connects to TikTok, runs the game)
- `words.js` — the word bank (easy/medium/hard)
- `public/host.html` — **your** private control panel (use this yourself)
- `public/display.html` — the big screen your **audience** sees (put this
  on your stream as a browser source / second window)
- Everything else is configuration Render/GitHub need

You will never open or edit any of these files yourself. You'll just
upload the folder and click a few buttons.

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

## Part 5 — Open your two screens

Your game has **two screens**, both live at your Render address:

- **Host Panel (for you):**
  `https://YOUR-RENDER-ADDRESS.onrender.com/host.html`
  Open this on your phone or laptop. This is where you connect to
  TikTok, start rounds, pick difficulty, and see diagnostics.

- **Display Screen (for your audience):**
  `https://YOUR-RENDER-ADDRESS.onrender.com/display.html`
  Open this on the screen you're actually broadcasting (e.g. as a
  Browser Source in your streaming software, or full-screen on a
  second monitor/tablet propped next to your camera). This shows the
  scrambled word, timer, leaderboard, and live comments.

Bookmark both links. You'll use them every stream.

---

## Part 6 — Using it, step by step

1. **Before going live**, open the Host Panel and tap **"🧪 Test Mode"**.
   This simulates fake viewers commenting — no TikTok login needed — so
   you can confirm everything works: press **Start Round**, watch the
   word scramble, watch fake guesses come in on the Display Screen, and
   confirm the leaderboard updates. Tap **Test Mode** again to stop it.
2. **When you go live on TikTok**, open the Host Panel, type your TikTok
   username into the box (no `@`), and tap **Connect**. The status pill
   will show what's happening. If it fails, it automatically retries a
   couple of times before showing a plain-English reason.
3. Pick a **difficulty** (Easy / Medium / Hard).
4. Tap **▶ Start Round**. The Display Screen shows the scrambled word to
   your audience; they type their guess in your TikTok comments.
5. The game automatically reveals letter hints over time, and moves to
   the next word automatically when someone guesses correctly or time
   runs out. Tap **⏭ Next Word** any time to skip manually.
6. Use the **message box at the bottom of the Host Panel** to type
   anything yourself (answer a question, make an announcement) — it
   appears in the live comment feed on the Display Screen labeled HOST.
7. The **Top 10 Leaderboard** updates live on both screens. Tap
   **Reset Leaderboard** to start fresh for a new stream.

---

## Understanding the diagnostics (so you never need to "debug")

The Host Panel has a **"Live Diagnostics"** box right below the connect
button:

- **Events received** — a number that goes up every single time a chat
  message arrives, whether the game understood it or not. If this stays
  at 0 while you're live and people are commenting, the connection
  itself isn't receiving anything (check you typed your username
  correctly, and that you are actually LIVE on TikTok, not just
  recording).
- **Last received** — shows the very last comment the game saw, exactly
  as it understood it (`username: text`). If this updates but scores
  never do, the words being typed just aren't matching the current
  word.
- **Raw message samples** — an expandable section showing the first 5
  messages exactly as TikTok sent them, in full detail. You'll never
  need this normally — it's there in case something looks broken and
  you want to see, in plain view, exactly what the game is receiving.

If anything goes wrong elsewhere, a small message banner pops up at the
top of the Host Panel in plain English — you never need to check
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
  updated — if the Host Panel ever shows a connection error you can't
  resolve, that's the most likely cause, and it's an update to the
  `tiktok-live-connector` dependency (not your setup) that fixes it.

---

## Making future changes safely

Because **Test Mode** needs no TikTok login and no external connection,
it's your safety net: any time you (or I) change something about the
game, open the Host Panel, tap Test Mode, and run through a full round
before ever going live with it. If it behaves correctly in Test Mode,
it will behave correctly on a real stream.
