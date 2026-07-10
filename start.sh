#!/usr/bin/env bash
# Thin wrapper — real logic lives in start.py
set -euo pipefail
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "ERROR: Python not found. Install Python 3, then run: python start.py"
  exit 1
fi

if [[ ! -f start.py ]]; then
  echo "ERROR: start.py not found in $(pwd)"
  echo "Checkout the feature branch and pull latest:"
  echo "  git fetch origin"
  echo "  git checkout cursor/biopy-interview-quiz-2ad1"
  echo "  git pull"
  exit 1
fi

exec "$PY" start.py "$@"
