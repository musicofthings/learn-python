"""OpenAI-compatible LLM client — OpenRouter by default."""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

import httpx

DEFAULT_BASE_URL = os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1")
DEFAULT_MODEL = os.getenv("LLM_MODEL", "openai/gpt-4o-mini")
APP_URL = os.getenv("OPENROUTER_SITE_URL", "https://github.com/musicofthings/learn-python")
APP_NAME = os.getenv("OPENROUTER_APP_NAME", "HelixBench")


class LLMError(Exception):
    pass


def _extract_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
        if not m:
            raise LLMError("Model did not return JSON")
        return json.loads(m.group(1))


def _is_openrouter(base_url: str) -> bool:
    return "openrouter.ai" in (base_url or "").lower()


async def chat_json(
    *,
    system: str,
    user: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    temperature: float = 0.95,
) -> Any:
    if not api_key:
        raise LLMError("Missing API key")

    base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    url = base + "/chat/completions"
    payload = {
        "model": model or DEFAULT_MODEL,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if _is_openrouter(base):
        headers["HTTP-Referer"] = APP_URL
        headers["X-Title"] = APP_NAME

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            raise LLMError(f"LLM request failed: {exc}") from exc

    if resp.status_code >= 400:
        if resp.status_code == 400 and "response_format" in resp.text:
            payload.pop("response_format", None)
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise LLMError(f"LLM HTTP {resp.status_code}: {resp.text[:500]}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError(f"Unexpected LLM response: {data!r}") from exc
    return _extract_json(content)


QUIZ_SYSTEM = """You are HelixBench, an expert interviewer for pharma computational biology / AI drug discovery.
Generate rigorous, NON-REPETITIVE multiple-choice questions.
Rules:
- Every question must be unique in wording AND concept angle — no paraphrases of each other.
- Prefer BioPython, RDKit, pandas, structure-based design, biologics (BiTE/ADC), docking, pLMs, folding, translational CompBio.
- Exactly 4 choices; exactly one correct; put the correct answer at a RANDOM index (not always 0).
- Explanations must be short and teach something new (1-2 sentences).
- Vary difficulty and include some Python code-reading items when relevant.
Return JSON only:
{"questions":[{"topic":"str","question":"str","code":"optional str","choices":["A","B","C","D"],"answer":0,"explanation":"str"}]}
"""


FLASH_SYSTEM = """You are HelixBench, creating UNIQUE flashcards for pharma CompBio interview prep.
Rules:
- No two cards may share the same prompt or nearly identical answer text.
- Cover distinct subtopics; keep backs dense and practical (2-4 sentences max).
Return JSON only:
{"cards":[{"topic":"str","front":"prompt question","back":"concise answer + why it matters"}]}
"""


MICRO_SYSTEM = """You are HelixBench, generating microlearning PRACTICE for a focused pharma CompBio topic.
Rules:
- Create NEW interview-style questions — do NOT copy lesson sentences verbatim as answer choices.
- No duplicate or near-duplicate questions in the same batch.
- Include Python 'what does this code do' items when useful.
- Exactly 4 choices; correct answer at a random index.
Return JSON only:
{"quiz":[{"topic":"str","question":"str","code":"optional","choices":["A","B","C","D"],"answer":0,"explanation":"str"}],
 "flashcards":[{"topic":"str","front":"str","back":"str"}]}
"""


def _exclude_block(exclude: list[str] | None) -> str:
    if not exclude:
        return ""
    clipped = [e.strip()[:180] for e in exclude if e and e.strip()][:40]
    if not clipped:
        return ""
    lines = "\n".join(f"- {e}" for e in clipped)
    return (
        "\n\nDO NOT repeat or paraphrase any of these recently used prompts:\n"
        f"{lines}\n"
    )


def _dedupe_questions(items: list[dict], n: int) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for q in items:
        key = re.sub(r"\s+", " ", str(q.get("question", "")).strip().lower())
        if not key or key in seen:
            continue
        seen.add(key)
        choices = q.get("choices") or []
        if len(choices) != 4:
            continue
        ans = int(q.get("answer", 0))
        if ans < 0 or ans > 3:
            ans = 0
        item = {
            "topic": str(q.get("topic") or "CompBio"),
            "question": str(q.get("question") or "").strip(),
            "choices": [str(c) for c in choices],
            "answer": ans,
            "explanation": str(q.get("explanation") or "").strip(),
            "source": "ai",
            "id": str(q.get("id") or uuid.uuid4()),
        }
        if q.get("code"):
            item["code"] = str(q["code"])
        if item["question"]:
            out.append(item)
        if len(out) >= n:
            break
    return out


def _dedupe_cards(items: list[dict], n: int) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for c in items:
        front = str(c.get("front") or "").strip()
        back = str(c.get("back") or "").strip()
        key = re.sub(r"\s+", " ", front.lower())
        if not front or not back or key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "topic": str(c.get("topic") or "CompBio"),
                "front": front,
                "back": back,
                "source": "ai",
                "id": str(c.get("id") or uuid.uuid4()),
            }
        )
        if len(out) >= n:
            break
    return out


