
import os
import shutil
import uuid
import json
import subprocess
from pathlib import Path

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException
)

from pydantic import BaseModel
from langchain_core.documents import Document

from app.llm.qwen2 import ask_qwen
from app.llm.qwen import ask_qwen_with_tools

from app.rag.chunker import DocumentChunker
from app.rag.embeddings import EmbeddingManager
from app.rag.vector_store import VectorStoreManager
from app.rag.retriever import RAGRetriever

from docx import Document as WordDocument
import logging

logger = logging.getLogger(__name__)


from dotenv import load_dotenv
load_dotenv()
from app.db.database import init_db, close_db
from contextlib import asynccontextmanager
from fastapi import FastAPI


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="Sovereign AI Workbench"
)


# =========================================================
# PATHS / SECURITY SETTINGS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

DOCUMENT_DIRECTORY = BASE_DIR / "data" / "documents"
GENERATED_DIRECTORY = DOCUMENT_DIRECTORY / "generated"

DOCUMENT_DIRECTORY.mkdir(
    parents=True,
    exist_ok=True
)

GENERATED_DIRECTORY.mkdir(
    parents=True,
    exist_ok=True
)

DOCKER_IMAGE = "sovereign-doc-worker:dev"

MAX_UPLOAD_SIZE = 20 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg"
}


# =========================================================
# RAG COMPONENTS
# =========================================================

chunker = DocumentChunker()

embedding_manager = EmbeddingManager()

vector_store = VectorStoreManager()

retriever = RAGRetriever(
    embedding_manager,
    vector_store
)


# =========================================================
# REQUEST MODELS
# =========================================================

class ChatRequest(BaseModel):
    message: str


class DocumentGenerateRequest(BaseModel):
    prompt: str
    filename: str = "generated_document.docx"


# =========================================================
# BASIC ENDPOINTS
# =========================================================

@app.get("/")
def root():
    return {
        "message": "Sovereign AI Workbench backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


# =========================================================
# DOCKER OCR SANDBOX
# =========================================================

def run_document_sandbox(
    sandbox_filename: str
) -> dict:

    """
    Run the untrusted document through the isolated
    Docker OCR worker.
    """

    documents_path = str(
        DOCUMENT_DIRECTORY.resolve()
    )

    models_path = str(
        (
            Path.home()
            / ".paddlex"
            / "official_models"
        ).resolve()
    )

    if not os.path.isdir(models_path):
        raise RuntimeError(
            "PaddleX model cache was not found at: "
            + models_path
        )

    command = [
        "docker",
        "run",
        "--rm",

        # No network access.
        "--network",
        "none",

        # Read-only root filesystem.
        "--read-only",

        # Temporary writable areas.
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=512m",

        "--tmpfs",
        "/home/worker/.paddlex/func_ret:"
        "rw,nosuid,size=128m,uid=10001,gid=10001",

        "--tmpfs",
        "/home/worker/.paddlex/locks:"
        "rw,nosuid,size=128m,uid=10001,gid=10001",

        "--tmpfs",
        "/home/worker/.paddlex/temp:"
        "rw,nosuid,size=128m,uid=10001,gid=10001",

        # Resource limits.
        "--memory",
        "2g",

        "--cpus",
        "2",

        "--pids-limit",
        "128",

        # Documents: read-only.
        "--mount",
        (
            "type=bind,"
            f"source={documents_path},"
            "target=/input,"
            "readonly"
        ),

        # OCR models: read-only.
        "--mount",
        (
            "type=bind,"
            f"source={models_path},"
            "target=/home/worker/.paddlex/official_models,"
            "readonly"
        ),

        DOCKER_IMAGE,

        sandbox_filename
    ]

    try:

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=300
        )

    except subprocess.TimeoutExpired:

        raise RuntimeError(
            "Document processing timed out."
        )

    except FileNotFoundError:

        raise RuntimeError(
            "Docker was not found. "
            "Make sure Docker Desktop is running."
        )

    if result.returncode != 0:

        error_output = (
            result.stderr.strip()
            or result.stdout.strip()
            or "Unknown Docker worker error."
        )

        raise RuntimeError(
            "Docker document worker failed: "
            + error_output
        )

    stdout = result.stdout.strip()

    if not stdout:

        raise RuntimeError(
            "Docker worker returned no output."
        )

    # -----------------------------------------------------
    # Find the worker's JSON response.
    #
    # PaddleOCR/PaddleX can print informational messages
    # before the worker prints its final JSON result.
    # -----------------------------------------------------

    json_line = None

    for line in reversed(
        stdout.splitlines()
    ):

        line = line.strip()

        if (
            line.startswith("{")
            and line.endswith("}")
        ):

            json_line = line
            break

    if json_line is None:

        raise RuntimeError(
            "Docker worker did not return a JSON result.\n"
            "Worker output:\n"
            + stdout[-2000:]
        )

    try:

        data = json.loads(
            json_line
        )

    except json.JSONDecodeError as exc:

        raise RuntimeError(
            "Docker worker returned invalid JSON.\n"
            "JSON candidate:\n"
            + json_line
        ) from exc

    if data.get("status") != "success":

        raise RuntimeError(
            data.get(
                "error",
                "Document processing failed."
            )
        )

    return data


