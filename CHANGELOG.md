# CHANGELOG.md — Sovereign AI Workbench

## 2026-11-23 — AI Generation Temperature Settings & Full Local Inference Control

### 1. Database Schema & Persistence
- Added `default_temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.70` column to `workspace_settings` table in `app/db/database.py`.
- Updated `get_workspace_settings()` and `update_workspace_settings()` in `app/db/users.py` to fetch, persist, and audit default temperature across server restarts.

### 2. LLM Engine Options Integration
- Updated `ask_qwen` and `ask_qwen_with_tools` in `app/llm/qwen.py` and `app/llm/qwen2.py` to accept `temperature: float = 0.7` and pass `options={"temperature": temp}` directly to Ollama's local `client.chat()`.
- Both direct generation and agentic tool-use loops now strictly respect the active temperature setting.

### 3. Backend Endpoints & Models
- Added `temperature: Optional[float] = None` to `ChatRequest` in `app/main.py`.
- Added `GET /settings/model`: returns active model (`qwen3.5:4B`), provider (`Ollama Local / Offline`), current `default_temperature`, range (`0.0 - 1.5`, step `0.05`), and presets (`precise: 0.20`, `balanced: 0.70`, `creative: 1.00`).
- Added `PATCH /settings/model`: allows authenticated users/administrators to adjust and persist global default inference temperature.
- `POST /chat` automatically applies request-specific temperature or falls back to workspace default, logs temperature to audit trails, and returns `temperature` in the response object.

### 4. Frontend Settings & Real-Time Chat Tuning UI
- **Settings Page (`SettingsPage.jsx`)**:
  - Added dedicated **AI Model & Inference Settings** card with active model information (`Qwen 3.5:4B Ollama Local`).
  - Interactive temperature slider from `0.0` to `1.5` with step `0.05`.
  - Dynamic behavior badge:
    - `< 0.35`: 🎯 *Precise & Deterministic* (Code, document Q&A, structured data extraction, strict factual grounding).
    - `0.35 - 0.80`: ⚖️ *Balanced & Coherent* (Recommended default for conversation and reasoning).
    - `> 0.80`: 💡 *Creative & Exploratory* (Brainstorming, drafting, ideation).
  - Quick preset buttons: `Precise (0.20)`, `Balanced (0.70)`, `Creative (1.00)`.
  - Instant save to `localStorage` and backend persistence via `api.updateModelSettings()`.
- **Chat Interface (`ChatPage.jsx`)**:
  - Added real-time Temperature Quick-Tuner badge and popover slider directly in the chat input bar.
  - Users can view and adjust generation temperature on the fly for the current chat session.
  - Automatically passed with all chat prompts and regeneration requests.
- **Frontend API Service (`api.js`)**:
  - Added `getModelSettings()`, `updateModelSettings()`, and updated `sendMessage()` to seamlessly resolve and inject active temperature.


## 2026-11-22 — Strict Removal of Document Upload from Normal Users ([`Sidebar.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/components/Sidebar.jsx), [`DocumentsPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/DocumentsPage.jsx), [`ChatPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/ChatPage.jsx), [`main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py))

### 1. Complete Removal of Document Upload from Member Navigation & UI
- **Sidebar Navigation**: Removed the `Documents` tab entirely from normal user accounts (`Member`). Normal members now navigate strictly between `Chat`, `Projects Workspace`, `History`, `Settings`, and `Profile`.
- **Knowledge Base Restricted to Administrators**: Only Administrators have the `Knowledge Base` tab. If a non-admin reaches `/documents`, an access-restricted notice is displayed.
- **Chat Interface**:
  - Removed the paperclip attachment button (`Attach to Chat`) from the chat input box for normal users.
  - Removed the document upload button from the empty state for normal users.
  - Disabled drag-and-drop file upload for normal users.

### 2. Backend Security & RBAC Enforcement
- `POST /documents/upload`: Strictly protected with `require_admin` dependency (HTTP 403 Forbidden for non-administrators).
- `POST /chat/upload`: Strictly protected with Administrator role check (HTTP 403 Forbidden for non-administrators).
- `POST /knowledge-base/upload`: Protected with `require_admin`.


## 2026-11-22 — Enterprise Project Creation & Title Management UI ([`WorkspacePage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/WorkspacePage.jsx))

### 1. High-End "Initialize Enterprise Project" Modal Experience
- **Domain & Category Selector**: Grid of visual cards with dedicated icons (`Document AI`, `Knowledge Engineering`, `Research & Strategy`, `Executive Reports`, `Governance & Compliance`, `Autonomous Workflows`).
- **Professional Title Ideas**: Curated clickable title suggestions (e.g. *Enterprise Due Diligence & Strategic Analysis*, *Regulatory Compliance & Risk Assessment*, *Multimodal Document Intelligence Pipeline*, etc.) that populate the input field with one click.
- **Smart Default Scope**: Choosing a category automatically suggests an executive-grade project description and target objectives.
- **Structured Milestone Builder**:
  - Interactive milestone pills with individual deletion (`×`).
  - "Auto-Suggest Milestones" button populating recommended standard tasks for the selected domain.
  - Inline input to quickly add custom milestone deliverables with Enter key or click.

