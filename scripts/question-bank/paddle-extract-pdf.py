#!/usr/bin/env python3
"""
Extract text from PDF pages using PaddleOCR for accurate Chinese recognition.
Used by source-match.mjs as a drop-in replacement for pdfjs-dist text extraction.

Usage:
  python3 paddle-extract-pdf.py <pdf_path> [--pages=1,2,3] [--all]
  python3 paddle-extract-pdf.py <pdf_path> --page=5

Output (JSON to stdout):
  {
    "pages": [
      {"page": 1, "text": "...", "lines": [...]},
      ...
    ],
    "answerMap": {"1": 0, "2": 1, ...}
  }
"""

import json
import os
import sys

os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

import fitz  # PyMuPDF
from paddleocr import PaddleOCR


def extract_answer_table(text):
    """Extract answer mapping from answer table on first page."""
    answer_map = {}
    lines = text.split('\n')
    in_answer_section = False
    for line in lines:
        line = line.strip()
        if '题号' in line or '答案' in line:
            in_answer_section = True
            continue
        if in_answer_section:
            # Try to parse "1 A 2 B 3 C" style answer tables
            import re
            pairs = re.findall(r'(\d+)\s*([A-D])', line)
            for num, ans in pairs:
                answer_map[int(num)] = ord(ans) - 65
            # Also try "AAAAABBBBB" style
            if not pairs and re.match(r'^[A-D]+$', line):
                for i, ch in enumerate(line):
                    answer_map[i + 1] = ord(ch) - 65
    return answer_map


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(json.dumps({"error": "Usage: paddle-extract-pdf.py <pdf_path> [--pages=1,2,3] [--all]"}))
        sys.exit(1)

    pdf_path = args[0]
    if not os.path.exists(pdf_path):
        print(json.dumps({"error": f"PDF not found: {pdf_path}"}))
        sys.exit(1)

    # Parse page selection
    page_arg = next((a for a in sys.argv[1:] if a.startswith('--pages=')), None)
    all_pages = '--all' in sys.argv
    single_page = next((a for a in sys.argv[1:] if a.startswith('--page=')), None)

    doc = fitz.open(pdf_path)
    total_pages = doc.page_count

    if single_page:
        target_pages = [int(single_page.split('=')[1])]
    elif page_arg:
        target_pages = [int(p) for p in page_arg.split('=')[1].split(',')]
    elif all_pages:
        target_pages = list(range(1, total_pages + 1))
    else:
        # Default: first page + all pages (for searching)
        target_pages = list(range(1, min(total_pages + 1, 12)))

    # Filter valid pages
    target_pages = [p for p in target_pages if 1 <= p <= total_pages]

    ocr = PaddleOCR(lang='ch')
    pages_output = []
    answer_map = {}

    for page_num in target_pages:
        page = doc[page_num - 1]
        # Render page to image at 200 DPI for good OCR quality
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")

        # Save temp image for PaddleOCR
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            f.write(img_bytes)
            tmp_path = f.name

        try:
            result = ocr.predict(tmp_path)
            lines = []
            full_text_parts = []
            for item in result:
                texts = item.get("rec_texts", [])
                scores = item.get("rec_scores", [])
                polygons = item.get("rec_polys", [])
                for i, text in enumerate(texts):
                    score = float(scores[i]) if i < len(scores) else 0.0
                    polygon = polygons[i] if i < len(polygons) else None
                    lines.append({
                        "text": str(text),
                        "confidence": round(score, 4),
                        "polygon": polygon.tolist() if hasattr(polygon, 'tolist') else polygon,
                    })
                    full_text_parts.append(str(text))

            full_text = '\n'.join(full_text_parts)
            pages_output.append({
                "page": page_num,
                "text": full_text,
                "lines": lines,
                "lineCount": len(lines),
            })

            # Try to extract answer table from first page
            if page_num == 1 and not answer_map:
                answer_map = extract_answer_table(full_text)

        finally:
            os.unlink(tmp_path)

    doc.close()

    output = {
        "sourcePath": pdf_path,
        "totalPages": total_pages,
        "extractedPages": len(pages_output),
        "pages": pages_output,
        "answerMap": answer_map,
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