# =========================================================
# CONVERT SANDBOX RESULT TO LANGCHAIN DOCUMENTS
# =========================================================

def sandbox_result_to_documents(
    sandbox_result: dict,
    original_file_path: str
):

    documents = []

    for page_data in sandbox_result.get(
        "pages",
        []
    ):

        text = str(
            page_data.get(
                "text",
                ""
            )
        ).strip()

        if not text:
            continue

        page_number = page_data.get(
            "page",
            0
        )

        documents.append(
            Document(
                page_content=text,
                metadata={
                    "source": original_file_path,
                    "page": page_number + 1
                }
            )
        )

    return documents


# =========================================================
# DOCUMENT / IMAGE UPLOAD
# =========================================================

@app.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...)
):

    # -----------------------------------------------------
    # Validate filename
    # -----------------------------------------------------

    filename = file.filename

    if not filename:

        raise HTTPException(
            status_code=400,
            detail="No filename was provided."
        )

    filename = os.path.basename(
        filename
    )

    if not filename or filename in {
        ".",
        ".."
    }:

        raise HTTPException(
            status_code=400,
            detail="Invalid filename."
        )

    # -----------------------------------------------------
    # Supported file types
    # -----------------------------------------------------

    extension = Path(
        filename
    ).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:

        raise HTTPException(
            status_code=400,
            detail=(
                "Supported file types are: "
                "PDF, PNG, JPG, JPEG"
            )
        )

    # -----------------------------------------------------
    # Generate document ID
    # -----------------------------------------------------

    document_id = str(
        uuid.uuid4()
    )

    # -----------------------------------------------------
    # Safe sandbox filename
    # -----------------------------------------------------

    sandbox_filename = (
        document_id
        + extension
    )

    # -----------------------------------------------------
    # Final storage path
    # -----------------------------------------------------

    file_path = (
        DOCUMENT_DIRECTORY
        / filename
    )

    if file_path.exists():

        stem = file_path.stem

        filename = (
            f"{stem}_{document_id[:8]}"
            f"{file_path.suffix}"
        )

        file_path = (
            DOCUMENT_DIRECTORY
            / filename
        )

    # -----------------------------------------------------
    # Save uploaded file
    # -----------------------------------------------------

    total_bytes = 0

    try:

        with open(
            file_path,
            "wb"
        ) as buffer:

            while True:

                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                total_bytes += len(chunk)

                if total_bytes > MAX_UPLOAD_SIZE:

                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "File exceeds the "
                            "20 MiB limit."
                        )
                    )

                buffer.write(chunk)

    except HTTPException:

        if file_path.exists():
            file_path.unlink()

        raise

    except Exception as exc:

        if file_path.exists():
            file_path.unlink()

        raise HTTPException(
            status_code=500,
            detail=(
                "Could not save uploaded file: "
                + str(exc)
            )
        )

    finally:

        await file.close()

    # -----------------------------------------------------
    # Temporary sandbox copy
    # -----------------------------------------------------

    sandbox_path = (
        DOCUMENT_DIRECTORY
        / sandbox_filename
    )

    try:

        shutil.copyfile(
            file_path,
            sandbox_path
        )

        # -------------------------------------------------
        # Run Docker OCR
        # -------------------------------------------------

        sandbox_result = run_document_sandbox(
            sandbox_filename
        )

        # -------------------------------------------------
        # Convert OCR result
        # -------------------------------------------------

        documents = sandbox_result_to_documents(
            sandbox_result,
            str(file_path)
        )

        if not documents:

            raise HTTPException(
                status_code=400,
                detail=(
                    "No text could be extracted "
                    "from the uploaded file."
                )
            )

        # -------------------------------------------------
        # Chunk
        # -------------------------------------------------

        chunks = chunker.split(
            documents
        )

        if not chunks:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Document text could not be "
                    "chunked."
                )
            )

        # -------------------------------------------------
        # Embeddings
        # -------------------------------------------------

        texts = [
            chunk.page_content
            for chunk in chunks
        ]

        embeddings = (
            embedding_manager.generate(
                texts
            )
        )

        # -------------------------------------------------
        # ChromaDB
        # -------------------------------------------------

        vector_store.add_documents(
            chunks,
            embeddings,
            document_id
        )

        # -------------------------------------------------
        # Response
        # -------------------------------------------------

        return {
            "status": "indexed",
            "document_id": document_id,
            "file": filename,
            "type": extension,
            "pages": len(documents),
            "chunks": len(chunks)
        }

    except HTTPException:

        raise

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=str(exc)
        )

    finally:

        if sandbox_path.exists():

            try:
                sandbox_path.unlink()
            except Exception:
                pass


