#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SCRIPT_DIR}/ai-chat-export.js"
MIN_OUT="${SCRIPT_DIR}/ai-chat-export.min.js"
OUT="${SCRIPT_DIR}/ai-chat-export.oneliner.js"
TMP_BODY="$(mktemp "${TMPDIR:-/tmp}/ai-chat-export.body.XXXXXX.js")"
TMP_MIN="$(mktemp "${TMPDIR:-/tmp}/ai-chat-export.min.XXXXXX.js")"

cleanup() {
  rm -f "${TMP_BODY}" "${TMP_MIN}"
}
trap cleanup EXIT

perl -0pe 's/^javascript://' "${SRC}" > "${TMP_BODY}"
npx --yes terser "${TMP_BODY}" --compress --mangle --format ascii_only=true --output "${TMP_MIN}"
cp "${TMP_MIN}" "${MIN_OUT}"

node - "${TMP_MIN}" "${OUT}" <<'NODE'
const fs = require('fs');

const [, , minPath, outPath] = process.argv;
let body = fs.readFileSync(minPath, 'utf8').trim();
if (!body.startsWith('javascript:')) body = `javascript:${body}`;
fs.writeFileSync(outPath, `${body}\n`);
console.log(`Generated ${outPath} (${body.length} chars)`);
NODE

echo "Generated ${MIN_OUT}"
