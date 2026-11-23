import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '../context/UserContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as api from '../services/api.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Folder,
  FolderOpen,
  Plus,
  CheckCircle2,
  Clock,
  Sparkles,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Edit2,
  Edit3,
  Check,
  X,
  Layers,
  Send,
  CheckSquare,
  Square,
  FileText,
  FileDown,
  Copy,
  Target,
  Shield,
  BookOpen,
  TrendingUp,
  Briefcase,
  Cpu,
  Lightbulb,
  Paperclip,
  Upload,
} from 'lucide-react';

const PROJECT_CATEGORIES = [
  {
    id: 'Document AI',
    label: 'Document AI & OCR',
    icon: FileText,
    color: '#818cf8',
    defaultScope: 'Deep OCR extraction, semantic chunking, and local multimodal document synthesis with zero cloud dependency.',
    defaultTasks: [
      'Scanned image & PDF OCR pipeline',
      'Semantic chunking & vector embeddings',
      'Multi-document comparison workflow',
    ],
  },
  {
    id: 'Knowledge Engineering',
    label: 'Knowledge Engineering & RAG',
    icon: BookOpen,
    color: '#38bdf8',
    defaultScope: 'Zero-cloud private intelligence leveraging local Qwen and persistent ChromaDB vector store.',
    defaultTasks: [
      'Enterprise vector indexing architecture',
      'Strict session & knowledge base isolation',
      'Automated document question answering',
    ],
  },
  {
    id: 'Research & Analysis',
    label: 'Research & Strategy',
    icon: TrendingUp,
    color: '#a855f7',
    defaultScope: 'Comprehensive market due diligence, strategic risk analysis, and competitive landscape intelligence.',
    defaultTasks: [
      'Market research and data synthesis',
      'Strategic risk assessment model',
      'Executive findings presentation',
    ],
  },
  {
    id: 'Content & Reports',
    label: 'Executive Reports & Deliverables',
    icon: Briefcase,
    color: '#34d399',
    defaultScope: 'Autonomous report formulation with structured sections, executive briefs, and direct file downloads.',
    defaultTasks: [
      'Formatted Word document generator',
      'Executive summary formulation',
      'One-click authenticated file downloads',
    ],
  },
  {
    id: 'Security & Compliance',
    label: 'Governance & Compliance',
    icon: Shield,
    color: '#f59e0b',
    defaultScope: 'Comprehensive enterprise activity tracking, administrator oversight, and member workspace isolation.',
    defaultTasks: [
      'PostgreSQL audit event logging',
      'Role-based access enforcement (Admin/Member)',
      'Session lifecycle management & cleanup',
    ],
  },
  {
    id: 'Autonomous Workflows',
    label: 'Autonomous Workflows',
    icon: Cpu,
    color: '#ec4899',
    defaultScope: 'Self-orchestrating agentic workflows for scheduled document synthesis and task execution.',
    defaultTasks: [
      'Define automated tool pipeline',
      'Multi-stage verification and error checks',
      'Autonomous deliverable publishing',
    ],
  },
];

const SUGGESTED_TITLES = [
  'Enterprise Due Diligence & Strategic Analysis',
  'Regulatory Compliance & Risk Assessment',
  'Multimodal Document Intelligence Pipeline',
  'Quarterly Operational Performance Audit',
  'Autonomous Financial Intelligence Engine',
  'Corporate Governance & Access Protocols',
];

