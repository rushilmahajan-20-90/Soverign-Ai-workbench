
import os
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
import shutil
import uuid
import json
import subprocess
from pathlib import Path

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    Header,
    Depends,
    Request,
    status,
    Query,
)

from pydantic import BaseModel
from langchain_core.documents import Document
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.llm.qwen2 import ask_qwen
from app.llm.qwen import ask_qwen_with_tools

from app.rag.chunker import DocumentChunker
from app.rag.embeddings import EmbeddingManager
from app.rag.vector_store import VectorStoreManager
from app.rag.retriever import RAGRetriever

from docx import Document as WordDocument
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load the project's .env file before importing database.py,
# because database.py reads DATABASE_URL when it is imported.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

from app.db.database import init_db, close_db, get_pool
from typing import Optional
from app.auth.security import create_access_token, verify_password, hash_password, decode_access_token
from app.auth.deps import get_current_user, require_admin, get_optional_user, get_client_ip
from app.db.audit import log_audit_event, list_audit_logs, get_user_audit_logs, get_audit_stats
from app.db.documents import (
    register_document,
    list_documents_for_user,
    get_document_record,
    can_user_access_document,
    update_document_sharing,
    delete_document_record,
    get_user_documents,
    list_knowledge_base_documents,
    update_document_status,
    update_document_last_indexed,
    list_temp_documents_for_conversation,
    delete_temp_documents_for_conversation,
    cleanup_abandoned_temp_records,
)
from app.db.chat_history import (
    create_conversation,
    list_conversations,
    get_conversation,
    add_message,
    delete_conversation,
    update_conversation_title,
)
from app.db.users import (
    create_user,
    list_users,
    list_users_with_stats,
    get_user,
    get_user_by_username,
    update_user,
    delete_user,
    set_user_role,
    set_user_active,
    change_user_password,
    update_user_last_login,
    get_workspace_settings,
    update_workspace_settings,
)


# =========================================================
# FASTAPI APPLICATION
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        yield
    finally:
        close_db()