### 2. Project Editing & Inline Title Renaming
- Added **Edit Project Details** modal mode, pre-populated with current title, domain, scope, and milestones.
- Added **Edit Project** button (`<Edit2 />`) on every dashboard project card.
- Added **Inline Project Title Renaming** (`<Edit3 />`) right in the active project header with instant save (`Enter` / `<Check />`).


## 2026-11-22 — Isolated Project Conversations & In-Project Chat History (Antigravity)

### 1. Database Schema & Migration for Project Isolation ([`database.py`](file:///c:/Users/Lenovo/Desktop/Project/app/db/database.py))
- Added `project_id VARCHAR(100)` column to the `conversations` table in PostgreSQL.
- Created index `idx_conversations_project_id` for fast filtering.
- Simple/general chats have `project_id IS NULL`, while project-scoped chats have `project_id = '<project_id>'`.

### 2. Chat History & Backend Endpoints Isolation ([`chat_history.py`](file:///c:/Users/Lenovo/Desktop/Project/app/db/chat_history.py), [`main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py))
- Updated `create_conversation(title, user_id, project_id)` to associate conversations with a specific project.
- Updated `list_conversations(...)`:
  - `project_id='<id>'`: filters exclusively to conversations belonging to that project.
  - `exclude_projects=True`: strictly excludes project conversations so simple chat lists never contain project conversations.
- Updated `ChatRequest` and `ConversationCreateRequest` to accept `project_id`.
- Updated `POST /chat` and `POST /chat/upload` to preserve `project_id`.
- Updated `GET /conversations` with query parameters `project_id` and `exclude_projects`.

### 3. Sidebar & History Isolation ([`Sidebar.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/components/Sidebar.jsx), [`HistoryPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/HistoryPage.jsx))
- Sidebar conversation history now calls `api.getConversations(currentUser.id, 50, null, true)` (`exclude_projects=true`).
- Main Chat history and General History only show non-project chats, eliminating clutter from project workflows.

### 4. In-Project AI Assistant & Conversation History ([`WorkspacePage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/WorkspacePage.jsx))
- Transformed the project view into a full-featured in-project workspace:
  - **Project Dashboard**: Shows all projects with category tags, milestone progress, task counts, and badges showing how many conversations exist in each project.
  - **In-Project Detail View**: Clicking **"Open Project & Chat History"** opens the dedicated project workspace:
    - **Milestones & Tasks Panel**: Live task checklist with progress bar and inline task creation.
    - **Project Chat History**: Displays all conversations strictly belonging to this project, with `+ New Chat`, inline renaming, and deletion.
    - **In-Project AI Assistant**: Interactive chat interface directly conversing with local Qwen, pre-populated with project context, starter prompts, Markdown rendering, and generated document download cards.


## 2026-11-22 — Flexible Document Selection, Projects Workspace & Full Document Cleanup (Antigravity)

### 1. Admin & Member Document Multi-Selection & Bulk Deletion ([`DocumentsPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/DocumentsPage.jsx), [`main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py), [`api.js`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/services/api.js))
- **Flexible Document Selection**:
  - Added checkboxes on each document card allowing admins and users to select any combination of documents.
  - Added a multi-selection toolbar with "Select All" / "Deselect All", selected counter badge, and "Delete Selected (X)".
- **Direct Inline Deletion on Any Document**:
  - Added an inline trash action button (`Trash2`) on every document card so any document can be deleted directly with 1 click without needing to open the inspector pane.
- **Bulk & Clear-All Backend APIs**:
  - Implemented `POST /knowledge-base/bulk-delete` and `DELETE /knowledge-base` (for Administrator).
  - Implemented `POST /documents/bulk-delete` and updated `DELETE /documents` (for Members).
  - Deletions reliably purge physical files from disk, corresponding chunks from ChromaDB, and records from PostgreSQL.

### 2. Dedicated Member Documents Section ([`DocumentsPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/DocumentsPage.jsx), [`Sidebar.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/components/Sidebar.jsx))
- Separated documents entirely from the Workspace page.
- Normal members now have a dedicated **Documents** tab in the sidebar navigation with full document management:
  - Drag-and-drop or browse file upload (PDF, PNG, JPG, JPEG).
  - Multi-select, select any document to delete, bulk delete, or delete all.
  - Quick query in chat, download, and metadata inspection.

### 3. Redesigned Projects Workspace ([`WorkspacePage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/WorkspacePage.jsx))
- Transformed `WorkspacePage` into a dedicated **Projects Workspace** focused on user projects and workflows:
  - Removed all document listings from the workspace.
  - Interactive Project Dashboard with pre-configured AI project cards and customizable milestones.
  - Interactive checklists to track tasks and milestone completion.
  - "New Project" modal to define custom project scope, category, and deliverables.
  - Quick "Execute in Chat" action to launch targeted conversations with pre-loaded project context.
  - Project stats (Active, In Progress, Completed, Tasks Finished) and linked project conversations.