# =========================================================
# LIST ALL DOCUMENTS
# =========================================================

@app.get("/documents")
def list_documents():

    files = []

    for file_path in DOCUMENT_DIRECTORY.iterdir():

        if not file_path.is_file():
            continue

        extension = file_path.suffix.lower()

        if extension not in ALLOWED_EXTENSIONS:
            continue

        file_path_string = str(
            file_path
        )

        chunk_count = (
            vector_store.count_by_source(
                file_path_string
            )
        )

        document_ids = (
            vector_store.get_document_ids_by_source(
                file_path_string
            )
        )

        document_id = None

        if document_ids:
            document_id = document_ids[0]

        file_size = file_path.stat().st_size

        files.append({
            "document_id": document_id,
            "filename": file_path.name,
            "type": extension,
            "size_bytes": file_size,
            "chunks": chunk_count
        })

    return {
        "count": len(files),
        "documents": files
    }


# =========================================================
# GET INFORMATION ABOUT ONE DOCUMENT
# =========================================================

@app.get("/documents/{filename}")
def document_info(
    filename: str
):

    filename = os.path.basename(
        filename
    )

    file_path = (
        DOCUMENT_DIRECTORY
        / filename
    )

    if not file_path.is_file():

        raise HTTPException(
            status_code=404,
            detail="Document not found."
        )

    extension = file_path.suffix.lower()

    chunk_count = (
        vector_store.count_by_source(
            str(file_path)
        )
    )

    document_ids = (
        vector_store.get_document_ids_by_source(
            str(file_path)
        )
    )

    document_id = None

    if document_ids:
        document_id = document_ids[0]

    file_size = file_path.stat().st_size

    return {
        "document_id": document_id,
        "filename": file_path.name,
        "type": extension,
        "size_bytes": file_size,
        "chunks": chunk_count
    }


# =========================================================
# DELETE DOCUMENT
# =========================================================

@app.delete("/documents/{filename}")
def delete_document(
    filename: str
):

    filename = os.path.basename(
        filename
    )

    file_path = (
        DOCUMENT_DIRECTORY
        / filename
    )

    if not file_path.is_file():

        raise HTTPException(
            status_code=404,
            detail="Document not found."
        )

    file_path_string = str(
        file_path
    )

    document_ids = (
        vector_store.get_document_ids_by_source(
            file_path_string
        )
    )

    if document_ids:

        deleted_chunks = 0

        for document_id in document_ids:

            deleted_chunks += (
                vector_store.delete_by_document_id(
                    document_id
                )
            )

    else:

        deleted_chunks = (
            vector_store.delete_by_source(
                file_path_string
            )
        )

    file_path.unlink()

    return {
        "status": "deleted",
        "file": filename,
        "chunks_deleted": deleted_chunks
    }


