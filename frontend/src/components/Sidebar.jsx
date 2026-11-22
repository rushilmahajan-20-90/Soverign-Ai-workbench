import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '../context/UserContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../services/api.js';
import {
  MessageSquare,
  FileText,
  Clock,
  Folder,
  Settings,
  User,
  Plus,
  Edit3,
  Trash2,
  Search,
  X,
  Lock,
  Shield,
  BookOpen,
} from 'lucide-react';

function groupConversations(conversations) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = { Today: [], Yesterday: [], Previous: [] };

  for (const conv of conversations) {
    const d = new Date(conv.updated_at || conv.created_at);
    if (d >= today) groups.Today.push(conv);
    else if (d >= yesterday) groups.Yesterday.push(conv);
    else groups.Previous.push(conv);
  }

  return groups;
}

export default function Sidebar({
  collapsed,
  currentPage,
  setPage,
  activeConversationId,
  setActiveConversationId,
  conversationRefreshKey,
  refreshConversations,
}) {
  const { currentUser, isAdmin, workspaceInfo } = useUser();
  const { addToast } = useToast();
  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const loadConversations = useCallback(async () => {
    if (!currentUser) return;
    try {
      // Exclude project conversations so simple chat sidebar only shows general chats
      const data = await api.getConversations(currentUser.id, 50, null, true);
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations, conversationRefreshKey]);

  const handleNewChat = () => {
    setActiveConversationId(null);
    setPage('chat');
  };

  const handleRename = async (id) => {
    if (!renameValue.trim()) return;
    try {
      await api.renameConversation(id, renameValue.trim());
      setRenamingId(null);
      loadConversations();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await api.deleteConversation(id);
      if (activeConversationId === id) setActiveConversationId(null);
      loadConversations();
      addToast('Conversation deleted', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const groups = groupConversations(filteredConversations);
  const navItems = [
    { key: 'chat', label: 'Chat', icon: MessageSquare },
    { key: 'workspace', label: 'Projects Workspace', icon: Folder },
    { key: 'history', label: 'History', icon: Clock },
    ...(isAdmin ? [{ key: 'documents', label: 'Knowledge Base', icon: BookOpen }] : []),
    ...(isAdmin ? [{ key: 'admin', label: 'Admin Console', icon: Shield }] : []),
  ];

  const bottomItems = [
    { key: 'settings', label: 'Settings', icon: Settings },
    { key: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">V</div>
          <div className="sidebar-logo-text">
            VERTEX
            <span className="sub">{workspaceInfo?.org_name || 'Enterprise AI'}</span>
          </div>
        </div>
      </div>

      {!collapsed && currentUser && (
        <div
          style={{
            margin: '0 12px 10px',
            padding: '8px 10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            className="avatar"
            style={{
              width: 32,
              height: 32,
              fontSize: 12,
              background: currentUser.avatar_color || '#6366f1',
              flexShrink: 0,
            }}
          >
            {(currentUser.display_name || 'U').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {currentUser.display_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span
                className={`admin-role-badge ${isAdmin ? 'admin' : 'member'}`}
                style={{ fontSize: 9, padding: '1px 6px' }}
              >
                {isAdmin ? 'Administrator' : 'Member'}
              </span>
            </div>
          </div>
        </div>
      )}

      <button className="new-chat-btn" onClick={handleNewChat} title="New Chat">
        <Plus size={16} />
        <span>New Chat</span>
      </button>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${currentPage === item.key ? 'active' : ''}`}
            onClick={() => setPage(item.key)}
            title={item.label}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {currentPage === 'chat' && !collapsed && (
        <>
          <div className="sidebar-divider" />
          {conversations.length > 3 && (
            <div style={{ padding: '0 12px 6px', position: 'relative' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px',
                  gap: 6,
                }}
              >
                <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    width: '100%',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ color: 'var(--text-tertiary)', padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="sidebar-conversations">
            {Object.entries(groups).map(([label, convs]) =>
              convs.length > 0 ? (
                <div key={label}>
                  <div className="conv-group-label">{label}</div>
                  {convs.map((conv) => (
                    <div
                      key={conv.id}
                      className={`conv-item ${activeConversationId === conv.id ? 'active' : ''}`}
                      onClick={() => {
                        setActiveConversationId(conv.id);
                        setPage('chat');
                      }}
                    >
                      <MessageSquare size={14} />
                      {renamingId === conv.id ? (
                        <input
                          className="rename-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => handleRename(conv.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(conv.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="conv-title">{conv.title}</span>
                      )}
                      <div className="conv-actions">
                        <button
                          className="conv-action-btn"
                          title="Rename"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(conv.id);
                            setRenameValue(conv.title);
                          }}
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          className="conv-action-btn"
                          title="Delete"
                          onClick={(e) => handleDelete(conv.id, e)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null
            )}
            {searchQuery && filteredConversations.length === 0 && (
              <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                No chats found
              </div>
            )}
          </div>
        </>
      )}

      <div className="sidebar-divider" />

      <div style={{ padding: '0 8px 8px' }}>
        {bottomItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${currentPage === item.key ? 'active' : ''}`}
            onClick={() => setPage(item.key)}
            title={item.label}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {!collapsed && (
        <div className="sidebar-footer">
          <div className="local-badge" style={{ width: '100%', justifyContent: 'center' }}>
            <Lock size={10} />
            <span>LOCAL • OFFLINE</span>
          </div>
        </div>
      )}
    </div>
  );
}
