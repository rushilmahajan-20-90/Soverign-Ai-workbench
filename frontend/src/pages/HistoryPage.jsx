import { useState, useEffect, useCallback } from 'react';
import { useUser } from '../context/UserContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../services/api.js';
import { MessageSquare, Trash2, Clock } from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const days = Math.floor(diff / 86400000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function HistoryPage({ navigateToChat }) {
  const { currentUser } = useUser();
  const { addToast } = useToast();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await api.getConversations(currentUser.id, 100, null, true);
      setConversations(data.conversations || []);
    } catch (err) {
      addToast('Failed to load history', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUser, addToast]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await api.deleteConversation(id);
      addToast('Conversation deleted', 'success');
      loadConversations();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="history-page">
      <div className="page-header">
        <h1>History</h1>
        <p>All your conversations, sorted by most recent activity.</p>
      </div>

      {loading ? (
        <div className="empty-state">
          <p>Loading conversations...</p>
        </div>
      ) : conversations.length === 0 ? (
        <div className="empty-state">
          <Clock size={48} />
          <h3>No conversations yet</h3>
          <p>Start a new conversation to see it here.</p>
        </div>
      ) : (
        <div className="history-list">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className="history-item"
              onClick={() => navigateToChat(conv.id)}
            >
              <div className="history-icon">
                <MessageSquare size={16} />
              </div>
              <div className="history-info">
                <div className="history-title">{conv.title}</div>
                <div className="history-meta">
                  {formatDate(conv.updated_at || conv.created_at)}
                  {conv.message_count > 0 && ` • ${conv.message_count} messages`}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-danger"
                onClick={(e) => handleDelete(conv.id, e)}
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

