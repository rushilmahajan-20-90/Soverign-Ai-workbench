import { useState } from 'react';
import { useUser } from './context/UserContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import ChatPage from './pages/ChatPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AdminConsolePage from './pages/AdminConsolePage.jsx';
import VertexSplash from './components/VertexSplash.jsx';

export default function App() {
  const { currentUser, loading, isAdmin, workspaceInfo, showVertexSplash, setShowVertexSplash } = useUser();
  const [page, setPage] = useState('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const [initialPrompt, setInitialPrompt] = useState('');

  if (loading) {
    return (
      <div className="startup-screen">
        <div className="startup-logo">S</div>
        <div className="startup-text">Sovereign AI</div>
        <div className="startup-checks">
          <div className="startup-check loading">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            <span>Connecting to workspace...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  if (showVertexSplash) {
    return (
      <VertexSplash
        user={currentUser}
        workspace={workspaceInfo}
        onComplete={() => {
          setShowVertexSplash(false);
          if (currentUser?.role === 'Administrator') {
            setPage('admin');
          } else {
            setPage('chat');
          }
        }}
      />
    );
  }

  const refreshConversations = () => setConversationRefreshKey((k) => k + 1);

  const navigateToChat = (convId, prompt = '') => {
    setActiveConversationId(convId);
    if (prompt) {
      setInitialPrompt(prompt);
    }
    setPage('chat');
  };

  const renderPage = () => {
    switch (page) {
      case 'chat':
        return (
          <ChatPage
            activeConversationId={activeConversationId}
            setActiveConversationId={setActiveConversationId}
            refreshConversations={refreshConversations}
            initialPrompt={initialPrompt}
            clearInitialPrompt={() => setInitialPrompt('')}
          />
        );
      case 'documents':
        return <DocumentsPage navigateToChat={navigateToChat} />;
      case 'history':
        return <HistoryPage navigateToChat={navigateToChat} />;
      case 'workspace':
        return <WorkspacePage navigateToChat={navigateToChat} />;
      case 'settings':
        return <SettingsPage />;
      case 'profile':
        return <ProfilePage />;
      case 'admin':
        return isAdmin ? (
          <AdminConsolePage />
        ) : (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <h2>Access Denied</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
              You do not have administrative privileges to view the Admin Console.
            </p>
          </div>
        );
      default:
        return (
          <ChatPage
            activeConversationId={activeConversationId}
            setActiveConversationId={setActiveConversationId}
            refreshConversations={refreshConversations}
            initialPrompt={initialPrompt}
            clearInitialPrompt={() => setInitialPrompt('')}
          />
        );
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        collapsed={sidebarCollapsed}
        currentPage={page}
        setPage={setPage}
        activeConversationId={activeConversationId}
        setActiveConversationId={setActiveConversationId}
        conversationRefreshKey={conversationRefreshKey}
        refreshConversations={refreshConversations}
      />
      <div className="main-content">
        <TopBar
          toggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          currentPage={page}
          setPage={setPage}
        />
        <div className="page-container">
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