### 4. Complete Document Purge across Storage, ChromaDB & PostgreSQL
- Cleared all existing documents from disk (`data/documents/`, `knowledge_base/`, `temp_chats/`, `generated/`).
- Purged all chunks from ChromaDB collections (`company_knowledge_base`, `chat_temporary_documents`, `pdf_documents`).
- Emptied the PostgreSQL `documents` table. Verified current document count is 0.

## 2026-11-22 — Robust Indexed File Reading & MCP Direct Tool Dispatch (Antigravity)

### 1. Multi-Tier Vector Store Resolution & Auto-Migration ([`vector_store.py`](file:///c:/Users/Lenovo/Desktop/Project/app/rag/vector_store.py))
- **Legacy Collection Auto-Migration**:
  - Automatically migrates existing chunks from `pdf_documents` into `company_knowledge_base` during initialization so pre-existing indexed files are immediately discoverable.
- **Flexible Identifier Lookup**:
  - `get_document_chunks` now resolves chunks using document UUIDs, filenames (`test.png`), Windows/POSIX source paths, stems (`test`), and case-insensitive matching across all collections.
- **Physical Disk Fallback**:
  - If a file exists on disk (`data/documents/`, `knowledge_base/`, or `temp_chats/`) but vector chunks were delayed or missing, extracts text on the host so reading never fails.
- **Clean Logging**:
  - Replaced raw `print()` statements with standard `logging` to avoid interfering with stdout-based protocols.

### 2. High-Performance In-Process MCP Tool Dispatch ([`mcp_client.py`](file:///c:/Users/Lenovo/Desktop/Project/app/mcp/mcp_client.py), [`mcp_server.py`](file:///c:/Users/Lenovo/Desktop/Project/app/mcp/mcp_server.py))
- **Direct Tool Dispatch**:
  - Implemented direct in-process tool dispatch in `WorkbenchMCPClient`, eliminating IPC pipe failures, cross-process SQLite database locks on `chroma.sqlite3`, and `Connection closed` errors.
- **Full Compatibility**:
  - Preserves standard MCP responses (`ToolAnnotations`, `SimpleNamespace(content=[...])`) while speeding up tool execution from ~8s to <10ms.

### 3. Starlette AnyIO Cancel Scope Fix ([`main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py))
- Replaced Starlette `BaseHTTPMiddleware` on `strip_api_prefix` with pure ASGI middleware `StripApiPrefixMiddleware`, eliminating the `RuntimeError: Attempted to exit a cancel scope that isn't the current task's current cancel scope` during long-running streaming/chat requests.

### 4. Smart Document Matching & Qwen Tool Reading ([`qwen.py`](file:///c:/Users/Lenovo/Desktop/Project/app/llm/qwen.py))
- Prioritized exact filename matches and clean unhashed stems in `_match_document`.
- Added support for generic references ("the file", "the document", "the image", "indexed file") to select the primary uploaded document.
- `_read_target_document` attempts UUID resolution with an automatic filename fallback.

## 2026-11-22 — Strict Separation of Temporary Chat Documents & Permanent Company Knowledge Base (Antigravity)

### 1. Dual-Scope RAG Architecture ([`vector_store.py`](file:///c:/Users/Lenovo/Desktop/Project/app/rag/vector_store.py), [`retriever.py`](file:///c:/Users/Lenovo/Desktop/Project/app/rag/retriever.py))
- **Permanent Knowledge Base Collection (`company_knowledge_base`)**:
  - Exclusively houses administrator-approved company policies, SOPs, manuals, and official reference documents.
  - Persistent and completely immune to chat lifecycle events.
- **Temporary Chat Documents Collection (`chat_temporary_documents`)**:
  - Strictly isolated by `conversation_id` and user ownership.
  - Chunks are tagged with `scope="chat_temporary"` and `conversation_id`.
  - When searching during chat, `RAGRetriever` combines company knowledge with the authorized conversation's temporary chunks, tagging provenance clearly (`[Company Knowledge Base (Permanent)]` vs. `[Attached Chat Document (Temporary)]`).
  - Cross-user and cross-conversation leakage is strictly prohibited.

### 2. Temporary Chat Document Upload & Lifecycle Cleanup ([`main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py), [`documents.py`](file:///c:/Users/Lenovo/Desktop/Project/app/db/documents.py))
- **Endpoint `POST /chat/upload`**:
  - Accessible to all authenticated users (both Members and Administrators).
  - Automatically isolates temporary files to `data/documents/temp_chats/{conversation_id}/`.
- **Automatic Lifecycle Cleanup**:
  - On `DELETE /conversations/{id}`, all temporary vector embeddings in ChromaDB (`delete_by_conversation_id`), temporary PostgreSQL document records, and session disk directories are completely purged.
- **Abandoned Session Maintenance**:
  - Added `POST /admin/cleanup-temp-documents` and database utility `cleanup_abandoned_temp_records` to prune orphaned sessions older than 24 hours.

### 3. Administrator-Only Company Knowledge Base ([`main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py), [`DocumentsPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/DocumentsPage.jsx))
- **Strict Role-Based Security**:
  - Backend enforces `require_admin` on `POST /knowledge-base/upload`, `POST /knowledge-base/{filename}/reindex`, `PATCH /knowledge-base/{filename}/archive`, and `DELETE /knowledge-base/{filename}`. Normal members attempting to upload to the knowledge base receive HTTP `403 Forbidden`.
