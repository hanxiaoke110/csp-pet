#!/usr/bin/env bash
# Extract text from PDF pages using PaddleOCR.
# Uses PyMuPDF for PDF→image, then ~/.claude/skills/paddleocr/ocr.sh for OCR.
# Usage: bash paddle-extract.sh <pdf_path> [page_number] [--all]
set -e

PDF="$1"
if [ -z "$PDF" ] || [ ! -f "$PDF" ]; then
    echo '{"error": "Usage: paddle-extract.sh <pdf_path> [page_number] [--all]"}'
    exit 1
fi

PAGE="${2:-1}"
ALL_PAGES=false
if [ "$2" = "--all" ] || [ "$3" = "--all" ]; then
    ALL_PAGES=true
fi

OCR_SH="$HOME/.claude/skills/paddleocr/ocr.sh"
if [ ! -f "$OCR_SH" ]; then
    echo '{"error": "PaddleOCR not found at ~/.claude/skills/paddleocr/ocr.sh"}'
    exit 1
fi

TMPDIR=$(mktemp -d /tmp/paddle-extract-XXXXXX)
trap "rm -rf $TMPDIR" EXIT

# Convert PDF pages to images using Python PyMuPDF
python3 -W ignore -c "
import fitz, sys, os, json
pdf_path = sys.argv[1]
tmpdir = sys.argv[2]
all_pages = sys.argv[3].lower() == 'true'

doc = fitz.open(pdf_path)
total = doc.page_count

if all_pages:
    pages_to_extract = list(range(total))
else:
    page_num = int(sys.argv[4]) - 1
    pages_to_extract = [page_num] if 0 <= page_num < total else []

for pn in pages_to_extract:
    page = doc[pn]
    pix = page.get_pixmap(dpi=200)
    img_path = f'{tmpdir}/page-{pn+1:04d}.png'
    pix.save(img_path)
    print(img_path)

doc.close()
" "$PDF" "$TMPDIR" "$ALL_PAGES" "$PAGE" 2>/dev/null

# Run PaddleOCR on each extracted image
RESULTS=""
FIRST=true
for IMG in "$TMPDIR"/page-*.png; do
    [ -f "$IMG" ] || continue
    PAGE_NUM=$(basename "$IMG" .png | sed 's/page-0*//')

    # Get OCR text (suppress stderr from PaddleOCR)
    OCR_TEXT=$(bash "$OCR_SH" "$IMG" 2>/dev/null | grep -E '^\[[0-9]+\.[0-9]+\]' | sed 's/^\[[0-9.]*\] //' | tr '\n' ' ')

    if [ "$FIRST" = true ]; then
        FIRST=false
    else
        RESULTS+=","
    fi

    # Escape for JSON
    ESCAPED=$(echo "$OCR_TEXT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")
    RESULTS+="{\"page\":$PAGE_NUM,\"text\":$ESCAPED}"
done

# Extract answer map from first page
FIRST_TEXT=$(echo "$RESULTS" | python3 -c "
import sys, json, re
pages_str = '[' + sys.stdin.read() + ']'
pages = json.loads(pages_str)
if pages:
    text = pages[0].get('text', '')
    # Try to find answer table
    answer_map = {}
    lines = text.split()
    for i, word in enumerate(lines):
        pairs = re.findall(r'(\d+)\s*([A-D])', text)
        for num, ans in pairs:
            answer_map[int(num)] = ord(ans) - 65
    print(json.dumps(answer_map))
")

echo "{\"pages\":[$RESULTS],\"answerMap\":$FIRST_TEXT}"