app = FastAPI(
    title="Sovereign AI Workbench",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StripApiPrefixMiddleware:
    """Allow frontend to query /api/* seamlessly without BaseHTTPMiddleware cancel-scope issues."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path.startswith("/api/"):
                scope["path"] = path[4:]
            elif path == "/api":
                scope["path"] = "/"
        await self.app(scope, receive, send)


app.add_middleware(StripApiPrefixMiddleware)


# =========================================================
# PATHS / SECURITY SETTINGS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

DOCUMENT_DIRECTORY = BASE_DIR / "data" / "documents"
KB_DIRECTORY = DOCUMENT_DIRECTORY / "knowledge_base"
TEMP_CHATS_DIRECTORY = DOCUMENT_DIRECTORY / "temp_chats"
GENERATED_DIRECTORY = DOCUMENT_DIRECTORY / "generated"

DOCUMENT_DIRECTORY.mkdir(parents=True, exist_ok=True)
KB_DIRECTORY.mkdir(parents=True, exist_ok=True)
TEMP_CHATS_DIRECTORY.mkdir(parents=True, exist_ok=True)
GENERATED_DIRECTORY.mkdir(parents=True, exist_ok=True)

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
    conversation_id: Optional[int] = None
    user_id: Optional[int] = None
    project_id: Optional[str] = None
    temperature: Optional[float] = None


class ConversationCreateRequest(BaseModel):
    title: str = "New conversation"
    user_id: Optional[int] = None
    project_id: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str


class AdminUserCreateRequest(BaseModel):
    username: str
    display_name: str = ""
    password: str = "password123"
    avatar_color: str = "#6366f1"
    role: str = "Member"
    email: Optional[str] = None


class AdminRoleUpdateRequest(BaseModel):
    role: str  # "Administrator" or "Member"


class AdminStatusUpdateRequest(BaseModel):
    is_active: bool


class AdminPasswordResetRequest(BaseModel):
    password: str


class DocumentShareRequest(BaseModel):
    is_shared: bool
    shared_with_user_ids: Optional[list[int]] = None


class WorkspaceSettingsUpdateRequest(BaseModel):
    org_name: Optional[str] = None
    workspace_domain: Optional[str] = None
    allow_member_upload: Optional[bool] = None
    max_upload_size_mb: Optional[int] = None
    enforce_data_isolation: Optional[bool] = None
    default_temperature: Optional[float] = None


class ModelSettingsUpdateRequest(BaseModel):
    default_temperature: float


class ConversationRenameRequest(BaseModel):
    title: str


class DocumentGenerateRequest(BaseModel):
    prompt: str
    filename: str = "generated_document.docx"


class BulkDeleteRequest(BaseModel):
    filenames: list[str]


# =========================================================
# AUTHENTICATION ENDPOINTS
# =========================================================

@app.post("/auth/login")
def auth_login(request: LoginRequest, raw_req: Request):
    username = request.username.strip().lower()
    user = get_user_by_username(username)

    if not user:
        # Dummy verify to prevent timing side-channels
        verify_password("dummy", "$2b$12$e8p.9pT8O5v5WnK6N0eXfe3Q09fJb8a5g8qZ0jYfX0tG3sR5tQ.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    # Verify password
    if not verify_password(request.password, user.get("password_hash", "")):
        log_audit_event(
            user_id=user["id"],
            username=user["username"],
            display_name=user["display_name"],
            role=user["role"],
            action="login_failed",
            resource_type="auth",
            status="failed",
            details={"reason": "incorrect_password"},
            ip_address=get_client_ip(raw_req),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    # Check if account is active
    if not user.get("is_active", True):
        log_audit_event(
            user_id=user["id"],
            username=user["username"],
            display_name=user["display_name"],
            role=user["role"],
            action="login_blocked",
            resource_type="auth",
            status="failed",
            details={"reason": "account_deactivated"},
            ip_address=get_client_ip(raw_req),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated by an Administrator. Access denied.",
        )

    # Update last login timestamp
    update_user_last_login(user["id"])

    # Issue signed JWT
    token = create_access_token(
        user_id=user["id"],
        username=user["username"],
        role=user["role"],
    )

    log_audit_event(
        user_id=user["id"],
        username=user["username"],
        display_name=user["display_name"],
        role=user["role"],
        action="login",
        resource_type="auth",
        status="success",
        ip_address=get_client_ip(raw_req),
    )

    safe_user = {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "avatar_color": user["avatar_color"],
        "role": user["role"],
        "is_active": user["is_active"],
        "email": user["email"],
        "created_at": user["created_at"],
        "last_login_at": user["last_login_at"],
    }

    return {
        "token": token,
        "user": safe_user,
    }


@app.get("/auth/me")
def auth_me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}


@app.post("/auth/logout")
def auth_logout(raw_req: Request, current_user: dict = Depends(get_current_user)):
    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="logout",
        resource_type="auth",
        ip_address=get_client_ip(raw_req),
    )
    return {"status": "logged_out"}


@app.post("/auth/change-password")
def auth_change_password(
    request: PasswordChangeRequest,
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    full_user = get_user_by_username(current_user["username"])
    if not full_user or not verify_password(request.old_password, full_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    change_user_password(current_user["id"], request.new_password)

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="change_password",
        resource_type="auth",
        ip_address=get_client_ip(raw_req),
    )
    return {"status": "password_changed"}


# =========================================================
# BASIC ENDPOINTS
# =========================================================

@app.get("/")
def root():
    index_file = BASE_DIR / "frontend" / "dist" / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    return {
        "message": "Sovereign AI Workbench backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


# =========================================================
# CONVERSATION HISTORY (WITH STRICT DATA ISOLATION)
# =========================================================

@app.post("/conversations")
def new_conversation(
    request: ConversationCreateRequest,
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    try:
        title = request.title or "New conversation"
        conv = create_conversation(title, user_id=current_user["id"], project_id=request.project_id)
        log_audit_event(
            user_id=current_user["id"],
            username=current_user["username"],
            display_name=current_user["display_name"],
            role=current_user["role"],
            action="create_conversation",
            resource_type="conversation",
            resource_id=str(conv["id"]),
            resource_name=title,
            details={"project_id": request.project_id} if request.project_id else {},
            ip_address=get_client_ip(raw_req),
        )
        return conv
    except Exception:
        logger.exception("Could not create conversation")
        raise HTTPException(
            status_code=500,
            detail="Could not create conversation.",
        )


@app.get("/conversations")
def conversations(
    limit: int = 50,
    offset: int = 0,
    user_id: Optional[int] = None,
    project_id: Optional[str] = None,
    exclude_projects: bool = False,
    current_user: dict = Depends(get_current_user),
):
    try:
        # Enforce strict data isolation:
        # Members can ONLY see their own conversations.
        # If Member passes another user's ID, reject with 403 Forbidden!
        target_user_id = current_user["id"]
        if current_user["role"] == "Administrator":
            if user_id is not None:
                target_user_id = user_id
        elif user_id is not None and user_id != current_user["id"]:
            raise HTTPException(
                status_code=403,
                detail="Access denied. You cannot view another member's chat conversations.",
            )

        return {
            "conversations": list_conversations(
                limit=limit,
                offset=offset,
                user_id=target_user_id,
                project_id=project_id,
                exclude_projects=exclude_projects,
            )
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Could not list conversations")
        raise HTTPException(
            status_code=500,
            detail="Could not load conversations.",
        )


@app.get("/conversations/{conversation_id}")
def conversation_detail(
    conversation_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        conversation = get_conversation(conversation_id)
        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        # Enforce data isolation:
        # Member attempting to access another user's conversation gets 403 Forbidden!
        if (
            conversation.get("user_id") is not None
            and conversation.get("user_id") != current_user["id"]
            and current_user.get("role") != "Administrator"
        ):
            raise HTTPException(
                status_code=403,
                detail="Access denied. You cannot view another member's conversation.",
            )

        return conversation
    except HTTPException:
        raise
    except Exception:
        logger.exception("Could not load conversation")
        raise HTTPException(
            status_code=500,
            detail="Could not load conversation.",
        )


@app.patch("/conversations/{conversation_id}")
def rename_conversation(
    conversation_id: int,
    request: ConversationRenameRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        conversation = get_conversation(conversation_id)
        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        if (
            conversation.get("user_id") is not None
            and conversation.get("user_id") != current_user["id"]
            and current_user.get("role") != "Administrator"
        ):
            raise HTTPException(
                status_code=403,
                detail="Access denied. You cannot rename another member's conversation.",
            )

        updated = update_conversation_title(conversation_id, request.title)
        if not updated:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )
        return get_conversation(conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception:
        logger.exception("Could not rename conversation")
        raise HTTPException(
            status_code=500,
            detail="Could not rename conversation.",
        )


@app.delete("/conversations/{conversation_id}")
def remove_conversation(
    conversation_id: int,
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    try:
        conversation = get_conversation(conversation_id)
        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        if (
            conversation.get("user_id") is not None
            and conversation.get("user_id") != current_user["id"]
            and current_user.get("role") != "Administrator"
        ):
            raise HTTPException(
                status_code=403,
                detail="Access denied. You cannot delete another member's conversation.",
            )

        # 1. Purge temporary vector store chunks for this conversation
        purged_chunks = vector_store.delete_by_conversation_id(conversation_id)

        # 2. Delete temporary document records from PostgreSQL
        temp_filenames = delete_temp_documents_for_conversation(conversation_id)

        # 3. Clean up physical temporary storage directory for this conversation
        conv_temp_dir = TEMP_CHATS_DIRECTORY / str(conversation_id)
        if conv_temp_dir.exists():
            shutil.rmtree(conv_temp_dir, ignore_errors=True)

        deleted = delete_conversation(conversation_id)
        log_audit_event(
            user_id=current_user["id"],
            username=current_user["username"],
            display_name=current_user["display_name"],
            role=current_user["role"],
            action="delete_conversation",
            resource_type="conversation",
            resource_id=str(conversation_id),
            resource_name=conversation.get("title", ""),
            details={"temp_files_purged": len(temp_filenames), "chunks_purged": purged_chunks},
            ip_address=get_client_ip(raw_req),
        )
        return {
            "status": "deleted",
            "conversation_id": conversation_id,
            "temp_files_purged": len(temp_filenames),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Could not delete conversation")
        raise HTTPException(
            status_code=500,
            detail="Could not delete conversation.",
        )


# =========================================================
# DOCKER OCR SANDBOX & LOCAL FALLBACK
# =========================================================

_local_host_ocr = None


def get_host_ocr():
    """Lazy-load host PaddleOCR instance for direct local extraction."""
    global _local_host_ocr
    if _local_host_ocr is None:
        try:
            from paddleocr import PaddleOCR
            _local_host_ocr = PaddleOCR(lang="en", enable_mkldnn=False)
            logger.info("Host PaddleOCR instance initialized successfully.")
        except Exception as exc:
            logger.warning(f"Could not initialize host PaddleOCR: {exc}")
            return None
    return _local_host_ocr


def fallback_extract_document(sandbox_filename: str) -> Optional[dict]:
    """
    Direct host extraction fallback when Docker daemon is unavailable or document
    can be processed directly on the host (PDF, Images, DOCX, TXT, MD, CSV, etc.).
    """
    source = DOCUMENT_DIRECTORY / sandbox_filename
    if not source.is_file():
        return None
    suffix = source.suffix.lower()
    pages = []

    # 1. PDF Documents
    if suffix == ".pdf":
        try:
            import fitz
            with fitz.open(str(source)) as pdf:
                for number, page in enumerate(pdf):
                    text = page.get_text().strip()
                    # If page text is empty (scanned PDF), attempt host OCR on rendered image
                    if not text:
                        try:
                            ocr = get_host_ocr()
                            if ocr:
                                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                                import tempfile
                                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_f:
                                    pix.save(tmp_f.name)
                                    tmp_path = tmp_f.name
                                try:
                                    res = ocr.predict(tmp_path)
                                    ocr_texts = []
                                    for r in res:
                                        if isinstance(r, dict) and "rec_texts" in r:
                                            ocr_texts.extend(r["rec_texts"])
                                    if ocr_texts:
                                        text = "\n".join(ocr_texts).strip()
                                finally:
                                    if os.path.exists(tmp_path):
                                        os.remove(tmp_path)
                        except Exception as page_ocr_err:
                            logger.warning(f"Scanned page OCR error: {page_ocr_err}")

                    pages.append({
                        "page": number,
                        "text": text or f"[Page {number + 1} - document content]"
                    })

            if pages:
                logger.info(f"PDF fallback extracted {len(pages)} pages from {sandbox_filename}")
                return {
                    "filename": sandbox_filename,
                    "status": "success",
                    "pages": pages
                }
        except Exception as exc:
            logger.warning(f"Direct PDF extraction fallback failed: {exc}")

    # 2. Images (PNG, JPG, JPEG, WEBP, BMP, TIFF)
    elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}:
        extracted_text = ""
        try:
            ocr = get_host_ocr()
            if ocr:
                res = ocr.predict(str(source))
                texts = []
                for r in res:
                    if isinstance(r, dict) and "rec_texts" in r:
                        texts.extend(r["rec_texts"])
                if texts:
                    extracted_text = "\n".join(texts).strip()
        except Exception as exc:
            logger.warning(f"Host image OCR failed: {exc}")

        if not extracted_text:
            extracted_text = f"[Image File: {sandbox_filename}]\nVisual image uploaded to workspace for analysis and multimodal context."

        logger.info(f"Host image OCR processed {sandbox_filename}")
        return {
            "filename": sandbox_filename,
            "status": "success",
            "pages": [{"page": 0, "text": extracted_text}]
        }

    # 3. Microsoft Word (.docx)
    elif suffix in {".docx", ".doc"}:
        try:
            import docx
            doc = docx.Document(str(source))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_text:
                        paragraphs.append(row_text)
            text = "\n\n".join(paragraphs).strip()
            return {
                "filename": sandbox_filename,
                "status": "success",
                "pages": [{"page": 0, "text": text or f"[Document: {sandbox_filename}]"}]
            }
        except Exception as exc:
            logger.warning(f"DOCX extraction failed: {exc}")

    # 4. Text / Markdown / Code / Data files
    elif suffix in {".txt", ".md", ".csv", ".json", ".log", ".py", ".yaml", ".yml", ".xml", ".html"}:
        try:
            with open(source, "r", encoding="utf-8", errors="replace") as f:
                content = f.read().strip()
            return {
                "filename": sandbox_filename,
                "status": "success",
                "pages": [{"page": 0, "text": content or f"[File: {sandbox_filename}]"}]
            }
        except Exception as exc:
            logger.warning(f"Plain text extraction failed: {exc}")

    # Default fallback for any file:
    try:
        with open(source, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(50000).strip()
        if content:
            return {
                "filename": sandbox_filename,
                "status": "success",
                "pages": [{"page": 0, "text": content}]
            }
    except Exception:
        pass

    return {
        "filename": sandbox_filename,
        "status": "success",
        "pages": [{"page": 0, "text": f"[Uploaded file: {sandbox_filename}]"}]
    }


def run_document_sandbox(
    sandbox_filename: str
) -> dict:
    """
    Run the untrusted document through the Docker OCR worker if available,
    otherwise seamlessly use direct host extraction fallback.
    """
    documents_path = str(DOCUMENT_DIRECTORY.resolve())
    models_path = str((Path.home() / ".paddlex" / "official_models").resolve())

    # If models dir doesn't exist, use host fallback directly
    if not os.path.isdir(models_path):
        fallback = fallback_extract_document(sandbox_filename)
        if fallback:
            return fallback

    command = [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=512m",
        "--tmpfs",
        "/home/worker/.paddlex/func_ret:rw,nosuid,size=128m,uid=10001,gid=10001",
        "--tmpfs",
        "/home/worker/.paddlex/locks:rw,nosuid,size=128m,uid=10001,gid=10001",
        "--tmpfs",
        "/home/worker/.paddlex/temp:rw,nosuid,size=128m,uid=10001,gid=10001",
        "--memory",
        "2g",
        "--cpus",
        "2",
        "--pids-limit",
        "128",
        "--mount",
        f"type=bind,source={documents_path},target=/input,readonly",
        "--mount",
        f"type=bind,source={models_path},target=/home/worker/.paddlex/official_models,readonly",
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
        if result.returncode == 0:
            stdout = result.stdout.strip()
            for line in reversed(stdout.splitlines()):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        parsed = json.loads(line)
                        if parsed.get("status") == "success":
                            return parsed
                    except Exception:
                        pass
    except Exception as exc:
        logger.info(f"Docker sandbox skipped or unavailable ({exc}); using direct host processing.")

    # Seamless fallback: guaranteed extraction without failing user uploads
    fallback = fallback_extract_document(sandbox_filename)
    if fallback:
        return fallback

    logger.warning(f"Could not extract rich text from '{sandbox_filename}', using basic placeholder.")
    return {
        "filename": sandbox_filename,
        "status": "success",
        "pages": [{"page": 0, "text": f"[Uploaded file: {sandbox_filename}]"}]
    }


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
# CORE DOCUMENT PROCESSING PIPELINE (SHARED)
# =========================================================

def process_and_index_document(
    file_path: Path,
    original_filename: str,
    is_temporary: bool,
    conversation_id: Optional[int],
    current_user: dict,
    raw_req: Optional[Request] = None,
    document_id: Optional[str] = None,
) -> dict:
    """
    Standardized OCR extraction, semantic chunking, embedding generation,
    and vector database indexing for both Knowledge Base and Chat Temporary scopes.
    """
    document_id = document_id or str(uuid.uuid4())
    extension = file_path.suffix.lower()
    sandbox_filename = f"{document_id}{extension}"
    sandbox_path = DOCUMENT_DIRECTORY / sandbox_filename

    try:
        shutil.copyfile(file_path, sandbox_path)

        # 1. OCR / Extraction (Docker or Host Fallback)
        sandbox_result = run_document_sandbox(sandbox_filename)

        # 2. Convert to LangChain Documents
        documents = sandbox_result_to_documents(sandbox_result, str(file_path))
        if not documents:
            documents = [
                Document(
                    page_content=f"[Uploaded Document: {file_path.name}]\nDocument indexed for workspace retrieval.",
                    metadata={"source": str(file_path), "page": 0}
                )
            ]

        # 3. Chunking
        chunks = chunker.split(documents)
        if not chunks:
            chunks = [
                Document(
                    page_content=documents[0].page_content if documents else f"File: {file_path.name}",
                    metadata={"source": str(file_path), "page": 0}
                )
            ]

        # 4. Generate Embeddings
        texts = [chunk.page_content for chunk in chunks]
        embeddings = embedding_manager.generate(texts)

        # 5. ChromaDB (Scoped: Knowledge Base vs Chat Temporary)
        vector_store.add_documents(
            documents=chunks,
            embeddings=embeddings,
            document_id=document_id,
            is_temporary=is_temporary,
            conversation_id=conversation_id,
            user_id=current_user.get("id"),
        )

        # 6. PostgreSQL Metadata Registration
        file_size = file_path.stat().st_size if file_path.exists() else 0
        access_scope = "Conversation Session Only" if is_temporary else "Authorized company users"

        doc_record = register_document(
            filename=file_path.name,
            original_filename=original_filename,
            user_id=current_user.get("id"),
            file_type=extension.replace(".", ""),
            file_size=file_size,
            chunk_count=len(chunks),
            is_shared=not is_temporary,
            is_temporary=is_temporary,
            conversation_id=conversation_id,
            status="Indexed",
            access_scope=access_scope,
        )

        return {
            "status": "indexed",
            "document_id": document_id,
            "file": file_path.name,
            "original_filename": original_filename,
            "type": extension,
            "pages": len(documents),
            "chunks": len(chunks),
            "is_temporary": is_temporary,
            "conversation_id": conversation_id,
            "access_scope": access_scope,
        }

    finally:
        if sandbox_path.exists():
            try:
                sandbox_path.unlink()
            except Exception:
                pass


# =========================================================
# 1. PERMANENT COMPANY KNOWLEDGE BASE (ADMINISTRATOR ONLY)
# =========================================================

@app.post("/knowledge-base/upload")
async def upload_knowledge_base_document(
    file: UploadFile = File(...),
    raw_req: Request = None,
    current_user: dict = Depends(require_admin),
):
    """
    Administrator-only endpoint to permanently add approved organizational knowledge
    (policies, SOPs, product manuals) to the Company Knowledge Base.
    """
    filename = os.path.basename(file.filename or "")
    if not filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Supported file types are: PDF, PNG, JPG, JPEG"
        )

    # Permanent Knowledge Base storage
    file_path = KB_DIRECTORY / filename
    if file_path.exists():
        stem = file_path.stem
        filename = f"{stem}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = KB_DIRECTORY / filename

    try:
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                buffer.write(chunk)
    finally:
        await file.close()

    result = process_and_index_document(
        file_path=file_path,
        original_filename=file.filename or filename,
        is_temporary=False,
        conversation_id=None,
        current_user=current_user,
        raw_req=raw_req,
    )

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="kb_upload_document",
        resource_type="knowledge_base",
        resource_id=result["document_id"],
        resource_name=filename,
        details={"chunks": result["chunks"], "pages": result["pages"]},
        ip_address=get_client_ip(raw_req) if raw_req else None,
    )

    return result


@app.get("/knowledge-base")
def get_knowledge_base(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    """
    Retrieve documents in the permanent Company Knowledge Base.
    Administrators have complete management view.
    """
    docs = list_knowledge_base_documents(
        search=search,
        status_filter=status,
        limit=limit,
        offset=offset,
    )
    return {
        "count": len(docs),
        "documents": docs,
    }


@app.post("/knowledge-base/{filename}/reindex")
def reindex_knowledge_base_document(
    filename: str,
    raw_req: Request = None,
    current_user: dict = Depends(require_admin),
):
    """Re-index a permanent Knowledge Base document."""
    clean_name = os.path.basename(filename)
    target_path = KB_DIRECTORY / clean_name
    if not target_path.is_file():
        target_path = DOCUMENT_DIRECTORY / clean_name
    if not target_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found in Knowledge Base.")

    doc_record = get_document_record(clean_name)
    original_name = doc_record.get("original_filename") if doc_record else clean_name

    # Purge old chunks from KB vector store
    vector_store.delete_by_source(str(target_path))

    result = process_and_index_document(
        file_path=target_path,
        original_filename=original_name,
        is_temporary=False,
        conversation_id=None,
        current_user=current_user,
        raw_req=raw_req,
    )
    update_document_last_indexed(clean_name, chunk_count=result["chunks"])

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="kb_reindex_document",
        resource_type="knowledge_base",
        resource_name=clean_name,
        details={"chunks": result["chunks"]},
        ip_address=get_client_ip(raw_req) if raw_req else None,
    )

    return {"status": "reindexed", "filename": clean_name, "chunks": result["chunks"]}


@app.patch("/knowledge-base/{filename}/archive")
def archive_knowledge_base_document(
    filename: str,
    raw_req: Request = None,
    current_user: dict = Depends(require_admin),
):
    """Toggle Archive / Active status on a Knowledge Base document."""
    clean_name = os.path.basename(filename)
    doc_record = get_document_record(clean_name)
    if not doc_record:
        raise HTTPException(status_code=404, detail="Document not found in Knowledge Base.")

    current_status = doc_record.get("status", "Indexed")
    next_status = "Archived" if current_status != "Archived" else "Indexed"
    update_document_status(clean_name, next_status)

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="kb_archive_document" if next_status == "Archived" else "kb_unarchive_document",
        resource_type="knowledge_base",
        resource_name=clean_name,
        details={"status": next_status},
        ip_address=get_client_ip(raw_req) if raw_req else None,
    )

    return {"filename": clean_name, "status": next_status}


@app.delete("/knowledge-base/{filename}")
def delete_knowledge_base_document(
    filename: str,
    raw_req: Request = None,
    current_user: dict = Depends(require_admin),
):
    """Permanently delete a document from the Company Knowledge Base."""
    clean_name = os.path.basename(filename)
    target_path = KB_DIRECTORY / clean_name
    if not target_path.is_file():
        target_path = DOCUMENT_DIRECTORY / clean_name

    vector_store.delete_by_source(str(target_path))
    doc_ids = vector_store.get_document_ids_by_source(str(target_path))
    for did in doc_ids:
        vector_store.delete_by_document_id(did)

    if target_path.is_file():
        try:
            target_path.unlink()
        except Exception:
            pass

    delete_document_record(clean_name)

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="kb_delete_document",
        resource_type="knowledge_base",
        resource_name=clean_name,
        ip_address=get_client_ip(raw_req) if raw_req else None,
    )

    return {"status": "deleted", "filename": clean_name}


@app.post("/knowledge-base/bulk-delete")
def bulk_delete_knowledge_base_documents(
    request: BulkDeleteRequest,
    raw_req: Request = None,
    current_user: dict = Depends(require_admin),
):
    """Bulk delete selected documents from the Company Knowledge Base."""
    deleted_count = 0
    for filename in request.filenames:
        clean_name = os.path.basename(filename)
        target_path = KB_DIRECTORY / clean_name
        if not target_path.is_file():
            target_path = DOCUMENT_DIRECTORY / clean_name

        vector_store.delete_by_source(str(target_path))
        doc_ids = vector_store.get_document_ids_by_source(str(target_path))
        for did in doc_ids:
            vector_store.delete_by_document_id(did)

        if target_path.is_file():
            try:
                target_path.unlink()
            except Exception:
                pass

        delete_document_record(clean_name)
        deleted_count += 1

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="kb_bulk_delete_documents",
        resource_type="knowledge_base",
        resource_name=f"Count: {deleted_count}",
        details={"filenames": request.filenames},
        ip_address=get_client_ip(raw_req) if raw_req else None,
    )
    return {"status": "success", "deleted_count": deleted_count}


@app.delete("/knowledge-base")
def clear_all_knowledge_base_documents(
    raw_req: Request = None,
    current_user: dict = Depends(require_admin),
):
    """Clear all documents from the permanent Company Knowledge Base."""
    docs = list_knowledge_base_documents(limit=1000)
    deleted_count = 0
    for doc in docs:
        clean_name = doc["filename"]
        target_path = KB_DIRECTORY / clean_name
        if not target_path.is_file():
            target_path = DOCUMENT_DIRECTORY / clean_name

        vector_store.delete_by_source(str(target_path))
        doc_ids = vector_store.get_document_ids_by_source(str(target_path))
        for did in doc_ids:
            vector_store.delete_by_document_id(did)

        if target_path.is_file():
            try:
                target_path.unlink()
            except Exception:
                pass
        delete_document_record(clean_name)
        deleted_count += 1

    if KB_DIRECTORY.exists():
        for p in KB_DIRECTORY.glob("*.*"):
            if p.is_file():
                try:
                    p.unlink()
                except Exception:
                    pass

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="kb_clear_all",
        resource_type="knowledge_base",
        resource_name=f"Count: {deleted_count}",
        ip_address=get_client_ip(raw_req) if raw_req else None,
    )
    return {"status": "cleared", "deleted_count": deleted_count}


# =========================================================
# 2. TEMPORARY CHAT DOCUMENT UPLOAD (ALL USERS)
# =========================================================

@app.post("/chat/upload")
async def upload_chat_document(
    file: UploadFile = File(...),
    conversation_id: Optional[int] = Form(None),
    project_id: Optional[str] = Form(None),
    raw_req: Request = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Temporary chat document upload (Administrator Only):
    - Scoped strictly to the specified conversation_id
    - Stored in temporary session folder: data/documents/temp_chats/{conversation_id}/
    - Indexed in temporary vector store: chat_temporary_documents
    - Cleaned up automatically when conversation is deleted or session ends
    - Never promoted to company knowledge base
    """
    if current_user.get("role") != "Administrator":
        raise HTTPException(
            status_code=403,
            detail="Document upload is restricted to Administrators only.",
        )
    filename = os.path.basename(file.filename or "")
    if not filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Supported file types are: PDF, PNG, JPG, JPEG")

    created_new = False
    if conversation_id is None:
        conv = create_conversation(
            f"Chat with {filename[:40]}",
            user_id=current_user["id"],
            project_id=project_id,
        )
        conversation_id = conv["id"]
        created_new = True
    else:
        conv = get_conversation(conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        if (
            conv.get("user_id") is not None
            and conv.get("user_id") != current_user["id"]
            and current_user.get("role") != "Administrator"
        ):
            raise HTTPException(status_code=403, detail="Access denied to this conversation.")

    session_dir = TEMP_CHATS_DIRECTORY / str(conversation_id)
    session_dir.mkdir(parents=True, exist_ok=True)

    file_path = session_dir / filename
    if file_path.exists():
        stem = file_path.stem
        filename = f"{stem}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = session_dir / filename

    try:
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                buffer.write(chunk)
    finally:
        await file.close()

    result = process_and_index_document(
        file_path=file_path,
        original_filename=file.filename or filename,
        is_temporary=True,
        conversation_id=conversation_id,
        current_user=current_user,
        raw_req=raw_req,
    )
    result["created_new"] = created_new

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="chat_temp_upload",
        resource_type="document",
        resource_id=result["document_id"],
        resource_name=filename,
        details={"conversation_id": conversation_id, "chunks": result["chunks"]},
        ip_address=get_client_ip(raw_req) if raw_req else None,
    )

    return result


@app.post("/admin/cleanup-temp-documents")
def cleanup_temp_documents_endpoint(
    max_age_hours: int = Query(24, ge=1, le=720),
    raw_req: Request = None,
    current_user: dict = Depends(require_admin),
):
    """
    Administrator endpoint to clean up abandoned temporary chat sessions & files.
    """
    abandoned = cleanup_abandoned_temp_records(max_age_hours=max_age_hours)
    purged_count = 0
    for item in abandoned:
        cid = item.get("conversation_id")
        fname = item.get("filename")
        if cid:
            vector_store.delete_by_conversation_id(cid)
            conv_dir = TEMP_CHATS_DIRECTORY / str(cid)
            if conv_dir.exists():
                shutil.rmtree(conv_dir, ignore_errors=True)
            purged_count += 1
        elif fname:
            vector_store.delete_by_source(fname)
            purged_count += 1

    return {"status": "success", "purged_sessions": purged_count}


# =========================================================
# BACKWARD COMPATIBLE UPLOAD ENDPOINT
# =========================================================

@app.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    raw_req: Request = None,
    current_user: dict = Depends(require_admin),
):
    """
    Dedicated Document upload endpoint (Administrator Only).
    Permanently indexes into the Company Knowledge Base.
    """
    return await upload_knowledge_base_document(file=file, raw_req=raw_req, current_user=current_user)


