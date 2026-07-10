"""Disk + memory cache for generated HelixBench content."""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any

DEFAULT_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", str(24 * 60 * 60)))  # 24h
CACHE_DIR = Path(os.getenv("CACHE_DIR", Path(__file__).resolve().parent.parent / ".cache" / "helixbench"))

_lock = threading.Lock()
_memory: dict[str, dict[str, Any]] = {}


def _ensure_dir() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def make_key(kind: str, **parts: Any) -> str:
    payload = {"kind": kind, **{k: parts[k] for k in sorted(parts)}}
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def get(key: str) -> dict[str, Any] | None:
    now = time.time()
    with _lock:
        mem = _memory.get(key)
        if mem and mem.get("expires_at", 0) > now:
            data = dict(mem["data"])
            data["_cache"] = {
                "hit": True,
                "layer": "memory",
                "age_seconds": int(now - mem.get("created_at", now)),
                "expires_at": mem["expires_at"],
            }
            return data

    path = CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        blob = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if blob.get("expires_at", 0) <= now:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return None

    with _lock:
        _memory[key] = blob
    data = dict(blob.get("data") or {})
    data["_cache"] = {
        "hit": True,
        "layer": "disk",
        "age_seconds": int(now - blob.get("created_at", now)),
        "expires_at": blob["expires_at"],
    }
    return data


def set(key: str, data: dict[str, Any], ttl: int | None = None) -> dict[str, Any]:
    ttl = DEFAULT_TTL_SECONDS if ttl is None else ttl
    now = time.time()
    # Don't persist internal cache metadata inside stored payload
    store = {k: v for k, v in data.items() if k != "_cache"}
    blob = {
        "created_at": now,
        "expires_at": now + ttl,
        "ttl": ttl,
        "data": store,
    }
    with _lock:
        _memory[key] = blob
    try:
        _ensure_dir()
        (CACHE_DIR / f"{key}.json").write_text(json.dumps(blob), encoding="utf-8")
    except OSError:
        pass
    out = dict(store)
    out["_cache"] = {
        "hit": False,
        "layer": "miss",
        "age_seconds": 0,
        "expires_at": blob["expires_at"],
    }
    return out


def stats() -> dict[str, Any]:
    _ensure_dir()
    files = list(CACHE_DIR.glob("*.json"))
    return {
        "memory_entries": len(_memory),
        "disk_entries": len(files),
        "ttl_seconds": DEFAULT_TTL_SECONDS,
        "cache_dir": str(CACHE_DIR),
    }


def clear() -> dict[str, Any]:
    with _lock:
        _memory.clear()
    removed = 0
    _ensure_dir()
    for path in CACHE_DIR.glob("*.json"):
        try:
            path.unlink()
            removed += 1
        except OSError:
            pass
    return {"cleared_disk": removed}