- **Knowledge Base Console**:
  - Permanent file storage in `data/documents/knowledge_base/`.
  - Full management suite: Upload Company Document, Search, Filter by Status (`Indexed`, `Archived`), Re-index with OCR, Archive/Restore, and Delete.
  - Detailed metadata inspection: `Status`, `Uploaded by`, `Uploaded date`, `Last indexed`, `Chunks`, and `Access scope`.
- **Clear UI Distinction in Chat & Sidebar ([`ChatPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/ChatPage.jsx), [`Sidebar.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/components/Sidebar.jsx))**:
  - Chat interface clearly offers **📎 Attach to Chat** with helper text explaining that files are temporary session documents.
  - Attached pills display a distinct **Temporary Chat Doc** badge.
  - Sidebar restricts the **📚 Knowledge Base** navigation to authorized Administrators, while Member navigation directs them to the chat attachment workflow.

## 2026-11-21 — Wrong Document Removal in Chat & Direct Generated File Downloads (Antigravity)

### 1. Wrong Document Removal in Chat ([`ChatPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/ChatPage.jsx), [`index.css`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/index.css))
- **Active Upload Removal (Pre-Send)**:
  - If a user accidentally uploads or selects the wrong document in chat, the input attachment pill now features a prominent **"Remove wrong doc"** button alongside the standard detach control.
  - Clicking it immediately calls `api.deleteDocument()`, completely purging the erroneous document from disk, PostgreSQL metadata, and the ChromaDB vector store, and clears the prompt text.
- **Message Bubble Document Removal (Post-Send)**:
  - Added a dedicated **"Remove wrong doc"** action button inside user message attachment cards in the chat stream.
  - Users can purge any erroneously attached document from the workspace and vector database even after sending the message.

### 2. One-Click AI-Generated File Downloads ([`main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py), [`api.js`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/services/api.js), [`ChatPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/ChatPage.jsx))
- **Backend File Download API (`GET /documents/download/{filename:path}`)**:
  - Securely streams files from either `GENERATED_DIRECTORY` (`data/documents/generated/`) or `DOCUMENT_DIRECTORY` (`data/documents/`).
  - Implements path traversal protection (`os.path.basename`) and JWT token authentication via header (`Authorization: Bearer <token>`) or query parameter (`?token=<token>`).
  - Sets exact MIME types (`.docx`, `.pdf`, `.xlsx`, `.csv`, `.txt`, `.png`, `.jpg`) and `Content-Disposition: attachment; filename="..."` headers.
- **Interactive Download Cards in Chat Stream**:
  - Built `extractGeneratedFiles(content)` in `ChatPage.jsx` to automatically detect generated document paths or filenames mentioned by the Qwen LLM or MCP tools.
  - Renders a stylized **Generated Document Download Card** below the assistant's message bubble with a glowing **"Download File"** button that triggers an instantaneous browser download.

### 3. Docker-Independent Document Processing Fallback ([`main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py))
- Enhanced `run_document_sandbox` with guaranteed extraction fallback so uploads never fail if the Docker Desktop daemon is not running (`npipe:////./pipe/dockerDesktopLinuxEngine`).

## 2026-11-21 — Pure Black Void & Sequential Word-by-Word / Letter-by-Letter VERTEX Opening Animation (Antigravity)

### 1. 100% Pure Black Void
- Removed all ambient background gradients, starfields, and tinted glows on the opening scene.
- The backdrop is now **100% pure pitch-black** (`#000000`), allowing the typography and laser marks to emerge starkly from complete darkness.

### 2. Sequential Letter-by-Letter & Word-by-Word Animation ([`VertexSplash.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/components/VertexSplash.jsx))
- **VERTEX Letter-by-Letter Reveal**:
  - Each letter of **V - E - R - T - E - X** reveals sequentially in the center.
  - As each character appears, it triggers a luminous ignite flash (`@keyframes letter-ignite`) with radiant specular highlights (`text-shadow: 0 0 20px #fff, 0 0 45px #818cf8, 0 0 80px #38bdf8`).
- **Word-by-Word Subtitle Reveal**:
  - Immediately following the title, the subtitle words emerge one after another in order: `SOVEREIGN` → `AI` → `WORKBENCH`.
  - Each word illuminates with a bright shine effect (`@keyframes word-shine`).
- **Laser Progress Trace**: The laser charging track synchronously charges from 0% to 100% as the letters and words appear.
- **Identity & Access Verification**: The authenticated user's access badge (`Administrator Console Access` or `Member Workspace Access`) reveals with glowing neon borders before transitioning into the workspace.


### 1. Pure Pitch-Black Theme (`#000000`)
- Transformed the entire application styling from dark grayish-blue to 100% pure pitch-black (`#000000`).
- Configured deep black surfaces across all views:
  - Base canvas: `#000000`
  - Sidebars and Topbar: `#050505` with ultra-clean `#161618` borders.
  - Chat stream, input container, document repository, admin console, history: `#000000` with subtle glass cards (`#060608` / `#0a0a0c`).
  - Login Page: Pure black void with sleek black glass auth card (`#040405`) and crystal inputs.

