#!/usr/bin/env bash
# Deprecated: prefer `node scripts/prepare-assets.js` (npm run prepare-assets).
# Kept for Unix users; avoid CRLF — see .gitattributes.
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public"

rm -rf "$DEST"
mkdir -p "$DEST/css" "$DEST/js"

cp "$ROOT/index.html" "$DEST/index.html"
cp "$ROOT/css/styles.css" "$DEST/css/styles.css"
cp "$ROOT/js/"*.js "$DEST/js/"

# Refresh topics JSON from Python catalog when available
if command -v python3 >/dev/null 2>&1; then
  (cd "$ROOT" && python3 - <<'PY'
from pathlib import Path
import json
try:
    from server.micro_topics import MICRO_TOPICS
except Exception as exc:
    print("skip topics refresh:", exc)
    raise SystemExit(0)
out = Path("cloudflare/src/topics-data.json")
catalog = []
for t in MICRO_TOPICS:
    catalog.append({
        "id": t["id"],
        "name": t["name"],
        "category": t["category"],
        "blurb": t["blurb"],
        "tags": t["tags"],
        "lesson": t["lesson"],
        "code_examples": t.get("code_examples", []),
        "quiz_focus": t["quiz_focus"],
    })
out.write_text(json.dumps({"topics": catalog}, indent=2) + "\n", encoding="utf-8")
print(f"refreshed {out} ({len(catalog)} topics)")
PY
  )
fi

# Cache headers for static assets
cat > "$DEST/_headers" <<'EOF'
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/css/*
  Cache-Control: public, max-age=86400

/js/*
  Cache-Control: public, max-age=86400

/index.html
  Cache-Control: public, max-age=300
EOF

echo "Prepared $DEST"
ls -la "$DEST" "$DEST/js" | head -40
