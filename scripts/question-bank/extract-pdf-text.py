import json
import sys
from pathlib import Path

from pypdf import PdfReader


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract-pdf-text.py INPUT.pdf OUTPUT.json")
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    reader = PdfReader(source)
    pages = [
        {"page": index + 1, "text": page.extract_text() or ""}
        for index, page in enumerate(reader.pages)
    ]
    output.write_text(json.dumps({"pages": pages}, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
