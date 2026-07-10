#!/usr/bin/env python3
"""Cross-platform HelixBench launcher."""
from __future__ import annotations

import os
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def port_free(port: int) -> bool:
    s = socket.socket()
    s.settimeout(0.5)
    try:
        s.connect(("127.0.0.1", port))
        return False
    except OSError:
        return True
    finally:
        s.close()


def main() -> int:
    os.chdir(ROOT)
    os.environ["PYTHONPATH"] = str(ROOT) + os.pathsep + os.environ.get("PYTHONPATH", "")

    print("========================================")
    print("  HelixBench starting...")
    print("========================================")

    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-q", "-r", "server/requirements.txt"]
    )

    port = int(os.environ.get("PORT", "8080"))
    if not port_free(port):
        print(f"Port {port} busy — trying 8081...")
        port = 8081
        if not port_free(port):
            print("Ports 8080 and 8081 are busy. Stop the other process and retry.")
            return 1

    print()
    print("HelixBench is running at:")
    print(f"  ->  http://127.0.0.1:{port}")
    print(f"  ->  http://localhost:{port}")
    print()
    print("Open that URL in your browser.")
    print("Do NOT open index.html as a file.")
    print("Press Ctrl+C to stop.")
    print("========================================")

    os.execvp(
        sys.executable,
        [
            sys.executable,
            "-m",
            "uvicorn",
            "server.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(port),
        ],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
