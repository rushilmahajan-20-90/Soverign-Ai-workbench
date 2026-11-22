import { useState, useRef, useEffect } from 'react';
import { useUser } from '../context/UserContext.jsx';
import { Menu, Settings, Lock, Shield } from 'lucide-react';

const PAGE_TITLES = {
  chat: 'Chat',
  documents: 'Documents',
  history: 'History',
  workspace: 'Workspace',
  settings: 'Settings',
  profile: 'Profile',
  admin: 'Admin Console',
};

export default function TopBar({ toggleSidebar, currentPage, setPage }) {
  const { currentUser, logoutUser, isAdmin, workspaceInfo } = useUser();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const initials = (currentUser?.display_name || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="topbar-toggle" onClick={toggleSidebar} title="Toggle sidebar">
          <Menu size={20} />
        </button>
        <span className="topbar-title">{PAGE_TITLES[currentPage] || 'Sovereign AI'}</span>
      </div>

      <div className="topbar-center" />

      <div className="topbar-right">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-secondary)',
            background: 'var(--bg-secondary)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
            {workspaceInfo?.org_name || 'Vertex'}
          </span>
          <span style={{ color: 'var(--border-secondary)' }}>•</span>
          <span
            className={`admin-role-badge ${isAdmin ? 'admin' : 'member'}`}
            style={{ fontSize: 10, padding: '1px 6px' }}
          >
            {isAdmin ? 'Administrator' : 'Member'}
          </span>
        </div>

        <div className="local-badge">
          <Lock size={10} />
          LOCAL • OFFLINE
        </div>

        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            className="topbar-profile-btn"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <div
              className="avatar"
              style={{ background: currentUser?.avatar_color || '#6366f1' }}
            >
              {initials}
            </div>
            <span className="topbar-username">{currentUser?.display_name}</span>
          </button>

          {showDropdown && (
            <div className="profile-dropdown">
              <div className="profile-dropdown-header">
                <div
                  className="avatar"
                  style={{ background: currentUser?.avatar_color || '#6366f1' }}
                >
                  {initials}
                </div>
                <div>
                  <div className="profile-dropdown-name">{currentUser?.display_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span
                      className={`admin-role-badge ${isAdmin ? 'admin' : 'member'}`}
                      style={{ fontSize: 9, padding: '1px 6px' }}
                    >
                      {isAdmin ? 'Administrator' : 'Member'}
                    </span>
                    <span className="profile-dropdown-sub" style={{ fontSize: 11 }}>
                      {workspaceInfo?.org_name || 'Vertex'}
                    </span>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <button
                  className="profile-dropdown-item"
                  onClick={() => {
                    setPage('admin');
                    setShowDropdown(false);
                  }}
                  style={{ color: 'var(--accent-primary)', fontWeight: 500 }}
                >
                  <Shield size={16} />
                  Admin Console
                </button>
              )}

              <button
                className="profile-dropdown-item"
                onClick={() => { setPage('profile'); setShowDropdown(false); }}
              >
                <Settings size={16} />
                Profile Settings
              </button>
              <button
                className="profile-dropdown-item"
                onClick={() => { setPage('settings'); setShowDropdown(false); }}
              >
                <Settings size={16} />
                App Settings
              </button>
              <button
                className="profile-dropdown-item danger"
                onClick={() => { logoutUser(); setShowDropdown(false); }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

