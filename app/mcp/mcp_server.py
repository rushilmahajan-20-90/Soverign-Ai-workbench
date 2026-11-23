import os
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
import contextlib
import json
import sys
import uuid
from pathlib import Path
from xml.sax.saxutils import escape

from docx import Document as WordDocument
from mcp.server import MCPServer
from mcp.types import ToolAnnotations
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

GENERATED_DIRECTORY = PROJECT_ROOT / "data" / "documents" / "generated"
GENERATED_DIRECTORY.mkdir(parents=True, exist_ok=True)

MAX_FILENAME_LENGTH = 120
MAX_DOCUMENT_CHARS = 200_000
MAX_SECTIONS = 100
MAX_PARAGRAPHS_PER_SECTION = 100
MAX_READ_CHARS = 200_000

mcp = MCPServer("sovereign-workbench")

_vector_store = None
_retriever = None

def get_vector_store():
    global _vector_store
    if _vector_store is None:
        with contextlib.redirect_stdout(sys.stderr):
            from app.rag.vector_store import VectorStoreManager
            _vector_store = VectorStoreManager()
    return _vector_store

def get_retriever():
    global _retriever
    if _retriever is None:
        with contextlib.redirect_stdout(sys.stderr):
            from app.rag.embeddings import EmbeddingManager
            from app.rag.retriever import RAGRetriever
            vs = get_vector_store()
            em = EmbeddingManager()
            _retriever = RAGRetriever(embedding_manager=em, vector_store=vs)
    return _retriever


def safe_output_path(filename: str, extension: str) -> Path:
    if not isinstance(filename, str) or not filename.strip():
        filename = f"generated_document{extension}"
    filename = filename.strip()
    if Path(filename).name != filename or filename in {".", ".."}:
        raise ValueError("Filename must be a plain filename, not a path.")
    if len(filename) > MAX_FILENAME_LENGTH:
        raise ValueError("Filename is too long.")
    if not filename.lower().endswith(extension):
        filename += extension
    output_path = GENERATED_DIRECTORY / filename
    if output_path.exists():
        output_path = GENERATED_DIRECTORY / f"{output_path.stem}_{uuid.uuid4().hex[:8]}{extension}"
    output_path.resolve().relative_to(GENERATED_DIRECTORY.resolve())
    return output_path


def validate_document_content(title: str, sections: list) -> None:
    if not isinstance(title, str):
        raise ValueError("Title must be text.")
    if not isinstance(sections, list):
        raise ValueError("Sections must be a list.")
    if len(sections) > MAX_SECTIONS:
        raise ValueError(f"A document may contain at most {MAX_SECTIONS} sections.")
    total_chars = len(title)
    for section in sections:
        if not isinstance(section, dict):
            raise ValueError("Each section must be an object.")
        heading = section.get("heading", "")
        paragraphs = section.get("paragraphs", [])
        if not isinstance(heading, str):
            raise ValueError("Section headings must be text.")
        if not isinstance(paragraphs, list):
            raise ValueError("Section paragraphs must be a list.")
        if len(paragraphs) > MAX_PARAGRAPHS_PER_SECTION:
            raise ValueError("A section contains too many paragraphs.")
        total_chars += len(heading)
        for paragraph in paragraphs:
            if not isinstance(paragraph, str):
                raise ValueError("Paragraphs must be text.")
            total_chars += len(paragraph)
    if total_chars > MAX_DOCUMENT_CHARS:
        raise ValueError("Document content exceeds the allowed size.")


def json_text(value) -> str:
    return json.dumps(value, ensure_ascii=False)


@mcp.tool(
    title="List Indexed Documents",
    annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False),
)
def list_documents(conversation_id: str = "") -> str:
    """List PDFs and images currently indexed. Permanent KB documents are always listed; temporary chat documents are only listed for the active conversation."""
    cid = conversation_id.strip() if conversation_id and conversation_id.strip() else None
    with contextlib.redirect_stdout(sys.stderr):
        documents = get_vector_store().list_documents(conversation_id=cid)
    return json_text({"documents": documents, "count": len(documents)})


