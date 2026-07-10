/**
 * HelixBench API client + OpenRouter settings.
 * Tracks recent prompts to reduce repeats; falls back to local generator offline.
 */
const HelixAPI = (() => {
  const SETTINGS_KEY = "helixbench.settings.v2";
  const HISTORY_KEY = "helixbench.history.v1";

  const defaults = {
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    mode: "auto", // auto | ai | local
    provider: "openrouter",
  };

  function loadSettings() {
    try {
      // migrate v1 → v2 OpenRouter defaults if user never customized
      const v2 = localStorage.getItem(SETTINGS_KEY);
      if (v2) return { ...defaults, ...JSON.parse(v2) };
      const v1 = localStorage.getItem("helixbench.settings.v1");
      if (v1) {
        const old = JSON.parse(v1);
        const migrated = {
          ...defaults,
          apiKey: old.apiKey || "",
          mode: old.mode || "auto",
        };
        // If they still had stock OpenAI defaults, switch to OpenRouter
        if (!old.baseUrl || old.baseUrl.includes("api.openai.com")) {
          migrated.baseUrl = defaults.baseUrl;
          migrated.model = defaults.model;
          migrated.provider = "openrouter";
        } else {
          migrated.baseUrl = old.baseUrl;
          migrated.model = old.model || defaults.model;
        }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return { ...defaults };
    } catch {
      return { ...defaults };
    }
  }

  function saveSettings(partial) {
    const next = { ...loadSettings(), ...partial };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function rememberPrompts(bucket, prompts) {
    const hist = loadHistory();
    const prev = hist[bucket] || [];
    const merged = [...prompts.filter(Boolean), ...prev]
      .map((p) => String(p).trim())
      .filter(Boolean);
    // unique, newest first, cap
    const seen = new Set();
    const out = [];
    for (const p of merged) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
      if (out.length >= 60) break;
    }
    hist[bucket] = out;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    return out;
  }

  function excludeFor(bucket) {
    return (loadHistory()[bucket] || []).slice(0, 40);
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
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

  async function providers() {
    try {
      return await request("/api/providers");
    } catch {
      return {
        default: "openrouter",
        providers: [
          {
            id: "openrouter",
            name: "OpenRouter",
            base_url: "https://openrouter.ai/api/v1",
            models: [
              "openai/gpt-4o-mini",
              "anthropic/claude-3.5-sonnet",
              "google/gemini-2.0-flash-001",
              "meta-llama/llama-3.3-70b-instruct",
            ],
            key_url: "https://openrouter.ai/keys",
          },
        ],
      };
    }
  }

  async function microTopics() {
    try {
      return await request("/api/micro-topics");
    } catch (err) {
      const topics = typeof MICRO_TOPICS !== "undefined" ? MICRO_TOPICS : [];
      return { topics, source: "embedded", warning: String(err.message || err) };
    }
  }

  function applyProviderPreset(providerId) {
    if (providerId === "openrouter") {
      return saveSettings({
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o-mini",
      });
    }
    if (providerId === "openai") {
      return saveSettings({
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
      });
    }
    return loadSettings();
  }

  async function generateQuiz(domain, n = 10) {
    const s = loadSettings();
    const bucket = `quiz:${domain}`;
    const exclude = excludeFor(bucket);
    if (s.mode === "local") {
      const data = HelixGenerator.quiz(domain, n);
      rememberPrompts(bucket, (data.questions || []).map((q) => q.question));
      return data;
    }
    try {
      const data = await request("/api/generate/quiz", {
        method: "POST",
        body: JSON.stringify({
          domain,
          n,
          mode: s.mode,
          api_key: s.apiKey || undefined,
          base_url: s.baseUrl || undefined,
          model: s.model || undefined,
          exclude,
        }),
      });
      rememberPrompts(bucket, (data.questions || []).map((q) => q.question));
      return data;
    } catch (err) {
      if (s.mode === "ai") throw err;
      const data = HelixGenerator.quiz(domain, n);
      data.warning = "API unavailable (" + err.message + "); used in-browser generator.";
      rememberPrompts(bucket, (data.questions || []).map((q) => q.question));
      return data;
    }
  }

  async function generateFlashcards(domain, n = 12) {
    const s = loadSettings();
    const bucket = `flash:${domain}`;
    const exclude = excludeFor(bucket);
    if (s.mode === "local") {
      const data = HelixGenerator.flashcards(domain, n);
      rememberPrompts(bucket, (data.cards || []).map((c) => c.front));
      return data;
    }
    try {
      const data = await request("/api/generate/flashcards", {
        method: "POST",
        body: JSON.stringify({
          domain,
          n,
          mode: s.mode,
          api_key: s.apiKey || undefined,
          base_url: s.baseUrl || undefined,
          model: s.model || undefined,
          exclude,
        }),
      });
      rememberPrompts(bucket, (data.cards || []).map((c) => c.front));
      return data;
    } catch (err) {
      if (s.mode === "ai") throw err;
      const data = HelixGenerator.flashcards(domain, n);
      data.warning = "API unavailable (" + err.message + "); used in-browser generator.";
      rememberPrompts(bucket, (data.cards || []).map((c) => c.front));
      return data;
    }
  }

  async function generateMicro(topicId, nQuiz = 6, nCards = 8) {
    const s = loadSettings();
    const bucket = `micro:${topicId}`;
    const exclude = excludeFor(bucket);
    if (s.mode === "local") {
      const data = HelixGenerator.micro(topicId, nQuiz, nCards);
      rememberPrompts(
        bucket,
        [...(data.quiz || []).map((q) => q.question), ...(data.flashcards || []).map((c) => c.front)]
      );
      return data;
    }
    try {
      const data = await request("/api/generate/micro", {
        method: "POST",
        body: JSON.stringify({
          topic_id: topicId,
          n_quiz: nQuiz,
          n_cards: nCards,
          mode: s.mode,
          api_key: s.apiKey || undefined,
          base_url: s.baseUrl || undefined,
          model: s.model || undefined,
          exclude,
        }),
      });
      rememberPrompts(
        bucket,
        [...(data.quiz || []).map((q) => q.question), ...(data.flashcards || []).map((c) => c.front)]
      );
      return data;
    } catch (err) {
      if (s.mode === "ai") throw err;
      const data = HelixGenerator.micro(topicId, nQuiz, nCards);
      data.warning = "API unavailable (" + err.message + "); used in-browser generator.";
      rememberPrompts(
        bucket,
        [...(data.quiz || []).map((q) => q.question), ...(data.flashcards || []).map((c) => c.front)]
      );
      return data;
    }
  }

  function hasLiveKey() {
    return Boolean(loadSettings().apiKey);
  }

  return {
    loadSettings,
    saveSettings,
    clearHistory,
    health,
    providers,
    microTopics,
    applyProviderPreset,
    generateQuiz,
    generateFlashcards,
    generateMicro,
    hasLiveKey,
  };
})();
