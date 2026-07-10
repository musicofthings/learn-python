/**
 * HelixBench Cloudflare Worker
 * - Serves static frontend via Assets binding
 * - /api/* generation with OpenRouter + KV cache
 */

import topicsData from "./topics-data.json";
import { makeKey, cacheGet, cacheSet, cacheStats, cacheClear } from "./cache.js";
import { generateQuizAi, generateFlashAi, generateMicroAi } from "./llm.js";

const DOMAIN_FOCUS = {
  genomics: "BioPython SeqIO/Entrez/MSA, CRISPR oligos, reference builds, expression QC",
  chemistry: "SMILES, RDKit, fingerprints, ADMET, QSAR curation, generative chemistry",
  molecular: "PDB/mmCIF, pockets, AlphaFold confidence, protein LMs, target ID",
  biologics: "antibodies, CDRs, developability, PTMs, humanization, orthologs",
  docking: "docking prep, poses, IFPs, enrichment, covalent, induced fit",
  clinical: "assays, pIC50, scaffold splits, PK, biomarkers, uncertainty, privacy",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-LLM-API-Key",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function getTopic(id) {
  return (topicsData.topics || []).find((t) => t.id === id) || null;
}

function resolveKey(body, request, env) {
  const header = request.headers.get("X-LLM-API-Key") || "";
  return String(body?.api_key || header || env.LLM_API_KEY || "").trim();
}

function wantAi(mode, key) {
  if (mode === "local") return false;
  if (mode === "ai") return true;
  return Boolean(key);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (path === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "helixbench",
      runtime: "cloudflare-worker",
      llm_key_configured: Boolean(env.LLM_API_KEY),
      default_model: env.LLM_MODEL || "openai/gpt-4o-mini",
      default_base_url: env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
      provider: "openrouter",
      micro_topics: (topicsData.topics || []).length,
      cache: await cacheStats(env),
    });
  }

  if (path === "/api/domains" && request.method === "GET") {
    return json({
      domains: Object.entries(DOMAIN_FOCUS).map(([id, focus]) => ({ id, focus })),
    });
  }

  if (path === "/api/micro-topics" && request.method === "GET") {
    const topics = (topicsData.topics || []).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      blurb: t.blurb,
      tags: t.tags,
      lesson: t.lesson,
      code_examples: t.code_examples || [],
    }));
    return json({ topics });
  }

  if (path.startsWith("/api/micro-topics/") && request.method === "GET") {
    const id = path.slice("/api/micro-topics/".length);
    const topic = getTopic(id);
    if (!topic) return json({ detail: `Unknown topic ${id}` }, 404);
    return json({ topic });
  }

  if (path === "/api/providers" && request.method === "GET") {
    return json({
      default: "openrouter",
      providers: [
        {
          id: "openrouter",
          name: "OpenRouter",
          base_url: "https://openrouter.ai/api/v1",
          models: [
            "openai/gpt-4o-mini",
            "openai/gpt-4o",
            "anthropic/claude-3.5-sonnet",
            "google/gemini-2.0-flash-001",
            "meta-llama/llama-3.3-70b-instruct",
            "deepseek/deepseek-chat",
          ],
          key_url: "https://openrouter.ai/keys",
        },
        {
          id: "openai",
          name: "OpenAI",
          base_url: "https://api.openai.com/v1",
          models: ["gpt-4o-mini", "gpt-4o"],
          key_url: "https://platform.openai.com/api-keys",
        },
      ],
    });
  }

  if (path === "/api/cache/stats" && request.method === "GET") {
    return json(await cacheStats(env));
  }

  if (path === "/api/cache/clear" && request.method === "POST") {
    return json(await cacheClear(env));
  }

  if (path === "/api/generate/quiz" && request.method === "POST") {
    return handleGenerateQuiz(request, env);
  }
  if (path === "/api/generate/flashcards" && request.method === "POST") {
    return handleGenerateFlash(request, env);
  }
  if (path === "/api/generate/micro" && request.method === "POST") {
    return handleGenerateMicro(request, env);
  }

  return json({ detail: "Not found" }, 404);
}

