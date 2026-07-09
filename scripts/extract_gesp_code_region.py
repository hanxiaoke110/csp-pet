import csv
import io
import json
import re
import subprocess
import sys
from pathlib import Path

from pdf2image import convert_from_path
from PIL import ImageEnhance, ImageOps


ROOT = Path.cwd()
PDF_DIR = ROOT / "reports/gesp-sources/pdfs"
OCR_DIR = ROOT / "reports/gesp-sources/ocr"
CROP_DIR = ROOT / "reports/gesp-sources/crops"
CROP_DIR.mkdir(parents=True, exist_ok=True)


def find_page(source_key: str, question_no: int) -> int:
    text_file = OCR_DIR / f"{source_key}.txt"
    if not text_file.exists():
        raise RuntimeError(f"OCR text missing: {text_file}")
    current_page = None
    pattern = re.compile(rf"(^\s*{question_no}\s*[\.\u3002\uff0e\u3001、,，])|第\s*{question_no}\s*题")
    for line in text_file.read_text(encoding="utf8").splitlines():
        marker = re.match(r"--- page (\d+) ---", line)
        if marker:
            current_page = int(marker.group(1))
            continue
        if current_page and pattern.search(line):
            return current_page
    raise RuntimeError(f"question {question_no} not found in {source_key}")


def tsv_lines(image_path: Path):
    result = subprocess.run(
        ["tesseract", str(image_path), "stdout", "-l", "chi_sim+eng", "--psm", "6", "-c", "tessedit_create_tsv=1"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        errors="ignore",
        timeout=60,
    )
    rows = list(csv.DictReader(io.StringIO(result.stdout), delimiter="\t"))
    grouped = {}
    for row in rows:
        if not row.get("text", "").strip():
            continue
        key = (row["block_num"], row["par_num"], row["line_num"])
        grouped.setdefault(key, []).append(row)
    lines = []
    for parts in grouped.values():
        text = " ".join(part["text"] for part in parts)
        left = min(int(part["left"]) for part in parts)
        top = min(int(part["top"]) for part in parts)
        right = max(int(part["left"]) + int(part["width"]) for part in parts)
        bottom = max(int(part["top"]) + int(part["height"]) for part in parts)
        lines.append({"text": text, "left": left, "top": top, "right": right, "bottom": bottom})
    lines.sort(key=lambda item: (item["top"], item["left"]))
    return lines


def locate_crop(lines, question_no: int, page_height: int):
    q_pattern = re.compile(rf"(^\s*{question_no}\s*[\.\u3002\uff0e\u3001、,，])|第\s*{question_no}\s*题")
    q_index = None
    for index, line in enumerate(lines):
        if q_pattern.search(line["text"]):
            q_index = index
            break
    if q_index is None:
        raise RuntimeError(f"question line {question_no} not found on rendered page")

    end_index = None
    for index in range(q_index + 1, len(lines)):
        text = lines[index]["text"].strip()
        if re.match(r"^[AＡ]\s*[\.\uff0e]", text) or re.match(r"^[AＡ]\s+", text):
            end_index = index
            break
        if re.match(rf"^\s*{question_no + 1}\s*[\.\u3002\uff0e\u3001、,，]", text) or re.search(rf"第\s*{question_no + 1}\s*题", text):
            end_index = index
            break
        if "【答案" in text:
            end_index = index
            break
    if end_index is None:
        end_top = min(page_height - 80, lines[q_index]["bottom"] + 900)
    else:
        end_top = lines[end_index]["top"]
    return lines[q_index]["bottom"] + 12, max(lines[q_index]["bottom"] + 120, end_top - 8)


def ocr_code(image_path: Path, lang: str):
    result = subprocess.run(
        [
            "tesseract",
            str(image_path),
            "stdout",
            "-l",
            lang,
            "--psm",
            "6",
            "-c",
            "preserve_interword_spaces=1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        errors="ignore",
        timeout=60,
    )
    return result.stdout


def main():
    source_key = sys.argv[1]
    question_no = int(sys.argv[2])
    pdf = PDF_DIR / f"{source_key}.pdf"
    page_no = find_page(source_key, question_no)
    locate_page = convert_from_path(str(pdf), first_page=page_no, last_page=page_no, dpi=170)[0]
    page_path = CROP_DIR / f"{source_key}-p{page_no}-locate.png"
    locate_page.save(page_path)
    lines = tsv_lines(page_path)
    top, bottom = locate_crop(lines, question_no, locate_page.height)

    page = convert_from_path(str(pdf), first_page=page_no, last_page=page_no, dpi=300)[0]
    scale_x = page.width / locate_page.width
    scale_y = page.height / locate_page.height
    crop = page.crop((int(240 * scale_x), int(top * scale_y), int((locate_page.width - 220) * scale_x), int(bottom * scale_y)))
    gray = ImageOps.grayscale(crop)
    gray = ImageEnhance.Contrast(gray).enhance(2.2)
    crop_path = CROP_DIR / f"{source_key}-q{question_no:02d}.png"
    gray.save(crop_path)
    print(json.dumps({
        "page": page_no,
        "crop": str(crop_path.relative_to(ROOT)),
        "ocr": ocr_code(crop_path, "eng"),
        "ocrMixed": ocr_code(crop_path, "chi_sim+eng"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
