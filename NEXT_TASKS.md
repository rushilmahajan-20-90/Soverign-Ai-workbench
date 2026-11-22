# NEXT_TASKS.md — Sovereign AI Workbench

> Last updated: 2026-11-21T09:20+05:30
> Pure Black Theme, Centered Luminous VERTEX Opening Scene Animation, and Shining Typography complete and verified.

---

## Quick Start (How to Run)

### 1. Prerequisites (Services)
- **PostgreSQL**: Running on port `5433` (Service `postgresql-x64-18` active). Database `sovereign_workbench`, user `workbench_user`.
- **Ollama**: Running on port `11434` with `qwen3.5:4B` model.
- **Docker Desktop**: Running (for network-isolated OCR container `sovereign-doc-worker:dev`).

### 2. Option A: Production Mode (Single Process)
Run the backend, which serves both the API and the compiled React production SPA:
```bash
cd c:\Users\Lenovo\Desktop\Project
.venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open **`http://localhost:8000`** in any browser.

### 3. Option B: Development Mode (Vite Hot-Reload)
**Terminal 1 (Backend):**
```bash
cd c:\Users\Lenovo\Desktop\Project
.venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 (Frontend Dev Server):**
```bash
cd c:\Users\Lenovo\Desktop\Project\frontend
npm run dev
```
Open **`http://localhost:3000`** in any browser.

---

## Completed Verification Checklist

- [x] **Document Upload Restricted Exclusively to Administrators**:
  - Removed `Documents` tab from Member navigation in `Sidebar.jsx`.
  - Removed document attachment paperclip and drag-and-drop from Member chat in `ChatPage.jsx`.
  - `POST /documents/upload` and `POST /chat/upload` strictly protected with HTTP 403 Forbidden for non-administrators.
- [x] **Project Chats vs Simple Chats Strict Isolation**:
  - `project_id` column added to PostgreSQL `conversations` table.
  - Sidebar and main history exclude project conversations (`exclude_projects=true`).
  - Dedicated In-Project Workspace with integrated Project Conversations History and In-Project AI Assistant.
  - Seamless project task tracking, autonomous deliverable downloads, and isolated chat sessions.
- [x] **Enterprise Role System**:
  - `Administrator` role managing workspace, members, and organizational policies.
  - `Member` role for regular company employees using chat, docs, and RAG.
  - PostgreSQL schema enforcement with `users.role` and `users.is_active`.
  - Strict backend HTTP 403 Forbidden enforcement on all administrative endpoints.
  - Protection against self-demotion, self-deactivation, and self-deletion.
  - Deactivated accounts blocked from sending messages and uploading files.
- [x] **Admin Console**:
  - Dedicated enterprise console accessible only to Administrators.
  - Member management: search, filter, promote to Administrator, demote to Member.
  - Account activation toggle & member removal.
  - Organization & Workspace settings: org name, workspace domain, upload permissions, size limits.
  - RBAC Security & Permissions Matrix visualization.
  - Real-time system telemetry and component diagnostics.
- [x] **VERTEX Startup Animation**:
  - Polished 1.5-second enterprise brand animation displayed after login.
  - Displays dynamic role badge (`ADMINISTRATOR CONSOLE` vs `MEMBER WORKSPACE`).
  - 100% offline, zero external CDN dependencies.
- [x] **User Interface & Navigation**:
  - Shows current user Name, Role badge (`Administrator` vs `Member`), and Organization name in Sidebar and TopBar.
  - Admin Console navigation entry visible to Administrators only.
  - Profile page showcases role and organizational governance.
- [x] Database migration: `user_id` added to `conversations` with cascade delete.
- [x] Multi-user isolation: Each user only accesses their own conversations.
- [x] Frontend production build: `npm run build` compiled without warnings.
- [x] Backend static file serving: Root `/` serves `frontend/dist/index.html`.
- [x] Direct & `/api` prefix routes: Middleware enables seamless proxy and direct routing.
- [x] Offline mode: `HF_HUB_OFFLINE=1` configured for local-only startup.
- [x] Login & Profile Management: Create profile, switch profile, avatar colors, edit display name, delete profile with confirmation
- [x] Chat UI:
  - User and AI message rendering with local font stack
  - Markdown rendering (syntax highlighted code blocks, tables, blockquotes, lists)
  - RAG source citation badges with document name and page number
  - Copy response to clipboard with checkmark feedback
  - Regenerate AI response action
  - Paperclip attachment for direct document upload
  - Animated thinking indicator
- [x] Document Workspace:
  - Drag-and-drop file upload with progress bar
  - Docker-sandboxed PaddleOCR processing
  - Status indicators: Indexed (green check), Processed, Failed
  - Selected Document inspection card with file size, format, chunk count
  - "Ask about this document" action button leading directly to chat with prefilled query
- [x] Sidebar:
  - Collapsible design with clean icons
  - Conversation grouping by Today, Yesterday, Previous
  - Real-time client-side conversation search filter
  - Inline conversation rename & delete
  - Prominent `LOCAL • OFFLINE` indicator
- [x] Workspace & History Pages:
  - Workspace analytics cards (total documents, conversations, chunks, PDFs, images)
  - Full history view with search, date formatting, and message counts
- [x] Settings Page:
  - Real-time system diagnostics (PostgreSQL, LLM, RAG ChromaDB, OCR, Storage)
  - Offline architecture details and zero-telemetry privacy guarantees

---

## Optional Future Enhancements
- Conversation export to Markdown or JSON file
- Audio transcription / TTS (if local Whisper or Piper model is added later)
- Dark/Light theme toggle (currently locked to high-contrast dark theme per user preference)
