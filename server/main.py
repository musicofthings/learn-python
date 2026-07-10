"""HelixBench API — dynamic Q&A generation + microlearning."""

from __future__ import annotations

import os
import time
import uuid
from pathlib import Path
from typing import Any, Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from server.local_generator import (
    generate_flashcards_local,
    generate_micro_practice_local,
    generate_quiz_local,
)
from server.llm import (
    LLMError,
    generate_flashcards_ai,
    generate_micro_ai,
    generate_quiz_ai,
)
from server.micro_topics import MICRO_TOPICS, get_topic

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(title="HelixBench API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DOMAIN_FOCUS = {
    "genomics": "BioPython SeqIO/Entrez/MSA, CRISPR oligos, reference builds, expression QC",
    "chemistry": "SMILES, RDKit, fingerprints, ADMET, QSAR curation, generative chemistry",
    "molecular": "PDB/mmCIF, pockets, AlphaFold confidence, protein LMs, target ID",
    "biologics": "antibodies, CDRs, developability, PTMs, humanization, orthologs",
    "docking": "docking prep, poses, IFPs, enrichment, covalent, induced fit",
    "clinical": "assays, pIC50, scaffold splits, PK, biomarkers, uncertainty, privacy",
}


class GenerateQuizRequest(BaseModel):
    domain: str = Field(..., description="Domain id or micro topic id")
    n: int = Field(10, ge=1, le=20)
    mode: Literal["auto", "ai", "local"] = "auto"
    seed: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    exclude: list[str] = Field(default_factory=list, description="Recent question texts to avoid")


class GenerateFlashRequest(BaseModel):
    domain: str
    n: int = Field(12, ge=1, le=30)
    mode: Literal["auto", "ai", "local"] = "auto"
    seed: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    exclude: list[str] = Field(default_factory=list)


class GenerateMicroRequest(BaseModel):
    topic_id: str
    n_quiz: int = Field(6, ge=1, le=15)
    n_cards: int = Field(6, ge=1, le=20)
    mode: Literal["auto", "ai", "local"] = "auto"
    seed: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    exclude: list[str] = Field(default_factory=list)


def _resolve_key(api_key: Optional[str], header_key: Optional[str]) -> str:
    return (api_key or header_key or os.getenv("LLM_API_KEY") or "").strip()


def _want_ai(mode: str, key: str) -> bool:
    if mode == "local":
        return False
    if mode == "ai":
        return True
    return bool(key)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "helixbench",
        "llm_key_configured": bool(os.getenv("LLM_API_KEY")),
        "default_model": os.getenv("LLM_MODEL", "openai/gpt-4o-mini"),
        "default_base_url": os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1"),
        "provider": "openrouter",
        "micro_topics": len(MICRO_TOPICS),
    }


@app.get("/api/domains")
def domains() -> dict[str, Any]:
    return {
        "domains": [
            {"id": k, "focus": v} for k, v in DOMAIN_FOCUS.items()
        ]
    }


@app.get("/api/micro-topics")
def micro_topics() -> dict[str, Any]:
    catalog = []
    for t in MICRO_TOPICS:
        catalog.append(
            {
                "id": t["id"],
                "name": t["name"],
                "category": t["category"],
                "blurb": t["blurb"],
                "tags": t["tags"],
                "lesson": t["lesson"],
                "code_examples": t.get("code_examples", []),
            }
        )
    return {"topics": catalog}


@app.get("/api/micro-topics/{topic_id}")
def micro_topic(topic_id: str) -> dict[str, Any]:
    t = get_topic(topic_id)
    if not t:
        raise HTTPException(404, f"Unknown topic {topic_id}")
    return {"topic": t}