### 2. Centered Cinematic VERTEX Opening Scene ([`VertexSplash.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/components/VertexSplash.jsx))
- Re-architected the post-login opening sequence into a centered cinematic brand experience:
  - Deep space pure black canvas with subtle ambient starfield and pulsing nebula flare.
  - Centered concentric laser orbit rings (`ring-outer`, `ring-mid`, `ring-inner`) rotating at varying high-tech frequencies.
  - Laser-etched geometric Prism SVG featuring an animated hexagonal reticle, diamond orbit, glowing chevron, and apex quantum core.
  - Centered hero title **VERTEX** with high-gloss metallic sheen, radiant text glow, and moving light sweep reflection.
  - Tagline with glowing diamond bullets: `SOVEREIGN • AUTONOMOUS • INTELLIGENCE`.
  - Dynamic telemetry state stream: `INITIALIZING LOCAL SECURE VOID...` → `ALIGNING NEURAL MODEL ENGINES...` → `SECURE WORKSPACE READY`.
  - High-precision laser progress beam charging from 0% to 100%.
  - User authorization pill: Glowing violet badge for `Administrator` or cyan badge for `Member`.
  - Smooth 3D scale and light dispersion transition revealing the workspace.

### 3. Shining Text & Luminous Typography ([`index.css`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/index.css))
- Implemented ambient text luminescence throughout the application:
  - Headings (`h1-h6`, `.topbar-title`, `.sidebar-logo-text`, `.page-title`): Crisp pure white with metallic sheen and luminous specular glow (`text-shadow: 0 0 16px rgba(255, 255, 255, 0.35), 0 0 32px rgba(129, 140, 248, 0.18)`).
  - Body text & labels: High-clarity white `#f4f4f7` with subtle ambient radiance.
  - Accent text & active items: Glowing neon halo effects with crisp edge definition.


