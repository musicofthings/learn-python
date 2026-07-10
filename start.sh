#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f server/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source server/.env
  set +a
fi

export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}"
python3 -m pip install -q -r server/requirements.txt
exec python3 -m uvicorn server.main:app --host 0.0.0.0 --port "${PORT:-8080}"