@app.post("/api/generate/quiz")
async def api_generate_quiz(
    body: GenerateQuizRequest,
    x_llm_api_key: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    key = _resolve_key(body.api_key, x_llm_api_key)
    seed = body.seed or uuid.uuid4().hex
    focus = DOMAIN_FOCUS.get(body.domain, body.domain)
    topic = get_topic(body.domain)
    if topic:
        focus = topic["quiz_focus"]

    source = "local"
    questions: list[dict]
    warning = None

    if _want_ai(body.mode, key):
        if not key:
            raise HTTPException(400, "AI mode requires an API key (settings or LLM_API_KEY)")
        try:
            questions = await generate_quiz_ai(
                domain=body.domain,
                focus=focus,
                n=body.n,
                api_key=key,
                base_url=body.base_url or os.getenv("LLM_BASE_URL"),
                model=body.model or os.getenv("LLM_MODEL"),
                exclude=body.exclude,
            )
            source = "ai"
        except LLMError as exc:
            if body.mode == "ai":
                raise HTTPException(502, str(exc)) from exc
            questions = generate_quiz_local(body.domain, n=body.n, seed=seed)
            warning = f"AI failed ({exc}); used local generator"
            source = "local"
    else:
        questions = generate_quiz_local(body.domain, n=body.n, seed=seed)

    return {
        "domain": body.domain,
        "source": source,
        "seed": seed,
        "generated_at": time.time(),
        "questions": questions,
        "warning": warning,
    }


@app.post("/api/generate/flashcards")
async def api_generate_flashcards(
    body: GenerateFlashRequest,
    x_llm_api_key: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    key = _resolve_key(body.api_key, x_llm_api_key)
    seed = body.seed or uuid.uuid4().hex
    focus = DOMAIN_FOCUS.get(body.domain, body.domain)
    topic = get_topic(body.domain)
    if topic:
        focus = topic["quiz_focus"]

    source = "local"
    warning = None
    if _want_ai(body.mode, key):
        if not key:
            raise HTTPException(400, "AI mode requires an API key")
        try:
            cards = await generate_flashcards_ai(
                domain=body.domain,
                focus=focus,
                n=body.n,
                api_key=key,
                base_url=body.base_url or os.getenv("LLM_BASE_URL"),
                model=body.model or os.getenv("LLM_MODEL"),
                exclude=body.exclude,
            )
            source = "ai"
        except LLMError as exc:
            if body.mode == "ai":
                raise HTTPException(502, str(exc)) from exc
            cards = generate_flashcards_local(body.domain, n=body.n, seed=seed)
            warning = f"AI failed ({exc}); used local generator"
            source = "local"
    else:
        cards = generate_flashcards_local(body.domain, n=body.n, seed=seed)

    return {
        "domain": body.domain,
        "source": source,
        "seed": seed,
        "generated_at": time.time(),
        "cards": cards,
        "warning": warning,
    }


@app.post("/api/generate/micro")
async def api_generate_micro(
    body: GenerateMicroRequest,
    x_llm_api_key: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    topic = get_topic(body.topic_id)
    if not topic:
        raise HTTPException(404, f"Unknown topic {body.topic_id}")

    key = _resolve_key(body.api_key, x_llm_api_key)
    seed = body.seed or uuid.uuid4().hex
    source = "local"
    warning = None

    if _want_ai(body.mode, key):
        if not key:
            raise HTTPException(400, "AI mode requires an API key")
        try:
            practice = await generate_micro_ai(
                topic_name=topic["name"],
                quiz_focus=topic["quiz_focus"],
                n_quiz=body.n_quiz,
                n_cards=body.n_cards,
                api_key=key,
                base_url=body.base_url or os.getenv("LLM_BASE_URL"),
                model=body.model or os.getenv("LLM_MODEL"),
                exclude=body.exclude,
            )
            source = "ai"
        except LLMError as exc:
            if body.mode == "ai":
                raise HTTPException(502, str(exc)) from exc
            practice = generate_micro_practice_local(
                body.topic_id, n_quiz=body.n_quiz, n_cards=body.n_cards, seed=seed
            )
            warning = f"AI failed ({exc}); used local generator"
            source = "local"
    else:
        practice = generate_micro_practice_local(
            body.topic_id, n_quiz=body.n_quiz, n_cards=body.n_cards, seed=seed
        )

    return {
        "topic_id": body.topic_id,
        "topic": {
            "id": topic["id"],
            "name": topic["name"],
            "category": topic["category"],
            "blurb": topic["blurb"],
            "tags": topic["tags"],
            "lesson": topic["lesson"],
            "code_examples": topic.get("code_examples", []),
        },
        "source": source,
        "seed": seed,
        "generated_at": time.time(),
        "quiz": practice.get("quiz", []),
        "flashcards": practice.get("flashcards", []),
        "warning": warning,
    }



@app.get("/api/providers")
def providers() -> dict[str, Any]:
    return {
        "default": "openrouter",
        "providers": [
            {
                "id": "openrouter",
                "name": "OpenRouter",
                "base_url": "https://openrouter.ai/api/v1",
                "models": [
                    "openai/gpt-4o-mini",
                    "openai/gpt-4o",
                    "anthropic/claude-3.5-sonnet",
                    "google/gemini-2.0-flash-001",
                    "meta-llama/llama-3.3-70b-instruct",
                    "deepseek/deepseek-chat",
                ],
                "key_url": "https://openrouter.ai/keys",
            },
            {
                "id": "openai",
                "name": "OpenAI",
                "base_url": "https://api.openai.com/v1",
                "models": ["gpt-4o-mini", "gpt-4o"],
                "key_url": "https://platform.openai.com/api-keys",
            },
        ],
    }


# Static frontend
if (ROOT / "index.html").exists():
    app.mount("/css", StaticFiles(directory=str(ROOT / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(ROOT / "js")), name="js")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(ROOT / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8080")), reload=True)