# =========================================================
# LIST ALL PERMITTED DOCUMENTS (WITH DATA ISOLATION)
# =========================================================

@app.get("/documents")
def list_documents(
    current_user: dict = Depends(get_current_user),
):
    is_admin = current_user.get("role") == "Administrator"
    docs = list_documents_for_user(current_user["id"], is_admin=is_admin)

    return {
        "count": len(docs),
        "documents": docs
    }


# =========================================================
# GET INFORMATION ABOUT ONE DOCUMENT (PERMISSION ENFORCED)
# =========================================================

@app.get("/documents/{filename}")
def document_info(
    filename: str,
    current_user: dict = Depends(get_current_user),
):
    filename = os.path.basename(filename)

    # Security check: User must own the document, have it shared, or be an Administrator!
    if not can_user_access_document(filename, current_user):
        raise HTTPException(
            status_code=403,
            detail="Access denied. You do not have permission to view this document.",
        )

    file_path = (
        DOCUMENT_DIRECTORY
        / filename
    )

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Document not found on disk."
        )

    extension = file_path.suffix.lower()
    chunk_count = vector_store.count_by_source(str(file_path))
    doc_record = get_document_record(filename)

    return {
        "document_id": doc_record.get("id") if doc_record else None,
        "filename": filename,
        "original_filename": doc_record.get("original_filename") if doc_record else filename,
        "type": extension,
        "size_bytes": file_path.stat().st_size,
        "chunks": chunk_count,
        "is_shared": doc_record.get("is_shared", False) if doc_record else False,
        "owner_id": doc_record.get("user_id") if doc_record else None,
        "owner_name": doc_record.get("owner_display_name") if doc_record else "System",
        "is_owner": (doc_record and doc_record.get("user_id") == current_user["id"]),
    }



