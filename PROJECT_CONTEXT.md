# PROJECT_CONTEXT.md — Sovereign AI Workbench

## Tech Stack

### Backend
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | FastAPI | 0.141.1 |
| Server | Uvicorn | 0.53.0 |
| Database | PostgreSQL | via psycopg_pool |
| LLM | Qwen 3.5:4B via Ollama | ollama 0.6.2 |
| Embeddings | all-MiniLM-L6-v2 | sentence-transformers 6.1.0 |
| Vector Store | ChromaDB | 1.5.9 |
| OCR | PaddleOCR + PaddleX | 3.7.0 / 3.7.2 |
| PDF Processing | PyMuPDF (fitz) | 1.28.2 |
| DOCX Processing | python-docx | 1.2.0 |
| PDF Generation | ReportLab | installed |
| MCP | mcp (SDK) | installed |
| Text Splitting | langchain-text-splitters | 1.1.2 |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | React 19 (Vite) |
| Router | react-router-dom |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Icons | lucide-react |
| Build tool | Vite |
| Dev port | 3000 |

### Infrastructure
| Service | Details |
|---------|---------|
| Database | PostgreSQL on localhost:5433, database: `sovereign_workbench` |
| LLM | Ollama on localhost:11434, model: `qwen3.5:4B` |
| OCR Sandbox | Docker image `sovereign-doc-worker:dev` (network-isolated) |
| Vector Store | ChromaDB persistent at `data/vector_store/` |
| Documents | Stored at `data/documents/` |
| Generated Docs | `data/documents/generated/` |

## Environment Variables (`.env`)
```
DATABASE_URL=postgresql://workbench_user:123456@localhost:5433/sovereign_workbench
```

## Virtual Environment
```
Path: .venv (project root)
Python: 3.13
DO NOT create a new one. DO NOT reinstall packages.
```

## Database Schema (PostgreSQL)

### `users` table (added during UI implementation)
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_color VARCHAR(7) DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `conversations` table
```sql
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL DEFAULT 'New conversation',
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `messages` table
```sql
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Vector Store (ChromaDB)
- Collection: `pdf_documents`
- Persisted at: `data/vector_store/`
- Metadata per chunk: `document_id`, `source`, `page`, `chunk_index`, `content_length`

## How to Run

### Prerequisites
1. PostgreSQL running on port 5433 with database `sovereign_workbench`
2. Ollama running on port 11434 with model `qwen3.5:4B` pulled
3. Docker Desktop running (for OCR sandbox)

### Backend
```bash
cd c:\Users\Lenovo\Desktop\Project
.venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (development)
```bash
cd c:\Users\Lenovo\Desktop\Project\frontend
npm run dev
```
Opens at http://localhost:3000, proxies API calls to backend.

### Frontend (production build)
```bash
cd c:\Users\Lenovo\Desktop\Project\frontend
npm run build
```
Output goes to `frontend/dist/`, auto-served by FastAPI at `/`.

