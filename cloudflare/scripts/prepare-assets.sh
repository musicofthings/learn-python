#!/usr/bin/env bash
# Thin wrapper — prefer: node scripts/prepare-assets.js
# Avoid "set -o pipefail" (breaks under Windows CRLF / some shells).
cd "$(dirname "$0")/.." || exit 1
exec node scripts/prepare-assets.js
