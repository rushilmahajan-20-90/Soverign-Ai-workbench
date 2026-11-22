
import json
import sys
import uuid
from pathlib import Path

import fitz
from PIL import Image
from paddleocr import PaddleOCR

INPUT_DIR = Path("/input").resolve()

MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_PDF_PAGES = 50

ocr = PaddleOCR(
    lang="en",
    enable_mkldnn=False
)


def run_ocr(image_path):
    result = ocr.predict(str(image_path))
    page_text = []

    for res in result:
        data = res.json

        if isinstance(data, str):
            data = json.loads(data)

        try:
            page_text.extend(
                str(text)
                for text in data["res"]["rec_texts"]
            )
        except (KeyError, TypeError):
            pass

    return "\n".join(page_text).strip()


def validate_input(filename):
    if not filename or Path(filename).name != filename:
        raise ValueError("Invalid filename")

    source = (INPUT_DIR / filename).resolve()

    if source.parent != INPUT_DIR or not source.is_file():
        raise ValueError("Input file not found")

    if source.suffix.lower() not in {
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg"
    }:
        raise ValueError("Unsupported file type")

    if source.stat().st_size > MAX_FILE_SIZE:
        raise ValueError("Input exceeds 20 MiB limit")

    return source


def process_pdf(source):
    pages = []

    with fitz.open(source) as pdf:

        if len(pdf) > MAX_PDF_PAGES:
            raise ValueError("PDF exceeds 50-page limit")

        for number, page in enumerate(pdf):

            # Extract selectable PDF text first.
            text = page.get_text().strip()

            # Detect embedded images.
            images = page.get_images(full=True)

            # OCR the page if:
            # 1. It contains an image, OR
            # 2. It has very little selectable text.
            should_ocr = bool(images) or len(text) <= 50

            if should_ocr:

                pix = page.get_pixmap(
                    matrix=fitz.Matrix(2, 2),
                    alpha=False
                )

                temp = (
                    Path("/tmp")
                    / ("ocr_" + uuid.uuid4().hex + ".png")
                )

                try:
                    pix.save(str(temp))

                    ocr_text = run_ocr(temp)

                finally:
                    temp.unlink(missing_ok=True)

                # Keep selectable PDF text and add OCR text.
                if ocr_text:

                    if text:
                        text = text + "\n" + ocr_text
                    else:
                        text = ocr_text

            pages.append({
                "page": number,
                "text": text
            })

    return pages


def process_image(source):
    # Validate that the image can be opened.
    with Image.open(source) as image:
        image.verify()

    return [{
        "page": 0,
        "text": run_ocr(source)
    }]


def main():

    if len(sys.argv) != 2:
        print(
            "Usage: worker.py FILENAME",
            file=sys.stderr
        )
        raise SystemExit(2)

    try:

        source = validate_input(sys.argv[1])

        if source.suffix.lower() == ".pdf":
            pages = process_pdf(source)
        else:
            pages = process_image(source)

        print(
            json.dumps(
                {
                    "filename": source.name,
                    "status": "success",
                    "pages": pages
                },
                ensure_ascii=False
            )
        )

    except Exception as exc:

        print(
            json.dumps(
                {
                    "status": "error",
                    "error": str(exc)
                },
                ensure_ascii=False
            ),
            file=sys.stderr
        )

        raise SystemExit(1)


if __name__ == "__main__":
    main()
