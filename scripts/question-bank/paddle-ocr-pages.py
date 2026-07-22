#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

from paddleocr import PaddleOCR


def as_list(value):
    return value.tolist() if hasattr(value, "tolist") else value


def main():
    images = [Path(value) for value in sys.argv[1:]]
    if not images:
        raise SystemExit("Usage: paddle-ocr-pages.py <image> [...]")

    ocr = PaddleOCR(lang="ch")
    for index, image in enumerate(images, start=1):
        result = ocr.predict(str(image))
        lines = []
        for item in result:
            texts = item.get("rec_texts", [])
            scores = item.get("rec_scores", [])
            polygons = item.get("rec_polys", [])
            for line_index, text in enumerate(texts):
                score = float(scores[line_index]) if line_index < len(scores) else 0.0
                polygon = polygons[line_index] if line_index < len(polygons) else None
                lines.append({
                    "text": str(text),
                    "confidence": round(score, 4),
                    "polygon": as_list(polygon),
                })

        payload = {
            "engine": "PaddleOCR-local",
            "sourceImage": str(image),
            "lines": lines,
            "fullText": "\n".join(line["text"] for line in lines),
        }
        image.with_suffix(".paddle.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        image.with_suffix(".txt").write_text(payload["fullText"] + "\n", encoding="utf-8")
        print(f"PaddleOCR {index}/{len(images)}: {image}")


if __name__ == "__main__":
    main()
