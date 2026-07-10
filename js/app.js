(() => {
  const app = document.getElementById("app");
  const brandHome = document.getElementById("brand-home");

  const state = {
    screen: "home",
    domainId: null,
    questions: [],
    index: 0,
    selected: null,
    locked: false,
    answers: [],
  };

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Shuffle answer choices and remap the correct index. */
  function prepareQuestion(q) {
    const order = shuffle(q.choices.map((_, i) => i));
    return {
      ...q,
      choices: order.map((i) => q.choices[i]),
      answer: order.indexOf(q.answer),
    };
  }

  function pickSession(domainId) {
    const pool = QUESTIONS[domainId] || [];
    return shuffle(pool).slice(0, SESSION_SIZE).map(prepareQuestion);
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

  function goHome() {
    state.screen = "home";
    state.domainId = null;
    state.questions = [];
    state.index = 0;
    state.selected = null;
    state.locked = false;
    state.answers = [];
    render();
  }

  function startDomain(domainId) {
    state.screen = "quiz";
    state.domainId = domainId;
    state.questions = pickSession(domainId);
    state.index = 0;
    state.selected = null;
    state.locked = false;
    state.answers = [];
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

  function domainById(id) {
    return DOMAINS.find((d) => d.id === id);
  }

  function renderHome() {
    return `
      <section class="screen hero" aria-labelledby="hero-title">
        <h1 class="hero-brand" id="hero-title">HelixBench</h1>
        <p class="hero-lead">
          Interactive BioPython quiz for pharma computational biology —
          genomics, chemistry, molecular structure, biologics, docking, and clinical translation for AI drug discovery interviews.
        </p>
        <div class="hero-cta">
          <button type="button" class="btn btn-primary" data-action="scroll-domains">Choose a domain</button>
        </div>
        <p class="levels-label" id="domains">Session · 10 multiple-choice · shuffled each run · instant feedback</p>
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
          <span class="quiz-level">${escapeHtml(domain.name)}</span>
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
    else if (pct >= 50) verdict = "Core gaps to close before a CompBio onsite — focus on the red items below.";
    else verdict = "Revisit this domain’s fundamentals, then re-quiz after a focused pass.";

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
        <h2 id="results-title">${escapeHtml(domain.name)} complete</h2>
        <p class="results-sub">${pct}% · ${escapeHtml(verdict)}</p>
        <div class="results-breakdown">${rows}</div>
        <div class="results-actions">
          <button type="button" class="btn btn-primary" data-action="retry">Retry ${escapeHtml(domain.name)}</button>
          <button type="button" class="btn btn-ghost" data-action="home">Choose another domain</button>
        </div>
      </section>
    `;
  }

  function render() {
    if (state.screen === "home") app.innerHTML = renderHome();
    else if (state.screen === "quiz") app.innerHTML = renderQuiz();
    else app.innerHTML = renderResults();
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

    if (action === "scroll-domains") {
      document.getElementById("domains")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (action === "next") {
      nextQuestion();
    } else if (action === "retry") {
      startDomain(state.domainId);
    } else if (action === "home") {
      goHome();
    }
  });

  brandHome.addEventListener("click", (e) => {
    e.preventDefault();
    goHome();
  });

  render();
})();
