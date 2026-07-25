#!/usr/bin/env bash
# Optimized PaddleOCR PDF extraction: single model load for all pages.
# Uses the PaddleOCR venv python for both PyMuPDF (PDF→images) and OCR.
# Usage: bash paddle-extract-fast.sh <pdf_path>
set -e

PDF="$1"
if [ -z "$PDF" ] || [ ! -f "$PDF" ]; then
    echo '{"error": "Usage: paddle-extract-fast.sh <pdf_path>"}'
    exit 1
fi

OCR_PYTHON="$HOME/.claude/skills/paddleocr/.venv/bin/python"
if [ ! -f "$OCR_PYTHON" ]; then
    echo '{"error": "PaddleOCR venv not found"}'
    exit 1
fi

TMPDIR=$(mktemp -d /tmp/paddle-fast-XXXXXX)
trap "rm -rf $TMPDIR" EXIT

# Step 1: Use the PaddleOCR venv python (has PyMuPDF) to convert all pages to
# images. System python3 may lack PyMuPDF — do not switch this back.
"$OCR_PYTHON" -W ignore -c "
import fitz, sys, os
pdf_path = sys.argv[1]
tmpdir = sys.argv[2]
doc = fitz.open(pdf_path)
total = doc.page_count
for pn in range(total):
    page = doc[pn]
    pix = page.get_pixmap(dpi=200)
    img_path = f'{tmpdir}/page-{pn+1:04d}.png'
    pix.save(img_path)
doc.close()
" "$PDF" "$TMPDIR" 2>/dev/null

# Step 2: Use paddleocr venv to OCR all images (single model load, fast!)
"$OCR_PYTHON" -W ignore -c "
import warnings; warnings.filterwarnings('ignore')
from paddleocr import PaddleOCR
import sys, json, os, re, glob

os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'

tmpdir = sys.argv[1]
ocr = PaddleOCR(lang='ch')

# Find all page images
images = sorted(glob.glob(f'{tmpdir}/page-*.png'))

pages = []
for img_path in images:
    page_num = int(os.path.basename(img_path).replace('page-','').replace('.png','').lstrip('0') or '0')

    result = ocr.predict(img_path)
    texts = []
    for item in result:
        if 'rec_texts' in item:
            for text in item['rec_texts']:
                texts.append(str(text))

    full_text = ' '.join(texts)
    pages.append({'page': page_num, 'text': full_text})

# Extract answer map from first page
answer_map = {}
if pages:
    text = pages[0].get('text', '')
    pairs = re.findall(r'(\d+)\s*([A-D])', text)
    for num, ans in pairs:
        answer_map[int(num)] = ord(ans) - 65

output = {'pages': pages, 'answerMap': answer_map}
print(json.dumps(output, ensure_ascii=False))
" "$TMPDIR"

# Cleanup
rm -rf "$TMPDIR"
