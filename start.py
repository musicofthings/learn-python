#!/usr/bin/env python3
"""HelixBench launcher — works on macOS/Linux/Windows.

Usage:
  python3 start.py
  python start.py
  py start.py
"""
from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def log(msg: str = "") -> None:
    print(msg, flush=True)


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        try:
            s.connect(("127.0.0.1", port))
            return True
        except OSError:
            return False


def find_free_port(start: int = 8080, end: int = 8099) -> int:
    for port in range(start, end + 1):
        if not port_in_use(port):
            return port
    raise RuntimeError(f"No free port in {start}-{end}")


def stop_existing_servers() -> None:
    """Best-effort stop of previous HelixBench uvicorn processes."""
    try:
        import glob

        killed = []
        for path in glob.glob("/proc/[0-9]*/cmdline"):
            try:
                parts = open(path, "rb").read().split(b"\x00")
            except OSError:
                continue
            text = b" ".join(parts).decode("utf-8", "ignore")
            exe = parts[0].decode("utf-8", "ignore") if parts else ""
            if "python" not in exe:
                continue
            if "uvicorn" in text and "server.main:app" in text:
                pid = int(path.split("/")[2])
                if pid == os.getpid():
                    continue
                try:
                    os.kill(pid, signal.SIGTERM)
                    killed.append(pid)
                except ProcessLookupError:
                    pass
        if killed:
            log(f"Stopped previous HelixBench server(s): {killed}")
            time.sleep(1.0)
    except Exception:
        # Non-Linux or restricted environments — ignore
        pass


def ensure_deps() -> None:
    req = ROOT / "server" / "requirements.txt"
    if not req.exists():
        raise SystemExit(
            "Missing server/requirements.txt.\n"
            f"Current directory: {ROOT}\n"
            "Make sure you are in the HelixBench repo root."
        )
    log("Installing Python packages (quiet)...")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-q", "-r", str(req)]
    )


def main() -> int:
    os.chdir(ROOT)
    os.environ["PYTHONPATH"] = str(ROOT) + os.pathsep + os.environ.get("PYTHONPATH", "")

    log("========================================")
    log("  HelixBench")
    log("========================================")
    log(f"Repo: {ROOT}")
    log(f"Python: {sys.executable} ({sys.version.split()[0]})")

    main_py = ROOT / "server" / "main.py"
    if not main_py.exists():
        log("ERROR: server/main.py not found.")
        log("You may be on an old branch/commit. Try:")
        log("  git checkout cursor/biopy-interview-quiz-2ad1")
        log("  git pull")
        return 1

    # Load optional .env
    env_path = ROOT / "server" / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        log("Loaded server/.env")

    try:
        ensure_deps()
    except subprocess.CalledProcessError as exc:
        log(f"ERROR: pip install failed ({exc}).")
        return 1

    # Prefer restarting our own servers so start always works
    stop_existing_servers()

    preferred = int(os.environ.get("PORT", "8080"))
    try:
        if port_in_use(preferred):
            log(f"Port {preferred} busy — searching for a free port...")
            port = find_free_port(preferred, preferred + 20)
        else:
            port = preferred
    except RuntimeError as exc:
        log(f"ERROR: {exc}")
        return 1

    url = f"http://127.0.0.1:{port}"
    log("")
    log("Starting server...")
    log(f"  Open this URL:  {url}")
    log(f"  Also try:       http://localhost:{port}")
    log("")
    log("Do NOT open index.html as a file.")
    log("Press Ctrl+C to stop.")
    log("========================================")

    # Use subprocess (NOT os.execvp): Windows paths with spaces
    # (e.g. C:\Users\Dr Shibichakravarthy\...) break execvp.
    args = [
        sys.executable,
        "-m",
        "uvicorn",
        "server.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(port),
    ]
    try:
        return subprocess.call(args)
    except KeyboardInterrupt:
        log("\nStopped.")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("\nStopped.")
        raise SystemExit(0)