@mcp.tool(
    title="Read Complete Document",
    annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False),
)
def read_document(document_id: str, conversation_id: str = "") -> str:
    """Return all OCR-extracted chunks for one indexed PDF or image in page order. Temporary chat documents are restricted to the authorized conversation."""
    if not isinstance(document_id, str) or not document_id.strip():
        return json_text({"error": "document_id is required."})
    clean_id = document_id.strip()
    cid = conversation_id.strip() if conversation_id and conversation_id.strip() else None
    with contextlib.redirect_stdout(sys.stderr):
        chunks = get_vector_store().get_document_chunks(document_id=clean_id, conversation_id=cid)
        if not chunks:
            chunks = get_vector_store().get_document_chunks(source=clean_id, conversation_id=cid)
    if not chunks:
        return json_text({
            "error": "No indexed text was found for that document ID in the current authorized scope.",
            "document_id": clean_id,
        })

    first_metadata = chunks[0].get("metadata") or {}
    source = first_metadata.get("source", first_metadata.get("source_file", clean_id))
    page_text = []
    for chunk in chunks:
        metadata = chunk.get("metadata") or {}
        page = metadata.get("page", "unknown")
        page_text.append(f"[Page {page}]\n{chunk.get('document', '')}")
    full_text = "\n\n".join(page_text)
    truncated = len(full_text) > MAX_READ_CHARS
    if truncated:
        full_text = full_text[:MAX_READ_CHARS]

    return json_text({
        "document_id": clean_id,
        "filename": Path(str(source)).name or clean_id,
        "source": str(source),
        "chunk_count": len(chunks),
        "characters": len(full_text),
        "truncated": truncated,
        "text": full_text,
        "note": "Text is OCR-extracted and may contain recognition errors."
        if full_text.strip() else "No readable text was extracted by OCR.",
    })


@mcp.tool(
    title="Search Documents",
    annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False),
)
def search_documents(query: str, top_k: int = 5, conversation_id: str = "") -> str:
    """Search indexed PDFs and images for relevant OCR-extracted text. Permanent Company Knowledge Base is always searched; temporary chat documents are strictly searched only for the active conversation."""
    if not isinstance(query, str) or not query.strip():
        return "Error: query cannot be empty."
    top_k = max(1, min(int(top_k), 10))
    cid = conversation_id.strip() if conversation_id and conversation_id.strip() else None
    with contextlib.redirect_stdout(sys.stderr):
        results = get_retriever().retrieve(query=query.strip(), top_k=top_k, conversation_id=cid)
    if not results:
        return "No relevant information was found in the indexed documents."
    output = []
    for item in results:
        metadata = item.get("metadata") or {}
        source = metadata.get("source", metadata.get("source_file", "unknown"))
        page = metadata.get("page", "unknown")
        rank = item.get("rank", "unknown")
        output.append(
            f"[Result {rank}]\nSource: {source}\nPage: {page}\n"
            f"Content:\n{item.get('document', '')}"
        )
    return "\n\n---\n\n".join(output)


@mcp.tool(
    title="Create Word Document",
    annotations=ToolAnnotations(read_only_hint=False, open_world_hint=False),
)
def create_word_document(title: str, sections: list, filename: str = "generated_document.docx") -> str:
    """Create a formatted Word document from a title and sections."""
    validate_document_content(title, sections)
    output_path = safe_output_path(filename, ".docx")
    document = WordDocument()
    if title.strip():
        document.add_heading(title.strip(), level=1)
    for section in sections:
        heading = section.get("heading", "").strip()
        if heading:
            document.add_heading(heading, level=2)
        for paragraph in section.get("paragraphs", []):
            document.add_paragraph(paragraph)
    document.save(output_path)
    return json_text({
        "status": "success", "format": "docx",
        "filename": output_path.name, "path": str(output_path.resolve()),
    })


@mcp.tool(
    title="Create PDF Document",
    annotations=ToolAnnotations(read_only_hint=False, open_world_hint=False),
)
def create_pdf_document(title: str, sections: list, filename: str = "generated_document.pdf") -> str:
    """Create a formatted PDF from a title and sections."""
    validate_document_content(title, sections)
    output_path = safe_output_path(filename, ".pdf")
    styles = getSampleStyleSheet()
    story = []
    if title.strip():
        story.append(Paragraph(escape(title.strip()), styles["Title"]))
        story.append(Spacer(1, 0.25 * inch))
    for section in sections:
        heading = section.get("heading", "").strip()
        if heading:
            story.append(Paragraph(escape(heading), styles["Heading2"]))
            story.append(Spacer(1, 0.08 * inch))
        for paragraph in section.get("paragraphs", []):
            safe_text = escape(paragraph).replace("\n", "<br/>")
            story.append(Paragraph(safe_text, styles["BodyText"]))
            story.append(Spacer(1, 0.12 * inch))
    pdf = SimpleDocTemplate(
        str(output_path), pagesize=A4,
        rightMargin=0.7 * inch, leftMargin=0.7 * inch,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch, title=title,
    )
    pdf.build(story)
    return json_text({
        "status": "success", "format": "pdf",
        "filename": output_path.name, "path": str(output_path.resolve()),
    })


if __name__ == "__main__":
    mcp.run()