async function handleGenerateQuiz(request, env) {
  const body = await request.json().catch(() => ({}));
  const domain = String(body.domain || "");
  const n = Math.min(20, Math.max(1, Number(body.n) || 10));
  const mode = body.mode || "auto";
  const key = resolveKey(body, request, env);
  const model = body.model || env.LLM_MODEL || "openai/gpt-4o-mini";
  const useAi = wantAi(mode, key);
  const cacheKey = await makeKey("quiz", {
    domain,
    n,
    mode: useAi ? "ai" : "local",
    model: useAi ? model : "local",
  });

  if (!body.refresh) {
    const cached = await cacheGet(env, cacheKey);
    if (cached) return json(cached);
  }

  if (!useAi) {
    return json(
      {
        detail:
          "Local template generation is client-side on Cloudflare. Set mode=ai/auto with an API key, or use the browser fallback.",
      },
      400
    );
  }
  if (!key) return json({ detail: "AI mode requires an API key" }, 400);

  const topic = getTopic(domain);
  const focus = topic?.quiz_focus || DOMAIN_FOCUS[domain] || domain;
  const seed = body.seed || crypto.randomUUID().replace(/-/g, "");

  try {
    const questions = await generateQuizAi({
      domain,
      focus,
      n,
      apiKey: key,
      baseUrl: body.base_url || env.LLM_BASE_URL,
      model,
      exclude: body.exclude || [],
    });
    const payload = {
      domain,
      source: "ai",
      seed,
      generated_at: Date.now() / 1000,
      questions,
      warning: null,
    };
    return json(await cacheSet(env, cacheKey, payload));
  } catch (err) {
    return json({ detail: String(err.message || err) }, 502);
  }
}

async function handleGenerateFlash(request, env) {
  const body = await request.json().catch(() => ({}));
  const domain = String(body.domain || "");
  const n = Math.min(30, Math.max(1, Number(body.n) || 12));
  const mode = body.mode || "auto";
  const key = resolveKey(body, request, env);
  const model = body.model || env.LLM_MODEL || "openai/gpt-4o-mini";
  const useAi = wantAi(mode, key);
  const cacheKey = await makeKey("flash", {
    domain,
    n,
    mode: useAi ? "ai" : "local",
    model: useAi ? model : "local",
  });

  if (!body.refresh) {
    const cached = await cacheGet(env, cacheKey);
    if (cached) return json(cached);
  }

  if (!useAi) {
    return json(
      { detail: "Local generation is client-side on Cloudflare. Use AI mode or browser fallback." },
      400
    );
  }
  if (!key) return json({ detail: "AI mode requires an API key" }, 400);

  const topic = getTopic(domain);
  const focus = topic?.quiz_focus || DOMAIN_FOCUS[domain] || domain;
  const seed = body.seed || crypto.randomUUID().replace(/-/g, "");

  try {
    const cards = await generateFlashAi({
      domain,
      focus,
      n,
      apiKey: key,
      baseUrl: body.base_url || env.LLM_BASE_URL,
      model,
      exclude: body.exclude || [],
    });
    const payload = {
      domain,
      source: "ai",
      seed,
      generated_at: Date.now() / 1000,
      cards,
      warning: null,
    };
    return json(await cacheSet(env, cacheKey, payload));
  } catch (err) {
    return json({ detail: String(err.message || err) }, 502);
  }
}

async function handleGenerateMicro(request, env) {
  const body = await request.json().catch(() => ({}));
  const topicId = String(body.topic_id || "");
  const topic = getTopic(topicId);
  if (!topic) return json({ detail: `Unknown topic ${topicId}` }, 404);

  const nQuiz = Math.min(15, Math.max(1, Number(body.n_quiz) || 6));
  const nCards = Math.min(20, Math.max(1, Number(body.n_cards) || 6));
  const mode = body.mode || "auto";
  const key = resolveKey(body, request, env);
  const model = body.model || env.LLM_MODEL || "openai/gpt-4o-mini";
  const useAi = wantAi(mode, key);
  const cacheKey = await makeKey("micro", {
    topic_id: topicId,
    n_quiz: nQuiz,
    n_cards: nCards,
    mode: useAi ? "ai" : "local",
    model: useAi ? model : "local",
  });

  if (!body.refresh) {
    const cached = await cacheGet(env, cacheKey);
    if (cached) return json(cached);
  }

  if (!useAi) {
    return json(
      { detail: "Local generation is client-side on Cloudflare. Use AI mode or browser fallback." },
      400
    );
  }
  if (!key) return json({ detail: "AI mode requires an API key" }, 400);

  const seed = body.seed || crypto.randomUUID().replace(/-/g, "");

  try {
    const practice = await generateMicroAi({
      topicName: topic.name,
      quizFocus: topic.quiz_focus,
      nQuiz,
      nCards,
      apiKey: key,
      baseUrl: body.base_url || env.LLM_BASE_URL,
      model,
      exclude: body.exclude || [],
    });
    const payload = {
      topic_id: topicId,
      topic: {
        id: topic.id,
        name: topic.name,
        category: topic.category,
        blurb: topic.blurb,
        tags: topic.tags,
        lesson: topic.lesson,
        code_examples: topic.code_examples || [],
      },
      source: "ai",
      seed,
      generated_at: Date.now() / 1000,
      quiz: practice.quiz || [],
      flashcards: practice.flashcards || [],
      warning: null,
    };
    return json(await cacheSet(env, cacheKey, payload));
  } catch (err) {
    return json({ detail: String(err.message || err) }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, ctx);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("HelixBench Worker — static assets not bound. Run prepare-assets + wrangler deploy.", {
      status: 404,
    });
  },
};
