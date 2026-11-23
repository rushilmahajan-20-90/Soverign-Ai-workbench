import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../services/api.js';
import { RefreshCw, Sliders, Sparkles, Check, Cpu } from 'lucide-react';

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

  // Model & Temperature settings
  const [temperature, setTemperature] = useState(() => {
    const saved = localStorage.getItem('vertex_temperature');
    return saved !== null ? parseFloat(saved) : 0.70;
  });
  const [savingTemp, setSavingTemp] = useState(false);
  const [savedTemp, setSavedTemp] = useState(false);

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
    // Load persisted temperature setting from backend
    api.getModelSettings()
      .then((data) => {
        if (data && typeof data.default_temperature === 'number') {
          setTemperature(data.default_temperature);
          localStorage.setItem('vertex_temperature', data.default_temperature.toString());
        }
      })
      .catch((err) => {
        console.warn('Could not fetch server model settings:', err);
      });
  }, []);

  const handleSaveTemperature = async (tempValue = temperature) => {
    const val = typeof tempValue === 'number' ? tempValue : temperature;
    setSavingTemp(true);
    try {
      localStorage.setItem('vertex_temperature', val.toString());
      await api.updateModelSettings({ default_temperature: val });
      setSavedTemp(true);
      setTimeout(() => setSavedTemp(false), 2000);
      addToast(`Temperature setting updated to ${val.toFixed(2)}`, 'success');
    } catch (err) {
      localStorage.setItem('vertex_temperature', val.toString());
      setSavedTemp(true);
      setTimeout(() => setSavedTemp(false), 2000);
      addToast(`Temperature saved locally (${val.toFixed(2)})`, 'info');
    } finally {
      setSavingTemp(false);
    }
  };

  const getTemperatureBadge = (val) => {
    if (val < 0.35) {
      return {
        label: '🎯 Precise & Deterministic',
        desc: 'Ideal for code, document Q&A, structured data extraction, and strict factual answers.',
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.1)',
        border: 'rgba(56, 189, 248, 0.3)',
      };
    }
    if (val <= 0.8) {
      return {
        label: '⚖️ Balanced & Coherent',
        desc: 'Recommended default. Strong reasoning, factual grounding, and natural conversational flow.',
        color: '#818cf8',
        bg: 'rgba(129, 140, 248, 0.1)',
        border: 'rgba(129, 140, 248, 0.3)',
      };
    }
    return {
      label: '💡 Creative & Exploratory',
      desc: 'Higher novelty and variance. Great for open brainstorming, creative writing, and ideation.',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.3)',
    };
  };

  const tempBadge = getTemperatureBadge(temperature);

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

      {/* AI Model & Inference Parameters */}
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
            }}>
              <Sliders size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>AI Model & Inference Settings</h2>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Configure generation temperature and creative flexibility for Qwen 3.5:4B.
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => handleSaveTemperature(temperature)}
            disabled={savingTemp}
            style={{ minWidth: 100 }}
          >
            {savedTemp ? (
              <>
                <Check size={14} style={{ color: '#22c55e' }} />
                Saved
              </>
            ) : savingTemp ? (
              'Saving...'
            ) : (
              'Save Setting'
            )}
          </button>
        </div>

        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}>
          {/* Active Model info */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={16} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Active LLM Architecture</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#818cf8',
                background: 'rgba(99, 102, 241, 0.12)',
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid rgba(99, 102, 241, 0.25)',
              }}>
                Qwen 3.5:4B (Ollama Local)
              </span>
            </div>
          </div>

          {/* Temperature Slider */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Temperature</span>
                <span style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: 'var(--accent)',
                  background: 'rgba(99, 102, 241, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}>
                  {temperature.toFixed(2)}
                </span>
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: tempBadge.color,
                background: tempBadge.bg,
                border: `1px solid ${tempBadge.border}`,
                padding: '3px 8px',
                borderRadius: 4,
              }}>
                {tempBadge.label}
              </span>
            </div>

            <input
              type="range"
              min="0.0"
              max="1.5"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              style={{
                width: '100%',
                cursor: 'pointer',
                accentColor: 'var(--accent)',
                height: 6,
                borderRadius: 3,
                marginBottom: 8,
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>
              <span>0.0 (Deterministic / Exact)</span>
              <span>0.7 (Standard / Balanced)</span>
              <span>1.5 (Maximum Exploration)</span>
            </div>

            {/* Presets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 4 }}>Presets:</span>
              <button
                type="button"
                className={`btn btn-sm ${temperature === 0.20 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setTemperature(0.20);
                  handleSaveTemperature(0.20);
                }}
              >
                🎯 Precise (0.20)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${temperature === 0.70 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setTemperature(0.70);
                  handleSaveTemperature(0.70);
                }}
              >
                ⚖️ Balanced (0.70)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${temperature === 1.00 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setTemperature(1.00);
                  handleSaveTemperature(1.00);
                }}
              >
                💡 Creative (1.00)
              </button>
            </div>

            {/* Explainer Box */}
            <div style={{
              marginTop: 14,
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--border-primary)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}>
              <strong style={{ color: tempBadge.color }}>{tempBadge.label}: </strong>
              {tempBadge.desc}
            </div>
          </div>
        </div>
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