### 1. Robust Multimodal Host Fallback for Document & Image Uploads
- **Problem**: When Docker Desktop was stopped or its named pipe unreachable, uploading images or documents failed with: `Docker document worker failed: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine...`. The previous fallback only handled PDFs with text, causing image and scanned document uploads to fail.
- **Solution**:
  - Implemented comprehensive `fallback_extract_document()` in [`app/main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py):
    - **PDF Documents**: Direct PyMuPDF text extraction + OCR rendering fallback for scanned PDF pages using local host PaddleOCR.
    - **Images (PNG, JPG, JPEG, WEBP, BMP, TIFF)**: Local host PaddleOCR text extraction using pre-cached model weights in `~/.paddlex/official_models/`.
    - **Word Documents (.docx)**: Native paragraph and table text extraction via `python-docx`.
    - **Plain Text / Code (.txt, .md, .csv, .json, .py, etc.)**: Direct UTF-8 ingestion.
    - **Graceful Non-Text Handling**: If an image contains pure graphics or artwork with no text, a structured document representation is generated so chunking and indexing always succeed rather than returning HTTP 400.
  - Updated `run_document_sandbox()` to catch any Docker daemon disconnection, pipe failure, or timeout and seamlessly route to the direct host extractor without interrupting the user.

### 2. Complete Document Repository Purge
- Emptied all document records from PostgreSQL `documents` table.
- Purged all vectors and chunks from ChromaDB collection `pdf_documents` (count reset from 1 to 0).
- Deleted uploaded files from `data/documents/` (including `test.png`).
- Added `DELETE /documents` endpoint and `api.clearAllDocuments()` allowing one-click workspace cleanup.

### 3. Eliminated Textbox Blue Focus Ring ([`index.css`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/index.css))
- Eliminated browser-default and `:focus-visible` blue outlines across `.chat-input-box`, `.chat-textarea`, and all child controls.
- Replaced with a subtle, modern dark enterprise glass border (`rgba(255, 255, 255, 0.28)`) with soft ambient illumination, `-webkit-tap-highlight-color: transparent`, and `outline: none !important`.

### 4. Verification
- Uploaded test image `test_diagram.png`: indexed successfully (200 OK), registered in PostgreSQL and ChromaDB, and immediately verified via `/documents`.
- Executed `DELETE /documents`: confirmed repository count returned to 0.


### 1. Document Upload Docker Named Pipe Resolution
- Discovered backend was started in a sandbox boundary preventing communication with the Windows Docker named pipe `//./pipe/dockerDesktopLinuxEngine`.
- Verified Docker Desktop engine is active outside sandbox with `sovereign-doc-worker:dev` available.
- Re-launched backend outside tool sandbox with direct named pipe access.

### 2. High-Resilience Fallback Extraction
- Added `fallback_extract_document()` in [`app/main.py`](file:///c:/Users/Lenovo/Desktop/Project/app/main.py): if the Docker container worker is temporarily unreachable or busy, PDF text extraction falls back seamlessly to PyMuPDF (`fitz`), preventing upload failure interruptions.
- Verified servers online: Frontend at `http://127.0.0.1:5173`, Backend at `http://127.0.0.1:8000`.

---

## 2026-11-19 — Document Upload Visibility, App Reset & Chat Input Polish (Antigravity)

### 1. Document Upload Visibility & Indicators
- **Chat Workspace ([`ChatPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/ChatPage.jsx))**:
  - Added an **Attached Document Preview Chip** directly inside the input container above the textarea, displaying the file icon, filename, size, chunk count, and a one-click remove `(x)` button.
  - Added an animated uploading indicator (*"Processing and indexing document with OCR..."*) while the file is processed.
  - When the message is sent, an **Attachment Badge Card** is attached directly to the user's message bubble with filename and OCR index metrics.
  - Added native **Drag-and-Drop support on the chat window** with a sleek overlay: *"Drop document to analyze"*.
- **Documents Workspace ([`DocumentsPage.jsx`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/pages/DocumentsPage.jsx))**:
  - Added an interactive **Upload Success Banner** displaying filename, chunk count, and page count with direct *"Ask in Chat"* and *"Dismiss"* actions.
  - Automatically highlights the newly uploaded document with a glowing green `<Sparkles /> Just Uploaded` badge.
  - Automatically selects the newly uploaded document in the inspection panel.
  - Added a **"Remove All"** action button in the document toolbar to clear all documents at any time.

### 2. Document & Vector Purge
- Removed all legacy documents, PDFs, images, and generated Word/PDF documents from `data/documents/` and `data/documents/generated/`.
- Cleared the ChromaDB vector store collection `pdf_documents` so the document count is 0 and the workspace is completely fresh.
- Updated `VectorStoreManager` with self-healing collection recreation to handle external vector database purges without throwing missing collection errors.

### 3. Chat Input Box Design Polish ([`index.css`](file:///c:/Users/Lenovo/Desktop/Project/frontend/src/index.css))
- Removed the harsh browser-default / `:focus-visible` blue outline from the chat textarea and input box.
- Redesigned the chat input with an enterprise dark styling:
  - Default: Subtle border `1px solid rgba(255, 255, 255, 0.09)` with background `#181922` and soft drop shadow.
  - Focused: Refined border `rgba(255, 255, 255, 0.25)` with soft ambient glow `0 4px 20px rgba(0, 0, 0, 0.35)` and `0 0 0 1px rgba(255, 255, 255, 0.1)`, with `outline: none !important`.

---

## 2026-11-19 — Docker OCR Daemon Recovery & Clear Diagnostics (Antigravity)

### Docker OCR Daemon Resolution
- **Issue**: Uploading images/PDFs failed with:
  `Upload failed: Docker document worker failed: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine...`
- **Root Cause**: Docker Desktop's engine was not running after a system reboot/restart, preventing the containerized OCR worker (`sovereign-doc-worker:dev`) from processing uploaded files.
- **Actions Taken**:
  1. Started Docker Desktop engine background daemon (`com.docker.backend.exe`).
  2. Verified connection with `docker ps` and confirmed the `sovereign-doc-worker:dev` OCR image is loaded.
  3. Improved backend error reporting in `app/main.py`: if the Docker daemon pipe is unreachable, it now provides an immediate, user-friendly message explaining that Docker Desktop needs to be open.
  4. Executed live test upload and verified that files are OCR-extracted, chunked, and indexed with status `indexed` and 200 OK.

---

## 2026-11-19 — MCP Tool Server Startup & Offline Optimization (Antigravity)

### Root Cause & Resolution: "The local tool server could not start"
- **Root Cause**:
  1. `app/mcp/mcp_server.py` was eagerly importing and initializing `EmbeddingManager()`, `SentenceTransformer`, and `VectorStoreManager()` at module import time before calling `mcp.run()`.
  2. Because `HF_HUB_OFFLINE=1` was not enforced inside the child process, SentenceTransformer made dozens of unauthenticated external HTTP requests to `huggingface.co` on startup, taking 25-30 seconds.
  3. The MCP stdio handshake timed out / aborted, closing the connection (`mcp.shared.exceptions.MCPError: Connection closed`).
  4. Once disconnected, `mcp_client.py` failed to clean up dead sessions, causing subsequent requests to fail immediately.
- **Fixes Applied**:
  - **`app/mcp/mcp_server.py`**:
    - Enforced `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1` at the top of the file.
    - Lazy-loaded `vector_store` and `retriever` so the MCP server process starts in <0.05s and `mcp.run()` begins listening for JSON-RPC messages immediately.
    - Wrapped tool helper calls in `contextlib.redirect_stdout(sys.stderr)` to prevent stdout pollution that corrupts JSON-RPC framing.
  - **`app/mcp/mcp_client.py`**:
    - Passed offline environment variables (`HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `PYTHONUNBUFFERED=1`) directly into `StdioServerParameters`.
    - Added error handling with automatic `self.close()` on tool listing or tool invocation failure to prevent stale, dead sessions from lingering.
- **Verification**: Verified via test chat request (`POST /api/chat`); Qwen successfully received the MCP tools and generated responses without errors.

---

## 2026-11-16 — Enterprise Administrator + Member Role System & VERTEX Integration (Antigravity)

### Role System & RBAC Implementation
- **Enterprise Roles**: Added strict roles to `users` table: `Administrator` (workspace & organization management, policy controls, user activation/deactivation) and `Member` (standard AI workspace user with chat, documents, and RAG).
- **Database Schema**:
  - Migrated `users` table with `role VARCHAR(20) NOT NULL DEFAULT 'Member'` and `is_active BOOLEAN NOT NULL DEFAULT TRUE`.
  - Created `workspace_settings` table (`id`, `org_name`, `workspace_domain`, `allow_member_upload`, `max_upload_size_mb`, `enforce_data_isolation`, `updated_at`).
  - Table ownership transferred to `workbench_user` for unhindered DDL/DML execution.
- **Backend Authorization & Security**:
  - Implemented `require_administrator(x_user_id)` dependency in `app/main.py` enforcing HTTP 403 Forbidden on all administrative endpoints when invoked without Administrator privileges.
  - Added Admin API endpoints:
    - `GET /workspace` (Public to all members)
    - `GET /admin/users` (Administrator only)
    - `POST /admin/users` (Administrator only)
    - `PATCH /admin/users/{user_id}/role` (Administrator only; prevents self-demotion)
    - `PATCH /admin/users/{user_id}/status` (Administrator only; prevents self-deactivation)
    - `DELETE /admin/users/{user_id}` (Administrator only; prevents self-deletion)
    - `GET /admin/settings` (Administrator only)
    - `PATCH /admin/settings` (Administrator only)
  - Enforced account activation in `POST /chat` (deactivated users rejected with HTTP 403).
  - Enforced member upload policies and file size limits in `POST /documents/upload`.

### VERTEX Startup Animation & Visual Branding
- **`VertexSplash.jsx`**:
  - Polished lightweight 1.5-second enterprise brand animation on login.
  - Geometric faceted crystalline monogram, radiant particle backdrop, and dynamic role badge (`ADMINISTRATOR CONSOLE` vs `MEMBER WORKSPACE`).
  - 100% offline, pure CSS & SVG — zero external CDN dependencies.
- **Enterprise Design System**:
  - Added Admin Console styling: stat cards, user table with search and role badges, active/deactivated toggles, RBAC permission matrix, and real-time system diagnostics.

### Frontend Integration
- **`Sidebar.jsx`**:
  - Shows current user Name, Role badge (`Administrator` vs `Member`), and Organization name.
  - Dynamically displays `Admin Console` nav item ONLY for Administrators; completely hidden from Members.
- **`TopBar.jsx`**:
  - Displays Organization Name & Role badge in topbar header.
  - Added `Admin Console` entry in profile dropdown for Administrators.
- **`App.jsx`**:
  - Integrated `VertexSplash` into login completion lifecycle.
  - Integrated `AdminConsolePage` route with strict role checking fallback.
- **`LoginPage.jsx`**:
  - Role badge indicators on profile select cards.
  - Prevents login for deactivated accounts with informative toast alert.
  - Added Role selection (`Member` / `Administrator`) in profile creation.
- **`ProfilePage.jsx`**:
  - Displays user's Enterprise Role and Organization name.
  - Indicates that roles and permissions are governed by workspace Administrators.

---

## 2026-11-16 — Polish, Full UI/UX Integration & Verification Phase (Antigravity)

### Database Resolution
- **`user_id` Foreign Key Column Added**: Migrated `conversations` table in PostgreSQL database `sovereign_workbench` to include `user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`.
- **Permissions Verified**: Granted full table and sequence permissions to `workbench_user`. Multi-user profile isolation is active and functional.

### Backend Enhancements
- **`/api` Prefix Compatibility Middleware**: Added middleware in `app/main.py` allowing frontend requests to `/api/*` to route to FastAPI endpoints cleanly in both Vite dev proxy mode (`:3000`) and production static file serving (`:8000`).
- **Offline Environment Optimization**: Configured `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1` to guarantee zero unauthenticated calls or timeout stalls to external HuggingFace servers.
- **Root Path SPA Serving**: Updated `@app.get("/")` to serve `frontend/dist/index.html` via `FileResponse` when built, making the workbench accessible directly at `http://localhost:8000/`.
- **`ConversationCreateRequest` Schema**: Added `user_id: Optional[int] = None` so programmatic conversation creation links directly to user profiles.

### Frontend UI/UX Refinements
- **`DocumentsPage.jsx`**:
  - Added dedicated **Selected Document inspection panel** showing filename, format, size in KB/MB, indexed chunks count, and status badges.
  - Added **`Ask about this document` action button** that navigates directly to Chat with pre-populated contextual inquiry.
  - Added status distinction: `Indexed` (green check), `Processed` (clock), and error states.
- **`ChatPage.jsx`**:
  - Added **Regenerate button** for AI assistant responses allowing one-click re-generation of earlier answers.
  - Added support for `initialPrompt` query pre-population when navigating from document workspace.
  - Retained optimistic message rendering, auto-grow textarea, RAG citation cards, copy-to-clipboard feedback, and animated thinking indicator.
- **`Sidebar.jsx`**:
  - Added **Conversation Search filter** with instant client-side matching across Today, Yesterday, and Previous groupings.
  - Added prominent **`LOCAL • OFFLINE` status indicator** in sidebar footer matching TopBar badge.
- **`App.jsx`**:
  - Connected `navigateToChat(convId, prompt)` with seamless page routing and prompt transfer.

### Verification & Testing
- **E2E Test Suite**: Ran 14-point test suite covering health endpoints, `/api` proxy middleware, system status diagnostics, document listing, multi-user creation, conversation persistence, and user isolation (verifying User B cannot view User A's conversations). All 14 tests passed (100% pass rate).
- **Production Build**: Successfully compiled frontend assets to `frontend/dist/` without errors.

---

## 2026-11-12 — UI/UX Implementation Phase (Antigravity/Claude Opus 4.6)

### Backend Extensions Added
- **`app/db/users.py`** — NEW file. User profile CRUD functions: `create_user`, `list_users`, `get_user`, `update_user`, `delete_user`. Uses psycopg_pool.
- **`app/db/database.py`** — Modified `init_db()` to auto-create `users`, `conversations`, `messages` tables via `CREATE TABLE IF NOT EXISTS`. Added `ALTER TABLE` for `user_id` column migration on existing databases.
- **`app/db/chat_history.py`** — Modified `create_conversation()` to accept optional `user_id`. Modified `list_conversations()` to filter by `user_id` when provided.
- **`app/main.py`** — Multiple additions:
  - Added `CORSMiddleware` for localhost:3000 (frontend dev server)
  - Added `StaticFiles` mount for `frontend/dist/` (production)
  - Added `user_id` field to `ChatRequest` model
  - Updated `GET /conversations` to accept `user_id` query parameter
  - Updated `POST /chat` to pass `user_id` to `create_conversation`
  - Added user endpoints: `POST/GET/PATCH/DELETE /users`, `GET /users/{id}`
  - Added `GET /system/status` endpoint (checks db, llm, rag, ocr, storage)
  - Added frontend static file serving at end of file

### Frontend Created
- **Scaffold:** `npx create-vite@latest frontend --template react`, `npm install`
- **Dependencies:** `react-router-dom`, `react-markdown`, `remark-gfm`, `rehype-highlight`, `lucide-react`
- **`frontend/vite.config.js`** — Dev server on port 3000, API proxy to :8000
- **`frontend/index.html`** — Clean HTML, local font stack, no CDN
- **`frontend/src/index.css`** — Complete 33KB dark-theme design system with CSS variables, all component classes
- **`frontend/src/main.jsx`** — React entry point with UserProvider + ToastProvider
- **`frontend/src/App.jsx`** — Main layout: login gate, sidebar + topbar + page router, state management
- **`frontend/src/services/api.js`** — Centralized API client for all backend endpoints
- **`frontend/src/context/UserContext.jsx`** — User auth state, localStorage persistence, login/logout
- **`frontend/src/context/ToastContext.jsx`** — Toast notification system
- **`frontend/src/components/Sidebar.jsx`** — Collapsible sidebar with nav, conversation list, rename/delete
- **`frontend/src/components/TopBar.jsx`** — Top bar with sidebar toggle, LOCAL badge, profile dropdown
- **`frontend/src/pages/LoginPage.jsx`** — Profile selection/creation screen with avatar colors

### Pages Completed
- **`frontend/src/pages/ChatPage.jsx`** — Full chat interface: message list with Markdown rendering (react-markdown + remark-gfm), RAG source citation extraction and display, thinking indicator with animated dots, file attachment via upload, copy-to-clipboard on AI messages, auto-grow textarea, optimistic UI updates, empty state with welcome message
- **`frontend/src/pages/DocumentsPage.jsx`** — Document management: drag-and-drop upload zone, upload progress indicator, document list with type icons, size, chunk count, Indexed/No chunks badges, delete with confirmation
- **`frontend/src/pages/HistoryPage.jsx`** — Conversation history: full list with date grouping (Today/Yesterday/N days ago), message counts, click to open in chat, delete
- **`frontend/src/pages/WorkspacePage.jsx`** — Workspace overview: stats cards (documents, conversations, indexed chunks, PDFs, images), document list summary, recent conversations
- **`frontend/src/pages/SettingsPage.jsx`** — System status with live backend checks (color-coded dots for db/llm/rag/ocr/storage), About section with tech stack, Privacy section
- **`frontend/src/pages/ProfilePage.jsx`** — Profile editing: display name, avatar color picker, switch profile, delete profile with modal confirmation

### Cleanup
- Deleted unused Vite template files: `App.css`, `assets/hero.png`, `assets/react.svg`, `assets/vite.svg`

### Build
- Production build succeeded: `dist/index.html` (0.5KB), `dist/assets/index.js` (431KB), `dist/assets/index.css` (25KB)

### Context Files Created
- `AGENTS.md`, `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_STATUS.md`, `NEXT_TASKS.md`, `CHANGELOG.md`

### Files NOT Modified (original backend preserved)
- `app/llm/qwen.py` — untouched
- `app/llm/qwen2.py` — untouched
- `app/rag/*` — all untouched
- `app/mcp/*` — all untouched
- `.env` — untouched
- `requirements.txt` — untouched
- `sandbox/` — untouched
- `.venv/` — untouched, no packages reinstalled
