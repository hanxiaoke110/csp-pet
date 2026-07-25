#!/usr/bin/env bash
# Pre-extract all GESP PDFs with PaddleOCR and save to cache.
# Usage: bash pre-ocr-gesp.sh
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CATALOG="$ROOT/public/course-data/question-bank-v2/source-catalog.json"
CACHE="$ROOT/.tmp/gesp-paddleocr-cache.json"
EXTRACT_SH="$ROOT/scripts/question-bank/paddle-extract.sh"

if [ ! -f "$CATALOG" ]; then
    echo '{"error": "source-catalog.json not found"}'
    exit 1
fi

# Load existing cache
if [ -f "$CACHE" ]; then
    python3 -c "import json; d=json.load(open('$CACHE')); print(f'Existing cache: {len(d)} PDFs')"
else
    echo "{}" > "$CACHE"
fi

# Extract entries with localPath
python3 -c "
import json, os

with open('$CATALOG') as f:
    catalog = json.load(f)

cache = {}
if os.path.exists('$CACHE'):
    with open('$CACHE') as f:
        cache = json.load(f)

entries = [e for e in catalog['entries'] if e.get('localPath')]
total = len(entries)
done = 0

for i, entry in enumerate(entries):
    key = entry['key']
    local = entry['localPath']
    sha = entry.get('sha256', '')

    # Skip if already cached with matching SHA
    if sha and key in cache and cache[key].get('sha256') == sha:
        done += 1
        continue

    pdf_path = os.path.join('$ROOT', local)
    if not os.path.exists(pdf_path):
        print(f'  SKIP {key}: PDF not found at {local}', flush=True)
        cache[key] = {'error': 'pdf_not_found'}
        continue

    # Will be processed by bash loop below
    print(f'NEEDS_OCR {key} {pdf_path}', flush=True)

# Save skipped/error entries
with open('$CACHE', 'w') as f:
    json.dump(cache, f, indent=2)

print(f'CACHE_STATUS done={done} total={total}', flush=True)
"

echo "Pre-OCR scan complete. Starting PaddleOCR extraction..."
