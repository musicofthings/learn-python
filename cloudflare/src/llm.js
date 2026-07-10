/**
 * OpenRouter / OpenAI-compatible chat → JSON for HelixBench generation.
 */

const QUIZ_SYSTEM = `You are HelixBench, an expert interviewer for pharma computational biology / AI drug discovery.
Generate rigorous, NON-REPETITIVE multiple-choice questions.
Rules:
- Every question must be unique in wording AND concept angle — no paraphrases of each other.
- Prefer BioPython, RDKit, pandas, structure-based design, biologics (BiTE/ADC), docking, pLMs, folding, translational CompBio.
- Exactly 4 choices; exactly one correct; put the correct answer at a RANDOM index (not always 0).
- Explanations must be short and teach something new (1-2 sentences).
- Vary difficulty and include some Python code-reading items when relevant.
Return JSON only:
{"questions":[{"topic":"str","question":"str","code":"optional str","choices":["A","B","C","D"],"answer":0,"explanation":"str"}]}`;

const FLASH_SYSTEM = `You are HelixBench, creating UNIQUE flashcards for pharma CompBio interview prep.
Rules:
- No two cards may share the same prompt or nearly identical answer text.
- Cover distinct subtopics; keep backs dense and practical (2-4 sentences max).
Return JSON only:
{"cards":[{"topic":"str","front":"prompt question","back":"concise answer + why it matters"}]}`;

const MICRO_SYSTEM = `You are HelixBench, generating microlearning PRACTICE for a focused pharma CompBio topic.
Rules:
- Create NEW interview-style questions — do NOT copy lesson sentences verbatim as answer choices.
- No duplicate or near-duplicate questions in the same batch.
- Include Python 'what does this code do' items when useful.
- Exactly 4 choices; correct answer at a random index.
Return JSON only:
{"quiz":[{"topic":"str","question":"str","code":"optional","choices":["A","B","C","D"],"answer":0,"explanation":"str"}],
 "flashcards":[{"topic":"str","front":"str","back":"str"}]}`;

function uuid() {
  return crypto.randomUUID();
}

function extractJson(text) {
  let t = String(text || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!m) throw new Error("Model did not return JSON");
    return JSON.parse(m[1]);
  }
}

function excludeBlock(exclude) {
  if (!Array.isArray(exclude) || !exclude.length) return "";
  const clipped = exclude
    .map((e) => String(e || "").trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 40);
  if (!clipped.length) return "";
  return (
    "\n\nDO NOT repeat or paraphrase any of these recently used prompts:\n" +
    clipped.map((e) => `- ${e}`).join("\n") +
    "\n"
  );
}

function dedupeQuestions(items, n) {
  const seen = new Set();
  const out = [];
  for (const q of items || []) {
    const key = String(q.question || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    const choices = q.choices || [];
    if (choices.length !== 4) continue;
    let ans = Number(q.answer ?? 0);
    if (ans < 0 || ans > 3) ans = 0;
    const item = {
      topic: String(q.topic || "CompBio"),
      question: String(q.question || "").trim(),
      choices: choices.map(String),
      answer: ans,
      explanation: String(q.explanation || "").trim(),
      source: "ai",
      id: String(q.id || uuid()),
    };
    if (q.code) item.code = String(q.code);
    if (item.question) {
      seen.add(key);
      out.push(item);
    }
    if (out.length >= n) break;
  }
  return out;
}

function dedupeCards(items, n) {
  const seen = new Set();
  const out = [];
  for (const c of items || []) {
    const front = String(c.front || "").trim();
    const back = String(c.back || "").trim();
    const key = front.toLowerCase().replace(/\s+/g, " ");
    if (!front || !back || seen.has(key)) continue;
    seen.add(key);
    out.push({
      topic: String(c.topic || "CompBio"),
      front,
      back,
      source: "ai",
      id: String(c.id || uuid()),
    });
    if (out.length >= n) break;
  }
  return out;
}

async function chatJson({ system, user, apiKey, baseUrl, model }) {
  if (!apiKey) throw new Error("Missing API key");
  const base = (baseUrl || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const payload = {
    model: model || "openai/gpt-4o-mini",
    temperature: 0.95,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  };
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (base.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://github.com/musicofthings/learn-python";
    headers["X-Title"] = "HelixBench";
  }

  let resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  if (resp.status === 400) {
    const errText = await resp.text();
    if (errText.includes("response_format")) {
      delete payload.response_format;
      resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    } else {
      throw new Error(`LLM HTTP 400: ${errText.slice(0, 500)}`);
    }
  }
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`LLM HTTP ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Unexpected LLM response");
  return extractJson(content);
}

export async function generateQuizAi({ domain, focus, n, apiKey, baseUrl, model, exclude }) {
  const nonce = uuid().slice(0, 8);
  const user =
    `Domain/category: ${domain}\nFocus: ${focus}\nBatch id: ${nonce}\n` +
    `Generate ${n} brand-new unique interview MCQs. Vary difficulty, topics, and which choice index is correct.\n` +
    `At least ${Math.max(1, Math.floor(n / 3))} items should include a short Python code snippet when relevant.` +
    excludeBlock(exclude);
  const data = await chatJson({ system: QUIZ_SYSTEM, user, apiKey, baseUrl, model });
  const questions = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(questions) || !questions.length) throw new Error("No questions in model output");
  const cleaned = dedupeQuestions(questions, n);
  if (cleaned.length < Math.max(3, Math.floor(n / 2))) throw new Error("Model returned too few unique questions");
  return cleaned;
}

export async function generateFlashAi({ domain, focus, n, apiKey, baseUrl, model, exclude }) {
  const nonce = uuid().slice(0, 8);
  const user =
    `Domain: ${domain}\nFocus: ${focus}\nBatch id: ${nonce}\n` +
    `Generate ${n} unique flashcards for interview prep.` +
    excludeBlock(exclude);
  const data = await chatJson({ system: FLASH_SYSTEM, user, apiKey, baseUrl, model });
  const cards = Array.isArray(data) ? data : data.cards;
  if (!Array.isArray(cards) || !cards.length) throw new Error("No cards in model output");
  const cleaned = dedupeCards(cards, n);
  if (cleaned.length < Math.max(3, Math.floor(n / 2))) throw new Error("Model returned too few unique cards");
  return cleaned;
}

export async function generateMicroAi({ topicName, quizFocus, nQuiz, nCards, apiKey, baseUrl, model, exclude }) {
  const nonce = uuid().slice(0, 8);
  const user =
    `Microlearning topic: ${topicName}\nFocus areas: ${quizFocus}\nBatch id: ${nonce}\n` +
    `Generate ${nQuiz} unique quiz questions and ${nCards} unique flashcards.\n` +
    `Do not reuse lesson wording as multiple-choice options.` +
    excludeBlock(exclude);
  const data = await chatJson({ system: MICRO_SYSTEM, user, apiKey, baseUrl, model });
  if (!data || typeof data !== "object") throw new Error("Expected JSON object for micro practice");
  const quiz = dedupeQuestions(data.quiz || [], nQuiz);
  const flashcards = dedupeCards(data.flashcards || [], nCards);
  if (!quiz.length && !flashcards.length) throw new Error("Empty micro practice from model");
  return { quiz, flashcards };
}
