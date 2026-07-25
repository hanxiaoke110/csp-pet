#!/usr/bin/env python3
"""
Pre-extract all GESP PDFs with PaddleOCR for fast evidence collection.
Reads source-catalog.json, runs paddle-extract.sh for each PDF that
isn't already cached, saves to .tmp/gesp-ocr-cache.json.

Usage: python3 scripts/question-bank/pre-ocr-all.py
"""
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CATALOG = os.path.join(ROOT, 'public/course-data/question-bank-v2/source-catalog.json')
CACHE = os.path.join(ROOT, '.tmp/gesp-ocr-cache.json')
EXTRACT_SH = os.path.join(ROOT, 'scripts/question-bank/paddle-extract.sh')
PDF_DIR = os.path.join(ROOT, 'reports/gesp-sources/pdfs')

os.makedirs(os.path.dirname(CACHE), exist_ok=True)

# Load catalog
with open(CATALOG) as f:
    catalog = json.load(f)

# Load existing cache
cache = {}
if os.path.exists(CACHE):
    with open(CACHE) as f:
        cache = json.load(f)

entries = [e for e in catalog['entries'] if e.get('localPath')]
total = len(entries)
new_count = 0
skip_count = 0
fail_count = 0

print(f"Total PDFs in catalog: {total}")
print(f"Already cached: {len(cache)}")
print()

for entry in entries:
    key = entry['key']
    sha = entry.get('sha256', '')
    local = entry['localPath']

    # Skip if cached with matching SHA
    if key in cache:
        cached = cache[key]
        if cached.get('sha256') == sha and cached.get('status') == 'ok':
            skip_count += 1
            continue
        elif cached.get('status') == 'failed':
            # Retry failed entries
            pass

    pdf_path = os.path.join(ROOT, local)
    if not os.path.exists(pdf_path):
        print(f"  [{key}] PDF not found: {local}")
        cache[key] = {'status': 'missing', 'sha256': sha, 'error': 'pdf_not_found'}
        fail_count += 1
        continue

    # Run paddle-extract.sh
    t0 = time.time()
    print(f"  [{key}] OCR...", end=' ', flush=True)
    try:
        result = subprocess.run(
            ['bash', EXTRACT_SH, pdf_path, '--all'],
            capture_output=True, text=True, timeout=600
        )
        elapsed = time.time() - t0

        if result.returncode != 0:
            cache[key] = {
                'status': 'failed',
                'sha256': sha,
                'error': result.stderr[:200] or 'exit code ' + str(result.returncode),
            }
            fail_count += 1
            print(f"FAIL ({elapsed:.0f}s): {result.stderr[:80] or 'unknown'}")
            continue

        # Parse JSON from last line
        last_line = result.stdout.strip().split('\n')[-1]
        ocr_data = json.loads(last_line)
        page_count = len(ocr_data.get('pages', []))

        cache[key] = {
            'status': 'ok',
            'sha256': sha,
            'pageCount': page_count,
            'pages': ocr_data.get('pages', []),
            'answerMap': ocr_data.get('answerMap', {}),
            'ocrTime': round(elapsed, 1),
        }
        new_count += 1
        print(f"OK ({elapsed:.0f}s, {page_count} pages)")

        # Save incrementally
        with open(CACHE, 'w') as f:
            json.dump(cache, f, ensure_ascii=False)

    except subprocess.TimeoutExpired:
        cache[key] = {'status': 'failed', 'sha256': sha, 'error': 'timeout (>600s)'}
        fail_count += 1
        print(f"TIMEOUT")
    except json.JSONDecodeError:
        cache[key] = {'status': 'failed', 'sha256': sha, 'error': 'invalid_json'}
        fail_count += 1
        print(f"INVALID JSON")
    except Exception as e:
        cache[key] = {'status': 'failed', 'sha256': sha, 'error': str(e)[:200]}
        fail_count += 1
        print(f"ERROR: {e}")

# Final save
with open(CACHE, 'w') as f:
    json.dump(cache, f, ensure_ascii=False)

print(f"\nDone. New: {new_count}, Skipped: {skip_count}, Failed: {fail_count}, Total: {len(cache)}")
