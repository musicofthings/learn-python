/**
 * HelixBench API client + settings (localStorage).
 * Falls back to in-browser HelixGenerator when the API is unreachable (404 / offline).
 */
const HelixAPI = (() => {
  const SETTINGS_KEY = "helixbench.settings.v1";

  const defaults = {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    mode: "auto",
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...defaults };
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return { ...defaults };
    }
  }

  function saveSettings(partial) {
    const next = { ...loadSettings(), ...partial };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  async function request(path, options = {}) {
    const settings = loadSettings();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (settings.apiKey) {
      headers["X-LLM-API-Key"] = settings.apiKey;
    }
    const resp = await fetch(path, { ...options, headers });
    let data = null;
    const text = await resp.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: text };
    }
    if (!resp.ok) {
      const msg = (data && (data.detail || data.message)) || ("HTTP " + resp.status);
      const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  async function health() {
    return request("/api/health");
  }

  async function microTopics() {
    try {
      return await request("/api/micro-topics");
    } catch (err) {
      const topics = typeof MICRO_TOPICS !== "undefined" ? MICRO_TOPICS : [];
      return { topics, source: "embedded", warning: String(err.message || err) };
    }
  }

  async function generateQuiz(domain, n = 10) {
    const s = loadSettings();
    if (s.mode === "local") return HelixGenerator.quiz(domain, n);
    try {
      return await request("/api/generate/quiz", {
        method: "POST",
        body: JSON.stringify({
          domain, n, mode: s.mode,
          api_key: s.apiKey || undefined,
          base_url: s.baseUrl || undefined,
          model: s.model || undefined,
        }),
      });
    } catch (err) {
      if (s.mode === "ai") throw err;
      const data = HelixGenerator.quiz(domain, n);
      data.warning = "API unavailable (" + err.message + "); used in-browser generator.";
      return data;
    }
  }

  async function generateFlashcards(domain, n = 12) {
    const s = loadSettings();
    if (s.mode === "local") return HelixGenerator.flashcards(domain, n);
    try {
      return await request("/api/generate/flashcards", {
        method: "POST",
        body: JSON.stringify({
          domain, n, mode: s.mode,
          api_key: s.apiKey || undefined,
          base_url: s.baseUrl || undefined,
          model: s.model || undefined,
        }),
      });
    } catch (err) {
      if (s.mode === "ai") throw err;
      const data = HelixGenerator.flashcards(domain, n);
      data.warning = "API unavailable (" + err.message + "); used in-browser generator.";
      return data;
    }
  }

  async function generateMicro(topicId, nQuiz = 6, nCards = 8) {
    const s = loadSettings();
    if (s.mode === "local") return HelixGenerator.micro(topicId, nQuiz, nCards);
    try {
      return await request("/api/generate/micro", {
        method: "POST",
        body: JSON.stringify({
          topic_id: topicId,
          n_quiz: nQuiz,
          n_cards: nCards,
          mode: s.mode,
          api_key: s.apiKey || undefined,
          base_url: s.baseUrl || undefined,
          model: s.model || undefined,
        }),
      });
    } catch (err) {
      if (s.mode === "ai") throw err;
      const data = HelixGenerator.micro(topicId, nQuiz, nCards);
      data.warning = "API unavailable (" + err.message + "); used in-browser generator.";
      return data;
    }
  }

  return {
    loadSettings, saveSettings, health, microTopics,
    generateQuiz, generateFlashcards, generateMicro,
  };
})();
