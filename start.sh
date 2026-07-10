#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}"

echo "========================================"
echo "  HelixBench starting..."
echo "========================================"

if [[ -f server/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source server/.env
  set +a
  echo "Loaded server/.env"
fi

echo "Installing Python deps (if needed)..."
python3 -m pip install -q -r server/requirements.txt

echo "Checking port ${PORT}..."
if ! python3 -c "import socket;s=socket.socket();s.settimeout(0.3);s.connect(('127.0.0.1', int('${PORT}')))" 2>/dev/null; then
  echo "Port ${PORT} is free"
else
  echo "Port ${PORT} is busy — trying 8081"
  PORT=8081
  if python3 -c "import socket;s=socket.socket();s.settimeout(0.3);s.connect(('127.0.0.1', int('${PORT}')))" 2>/dev/null; then
    echo "ERROR: ports 8080 and 8081 are both busy."
    echo "Stop the other process, then rerun ./start.sh"
    exit 1
  fi
fi

echo ""
echo "HelixBench is running at:"
echo "  ->  http://127.0.0.1:${PORT}"
echo "  ->  http://localhost:${PORT}"
echo ""
echo "Open that URL in your browser."
echo "Do NOT open index.html as a file."
echo "Press Ctrl+C to stop."
echo "========================================"

exec python3 -m uvicorn server.main:app --host 0.0.0.0 --port "${PORT}"