# =========================================================
# DOWNLOAD FILE / GENERATED DOCUMENT
# =========================================================

@app.get("/documents/download/{filename:path}")
def download_document(
    filename: str,
    raw_req: Request,
    token: Optional[str] = Query(None),
    auth_header: Optional[str] = Header(None, alias="Authorization"),
):
    """
    Direct download endpoint for generated documents (.docx, .pdf, etc.) and
    workspace uploaded documents with token verification and traversal protection.
    """
    jwt_token = token
    if not jwt_token and auth_header and auth_header.startswith("Bearer "):
        jwt_token = auth_header.split(" ", 1)[1]

    if not jwt_token:
        raise HTTPException(
            status_code=401,
            detail="Authentication token required to download documents.",
        )

    payload = decode_access_token(jwt_token)
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token.",
        )

    user = {
        "id": payload.get("sub"),
        "role": payload.get("role", "Member"),
        "username": payload.get("username", ""),
    }

    # Sanitize filename - strip path traversal
    clean_filename = os.path.basename(filename.replace("\\", "/"))
    if not clean_filename or clean_filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    # 1. Check permanent Knowledge Base directory
    target_path = KB_DIRECTORY / clean_filename
    if not target_path.is_file():
        # 2. Check generated documents
        target_path = GENERATED_DIRECTORY / clean_filename
    if not target_path.is_file():
        # 3. Check temporary chat folders
        found_temps = list(TEMP_CHATS_DIRECTORY.glob(f"*/{clean_filename}"))
        if found_temps:
            target_path = found_temps[0]
        else:
            # 4. Check root document directory
            target_path = DOCUMENT_DIRECTORY / clean_filename

    if not target_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"File '{clean_filename}' not found on server disk.",
        )

    # Permission check for workspace document directory
    if target_path.parent == DOCUMENT_DIRECTORY:
        if not can_user_access_document(clean_filename, user):
            raise HTTPException(
                status_code=403,
                detail="Access denied. You do not have permission to download this document.",
            )

    ext = target_path.suffix.lower()
    media_types = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".csv": "text/csv",
        ".txt": "text/plain",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(target_path),
        media_type=media_type,
        filename=clean_filename,
        headers={
            "Content-Disposition": f'attachment; filename="{clean_filename}"'
        }
    )


