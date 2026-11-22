# ARCHITECTURE.md — Sovereign AI Workbench

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React/Vite)                    │
│                                                              │
│  LoginPage → Sidebar → TopBar → ChatPage / DocumentsPage   │
│  HistoryPage / WorkspacePage / SettingsPage / ProfilePage   │
│                                                              │
│  src/services/api.js ──── unified API client                │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP (localhost:3000 proxies to :8000)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI @ :8000)                   │
│                                                              │
│  app/main.py ─── entry point, all API routes                │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Chat/LLM │  │   RAG    │  │   OCR    │  │   MCP       │ │
│  │ app/llm/ │  │ app/rag/ │  │ Docker   │  │ app/mcp/    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       │              │              │               │        │
│       ▼              ▼              ▼               ▼        │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Ollama  │  │ ChromaDB │  │  Docker  │  │ MCP Server  │  │
│  │ :11434  │  │ (local)  │  │ sandbox  │  │ (stdio)     │  │
│  └─────────┘  └──────────┘  └──────────┘  └─────────────┘  │
│                                                              │
│  app/db/ ──── PostgreSQL (psycopg_pool, :5433)              │
└─────────────────────────────────────────────────────────────┘
```

## Module Map

### Backend (`app/`)

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app, all REST endpoints, document upload pipeline, chat orchestration |
| `app/db/database.py` | PostgreSQL connection pool (psycopg_pool), `init_db()` with DDL for all tables |
| `app/db/chat_history.py` | CRUD for conversations & messages (supports `user_id` filtering) |
| `app/db/users.py` | CRUD for user profiles (NEW — added during UI implementation) |
| `app/db/__init__.py` | Empty |
| `app/llm/qwen.py` | Main LLM module: `ask_qwen_with_tools()`, MCP tool orchestration, document search triggers, full-read/summary handlers, conversation history management |
| `app/llm/qwen2.py` | Simple LLM wrapper: `ask_qwen()` — single message, no tools |
| `app/rag/loader.py` | `DocumentLoader` — PDF loading (normal + OCR fallback), image OCR, PaddleOCR engine |
| `app/rag/chunker.py` | `DocumentChunker` — RecursiveCharacterTextSplitter (500 chars, 50 overlap) |
| `app/rag/embeddings.py` | `EmbeddingManager` — all-MiniLM-L6-v2 via sentence-transformers |
| `app/rag/vector_store.py` | `VectorStoreManager` — ChromaDB persistent client, CRUD for document chunks |
| `app/rag/retriever.py` | `RAGRetriever` — query → embedding → vector search → ranked results with metadata |
| `app/mcp/mcp_server.py` | MCP server exposing tools: `list_documents`, `read_document`, `search_documents`, `create_word_document`, `create_pdf_document` |
| `app/mcp/mcp_client.py` | `WorkbenchMCPClient` — stdio-based MCP client that auto-starts the server |

### Frontend (`frontend/src/`)

| File | Purpose |
|------|---------|
| `main.jsx` | React entry point, wraps app in UserProvider + ToastProvider |
| `App.jsx` | Main layout: login gate → sidebar + topbar + page router |
| `index.css` | Complete design system: dark theme, all component styles |
| `services/api.js` | Centralized API client — all backend calls go through here |
| `context/UserContext.jsx` | User state management, login/logout, localStorage persistence |
| `context/ToastContext.jsx` | Toast notification system |
| `components/Sidebar.jsx` | Collapsible sidebar: nav, conversation list, new chat, rename/delete |
| `components/TopBar.jsx` | Top bar: sidebar toggle, page title, LOCAL badge, profile dropdown |
| `pages/LoginPage.jsx` | Profile selection/creation screen |

### Other

| Path | Purpose |
|------|---------|
| `.env` | `DATABASE_URL` for PostgreSQL |
| `requirements.txt` | Python dependencies (DO NOT blindly reinstall) |
| `data/documents/` | Uploaded document storage |
| `data/documents/generated/` | AI-generated DOCX/PDF output |
| `data/vector_store/` | ChromaDB persistence directory |
| `sandbox/` | Docker OCR worker (Dockerfile, worker.py) |

## API Endpoints

### Health
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Root health check |
| GET | `/health` | Health check |
| GET | `/system/status` | Detailed system status (db, llm, rag, ocr, storage) |

### Users (NEW)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/users` | Create user profile |
| GET | `/users` | List all users |
| GET | `/users/{id}` | Get user by ID |
| PATCH | `/users/{id}` | Update user (display_name, avatar_color) |
| DELETE | `/users/{id}` | Delete user |

### Conversations
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/conversations` | Create conversation |
| GET | `/conversations?user_id=&limit=&offset=` | List conversations (filterable by user) |
| GET | `/conversations/{id}` | Get conversation with all messages |
| PATCH | `/conversations/{id}` | Rename conversation |
| DELETE | `/conversations/{id}` | Delete conversation (cascades messages) |

### Chat
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/chat` | Send message: `{message, conversation_id?, user_id?}` → `{conversation_id, created_new, answer}` |

### Documents
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/documents/upload` | Upload file (multipart) → OCR → chunk → embed → index |
| GET | `/documents` | List all documents with chunk counts |
| GET | `/documents/{filename}` | Document info |
| DELETE | `/documents/{filename}` | Delete document + vectors |
| POST | `/documents/create` | Create DOCX from provided content |
| POST | `/documents/generate` | AI-generated DOCX via Qwen |

## Data Flow

### Chat Flow
```
User types message → POST /chat → persist user msg → load history → ask_qwen_with_tools()
  → (optional) detect document triggers → MCP search_documents → inject context
  → Ollama qwen3.5:4B → response → persist assistant msg → return to frontend
```

### Document Upload Flow
```
User uploads file → POST /documents/upload → validate → save to data/documents/
  → copy to sandbox filename → Docker OCR (PaddleX, network-isolated)
  → extract pages/text → convert to LangChain Documents
  → chunk (500 char, 50 overlap) → embed (all-MiniLM-L6-v2)
  → store in ChromaDB → return {status: "indexed", chunks, pages}
```

### RAG Retrieval Flow
```
User asks about documents → trigger detected → RAGRetriever.retrieve(query)
  → embed query → ChromaDB vector search (top 5) → ranked results with metadata
  → inject as system context → Qwen generates answer → sources available in metadata
```

