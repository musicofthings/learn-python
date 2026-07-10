# Deploy HelixBench on Cloudflare

Recommended path: **one Worker** that serves the static UI (Assets) and `/api/*` (OpenRouter + **KV cache**).

```
Browser cache (localStorage, 24h)
        ↓ miss
Worker KV cache (shared edge, 24h)
        ↓ miss
OpenRouter LLM
```

Local FastAPI keeps the same API + disk/memory cache for `python3 start.py`.

## Prerequisites

- Cloudflare account
- Node.js 18+
- OpenRouter API key ([openrouter.ai/keys](https://openrouter.ai/keys))

## One-time setup

```bash
cd cloudflare
npm install
npx wrangler login
```

Optional shared OpenRouter key (users can still paste a key in **AI settings**):

```bash
npx wrangler secret put LLM_API_KEY
```

## Deploy (works without KV)

```bash
cd cloudflare
npm install
npm run deploy
```

`wrangler.toml` ships **without** a KV binding so deploy does not fail on placeholder ids. Browser cache still works.

Open the `*.workers.dev` URL printed by Wrangler (or attach a custom domain).

### Optional: enable Workers KV (shared edge cache)

```bash
npx wrangler kv namespace create HELIX_CACHE
npx wrangler kv namespace create HELIX_CACHE --preview
```

Uncomment the `[[kv_namespaces]]` block in `wrangler.toml` and paste the real ids, then `npm run deploy` again.

## Local Worker preview

```bash
cd cloudflare
npm run dev
```

## Cache behavior

| Layer | Where | TTL | Bypass |
|-------|--------|-----|--------|
| Browser | `js/cache.js` localStorage | 24h | **Generate fresh** / clear history |
| Server (local) | `.cache/helixbench/` + memory | 24h (`CACHE_TTL_SECONDS`) | `refresh: true` |
| Cloudflare | KV `HELIX_CACHE` | 24h | `refresh: true` or `POST /api/cache/clear` |

First open of a domain/topic generates (slow). Re-open is instant from browser cache; other devices/browsers hit KV after the first edge generation.

## Architecture choices

### A. Worker + Assets + KV (this folder) — recommended

- Single deploy, same origin for UI and API
- KV shared cache across users
- AI generation in the Worker (JS port of OpenRouter prompts)
- Local/template mode stays in the browser (`js/generator.js`) if API/key missing

### B. Pages-only (static)

```bash
# From repo root — upload only frontend files
npx wrangler pages deploy . --project-name=helixbench \
  --commit-dirty=true
# Or connect the Git repo in Pages and set build output to include index.html/css/js
```

Works offline with embedded lessons + local generator + browser cache. No shared server cache; AI only if you add Functions or point the UI at another API host.

### C. Pages UI + FastAPI elsewhere

1. Deploy static UI on Pages
2. Run FastAPI on Fly.io / Railway / a VM
3. Either same-origin reverse proxy, or set the frontend to call that API host (CORS already open on FastAPI)

Use when you want to keep the Python generators as the source of truth.

## Secrets & safety

- Prefer `wrangler secret put LLM_API_KEY` for a shared key
- UI keys live in the user’s browser (`localStorage`) and are sent as `X-LLM-API-Key` — fine for personal use; for a public site, use the Worker secret and leave the UI key empty
- Do not commit `server/.env` or real KV ids if your org treats them as sensitive (ids alone are not secret, but keep secrets out of git)

## Verify after deploy

1. `GET /api/health` → `runtime: "cloudflare-worker"`, cache binding present
2. Open a quiz domain once (generate) → second load should show a cache badge / be fast
3. **Generate fresh** → new items, `refresh: true` bypasses KV + browser cache
4. `POST /api/cache/clear` → wipes KV entries (admin/ops)

## Custom domain

Cloudflare dashboard → Workers → helixbench → Triggers → Add Custom Domain (e.g. `helixbench.example.com`).