# =========================================================
# SHARE / UNSHARE DOCUMENT
# =========================================================

@app.patch("/documents/{filename}/share")
def share_document(
    filename: str,
    request: DocumentShareRequest,
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    filename = os.path.basename(filename)
    doc_record = get_document_record(filename)

    if not doc_record:
        raise HTTPException(
            status_code=404,
            detail="Document record not found in system database."
        )

    is_admin = current_user.get("role") == "Administrator"
    is_owner = (doc_record.get("user_id") == current_user["id"])

    if not (is_admin or is_owner):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Only the owner or an Administrator can modify document sharing permissions."
        )

    updated = update_document_sharing(
        filename=filename,
        is_shared=request.is_shared,
        shared_with_user_ids=request.shared_with_user_ids,
    )

    if not updated:
        raise HTTPException(
            status_code=400,
            detail="Could not update document sharing permissions."
        )

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="share_document" if request.is_shared else "unshare_document",
        resource_type="document",
        resource_name=filename,
        details={"is_shared": request.is_shared, "shared_with": request.shared_with_user_ids},
        ip_address=get_client_ip(raw_req),
    )

    return get_document_record(filename)


# =========================================================
# DELETE ALL DOCUMENTS
# =========================================================

@app.delete("/documents")
def clear_all_documents(
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Remove all documents. Administrators can remove all documents across the workspace.
    Members remove all documents owned by themselves.
    """
    is_admin = current_user.get("role") == "Administrator"
    docs = list_documents_for_user(current_user["id"], is_admin=is_admin)
    deleted_count = 0
    for doc in docs:
        fname = doc["filename"]
        doc_path = DOCUMENT_DIRECTORY / fname
        if doc_path.is_file():
            doc_path_str = str(doc_path)
            doc_ids = vector_store.get_document_ids_by_source(doc_path_str)
            if doc_ids:
                for did in doc_ids:
                    vector_store.delete_by_document_id(did)
            else:
                vector_store.delete_by_source(doc_path_str)
            try:
                doc_path.unlink()
            except Exception:
                pass
        delete_document_record(fname)
        deleted_count += 1

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="delete_all_documents",
        resource_type="document",
        resource_name=f"Count: {deleted_count}",
        ip_address=get_client_ip(raw_req),
    )
    return {"status": "cleared", "deleted_count": deleted_count}


# =========================================================
# DELETE DOCUMENT (PERMISSION ENFORCED)
# =========================================================

@app.post("/documents/bulk-delete")
def bulk_delete_documents(
    request: BulkDeleteRequest,
    raw_req: Request = None,
    current_user: dict = Depends(get_current_user),
):
    """Bulk delete selected user/workspace documents."""
    is_admin = current_user.get("role") == "Administrator"
    deleted_count = 0
    for filename in request.filenames:
        clean_name = os.path.basename(filename)
        doc_record = get_document_record(clean_name)
        if doc_record and not (is_admin or doc_record.get("user_id") == current_user["id"]):
            continue

        target_path = DOCUMENT_DIRECTORY / clean_name
        if not target_path.is_file():
            target_path = KB_DIRECTORY / clean_name

        vector_store.delete_by_source(str(target_path))
        doc_ids = vector_store.get_document_ids_by_source(str(target_path))
        for did in doc_ids:
            vector_store.delete_by_document_id(did)

        if target_path.is_file():
            try:
                target_path.unlink()
            except Exception:
                pass

        delete_document_record(clean_name)
        deleted_count += 1

    return {"status": "success", "deleted_count": deleted_count}


@app.delete("/documents/{filename}")
def delete_document(
    filename: str,
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    filename = os.path.basename(filename)
    doc_record = get_document_record(filename)

    is_admin = current_user.get("role") == "Administrator"
    is_owner = (doc_record and doc_record.get("user_id") == current_user["id"])

    if doc_record and not (is_admin or is_owner):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Only the owner or an Administrator can delete this document."
        )

    file_path = (
        DOCUMENT_DIRECTORY
        / filename
    )

    deleted_chunks = 0
    if file_path.is_file():
        file_path_string = str(file_path)
        document_ids = vector_store.get_document_ids_by_source(file_path_string)

        if document_ids:
            for document_id in document_ids:
                deleted_chunks += vector_store.delete_by_document_id(document_id)
        else:
            deleted_chunks = vector_store.delete_by_source(file_path_string)

        try:
            file_path.unlink()
        except Exception:
            pass

    delete_document_record(filename)

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="delete_document",
        resource_type="document",
        resource_name=filename,
        ip_address=get_client_ip(raw_req),
    )

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
# CHAT + PERSISTENT HISTORY + MCP AGENT (AUTHENTICATED)
# =========================================================

@app.post("/chat")
async def chat(
    request: ChatRequest,
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    message = request.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty.",
        )

    conversation_id = request.conversation_id

    try:
        # Start a new conversation when the caller has not supplied an ID
        if conversation_id is None:
            conversation = create_conversation(
                message[:60],
                user_id=current_user["id"],
                project_id=request.project_id,
            )
            conversation_id = conversation["id"]
            created_new = True
        else:
            conversation = get_conversation(conversation_id)
            if conversation is None:
                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found.",
                )

            # Enforce data isolation: Member cannot send messages to another user's conversation!
            if (
                conversation.get("user_id") is not None
                and conversation.get("user_id") != current_user["id"]
                and current_user.get("role") != "Administrator"
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Access denied. You do not have permission to post in this conversation.",
                )
            created_new = False

        # Persist the user message before invoking the model
        add_message(conversation_id, "user", message)

        # Load the saved conversation so Qwen can use earlier turns
        saved_conversation = get_conversation(conversation_id)
        if saved_conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        history = saved_conversation.get("messages", [])

        # Resolve temperature: request parameter > workspace settings > default 0.70
        temp = request.temperature
        if temp is None:
            try:
                ws = get_workspace_settings()
                temp = float(ws.get("default_temperature", 0.70))
            except Exception:
                temp = 0.70
        else:
            temp = max(0.0, min(2.0, float(temp)))

        # Pass persisted history and temperature to Qwen
        answer = await ask_qwen_with_tools(message, history=history, temperature=temp)
        if not isinstance(answer, str):
            answer = str(answer)

        # Persist the assistant response
        add_message(conversation_id, "assistant", answer)

        # Log audit event
        log_audit_event(
            user_id=current_user["id"],
            username=current_user["username"],
            display_name=current_user["display_name"],
            role=current_user["role"],
            action="send_message",
            resource_type="conversation",
            resource_id=str(conversation_id),
            resource_name=conversation.get("title", ""),
            details={"message_len": len(message), "created_new": created_new, "temperature": temp},
            ip_address=get_client_ip(raw_req),
        )

        return {
            "conversation_id": conversation_id,
            "created_new": created_new,
            "answer": answer,
            "temperature": temp,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "MCP agent or chat-history operation failed for conversation %s",
            conversation_id,
        )
        raise HTTPException(
            status_code=500,
            detail="The AI agent could not process your request.",
        )


class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    avatar_color: Optional[str] = None


@app.patch("/users/{user_id}")
def update_user_profile(
    user_id: int,
    request: UserUpdateRequest,
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    if user_id != current_user["id"] and current_user.get("role") != "Administrator":
        raise HTTPException(
            status_code=403,
            detail="Access denied. You cannot modify another user's profile.",
        )

    updated = update_user(
        user_id,
        display_name=request.display_name,
        avatar_color=request.avatar_color,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found.")

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="update_profile",
        resource_type="user",
        resource_id=str(user_id),
        details={"display_name": request.display_name},
        ip_address=get_client_ip(raw_req),
    )

    return get_user(user_id)


@app.delete("/users/{user_id}")
def delete_own_profile(
    user_id: int,
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    if user_id != current_user["id"] and current_user.get("role") != "Administrator":
        raise HTTPException(
            status_code=403,
            detail="Access denied. You cannot delete another user's account.",
        )

    if current_user.get("role") == "Administrator" and user_id == current_user["id"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own Administrator account.",
        )

    deleted = delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found.")

    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="delete_account",
        resource_type="user",
        resource_id=str(user_id),
        ip_address=get_client_ip(raw_req),
    )

    return {"status": "deleted", "user_id": user_id}


# =========================================================
# WORKSPACE / ORGANIZATION INFO
# =========================================================

@app.get("/workspace")
def workspace_info():
    """Public organization & workspace info accessible to all authenticated users."""
    s = get_workspace_settings()
    return {
        "org_name": s["org_name"],
        "workspace_domain": s["workspace_domain"],
        "allow_member_upload": s["allow_member_upload"],
        "max_upload_size_mb": s["max_upload_size_mb"],
    }


# =========================================================
# ADMINISTRATOR CONSOLE ENDPOINTS (STRICT ADMIN AUTHORIZATION)
# =========================================================

@app.get("/admin/dashboard")
def admin_dashboard(
    current_admin: dict = Depends(require_admin),
):
    users = list_users()
    total_users = len(users)
    active_users = sum(1 for u in users if u.get("is_active"))
    disabled_users = total_users - active_users

    stats = get_audit_stats()
    sys_health = system_status()

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM conversations")
            total_convs = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM messages")
            total_msgs = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM documents")
            total_docs = cur.fetchone()[0]

    return {
        "metrics": {
            "total_users": total_users,
            "active_users": active_users,
            "disabled_users": disabled_users,
            "total_conversations": total_convs,
            "total_messages": total_msgs,
            "total_documents": total_docs,
            "events_24h": stats.get("events_24h", 0),
            "logins_24h": stats.get("logins_24h", 0),
        },
        "recent_activities": stats.get("recent_activities", []),
        "system_status": sys_health,
    }


@app.get("/admin/users")
def admin_list_users(
    current_admin: dict = Depends(require_admin),
):
    return {"users": list_users_with_stats()}


@app.post("/admin/users")
def admin_create_user(
    request: AdminUserCreateRequest,
    raw_req: Request,
    current_admin: dict = Depends(require_admin),
):
    try:
        new_usr = create_user(
            username=request.username,
            display_name=request.display_name or request.username,
            password=request.password,
            avatar_color=request.avatar_color,
            role=request.role,
            email=request.email,
        )
        log_audit_event(
            user_id=current_admin["id"],
            username=current_admin["username"],
            display_name=current_admin["display_name"],
            role=current_admin["role"],
            action="create_user",
            resource_type="user",
            resource_id=str(new_usr["id"]),
            resource_name=new_usr["username"],
            details={"role": new_usr["role"], "display_name": new_usr["display_name"]},
            ip_address=get_client_ip(raw_req),
        )
        return new_usr
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Username already exists.")
        logger.exception("Could not create user")
        raise HTTPException(status_code=500, detail="Could not create user.")


@app.get("/admin/users/{user_id}/detail")
def admin_user_detail(
    user_id: int,
    current_admin: dict = Depends(require_admin),
):
    usr = get_user(user_id)
    if not usr:
        raise HTTPException(status_code=404, detail="User not found.")

    convs = list_conversations(limit=50, user_id=user_id)
    docs = get_user_documents(user_id)
    activity = get_user_audit_logs(user_id, limit=50)

    return {
        "user": usr,
        "conversations": convs,
        "documents": docs,
        "activity": activity,
    }


@app.get("/admin/users/{user_id}/conversations/{conv_id}")
def admin_inspect_conversation(
    user_id: int,
    conv_id: int,
    current_admin: dict = Depends(require_admin),
):
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conv


@app.patch("/admin/users/{user_id}/role")
def admin_update_role(
    user_id: int,
    request: AdminRoleUpdateRequest,
    raw_req: Request,
    current_admin: dict = Depends(require_admin),
):
    if user_id == current_admin["id"] and request.role != "Administrator":
        raise HTTPException(status_code=400, detail="Cannot demote your own Administrator account.")

    target_usr = get_user(user_id)
    if not target_usr:
        raise HTTPException(status_code=404, detail="User not found.")

    set_user_role(user_id, request.role)

    log_audit_event(
        user_id=current_admin["id"],
        username=current_admin["username"],
        display_name=current_admin["display_name"],
        role=current_admin["role"],
        action="update_user_role",
        resource_type="user",
        resource_id=str(user_id),
        resource_name=target_usr["username"],
        details={"old_role": target_usr["role"], "new_role": request.role},
        ip_address=get_client_ip(raw_req),
    )
    return get_user(user_id)


@app.patch("/admin/users/{user_id}/status")
def admin_update_status(
    user_id: int,
    request: AdminStatusUpdateRequest,
    raw_req: Request,
    current_admin: dict = Depends(require_admin),
):
    if user_id == current_admin["id"] and not request.is_active:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own Administrator account.")

    target_usr = get_user(user_id)
    if not target_usr:
        raise HTTPException(status_code=404, detail="User not found.")

    set_user_active(user_id, request.is_active)
    action_name = "activate_user" if request.is_active else "deactivate_user"

    log_audit_event(
        user_id=current_admin["id"],
        username=current_admin["username"],
        display_name=current_admin["display_name"],
        role=current_admin["role"],
        action=action_name,
        resource_type="user",
        resource_id=str(user_id),
        resource_name=target_usr["username"],
        details={"is_active": request.is_active},
        ip_address=get_client_ip(raw_req),
    )
    return get_user(user_id)


@app.patch("/admin/users/{user_id}/password")
def admin_reset_password(
    user_id: int,
    request: AdminPasswordResetRequest,
    raw_req: Request,
    current_admin: dict = Depends(require_admin),
):
    target_usr = get_user(user_id)
    if not target_usr:
        raise HTTPException(status_code=404, detail="User not found.")

    change_user_password(user_id, request.password)

    log_audit_event(
        user_id=current_admin["id"],
        username=current_admin["username"],
        display_name=current_admin["display_name"],
        role=current_admin["role"],
        action="reset_password",
        resource_type="user",
        resource_id=str(user_id),
        resource_name=target_usr["username"],
        ip_address=get_client_ip(raw_req),
    )
    return {"status": "password_reset", "user_id": user_id}


@app.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    raw_req: Request,
    current_admin: dict = Depends(require_admin),
):
    if user_id == current_admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own Administrator account.")

    target_usr = get_user(user_id)
    if not target_usr:
        raise HTTPException(status_code=404, detail="User not found.")

    deleted = delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found.")

    log_audit_event(
        user_id=current_admin["id"],
        username=current_admin["username"],
        display_name=current_admin["display_name"],
        role=current_admin["role"],
        action="delete_user",
        resource_type="user",
        resource_id=str(user_id),
        resource_name=target_usr["username"],
        ip_address=get_client_ip(raw_req),
    )
    return {"status": "deleted", "user_id": user_id}


@app.get("/admin/audit-logs")
def admin_get_audit_logs(
    limit: int = 50,
    offset: int = 0,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    search: Optional[str] = None,
    current_admin: dict = Depends(require_admin),
):
    return list_audit_logs(
        limit=limit,
        offset=offset,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        search=search,
    )


@app.get("/admin/settings")
def admin_get_settings(
    current_admin: dict = Depends(require_admin),
):
    return get_workspace_settings()


@app.patch("/admin/settings")
def admin_patch_settings(
    request: WorkspaceSettingsUpdateRequest,
    raw_req: Request,
    current_admin: dict = Depends(require_admin),
):
    updated = update_workspace_settings(
        org_name=request.org_name,
        workspace_domain=request.workspace_domain,
        allow_member_upload=request.allow_member_upload,
        max_upload_size_mb=request.max_upload_size_mb,
        enforce_data_isolation=request.enforce_data_isolation,
        default_temperature=request.default_temperature,
    )

    log_audit_event(
        user_id=current_admin["id"],
        username=current_admin["username"],
        display_name=current_admin["display_name"],
        role=current_admin["role"],
        action="update_settings",
        resource_type="settings",
        details={
            "org_name": request.org_name,
            "allow_member_upload": request.allow_member_upload,
            "default_temperature": request.default_temperature,
        },
        ip_address=get_client_ip(raw_req),
    )
    return updated


# =========================================================
# MODEL & GENERATION PARAMETER ENDPOINTS
# =========================================================

@app.get("/settings/model")
def get_model_settings(current_user: Optional[dict] = Depends(get_optional_user)):
    """Retrieve active LLM model specifications and default inference temperature."""
    try:
        ws = get_workspace_settings()
        default_temp = float(ws.get("default_temperature", 0.70))
    except Exception:
        default_temp = 0.70

    return {
        "model_name": "qwen3.5:4B",
        "provider": "Ollama (Local / Offline)",
        "default_temperature": default_temp,
        "temperature_range": {"min": 0.0, "max": 1.5, "step": 0.05},
        "presets": {
            "precise": 0.20,
            "balanced": 0.70,
            "creative": 1.00,
        },
    }


@app.patch("/settings/model")
def patch_model_settings(
    request: ModelSettingsUpdateRequest,
    raw_req: Request,
    current_user: dict = Depends(get_current_user),
):
    """Update system/workspace generation temperature."""
    temp = max(0.0, min(2.0, float(request.default_temperature)))
    updated = update_workspace_settings(default_temperature=temp)
    log_audit_event(
        user_id=current_user["id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        action="update_model_settings",
        resource_type="settings",
        details={"temperature": temp},
        ip_address=get_client_ip(raw_req),
    )
    return {
        "status": "success",
        "model_name": "qwen3.5:4B",
        "default_temperature": updated.get("default_temperature", temp),
    }


# =========================================================
# SYSTEM STATUS
# =========================================================

@app.get("/system/status")
def system_status():
    from app.db.database import get_pool as _get_pool

    status_data = {
        "backend": "running",
        "database": "error",
        "llm": "error",
        "rag": "error",
        "ocr": "ready",
        "storage": "ready",
    }

    # Check database
    try:
        pool = _get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        status_data["database"] = "connected"
    except Exception:
        pass

    # Check LLM (Ollama)
    try:
        from ollama import Client as _OllamaClient
        _client = _OllamaClient(host="http://127.0.0.1:11434")
        _client.list()
        status_data["llm"] = "connected"
    except Exception:
        pass

    # Check RAG (ChromaDB vector store)
    try:
        count = vector_store.collection.count()
        status_data["rag"] = "ready"
    except Exception:
        pass

    return status_data


# =========================================================
# SERVE FRONTEND STATIC FILES (must be last)
# =========================================================

FRONTEND_DIR = BASE_DIR / "frontend" / "dist"
if FRONTEND_DIR.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIR), html=True),
        name="frontend",
    )
