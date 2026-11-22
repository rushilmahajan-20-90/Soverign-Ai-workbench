# AGENTS.md — Sovereign AI Workbench

## Purpose
This file provides orientation for any AI agent (Antigravity, Claude, Cursor, etc.) that opens this project. Read this first, then the other context files.

## Project Overview
**Sovereign Agentic AI Workbench** — A private, local-first AI workspace application. Users chat with a local LLM (Qwen via Ollama), upload and analyze documents/images via OCR + RAG, and manage persistent conversations. The entire system runs without internet access.

## Key Principles
- **DO NOT** rebuild the backend. Extend only.
- **DO NOT** create a new Python virtual environment. Use `.venv` at project root.
- **DO NOT** reinstall packages that are already installed.
- **DO NOT** add cloud AI APIs (OpenAI, Gemini, Claude, etc.).
- **DO NOT** add CDN-hosted fonts, JS, CSS, or external analytics.
- **DO NOT** replace PostgreSQL with another database.
- **DO NOT** change the Qwen model integration.
- All frontend assets must be locally available (no internet dependency).

## Context Files
| File | Purpose |
|------|---------|
| `AGENTS.md` | This file — agent orientation |
| `PROJECT_CONTEXT.md` | Tech stack, environment, credentials, how to run |
| `ARCHITECTURE.md` | System architecture, data flow, module map |
| `IMPLEMENTATION_STATUS.md` | What is done, what is in progress, what is not started |
| `NEXT_TASKS.md` | Ordered task list for the next agent to pick up |
| `CHANGELOG.md` | Log of all changes made, with dates |

## How to Start Working
1. Read `PROJECT_CONTEXT.md` for environment setup
2. Read `ARCHITECTURE.md` for system design
3. Read `IMPLEMENTATION_STATUS.md` to see current state
4. Read `NEXT_TASKS.md` to see what to do next
5. After making changes, update `IMPLEMENTATION_STATUS.md`, `NEXT_TASKS.md`, and `CHANGELOG.md`

## Virtual Environment
```
Path: c:\Users\Lenovo\Desktop\Project\.venv
Python: 3.13
Activate: .venv\Scripts\activate
```

## Running the Backend
```bash
cd c:\Users\Lenovo\Desktop\Project
.venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Running the Frontend (dev)
```bash
cd c:\Users\Lenovo\Desktop\Project\frontend
npm run dev
```
Frontend dev server runs on `http://localhost:3000` and proxies `/api/*` to the backend at `http://127.0.0.1:8000`.

