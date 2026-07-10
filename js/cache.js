/**
 * Browser content cache (localStorage) — instant module loads.
 */
const HelixCache = (() => {
  const PREFIX = "helixbench.content.v1:";
  const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

  function key(parts) {
    return PREFIX + parts.filter(Boolean).join("|");
  }

  function get(cacheKey) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const blob = JSON.parse(raw);
      if (!blob || !blob.expires_at || Date.now() > blob.expires_at) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      const data = blob.data || null;
      if (data) {
        data._cache = {
          hit: true,
          layer: "browser",
          age_seconds: Math.max(0, Math.floor((Date.now() - (blob.created_at || Date.now())) / 1000)),
          expires_at: blob.expires_at / 1000,
        };
      }
      return data;
    } catch {
      return null;
    }
  }

  function set(cacheKey, data, ttlMs) {
    const ttl = ttlMs == null ? DEFAULT_TTL_MS : ttlMs;
    const created = Date.now();
    const store = { ...(data || {}) };
    delete store._cache;
    const blob = {
      created_at: created,
      expires_at: created + ttl,
      data: store,
    };
    try {
      localStorage.setItem(cacheKey, JSON.stringify(blob));
    } catch {
      // quota — drop oldest helix cache keys
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
      keys.slice(0, Math.ceil(keys.length / 3)).forEach((k) => localStorage.removeItem(k));
      try {
        localStorage.setItem(cacheKey, JSON.stringify(blob));
      } catch {
        /* ignore */
      }
    }
    return {
      ...store,
      _cache: { hit: false, layer: "browser-write", age_seconds: 0, expires_at: blob.expires_at / 1000 },
    };
  }

  function quizKey(domain, n, mode, model) {
    return key(["quiz", domain, n, mode, model || "default"]);
  }
  function flashKey(domain, n, mode, model) {
    return key(["flash", domain, n, mode, model || "default"]);
  }
  function microKey(topicId, nQuiz, nCards, mode, model) {
    return key(["micro", topicId, nQuiz, nCards, mode, model || "default"]);
  }

  function clear() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    return { cleared: keys.length };
  }

  return { get, set, quizKey, flashKey, microKey, clear, DEFAULT_TTL_MS };
})();
