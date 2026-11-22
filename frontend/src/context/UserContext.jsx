import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [workspaceInfo, setWorkspaceInfo] = useState({
    org_name: 'Vertex Enterprise',
    workspace_domain: 'vertex.local',
    allow_member_upload: true,
    max_upload_size_mb: 50,
  });
  const [loading, setLoading] = useState(true);
  const [showVertexSplash, setShowVertexSplash] = useState(false);

  const loadWorkspace = useCallback(async () => {
    try {
      const data = await api.getWorkspaceInfo();
      if (data) setWorkspaceInfo(data);
    } catch (err) {
      console.error('Failed to load workspace info:', err);
    }
  }, []);

  const verifySession = useCallback(async () => {
    const token = api.getAuthToken();
    if (!token) {
      setCurrentUser(null);
      return;
    }
    try {
      const res = await api.getMe();
      if (res && res.user) {
        if (!res.user.is_active) {
          api.setAuthToken(null);
          setCurrentUser(null);
        } else {
          setCurrentUser(res.user);
        }
      }
    } catch (err) {
      console.warn('Session verification failed, logging out:', err);
      api.setAuthToken(null);
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await Promise.all([verifySession(), loadWorkspace()]);
      } catch (err) {
        console.error('UserProvider initialization error:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [verifySession, loadWorkspace]);

  const loginUser = useCallback((token, user) => {
    api.setAuthToken(token);
    setCurrentUser(user);
    setShowVertexSplash(true);
  }, []);

  const logoutUser = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    api.setAuthToken(null);
    setCurrentUser(null);
    setShowVertexSplash(false);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    await loadWorkspace();
  }, [loadWorkspace]);

  const refreshCurrentUser = useCallback(async () => {
    await verifySession();
  }, [verifySession]);

  const isAdmin = currentUser?.role === 'Administrator';

  return (
    <UserContext.Provider value={{
      currentUser,
      workspaceInfo,
      isAdmin,
      loading,
      showVertexSplash,
      setShowVertexSplash,
      loginUser,
      logoutUser,
      refreshWorkspace,
      refreshCurrentUser,
      setCurrentUser,
      setWorkspaceInfo,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