async def generate_quiz_ai(
    *,
    domain: str,
    focus: str,
    n: int,
    api_key: str,
    base_url: str | None,
    model: str | None,
    exclude: list[str] | None = None,
) -> list[dict]:
    nonce = uuid.uuid4().hex[:8]
    user = (
        f"Domain/category: {domain}\n"
        f"Focus: {focus}\n"
        f"Batch id: {nonce}\n"
        f"Generate {n} brand-new unique interview MCQs. "
        f"Vary difficulty, topics, and which choice index is correct.\n"
        f"At least {max(1, n // 3)} items should include a short Python code snippet when relevant."
        f"{_exclude_block(exclude)}"
    )
    data = await chat_json(
        system=QUIZ_SYSTEM, user=user, api_key=api_key, base_url=base_url, model=model
    )
    questions = data.get("questions") if isinstance(data, dict) else data
    if not isinstance(questions, list) or not questions:
        raise LLMError("No questions in model output")
    cleaned = _dedupe_questions(questions, n)
    if len(cleaned) < max(3, n // 2):
        raise LLMError("Model returned too few unique questions")
    return cleaned


async def generate_flashcards_ai(
    *,
    domain: str,
    focus: str,
    n: int,
    api_key: str,
    base_url: str | None,
    model: str | None,
    exclude: list[str] | None = None,
) -> list[dict]:
    nonce = uuid.uuid4().hex[:8]
    user = (
        f"Domain: {domain}\nFocus: {focus}\nBatch id: {nonce}\n"
        f"Generate {n} unique flashcards for interview prep."
        f"{_exclude_block(exclude)}"
    )
    data = await chat_json(
        system=FLASH_SYSTEM, user=user, api_key=api_key, base_url=base_url, model=model
    )
    cards = data.get("cards") if isinstance(data, dict) else data
    if not isinstance(cards, list) or not cards:
        raise LLMError("No cards in model output")
    cleaned = _dedupe_cards(cards, n)
    if len(cleaned) < max(3, n // 2):
        raise LLMError("Model returned too few unique cards")
    return cleaned


async def generate_micro_ai(
    *,
    topic_name: str,
    quiz_focus: str,
    n_quiz: int,
    n_cards: int,
    api_key: str,
    base_url: str | None,
    model: str | None,
    exclude: list[str] | None = None,
) -> dict:
    nonce = uuid.uuid4().hex[:8]
    user = (
        f"Microlearning topic: {topic_name}\n"
        f"Focus areas: {quiz_focus}\n"
        f"Batch id: {nonce}\n"
        f"Generate {n_quiz} unique quiz questions and {n_cards} unique flashcards.\n"
        f"Do not reuse lesson wording as multiple-choice options."
        f"{_exclude_block(exclude)}"
    )
    data = await chat_json(
        system=MICRO_SYSTEM, user=user, api_key=api_key, base_url=base_url, model=model
    )
    if not isinstance(data, dict):
        raise LLMError("Expected JSON object for micro practice")
    quiz = _dedupe_questions(data.get("quiz") or [], n_quiz)
    cards = _dedupe_cards(data.get("flashcards") or [], n_cards)
    if not quiz and not cards:
        raise LLMError("Empty micro practice from model")
    return {"quiz": quiz, "flashcards": cards}
