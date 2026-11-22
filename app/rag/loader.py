import os
import json
import fitz  # PyMuPDF

from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document

from paddleocr import PaddleOCR


class DocumentLoader:

    def __init__(self, document_directory="data/documents"):

        self.document_directory = document_directory

        os.makedirs(
            self.document_directory,
            exist_ok=True
        )

        self.ocr = PaddleOCR(
            lang="en",
            enable_mkldnn=False
        )

    # =====================================================
    # PDF LOADING
    # =====================================================

    def load_pdf(self, pdf_path):

        # First try normal PDF text extraction
        loader = PyPDFLoader(pdf_path)

        documents = loader.load()

        total_text = "".join(
            doc.page_content.strip()
            for doc in documents
        )

        # Normal text PDF
        if len(total_text) > 50:

            print(
                f"Normal text found in: {pdf_path}"
            )

            return documents

        # Scanned PDF
        print(
            f"Scanned PDF detected: {pdf_path}"
        )

        print(
            "Using PaddleOCR..."
        )

        return self.load_pdf_with_ocr(
            pdf_path
        )

    # =====================================================
    # SCANNED PDF OCR
    # =====================================================

    def load_pdf_with_ocr(self, pdf_path):

        pdf = fitz.open(pdf_path)

        documents = []

        for page_number, page in enumerate(pdf):

            print(
                f"OCR processing page "
                f"{page_number + 1}/{len(pdf)}"
            )

            pix = page.get_pixmap(
                matrix=fitz.Matrix(2, 2)
            )

            image_path = os.path.join(
                self.document_directory,
                f"_ocr_page_{page_number}.png"
            )

            pix.save(image_path)

            page_text = self.run_ocr(
                image_path
            )

            documents.append(
                Document(
                    page_content=page_text,
                    metadata={
                        "source": pdf_path,
                        "page": page_number
                    }
                )
            )

            # Remove temporary image
            if os.path.exists(image_path):

                os.remove(
                    image_path
                )

        pdf.close()

        return documents

    # =====================================================
    # DIRECT IMAGE OCR
    # =====================================================

    def load_image(self, image_path):

        print(
            f"OCR processing image: "
            f"{image_path}"
        )

        text = self.run_ocr(
            image_path
        )

        return [
            Document(
                page_content=text,
                metadata={
                    "source": image_path,
                    "page": 0
                }
            )
        ]

    # =====================================================
    # OCR ENGINE
    # =====================================================

    def run_ocr(self, image_path):

        result = self.ocr.predict(
            image_path
        )

        page_text = []

        for res in result:

            data = res.json

            if isinstance(data, str):

                data = json.loads(
                    data
                )

            try:

                rec_texts = data["res"][
                    "rec_texts"
                ]

                page_text.extend(
                    rec_texts
                )

            except (
                KeyError,
                TypeError
            ):

                pass

        return "\n".join(
            page_text
        )

    # =====================================================
    # LOAD ALL PDFs
    # =====================================================

    def load_all_pdfs(self):

        all_documents = []

        for filename in os.listdir(
            self.document_directory
        ):

            if filename.lower().endswith(
                ".pdf"
            ):

                pdf_path = os.path.join(
                    self.document_directory,
                    filename
                )

                documents = self.load_pdf(
                    pdf_path
                )

                all_documents.extend(
                    documents
                )

        return all_documents