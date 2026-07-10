# HelixBench

Interactive **learning + quiz + microlearning** app for pharma computational biology / AI drug discovery interview prep.

## Quick start

From the **repo root** (the folder that contains `start.py`):

```bash
python3 start.py
```

Windows:

```bat
start.bat
```

or:

```bash
./start.sh
```

Then open the URL printed in the terminal (usually http://127.0.0.1:8080).

If you see `start.py: not found`, you are probably on an old commit/branch. Run:

```bash
git fetch origin
git checkout cursor/biopy-interview-quiz-2ad1
git pull
python3 start.py
```


## Modules

1. **Flashcards** — domain decks (genomics, chemistry, molecular, biologics, docking, clinical)
2. **Quiz** — 10 MCQs with instant green/red feedback
3. **Microlearning** — deep dives with lesson + practice:
   - Protein language models
   - Protein folding
   - Docking studies
   - Python code reading (“what does this code do?”)
   - BiTE / T-cell engagers
   - Antibody–drug conjugates (ADC)
   - QSAR & molecular ML
   - CRISPR & genomics ops

## Dynamic Q&A (AI / OpenRouter)

1. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Run the app, open **AI settings**, paste the key
3. Default provider is OpenRouter (`openai/gpt-4o-mini`)
4. Click **Generate fresh** on quiz/flashcards/microlearning for unique live items

Recent prompts are stored locally so regenerations avoid repeats.

## Dynamic Q&A (AI)

Questions are **generated on demand**:

- **AI mode** — OpenAI-compatible API (OpenAI, Groq, OpenRouter, …)
- **Local dynamic mode** — template/code generator (no key required)
- **Auto** (default) — AI when a key is set, otherwise local

Configure in the UI (**AI settings**) or via `server/.env`:

```bash
cp server/.env.example server/.env
# set LLM_API_KEY, optional LLM_BASE_URL / LLM_MODEL
```

## Run

```bash
chmod +x start.sh
./start.sh
# or: python3 start.py
```

Then open **http://localhost:8080** (or 8081 if 8080 is busy).

**Important:** Do **not** open `index.html` as a file. Use `./start.sh` / `python3 start.py` so `/api/*` works.

Microlearning lessons also load offline via `js/micro_topics.js`; if the API is down, practice uses the in-browser generator.

Or:

```bash
pip install -r server/requirements.txt
uvicorn server.main:app --host 0.0.0.0 --port 8080
```

## API

- `GET /api/health`
- `GET /api/micro-topics`
- `POST /api/generate/quiz`
- `POST /api/generate/flashcards`
- `POST /api/generate/micro`

## Caching

Modules cache generated content so reopening a domain/topic is instant:

1. **Browser** (`js/cache.js`) — localStorage, 24h TTL
2. **Local API** (`server/cache.py`) — memory + `.cache/helixbench/` on disk, 24h TTL
3. **Cloudflare** (when deployed) — Workers KV binding `HELIX_CACHE`, 24h TTL

- Opening a module uses cache-first (`refresh: false`)
- **Generate fresh** forces regeneration and updates the cache
- Clearing history in AI settings also clears the browser content cache
- Ops: `GET /api/cache/stats`, `POST /api/cache/clear`

Override TTL locally with `CACHE_TTL_SECONDS` (seconds).

## Deploy on Cloudflare

See **[cloudflare/README.md](cloudflare/README.md)** for the full plan.

Short version:

```bash
cd cloudflare
npm install
npx wrangler login
npm run kv:create          # paste ids into wrangler.toml
npx wrangler secret put LLM_API_KEY   # optional shared key
npm run deploy
```

Architecture: Worker serves static UI + `/api/*`, caches AI output in KV. The same frontend works locally via `python3 start.py`.

## Stack

- Frontend: static HTML/CSS/JS
- Backend: FastAPI (`server/`) for generation + static hosting
- Curated banks in `js/questions.js` & `js/flashcards.js` remain as offline fallback
