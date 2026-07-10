/**
 * HelixBench API client + settings (localStorage).
 */
const HelixAPI = (() => {
  const SETTINGS_KEY = "helixbench.settings.v1";

  const defaults = {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    mode: "auto", // auto | ai | local
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
      const msg = (data && (data.detail || data.message)) || resp.statusText;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  async function health() {
    return request("/api/health");
  }

  async function microTopics() {
    return request("/api/micro-topics");
  }

  async function generateQuiz(domain, n = 10) {
    const s = loadSettings();
    return request("/api/generate/quiz", {
      method: "POST",
      body: JSON.stringify({
        domain,
        n,
        mode: s.mode,
        api_key: s.apiKey || undefined,
        base_url: s.baseUrl || undefined,
        model: s.model || undefined,
      }),
    });
  }

  async function generateFlashcards(domain, n = 12) {
    const s = loadSettings();
    return request("/api/generate/flashcards", {
      method: "POST",
      body: JSON.stringify({
        domain,
        n,
        mode: s.mode,
        api_key: s.apiKey || undefined,
        base_url: s.baseUrl || undefined,
        model: s.model || undefined,
      }),
    });
  }

  async function generateMicro(topicId, nQuiz = 6, nCards = 6) {
    const s = loadSettings();
    return request("/api/generate/micro", {
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
  }

  return {
    loadSettings,
    saveSettings,
    health,
    microTopics,
    generateQuiz,
    generateFlashcards,
    generateMicro,
  };
})();
