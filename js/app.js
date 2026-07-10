(() => {
  const app = document.getElementById("app");
  const brandHome = document.getElementById("brand-home");

  const state = {
    screen: "home",
    // home | domains | quiz | results | learn | learn-done | micro | micro-topic | settings
    module: null, // quiz | learn | micro
    domainId: null,
    questions: [],
    index: 0,
    selected: null,
    locked: false,
    answers: [],
    cards: [],
    cardIndex: 0,
    flipped: false,
    source: "bank",
    warning: null,
    loading: false,
    microTopics: [],
    microTopic: null,
    microTab: "lesson", // lesson | cards | quiz
    apiOnline: null,
    settingsDraft: null,
    toast: null,
  };

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function prepareQuestion(q) {
    const order = shuffle(q.choices.map((_, i) => i));
    return {
      ...q,
      choices: order.map((i) => q.choices[i]),
      answer: order.indexOf(q.answer),
    };
  }

  function letters(i) {
    return String.fromCharCode(65 + i);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function domainById(id) {
    return DOMAINS.find((d) => d.id === id);
  }

  function setToast(msg) {
    state.toast = msg;
    render();
    if (msg) {
      setTimeout(() => {
        if (state.toast === msg) {
          state.toast = null;
          render();
        }
      }, 4200);
    }
  }

  function resetProgress() {
    state.questions = [];
    state.index = 0;
    state.selected = null;
    state.locked = false;
    state.answers = [];
    state.cards = [];
    state.cardIndex = 0;
    state.flipped = false;
    state.source = "bank";
    state.warning = null;
  }

  function goHome() {
    state.screen = "home";
    state.module = null;
    state.domainId = null;
    state.microTopic = null;
    state.microTab = "lesson";
    resetProgress();
    render();
  }

  function chooseModule(module) {
    state.module = module;
    resetProgress();
    if (module === "micro") {
      state.screen = "micro";
      ensureMicroTopics().then(render);
    } else {
      state.screen = "domains";
    }
    render();
  }

  async function ensureMicroTopics() {
    if (state.microTopics.length) return;
    try {
      const data = await HelixAPI.microTopics();
      state.microTopics = data.topics || [];
      state.apiOnline = true;
    } catch (err) {
      state.apiOnline = false;
      state.microTopics = [];
      setToast("API offline — start the HelixBench server for microlearning & AI generation.");
    }
  }

  async function probeHealth() {
    try {
      await HelixAPI.health();
      state.apiOnline = true;
    } catch {
      state.apiOnline = false;
    }
  }

  function bankQuiz(domainId) {
    const pool = QUESTIONS[domainId] || [];
    return shuffle(pool).slice(0, SESSION_SIZE).map(prepareQuestion);
  }

  function bankCards(domainId) {
    const pool = FLASHCARDS[domainId] || [];
    return shuffle(pool);
  }

  async function startDomain(domainId, { regenerate = false } = {}) {
    state.domainId = domainId;
    state.loading = true;
    state.warning = null;
    render();

    try {
      if (state.module === "learn") {
        if (regenerate || state.apiOnline !== false) {
          try {
            const data = await HelixAPI.generateFlashcards(domainId, 12);
            state.cards = shuffle(data.cards || []);
            state.source = data.source || "ai";
            state.warning = data.warning || null;
          } catch (err) {
            state.cards = bankCards(domainId);
            state.source = "bank";
            state.warning = String(err.message || err);
          }
        } else {
          state.cards = bankCards(domainId);
          state.source = "bank";
        }
        state.cardIndex = 0;
        state.flipped = false;
        state.screen = "learn";
      } else {
        if (regenerate || state.apiOnline !== false) {
          try {
            const data = await HelixAPI.generateQuiz(domainId, SESSION_SIZE);
            state.questions = (data.questions || []).map((q) =>
              q.source === "ai" ? q : prepareQuestion(q)
            );
            // Always shuffle choices client-side for safety
            state.questions = state.questions.map((q) => prepareQuestion({
              ...q,
              choices: [...q.choices],
              answer: q.answer,
            }));
            state.source = data.source || "ai";
            state.warning = data.warning || null;
          } catch (err) {
            state.questions = bankQuiz(domainId);
            state.source = "bank";
            state.warning = String(err.message || err);
          }
        } else {
          state.questions = bankQuiz(domainId);
          state.source = "bank";
        }
        state.index = 0;
        state.selected = null;
        state.locked = false;
        state.answers = [];
        state.screen = "quiz";
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  async function openMicroTopic(topicId) {
    state.loading = true;
    render();
    try {
      let topic = state.microTopics.find((t) => t.id === topicId);
      const data = await HelixAPI.generateMicro(topicId, 6, 8);
      topic = data.topic || topic;
      state.microTopic = topic;
      state.cards = shuffle(data.flashcards || []);
      state.questions = (data.quiz || []).map((q) => prepareQuestion({ ...q, choices: [...q.choices], answer: q.answer }));
      state.source = data.source || "local";
      state.warning = data.warning || null;
      state.cardIndex = 0;
      state.flipped = false;
      state.index = 0;
      state.selected = null;
      state.locked = false;
      state.answers = [];
      state.microTab = "lesson";
      state.screen = "micro-topic";
    } catch (err) {
      setToast(String(err.message || err));
    } finally {
      state.loading = false;
      render();
    }
  }

  function selectChoice(choiceIndex) {
    if (state.locked) return;
    const q = state.questions[state.index];
    state.selected = choiceIndex;
    state.locked = true;
    state.answers.push({
      qid: state.index,
      choice: choiceIndex,
      correct: choiceIndex === q.answer,
      topic: q.topic,
      question: q.question,
    });
    render();
  }

  function nextQuestion() {
    if (state.index >= state.questions.length - 1) {
      state.screen = state.module === "micro" ? "results" : "results";
      render();
      return;
    }
    state.index += 1;
    state.selected = null;
    state.locked = false;
    render();
  }

  function flipCard() {
    state.flipped = !state.flipped;
    render();
  }

  function nextCard() {
    if (state.cardIndex >= state.cards.length - 1) {
      if (state.module === "micro") {
        state.microTab = "quiz";
        state.index = 0;
        state.selected = null;
        state.locked = false;
        state.answers = [];
        state.screen = "micro-topic";
        setToast("Deck done — try the practice quiz.");
        render();
        return;
      }
      state.screen = "learn-done";
      render();
      return;
    }
    state.cardIndex += 1;
    state.flipped = false;
    render();
  }

  function prevCard() {
    if (state.cardIndex <= 0) return;
    state.cardIndex -= 1;
    state.flipped = false;
    render();
  }

  async function reshuffleOrRegenerate() {
    if (state.module === "micro" && state.microTopic) {
      await openMicroTopic(state.microTopic.id);
      state.microTab = "cards";
      render();
      return;
    }
    await startDomain(state.domainId, { regenerate: true });
  }

  function sourceBadge() {
    const label =
      state.source === "ai" ? "AI generated" :
      state.source === "local" ? "Dynamic local" :
      "Curated bank";
    return `<span class="source-badge source-${escapeHtml(state.source)}">${label}</span>`;
  }

  function toastHtml() {
    if (!state.toast && !state.warning && !state.loading) return "";
    const msg = state.loading ? "Generating…" : (state.toast || state.warning);
    return `<div class="toast ${state.loading ? "toast-loading" : ""}" role="status">${escapeHtml(msg)}</div>`;
  }

  function renderHome() {
    const api = state.apiOnline;
    const apiLabel = api === true ? "API online" : api === false ? "API offline" : "Checking API…";
    return `
      <section class="screen hero" aria-labelledby="hero-title">
        <div class="hero-tools">
          <span class="api-pill ${api === true ? "ok" : api === false ? "bad" : ""}">${apiLabel}</span>
          <button type="button" class="btn btn-ghost btn-small" data-action="settings">AI settings</button>
        </div>
        <h1 class="hero-brand" id="hero-title">HelixBench</h1>
        <p class="hero-lead">
          Dynamic CompBio learning for pharma AI drug discovery —
          flashcards, quizzes, and microlearning on pLMs, folding, docking, BiTE, ADC, and Python code reading.
        </p>
        <p class="levels-label">Choose a module</p>
        <div class="module-grid module-grid-3" role="list">
          <button type="button" class="module-card" role="listitem" data-action="module-learn">
            <span class="module-kicker">Learning</span>
            <span class="module-name">Flashcards</span>
            <span class="module-desc">Shuffled domain decks — generate fresh cards with AI or local dynamic templates.</span>
          </button>
          <button type="button" class="module-card" role="listitem" data-action="module-quiz">
            <span class="module-kicker">Assessment</span>
            <span class="module-name">Quiz</span>
            <span class="module-desc">10 MCQs per domain with instant green/red feedback. New sets on demand.</span>
          </button>
          <button type="button" class="module-card" role="listitem" data-action="module-micro">
            <span class="module-kicker">Microlearning</span>
            <span class="module-name">Deep dives</span>
            <span class="module-desc">pLMs, folding, docking, BiTE, ADC, code-reading — lesson + practice.</span>
          </button>
        </div>
      </section>
    `;
  }

  function renderDomains() {
    const isLearn = state.module === "learn";
    const title = isLearn ? "Flashcards by domain" : "Quiz by domain";
    const blurb = isLearn
      ? "Pick a category. Cards are generated dynamically (AI if configured) and shuffled each run."
      : "Pick a category. Questions & choices are generated dynamically and shuffled each run.";

    return `
      <section class="screen hero domains-screen" aria-labelledby="domains-title">
        <button type="button" class="back-link" data-action="home">← All modules</button>
        <h1 class="section-title" id="domains-title">${title}</h1>
        <p class="hero-lead">${blurb}</p>
        <p class="levels-label" id="domains">Domains</p>
        <div class="level-grid domain-grid" role="list">
          ${DOMAINS.map(
            (domain) => `
            <button type="button" class="level-option" role="listitem" data-start="${domain.id}" ${state.loading ? "disabled" : ""}>
              <span class="level-name">${escapeHtml(domain.name)}</span>
              <span class="level-meta">${escapeHtml(domain.meta)}</span>
              <span class="level-desc">${escapeHtml(domain.desc)}</span>
            </button>`
          ).join("")}
        </div>
      </section>
    `;
  }

  function renderMicroList() {
    const topics = state.microTopics;
    return `
      <section class="screen hero" aria-labelledby="micro-title">
        <button type="button" class="back-link" data-action="home">← All modules</button>
        <h1 class="section-title" id="micro-title">Microlearning</h1>
        <p class="hero-lead">Focused lessons with dynamic practice — protein LMs, folding, docking, BiTE, ADC, and Python code comprehension.</p>
        <div class="level-grid domain-grid" role="list">
          ${topics.length ? topics.map((t) => `
            <button type="button" class="level-option" role="listitem" data-micro="${t.id}" ${state.loading ? "disabled" : ""}>
              <span class="level-meta">${escapeHtml(t.category)}</span>
              <span class="level-name">${escapeHtml(t.name)}</span>
              <span class="level-desc">${escapeHtml(t.blurb)}</span>
            </button>`).join("") : `<p class="hero-lead">Loading topics… If this stays empty, start the API server (<code>./start.sh</code>).</p>`}
        </div>
      </section>
    `;
  }

  function renderMicroTopic() {
    const t = state.microTopic;
    if (!t) return renderMicroList();
    const tabs = [
      ["lesson", "Lesson"],
      ["cards", "Flashcards"],
      ["quiz", "Practice quiz"],
    ];

    let body = "";
    if (state.microTab === "lesson") {
      body = `
        <div class="lesson-stack">
          ${(t.lesson || []).map((s) => `
            <article class="lesson-block">
              <h3>${escapeHtml(s.heading)}</h3>
              <p>${escapeHtml(s.body)}</p>
            </article>`).join("")}
          ${(t.code_examples || []).map((ex) => `
            <article class="lesson-block">
              <h3>Code · ${escapeHtml(ex.title)}</h3>
              <pre class="question-code">${escapeHtml(ex.code)}</pre>
              <p>${escapeHtml(ex.explain)}</p>
            </article>`).join("")}
        </div>
        <div class="learn-actions">
          <button type="button" class="btn btn-primary" data-action="micro-tab-cards">Study flashcards</button>
          <button type="button" class="btn btn-ghost" data-action="regenerate">Generate fresh practice</button>
        </div>`;
    } else if (state.microTab === "cards") {
      body = renderLearnInner({ badgePrefix: `Micro · ${t.name}` });
    } else {
      body = renderQuizInner({ badgePrefix: `Micro · ${t.name}` });
    }

    return `
      <section class="screen" aria-labelledby="micro-topic-title">
        <button type="button" class="back-link" data-action="module-micro">← Micro topics</button>
        <div class="quiz-top">
          <h1 class="section-title" id="micro-topic-title" style="margin:0">${escapeHtml(t.name)}</h1>
          ${sourceBadge()}
        </div>
        <p class="hero-lead" style="margin-top:0.5rem">${escapeHtml(t.blurb || "")}</p>
        <div class="tab-row" role="tablist">
          ${tabs.map(([id, label]) => `
            <button type="button" class="tab-btn ${state.microTab === id ? "active" : ""}" data-action="micro-tab-${id}">${label}</button>
          `).join("")}
        </div>
        ${body}
      </section>
    `;
  }

  function renderQuizInner({ badgePrefix }) {
    if (!state.questions.length) {
      return `<p class="hero-lead">No questions yet. <button type="button" class="btn btn-primary" data-action="regenerate">Generate</button></p>`;
    }
    const q = state.questions[state.index];
    const n = state.questions.length;
    const step = state.index + 1;
    const pct = (state.index / n) * 100;
    const answered = state.locked;
    const isCorrect = answered && state.selected === q.answer;

    const choices = q.choices
      .map((text, i) => {
        let cls = "choice";
        if (answered) {
          if (i === q.answer) cls += " correct";
          else if (i === state.selected) cls += " wrong";
          else cls += " dimmed";
        }
        return `
          <li>
            <button type="button" class="${cls}" data-choice="${i}" ${answered ? "disabled" : ""}>
              <span class="choice-key">${letters(i)}</span>
              <span>${escapeHtml(text)}</span>
            </button>
          </li>`;
      })
      .join("");

    const feedback = answered
      ? `<div class="feedback ${isCorrect ? "correct" : "wrong"}" role="status">
          <strong>${isCorrect ? "Correct" : "Not quite"}</strong>
          <p>${escapeHtml(q.explanation || "")}</p>
        </div>`
      : "";

    const code = q.code ? `<pre class="question-code">${escapeHtml(q.code)}</pre>` : "";

    return `
      <div class="quiz-top">
        <span class="quiz-level">${escapeHtml(badgePrefix)}</span>
        <span class="quiz-progress-text">Question ${step} of ${n}</span>
      </div>
      <div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${pct}%"></div></div>
      <article class="question-panel">
        <span class="question-topic">${escapeHtml(q.topic || "")}</span>
        <h2 class="question-text">${escapeHtml(q.question)}</h2>
        ${code}
        <ul class="choices">${choices}</ul>
        ${feedback}
        <div class="quiz-actions">
          <button type="button" class="btn btn-ghost" data-action="regenerate">New AI/local set</button>
          <button type="button" class="btn btn-primary" data-action="next" ${answered ? "" : "disabled"}>
            ${step === n ? "See results" : "Next question"}
          </button>
        </div>
      </article>`;
  }

  function renderLearnInner({ badgePrefix }) {
    if (!state.cards.length) {
      return `<p class="hero-lead">No cards yet. <button type="button" class="btn btn-primary" data-action="regenerate">Generate</button></p>`;
    }
    const card = state.cards[state.cardIndex];
    const n = state.cards.length;
    const step = state.cardIndex + 1;
    const pct = (state.cardIndex / n) * 100;
    const body = state.flipped ? card.back : card.front;

    return `
      <div class="quiz-top">
        <span class="quiz-level">${escapeHtml(badgePrefix)}</span>
        <span class="quiz-progress-text">Card ${step} of ${n}</span>
      </div>
      <div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${pct}%"></div></div>
      <button type="button" class="flashcard ${state.flipped ? "is-flipped" : ""}" data-action="flip" aria-pressed="${state.flipped}">
        <span class="question-topic">${escapeHtml(card.topic || "")}</span>
        <span class="flashcard-side-label">${state.flipped ? "Answer" : "Prompt"}</span>
        <span class="flashcard-body">${escapeHtml(body)}</span>
        <span class="flashcard-hint">${state.flipped ? "Click to show prompt" : "Click to reveal answer"}</span>
      </button>
      <div class="learn-actions">
        <button type="button" class="btn btn-ghost" data-action="prev-card" ${state.cardIndex === 0 ? "disabled" : ""}>Previous</button>
        <button type="button" class="btn btn-ghost" data-action="flip">${state.flipped ? "Show prompt" : "Reveal"}</button>
        <button type="button" class="btn btn-primary" data-action="next-card">${step === n ? "Finish deck" : "Next card"}</button>
      </div>
      <div class="learn-secondary">
        <button type="button" class="btn btn-ghost" data-action="regenerate">Generate fresh deck</button>
      </div>`;
  }

  function renderQuiz() {
    const domain = domainById(state.domainId);
    return `
      <section class="screen quiz">
        <div class="quiz-top">
          <span class="quiz-level">Quiz · ${escapeHtml(domain.name)}</span>
          ${sourceBadge()}
        </div>
        ${renderQuizInner({ badgePrefix: `Quiz · ${domain.name}` })}
        <div class="learn-secondary">
          <button type="button" class="btn btn-ghost" data-action="domains">Domains</button>
          <button type="button" class="btn btn-ghost" data-action="settings">AI settings</button>
        </div>
      </section>`;
  }

  function renderLearn() {
    const domain = domainById(state.domainId);
    return `
      <section class="screen learn">
        <div class="quiz-top">
          <span class="quiz-level">Learn · ${escapeHtml(domain.name)}</span>
          ${sourceBadge()}
        </div>
        ${renderLearnInner({ badgePrefix: `Learn · ${domain.name}` })}
        <div class="learn-secondary">
          <button type="button" class="btn btn-ghost" data-action="quiz-domain">Take quiz</button>
          <button type="button" class="btn btn-ghost" data-action="domains">Domains</button>
        </div>
      </section>`;
  }

  function renderResults() {
    const domain = state.module === "micro" && state.microTopic
      ? { name: state.microTopic.name }
      : domainById(state.domainId);
    const total = state.answers.length;
    const score = state.answers.filter((a) => a.correct).length;
    const pct = total ? Math.round((score / total) * 100) : 0;

    let verdict;
    if (pct >= 90) verdict = "Interview-ready depth — generate a fresh set to keep sharp.";
    else if (pct >= 70) verdict = "Solid. Review misses, then regenerate for new angles.";
    else if (pct >= 50) verdict = "Study the flashcards/micro lesson, then retry a new dynamic set.";
    else verdict = "Revisit the lesson, then generate a new practice set.";

    const rows = state.answers
      .map(
        (a, i) => `
        <div class="result-row">
          <span class="result-badge ${a.correct ? "ok" : "no"}">${a.correct ? "✓" : "✗"}</span>
          <div>
            <strong>Q${i + 1} · ${escapeHtml(a.topic)}</strong><br />
            <span>${escapeHtml(a.question)}</span>
          </div>
        </div>`
      )
      .join("");

    return `
      <section class="screen results">
        <div class="results-score-ring" style="--pct:${pct}">
          <div class="results-score-inner">${score}/${total}</div>
        </div>
        <h2>${escapeHtml(domain.name)} complete</h2>
        <p class="results-sub">${pct}% · ${escapeHtml(verdict)} ${sourceBadge()}</p>
        <div class="results-breakdown">${rows}</div>
        <div class="results-actions">
          <button type="button" class="btn btn-primary" data-action="regenerate">Generate new set</button>
          <button type="button" class="btn btn-ghost" data-action="${state.module === "micro" ? "module-micro" : "domains"}">Back</button>
          <button type="button" class="btn btn-ghost" data-action="home">Home</button>
        </div>
      </section>`;
  }

  function renderLearnDone() {
    const domain = domainById(state.domainId);
    return `
      <section class="screen results">
        <h2>${escapeHtml(domain.name)} deck complete</h2>
        <p class="results-sub">Reviewed ${state.cards.length} cards · ${sourceBadge()}</p>
        <div class="results-actions">
          <button type="button" class="btn btn-primary" data-action="regenerate">Generate fresh deck</button>
          <button type="button" class="btn btn-ghost" data-action="quiz-domain">Take quiz</button>
          <button type="button" class="btn btn-ghost" data-action="domains">Domains</button>
        </div>
      </section>`;
  }

  function renderSettings() {
    const s = state.settingsDraft || HelixAPI.loadSettings();
    return `
      <section class="screen settings-screen" aria-labelledby="settings-title">
        <button type="button" class="back-link" data-action="home">← Home</button>
        <h1 class="section-title" id="settings-title">AI settings</h1>
        <p class="hero-lead">Connect an OpenAI-compatible API for novel Q&amp;A. Mode <strong>auto</strong> uses AI when a key is present, otherwise the local dynamic generator.</p>
        <form class="settings-form" data-action="save-settings">
          <label>Generation mode
            <select name="mode">
              <option value="auto" ${s.mode === "auto" ? "selected" : ""}>auto (AI if key, else local)</option>
              <option value="ai" ${s.mode === "ai" ? "selected" : ""}>ai only</option>
              <option value="local" ${s.mode === "local" ? "selected" : ""}>local dynamic only</option>
            </select>
          </label>
          <label>API key
            <input type="password" name="apiKey" value="${escapeHtml(s.apiKey || "")}" placeholder="sk-…" autocomplete="off" />
          </label>
          <label>Base URL
            <input type="url" name="baseUrl" value="${escapeHtml(s.baseUrl || "")}" placeholder="https://api.openai.com/v1" />
          </label>
          <label>Model
            <input type="text" name="model" value="${escapeHtml(s.model || "")}" placeholder="gpt-4o-mini" />
          </label>
          <p class="settings-hint">Works with OpenAI, Groq, OpenRouter, and other OpenAI-compatible endpoints. Key stays in your browser localStorage and is sent as <code>X-LLM-API-Key</code>.</p>
          <div class="results-actions">
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn btn-ghost" data-action="clear-key">Clear key</button>
          </div>
        </form>
      </section>`;
  }

  function render() {
    let html = "";
    if (state.screen === "home") html = renderHome();
    else if (state.screen === "domains") html = renderDomains();
    else if (state.screen === "quiz") html = renderQuiz();
    else if (state.screen === "results") html = renderResults();
    else if (state.screen === "learn") html = renderLearn();
    else if (state.screen === "learn-done") html = renderLearnDone();
    else if (state.screen === "micro") html = renderMicroList();
    else if (state.screen === "micro-topic") html = renderMicroTopic();
    else if (state.screen === "settings") html = renderSettings();
    app.innerHTML = toastHtml() + html;
  }

  app.addEventListener("click", async (e) => {
    const start = e.target.closest("[data-start]");
    if (start) {
      await startDomain(start.getAttribute("data-start"), { regenerate: true });
      return;
    }

    const micro = e.target.closest("[data-micro]");
    if (micro) {
      state.module = "micro";
      await openMicroTopic(micro.getAttribute("data-micro"));
      return;
    }

    const choice = e.target.closest("[data-choice]");
    if (choice && (state.screen === "quiz" || (state.screen === "micro-topic" && state.microTab === "quiz"))) {
      selectChoice(Number(choice.getAttribute("data-choice")));
      return;
    }

    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.getAttribute("data-action");

    if (action === "module-learn") chooseModule("learn");
    else if (action === "module-quiz") chooseModule("quiz");
    else if (action === "module-micro") chooseModule("micro");
    else if (action === "home") goHome();
    else if (action === "settings") {
      state.settingsDraft = HelixAPI.loadSettings();
      state.screen = "settings";
      render();
    } else if (action === "clear-key") {
      HelixAPI.saveSettings({ apiKey: "" });
      state.settingsDraft = HelixAPI.loadSettings();
      setToast("API key cleared");
      render();
    } else if (action === "domains") {
      state.screen = "domains";
      resetProgress();
      render();
    } else if (action === "next") nextQuestion();
    else if (action === "flip") flipCard();
    else if (action === "next-card") nextCard();
    else if (action === "prev-card") prevCard();
    else if (action === "regenerate") await reshuffleOrRegenerate();
    else if (action === "quiz-domain") {
      state.module = "quiz";
      await startDomain(state.domainId, { regenerate: true });
    } else if (action === "study-domain") {
      state.module = "learn";
      await startDomain(state.domainId, { regenerate: true });
    } else if (action === "micro-tab-lesson") {
      state.microTab = "lesson";
      render();
    } else if (action === "micro-tab-cards") {
      state.microTab = "cards";
      state.flipped = false;
      render();
    } else if (action === "micro-tab-quiz") {
      state.microTab = "quiz";
      state.index = 0;
      state.selected = null;
      state.locked = false;
      state.answers = [];
      render();
    }
  });

  app.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-action='save-settings']");
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    HelixAPI.saveSettings({
      mode: String(fd.get("mode") || "auto"),
      apiKey: String(fd.get("apiKey") || "").trim(),
      baseUrl: String(fd.get("baseUrl") || "").trim(),
      model: String(fd.get("model") || "").trim(),
    });
    state.settingsDraft = HelixAPI.loadSettings();
    setToast("Settings saved");
    state.screen = "home";
    render();
  });

  brandHome.addEventListener("click", (e) => {
    e.preventDefault();
    goHome();
  });

  probeHealth().finally(render);
  render();
})();