# =========================================================
# CREATE DOCX FROM PROVIDED CONTENT
# =========================================================

@app.post("/documents/create")
def create_docx(
    request: dict
):

    filename = request.get(
        "filename",
        "generated_document.docx"
    )

    title = request.get(
        "title",
        ""
    )

    paragraphs = request.get(
        "paragraphs",
        []
    )

    if not filename.lower().endswith(
        ".docx"
    ):
        filename += ".docx"

    filename = os.path.basename(
        filename
    )

    output_path = (
        GENERATED_DIRECTORY
        / filename
    )

    document = WordDocument()

    if title:

        document.add_heading(
            title,
            level=1
        )

    for paragraph in paragraphs:

        document.add_paragraph(
            str(paragraph)
        )

    document.save(
        output_path
    )

    return {
        "status": "success",
        "filename": filename,
        "path": str(output_path)
    }


# =========================================================
# GENERATE DOCX USING QWEN
# =========================================================

@app.post("/documents/generate")
def generate_docx(
    request: DocumentGenerateRequest
):

    filename = request.filename

    if not filename.lower().endswith(
        ".docx"
    ):
        filename += ".docx"

    filename = os.path.basename(
        filename
    )

    prompt = f"""
You are a professional document writer.

The user wants you to create a Word document.

USER REQUEST:

{request.prompt}

Create the complete document content yourself.

Return ONLY valid JSON.

Use exactly this structure:

{{
    "title": "Document title",
    "sections": [
        {{
            "heading": "Section heading",
            "paragraphs": [
                "Paragraph 1",
                "Paragraph 2"
            ]
        }}
    ]
}}

Rules:

- Write the actual document content yourself.
- Do not explain the JSON.
- Do not use Markdown.
- Do not put JSON inside code fences.
- Return only the JSON object.
- Make the document professional and coherent.
"""

    qwen_response = ask_qwen(
        prompt
    )

    try:

        document_data = json.loads(
            qwen_response
        )

    except json.JSONDecodeError:

        raise HTTPException(
            status_code=500,
            detail=(
                "Qwen did not return valid "
                "document JSON."
            )
        )

    title = document_data.get(
        "title",
        "Generated Document"
    )

    sections = document_data.get(
        "sections",
        []
    )

    if not isinstance(
        sections,
        list
    ):

        raise HTTPException(
            status_code=500,
            detail=(
                "Invalid document structure "
                "returned by Qwen."
            )
        )

    output_path = (
        GENERATED_DIRECTORY
        / filename
    )

    document = WordDocument()

    if title:

        document.add_heading(
            str(title),
            level=1
        )

    for section in sections:

        if not isinstance(
            section,
            dict
        ):
            continue

        heading = section.get(
            "heading",
            ""
        )

        paragraphs = section.get(
            "paragraphs",
            []
        )

        if heading:

            document.add_heading(
                str(heading),
                level=2
            )

        if isinstance(
            paragraphs,
            list
        ):

            for paragraph in paragraphs:

                document.add_paragraph(
                    str(paragraph)
                )

    document.save(
        output_path
    )

    return {
        "status": "success",
        "filename": filename,
        "path": str(output_path),
        "title": title,
        "sections": len(sections)
    }


# =========================================================
# CHAT + MCP AGENT
# =========================================================

@app.post("/chat")
async def chat(request: ChatRequest):
    message = request.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty.",
        )

    try:
        answer = await ask_qwen_with_tools(message)
        return {"answer": answer}

    except HTTPException:
        raise

    except Exception:
        logger.exception("MCP agent failed while processing /chat")
        raise HTTPException(
            status_code=500,
            detail="The AI agent could not process your request.",
        )
