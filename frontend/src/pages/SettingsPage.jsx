import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../services/api.js';
import { RefreshCw } from 'lucide-react';

const STATUS_LABELS = {
  backend: 'Backend',
  database: 'Database',
  llm: 'LLM (Qwen)',
  rag: 'RAG Engine',
  ocr: 'OCR Pipeline',
  storage: 'Storage',
};

const STATUS_OK = ['running', 'connected', 'ready'];

function StatusDot({ value }) {
  const ok = STATUS_OK.includes(value);
  return <span className={`status-dot ${ok ? 'green' : 'red'}`} />;
}

function capitalise(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function SettingsPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await api.getSystemStatus();
      setStatus(data);
    } catch (err) {
      addToast('Failed to load system status', 'error');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
        <p>System configuration and status.</p>
      </div>

      {/* System Status */}
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>System Status</h2>
          <button className="btn btn-ghost" onClick={loadStatus} disabled={loading} title="Refresh">
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>

        {status ? (
          <div className="status-grid">
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <div key={key} className="status-row">
                <span className="status-label">{label}</span>
                <span className="status-value">
                  <StatusDot value={status[key]} />
                  {capitalise(status[key] || 'unknown')}
                </span>
              </div>
            ))}
          </div>
        ) : loading ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <p>Checking system status...</p>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <p>Could not reach backend. Is the server running?</p>
            <button className="btn btn-primary" onClick={loadStatus} style={{ marginTop: 8 }}>
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* About */}
      <div className="settings-section">
        <h2>About</h2>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div className="about-row">
            <span className="about-label">Application</span>
            <span className="about-value">Sovereign AI Workbench</span>
          </div>
          <div className="about-row">
            <span className="about-label">Type</span>
            <span className="about-value">Local / Offline / Private</span>
          </div>
          <div className="about-row">
            <span className="about-label">Backend</span>
            <span className="about-value">FastAPI + Uvicorn</span>
          </div>
          <div className="about-row">
            <span className="about-label">Database</span>
            <span className="about-value">PostgreSQL</span>
          </div>
          <div className="about-row">
            <span className="about-label">LLM</span>
            <span className="about-value">Qwen 3.5:4B (Ollama)</span>
          </div>
          <div className="about-row">
            <span className="about-label">Embeddings</span>
            <span className="about-value">all-MiniLM-L6-v2</span>
          </div>
          <div className="about-row">
            <span className="about-label">Vector Store</span>
            <span className="about-value">ChromaDB</span>
          </div>
          <div className="about-row">
            <span className="about-label">OCR</span>
            <span className="about-value">PaddleOCR (Docker Sandbox)</span>
          </div>
          <div className="about-row">
            <span className="about-label">Frontend</span>
            <span className="about-value">React + Vite</span>
          </div>
          <div className="about-row">
            <span className="about-label">Internet</span>
            <span className="about-value">Not Required</span>
          </div>
        </div>
      </div>

      {/* Privacy */}
      <div className="settings-section">
        <h2>Privacy</h2>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div className="about-row">
            <span className="about-label">Data Storage</span>
            <span className="about-value">Local Only</span>
          </div>
          <div className="about-row">
            <span className="about-label">Cloud Services</span>
            <span className="about-value">None</span>
          </div>
          <div className="about-row">
            <span className="about-label">Telemetry</span>
            <span className="about-value">Disabled</span>
          </div>
          <div className="about-row">
            <span className="about-label">Analytics</span>
            <span className="about-value">None</span>
          </div>
        </div>
      </div>
    </div>
  );
}

