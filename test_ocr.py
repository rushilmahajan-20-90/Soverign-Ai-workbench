from paddleocr import PaddleOCR

ocr = PaddleOCR(
    lang="en",
    enable_mkldnn=False
)

result = ocr.predict("test.png")

for res in result:
    res.print()