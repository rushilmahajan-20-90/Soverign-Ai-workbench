import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useUser } from '../context/UserContext.jsx';
import * as api from '../services/api.js';
import {
  BookOpen,
  Upload,
  FileText,
  Image,
  Trash2,
  RotateCcw,
  Archive,
  Download,
  Search,
  CheckCircle,
  Clock,
  Shield,
  FileUp,
  MessageSquare,
  Sparkles,
  Lock,
  CheckSquare,
  Square,
  Layers,
  AlertTriangle,
} from 'lucide-react';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getDocIcon(type) {
  const t = (type || '').toLowerCase();
  if (t === '.pdf' || t === 'pdf') return { Icon: FileText, color: '#ef4444' };
  if (t === '.docx' || t === '.doc' || t === 'docx') return { Icon: FileText, color: '#3b82f6' };
  return { Icon: Image, color: '#10b981' };
}

export default function DocumentsPage({ navigateToChat }) {
  const { addToast } = useToast();
  const { currentUser, isAdmin } = useUser();

  if (!isAdmin) {
    return (
      <div className="documents-page" style={{ padding: 40, textAlign: 'center' }}>
        <div
          style={{
            maxWidth: 480,
            margin: '80px auto 0',
            padding: 32,
            background: '#050505',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <Shield size={44} style={{ color: 'var(--accent)', marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, color: '#ffffff', marginBottom: 8 }}>
            Knowledge Base — Administrator Only
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            Document uploads and permanent knowledge base indexing are restricted to authorized
            Administrators. Company policies and reference documents indexed by administrators are
            automatically available to the AI across your chats and projects.
          </p>
        </div>
      </div>
    );
  }

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedFilenames, setSelectedFilenames] = useState(new Set());
  const [recentUpload, setRecentUpload] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | Indexed | Archived
  const [reindexing, setReindexing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const fileInputRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    try {
      if (isAdmin) {
        const data = await api.getKnowledgeBase({ search: searchQuery, status: statusFilter });
        const docs = data.documents || [];
        setDocuments(docs);
        if (docs.length > 0) {
          setSelectedDoc((prev) => {
            if (!prev) return docs[0];
            const found = docs.find((d) => d.filename === prev.filename);
            return found || docs[0];
          });
        } else {
          setSelectedDoc(null);
        }
      } else {
        const data = await api.getDocuments();
        const docs = data.documents || [];
        const filtered = searchQuery.trim()
          ? docs.filter((d) =>
              (d.original_filename || d.filename || '')
                .toLowerCase()
                .includes(searchQuery.toLowerCase().trim())
            )
          : docs;
        setDocuments(filtered);
        if (filtered.length > 0) {
          setSelectedDoc((prev) => {
            if (!prev) return filtered[0];
            const found = filtered.find((d) => d.filename === prev.filename);
            return found || filtered[0];
          });
        } else {
          setSelectedDoc(null);
        }
      }
    } catch (err) {
      addToast('Failed to load documents', 'error');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, searchQuery, statusFilter, addToast]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Handle Document Upload
  const handleUpload = async (file) => {
    if (!file) return;

    const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      addToast('Supported formats: PDF, PNG, JPG, JPEG', 'error');
      return;
    }

    setUploading(true);
    setUploadName(file.name);

    try {
      let result;
      if (isAdmin) {
        result = await api.uploadKnowledgeBaseDocument(file);
        addToast(
          `Added "${file.name}" to Company Knowledge Base (${result.chunks} chunks permanently indexed)`,
          'success'
        );
      } else {
        result = await api.uploadDocument(file);
        addToast(`Uploaded "${file.name}" (${result.chunks || 1} chunks indexed)`, 'success');
      }

      const storedName = result.file || file.name;
      setRecentUpload({
        name: file.name,
        file: storedName,
        chunks: result.chunks,
        pages: result.pages,
        size: file.size,
        type: ext,
      });
      await loadDocuments();
    } catch (err) {
      addToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
      setUploadName('');
    }
  };

  const handleReindex = async (doc) => {
    if (!doc || reindexing || !isAdmin) return;
    setReindexing(true);
    addToast(`Re-indexing "${doc.original_filename || doc.filename}"...`, 'info');
    try {
      const result = await api.reindexKnowledgeBaseDocument(doc.filename);
      addToast(`Successfully re-indexed (${result.chunks} chunks updated)`, 'success');
      loadDocuments();
    } catch (err) {
      addToast(`Re-indexing failed: ${err.message}`, 'error');
    } finally {
      setReindexing(false);
    }
  };

  const handleToggleArchive = async (doc) => {
    if (!doc || !isAdmin) return;
    try {
      const res = await api.archiveKnowledgeBaseDocument(doc.filename);
      addToast(`Document marked as ${res.status}`, 'success');
      loadDocuments();
    } catch (err) {
      addToast(`Archive status change failed: ${err.message}`, 'error');
    }
  };

  // Delete single document directly
  const handleDeleteSingle = async (doc, e) => {
    if (e) e.stopPropagation();
    if (!doc) return;
    const name = doc.original_filename || doc.filename;
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      if (isAdmin) {
        await api.deleteKnowledgeBaseDocument(doc.filename);
      } else {
        await api.deleteDocument(doc.filename);
      }
      addToast(`Deleted "${name}"`, 'success');
      setSelectedFilenames((prev) => {
        const next = new Set(prev);
        next.delete(doc.filename);
        return next;
      });
      if (selectedDoc?.filename === doc.filename) {
        setSelectedDoc(null);
      }
      loadDocuments();
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  // Multi-selection handlers
  const toggleSelectDoc = (filename, e) => {
    if (e) e.stopPropagation();
    setSelectedFilenames((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFilenames.size === documents.length) {
      setSelectedFilenames(new Set());
    } else {
      setSelectedFilenames(new Set(documents.map((d) => d.filename)));
    }
  };

  // Bulk delete selected documents
  const handleDeleteSelected = async () => {
    if (selectedFilenames.size === 0) return;
    const count = selectedFilenames.size;
    if (!confirm(`Are you sure you want to delete ${count} selected document(s)?`)) {
      return;
    }
    setBulkDeleting(true);
    try {
      const filenames = Array.from(selectedFilenames);
      if (isAdmin) {
        await api.bulkDeleteKnowledgeBaseDocuments(filenames);
      } else {
        await api.bulkDeleteDocuments(filenames);
      }
      addToast(`Successfully deleted ${count} document(s)`, 'success');
      setSelectedFilenames(new Set());
      if (selectedDoc && selectedFilenames.has(selectedDoc.filename)) {
        setSelectedDoc(null);
      }
      loadDocuments();
    } catch (err) {
      addToast(`Bulk delete failed: ${err.message}`, 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Delete ALL documents
  const handleDeleteAll = async () => {
    if (documents.length === 0) return;
    const scopeName = isAdmin ? 'Company Knowledge Base' : 'all your workspace documents';
    if (!confirm(`CAUTION: Are you sure you want to delete ALL documents from ${scopeName}? This cannot be undone.`)) {
      return;
    }
    setBulkDeleting(true);
    try {
      if (isAdmin) {
        await api.clearAllKnowledgeBaseDocuments();
      } else {
        await api.clearAllDocuments();
      }
      addToast('All documents cleared successfully', 'success');
      setSelectedFilenames(new Set());
      setSelectedDoc(null);
      loadDocuments();
    } catch (err) {
      addToast(`Clear all failed: ${err.message}`, 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDownload = async (doc) => {
    if (!doc) return;
    try {
      await api.downloadFile(doc.filename, doc.original_filename);
      addToast(`Downloaded ${doc.original_filename || doc.filename}`, 'success');
    } catch (err) {
      addToast(`Download failed: ${err.message}`, 'error');
    }
  };

  const handleAskInChat = (doc) => {
    if (!doc || !navigateToChat) return;
    const name = doc.original_filename || doc.filename;
    navigateToChat(null, `What is written in "${name}"? Please summarize its main contents.`);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };

  const isAllSelected = documents.length > 0 && selectedFilenames.size === documents.length;

  return (
    <div className="documents-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isAdmin ? (
            <BookOpen size={26} style={{ color: 'var(--accent)' }} />
          ) : (
            <FileText size={26} style={{ color: 'var(--accent)' }} />
          )}
          <h1 style={{ margin: 0 }}>
            {isAdmin ? 'Company Knowledge Base' : 'Documents & Files'}
          </h1>
        </div>
        <p>
          {isAdmin
            ? "Manage the permanent company documents and knowledge base for organizational AI RAG. Select and manage any document below."
            : "Your personal workspace documents repository. Upload and select any document for AI analysis, OCR extraction, and Q&A."}
        </p>
      </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <>
            <FileUp size={36} style={{ color: 'var(--accent)', marginBottom: 12 }} />
            <h3>Indexing {uploadName}...</h3>
            <p>Extracting text with local OCR, chunking, and embedding into the vector database</p>
            <div className="upload-progress" style={{ marginTop: 12, width: '220px', margin: '12px auto 0' }}>
              <div className="progress-bar">
                <div className="progress-bar-fill animated" />
              </div>
            </div>
          </>
        ) : (
          <>
            <Upload size={36} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
            <h3 style={{ color: '#ffffff', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>
              {isAdmin ? 'Upload Document to Permanent Knowledge Base' : 'Upload Document to Workspace'}
            </h3>
            <p style={{ maxWidth: 540, margin: '6px auto 0', color: 'var(--text-secondary)' }}>
              {isAdmin
                ? 'Add company policies, HR policies, SOPs, manuals, and regulatory reference documents.'
                : 'Upload PDFs, scanned documents, and images for deep OCR indexing and AI analysis.'}
            </p>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, display: 'inline-block' }}>
              Supported formats: PDF, PNG, JPG, JPEG (up to 50 MB)
            </span>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = '';
          }}
        />
      </div>

      {recentUpload && (
        <div className="doc-upload-success-banner" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CheckCircle size={22} style={{ color: 'var(--success)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                {recentUpload.name} indexed successfully!
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {recentUpload.chunks} semantic text chunks embedded in vector storage • Ready for chat queries
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={() => handleAskInChat({ filename: recentUpload.file, original_filename: recentUpload.name })}
            >
              <MessageSquare size={14} />
              Query in Chat
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 10px', fontSize: 12 }}
              onClick={() => setRecentUpload(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 20,
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {isAdmin ? (
            <>
              <button
                className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setStatusFilter('ALL')}
              >
                All ({documents.length})
              </button>
              <button
                className={`btn btn-sm ${statusFilter === 'Indexed' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setStatusFilter('Indexed')}
              >
                Indexed ({documents.filter((d) => (d.status || 'Indexed') === 'Indexed').length})
              </button>
              <button
                className={`btn btn-sm ${statusFilter === 'Archived' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setStatusFilter('Archived')}
              >
                Archived ({documents.filter((d) => d.status === 'Archived').length})
              </button>
            </>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', alignSelf: 'center' }}>
              My Files ({documents.length})
            </div>
          )}
        </div>

        <div style={{ position: 'relative', width: 260 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
            }}
          />
          <input
            type="text"
            className="input-field"
            placeholder={isAdmin ? 'Search Knowledge Base...' : 'Search documents...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 30, fontSize: 12, height: 34 }}
          />
        </div>
      </div>

      {/* Multi-Selection & Bulk Deletion Toolbar */}
      {documents.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: '#040405',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: '#e2e8f0',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleSelectAll}
                style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
              Select All ({documents.length})
            </label>

            {selectedFilenames.size > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'var(--accent)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                }}
              >
                {selectedFilenames.size} selected
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedFilenames.size > 0 && (
              <>
                <button
                  className="btn btn-danger"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={handleDeleteSelected}
                  disabled={bulkDeleting}
                >
                  <Trash2 size={13} />
                  <span>Delete Selected ({selectedFilenames.size})</span>
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  onClick={() => setSelectedFilenames(new Set())}
                >
                  Clear Selection
                </button>
              </>
            )}

            <button
              className="btn btn-ghost"
              style={{
                padding: '6px 10px',
                fontSize: 11,
                color: 'var(--danger)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
              onClick={handleDeleteAll}
              disabled={bulkDeleting}
              title="Delete all documents"
            >
              <Trash2 size={12} />
              <span>Delete All</span>
            </button>
          </div>
        </div>
      )}

      {/* Content Area: Master-Detail Layout */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            background: '#030304',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {isAdmin ? (
            <BookOpen size={36} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
          ) : (
            <FileText size={36} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
          )}
          <h3 style={{ fontSize: 16, color: '#f8fafc', marginBottom: 6 }}>No Documents Found</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 440, margin: '0 auto' }}>
            {isAdmin
              ? 'Upload company policies, SOPs, and official manuals above to establish the permanent organization knowledge base.'
              : 'Upload documents above to analyze and ask questions using AI.'}
          </p>
        </div>
      ) : (
        <div className="documents-layout">
          {/* Document List */}
          <div className="documents-list">
            {documents.map((doc) => {
              const { Icon, color } = getDocIcon(doc.file_type);
              const isSelected = selectedDoc?.filename === doc.filename;
              const isChecked = selectedFilenames.has(doc.filename);
              const isArchived = doc.status === 'Archived';

              return (
                <div
                  key={doc.filename}
                  className={`doc-card ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedDoc(doc)}
                  style={{
                    opacity: isArchived ? 0.7 : 1,
                    borderColor: isSelected
                      ? 'var(--accent)'
                      : isChecked
                      ? 'rgba(99, 102, 241, 0.4)'
                      : undefined,
                    background: isChecked ? 'rgba(99, 102, 241, 0.05)' : undefined,
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                    {/* Checkbox to select any document */}
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => toggleSelectDoc(doc.filename, e)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        cursor: 'pointer',
                        accentColor: 'var(--accent)',
                        width: 16,
                        height: 16,
                        flexShrink: 0,
                      }}
                      title="Select document"
                    />

                    <div style={{ color, flexShrink: 0 }}>
                      <Icon size={24} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="doc-name" style={{ color: '#ffffff' }}>
                        {doc.original_filename || doc.filename}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 4,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: isArchived
                              ? 'rgba(234, 179, 8, 0.15)'
                              : 'rgba(34, 197, 94, 0.15)',
                            color: isArchived ? '#facc15' : '#4ade80',
                            border: `1px solid ${
                              isArchived ? 'rgba(234, 179, 8, 0.3)' : 'rgba(34, 197, 94, 0.3)'
                            }`,
                          }}
                        >
                          {doc.status || 'Indexed'}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {doc.chunk_count || doc.chunks || 1} chunks
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          • {formatSize(doc.file_size)}
                        </span>
                      </div>
                    </div>

                    {/* Direct Quick Delete button for ANY document */}
                    <button
                      className="btn-icon"
                      onClick={(e) => handleDeleteSingle(doc, e)}
                      title="Delete this document"
                      style={{
                        color: 'var(--text-tertiary)',
                        padding: 6,
                        borderRadius: 'var(--radius-sm)',
                        flexShrink: 0,
                        marginLeft: 'auto',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--danger)';
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-tertiary)';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Document Inspector */}
          {selectedDoc && (
            <div
              className="doc-detail-pane"
              style={{
                background: '#050505',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 'var(--radius-lg)',
                padding: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <h2
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: '#f8fafc',
                      margin: 0,
                      textShadow: '0 0 8px rgba(255,255,255,0.2)',
                    }}
                  >
                    {selectedDoc.original_filename || selectedDoc.filename}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 4,
                        background:
                          selectedDoc.status === 'Archived'
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(34, 197, 94, 0.15)',
                        color: selectedDoc.status === 'Archived' ? '#facc15' : '#4ade80',
                        border: `1px solid ${
                          selectedDoc.status === 'Archived'
                            ? 'rgba(234, 179, 8, 0.3)'
                            : 'rgba(34, 197, 94, 0.3)'
                        }`,
                      }}
                    >
                      Status: {selectedDoc.status || 'Indexed'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Access: {selectedDoc.access_scope || 'Authorized users'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metadata Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 12,
                  marginTop: 18,
                  padding: 14,
                  background: '#000000',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Uploaded By
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginTop: 2 }}>
                    {selectedDoc.uploaded_by_name || selectedDoc.owner_display_name || (isAdmin ? 'Administrator' : currentUser?.display_name)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Uploaded Date
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginTop: 2 }}>
                    {formatDate(selectedDoc.created_at)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Size
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginTop: 2 }}>
                    {formatSize(selectedDoc.file_size)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Indexed Chunks
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 2 }}>
                    {selectedDoc.chunk_count || selectedDoc.chunks || 1} chunks
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleAskInChat(selectedDoc)}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <MessageSquare size={15} />
                  <span>Query in Chat</span>
                </button>

                {isAdmin && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleReindex(selectedDoc)}
                      disabled={reindexing}
                      title="Re-extract and update vector embeddings"
                    >
                      <RotateCcw size={14} className={reindexing ? 'spin' : ''} />
                      <span>{reindexing ? 'Re-indexing...' : 'Re-index'}</span>
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={() => handleToggleArchive(selectedDoc)}
                      title={selectedDoc.status === 'Archived' ? 'Restore to active' : 'Archive document'}
                    >
                      <Archive size={14} />
                      <span>{selectedDoc.status === 'Archived' ? 'Unarchive' : 'Archive'}</span>
                    </button>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleDownload(selectedDoc)}
                    title="Download file to computer"
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={(e) => handleDeleteSingle(selectedDoc, e)}
                    title="Permanently remove document"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
