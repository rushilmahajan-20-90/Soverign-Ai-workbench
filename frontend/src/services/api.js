const BASE = '/api';

export function getAuthToken() {
  return localStorage.getItem('vertex_auth_token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('vertex_auth_token', token);
  } else {
    localStorage.removeItem('vertex_auth_token');
  }
}

function getAuthHeaders() {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const headers = { ...getAuthHeaders(), ...options.headers };
  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}

    // If unauthorized, notify caller
    if (res.status === 401) {
      // Clear token if invalid or expired
      setAuthToken(null);
    }
    throw new Error(detail);
  }
  return res.json();
}

// ── Authentication ──
export const login = (username, password) =>
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const getMe = () => request('/auth/me');

export const logout = () =>
  request('/auth/logout', {
    method: 'POST',
  });

export const changePassword = (oldPassword, newPassword) =>
  request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });

export const updateUser = (userId, data) =>
  request(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteUser = (userId) =>
  request(`/users/${userId}`, {
    method: 'DELETE',
  });

// ── Workspace Info ──
export const getWorkspaceInfo = () => request('/workspace');

// ── Admin Console ──
export const getAdminDashboard = () => request('/admin/dashboard');

export const getAdminUsers = () => request('/admin/users');

export const getAdminUserDetail = (userId) =>
  request(`/admin/users/${userId}/detail`);

export const getAdminUserConversation = (userId, convId) =>
  request(`/admin/users/${userId}/conversations/${convId}`);

export const adminCreateUser = (username, displayName, password, avatarColor = '#6366f1', role = 'Member', email = null) =>
  request('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      display_name: displayName,
      password: password || 'password123',
      avatar_color: avatarColor,
      role,
      email,
    }),
  });

export const adminUpdateUserRole = (userId, role) =>
  request(`/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

export const adminUpdateUserStatus = (userId, isActive) =>
  request(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });

export const adminResetUserPassword = (userId, password) =>
  request(`/admin/users/${userId}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  });

export const adminDeleteUser = (userId) =>
  request(`/admin/users/${userId}`, { method: 'DELETE' });

export const getAdminAuditLogs = (params = {}) => {
  const query = new URLSearchParams();
  if (params.limit) query.append('limit', params.limit);
  if (params.offset) query.append('offset', params.offset);
  if (params.userId) query.append('user_id', params.userId);
  if (params.action && params.action !== 'ALL') query.append('action', params.action);
  if (params.resourceType && params.resourceType !== 'ALL') query.append('resource_type', params.resourceType);
  if (params.search) query.append('search', params.search);
  const qStr = query.toString();
  return request(`/admin/audit-logs${qStr ? `?${qStr}` : ''}`);
};

export const getAdminSettings = () => request('/admin/settings');

export const updateAdminSettings = (data) =>
  request('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// ── Conversations ──
export const getConversations = (userId = null, limit = 50, projectId = null, excludeProjects = false) => {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit);
  if (userId) params.append('user_id', userId);
  if (projectId) params.append('project_id', projectId);
  if (excludeProjects) params.append('exclude_projects', 'true');
  const qStr = params.toString();
  return request(`/conversations${qStr ? `?${qStr}` : ''}`);
};

export const createConversation = (title, projectId = null) =>
  request('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, project_id: projectId }),
  });

export const getConversation = (id) => request(`/conversations/${id}`);

export const renameConversation = (id, title) =>
  request(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });

export const deleteConversation = (id) =>
  request(`/conversations/${id}`, { method: 'DELETE' });

// ── Chat ──
export const sendMessage = (message, conversationId = null, projectId = null) =>
  request('/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      conversation_id: conversationId || null,
      project_id: projectId || null,
    }),
  });

// ── Documents ──
export const getDocuments = () => request('/documents');

export const getDocumentInfo = (filename) =>
  request(`/documents/${encodeURIComponent(filename)}`);

export const shareDocument = (filename, isShared, sharedWithUserIds = null) =>
  request(`/documents/${encodeURIComponent(filename)}/share`, {
    method: 'PATCH',
    body: JSON.stringify({
      is_shared: isShared,
      shared_with_user_ids: sharedWithUserIds,
    }),
  });

export const deleteDocument = (filename) =>
  request(`/documents/${encodeURIComponent(filename)}`, { method: 'DELETE' });

export const clearAllDocuments = () =>
  request('/documents', { method: 'DELETE' });

// ── Temporary Chat Document Upload ──
export const uploadChatDocument = async (file, conversationId = null, projectId = null) => {
  const form = new FormData();
  form.append('file', file);
  if (conversationId) {
    form.append('conversation_id', conversationId);
  }
  if (projectId) {
    form.append('project_id', projectId);
  }
  const headers = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}/chat/upload`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
};

// ── Permanent Knowledge Base (Administrator Only) ──
export const getKnowledgeBase = (params = {}) => {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.status && params.status !== 'ALL') query.append('status', params.status);
  if (params.limit) query.append('limit', params.limit);
  if (params.offset) query.append('offset', params.offset);
  const qStr = query.toString();
  return request(`/knowledge-base${qStr ? `?${qStr}` : ''}`);
};

export const uploadKnowledgeBaseDocument = async (file) => {
  const form = new FormData();
  form.append('file', file);
  const headers = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}/knowledge-base/upload`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
};

export const reindexKnowledgeBaseDocument = (filename) =>
  request(`/knowledge-base/${encodeURIComponent(filename)}/reindex`, {
    method: 'POST',
  });

export const archiveKnowledgeBaseDocument = (filename) =>
  request(`/knowledge-base/${encodeURIComponent(filename)}/archive`, {
    method: 'PATCH',
  });

export const deleteKnowledgeBaseDocument = (filename) =>
  request(`/knowledge-base/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });

export const bulkDeleteKnowledgeBaseDocuments = (filenames) =>
  request('/knowledge-base/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ filenames }),
  });

export const clearAllKnowledgeBaseDocuments = () =>
  request('/knowledge-base', {
    method: 'DELETE',
  });

export const bulkDeleteDocuments = (filenames) =>
  request('/documents/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ filenames }),
  });

export const cleanupAbandonedTempDocuments = (maxAgeHours = 24) =>
  request(`/admin/cleanup-temp-documents?max_age_hours=${maxAgeHours}`, {
    method: 'POST',
  });

export const uploadDocument = async (file) => {
  const form = new FormData();
  form.append('file', file);
  const headers = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
};

export const createDocx = (filename, title, paragraphs) =>
  request('/documents/create', {
    method: 'POST',
    body: JSON.stringify({ filename, title, paragraphs }),
  });

export const generateDocument = (prompt, filename) =>
  request('/documents/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt, filename }),
  });

export const getSystemStatus = () => request('/system/status');

// ── File Downloads ──
export const getDownloadUrl = (filename) => {
  const token = getAuthToken();
  const clean = encodeURIComponent(filename.replace(/\\/g, '/').split('/').pop());
  return `${BASE}/documents/download/${clean}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};

export const downloadFile = async (filename, displayName = null) => {
  const token = getAuthToken();
  const cleanName = filename.replace(/\\/g, '/').split('/').pop();
  const url = `${BASE}/documents/download/${encodeURIComponent(cleanName)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = displayName || cleanName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('File download failed:', err);
    throw err;
  }
};
