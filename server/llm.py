"""OpenAI-compatible LLM client for dynamic Q&A generation."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

DEFAULT_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
DEFAULT_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")


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


async def chat_json(
    *,
    system: str,
    user: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    temperature: float = 0.8,
) -> Any:
    if not api_key:
        raise LLMError("Missing API key")

    url = (base_url or DEFAULT_BASE_URL).rstrip("/") + "/chat/completions"
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

    async with httpx.AsyncClient(timeout=90.0) as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            raise LLMError(f"LLM request failed: {exc}") from exc

    if resp.status_code >= 400:
        # Retry without response_format for providers that lack it
        if resp.status_code == 400 and "response_format" in resp.text:
            payload.pop("response_format", None)
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise LLMError(f"LLM HTTP {resp.status_code}: {resp.text[:400]}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError(f"Unexpected LLM response: {data!r}") from exc
    return _extract_json(content)


QUIZ_SYSTEM = """You are HelixBench, an expert interviewer for pharma computational biology / AI drug discovery.
Generate rigorous multiple-choice questions. Prefer BioPython, RDKit, pandas, structure-based design, biologics, and translational CompBio — not generic Python trivia.
Return JSON only with shape:
{"questions":[{"topic":"str","question":"str","code":"optional str","choices":["A","B","C","D"],"answer":0,"explanation":"str"}]}
answer is the index of the correct choice (0-3). Exactly 4 choices. Explanations must teach briefly."""


FLASH_SYSTEM = """You are HelixBench, creating flashcards for pharma CompBio interview prep.
Return JSON only:
{"cards":[{"topic":"str","front":"prompt question","back":"concise answer + why it matters"}]}
Keep backs dense and practical."""


MICRO_SYSTEM = """You are HelixBench, generating microlearning practice for a focused pharma CompBio topic.
Return JSON only:
{"quiz":[{"topic":"str","question":"str","code":"optional","choices":["A","B","C","D"],"answer":0,"explanation":"str"}],
 "flashcards":[{"topic":"str","front":"str","back":"str"}]}
Include at least 2 code-reading questions when the topic involves Python/workflows.
Questions must be specific to the requested topic (BiTE, ADC, pLMs, folding, docking, etc.)."""


async def generate_quiz_ai(
    *,
    domain: str,
    focus: str,
    n: int,
    api_key: str,
    base_url: str | None,
    model: str | None,
) -> list[dict]:
    user = (
        f"Domain/category: {domain}\n"
        f"Focus: {focus}\n"
        f"Generate {n} NEW unique interview MCQs. Vary difficulty. Shuffle which choice is correct.\n"
        f"At least {max(1, n // 3)} items should include a short Python code snippet when relevant."
    )
    data = await chat_json(system=QUIZ_SYSTEM, user=user, api_key=api_key, base_url=base_url, model=model)
    questions = data.get("questions") if isinstance(data, dict) else data
    if not isinstance(questions, list) or not questions:
        raise LLMError("No questions in model output")
    cleaned = []
    for q in questions[:n]:
        choices = q.get("choices") or []
        if len(choices) != 4:
            continue
        ans = int(q.get("answer", 0))
        if ans < 0 or ans > 3:
            ans = 0
        item = {
            "topic": str(q.get("topic") or domain),
            "question": str(q.get("question") or "").strip(),
            "choices": [str(c) for c in choices],
            "answer": ans,
            "explanation": str(q.get("explanation") or "").strip(),
            "source": "ai",
        }
        if q.get("code"):
            item["code"] = str(q["code"])
        if item["question"]:
            cleaned.append(item)
    if len(cleaned) < max(3, n // 2):
        raise LLMError("Model returned too few valid questions")
    return cleaned


async def generate_flashcards_ai(
    *,
    domain: str,
    focus: str,
    n: int,
    api_key: str,
    base_url: str | None,
    model: str | None,
) -> list[dict]:
    user = f"Domain: {domain}\nFocus: {focus}\nGenerate {n} flashcards for interview prep."
    data = await chat_json(system=FLASH_SYSTEM, user=user, api_key=api_key, base_url=base_url, model=model)
    cards = data.get("cards") if isinstance(data, dict) else data
    if not isinstance(cards, list) or not cards:
        raise LLMError("No cards in model output")
    cleaned = []
    for c in cards[:n]:
        front = str(c.get("front") or "").strip()
        back = str(c.get("back") or "").strip()
        if not front or not back:
            continue
        cleaned.append(
            {
                "topic": str(c.get("topic") or domain),
                "front": front,
                "back": back,
                "source": "ai",
            }
        )
    if len(cleaned) < max(3, n // 2):
        raise LLMError("Model returned too few valid cards")
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
) -> dict:
    user = (
        f"Microlearning topic: {topic_name}\n"
        f"Focus areas: {quiz_focus}\n"
        f"Generate {n_quiz} quiz questions and {n_cards} flashcards.\n"
        f"Include Python 'what does this code do' items when useful."
    )
    data = await chat_json(system=MICRO_SYSTEM, user=user, api_key=api_key, base_url=base_url, model=model)
    if not isinstance(data, dict):
        raise LLMError("Expected JSON object for micro practice")
    quiz = []
    for q in (data.get("quiz") or [])[:n_quiz]:
        choices = q.get("choices") or []
        if len(choices) != 4:
            continue
        ans = int(q.get("answer", 0))
        item = {
            "topic": str(q.get("topic") or topic_name),
            "question": str(q.get("question") or "").strip(),
            "choices": [str(c) for c in choices],
            "answer": ans if 0 <= ans <= 3 else 0,
            "explanation": str(q.get("explanation") or "").strip(),
            "source": "ai",
        }
        if q.get("code"):
            item["code"] = str(q["code"])
        if item["question"]:
            quiz.append(item)
    cards = []
    for c in (data.get("flashcards") or [])[:n_cards]:
        front = str(c.get("front") or "").strip()
        back = str(c.get("back") or "").strip()
        if front and back:
            cards.append(
                {
                    "topic": str(c.get("topic") or topic_name),
                    "front": front,
                    "back": back,
                    "source": "ai",
                }
            )
    if not quiz and not cards:
        raise LLMError("Empty micro practice from model")
    return {"quiz": quiz, "flashcards": cards}
