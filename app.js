/* ============================================================
   English Vocabulary Trainer — vanilla JS PWA
   Storage: LocalStorage, separated keys strategy.
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- Constants ---------------- */
  const INDEX_KEY = "AppTracksList";
  const SELECTED_TRACK_KEY = "AppSelectedTrack";
  const MAX_WEIGHT = 100;
  const MIN_WEIGHT = 10;
  const WEIGHT_STEP = 25; // amount weight drops on a correct answer
  const ADD_BATCH = 4;
  const STATUS_PENDING = "Pending";
  const STATUS_ACTIVE = "Active";

  /* ---------------- Storage helpers ---------------- */
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getTracks() {
    return readJSON(INDEX_KEY, []);
  }
  function setTracks(list) {
    writeJSON(INDEX_KEY, list);
  }
  function getWords(trackId) {
    return readJSON(trackId, []);
  }
  function setWords(trackId, words) {
    writeJSON(trackId, words);
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function makeWord(english, hebrew) {
    return {
      id: uuid(),
      english: String(english).trim(),
      hebrew: String(hebrew).trim(),
      status: STATUS_PENDING,
      weight: MAX_WEIGHT,
      correctStreak: 0,
      mistakeCount: 0,
    };
  }

  /* ---------------- Bootstrapping ---------------- */
  const DEFAULT_WORDS = [
    ["hello", "שלום"],
    ["thank you", "תודה"],
    ["please", "בבקשה"],
    ["water", "מים"],
    ["food", "אוכל"],
    ["house", "בית"],
    ["friend", "חבר"],
    ["book", "ספר"],
    ["day", "יום"],
    ["night", "לילה"],
    ["love", "אהבה"],
    ["work", "עבודה"],
    ["time", "זמן"],
    ["happy", "שמח"],
    ["big", "גדול"],
  ];

  function bootstrap() {
    const tracks = getTracks();
    if (tracks.length === 0) {
      const seed = window.DEFAULT_TRACK;
      const name = seed && seed.name ? seed.name : "General Conversation";
      const pairs = seed && Array.isArray(seed.words) && seed.words.length ? seed.words : DEFAULT_WORDS;
      const id = "track_" + uuid().replace(/-/g, "").slice(0, 12);
      const words = pairs.map(([en, he]) => makeWord(en, he));
      // First batch active so the app is usable immediately.
      words.slice(0, ADD_BATCH).forEach((w) => (w.status = STATUS_ACTIVE));
      setWords(id, words);
      setTracks([{ id: id, name: name }]);
      writeJSON(SELECTED_TRACK_KEY, id);
    }
  }

  /* ---------------- App State ---------------- */
  const state = {
    selectedTrackId: null,
    test: null, // { format, questions:[], idx, score, wrong:[] }
  };

  function getSelectedTrackId() {
    const tracks = getTracks();
    if (tracks.length === 0) return null;
    let id = readJSON(SELECTED_TRACK_KEY, null);
    if (!id || !tracks.some((t) => t.id === id)) {
      id = tracks[0].id;
      writeJSON(SELECTED_TRACK_KEY, id);
    }
    return id;
  }

  function activeWords(trackId) {
    return getWords(trackId).filter((w) => w.status === STATUS_ACTIVE);
  }
  function pendingWords(trackId) {
    return getWords(trackId).filter((w) => w.status === STATUS_PENDING);
  }

  /* ---------------- Selection Algorithm ---------------- */
  // Weighted random selection from a pool of word objects.
  function weightedPick(pool, excludeId) {
    const candidates = excludeId
      ? pool.filter((w) => w.id !== excludeId)
      : pool.slice();
    const usable = candidates.length ? candidates : pool;
    if (usable.length === 0) return null;
    let total = 0;
    for (const w of usable) total += Math.max(MIN_WEIGHT, w.weight || MIN_WEIGHT);
    let r = Math.random() * total;
    for (const w of usable) {
      r -= Math.max(MIN_WEIGHT, w.weight || MIN_WEIGHT);
      if (r <= 0) return w;
    }
    return usable[usable.length - 1];
  }

  // Update a word's weight/streak/mistakes and persist.
  function recordResult(trackId, wordId, correct) {
    const words = getWords(trackId);
    const w = words.find((x) => x.id === wordId);
    if (!w) return;
    if (correct) {
      w.correctStreak = (w.correctStreak || 0) + 1;
      w.weight = Math.max(MIN_WEIGHT, (w.weight || MAX_WEIGHT) - WEIGHT_STEP);
    } else {
      w.correctStreak = 0;
      w.mistakeCount = (w.mistakeCount || 0) + 1;
      w.weight = MAX_WEIGHT;
    }
    setWords(trackId, words);
  }

  function normalize(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------------- View routing ---------------- */
  function show(viewId) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const el = document.getElementById("view-" + viewId);
    if (el) el.classList.add("active");
    window.scrollTo(0, 0);
  }

  function navigate(target) {
    switch (target) {
      case "dashboard":
        renderDashboard();
        show("dashboard");
        break;
      case "flashcards":
        show("flashcards");
        renderFlashcard();
        break;
      case "mcq":
        show("mcq");
        renderMCQ();
        break;
      case "typing":
        show("typing");
        renderTyping();
        break;
      case "import":
        state.selectedTrackId = getSelectedTrackId();
        renderImportTargets();
        show("import");
        break;
      case "test-setup":
        show("test-setup");
        renderTestSetup();
        break;
      default:
        show("dashboard");
    }
  }

  /* ---------------- Dashboard ---------------- */
  function renderDashboard() {
    state.selectedTrackId = getSelectedTrackId();
    const tracks = getTracks();
    const sel = document.getElementById("track-select");
    sel.innerHTML = "";
    tracks.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === state.selectedTrackId) opt.selected = true;
      sel.appendChild(opt);
    });

    const tid = state.selectedTrackId;
    const all = tid ? getWords(tid) : [];
    const act = all.filter((w) => w.status === STATUS_ACTIVE).length;
    const pen = all.filter((w) => w.status === STATUS_PENDING).length;
    document.getElementById("stat-active").textContent = act;
    document.getElementById("stat-pending").textContent = pen;
    document.getElementById("stat-total").textContent = all.length;

    document.getElementById("btn-add-words").disabled = pen === 0;

    renderImportTargets();
  }

  function renderImportTargets() {
    const tracks = getTracks();
    const sel = document.getElementById("import-target");
    sel.innerHTML = "";
    tracks.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === state.selectedTrackId) opt.selected = true;
      sel.appendChild(opt);
    });
    const newOpt = document.createElement("option");
    newOpt.value = "__new__";
    newOpt.textContent = "＋ Create new track…";
    sel.appendChild(newOpt);
    toggleNewNameField();
  }

  function toggleNewNameField() {
    const sel = document.getElementById("import-target");
    const wrap = document.getElementById("import-newname-wrap");
    wrap.classList.toggle("hidden", sel.value !== "__new__");
  }

  function addWordsToCycle() {
    const tid = state.selectedTrackId;
    if (!tid) return;
    const words = getWords(tid);
    let moved = 0;
    for (const w of words) {
      if (moved >= ADD_BATCH) break;
      if (w.status === STATUS_PENDING) {
        w.status = STATUS_ACTIVE;
        w.weight = MAX_WEIGHT;
        moved++;
      }
    }
    if (moved > 0) setWords(tid, words);
    renderDashboard();
  }

  /* ---------------- Import ---------------- */
  function parseBulk(text) {
    const rows = [];
    text.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      // Support tab, comma, or semicolon separators.
      let parts = line.split("\t");
      if (parts.length < 2) parts = line.split(/[,;]/);
      if (parts.length < 2) return;
      const en = parts[0].trim();
      const he = parts.slice(1).join(" ").trim();
      if (en && he) rows.push([en, he]);
    });
    return rows;
  }

  function doImport(text) {
    const msg = document.getElementById("import-msg");
    const rows = parseBulk(text);
    if (rows.length === 0) {
      msg.textContent = "No valid rows found. Use: english <TAB> hebrew";
      msg.className = "msg err";
      return;
    }

    const targetSel = document.getElementById("import-target");
    let targetId = targetSel.value;

    if (targetId === "__new__") {
      const name = document.getElementById("import-newname").value.trim();
      if (!name) {
        msg.textContent = "Please enter a name for the new track.";
        msg.className = "msg err";
        return;
      }
      targetId = "track_" + uuid().replace(/-/g, "").slice(0, 12);
      const tracks = getTracks();
      tracks.push({ id: targetId, name: name });
      setTracks(tracks);
      setWords(targetId, []);
      writeJSON(SELECTED_TRACK_KEY, targetId);
    }

    const words = getWords(targetId);
    rows.forEach(([en, he]) => words.push(makeWord(en, he)));
    setWords(targetId, words);

    document.getElementById("import-text").value = "";
    document.getElementById("import-file").value = "";
    document.getElementById("import-newname").value = "";

    msg.textContent = "Imported " + rows.length + " word" + (rows.length === 1 ? "" : "s") + ".";
    msg.className = "msg ok";

    state.selectedTrackId = getSelectedTrackId();
    renderDashboard();
  }

  /* ---------------- Flashcards ---------------- */
  function renderFlashcard() {
    const body = document.getElementById("flashcards-body");
    const pool = activeWords(state.selectedTrackId);
    if (pool.length === 0) {
      body.innerHTML = emptyMsg();
      return;
    }
    const word = weightedPick(pool, flashState.lastId);
    flashState.lastId = word.id;
    flashState.flipped = false;

    body.innerHTML = `
      <div class="flashcard" id="fc-card">
        <div class="fc-main">${esc(word.english)}</div>
        <div class="fc-hint">Tap to reveal</div>
      </div>
      <div class="grid-2 hidden" id="fc-buttons">
        <button class="btn btn-green" id="fc-knew">Knew it</button>
        <button class="btn btn-red" id="fc-didnt">Didn't know</button>
      </div>
    `;

    const card = document.getElementById("fc-card");
    const buttons = document.getElementById("fc-buttons");
    card.addEventListener("click", () => {
      if (flashState.flipped) return;
      flashState.flipped = true;
      card.classList.add("flipped", "rtl");
      card.innerHTML = `
        <div class="fc-main">${esc(word.hebrew)}</div>
        <div class="fc-hint">${esc(word.english)}</div>`;
      buttons.classList.remove("hidden");
    });
    document.getElementById("fc-knew").addEventListener("click", () => {
      recordResult(state.selectedTrackId, word.id, true);
      renderFlashcard();
    });
    document.getElementById("fc-didnt").addEventListener("click", () => {
      recordResult(state.selectedTrackId, word.id, false);
      renderFlashcard();
    });
  }
  const flashState = { lastId: null, flipped: false };

  /* ---------------- Multiple Choice ---------------- */
  function buildOptions(pool, correctWord) {
    const others = shuffle(pool.filter((w) => w.id !== correctWord.id))
      .filter((w) => normalize(w.hebrew) !== normalize(correctWord.hebrew));
    const distractors = others.slice(0, 3).map((w) => w.hebrew);
    const options = shuffle([correctWord.hebrew, ...distractors]);
    return options;
  }

  function renderMCQ() {
    const body = document.getElementById("mcq-body");
    const pool = activeWords(state.selectedTrackId);
    if (pool.length < 2) {
      body.innerHTML = emptyMsg("Multiple Choice needs at least 2 active words.");
      return;
    }
    const word = weightedPick(pool, mcqState.lastId);
    mcqState.lastId = word.id;
    const options = buildOptions(pool, word);

    body.innerHTML = `
      <div class="prompt-word">${esc(word.english)}</div>
      <div class="prompt-sub">Choose the Hebrew translation</div>
      <div class="mcq-grid" id="mcq-grid"></div>
    `;
    const grid = document.getElementById("mcq-grid");
    options.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "mcq-option rtl";
      b.textContent = opt;
      b.addEventListener("click", () => {
        const correct = normalize(opt) === normalize(word.hebrew);
        Array.from(grid.children).forEach((c) => (c.disabled = true));
        b.classList.add(correct ? "correct" : "wrong");
        if (!correct) {
          // Highlight the correct one too.
          Array.from(grid.children).forEach((c) => {
            if (normalize(c.textContent) === normalize(word.hebrew)) c.classList.add("correct");
          });
        }
        recordResult(state.selectedTrackId, word.id, correct);
        setTimeout(renderMCQ, 1000);
      });
      grid.appendChild(b);
    });
  }
  const mcqState = { lastId: null };

  /* ---------------- Typing ---------------- */
  function renderTyping() {
    const body = document.getElementById("typing-body");
    const pool = activeWords(state.selectedTrackId);
    if (pool.length === 0) {
      body.innerHTML = emptyMsg();
      return;
    }
    const word = weightedPick(pool, typingState.lastId);
    typingState.lastId = word.id;

    body.innerHTML = `
      <div class="prompt-word rtl">${esc(word.hebrew)}</div>
      <div class="prompt-sub">Type the English translation</div>
      <input type="text" id="ty-input" class="input" autocomplete="off"
        autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="english…" />
      <div class="spacer"></div>
      <button class="btn btn-primary btn-block" id="ty-check">Check</button>
      <div id="ty-feedback"></div>
    `;

    const input = document.getElementById("ty-input");
    const checkBtn = document.getElementById("ty-check");
    input.focus();

    function check() {
      const val = input.value;
      const correct = normalize(val) === normalize(word.english);
      recordResult(state.selectedTrackId, word.id, correct);
      const fb = document.getElementById("ty-feedback");
      if (correct) {
        fb.className = "typing-feedback ok";
        fb.innerHTML = `<div class="lbl">Correct ✓</div>
          <div class="val right-txt">${esc(word.english)}</div>`;
      } else {
        fb.className = "typing-feedback bad";
        fb.innerHTML = `
          <div class="lbl">Your answer</div>
          <div class="val wrong-txt">${esc(val) || "(empty)"}</div>
          <div class="lbl" style="margin-top:8px">Correct answer</div>
          <div class="val right-txt">${esc(word.english)}</div>`;
      }
      checkBtn.textContent = "Next →";
      checkBtn.onclick = renderTyping;
      input.disabled = true;
    }

    checkBtn.onclick = check;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !input.disabled) check();
    });
  }
  const typingState = { lastId: null };

  /* ---------------- Test Setup ---------------- */
  let testConfig = { format: "mcq", count: 10 };

  function renderTestSetup() {
    // Restore active selection visuals from testConfig.
    document.querySelectorAll("#test-format .seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.format === testConfig.format);
    });
    document.querySelectorAll("#test-count .seg-btn").forEach((b) => {
      b.classList.toggle("active", String(b.dataset.count) === String(testConfig.count));
    });
    const pool = activeWords(state.selectedTrackId);
    const info = document.getElementById("test-setup-info");
    const startBtn = document.getElementById("btn-start-test");
    if (pool.length === 0) {
      info.textContent = "No active words yet. Add words to the cycle from the Dashboard first.";
      startBtn.disabled = true;
    } else if (testConfig.format === "mcq" && pool.length < 2) {
      info.textContent = "Multiple Choice needs at least 2 active words.";
      startBtn.disabled = true;
    } else {
      info.textContent = pool.length + " active words available.";
      startBtn.disabled = false;
    }
  }

  function startTest() {
    const pool = activeWords(state.selectedTrackId);
    let count = testConfig.count === "all" ? pool.length : Math.min(testConfig.count, pool.length);
    const questions = shuffle(pool).slice(0, count); // distinct, no repeats
    state.test = {
      format: testConfig.format,
      questions: questions,
      idx: 0,
      score: 0,
      wrong: [],
    };
    show("test-run");
    renderTestQuestion();
  }

  function renderTestQuestion() {
    const t = state.test;
    if (!t) return;
    if (t.idx >= t.questions.length) {
      renderTestResults();
      return;
    }
    const word = t.questions[t.idx];
    const n = t.idx + 1;
    const total = t.questions.length;
    document.getElementById("test-progress").textContent = `Question ${n} of ${total}`;
    const body = document.getElementById("test-run-body");
    const pct = Math.round(((n - 1) / total) * 100);
    const bar = `<div class="test-bar"><i style="width:${pct}%"></i></div>`;

    if (t.format === "mcq") {
      const pool = activeWords(state.selectedTrackId);
      const options = buildOptions(pool, word);
      body.innerHTML = `
        ${bar}
        <div class="prompt-word">${esc(word.english)}</div>
        <div class="prompt-sub">Choose the Hebrew translation</div>
        <div class="mcq-grid" id="test-grid"></div>`;
      const grid = document.getElementById("test-grid");
      options.forEach((opt) => {
        const b = document.createElement("button");
        b.className = "mcq-option rtl";
        b.textContent = opt;
        b.addEventListener("click", () => {
          const correct = normalize(opt) === normalize(word.hebrew);
          Array.from(grid.children).forEach((c) => (c.disabled = true));
          b.classList.add(correct ? "correct" : "wrong");
          if (!correct) {
            Array.from(grid.children).forEach((c) => {
              if (normalize(c.textContent) === normalize(word.hebrew)) c.classList.add("correct");
            });
          }
          gradeTest(word, correct, null);
          setTimeout(advanceTest, 1000);
        });
        grid.appendChild(b);
      });
    } else {
      // typing
      body.innerHTML = `
        ${bar}
        <div class="prompt-word rtl">${esc(word.hebrew)}</div>
        <div class="prompt-sub">Type the English translation</div>
        <input type="text" id="test-input" class="input" autocomplete="off"
          autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="english…" />
        <div class="spacer"></div>
        <button class="btn btn-primary btn-block" id="test-check">Check</button>
        <div id="test-feedback"></div>`;
      const input = document.getElementById("test-input");
      const checkBtn = document.getElementById("test-check");
      input.focus();
      function check() {
        const val = input.value;
        const correct = normalize(val) === normalize(word.english);
        gradeTest(word, correct, val);
        const fb = document.getElementById("test-feedback");
        if (correct) {
          fb.className = "typing-feedback ok";
          fb.innerHTML = `<div class="lbl">Correct ✓</div>
            <div class="val right-txt">${esc(word.english)}</div>`;
        } else {
          fb.className = "typing-feedback bad";
          fb.innerHTML = `
            <div class="lbl">Your answer</div>
            <div class="val wrong-txt">${esc(val) || "(empty)"}</div>
            <div class="lbl" style="margin-top:8px">Correct answer</div>
            <div class="val right-txt">${esc(word.english)}</div>`;
        }
        input.disabled = true;
        checkBtn.textContent = t.idx + 1 >= total ? "See results →" : "Next →";
        checkBtn.onclick = advanceTest;
      }
      checkBtn.onclick = check;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !input.disabled) check();
      });
    }
  }

  function gradeTest(word, correct, userInput) {
    const t = state.test;
    recordResult(state.selectedTrackId, word.id, correct);
    if (correct) {
      t.score++;
    } else {
      t.wrong.push({
        english: word.english,
        hebrew: word.hebrew,
        userInput: userInput,
      });
    }
  }

  function advanceTest() {
    state.test.idx++;
    renderTestQuestion();
  }

  function renderTestResults() {
    const t = state.test;
    show("test-results");
    const body = document.getElementById("test-results-body");
    const total = t.questions.length;
    const pct = total ? Math.round((t.score / total) * 100) : 0;

    let reviewHtml = "";
    if (t.wrong.length === 0) {
      reviewHtml = `<p class="hint" style="text-align:center">Perfect! No mistakes. 🎉</p>`;
    } else {
      reviewHtml =
        `<div class="section-title">Review (${t.wrong.length} missed)</div>` +
        t.wrong
          .map((w) => {
            const ans =
              t.format === "typing"
                ? `<div class="ri-ans">You: <span class="x">${esc(w.userInput) || "(empty)"}</span> &nbsp; Correct: <span class="c">${esc(w.english)}</span></div>`
                : "";
            return `
              <div class="review-item">
                <div class="ri-en">${esc(w.english)}</div>
                <div class="ri-he rtl">${esc(w.hebrew)}</div>
                ${ans}
              </div>`;
          })
          .join("");
    }

    body.innerHTML = `
      <div class="score-big">${t.score} / ${total}</div>
      <div class="score-pct">${pct}%</div>
      ${reviewHtml}
      <div class="spacer"></div>
      <button class="btn btn-primary btn-block" id="res-retake">Retake test</button>
      <div class="spacer"></div>
      <button class="btn btn-block" id="res-home">Back to Dashboard</button>
    `;
    document.getElementById("res-retake").onclick = () => {
      show("test-setup");
      renderTestSetup();
    };
    document.getElementById("res-home").onclick = () => navigate("dashboard");
  }

  /* ---------------- Helpers ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function emptyMsg(extra) {
    return `<div class="practice-empty">
      No active words to practice.<br/>
      ${extra ? esc(extra) + "<br/>" : ""}
      Go to the Dashboard and tap “Add 4 new words to cycle”.
    </div>`;
  }

  /* ---------------- Event wiring ---------------- */
  function wireEvents() {
    // Navigation buttons (data-nav)
    document.body.addEventListener("click", (e) => {
      const navEl = e.target.closest("[data-nav]");
      if (navEl) {
        navigate(navEl.dataset.nav);
      }
    });

    document.getElementById("track-select").addEventListener("change", (e) => {
      writeJSON(SELECTED_TRACK_KEY, e.target.value);
      state.selectedTrackId = e.target.value;
      flashState.lastId = mcqState.lastId = typingState.lastId = null;
      renderDashboard();
    });

    document.getElementById("btn-add-words").addEventListener("click", addWordsToCycle);

    document.getElementById("import-target").addEventListener("change", toggleNewNameField);

    document.getElementById("btn-import").addEventListener("click", () => {
      const text = document.getElementById("import-text").value;
      doImport(text);
    });

    document.getElementById("import-file").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        document.getElementById("import-text").value = String(reader.result || "");
        const msg = document.getElementById("import-msg");
        msg.textContent = 'Loaded "' + file.name + '". Review, then tap Import.';
        msg.className = "msg ok";
      };
      reader.readAsText(file);
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
      if (confirm("This will delete ALL tracks and words. Continue?")) {
        localStorage.clear();
        bootstrap();
        state.selectedTrackId = getSelectedTrackId();
        navigate("dashboard");
      }
    });

    // Test setup segmented controls
    document.getElementById("test-format").addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (!b) return;
      testConfig.format = b.dataset.format;
      renderTestSetup();
    });
    document.getElementById("test-count").addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (!b) return;
      testConfig.count = b.dataset.count === "all" ? "all" : parseInt(b.dataset.count, 10);
      renderTestSetup();
    });
    document.getElementById("btn-start-test").addEventListener("click", startTest);
  }

  /* ---------------- Init ---------------- */
  function init() {
    bootstrap();
    state.selectedTrackId = getSelectedTrackId();
    wireEvents();
    navigate("dashboard");

    // Register an inline service worker for offline/PWA install (best-effort).
    if ("serviceWorker" in navigator) {
      const swCode =
        "self.addEventListener('install',e=>self.skipWaiting());" +
        "self.addEventListener('activate',e=>self.clients.claim());" +
        "self.addEventListener('fetch',function(e){});";
      try {
        const blob = new Blob([swCode], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        navigator.serviceWorker.register(url).catch(() => {});
      } catch (e) {
        /* ignore */
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();