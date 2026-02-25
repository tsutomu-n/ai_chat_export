#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SCRIPT_DIR}/ai-chat-export.js"
OUT="${SCRIPT_DIR}/ai-chat-export.oneliner.js"

npx --yes terser "${SRC}" --compress --mangle --output "${OUT}"

node -e "const fs=require('fs');const p=process.argv[1];const s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,s.startsWith('javascript:')?s:'javascript:'+s);" "${OUT}"

echo "Generated ${OUT}"
