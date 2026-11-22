import { useState } from 'react';
import { useUser } from '../context/UserContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../services/api.js';
import { Save, Trash2, LogOut } from 'lucide-react';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6'];

export default function ProfilePage() {
  const { currentUser, setCurrentUser, logoutUser, refreshUsers, isAdmin, workspaceInfo } = useUser();
  const { addToast } = useToast();
  const [displayName, setDisplayName] = useState(currentUser?.display_name || '');
  const [avatarColor, setAvatarColor] = useState(currentUser?.avatar_color || COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!currentUser) return null;

  const initials = (currentUser.display_name || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSave = async () => {
    if (!displayName.trim()) {
      addToast('Display name cannot be empty', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateUser(currentUser.id, {
        display_name: displayName.trim(),
        avatar_color: avatarColor,
      });
      setCurrentUser(updated);
      addToast('Profile updated', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteUser(currentUser.id);
      await refreshUsers();
      logoutUser();
      addToast('Profile deleted', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="profile-page">
      <div className="page-header">
        <h1>Profile</h1>
        <p>Manage your local user profile.</p>
      </div>

      {/* Profile card */}
      <div className="profile-card">
        <div className="avatar xl" style={{ background: avatarColor }}>
          {initials}
        </div>
        <h2>{currentUser.display_name}</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
          <span className={`admin-role-badge ${isAdmin ? 'admin' : 'member'}`} style={{ fontSize: 11, padding: '2px 8px' }}>
            {isAdmin ? 'Administrator' : 'Member'}
          </span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
            {workspaceInfo?.org_name || 'Vertex Enterprise'}
          </span>
        </div>
        <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          @{currentUser.username} • Local Account Status: {currentUser.is_active === false ? 'Deactivated' : 'Active'}
        </p>
      </div>

      {/* Edit form */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">Enterprise Role</label>
          <input
            className="form-input"
            value={currentUser.role || 'Member'}
            disabled
            style={{ opacity: 0.7, cursor: 'not-allowed' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'block' }}>
            Roles and permissions are governed by workspace Administrators via the Admin Console.
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">Display Name</label>
          <input
            className="form-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter display name"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Avatar Color</label>
          <div className="color-picker">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${avatarColor === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setAvatarColor(c)}
              />
            ))}
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={logoutUser}>
          <LogOut size={16} />
          Switch Profile
        </button>
        <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
          <Trash2 size={16} />
          Delete Profile
        </button>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Profile?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
              This will permanently delete your profile, all conversations, and chat history.
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ background: 'var(--error)' }} onClick={handleDelete}>
                Delete Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

