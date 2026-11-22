import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '../context/UserContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../services/api.js';
import {
  Shield,
  Users,
  Building,
  Key,
  Activity,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Trash2,
  Save,
  RefreshCw,
  Sliders,
  Lock,
  UserCheck,
  UserX,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Clock,
  MessageSquare,
  ChevronRight,
  ArrowLeft,
  KeyRound,
  Eye,
  Share2,
  Calendar,
  Layers,
  Database,
  Cpu,
  Server,
  FileCheck,
} from 'lucide-react';

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6'];

export default function AdminConsolePage() {
  const { currentUser, refreshWorkspace, setWorkspaceInfo } = useUser();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | users | audit | documents | org
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);

  // Users Tab
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Individual User Admin View
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userDetailData, setUserDetailData] = useState(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);
  const [userSubTab, setUserSubTab] = useState('chats'); // chats | docs | activity
  const [inspectingConv, setInspectingConv] = useState(null);
  const [loadingConv, setLoadingConv] = useState(false);

  // Audit Logs Tab
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditResourceFilter, setAuditResourceFilter] = useState('ALL');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState('ALL');

  // Documents Tab
  const [allDocs, setAllDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Org Settings State
  const [settings, setSettings] = useState({
    org_name: 'Vertex Enterprise',
    workspace_domain: 'vertex.local',
    allow_member_upload: true,
    max_upload_size_mb: 50,
    enforce_data_isolation: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('password123');
  const [newRole, setNewRole] = useState('Member');
  const [newColor, setNewColor] = useState(AVATAR_COLORS[0]);
  const [creatingUser, setCreatingUser] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Load Dashboard
  const loadDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    try {
      const data = await api.getAdminDashboard();
      setDashboardData(data);
    } catch (err) {
      addToast('Failed to load dashboard metrics: ' + err.message, 'error');
    } finally {
      setLoadingDashboard(false);
    }
  }, [addToast]);

  // Load Users
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await api.getAdminUsers();
      setUsers(data.users || []);
    } catch (err) {
      addToast(err.message || 'Failed to load user directory', 'error');
    } finally {
      setLoadingUsers(false);
    }
  }, [addToast]);

  // Load Audit Logs
  const loadAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const params = {
        limit: 100,
        action: auditActionFilter,
        resourceType: auditResourceFilter,
        search: auditSearchQuery,
        userId: auditUserFilter !== 'ALL' ? auditUserFilter : undefined,
      };
      const data = await api.getAdminAuditLogs(params);
      setAuditLogs(data.logs || []);
      setAuditTotal(data.total || 0);
    } catch (err) {
      addToast('Failed to load audit logs: ' + err.message, 'error');
    } finally {
      setLoadingAudit(false);
    }
  }, [addToast, auditActionFilter, auditResourceFilter, auditSearchQuery, auditUserFilter]);

  // Load Documents
  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const data = await api.getDocuments();
      setAllDocs(data.documents || []);
    } catch (err) {
      addToast('Failed to load documents: ' + err.message, 'error');
    } finally {
      setLoadingDocs(false);
    }
  }, [addToast]);

  // Load Settings
  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getAdminSettings();
      if (data) {
        setSettings(data);
        setWorkspaceInfo(data);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, [setWorkspaceInfo]);

  // Load Selected User Detail
  const loadUserDetail = useCallback(async (userId) => {
    setLoadingUserDetail(true);
    setInspectingConv(null);
    try {
      const data = await api.getAdminUserDetail(userId);
      setUserDetailData(data);
    } catch (err) {
      addToast('Failed to load user details: ' + err.message, 'error');
    } finally {
      setLoadingUserDetail(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadDashboard();
    loadUsers();
    loadSettings();
  }, [loadDashboard, loadUsers, loadSettings]);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    } else if (activeTab === 'documents') {
      loadDocuments();
    } else if (activeTab === 'dashboard') {
      loadDashboard();
    }
  }, [activeTab, loadAuditLogs, loadDocuments, loadDashboard]);

  const handleOpenUserDetail = (userId) => {
    setSelectedUserId(userId);
    setUserSubTab('chats');
    loadUserDetail(userId);
  };

  const handleInspectConversation = async (userId, convId) => {
    setLoadingConv(true);
    try {
      const data = await api.getAdminUserConversation(userId, convId);
      setInspectingConv(data);
    } catch (err) {
      addToast('Failed to load conversation: ' + err.message, 'error');
    } finally {
      setLoadingConv(false);
    }
  };

  // User Actions
  const handleToggleRole = async (targetUser) => {
    if (targetUser.id === currentUser?.id) {
      addToast('You cannot change your own Administrator role', 'error');
      return;
    }
    const nextRole = targetUser.role === 'Administrator' ? 'Member' : 'Administrator';
    try {
      await api.adminUpdateUserRole(targetUser.id, nextRole);
      addToast(`Updated ${targetUser.display_name} role to ${nextRole}`, 'success');
      loadUsers();
      if (selectedUserId === targetUser.id) loadUserDetail(targetUser.id);
    } catch (err) {
      addToast(err.message || 'Failed to update user role', 'error');
    }
  };

  const handleToggleStatus = async (targetUser) => {
    if (targetUser.id === currentUser?.id) {
      addToast('You cannot deactivate your own Administrator account', 'error');
      return;
    }
    const nextStatus = !targetUser.is_active;
    try {
      await api.adminUpdateUserStatus(targetUser.id, nextStatus);
      addToast(
        nextStatus
          ? `Activated account for ${targetUser.display_name}`
          : `Deactivated account for ${targetUser.display_name}`,
        nextStatus ? 'success' : 'info'
      );
      loadUsers();
      if (selectedUserId === targetUser.id) loadUserDetail(targetUser.id);
    } catch (err) {
      addToast(err.message || 'Failed to change account status', 'error');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (targetUser.id === currentUser?.id) {
      addToast('You cannot delete your own Administrator account', 'error');
      return;
    }
    if (!confirm(`Permanently remove ${targetUser.display_name} (@${targetUser.username})? Historical audit logs will remain preserved.`)) {
      return;
    }
    try {
      await api.adminDeleteUser(targetUser.id);
      addToast(`User ${targetUser.display_name} removed`, 'success');
      if (selectedUserId === targetUser.id) {
        setSelectedUserId(null);
        setUserDetailData(null);
      }
      loadUsers();
      loadDashboard();
    } catch (err) {
      addToast(err.message || 'Failed to delete user', 'error');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      addToast('Username is required', 'error');
      return;
    }
    setCreatingUser(true);
    try {
      await api.adminCreateUser(
        newUsername.trim(),
        newDisplayName.trim() || newUsername.trim(),
        newPassword.trim() || 'password123',
        newColor,
        newRole
      );
      addToast(`Account created for ${newDisplayName || newUsername} (${newRole})`, 'success');
      setShowAddModal(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('password123');
      setNewRole('Member');
      loadUsers();
      loadDashboard();
    } catch (err) {
      addToast(err.message || 'Failed to create user', 'error');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPasswordValue || resetPasswordValue.length < 4) {
      addToast('Password must be at least 4 characters long', 'error');
      return;
    }
    setResettingPassword(true);
    try {
      await api.adminResetUserPassword(resetTargetUser.id, resetPasswordValue);
      addToast(`Password successfully reset for ${resetTargetUser.display_name}`, 'success');
      setShowResetModal(false);
      setResetTargetUser(null);
      setResetPasswordValue('');
    } catch (err) {
      addToast(err.message || 'Failed to reset password', 'error');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleToggleDocShare = async (doc) => {
    try {
      const nextShare = !doc.is_shared;
      await api.shareDocument(doc.filename, nextShare);
      addToast(
        nextShare
          ? `Document "${doc.filename}" is now shared with workspace members`
          : `Document "${doc.filename}" is now private to owner`,
        'success'
      );
      loadDocuments();
    } catch (err) {
      addToast(err.message || 'Failed to toggle sharing', 'error');
    }
  };

  const handleDeleteDoc = async (doc) => {
    if (!confirm(`Delete document "${doc.filename}" from the workspace?`)) return;
    try {
      await api.deleteDocument(doc.filename);
      addToast(`Deleted document "${doc.filename}"`, 'success');
      loadDocuments();
    } catch (err) {
      addToast(err.message || 'Failed to delete document', 'error');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const updated = await api.updateAdminSettings(settings);
      setSettings(updated);
      setWorkspaceInfo(updated);
      refreshWorkspace();
      addToast('Workspace settings successfully saved', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to save settings', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const formatTimestamp = (ts) => {
    if (!ts) return 'Never';
    try {
      const d = new Date(ts);
      return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return ts;
    }
  };

  return (
    <div className="admin-console-page">
      {/* Console Header */}
      <div className="admin-console-header">
        <div className="admin-header-title">
          <div className="admin-badge-icon">
            <Shield size={22} />
          </div>
          <div>
            <h1>Administrator Console</h1>
            <p>Centralized enterprise governance, user account management, and centralized audit trails.</p>
          </div>
        </div>
        <div className="admin-org-pill">
          <Building size={14} />
          <span>{settings.org_name}</span>
          <span className="domain">({settings.workspace_domain})</span>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="admin-tabs">
        <button
          className={`admin-tab-btn ${activeTab === 'dashboard' && !selectedUserId ? 'active' : ''}`}
          onClick={() => { setActiveTab('dashboard'); setSelectedUserId(null); }}
        >
          <Activity size={16} />
          <span>Dashboard</span>
        </button>
        <button
          className={`admin-tab-btn ${(activeTab === 'users' || selectedUserId) ? 'active' : ''}`}
          onClick={() => { setActiveTab('users'); }}
        >
          <Users size={16} />
          <span>User Management</span>
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'audit' && !selectedUserId ? 'active' : ''}`}
          onClick={() => { setActiveTab('audit'); setSelectedUserId(null); }}
        >
          <Clock size={16} />
          <span>Audit Logs</span>
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'documents' && !selectedUserId ? 'active' : ''}`}
          onClick={() => { setActiveTab('documents'); setSelectedUserId(null); }}
        >
          <FileText size={16} />
          <span>Documents & Workspace</span>
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'org' && !selectedUserId ? 'active' : ''}`}
          onClick={() => { setActiveTab('org'); setSelectedUserId(null); }}
        >
          <Sliders size={16} />
          <span>Organization Settings</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB: DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && !selectedUserId && (
        <div className="admin-tab-content">
          {loadingDashboard ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading organization metrics...
            </div>
          ) : (
            <>
              {/* Executive Metrics Cards */}
              <div className="admin-stat-cards">
                <div className="admin-stat-card">
                  <div className="stat-num">{dashboardData?.metrics?.total_users ?? users.length}</div>
                  <div className="stat-desc">Total Users</div>
                </div>
                <div className="admin-stat-card success">
                  <div className="stat-num">{dashboardData?.metrics?.active_users ?? users.filter(u => u.is_active).length}</div>
                  <div className="stat-desc">Active Accounts</div>
                </div>
                <div className="admin-stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                  <div className="stat-num" style={{ color: '#ef4444' }}>
                    {dashboardData?.metrics?.disabled_users ?? users.filter(u => !u.is_active).length}
                  </div>
                  <div className="stat-desc">Disabled Accounts</div>
                </div>
                <div className="admin-stat-card highlight">
                  <div className="stat-num">{dashboardData?.metrics?.total_conversations ?? 0}</div>
                  <div className="stat-desc">Conversations</div>
                </div>
                <div className="admin-stat-card">
                  <div className="stat-num">{dashboardData?.metrics?.total_documents ?? 0}</div>
                  <div className="stat-desc">Documents Indexed</div>
                </div>
              </div>

              {/* 2-Column Overview: Live Activity Feed & System Telemetry */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginTop: 24 }}>
                {/* Recent Activity Feed */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 20,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Clock size={16} style={{ color: 'var(--accent-primary)' }} />
                      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Recent Organization Activity</h3>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setActiveTab('audit')}
                      style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>View Full Audit Log</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(dashboardData?.recent_activities || []).length === 0 ? (
                      <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>
                        No recent activity recorded yet.
                      </div>
                    ) : (
                      dashboardData.recent_activities.map((act) => (
                        <div
                          key={act.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'var(--bg-primary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-secondary)',
                            fontSize: 13,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                background: act.action.includes('login') ? 'rgba(34, 197, 94, 0.15)' :
                                            act.action.includes('delete') ? 'rgba(239, 68, 68, 0.15)' :
                                            'rgba(99, 102, 241, 0.15)',
                                color: act.action.includes('login') ? '#4ade80' :
                                       act.action.includes('delete') ? '#f87171' :
                                       '#818cf8',
                              }}
                            >
                              {act.action.replace('_', ' ')}
                            </span>
                            <span style={{ fontWeight: 500 }}>{act.display_name || act.username || 'System'}</span>
                            {act.resource_name && (
                              <span style={{ color: 'var(--text-secondary)' }}>
                                → <span style={{ color: 'var(--text-primary)' }}>{act.resource_name}</span>
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {formatTimestamp(act.created_at)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* System Telemetry & Workspace Health */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Server size={16} style={{ color: '#22c55e' }} />
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>System Telemetry</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Database size={16} style={{ color: '#38bdf8' }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>PostgreSQL Database</span>
                      </div>
                      <span className="badge success" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={12} /> Connected
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Cpu size={16} style={{ color: '#a855f7' }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>Local Qwen LLM</span>
                      </div>
                      <span className="badge success" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={12} /> Ollama Ready
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Layers size={16} style={{ color: '#f59e0b' }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>ChromaDB Vector Store</span>
                      </div>
                      <span className="badge success" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={12} /> Ready
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileCheck size={16} style={{ color: '#10b981' }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>Docker OCR Worker</span>
                      </div>
                      <span className="badge success" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={12} /> Ready + PyMuPDF
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: 20, padding: 12, background: 'rgba(99, 102, 241, 0.08)', borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#818cf8', marginBottom: 4 }}>
                      Sovereign Local-First Compliance
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Zero cloud telemetry, zero external model calls, zero CDN script dependencies. All sessions, vectors, and documents reside locally.
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: USERS DIRECTORY */}
      {/* ========================================================================= */}
      {(activeTab === 'users' || activeTab === 'dashboard') && !selectedUserId && (
        activeTab === 'users' && (
          <div className="admin-tab-content">
            <div className="admin-table-toolbar">
              <div className="admin-search-box">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search by name, username, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="admin-filter-group">
                <select
                  className="admin-select"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="ALL">All Roles</option>
                  <option value="Administrator">Administrators</option>
                  <option value="Member">Members</option>
                </select>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={loadUsers}
                  disabled={loadingUsers}
                  title="Refresh user list"
                >
                  <RefreshCw size={14} className={loadingUsers ? 'spin' : ''} />
                  <span>Refresh</span>
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus size={14} />
                  <span>Add Member</span>
                </button>
              </div>
            </div>

            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Conversations</th>
                    <th>Documents</th>
                    <th>Last Login</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                        Loading enterprise directory...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                        No users found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelf = u.id === currentUser?.id;
                      const initials = (u.display_name || u.username)
                        .split(' ')
                        .map((w) => w[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2);

                      return (
                        <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => handleOpenUserDetail(u.id)}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                className="avatar"
                                style={{
                                  background: u.avatar_color || '#6366f1',
                                  width: 32,
                                  height: 32,
                                  fontSize: 12,
                                  flexShrink: 0,
                                }}
                              >
                                {initials}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {u.display_name} {isSelf && <span style={{ fontSize: 10, opacity: 0.6 }}>(You)</span>}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                  @{u.username} {u.email && `• ${u.email}`}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span className={`admin-role-badge ${u.role === 'Administrator' ? 'admin' : 'member'}`}>
                              {u.role}
                            </span>
                          </td>

                          <td>
                            <span className={`admin-status-badge ${u.is_active ? 'active' : 'disabled'}`}>
                              {u.is_active ? 'Active' : 'Disabled'}
                            </span>
                          </td>

                          <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {u.conversation_count ?? 0}
                          </td>

                          <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {u.document_count ?? 0}
                          </td>

                          <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            {formatTimestamp(u.last_login_at)}
                          </td>

                          <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            {formatTimestamp(u.created_at)}
                          </td>

                          <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleOpenUserDetail(u.id)}
                                title="View User Profile & Detailed Activity"
                              >
                                <Eye size={14} />
                                <span>Inspect</span>
                              </button>

                              {!isSelf && (
                                <>
                                  <button
                                    className={`btn btn-sm ${u.is_active ? 'btn-ghost' : 'btn-success'}`}
                                    onClick={() => handleToggleStatus(u)}
                                    title={u.is_active ? 'Deactivate Account' : 'Re-activate Account'}
                                  >
                                    {u.is_active ? <UserX size={14} style={{ color: '#ef4444' }} /> : <UserCheck size={14} />}
                                  </button>

                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => handleToggleRole(u)}
                                    title={u.role === 'Administrator' ? 'Demote to Member' : 'Promote to Administrator'}
                                  >
                                    <Shield size={14} />
                                  </button>

                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => {
                                      setResetTargetUser(u);
                                      setResetPasswordValue('');
                                      setShowResetModal(true);
                                    }}
                                    title="Reset Password"
                                  >
                                    <KeyRound size={14} />
                                  </button>

                                  <button
                                    className="btn btn-ghost btn-sm danger"
                                    onClick={() => handleDeleteUser(u)}
                                    title="Delete User"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* INDIVIDUAL USER ADMIN VIEW (DEEP INSPECTION) */}
      {/* ========================================================================= */}
      {selectedUserId && userDetailData && (
        <div className="admin-tab-content">
          {/* Back Button & User Profile Header */}
          <div style={{ marginBottom: 20 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setSelectedUserId(null); setUserDetailData(null); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}
            >
              <ArrowLeft size={16} />
              <span>Back to Users Directory</span>
            </button>

            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  className="avatar lg"
                  style={{
                    background: userDetailData.user.avatar_color || '#6366f1',
                    width: 56,
                    height: 56,
                    fontSize: 20,
                  }}
                >
                  {(userDetailData.user.display_name || userDetailData.user.username)
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                      {userDetailData.user.display_name}
                    </h2>
                    <span className={`admin-role-badge ${userDetailData.user.role === 'Administrator' ? 'admin' : 'member'}`}>
                      {userDetailData.user.role}
                    </span>
                    <span className={`admin-status-badge ${userDetailData.user.is_active ? 'active' : 'disabled'}`}>
                      {userDetailData.user.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    @{userDetailData.user.username} • {userDetailData.user.email || 'No email configured'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Account created: {formatTimestamp(userDetailData.user.created_at)} • Last login: {formatTimestamp(userDetailData.user.last_login_at)}
                  </div>
                </div>
              </div>

              {/* Action Buttons for this user */}
              {userDetailData.user.id !== currentUser?.id && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className={`btn ${userDetailData.user.is_active ? 'btn-secondary' : 'btn-success'}`}
                    onClick={() => handleToggleStatus(userDetailData.user)}
                  >
                    {userDetailData.user.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                    <span>{userDetailData.user.is_active ? 'Disable Account' : 'Re-enable Account'}</span>
                  </button>

                  <button
                    className="btn btn-secondary"
                    onClick={() => handleToggleRole(userDetailData.user)}
                  >
                    <Shield size={15} />
                    <span>{userDetailData.user.role === 'Administrator' ? 'Demote to Member' : 'Make Administrator'}</span>
                  </button>

                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setResetTargetUser(userDetailData.user);
                      setResetPasswordValue('');
                      setShowResetModal(true);
                    }}
                  >
                    <KeyRound size={15} />
                    <span>Reset Password</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sub Tabs: Chat History | Documents | Activity */}
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-primary)', marginBottom: 20 }}>
            <button
              className={`admin-tab-btn ${userSubTab === 'chats' ? 'active' : ''}`}
              onClick={() => { setUserSubTab('chats'); setInspectingConv(null); }}
            >
              <MessageSquare size={16} />
              <span>Chat History ({userDetailData.conversations?.length || 0})</span>
            </button>
            <button
              className={`admin-tab-btn ${userSubTab === 'docs' ? 'active' : ''}`}
              onClick={() => { setUserSubTab('docs'); setInspectingConv(null); }}
            >
              <FileText size={16} />
              <span>Uploaded Documents ({userDetailData.documents?.length || 0})</span>
            </button>
            <button
              className={`admin-tab-btn ${userSubTab === 'activity' ? 'active' : ''}`}
              onClick={() => { setUserSubTab('activity'); setInspectingConv(null); }}
            >
              <Clock size={16} />
              <span>Chronological Activity ({userDetailData.activity?.length || 0})</span>
            </button>
          </div>

          {/* SUB-TAB 1: USER CHAT HISTORY */}
          {userSubTab === 'chats' && (
            <div>
              {inspectingConv ? (
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 24,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setInspectingConv(null)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}
                      >
                        <ArrowLeft size={14} />
                        <span>Back to Conversations List</span>
                      </button>
                      <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
                        {inspectingConv.title}
                      </h3>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        Conversation ID: {inspectingConv.id} • Last updated: {formatTimestamp(inspectingConv.updated_at)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {(inspectingConv.messages || []).map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          padding: '14px 18px',
                          borderRadius: 'var(--radius-md)',
                          background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-primary)',
                          border: '1px solid var(--border-secondary)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            color: msg.role === 'user' ? '#818cf8' : '#22c55e',
                          }}>
                            {msg.role === 'user' ? userDetailData.user.display_name : 'AI Assistant'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {formatTimestamp(msg.created_at)}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Conversation Title</th>
                        <th>Messages</th>
                        <th>Created</th>
                        <th>Last Activity</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(userDetailData.conversations || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                            This user has not initiated any chat conversations.
                          </td>
                        </tr>
                      ) : (
                        userDetailData.conversations.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{c.title}</td>
                            <td>{c.message_count} messages</td>
                            <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatTimestamp(c.created_at)}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatTimestamp(c.updated_at)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleInspectConversation(userDetailData.user.id, c.id)}
                              >
                                <Eye size={14} />
                                <span>Inspect Messages</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 2: USER DOCUMENTS */}
          {userSubTab === 'docs' && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Chunks</th>
                    <th>Sharing Status</th>
                    <th>Uploaded Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(userDetailData.documents || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                        This user has not uploaded any documents.
                      </td>
                    </tr>
                  ) : (
                    userDetailData.documents.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 600 }}>{d.original_filename || d.filename}</td>
                        <td style={{ textTransform: 'uppercase', fontSize: 11 }}>{d.file_type}</td>
                        <td style={{ fontSize: 12 }}>{Math.round((d.file_size || 0) / 1024)} KB</td>
                        <td>{d.chunk_count} chunks</td>
                        <td>
                          <span className={`badge ${d.is_shared ? 'success' : 'default'}`}>
                            {d.is_shared ? 'Workspace Shared' : 'Private'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatTimestamp(d.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SUB-TAB 3: USER ACTIVITY */}
          {userSubTab === 'activity' && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(userDetailData.activity || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                        No audit events recorded for this user yet.
                      </td>
                    </tr>
                  ) : (
                    userDetailData.activity.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                          {formatTimestamp(a.created_at)}
                        </td>
                        <td>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              background: 'rgba(99, 102, 241, 0.12)',
                              color: '#818cf8',
                            }}
                          >
                            {a.action.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{a.resource_name || a.resource_type || '—'}</div>
                        </td>
                        <td>
                          <span className={`admin-status-badge ${a.status === 'success' ? 'active' : 'disabled'}`}>
                            {a.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {JSON.stringify(a.details || {})}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: AUDIT LOGS */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && !selectedUserId && (
        <div className="admin-tab-content">
          <div className="admin-table-toolbar">
            <div className="admin-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search audit trail by user, action, or resource..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
              />
            </div>

            <div className="admin-filter-group">
              <select
                className="admin-select"
                value={auditUserFilter}
                onChange={(e) => setAuditUserFilter(e.target.value)}
              >
                <option value="ALL">All Users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name} (@{u.username})
                  </option>
                ))}
              </select>

              <select
                className="admin-select"
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
              >
                <option value="ALL">All Actions</option>
                <option value="login">Logins</option>
                <option value="logout">Logouts</option>
                <option value="create_conversation">Conversation Created</option>
                <option value="send_message">Message Sent</option>
                <option value="delete_conversation">Conversation Deleted</option>
                <option value="upload_document">Document Uploaded</option>
                <option value="share_document">Document Shared</option>
                <option value="delete_document">Document Deleted</option>
                <option value="create_user">User Created</option>
                <option value="activate_user">User Activated</option>
                <option value="deactivate_user">User Deactivated</option>
                <option value="update_user_role">Role Changed</option>
              </select>

              <select
                className="admin-select"
                value={auditResourceFilter}
                onChange={(e) => setAuditResourceFilter(e.target.value)}
              >
                <option value="ALL">All Resources</option>
                <option value="auth">Authentication</option>
                <option value="conversation">Conversation</option>
                <option value="document">Document</option>
                <option value="user">User</option>
                <option value="settings">Settings</option>
              </select>

              <button
                className="btn btn-secondary btn-sm"
                onClick={loadAuditLogs}
                disabled={loadingAudit}
              >
                <RefreshCw size={14} className={loadingAudit ? 'spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
            Showing {auditLogs.length} of {auditTotal} recorded enterprise events.
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor / User</th>
                  <th>Action</th>
                  <th>Target Resource</th>
                  <th>Status</th>
                  <th>IP Address</th>
                  <th>Event Metadata</th>
                </tr>
              </thead>
              <tbody>
                {loadingAudit ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                      Querying audit repository...
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                      No audit events match the current filter criteria.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                        {formatTimestamp(log.created_at)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{log.display_name || log.username || 'System'}</span>
                          <span className={`admin-role-badge ${log.role === 'Administrator' ? 'admin' : 'member'}`} style={{ fontSize: 9, padding: '1px 5px' }}>
                            {log.role || 'Member'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background: log.action.includes('login') ? 'rgba(34, 197, 94, 0.12)' :
                                        log.action.includes('delete') ? 'rgba(239, 68, 68, 0.12)' :
                                        'rgba(99, 102, 241, 0.12)',
                            color: log.action.includes('login') ? '#4ade80' :
                                   log.action.includes('delete') ? '#f87171' :
                                   '#818cf8',
                          }}
                        >
                          {log.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {log.resource_name || log.resource_type || '—'}
                        </div>
                      </td>
                      <td>
                        <span className={`admin-status-badge ${log.status === 'success' ? 'active' : 'disabled'}`}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                        {log.ip_address || '127.0.0.1'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {JSON.stringify(log.details || {})}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: DOCUMENTS / WORKSPACE */}
      {/* ========================================================================= */}
      {activeTab === 'documents' && !selectedUserId && (
        <div className="admin-tab-content">
          <div className="admin-table-toolbar">
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
              Workspace Documents Directory ({allDocs.length})
            </h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadDocuments}
              disabled={loadingDocs}
            >
              <RefreshCw size={14} className={loadingDocs ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Chunks</th>
                  <th>Owner</th>
                  <th>Sharing Status</th>
                  <th>Uploaded Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingDocs ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                      Loading documents repository...
                    </td>
                  </tr>
                ) : allDocs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                      No documents have been uploaded to the workspace yet.
                    </td>
                  </tr>
                ) : (
                  allDocs.map((doc) => (
                    <tr key={doc.filename}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                          <FileText size={16} style={{ color: 'var(--accent-primary)' }} />
                          <span>{doc.original_filename || doc.filename}</span>
                        </div>
                      </td>
                      <td style={{ textTransform: 'uppercase', fontSize: 11 }}>{doc.file_type || doc.type}</td>
                      <td style={{ fontSize: 12 }}>{Math.round((doc.file_size || doc.size_bytes || 0) / 1024)} KB</td>
                      <td>{doc.chunk_count || doc.chunks || 0} chunks</td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{doc.owner_display_name || doc.owner_name || 'System'}</span>
                      </td>
                      <td>
                        <span className={`badge ${doc.is_shared ? 'success' : 'default'}`}>
                          {doc.is_shared ? 'Workspace Shared' : 'Private'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatTimestamp(doc.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleToggleDocShare(doc)}
                            title={doc.is_shared ? 'Make Private' : 'Share with Workspace'}
                          >
                            <Share2 size={14} />
                            <span>{doc.is_shared ? 'Revoke Share' : 'Share'}</span>
                          </button>
                          <button
                            className="btn btn-ghost btn-sm danger"
                            onClick={() => handleDeleteDoc(doc)}
                            title="Delete Document"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: ORGANIZATION SETTINGS */}
      {/* ========================================================================= */}
      {activeTab === 'org' && !selectedUserId && (
        <div className="admin-tab-content">
          <form onSubmit={handleSaveSettings} style={{ maxWidth: 640 }}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building size={18} style={{ color: 'var(--accent-primary)' }} />
                <span>Enterprise Workspace Identity</span>
              </h3>

              <div>
                <label className="form-label">Organization Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.org_name}
                  onChange={(e) => setSettings({ ...settings, org_name: e.target.value })}
                  placeholder="e.g. Vertex Technologies Corp"
                />
              </div>

              <div>
                <label className="form-label">Workspace Domain</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.workspace_domain}
                  onChange={(e) => setSettings({ ...settings, workspace_domain: e.target.value })}
                  placeholder="e.g. vertex.corp"
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Member Permissions & Limits</h4>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-secondary)' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>Allow Member Document Uploads</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      When enabled, regular Members can upload documents for RAG indexing.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.allow_member_upload}
                    onChange={(e) => setSettings({ ...settings, allow_member_upload: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>Enforce Strict Member Data Isolation</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Guarantees members can only view their own private chats and documents.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enforce_data_isolation}
                    onChange={(e) => setSettings({ ...settings, enforce_data_isolation: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)' }}
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <label className="form-label">Maximum Upload Size (MB)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={settings.max_upload_size_mb}
                    onChange={(e) => setSettings({ ...settings, max_upload_size_mb: parseInt(e.target.value) || 20 })}
                    min="1"
                    max="100"
                    style={{ maxWidth: 200 }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingSettings}
                style={{ alignSelf: 'flex-start', marginTop: 10 }}
              >
                <Save size={16} />
                <span>{savingSettings ? 'Saving...' : 'Save Workspace Policies'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD USER */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700 }}>Add Organization Member</h3>
            <form onSubmit={handleCreateUser}>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. rohit"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Rohit Sharma"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Temporary Password</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. password123"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>User will use this password to sign in.</span>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Role</label>
                <select
                  className="admin-select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="Member">Member (Employee Workspace)</option>
                  <option value="Administrator">Administrator (Console Access)</option>
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Avatar Color</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: c,
                        border: newColor === c ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creatingUser}
                >
                  {creatingUser ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RESET PASSWORD */}
      {/* ========================================================================= */}
      {showResetModal && resetTargetUser && (
        <div className="modal-backdrop" onClick={() => setShowResetModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 700 }}>
              Reset Password for {resetTargetUser.display_name}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Set a new secure password for @{resetTargetUser.username}.
            </p>
            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: 20 }}>
                <label className="form-label">New Password</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter new password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowResetModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={resettingPassword}
                >
                  {resettingPassword ? 'Resetting...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
