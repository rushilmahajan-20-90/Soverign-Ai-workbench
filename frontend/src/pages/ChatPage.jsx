import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '../context/UserContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../services/api.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Paperclip,
  Copy,
  Check,
  MessageSquare,
  Upload,
  FileText,
  Shield,
  RotateCcw,
  X,
  Image as ImageIcon,
  Download,
  Trash2,
  FileDown,
  Sliders,
  Thermometer,
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

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function extractSources(text) {
  const sourceRegex = /\[(?:Source|Result \d+)\]?\s*(?:Source:\s*)?([^\n,]+?)(?:,\s*Page:\s*(\d+))?\s*\n/gi;
  const sources = [];
  let match;
  while ((match = sourceRegex.exec(text)) !== null) {
    const source = match[1]?.trim();
    const page = match[2]?.trim();
    if (source && source !== 'unknown') {
      const filename = source.split(/[/\\]/).pop();
      sources.push({ filename, page, raw: match[0] });
    }
  }
  return sources;
}

function MessageContent({ content, role }) {
  if (role === 'user') {
    return <>{content}</>;
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          if (inline) {
            return <code {...props}>{children}</code>;
          }
          return (
            <pre>
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function SourceCards({ sources }) {
  if (!sources || sources.length === 0) return null;
  const unique = [...new Map(sources.map((s) => [`${s.filename}:${s.page}`, s])).values()];

  return (
    <div className="source-cards">
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
        Sources
      </div>
      {unique.map((s, i) => (
        <div key={i} className="source-card">
          <FileText size={14} />
          <span>
            {s.filename}
            {s.page && ` — Page ${s.page}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function extractGeneratedFiles(text) {
  if (!text || typeof text !== 'string') return [];
  const files = new Set();

  // Pattern 1: explicit generated paths, e.g. data/documents/generated/file.docx
  const pathRegex = /(?:data[/\\]documents[/\\]generated[/\\])([a-zA-Z0-9_\-\.\s]+\.(?:docx|pdf|xlsx|csv|txt))/gi;
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    if (match[1]) files.add(match[1].trim());
  }

  // Pattern 2: quoted or backtick-enclosed generated filenames, e.g. `report.docx`, "project.pdf"
  const quotedRegex = /[`"']([a-zA-Z0-9_\-]+\.(?:docx|pdf|xlsx|csv))[`"']/gi;
  while ((match = quotedRegex.exec(text)) !== null) {
    if (match[1]) files.add(match[1].trim());
  }

  // Pattern 3: words after saved/created/generated
  const keywordRegex = /(?:saved|created|generated|download|file:?)\s+[:\s]*([a-zA-Z0-9_\-]+\.(?:docx|pdf|xlsx|csv))/gi;
  while ((match = keywordRegex.exec(text)) !== null) {
    if (match[1]) files.add(match[1].trim());
  }

  return Array.from(files);
}

function GeneratedFileCards({ files }) {
  const { addToast } = useToast();
  if (!files || files.length === 0) return null;

  const handleDownload = async (filename) => {
    try {
      addToast(`Downloading ${filename}...`, 'info');
      await api.downloadFile(filename);
      addToast(`Downloaded ${filename}`, 'success');
    } catch (err) {
      addToast(`Download failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="generated-files-container">
      <div className="generated-files-header">
        <FileDown size={14} />
        <span>Generated Documents Ready to Download</span>
      </div>
      <div className="generated-files-list">
        {files.map((file, idx) => {
          const ext = file.split('.').pop().toLowerCase();
          return (
            <div key={idx} className="generated-file-card">
              <div className="generated-file-icon">
                {ext === 'docx' ? <FileText size={20} color="#3b82f6" /> : ext === 'pdf' ? <FileText size={20} color="#ef4444" /> : <FileDown size={20} color="#10b981" />}
              </div>
              <div className="generated-file-details">
                <div className="generated-file-name">{file}</div>
                <div className="generated-file-meta">
                  {ext.toUpperCase()} Document • Stored in Sovereign Workspace
                </div>
              </div>
              <button
                type="button"
                className="btn-download-file"
                onClick={() => handleDownload(file)}
                title={`Download ${file}`}
              >
                <Download size={14} />
                <span>Download File</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ChatPage({
  activeConversationId,
  setActiveConversationId,
  refreshConversations,
  initialPrompt,
  clearInitialPrompt,
}) {
  const { currentUser, isAdmin } = useUser();
  const { addToast } = useToast();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragOverChat, setDragOverChat] = useState(false);
  const [temperature, setTemperature] = useState(() => {
    const saved = localStorage.getItem('vertex_temperature');
    return saved !== null ? parseFloat(saved) : 0.70;
  });
  const [showTempPopover, setShowTempPopover] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleTempChange = (newVal) => {
    const val = parseFloat(newVal);
    setTemperature(val);
    localStorage.setItem('vertex_temperature', val.toString());
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Set initial prompt from external navigation
  useEffect(() => {
    if (initialPrompt) {
      setInputValue(initialPrompt);
      clearInitialPrompt?.();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
          textareaRef.current.focus();
        }
      }, 50);
    }
  }, [initialPrompt, clearInitialPrompt]);

  // Load conversation messages
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    const load = async () => {
      try {
        const data = await api.getConversation(activeConversationId);
        setMessages(data.messages || []);
        scrollToBottom();
      } catch (err) {
        addToast('Failed to load conversation', 'error');
        console.error(err);
      }
    };
    load();
  }, [activeConversationId, scrollToBottom, addToast]);

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  };

  const handleSend = async () => {
    const msg = inputValue.trim();
    if (!msg || sending) return;

    const currentAttachment = attachedFile ? { ...attachedFile } : null;

    // Optimistic UI: add user message immediately
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: msg,
      attachment: currentAttachment,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInputValue('');
    setAttachedFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setSending(true);
    scrollToBottom();

    try {
      const result = await api.sendMessage(msg, activeConversationId, null, temperature);

      // If new conversation was created, update the active ID
      if (result.created_new || !activeConversationId) {
        setActiveConversationId(result.conversation_id);
      }

      // Add assistant response
      const assistantMsg = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      refreshConversations();
      scrollToBottom();
    } catch (err) {
      addToast(err.message || 'Failed to send message', 'error');
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleRegenerate = async (msgIndex) => {
    if (sending) return;
    let userMsg = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMsg = messages[i];
        break;
      }
    }
    if (!userMsg) return;

    setSending(true);
    scrollToBottom();
    try {
      const result = await api.sendMessage(userMsg.content, activeConversationId, null, temperature);
      const assistantMsg = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev];
        next[msgIndex] = assistantMsg;
        return next;
      });
      refreshConversations();
      scrollToBottom();
    } catch (err) {
      addToast(err.message || 'Failed to regenerate response', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (content, msgId) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!isAdmin) {
      addToast('Document upload is restricted to Administrators only.', 'error');
      return;
    }

    const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      addToast('Supported formats: PDF, PNG, JPG, JPEG', 'error');
      return;
    }

    setUploadingFile(true);
    addToast(`Uploading temporary document ${file.name}...`, 'info');
    try {
      const result = await api.uploadChatDocument(file, activeConversationId);
      if (result.created_new || !activeConversationId) {
        setActiveConversationId(result.conversation_id);
        refreshConversations();
      }
      setAttachedFile({
        name: file.name,
        size: file.size,
        type: ext,
        chunks: result.chunks,
        pages: result.pages,
        file: result.file || file.name,
        document_id: result.document_id,
        is_temporary: true,
      });
      addToast(`Attached "${file.name}" to this conversation (${result.chunks} chunks indexed)`, 'success');
      if (!inputValue.trim()) {
        setInputValue(`Can you summarize "${file.name}" and outline its key points?`);
      }
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
          textareaRef.current.focus();
        }
      }, 50);
    } catch (err) {
      addToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  const handleRemoveWrongAttachedDocument = async () => {
    if (!attachedFile) return;
    const docName = attachedFile.file || attachedFile.name;
    try {
      await api.deleteDocument(docName);
      addToast(`Removed wrong document "${attachedFile.name}" from workspace`, 'success');
    } catch (err) {
      console.warn('Document delete error:', err);
      addToast(`Removed "${attachedFile.name}"`, 'info');
    } finally {
      setAttachedFile(null);
      if (inputValue.includes(attachedFile.name)) {
        setInputValue('');
      }
    }
  };

  const handleDeleteWrongMsgAttachment = async (attachment, msgIndex) => {
    if (!confirm(`Are you sure you want to remove and purge "${attachment.name}" from the workspace?`)) {
      return;
    }
    const docName = attachment.file || attachment.name;
    try {
      await api.deleteDocument(docName);
      setMessages((prev) => {
        const next = [...prev];
        if (next[msgIndex]) {
          next[msgIndex] = { ...next[msgIndex], attachment: null };
        }
        return next;
      });
      addToast(`Removed wrong document "${attachment.name}" from workspace`, 'success');
    } catch (err) {
      addToast(`Failed to remove document: ${err.message}`, 'error');
    }
  };

  const initials = (currentUser?.display_name || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Empty state
  if (!activeConversationId && messages.length === 0) {
    return (
      <div
        className="chat-container"
        style={{ position: 'relative' }}
        onDragOver={(e) => {
          if (!isAdmin) return;
          e.preventDefault();
          setDragOverChat(true);
        }}
        onDragLeave={(e) => {
          if (!isAdmin) return;
          if (!e.currentTarget.contains(e.relatedTarget)) setDragOverChat(false);
        }}
        onDrop={(e) => {
          if (!isAdmin) return;
          e.preventDefault();
          setDragOverChat(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFileUpload(file);
        }}
      >
        {isAdmin && dragOverChat && (
          <div className="chat-drag-overlay">
            <Upload size={44} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>Drop to Attach to Chat</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Temporary document for this conversation. Will be removed with conversation lifecycle.
            </p>
          </div>
        )}

        <div className="chat-empty">
          <div className="chat-empty-icon">
            <Shield size={28} />
          </div>
          <h2>Welcome to Sovereign AI</h2>
          <p>
            Your private, local AI workspace. Chat with Qwen LLM, query approved company knowledge,
            and execute autonomous research workflows.
          </p>
          <div className="chat-empty-actions">
            <button className="btn btn-primary" onClick={() => textareaRef.current?.focus()}>
              <MessageSquare size={16} />
              Start a conversation
            </button>
            {isAdmin && (
              <button className="btn btn-secondary" onClick={handleAttach} title="Upload temporary document for this chat">
                <Paperclip size={16} />
                Attach to Chat
              </button>
            )}
          </div>
          {isAdmin && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 440, lineHeight: 1.4 }}>
              💡 <em>Upload a document for use in this conversation. Temporary files are removed according to the conversation lifecycle and never added to the permanent company knowledge base.</em>
            </div>
          )}
        </div>
        <div className="chat-input-container">
          <div className="chat-input-inner">
            <div className="chat-input-box">
              {uploadingFile && (
                <div className="chat-attachment-pill uploading">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Upload size={14} />
                    <span>Processing and indexing temporary chat document...</span>
                  </div>
                </div>
              )}
              {attachedFile && !uploadingFile && (
                <div className="chat-attachment-pill">
                  <div className="chat-attachment-badge">
                    <div className="chat-attachment-icon">
                      {attachedFile.type === '.pdf' ? <FileText size={16} /> : <ImageIcon size={16} />}
                    </div>
                    <div className="chat-attachment-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="chat-attachment-title">{attachedFile.name}</span>
                        <span className="chat-temp-badge">Temporary Chat Doc</span>
                      </div>
                      <span className="chat-attachment-sub">{formatSize(attachedFile.size)} • {attachedFile.chunks || 1} chunks • Session only</span>
                    </div>
                  </div>
                  <div className="chat-attachment-actions">
                    <button
                      type="button"
                      className="chat-attachment-action-btn danger"
                      onClick={handleRemoveWrongAttachedDocument}
                      title="Remove wrong document from workspace"
                    >
                      <Trash2 size={13} />
                      <span>Remove wrong doc</span>
                    </button>
                    <button
                      type="button"
                      className="chat-attachment-close"
                      onClick={() => setAttachedFile(null)}
                      title="Detach"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
              <div className="chat-input-row">
                {isAdmin && (
                  <button
                    className="chat-input-btn"
                    onClick={handleAttach}
                    title="📎 Attach to Chat (Upload document for this conversation only. Temporary files are removed with conversation lifecycle)"
                  >
                    <Paperclip size={20} />
                  </button>
                )}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="chat-input-btn"
                    onClick={() => setShowTempPopover(!showTempPopover)}
                    title={`Temperature: ${temperature.toFixed(2)} (${temperature < 0.35 ? 'Precise' : temperature <= 0.8 ? 'Balanced' : 'Creative'})`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '0 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: temperature < 0.35 ? '#38bdf8' : temperature <= 0.8 ? '#818cf8' : '#f59e0b',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 6,
                      height: 32,
                      cursor: 'pointer',
                    }}
                  >
                    <Sliders size={13} />
                    <span>{temperature.toFixed(2)}</span>
                  </button>
                  {showTempPopover && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        marginBottom: 8,
                        width: 230,
                        background: '#0d0d12',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 8,
                        padding: 12,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                        zIndex: 100,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Temperature</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>
                          {temperature.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.5"
                        step="0.05"
                        value={temperature}
                        onChange={(e) => handleTempChange(e.target.value)}
                        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)', height: 4, marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
                        <button
                          type="button"
                          style={{
                            fontSize: 10,
                            padding: '3px 6px',
                            background: temperature === 0.2 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: temperature === 0.2 ? '#38bdf8' : '#cbd5e1',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                          onClick={() => handleTempChange(0.20)}
                        >
                          🎯 0.20
                        </button>
                        <button
                          type="button"
                          style={{
                            fontSize: 10,
                            padding: '3px 6px',
                            background: temperature === 0.7 ? 'rgba(129, 140, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: temperature === 0.7 ? '#818cf8' : '#cbd5e1',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                          onClick={() => handleTempChange(0.70)}
                        >
                          ⚖️ 0.70
                        </button>
                        <button
                          type="button"
                          style={{
                            fontSize: 10,
                            padding: '3px 6px',
                            background: temperature === 1.0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: temperature === 1.0 ? '#f59e0b' : '#cbd5e1',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                          onClick={() => handleTempChange(1.00)}
                        >
                          💡 1.00
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <textarea
                  ref={textareaRef}
                  className="chat-textarea"
                  placeholder="Ask Sovereign AI..."
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className="chat-input-btn send"
                  onClick={handleSend}
                  disabled={!inputValue.trim() || sending}
                  title="Send message"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>
    );
  }

  return (
    <div
      className="chat-container"
      style={{ position: 'relative' }}
      onDragOver={(e) => {
        if (!isAdmin) return;
        e.preventDefault();
        setDragOverChat(true);
      }}
      onDragLeave={(e) => {
        if (!isAdmin) return;
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOverChat(false);
      }}
      onDrop={(e) => {
        if (!isAdmin) return;
        e.preventDefault();
        setDragOverChat(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileUpload(file);
      }}
    >
      {isAdmin && dragOverChat && (
        <div className="chat-drag-overlay">
          <Upload size={44} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Drop document to analyze</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>PDF, PNG, JPG, or JPEG will be processed and indexed</p>
        </div>
      )}

      <div className="chat-messages">
        <div className="chat-messages-inner">
          {messages.map((msg, index) => {
            const sources = msg.role === 'assistant' ? extractSources(msg.content) : [];
            const generatedFiles = msg.role === 'assistant' ? extractGeneratedFiles(msg.content) : [];
            const isLastAssistant = msg.role === 'assistant' && (index === messages.length - 1 || (index === messages.length - 2 && messages[messages.length - 1].role === 'user'));
            return (
              <div key={msg.id} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? (
                    <div
                      className="avatar sm"
                      style={{ background: currentUser?.avatar_color || '#6366f1' }}
                    >
                      {initials}
                    </div>
                  ) : (
                    <div className="avatar sm" style={{ background: '#6366f1' }}>
                      S
                    </div>
                  )}
                </div>
                <div className="message-body">
                  <div className="message-header">
                    <span className="message-sender">
                      {msg.role === 'user' ? currentUser?.display_name : 'Sovereign AI'}
                    </span>
                    <span className="message-time">{formatTime(msg.created_at)}</span>
                  </div>
                  {msg.attachment && (
                    <div className="user-msg-attachment">
                      <div className="user-msg-attachment-icon">
                        {msg.attachment.type === '.pdf' ? <FileText size={18} /> : <ImageIcon size={18} />}
                      </div>
                      <div className="user-msg-attachment-details">
                        <div className="user-msg-attachment-name">{msg.attachment.name}</div>
                        <div className="user-msg-attachment-meta">
                          {formatSize(msg.attachment.size)} • {msg.attachment.chunks || 1} chunks OCR indexed
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-delete-wrong-doc"
                        onClick={() => handleDeleteWrongMsgAttachment(msg.attachment, index)}
                        title="Remove wrong document from workspace"
                      >
                        <Trash2 size={13} />
                        <span>Remove wrong doc</span>
                      </button>
                    </div>
                  )}
                  <div className="message-content">
                    <MessageContent content={msg.content} role={msg.role} />
                  </div>
                  {generatedFiles.length > 0 && <GeneratedFileCards files={generatedFiles} />}
                  {sources.length > 0 && <SourceCards sources={sources} />}
                  {msg.role === 'assistant' && (
                    <div className="message-actions">
                      <button
                        className="msg-action-btn"
                        onClick={() => handleCopy(msg.content, msg.id)}
                        title="Copy to clipboard"
                      >
                        {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedId === msg.id ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        className="msg-action-btn"
                        onClick={() => handleRegenerate(index)}
                        disabled={sending}
                        title="Regenerate this response"
                      >
                        <RotateCcw size={14} />
                        Regenerate
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="message assistant">
              <div className="message-avatar">
                <div className="avatar sm" style={{ background: '#6366f1' }}>S</div>
              </div>
              <div className="message-body">
                <div className="thinking-indicator">
                  <div className="thinking-dots">
                    <div className="thinking-dot" />
                    <div className="thinking-dot" />
                    <div className="thinking-dot" />
                  </div>
                  <span className="thinking-text">Thinking with Qwen...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="chat-input-container">
        <div className="chat-input-inner">
          <div className="chat-input-box">
            {uploadingFile && (
              <div className="chat-attachment-pill uploading">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Upload size={14} />
                  <span>Processing and indexing document with OCR...</span>
                </div>
              </div>
            )}
            {attachedFile && !uploadingFile && (
              <div className="chat-attachment-pill">
                <div className="chat-attachment-badge">
                  <div className="chat-attachment-icon">
                    {attachedFile.type === '.pdf' ? <FileText size={16} /> : <ImageIcon size={16} />}
                  </div>
                  <div className="chat-attachment-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="chat-attachment-title">{attachedFile.name}</span>
                      <span className="chat-temp-badge">Temporary Chat Doc</span>
                    </div>
                    <span className="chat-attachment-sub">{formatSize(attachedFile.size)} • {attachedFile.chunks || 1} chunks • Session only</span>
                  </div>
                </div>
                <div className="chat-attachment-actions">
                  <button
                    type="button"
                    className="chat-attachment-action-btn danger"
                    onClick={handleRemoveWrongAttachedDocument}
                    title="Remove wrong document from workspace"
                  >
                    <Trash2 size={13} />
                    <span>Remove wrong doc</span>
                  </button>
                  <button
                    type="button"
                    className="chat-attachment-close"
                    onClick={() => setAttachedFile(null)}
                    title="Detach"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
            <div className="chat-input-row">
              {isAdmin && (
                <button
                  className="chat-input-btn"
                  onClick={handleAttach}
                  title="📎 Attach to Chat (Upload document for this conversation only. Temporary files are removed with conversation lifecycle)"
                >
                  <Paperclip size={20} />
                </button>
              )}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <button
                  type="button"
                  className="chat-input-btn"
                  onClick={() => setShowTempPopover(!showTempPopover)}
                  title={`Temperature: ${temperature.toFixed(2)} (${temperature < 0.35 ? 'Precise' : temperature <= 0.8 ? 'Balanced' : 'Creative'})`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '0 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: temperature < 0.35 ? '#38bdf8' : temperature <= 0.8 ? '#818cf8' : '#f59e0b',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    height: 32,
                    cursor: 'pointer',
                  }}
                >
                  <Sliders size={13} />
                  <span>{temperature.toFixed(2)}</span>
                </button>
                {showTempPopover && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      marginBottom: 8,
                      width: 230,
                      background: '#0d0d12',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 8,
                      padding: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                      zIndex: 100,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Temperature</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>
                        {temperature.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.5"
                      step="0.05"
                      value={temperature}
                      onChange={(e) => handleTempChange(e.target.value)}
                      style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)', height: 4, marginBottom: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
                      <button
                        type="button"
                        style={{
                          fontSize: 10,
                          padding: '3px 6px',
                          background: temperature === 0.2 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: temperature === 0.2 ? '#38bdf8' : '#cbd5e1',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleTempChange(0.20)}
                      >
                        🎯 0.20
                      </button>
                      <button
                        type="button"
                        style={{
                          fontSize: 10,
                          padding: '3px 6px',
                          background: temperature === 0.7 ? 'rgba(129, 140, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: temperature === 0.7 ? '#818cf8' : '#cbd5e1',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleTempChange(0.70)}
                      >
                        ⚖️ 0.70
                      </button>
                      <button
                        type="button"
                        style={{
                          fontSize: 10,
                          padding: '3px 6px',
                          background: temperature === 1.0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: temperature === 1.0 ? '#f59e0b' : '#cbd5e1',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleTempChange(1.00)}
                      >
                        💡 1.00
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                placeholder="Ask Sovereign AI..."
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                className="chat-input-btn send"
                onClick={handleSend}
                disabled={!inputValue.trim() || sending}
                title="Send message"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  );
}
