(() => {
  const app = document.getElementById("app");
  const brandHome = document.getElementById("brand-home");

  const state = {
    screen: "home", // home | domains | quiz | results | learn | learn-done
    module: null, // "quiz" | "learn"
    domainId: null,
    questions: [],
    index: 0,
    selected: null,
    locked: false,
    answers: [],
    cards: [],
    cardIndex: 0,
    flipped: false,
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

  function pickQuizSession(domainId) {
    const pool = QUESTIONS[domainId] || [];
    return shuffle(pool).slice(0, SESSION_SIZE).map(prepareQuestion);
  }

  function pickLearnSession(domainId) {
    const pool = FLASHCARDS[domainId] || [];
    return shuffle(pool);
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

  function resetProgress() {
    state.questions = [];
    state.index = 0;
    state.selected = null;
    state.locked = false;
    state.answers = [];
    state.cards = [];
    state.cardIndex = 0;
    state.flipped = false;
  }

  function goHome() {
    state.screen = "home";
    state.module = null;
    state.domainId = null;
    resetProgress();
    render();
  }

  function chooseModule(module) {
    state.module = module;
    state.screen = "domains";
    state.domainId = null;
    resetProgress();
    render();
  }

  function startDomain(domainId) {
    state.domainId = domainId;
    if (state.module === "learn") {
      state.screen = "learn";
      state.cards = pickLearnSession(domainId);
      state.cardIndex = 0;
      state.flipped = false;
    } else {
      state.screen = "quiz";
      state.questions = pickQuizSession(domainId);
      state.index = 0;
      state.selected = null;
      state.locked = false;
      state.answers = [];
    }
    render();
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
      state.screen = "results";
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

  function reshuffleCards() {
    state.cards = pickLearnSession(state.domainId);
    state.cardIndex = 0;
    state.flipped = false;
    state.screen = "learn";
    render();
  }

  function renderHome() {
    return `
      <section class="screen hero" aria-labelledby="hero-title">
        <h1 class="hero-brand" id="hero-title">HelixBench</h1>
        <p class="hero-lead">
          Learn and test BioPython for pharma computational biology —
          matched flashcards and quizzes across genomics, chemistry, molecular structure, biologics, docking, and clinical translation.
        </p>
        <p class="levels-label">Choose a module</p>
        <div class="module-grid" role="list">
          <button type="button" class="module-card" role="listitem" data-action="module-learn">
            <span class="module-kicker">Learning</span>
            <span class="module-name">Flashcards</span>
            <span class="module-desc">Study domain topics with shuffled cards — same topics as the quiz banks.</span>
          </button>
          <button type="button" class="module-card" role="listitem" data-action="module-quiz">
            <span class="module-kicker">Assessment</span>
            <span class="module-name">Quiz</span>
            <span class="module-desc">10 multiple-choice questions per domain with instant green/red feedback.</span>
          </button>
        </div>
      </section>
    `;
  }

  function renderDomains() {
    const isLearn = state.module === "learn";
    const title = isLearn ? "Flashcards by domain" : "Quiz by domain";
    const blurb = isLearn
      ? "Pick a category. Cards are shuffled every session and mirror quiz topics one-to-one."
      : "Pick a category. Questions and answer choices are shuffled every session.";

    return `
      <section class="screen hero domains-screen" aria-labelledby="domains-title">
        <button type="button" class="back-link" data-action="home">← All modules</button>
        <h1 class="section-title" id="domains-title">${title}</h1>
        <p class="hero-lead">${blurb}</p>
        <p class="levels-label" id="domains">Domains</p>
        <div class="level-grid domain-grid" role="list">
          ${DOMAINS.map(
            (domain) => `
            <button type="button" class="level-option" role="listitem" data-start="${domain.id}">
              <span class="level-name">${escapeHtml(domain.name)}</span>
              <span class="level-meta">${escapeHtml(domain.meta)}</span>
              <span class="level-desc">${escapeHtml(domain.desc)}</span>
            </button>`
          ).join("")}
        </div>
      </section>
    `;
  }

  function renderQuiz() {
    const domain = domainById(state.domainId);
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
      ? `
        <div class="feedback ${isCorrect ? "correct" : "wrong"}" role="status">
          <strong>${isCorrect ? "Correct" : "Not quite"}</strong>
          <p>${escapeHtml(q.explanation)}</p>
        </div>`
      : "";

    const code = q.code
      ? `<pre class="question-code">${escapeHtml(q.code)}</pre>`
      : "";

    return `
      <section class="screen quiz" aria-labelledby="q-title">
        <div class="quiz-top">
          <span class="quiz-level">Quiz · ${escapeHtml(domain.name)}</span>
          <span class="quiz-progress-text">Question ${step} of ${n}</span>
        </div>
        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <article class="question-panel">
          <span class="question-topic">${escapeHtml(q.topic)}</span>
          <h2 class="question-text" id="q-title">${escapeHtml(q.question)}</h2>
          ${code}
          <ul class="choices">${choices}</ul>
          ${feedback}
          <div class="quiz-actions">
            <button type="button" class="btn btn-ghost" data-action="domains">Domains</button>
            <button type="button" class="btn btn-primary" data-action="next" ${answered ? "" : "disabled"}>
              ${step === n ? "See results" : "Next question"}
            </button>
          </div>
        </article>
      </section>
    `;
  }

  function renderResults() {
    const domain = domainById(state.domainId);
    const total = state.answers.length;
    const score = state.answers.filter((a) => a.correct).length;
    const pct = total ? Math.round((score / total) * 100) : 0;

    let verdict;
    if (pct >= 90) verdict = "Interview-ready depth in this domain — dig into edge cases next.";
    else if (pct >= 70) verdict = "Solid working knowledge. Review the misses and re-run the session.";
    else if (pct >= 50) verdict = "Core gaps to close before a CompBio onsite — study the flashcards, then retry.";
    else verdict = "Study this domain’s flashcards, then re-quiz after a focused pass.";

    const rows = state.answers
      .map(
        (a, i) => `
        <div class="result-row">
          <span class="result-badge ${a.correct ? "ok" : "no"}" aria-label="${a.correct ? "Correct" : "Incorrect"}">${a.correct ? "✓" : "✗"}</span>
          <div>
            <strong>Q${i + 1} · ${escapeHtml(a.topic)}</strong><br />
            <span>${escapeHtml(a.question)}</span>
          </div>
        </div>`
      )
      .join("");

    return `
      <section class="screen results" aria-labelledby="results-title">
        <div class="results-score-ring" style="--pct:${pct}">
          <div class="results-score-inner">${score}/${total}</div>
        </div>
        <h2 id="results-title">${escapeHtml(domain.name)} quiz complete</h2>
        <p class="results-sub">${pct}% · ${escapeHtml(verdict)}</p>
        <div class="results-breakdown">${rows}</div>
        <div class="results-actions">
          <button type="button" class="btn btn-primary" data-action="retry">Retry quiz</button>
          <button type="button" class="btn btn-ghost" data-action="study-domain">Study flashcards</button>
          <button type="button" class="btn btn-ghost" data-action="domains">Other domains</button>
        </div>
      </section>
    `;
  }

  function renderLearn() {
    const domain = domainById(state.domainId);
    const card = state.cards[state.cardIndex];
    const n = state.cards.length;
    const step = state.cardIndex + 1;
    const pct = (state.cardIndex / n) * 100;
    const side = state.flipped ? "back" : "front";
    const body = state.flipped ? card.back : card.front;

    return `
      <section class="screen learn" aria-labelledby="card-title">
        <div class="quiz-top">
          <span class="quiz-level">Learn · ${escapeHtml(domain.name)}</span>
          <span class="quiz-progress-text">Card ${step} of ${n}</span>
        </div>
        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <button type="button" class="flashcard ${state.flipped ? "is-flipped" : ""}" data-action="flip" aria-pressed="${state.flipped}">
          <span class="question-topic">${escapeHtml(card.topic)}</span>
          <span class="flashcard-side-label">${side === "front" ? "Prompt" : "Answer"}</span>
          <span class="flashcard-body" id="card-title">${escapeHtml(body)}</span>
          <span class="flashcard-hint">${state.flipped ? "Click to show prompt" : "Click to reveal answer"}</span>
        </button>
        <div class="learn-actions">
          <button type="button" class="btn btn-ghost" data-action="prev-card" ${state.cardIndex === 0 ? "disabled" : ""}>Previous</button>
          <button type="button" class="btn btn-ghost" data-action="flip">${state.flipped ? "Show prompt" : "Reveal"}</button>
          <button type="button" class="btn btn-primary" data-action="next-card">
            ${step === n ? "Finish deck" : "Next card"}
          </button>
        </div>
        <div class="learn-secondary">
          <button type="button" class="btn btn-ghost" data-action="reshuffle">Shuffle deck</button>
          <button type="button" class="btn btn-ghost" data-action="quiz-domain">Take quiz</button>
          <button type="button" class="btn btn-ghost" data-action="domains">Domains</button>
        </div>
      </section>
    `;
  }

  function renderLearnDone() {
    const domain = domainById(state.domainId);
    const n = state.cards.length;
    return `
      <section class="screen results" aria-labelledby="learn-done-title">
        <h2 id="learn-done-title">${escapeHtml(domain.name)} deck complete</h2>
        <p class="results-sub">You reviewed ${n} shuffled flashcards — topics match the ${escapeHtml(domain.name)} quiz bank.</p>
        <div class="results-actions">
          <button type="button" class="btn btn-primary" data-action="reshuffle">Shuffle &amp; restudy</button>
          <button type="button" class="btn btn-ghost" data-action="quiz-domain">Take ${escapeHtml(domain.name)} quiz</button>
          <button type="button" class="btn btn-ghost" data-action="domains">Other domains</button>
        </div>
      </section>
    `;
  }

  function render() {
    if (state.screen === "home") app.innerHTML = renderHome();
    else if (state.screen === "domains") app.innerHTML = renderDomains();
    else if (state.screen === "quiz") app.innerHTML = renderQuiz();
    else if (state.screen === "results") app.innerHTML = renderResults();
    else if (state.screen === "learn") app.innerHTML = renderLearn();
    else if (state.screen === "learn-done") app.innerHTML = renderLearnDone();
  }

  app.addEventListener("click", (e) => {
    const start = e.target.closest("[data-start]");
    if (start) {
      startDomain(start.getAttribute("data-start"));
      return;
    }

    const choice = e.target.closest("[data-choice]");
    if (choice && state.screen === "quiz") {
      selectChoice(Number(choice.getAttribute("data-choice")));
      return;
    }

    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.getAttribute("data-action");

    if (action === "module-learn") chooseModule("learn");
    else if (action === "module-quiz") chooseModule("quiz");
    else if (action === "home") goHome();
    else if (action === "domains") {
      state.screen = "domains";
      resetProgress();
      render();
    } else if (action === "next") nextQuestion();
    else if (action === "retry") startDomain(state.domainId);
    else if (action === "flip") flipCard();
    else if (action === "next-card") nextCard();
    else if (action === "prev-card") prevCard();
    else if (action === "reshuffle") reshuffleCards();
    else if (action === "study-domain") {
      state.module = "learn";
      startDomain(state.domainId);
    } else if (action === "quiz-domain") {
      state.module = "quiz";
      startDomain(state.domainId);
    }
  });

  brandHome.addEventListener("click", (e) => {
    e.preventDefault();
    goHome();
  });

  render();
})();
