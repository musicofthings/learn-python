/**
 * Cloudflare KV content cache (shared across edge).
 */

const DEFAULT_TTL = 24 * 60 * 60; // 24h

export function ttlSeconds(env) {
  const n = Number(env.CACHE_TTL_SECONDS || DEFAULT_TTL);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL;
}

export async function makeKey(kind, parts) {
  const payload = { kind, ...Object.fromEntries(Object.keys(parts).sort().map((k) => [k, parts[k]])) };
  const raw = JSON.stringify(payload);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 40);
}

export async function cacheGet(env, key) {
  if (!env.HELIX_CACHE) return null;
  const raw = await env.HELIX_CACHE.get(key, "json");
  if (!raw || !raw.expires_at) return null;
  const now = Date.now() / 1000;
  if (raw.expires_at <= now) {
    await env.HELIX_CACHE.delete(key);
    return null;
  }
  const data = { ...(raw.data || {}) };
  data._cache = {
    hit: true,
    layer: "kv",
    age_seconds: Math.max(0, Math.floor(now - (raw.created_at || now))),
    expires_at: raw.expires_at,
  };
  return data;
}

export async function cacheSet(env, key, data) {
  const ttl = ttlSeconds(env);
  const now = Date.now() / 1000;
  const store = { ...data };
  delete store._cache;
  const blob = {
    created_at: now,
    expires_at: now + ttl,
    ttl,
    data: store,
  };
  if (env.HELIX_CACHE) {
    await env.HELIX_CACHE.put(key, JSON.stringify(blob), { expirationTtl: Math.max(60, ttl) });
  }
  return {
    ...store,
    _cache: { hit: false, layer: "miss", age_seconds: 0, expires_at: blob.expires_at },
  };
}

export async function cacheStats(env) {
  return {
    layer: "kv",
    ttl_seconds: ttlSeconds(env),
    binding: env.HELIX_CACHE ? "HELIX_CACHE" : null,
    note: "KV list is eventually consistent; use clear to wipe known keys via prefix scan if enabled.",
  };
}

export async function cacheClear(env) {
  if (!env.HELIX_CACHE || typeof env.HELIX_CACHE.list !== "function") {
    return { cleared: 0, warning: "KV list unavailable" };
  }
  let cleared = 0;
  let cursor;
  do {
    const page = await env.HELIX_CACHE.list({ cursor, limit: 1000 });
    await Promise.all((page.keys || []).map((k) => env.HELIX_CACHE.delete(k.name)));
    cleared += (page.keys || []).length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { cleared };
}
