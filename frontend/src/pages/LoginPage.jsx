import { useState } from 'react';
import { useUser } from '../context/UserContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../services/api.js';
import { Lock, User, Eye, EyeOff, Shield, ShieldCheck, ArrowRight, Building, KeyRound, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const { loginUser, workspaceInfo } = useUser();
  const { addToast } = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    if (!username.trim()) {
      setErrorMessage('Please enter your username or corporate email.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login(username.trim(), password);
      if (res && res.token && res.user) {
        addToast(`Authenticated as ${res.user.display_name} (${res.user.role})`, 'success');
        loginUser(res.token, res.user);
      } else {
        throw new Error('Authentication response was invalid.');
      }
    } catch (err) {
      const msg = err.message || 'Authentication failed. Please verify your credentials.';
      setErrorMessage(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (u, p) => {
    setUsername(u);
    setPassword(p);
    setErrorMessage('');
  };

  return (
    <div className="login-page" style={{ background: '#000000', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="login-container" style={{
        maxWidth: 460,
        width: '100%',
        margin: '0 auto',
        padding: '38px 34px',
        background: '#040405',
        borderRadius: 18,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 30px 80px rgba(0, 0, 0, 0.95), 0 0 40px rgba(129, 140, 248, 0.06)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #1e1e24 0%, #0a0a0f 100%)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 30px rgba(99, 102, 241, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#ffffff', letterSpacing: -1, textShadow: '0 0 15px rgba(255, 255, 255, 0.8), 0 0 25px rgba(129, 140, 248, 0.6)' }}>V</span>
          </div>
          <h1 style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '0.22em',
            color: '#ffffff',
            margin: '0 0 8px 0',
            textShadow: '0 0 20px rgba(255, 255, 255, 0.45), 0 0 40px rgba(129, 140, 248, 0.25)',
          }}>
            VERTEX
          </h1>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.6)' }}>
            <Building size={12} style={{ color: '#818cf8' }} />
            <span>{workspaceInfo?.org_name || 'Vertex Enterprise'}</span>
            <span style={{ opacity: 0.3 }}>•</span>
            <span style={{ color: '#38bdf8' }}>{workspaceInfo?.workspace_domain || 'vertex.local'}</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 20,
            fontSize: 13,
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <Lock size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.85)', marginBottom: 6, textShadow: '0 0 10px rgba(255, 255, 255, 0.1)' }}>
              Username or Email
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: 14, top: 12, color: 'rgba(255, 255, 255, 0.4)' }} />
              <input
                type="text"
                className="form-input"
                style={{
                  width: '100%',
                  padding: '11px 14px 11px 40px',
                  background: '#070709',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 10,
                  color: '#f4f4f6',
                  fontSize: 14,
                  outline: 'none',
                  boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.6)',
                }}
                placeholder="e.g. admin or alex"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.85)', textShadow: '0 0 10px rgba(255, 255, 255, 0.1)' }}>
                Password
              </label>
            </div>
            <div style={{ position: 'relative' }}>
              <KeyRound size={16} style={{ position: 'absolute', left: 14, top: 12, color: 'rgba(255, 255, 255, 0.4)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                style={{
                  width: '100%',
                  padding: '11px 42px 11px 40px',
                  background: '#070709',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 10,
                  color: '#f4f4f6',
                  fontSize: 14,
                  outline: 'none',
                  boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.6)',
                }}
                placeholder="Enter account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 10,
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.45)',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 6px 20px rgba(79, 70, 229, 0.35)',
              opacity: loading ? 0.7 : 1,
              textShadow: '0 0 12px rgba(255, 255, 255, 0.4)',
            }}
          >
            {loading ? (
              <span>Verifying Credentials...</span>
            ) : (
              <>
                <span>Sign In to Workspace</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Quick Enterprise Demo Logins */}
        <div style={{ marginTop: 26, paddingTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: 12, textAlign: 'center' }}>
            Enterprise Test Accounts
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              type="button"
              onClick={() => handleQuickFill('admin', 'admin123')}
              style={{
                background: '#070709',
                border: '1px solid rgba(129, 140, 248, 0.25)',
                borderRadius: 10,
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#a5b4fc', textShadow: '0 0 10px rgba(129, 140, 248, 0.4)' }}>
                <Shield size={13} />
                <span>Administrator</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', marginTop: 2 }}>
                admin / admin123
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('alex', 'alex123')}
              style={{
                background: '#070709',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: 10,
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#4ade80', textShadow: '0 0 10px rgba(34, 197, 94, 0.4)' }}>
                <User size={13} />
                <span>Member</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', marginTop: 2 }}>
                alex / alex123
              </div>
            </button>
          </div>
        </div>

        {/* Security badge footer */}
        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ShieldCheck size={14} style={{ color: '#22c55e' }} />
          <span>Local PostgreSQL Authentication & Role Authorization</span>
        </div>
      </div>
    </div>
  );
}