const DEFAULT_PROJECTS = [
  {
    id: 'proj-1',
    title: 'Enterprise Document Intelligence & OCR',
    category: 'Document AI',
    status: 'Active',
    description: 'Deep OCR extraction, semantic chunking, and local multimodal document synthesis with zero cloud dependency.',
    progress: 67,
    tasks: [
      { id: 't1', text: 'Scanned image & PDF OCR pipeline', done: true },
      { id: 't2', text: 'Semantic chunking & vector embeddings', done: true },
      { id: 't3', text: 'Multi-document comparison workflow', done: false },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'proj-2',
    title: 'Offline AI Knowledge Base & RAG Assistant',
    category: 'Knowledge Engineering',
    status: 'Active',
    description: 'Zero-cloud private intelligence leveraging local Qwen and persistent ChromaDB vector store.',
    progress: 67,
    tasks: [
      { id: 't4', text: 'Enterprise vector indexing architecture', done: true },
      { id: 't5', text: 'Strict session & knowledge base isolation', done: true },
      { id: 't6', text: 'Automated document question answering', done: false },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'proj-3',
    title: 'Executive Reporting & Autonomous Deliverables',
    category: 'Content & Reports',
    status: 'In Progress',
    description: 'Autonomous report formulation with structured sections, executive briefs, and direct file downloads.',
    progress: 67,
    tasks: [
      { id: 't7', text: 'Formatted Word document generator', done: true },
      { id: 't8', text: 'PDF document export engine', done: false },
      { id: 't9', text: 'One-click authenticated file downloads', done: true },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'proj-4',
    title: 'Governance, Audit Trails & Access Control',
    category: 'Security & Compliance',
    status: 'Completed',
    description: 'Comprehensive enterprise activity tracking, administrator oversight, and member workspace isolation.',
    progress: 100,
    tasks: [
      { id: 't10', text: 'PostgreSQL audit event logging', done: true },
      { id: 't11', text: 'Role-based access enforcement (Admin/Member)', done: true },
      { id: 't12', text: 'Session lifecycle management & cleanup', done: true },
    ],
    updatedAt: new Date().toISOString(),
  },
];

function extractGeneratedFiles(text) {
  if (!text || typeof text !== 'string') return [];
  const files = new Set();
  const pathRegex = /(?:data[/\\]documents[/\\]generated[/\\])([a-zA-Z0-9_\-\.\s]+\.(?:docx|pdf|xlsx|csv|txt))/gi;
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    if (match[1]) files.add(match[1].trim());
  }
  const quotedRegex = /[`"']([a-zA-Z0-9_\-]+\.(?:docx|pdf|xlsx|csv))[`"']/gi;
  while ((match = quotedRegex.exec(text)) !== null) {
    if (match[1]) files.add(match[1].trim());
  }
  const keywordRegex = /(?:saved|created|generated|download|file:?)\s+[:\s]*([a-zA-Z0-9_\-]+\.(?:docx|pdf|xlsx|csv))/gi;
  while ((match = keywordRegex.exec(text)) !== null) {
    if (match[1]) files.add(match[1].trim());
  }
  return Array.from(files);
}

function GeneratedFileCards({ files }) {
  const { addToast } = useToast();
  if (!files || files.length === 0) return null;

  const handleDownload = async (filename) => {
    try {
      addToast(`Downloading ${filename}...`, 'info');
      await api.downloadFile(filename);
      addToast(`Downloaded ${filename}`, 'success');
    } catch (err) {
      addToast(`Download failed: ${err.message}`, 'error');
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 10,
        background: '#040406',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--accent)',
          marginBottom: 8,
        }}
      >
        <FileDown size={14} />
        <span>Generated Deliverables Ready to Download</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {files.map((file, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: '#0a0a0f',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 6,
            }}
          >
            <FileText size={16} color="#818cf8" />
            <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 500 }}>{file}</span>
            <button
              onClick={() => handleDownload(file)}
              style={{
                background: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                color: '#ffffff',
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <FileDown size={12} />
              <span>Download</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const { currentUser } = useUser();
  const { addToast } = useToast();

  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projectConversations, setProjectConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [uploadingProjectDoc, setUploadingProjectDoc] = useState(false);
  const projectFileInputRef = useRef(null);

  // Quick inline task in active project
  const [newTaskText, setNewTaskText] = useState('');

  // Project conversation count map (for project cards)
  const [convCounts, setConvCounts] = useState({});

  // Inline header project title editing
  const [inlineEditingTitle, setInlineEditingTitle] = useState(false);
  const [inlineTitleValue, setInlineTitleValue] = useState('');

  // Modals (Create & Edit Project)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null); // null = Create, object = Edit
  const [modalTitle, setModalTitle] = useState('');
  const [modalCategory, setModalCategory] = useState('Document AI');
  const [modalDescription, setModalDescription] = useState('');
  const [modalTasks, setModalTasks] = useState([]);
  const [modalNewTaskInput, setModalNewTaskInput] = useState('');

  // Renaming project conversations
  const [renamingConvId, setRenamingConvId] = useState(null);
  const [renameConvTitle, setRenameConvTitle] = useState('');

  const messagesEndRef = useRef(null);
  const storageKey = `vertex_projects_user_${currentUser?.id || 'default'}`;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Load projects from persistent user storage
  const loadProjects = useCallback(() => {
    if (!currentUser) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setProjects(JSON.parse(saved));
      } catch {
        setProjects(DEFAULT_PROJECTS);
      }
    } else {
      setProjects(DEFAULT_PROJECTS);
      localStorage.setItem(storageKey, JSON.stringify(DEFAULT_PROJECTS));
    }
  }, [currentUser, storageKey]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const saveProjects = (updated) => {
    setProjects(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  // Load conversation counts for all projects on dashboard
  const loadConvCounts = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await api.getConversations(currentUser.id, 100);
      const allConvs = data.conversations || [];
      const counts = {};
      allConvs.forEach((c) => {
        if (c.project_id) {
          counts[c.project_id] = (counts[c.project_id] || 0) + 1;
        }
      });
      setConvCounts(counts);
    } catch {
      // ignore
    }
  }, [currentUser]);

  useEffect(() => {
    loadConvCounts();
  }, [loadConvCounts, activeProjectId]);

  // Load conversations belonging specifically to activeProjectId
  const loadProjectConversations = useCallback(
    async (projectId, targetConvId = null) => {
      if (!currentUser || !projectId) return;
      try {
        const data = await api.getConversations(currentUser.id, 50, projectId);
        const convs = data.conversations || [];
        setProjectConversations(convs);

        if (targetConvId) {
          setActiveConvId(targetConvId);
        } else if (convs.length > 0 && !activeConvId) {
          setActiveConvId(convs[0].id);
        } else if (convs.length === 0) {
          setActiveConvId(null);
          setMessages([]);
        }
      } catch (err) {
        addToast('Failed to load project conversations', 'error');
      }
    },
    [currentUser, activeConvId, addToast]
  );

  useEffect(() => {
    if (activeProjectId) {
      loadProjectConversations(activeProjectId);
    }
  }, [activeProjectId, loadProjectConversations]);

  // Load messages for the currently selected project conversation
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    let isMounted = true;
    setLoadingConv(true);
    api
      .getConversation(activeConvId)
      .then((data) => {
        if (isMounted) {
          setMessages(data?.messages || []);
        }
      })
      .catch((err) => {
        console.error('Failed to load project conversation messages:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingConv(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeConvId]);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Send message inside active project
  const handleSendMessage = async (customText = null) => {
    const textToSend = typeof customText === 'string' ? customText : inputMessage;
    if (!textToSend.trim() || sending || !activeProject) return;

    const userText = textToSend.trim();
    setInputMessage('');
    setSending(true);

    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await api.sendMessage(userText, activeConvId, activeProject.id);

      if (res.conversation_id && res.conversation_id !== activeConvId) {
        setActiveConvId(res.conversation_id);
        await loadProjectConversations(activeProject.id, res.conversation_id);
      }

      const assistantMsg = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: res.answer || res.response || 'No response returned from model.',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      loadProjectConversations(activeProject.id, res.conversation_id || activeConvId);
    } catch (err) {
      addToast(err.message || 'Failed to send message', 'error');
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  // Upload temporary document to project
  const handleProjectFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject) return;
    e.target.value = '';

    const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      addToast('Supported formats: PDF, PNG, JPG, JPEG', 'error');
      return;
    }

    setUploadingProjectDoc(true);
    addToast(`Processing & indexing temporary document ${file.name}...`, 'info');

    try {
      const res = await api.uploadChatDocument(file, activeConvId, activeProject.id);
      const newDoc = {
        id: res.document_id || `doc-${Date.now()}`,
        filename: file.name,
        size: file.size,
        chunks: res.chunks || 1,
        uploaded_at: new Date().toISOString(),
      };

      const updated = projects.map((p) => {
        if (p.id === activeProject.id) {
          const existing = p.documents || [];
          return { ...p, documents: [newDoc, ...existing] };
        }
        return p;
      });

      saveProjects(updated);
      addToast(`Attached "${file.name}" to ${activeProject.title}. LLM can now see it.`, 'success');
    } catch (err) {
      addToast(`Failed to attach document: ${err.message}`, 'error');
    } finally {
      setUploadingProjectDoc(false);
    }
  };

  // Remove temporary document from project
  const handleRemoveProjectDoc = (docId, docName) => {
    if (!activeProject) return;
    const updated = projects.map((p) => {
      if (p.id === activeProject.id) {
        return {
          ...p,
          documents: (p.documents || []).filter((d) => d.id !== docId),
        };
      }
      return p;
    });
    saveProjects(updated);
    addToast(`Removed "${docName}" from project`, 'info');
  };

  const handleNewProjectChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setInputMessage('');
  };

  const handleDeleteProjectConversation = async (convId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this project conversation?')) return;
    try {
      await api.deleteConversation(convId);
      addToast('Project conversation deleted', 'success');
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
      loadProjectConversations(activeProjectId);
      loadConvCounts();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleStartRename = (conv, e) => {
    e.stopPropagation();
    setRenamingConvId(conv.id);
    setRenameConvTitle(conv.title);
  };

  const handleSaveRename = async (convId, e) => {
    e?.stopPropagation();
    if (!renameConvTitle.trim()) return;
    try {
      await api.renameConversation(convId, renameConvTitle.trim());
      setRenamingConvId(null);
      loadProjectConversations(activeProjectId, activeConvId);
      addToast('Conversation renamed', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Open Modal for Creating New Project
  const handleOpenCreateModal = () => {
    setEditingProject(null);
    setModalTitle('');
    const defaultCat = PROJECT_CATEGORIES[0];
    setModalCategory(defaultCat.id);
    setModalDescription(defaultCat.defaultScope);
    setModalTasks([]);
    setModalNewTaskInput('');
    setShowCreateModal(true);
  };

  // Open Modal for Editing Existing Project
  const handleOpenEditModal = (project, e) => {
    e?.stopPropagation();
    setEditingProject(project);
    setModalTitle(project.title);
    setModalCategory(project.category);
    setModalDescription(project.description);
    setModalTasks(project.tasks ? project.tasks.map((t) => t.text) : []);
    setModalNewTaskInput('');
    setShowCreateModal(true);
  };

  // Category switch in modal
  const handleSelectCategory = (catId) => {
    setModalCategory(catId);
    const cat = PROJECT_CATEGORIES.find((c) => c.id === catId);
    if (cat) {
      // If description was default or blank, suggest new category default
      const isAnyDefault = PROJECT_CATEGORIES.some((c) => c.defaultScope === modalDescription);
      if (!modalDescription.trim() || isAnyDefault) {
        setModalDescription(cat.defaultScope);
      }
    }
  };

  // Quick Title selection
  const handleSelectSuggestedTitle = (title) => {
    setModalTitle(title);
  };

  // Add milestone task in modal
  const handleModalAddTask = (e) => {
    e?.preventDefault();
    if (!modalNewTaskInput.trim()) return;
    setModalTasks((prev) => [...prev, modalNewTaskInput.trim()]);
    setModalNewTaskInput('');
  };

  // Remove milestone task in modal
  const handleModalRemoveTask = (index) => {
    setModalTasks((prev) => prev.filter((_, i) => i !== index));
  };

  // Suggest milestones for selected category
  const handleSuggestMilestones = () => {
    const cat = PROJECT_CATEGORIES.find((c) => c.id === modalCategory) || PROJECT_CATEGORIES[0];
    setModalTasks([...cat.defaultTasks]);
    addToast('Populated recommended milestones', 'info');
  };

  // Submit Modal (Create or Edit)
  const handleSaveProjectModal = (e) => {
    e.preventDefault();
    const cleanTitle = modalTitle.trim();
    if (!cleanTitle) {
      addToast('Project title is required', 'error');
      return;
    }

    if (editingProject) {
      // Update existing project
      const updated = projects.map((p) => {
        if (p.id !== editingProject.id) return p;
        // Keep existing done status where possible
        const existingMap = {};
        p.tasks?.forEach((t) => {
          existingMap[t.text] = t.done;
        });

        const newTasks =
          modalTasks.length > 0
            ? modalTasks.map((text, idx) => ({
                id: `task-${p.id}-${idx}`,
                text,
                done: existingMap[text] || false,
              }))
            : [{ id: `task-${p.id}-1`, text: 'Define project scope and deliverables', done: false }];

        const doneCount = newTasks.filter((t) => t.done).length;
        const progress = Math.round((doneCount / newTasks.length) * 100);
        const status = progress === 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'Active';

        return {
          ...p,
          title: cleanTitle,
          category: modalCategory,
          description: modalDescription.trim() || 'Custom AI workspace project and research initiatives.',
          tasks: newTasks,
          progress,
          status,
          updatedAt: new Date().toISOString(),
        };
      });

      saveProjects(updated);
      addToast(`Project "${cleanTitle}" updated successfully`, 'success');
    } else {
      // Create new project
      const newTasks =
        modalTasks.length > 0
          ? modalTasks.map((text, idx) => ({ id: `task-${Date.now()}-${idx}`, text, done: false }))
          : [
              { id: `task-${Date.now()}-1`, text: 'Define project scope and deliverables', done: false },
              { id: `task-${Date.now()}-2`, text: 'Gather references and background context', done: false },
              { id: `task-${Date.now()}-3`, text: 'Synthesize final AI deliverable', done: false },
            ];

      const newProject = {
        id: `proj-${Date.now()}`,
        title: cleanTitle,
        category: modalCategory,
        status: 'Active',
        description: modalDescription.trim() || 'Custom AI workspace project and research initiatives.',
        progress: 0,
        tasks: newTasks,
        updatedAt: new Date().toISOString(),
      };

      const updated = [newProject, ...projects];
      saveProjects(updated);
      addToast(`Project "${newProject.title}" created successfully`, 'success');
      setActiveProjectId(newProject.id); // Open new project right away
    }

    setShowCreateModal(false);
  };

  const handleDeleteProject = (projectId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project?')) return;
    const updated = projects.filter((p) => p.id !== projectId);
    saveProjects(updated);
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
    addToast('Project deleted', 'success');
  };

  const handleToggleTask = (projectId, taskId, e) => {
    e?.stopPropagation();
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      const tasks = p.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
      const doneCount = tasks.filter((t) => t.done).length;
      const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;
      const status = progress === 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'Active';
      return { ...p, tasks, progress, status, updatedAt: new Date().toISOString() };
    });
    saveProjects(updated);
  };

  const handleAddInlineTask = (projectId) => {
    if (!newTaskText.trim()) return;
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      const tasks = [...p.tasks, { id: `task-${Date.now()}`, text: newTaskText.trim(), done: false }];
      const doneCount = tasks.filter((t) => t.done).length;
      const progress = Math.round((doneCount / tasks.length) * 100);
      return { ...p, tasks, progress, updatedAt: new Date().toISOString() };
    });
    saveProjects(updated);
    setNewTaskText('');
  };

  // Inline Project Title Save
  const handleSaveInlineTitle = () => {
    if (!inlineTitleValue.trim() || !activeProject) {
      setInlineEditingTitle(false);
      return;
    }
    const updated = projects.map((p) =>
      p.id === activeProject.id ? { ...p, title: inlineTitleValue.trim() } : p
    );
    saveProjects(updated);
    setInlineEditingTitle(false);
    addToast('Project title updated', 'success');
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalTasks = projects.reduce((sum, p) => sum + (p.tasks?.length || 0), 0);
  const completedTasks = projects.reduce(
    (sum, p) => sum + (p.tasks?.filter((t) => t.done).length || 0),
    0
  );
  const activeCount = projects.filter((p) => p.status !== 'Completed').length;
  const completedCount = projects.filter((p) => p.status === 'Completed').length;

  // =========================================================================
  // VIEW 2: DEDICATED IN-PROJECT WORKSPACE & CHAT
  // =========================================================================
  if (activeProject) {
    const currentConv = projectConversations.find((c) => c.id === activeConvId);

    return (
      <div
        className="workspace-page"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          padding: '16px 24px',
          background: '#000000',
        }}
      >
        {/* Project Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 14,
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: 16,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setActiveProjectId(null)}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: 12, gap: 6 }}
              title="Return to Projects Dashboard"
            >
              <ArrowLeft size={14} />
              <span>All Projects</span>
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {inlineEditingTitle ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="text"
                      value={inlineTitleValue}
                      onChange={(e) => setInlineTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveInlineTitle();
                        if (e.key === 'Escape') setInlineEditingTitle(false);
                      }}
                      autoFocus
                      style={{
                        background: '#0a0a0f',
                        border: '1px solid var(--accent)',
                        borderRadius: 6,
                        color: '#ffffff',
                        fontSize: 16,
                        fontWeight: 700,
                        padding: '4px 8px',
                        minWidth: 320,
                      }}
                    />
                    <button
                      onClick={handleSaveInlineTitle}
                      className="btn-icon"
                      style={{ color: 'var(--success)', padding: 4 }}
                      title="Save Title"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setInlineEditingTitle(false)}
                      className="btn-icon"
                      style={{ color: 'var(--text-tertiary)', padding: 4 }}
                      title="Cancel"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h1
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 700,
                        color: '#ffffff',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {activeProject.title}
                    </h1>
                    <button
                      onClick={() => {
                        setInlineTitleValue(activeProject.title);
                        setInlineEditingTitle(true);
                      }}
                      className="btn-icon"
                      style={{ color: 'var(--text-tertiary)', padding: 3 }}
                      title="Rename Project Title"
                    >
                      <Edit3 size={13} />
                    </button>
                  </div>
                )}

                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#818cf8',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                  }}
                >
                  {activeProject.category}
                </span>

                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 4,
                    background:
                      activeProject.status === 'Completed'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : 'rgba(234, 179, 8, 0.15)',
                    color: activeProject.status === 'Completed' ? '#4ade80' : '#facc15',
                  }}
                >
                  {activeProject.status}
                </span>

                <button
                  onClick={(e) => handleOpenEditModal(activeProject, e)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#cbd5e1',
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Edit Project Scope & Milestones"
                >
                  <Edit2 size={11} />
                  <span>Edit Project</span>
                </button>
              </div>

              <p
                style={{
                  margin: '3px 0 0',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  maxWidth: 720,
                }}
              >
                {activeProject.description}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              🔒 Project Scope Isolated
            </span>
          </div>
        </div>

        {/* Split View: Left Column (Tasks & Project Chat History) + Right Column (In-Project AI Chat) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '340px 1fr',
            gap: 16,
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* LEFT COLUMN: Milestones & Project Chat History */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {/* Milestones Card */}
            <div
              style={{
                background: '#040405',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 'var(--radius-lg)',
                padding: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={14} style={{ color: 'var(--accent)' }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#ffffff',
                    }}
                  >
                    Milestones & Tasks
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                  {activeProject.progress}%
                </span>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  width: '100%',
                  height: 4,
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 2,
                  overflow: 'hidden',
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: `${activeProject.progress}%`,
                    height: '100%',
                    background:
                      activeProject.progress === 100
                        ? 'var(--success)'
                        : 'linear-gradient(90deg, var(--accent), #818cf8)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>

              {/* Task list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {activeProject.tasks?.map((task) => (
                  <div
                    key={task.id}
                    onClick={(e) => handleToggleTask(activeProject.id, task.id, e)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: task.done ? 'var(--text-tertiary)' : '#e2e8f0',
                      textDecoration: task.done ? 'line-through' : 'none',
                      cursor: 'pointer',
                      userSelect: 'none',
                      padding: '4px 6px',
                      borderRadius: 4,
                      background: task.done ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    {task.done ? (
                      <CheckSquare size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    ) : (
                      <Square size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    )}
                    <span style={{ flex: 1 }}>{task.text}</span>
                  </div>
                ))}
              </div>

              {/* Inline Add Task */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Add milestone task..."
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddInlineTask(activeProject.id)}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: '5px 8px',
                    background: '#000000',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    color: '#ffffff',
                  }}
                />
                <button
                  onClick={() => handleAddInlineTask(activeProject.id)}
                  style={{
                    padding: '5px 10px',
                    fontSize: 11,
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#ffffff',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {/* Project Temporary Documents Card */}
            <div
              style={{
                background: '#040405',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 'var(--radius-lg)',
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Paperclip size={14} style={{ color: '#38bdf8' }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#ffffff',
                    }}
                  >
                    Project Documents ({activeProject.documents?.length || 0})
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: '2px 5px',
                      borderRadius: 3,
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                    }}
                  >
                    Temporary
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => projectFileInputRef.current?.click()}
                  disabled={uploadingProjectDoc}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 8px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38bdf8',
                    borderRadius: 4,
                    cursor: uploadingProjectDoc ? 'not-allowed' : 'pointer',
                  }}
                  title="Upload temporary document for this project (LLM can see and analyze it)"
                >
                  <Plus size={12} />
                  <span>{uploadingProjectDoc ? 'Indexing...' : 'Upload Doc'}</span>
                </button>
              </div>

              {(!activeProject.documents || activeProject.documents.length === 0) ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '16px 10px',
                    color: 'var(--text-tertiary)',
                    fontSize: 11,
                    background: '#070709',
                    borderRadius: 6,
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <Paperclip size={18} style={{ margin: '0 auto 6px', opacity: 0.4, color: '#38bdf8' }} />
                  <p style={{ margin: '0 0 2px', color: '#cbd5e1' }}>No documents attached yet.</p>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-tertiary)' }}>
                    Upload a PDF or image so the LLM assistant can see and cite it.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {activeProject.documents.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: '#08080c',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        <FileText size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {doc.filename}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                            {doc.size ? `${(doc.size / 1024).toFixed(0)} KB • ` : ''}{doc.chunks || 1} chunks • Ready for LLM
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveProjectDoc(doc.id, doc.filename)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-tertiary)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Remove document from project"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Project Conversations History Card */}
            <div
              style={{
                background: '#040405',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 'var(--radius-lg)',
                padding: 14,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 280,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={14} style={{ color: 'var(--accent)' }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#ffffff',
                    }}
                  >
                    Project Chats ({projectConversations.length})
                  </span>
                </div>

                <button
                  onClick={handleNewProjectChat}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 8px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    color: '#818cf8',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  title="Start a new chat dedicated to this project"
                >
                  <Plus size={12} />
                  <span>New Chat</span>
                </button>
              </div>

              {/* Conversations List */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  overflowY: 'auto',
                  flex: 1,
                }}
              >
                {projectConversations.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '24px 12px',
                      color: 'var(--text-tertiary)',
                      fontSize: 12,
                    }}
                  >
                    <MessageSquare size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <p style={{ margin: '0 0 4px' }}>No chats in this project yet.</p>
                    <p style={{ margin: 0, fontSize: 11 }}>
                      Start one by typing on the right or clicking &quot;New Chat&quot;.
                    </p>
                  </div>
                ) : (
                  projectConversations.map((conv) => {
                    const isSelected = conv.id === activeConvId;
                    const isRenaming = renamingConvId === conv.id;

                    return (
                      <div
                        key={conv.id}
                        onClick={() => setActiveConvId(conv.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(99, 102, 241, 0.15)' : '#070709',
                          border: `1px solid ${
                            isSelected ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.04)'
                          }`,
                          transition: 'all 0.15s',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <MessageSquare
                            size={14}
                            style={{
                              color: isSelected ? 'var(--accent)' : 'var(--text-tertiary)',
                              flexShrink: 0,
                            }}
                          />

                          {isRenaming ? (
                            <input
                              type="text"
                              value={renameConvTitle}
                              onChange={(e) => setRenameConvTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(conv.id, e);
                                if (e.key === 'Escape') setRenamingConvId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              style={{
                                width: '100%',
                                background: '#000000',
                                border: '1px solid var(--accent)',
                                color: '#ffffff',
                                fontSize: 12,
                                padding: '2px 4px',
                                borderRadius: 3,
                              }}
                            />
                          ) : (
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: isSelected ? 600 : 400,
                                  color: isSelected ? '#ffffff' : '#cbd5e1',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {conv.title}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: 'var(--text-tertiary)',
                                  marginTop: 1,
                                }}
                              >
                                {conv.message_count ? `${conv.message_count} msgs • ` : ''}
                                {conv.updated_at
                                  ? new Date(conv.updated_at).toLocaleDateString([], {
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : 'Active'}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                          {isRenaming ? (
                            <button
                              onClick={(e) => handleSaveRename(conv.id, e)}
                              className="btn-icon"
                              style={{ padding: 3, color: 'var(--success)' }}
                              title="Save Title"
                            >
                              <Check size={12} />
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleStartRename(conv, e)}
                              className="btn-icon"
                              style={{ padding: 3, color: 'var(--text-tertiary)' }}
                              title="Rename Chat"
                            >
                              <Edit2 size={11} />
                            </button>
                          )}

                          <button
                            onClick={(e) => handleDeleteProjectConversation(conv.id, e)}
                            className="btn-icon"
                            style={{ padding: 3, color: 'var(--text-tertiary)' }}
                            title="Delete Chat"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--danger)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--text-tertiary)';
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Dedicated In-Project AI Chat Interface */}
          <div
            style={{
              background: '#030304',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Chat Sub-header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                background: '#040405',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                  {currentConv?.title || 'New Project Discussion'}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '2px 6px',
                    borderRadius: 3,
                  }}
                >
                  Qwen Local
                </span>
              </div>

              {activeConvId && (
                <button
                  onClick={(e) => handleDeleteProjectConversation(activeConvId, e)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--danger)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-tertiary)';
                  }}
                >
                  <Trash2 size={12} />
                  <span>Delete Chat</span>
                </button>
              )}
            </div>

            {/* Messages Scroll Area */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              {loadingConv ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                  Loading conversation...
                </div>
              ) : messages.length === 0 ? (
                /* Empty / Starter State */
                <div
                  style={{
                    margin: 'auto',
                    maxWidth: 580,
                    textAlign: 'center',
                    padding: '30px 20px',
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <FolderOpen size={26} style={{ color: 'var(--accent)' }} />
                  </div>

                  <h3
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: '#ffffff',
                      marginBottom: 8,
                      textShadow: '0 0 10px rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    {activeProject.title} AI Assistant
                  </h3>

                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                      marginBottom: 24,
                    }}
                  >
                    This chat is strictly linked to this project. Conversations, task synthesis, and
                    autonomous document generation are kept here and will not appear in your simple
                    chats.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      `Analyze our milestones and outline next execution steps for "${activeProject.title}".`,
                      `Draft a comprehensive executive report on our current project objectives.`,
                      `Review remaining incomplete tasks and synthesize an action checklist.`,
                    ].map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(prompt)}
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          background: '#060608',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: 8,
                          color: '#e2e8f0',
                          fontSize: 12,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                          e.currentTarget.style.background = '#0a0a10';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.background = '#060608';
                        }}
                      >
                        <span>{prompt}</span>
                        <ArrowRight size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Message Turns */
                messages.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  const generatedFiles = !isUser ? extractGeneratedFiles(msg.content) : [];

                  return (
                    <div
                      key={msg.id || idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isUser ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        alignSelf: isUser ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--text-tertiary)',
                          marginBottom: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>{isUser ? 'You' : 'Project Assistant (Qwen)'}</span>
                        <span>•</span>
                        <span>
                          {msg.created_at
                            ? new Date(msg.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'now'}
                        </span>
                      </div>

                      <div
                        style={{
                          padding: '12px 16px',
                          borderRadius: 12,
                          background: isUser ? '#101018' : '#07070a',
                          border: `1px solid ${
                            isUser ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.08)'
                          }`,
                          color: '#ffffff',
                          fontSize: 13,
                          lineHeight: 1.6,
                          position: 'relative',
                          width: '100%',
                          wordBreak: 'break-word',
                        }}
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>

                        {/* Generated Document Cards */}
                        {generatedFiles.length > 0 && <GeneratedFileCards files={generatedFiles} />}

                        {/* Copy button */}
                        {!isUser && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                            <button
                              onClick={() => copyToClipboard(msg.content, msg.id || idx)}
                              className="btn-icon"
                              style={{ padding: 4, color: 'var(--text-tertiary)' }}
                              title="Copy response"
                            >
                              {copiedId === (msg.id || idx) ? (
                                <Check size={12} style={{ color: 'var(--success)' }} />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Generating spinner */}
              {sending && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: '#07070a',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    width: 'fit-content',
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                  }}
                >
                  <Sparkles size={14} className="spin" style={{ color: 'var(--accent)' }} />
                  <span>Synthesizing project response...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div
              style={{
                padding: '12px 18px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                background: '#040405',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#000000',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 10,
                  padding: '6px 12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => projectFileInputRef.current?.click()}
                  disabled={uploadingProjectDoc}
                  title="📎 Attach temporary document to this project (AI can read and analyze)"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#94a3b8',
                    borderRadius: 6,
                    width: 30,
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: uploadingProjectDoc ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Paperclip size={14} />
                </button>
                <textarea
                  rows={1}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={`Ask anything about ${activeProject.title}...`}
                  disabled={sending}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: 13,
                    resize: 'none',
                    outline: 'none',
                    maxHeight: 120,
                  }}
                />

                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || sending}
                  style={{
                    background: inputMessage.trim() && !sending ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    cursor: inputMessage.trim() && !sending ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Send size={13} />
                  <span>Send</span>
                </button>
              </div>

              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                }}
              >
                <span>Press Enter to send, Shift+Enter for new line</span>
                <span>🔒 History saved to {activeProject.title}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: PROJECTS WORKSPACE DASHBOARD
  // =========================================================================
  return (
    <div className="workspace-page" style={{ padding: '24px 32px' }}>
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Folder size={26} style={{ color: 'var(--accent)' }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#ffffff' }}>
              Projects Workspace
            </h1>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Manage and execute dedicated AI projects. Each project maintains its own isolated
            conversations, deliverables, and milestone history.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleOpenCreateModal}
          style={{ padding: '8px 16px', fontSize: 13, gap: 6 }}
        >
          <Plus size={16} />
          <span>New Project</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="workspace-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-value">{projects.length}</div>
          <div className="stat-label">Total Projects</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            {activeCount}
          </div>
          <div className="stat-label">Active & In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success)' }}>
            {completedCount}
          </div>
          <div className="stat-label">Completed Projects</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: totalTasks > 0 && completedTasks === totalTasks ? 'var(--success)' : '#ffffff' }}>
            {totalTasks > 0 ? `${completedTasks}/${totalTasks}` : '—'}
          </div>
          <div className="stat-label">Project Milestones</div>
          {totalTasks > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {completedTasks} of {totalTasks} finished
            </div>
          )}
        </div>
      </div>

      {/* Projects Grid */}
      <div className="settings-section" style={{ marginTop: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
            Active Projects & Isolated Chats
          </h2>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {projects.length} configured
          </span>
        </div>

        {projects.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              background: '#040405',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <Folder size={36} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
            <h3 style={{ fontSize: 16, color: '#f8fafc', marginBottom: 6 }}>No Projects Created</h3>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: 13,
                maxWidth: 400,
                margin: '0 auto 16px',
              }}
            >
              Create your first project to organize AI tasks, notes, and research workflows.
            </p>
            <button className="btn btn-primary" onClick={handleOpenCreateModal}>
              <Plus size={14} />
              <span>Create Project</span>
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 16,
            }}
          >
            {projects.map((project) => {
              const projectChatCount = convCounts[project.id] || 0;

              return (
                <div
                  key={project.id}
                  style={{
                    background: '#050505',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'border-color 0.2s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  }}
                >
                  <div>
                    {/* Top tags row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: 'var(--accent)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                        }}
                      >
                        {project.category}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 4,
                            background:
                              project.status === 'Completed'
                                ? 'rgba(34, 197, 94, 0.15)'
                                : project.status === 'In Progress'
                                ? 'rgba(234, 179, 8, 0.15)'
                                : 'rgba(255, 255, 255, 0.08)',
                            color:
                              project.status === 'Completed'
                                ? '#4ade80'
                                : project.status === 'In Progress'
                                ? '#facc15'
                                : '#94a3b8',
                          }}
                        >
                          {project.status}
                        </span>

                        {/* Edit Project Button */}
                        <button
                          className="btn-icon"
                          onClick={(e) => handleOpenEditModal(project, e)}
                          title="Edit Project Details"
                          style={{
                            color: 'var(--text-tertiary)',
                            padding: 4,
                            borderRadius: 4,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--accent)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-tertiary)';
                          }}
                        >
                          <Edit2 size={13} />
                        </button>

                        {/* Delete Project Button */}
                        <button
                          className="btn-icon"
                          onClick={(e) => handleDeleteProject(project.id, e)}
                          title="Delete Project"
                          style={{
                            color: 'var(--text-tertiary)',
                            padding: 4,
                            borderRadius: 4,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--danger)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-tertiary)';
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <h3
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: '#ffffff',
                        margin: '0 0 6px',
                        textShadow: '0 0 8px rgba(255, 255, 255, 0.15)',
                      }}
                    >
                      {project.title}
                    </h3>

                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                        margin: '0 0 14px',
                      }}
                    >
                      {project.description}
                    </p>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                          marginBottom: 4,
                        }}
                      >
                        <span>Milestone Progress</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                          {project.progress}%
                        </span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: 5,
                          background: 'rgba(255, 255, 255, 0.08)',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${project.progress}%`,
                            height: '100%',
                            background:
                              project.progress === 100
                                ? 'var(--success)'
                                : 'linear-gradient(90deg, var(--accent), #818cf8)',
                            borderRadius: 3,
                            transition: 'width 0.3s',
                          }}
                        />
                      </div>
                    </div>

                    {/* Tasks Checklist */}
                    <div
                      style={{
                        background: '#000000',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px',
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 8,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>
                          Milestones ({project.tasks?.filter((t) => t.done).length || 0}/
                          {project.tasks?.length || 0})
                        </span>
                        {projectChatCount > 0 && (
                          <span style={{ color: 'var(--accent)', textTransform: 'none' }}>
                            {projectChatCount} {projectChatCount === 1 ? 'chat' : 'chats'} stored
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {project.tasks?.map((task) => (
                          <div
                            key={task.id}
                            onClick={(e) => handleToggleTask(project.id, task.id, e)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: 12,
                              color: task.done ? 'var(--text-tertiary)' : '#e2e8f0',
                              textDecoration: task.done ? 'line-through' : 'none',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                          >
                            {task.done ? (
                              <CheckSquare
                                size={14}
                                style={{ color: 'var(--success)', flexShrink: 0 }}
                              />
                            ) : (
                              <Square
                                size={14}
                                style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
                              />
                            )}
                            <span>{task.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Open Project Button */}
                  <button
                    className="btn btn-secondary"
                    onClick={() => setActiveProjectId(project.id)}
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      fontSize: 12,
                      padding: '9px 14px',
                      gap: 8,
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: '#ffffff',
                    }}
                  >
                    <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 600 }}>Open Project & Chat History</span>
                    <ArrowRight size={13} style={{ marginLeft: 'auto' }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          PROFESSIONAL CREATE & EDIT PROJECT MODAL
          ========================================================================= */}
      {showCreateModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowCreateModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 620,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#07070a',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.95), 0 0 30px rgba(99, 102, 241, 0.15)',
              borderRadius: 14,
              padding: '24px 28px',
              position: 'relative',
            }}
          >
            {/* Top Glow Bar */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: 'linear-gradient(90deg, #6366f1, #a855f7, #38bdf8)',
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
              }}
            />

            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Target size={20} style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>
                    {editingProject ? 'Edit Project Details' : 'Create Enterprise Project'}
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                    Establish an isolated workspace, autonomous deliverables, and milestone history.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowCreateModal(false)}
                style={{ color: 'var(--text-tertiary)', padding: 6 }}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveProjectModal}
              style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
            >
              {/* 1. Category Selector Chips */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#e2e8f0',
                    marginBottom: 8,
                  }}
                >
                  Project Domain / Category
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 8,
                  }}
                >
                  {PROJECT_CATEGORIES.map((cat) => {
                    const isSelected = modalCategory === cat.id;
                    const CatIcon = cat.icon;

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectCategory(cat.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderRadius: 8,
                          background: isSelected ? 'rgba(99, 102, 241, 0.15)' : '#040406',
                          border: `1px solid ${
                            isSelected ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.06)'
                          }`,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                        }}
                      >
                        <CatIcon size={16} style={{ color: cat.color, flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? '#ffffff' : '#cbd5e1',
                          }}
                        >
                          {cat.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Project Title Input & Quick Suggestions */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#e2e8f0',
                    }}
                  >
                    Project Title *
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {modalTitle.length}/100
                  </span>
                </div>

                <input
                  type="text"
                  placeholder="e.g. Executive Due Diligence & Market Review"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  maxLength={100}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#030305',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: 13,
                    outline: 'none',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.25)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                    e.currentTarget.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.5)';
                  }}
                />

                {/* Suggested Titles Pill Bar */}
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      marginBottom: 6,
                    }}
                  >
                    <Lightbulb size={12} style={{ color: '#facc15' }} />
                    <span>Quick Professional Title Ideas:</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {SUGGESTED_TITLES.map((title, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestedTitle(title)}
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: 4,
                          color: '#94a3b8',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#ffffff';
                          e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                          e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#94a3b8';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                        }}
                      >
                        + {title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Description & Scope */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#e2e8f0',
                    marginBottom: 6,
                  }}
                >
                  Scope & Strategic Objectives
                </label>
                <textarea
                  rows={3}
                  placeholder="Detail the deliverables, background context, and expected AI outputs..."
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#030305',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: 12,
                    outline: 'none',
                    resize: 'vertical',
                    lineHeight: 1.5,
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                  }}
                />
              </div>

              {/* 4. Structured Milestone Tasks Builder */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#e2e8f0',
                    }}
                  >
                    Milestones & Key Tasks ({modalTasks.length})
                  </label>

                  <button
                    type="button"
                    onClick={handleSuggestMilestones}
                    style={{
                      fontSize: 11,
                      color: 'var(--accent)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Sparkles size={11} />
                    <span>Auto-Suggest Milestones</span>
                  </button>
                </div>

                {/* Milestone Pills */}
                {modalTasks.length > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      marginBottom: 10,
                      maxHeight: 140,
                      overflowY: 'auto',
                      padding: 4,
                    }}
                  >
                    {modalTasks.map((taskText, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '6px 10px',
                          background: '#030305',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CheckCircle2 size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          <span>{taskText}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleModalRemoveTask(idx)}
                          className="btn-icon"
                          style={{ padding: 2, color: 'var(--text-tertiary)' }}
                          title="Remove milestone"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '12px 16px',
                      background: '#040406',
                      border: '1px dashed rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      textAlign: 'center',
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      marginBottom: 10,
                    }}
                  >
                    No milestones defined. Add custom tasks below or click &quot;Auto-Suggest Milestones&quot;.
                  </div>
                )}

                {/* Inline Add Milestone */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Add a measurable deliverable or task..."
                    value={modalNewTaskInput}
                    onChange={(e) => setModalNewTaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleModalAddTask();
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: '#030305',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 6,
                      color: '#ffffff',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleModalAddTask}
                    style={{
                      padding: '8px 14px',
                      background: 'rgba(99, 102, 241, 0.2)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      color: '#ffffff',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Plus size={13} />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 6,
                  paddingTop: 16,
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowCreateModal(false)}
                  style={{ fontSize: 13, padding: '8px 16px' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    fontSize: 13,
                    padding: '8px 20px',
                    gap: 8,
                    background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                    boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)',
                  }}
                >
                  <Check size={14} />
                  <span>{editingProject ? 'Save Changes' : 'Initialize Project'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Hidden File Input for Project Documents */}
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        style={{ display: 'none' }}
        onChange={handleProjectFileUpload}
      />
    </div>
  );
}
