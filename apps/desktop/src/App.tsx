import { listen } from '@tauri-apps/api/event';
import {
  type ClipboardEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from './api';
import { Icon } from './icons';
import { applyAgentEvent } from './state';
import type {
  AgentEvent,
  AppSettings,
  ApprovalMode,
  Artifact,
  ConversationTask,
  GitSnapshot,
  ModelOption,
  PendingPermission,
  Project,
  PromptAttachment,
  ProviderDescriptor,
  ReasoningEffort,
  RuntimeInfo,
  TaskMode,
  TaskStatus,
  TerminalEvent,
  ToolActivity,
} from './types';

const defaultModels: ModelOption[] = [{ id: '', name: 'Grok default' }];
const emptyGit: GitSnapshot = { branch: '', files: [], clean: true };

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<ConversationTask[]>([]);
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [settings, setSettings] = useState<AppSettings>({});
  const [runtime, setRuntime] = useState<RuntimeInfo>({ status: 'checking' });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [models, setModels] = useState<ModelOption[]>(defaultModels);
  const [contextUsage, setContextUsage] = useState<Record<string, number>>({});
  const [permission, setPermission] = useState<PendingPermission | null>(null);
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [fileMatches, setFileMatches] = useState<PromptAttachment[]>([]);
  const [fileQuery, setFileQuery] = useState<string | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'changes' | 'terminal' | 'artifacts'>('changes');
  const [git, setGit] = useState<GitSnapshot>(emptyGit);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string>>({});
  const [terminalActive, setTerminalActive] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPath, setSettingsPath] = useState('');
  const [projectContextOpen, setProjectContextOpen] = useState(false);
  const [projectContextId, setProjectContextId] = useState<string | null>(null);
  const [projectInstructions, setProjectInstructions] = useState('');
  const [projectMemory, setProjectMemory] = useState('');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLPreElement>(null);
  const selectedTaskRef = useRef<string | null>(null);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );
  const selectedProject = useMemo(() => {
    const id = selectedTask?.projectId ?? selectedProjectId;
    return projects.find((project) => project.id === id) ?? null;
  }, [projects, selectedProjectId, selectedTask]);
  const selectedStatus = selectedTask ? (taskStatuses[selectedTask.id] ?? 'idle') : 'idle';
  const busy = ['connecting', 'streaming', 'waiting_approval'].includes(selectedStatus);
  const artifacts = useMemo(
    () => extractArtifacts(selectedTask?.messages.map((message) => message.text) ?? []),
    [selectedTask?.messages],
  );
  const selectedArtifact =
    artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0] ?? null;
  const contextProject = projects.find((project) => project.id === projectContextId) ?? null;
  const terminalOutput = selectedTask
    ? (terminalOutputs[selectedTask.id] ?? 'Nolira Build persistent terminal\r\n')
    : '';

  useEffect(() => {
    selectedTaskRef.current = selectedTaskId;
    if (selectedTaskId) localStorage.setItem('nolira:selected-task', selectedTaskId);
    setAttachments([]);
    setFileMatches([]);
    setFileQuery(null);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedArtifactId || !artifacts.some((artifact) => artifact.id === selectedArtifactId)) {
      setSelectedArtifactId(artifacts[0]?.id ?? null);
    }
  }, [artifacts, selectedArtifactId]);

  const refreshGit = useCallback(async (taskId = selectedTaskRef.current) => {
    if (!taskId) return;
    setGitLoading(true);
    setGitError(null);
    try {
      const snapshot = await api.gitSnapshot(taskId);
      if (selectedTaskRef.current === taskId) setGit(snapshot);
    } catch (error) {
      if (selectedTaskRef.current === taskId) setGitError(String(error));
    } finally {
      if (selectedTaskRef.current === taskId) setGitLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const stops: Array<() => void> = [];

    const start = async () => {
      try {
        stops.push(
          await listen<AgentEvent>('agent-event', ({ payload }) => {
            if (disposed) return;
            setTasks((current) => applyAgentEvent(current, payload));
            switch (payload.kind) {
              case 'ready': {
                const nextModels = payload.data.models;
                if (Array.isArray(nextModels)) setModels(nextModels as ModelOption[]);
                break;
              }
              case 'status':
                setTaskStatuses((current) => ({
                  ...current,
                  [payload.taskId]: String(payload.data.status ?? 'idle') as TaskStatus,
                }));
                break;
              case 'permission':
                setPermission({
                  taskId: payload.taskId,
                  requestId: String(payload.data.requestId ?? ''),
                  toolName: String(payload.data.toolName ?? 'Tool'),
                  summary: String(payload.data.summary ?? 'Grok requests permission'),
                  detail: payload.data.detail ? String(payload.data.detail) : null,
                });
                setTaskStatuses((current) => ({
                  ...current,
                  [payload.taskId]: 'waiting_approval',
                }));
                break;
              case 'context_usage':
                setContextUsage((current) => ({
                  ...current,
                  [payload.taskId]: Number(payload.data.tokens ?? 0),
                }));
                break;
              case 'completed':
                setTaskStatuses((current) => ({ ...current, [payload.taskId]: 'idle' }));
                setPermission((current) => (current?.taskId === payload.taskId ? null : current));
                void refreshGit(payload.taskId);
                break;
              case 'cancelled':
                setTaskStatuses((current) => ({ ...current, [payload.taskId]: 'idle' }));
                break;
              case 'error':
                setTaskStatuses((current) => ({ ...current, [payload.taskId]: 'failed' }));
                setPermission((current) => (current?.taskId === payload.taskId ? null : current));
                setNotice(String(payload.data.message ?? 'Grok agent failed'));
                break;
            }
          }),
        );
        stops.push(
          await listen<TerminalEvent>('terminal-event', ({ payload }) => {
            if (disposed) return;
            if (payload.kind === 'exit') {
              setTerminalActive((current) => ({ ...current, [payload.taskId]: false }));
              return;
            }
            setTerminalOutputs((current) => {
              const next = `${current[payload.taskId] ?? ''}${cleanTerminalOutput(payload.data)}`;
              return { ...current, [payload.taskId]: next.slice(-240_000) };
            });
          }),
        );

        const payload = await api.bootstrap();
        if (disposed) return;
        setProjects(payload.projects);
        setTasks(payload.tasks);
        setProviders(payload.providers);
        setSettings(payload.settings);
        setSettingsPath(payload.settings.customEnginePath ?? '');
        setRuntime(payload.runtime);

        const savedTask = localStorage.getItem('nolira:selected-task');
        const initialTask =
          payload.tasks.find((task) => task.id === savedTask) ??
          [...payload.tasks].sort((left, right) => right.updatedAt - left.updatedAt)[0];
        if (initialTask) {
          setSelectedTaskId(initialTask.id);
          setSelectedProjectId(initialTask.projectId);
        } else if (payload.projects[0]) {
          setSelectedProjectId(payload.projects[0].id);
        }
      } catch (error) {
        if (!disposed) setNotice(String(error));
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void start();
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
    };
  }, [refreshGit]);

  useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [selectedTask?.messages, selectedTask?.tools, permission]);

  useEffect(() => {
    const element = terminalRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [terminalOutput]);

  useEffect(() => {
    if (selectedTaskId) void refreshGit(selectedTaskId);
  }, [refreshGit, selectedTaskId]);

  useEffect(() => {
    if (inspectorTab !== 'terminal' || !selectedTaskId) return;
    void api
      .terminalStart(selectedTaskId)
      .then(() => setTerminalActive((current) => ({ ...current, [selectedTaskId]: true })))
      .catch((error) => setNotice(String(error)));
  }, [inspectorTab, selectedTaskId]);

  useEffect(() => {
    if (fileQuery === null || !selectedTaskId) {
      setFileMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api
        .searchProjectFiles(selectedTaskId, fileQuery)
        .then(setFileMatches)
        .catch(() => setFileMatches([]));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [fileQuery, selectedTaskId]);

  const openProject = useCallback(async () => {
    try {
      const path = await api.chooseProject();
      if (!path) return;
      const project = await api.addProject(path);
      setProjects((current) =>
        current.some((item) => item.id === project.id) ? current : [...current, project],
      );
      setSelectedProjectId(project.id);
      const existing = tasks
        .filter((task) => task.projectId === project.id)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
      if (existing) {
        setSelectedTaskId(existing.id);
      } else {
        const task = await api.createTask(project.id);
        setTasks((current) => [...current, task]);
        setSelectedTaskId(task.id);
      }
    } catch (error) {
      setNotice(String(error));
    }
  }, [tasks]);

  const createTask = useCallback(async () => {
    if (!selectedProjectId) {
      await openProject();
      return;
    }
    try {
      const task = await api.createTask(selectedProjectId);
      setTasks((current) => [...current, task]);
      setSelectedTaskId(task.id);
      setComposer('');
    } catch (error) {
      setNotice(String(error));
    }
  }, [openProject, selectedProjectId]);

  const submitPrompt = useCallback(
    async (task: ConversationTask, prompt: string, files: PromptAttachment[]) => {
      setTaskStatuses((current) => ({ ...current, [task.id]: 'connecting' }));
      try {
        const updated = await api.sendPrompt({
          taskId: task.id,
          prompt,
          modelId: task.modelId,
          reasoningEffort: task.reasoningEffort,
          mode: task.mode,
          approvalMode: task.approvalMode,
          attachments: files,
        });
        setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } catch (error) {
        setTaskStatuses((current) => ({ ...current, [task.id]: 'failed' }));
        setNotice(String(error));
      }
    },
    [],
  );

  const forkSelectedTask = useCallback(async () => {
    if (!selectedTask || busy) return;
    setNotice('Forking the Grok session…');
    try {
      const fork = await api.forkTask(selectedTask.id);
      setTasks((current) => [...current, fork]);
      setSelectedTaskId(fork.id);
      setSelectedProjectId(fork.projectId);
      setNotice(null);
    } catch (error) {
      setNotice(String(error));
    }
  }, [busy, selectedTask]);

  const startReview = useCallback(async () => {
    if (!selectedTask || busy) return;
    setInspectorVisible(true);
    setInspectorTab('changes');
    await submitPrompt(
      selectedTask,
      'Review the current working tree without editing files. Focus on correctness, regressions, security, data loss, and missing tests. Report concrete findings ordered by severity with file paths and line references. If no issues are found, say so explicitly.',
      [],
    );
  }, [busy, selectedTask, submitPrompt]);

  const updatePreference = useCallback(
    async (
      patch: Partial<
        Pick<ConversationTask, 'modelId' | 'reasoningEffort' | 'mode' | 'approvalMode'>
      >,
    ) => {
      if (!selectedTask) return;
      const optimistic = { ...selectedTask, ...patch };
      setTasks((current) => current.map((task) => (task.id === optimistic.id ? optimistic : task)));
      try {
        const saved = await api.updateTaskPreferences(
          optimistic.id,
          optimistic.modelId,
          optimistic.reasoningEffort,
          optimistic.mode,
          optimistic.approvalMode,
        );
        setTasks((current) => current.map((task) => (task.id === saved.id ? saved : task)));
      } catch (error) {
        setTasks((current) =>
          current.map((task) => (task.id === selectedTask.id ? selectedTask : task)),
        );
        setNotice(String(error));
      }
    },
    [selectedTask],
  );

  const sendPrompt = useCallback(async () => {
    const prompt = composer.trim();
    if (!selectedTask || (!prompt && attachments.length === 0) || busy) return;
    if (prompt === '/fork') {
      setComposer('');
      await forkSelectedTask();
      return;
    }
    if (prompt === '/review') {
      setComposer('');
      await startReview();
      return;
    }
    if (prompt === '/plan') {
      setComposer('');
      await updatePreference({ mode: selectedTask.mode === 'plan' ? 'default' : 'plan' });
      return;
    }
    if (prompt === '/terminal') {
      setComposer('');
      setInspectorVisible(true);
      setInspectorTab('terminal');
      return;
    }
    const files = attachments;
    setComposer('');
    setAttachments([]);
    setFileMatches([]);
    setFileQuery(null);
    await submitPrompt(selectedTask, prompt, files);
  }, [
    attachments,
    busy,
    composer,
    forkSelectedTask,
    selectedTask,
    startReview,
    submitPrompt,
    updatePreference,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === 'n') {
        event.preventDefault();
        void createTask();
      } else if (event.key === 'o') {
        event.preventDefault();
        void openProject();
      } else if (event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (event.key.toLowerCase() === 'b' && event.altKey) {
        event.preventDefault();
        setInspectorVisible((value) => !value);
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebarVisible((value) => !value);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void sendPrompt();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [createTask, openProject, sendPrompt]);

  const selectTask = (task: ConversationTask) => {
    setSelectedTaskId(task.id);
    setSelectedProjectId(task.projectId);
    setPermission((current) => (current?.taskId === task.id ? current : null));
  };

  const addAttachments = (files: PromptAttachment[]) => {
    setAttachments((current) => {
      const paths = new Set(current.map((item) => item.path));
      return [...current, ...files.filter((file) => !paths.has(file.path))].slice(0, 20);
    });
  };

  const chooseAttachments = async () => {
    try {
      addAttachments(await api.chooseAttachments());
    } catch (error) {
      setNotice(String(error));
    }
  };

  const addWebFiles = async (files: File[]) => {
    for (const file of files.slice(0, 20)) {
      try {
        const dataBase64 = await fileToBase64(file);
        addAttachments([
          await api.savePastedAttachment({
            name: file.name || `clipboard-${Date.now()}`,
            mime: file.type || 'application/octet-stream',
            dataBase64,
          }),
        ]);
      } catch (error) {
        setNotice(String(error));
      }
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    void addWebFiles(files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingFiles(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void addWebFiles(files);
  };

  const updateComposer = (value: string) => {
    setComposer(value);
    const mention = value.match(/(?:^|\s)@([^\s@]*)$/);
    setFileQuery(mention ? mention[1] : null);
  };

  const selectFileMatch = (file: PromptAttachment) => {
    addAttachments([file]);
    const relative = displayPath(file.path, selectedProject?.path);
    setComposer((current) => current.replace(/@[^\s@]*$/, `@${relative} `));
    setFileQuery(null);
    setFileMatches([]);
  };

  const renameTask = async (task: ConversationTask) => {
    const title = window.prompt('Rename task', task.title)?.trim();
    if (!title || title === task.title) return;
    try {
      await api.renameTask(task.id, title);
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? { ...item, title } : item)),
      );
    } catch (error) {
      setNotice(String(error));
    }
  };

  const removeTask = async (task: ConversationTask) => {
    if (!window.confirm(`Delete “${task.title}”? The source folder will not be touched.`)) return;
    try {
      await api.deleteTask(task.id);
      const remaining = tasks.filter((item) => item.id !== task.id);
      setTasks(remaining);
      if (selectedTaskId === task.id) {
        const next = remaining.find((item) => item.projectId === task.projectId) ?? remaining[0];
        setSelectedTaskId(next?.id ?? null);
        setSelectedProjectId(next?.projectId ?? selectedProjectId);
      }
    } catch (error) {
      setNotice(String(error));
    }
  };

  const removeProject = async (project: Project) => {
    if (!window.confirm(`Remove “${project.name}” and its task history from Nolira Build?`)) return;
    try {
      await api.deleteProject(project.id);
      const remainingProjects = projects.filter((item) => item.id !== project.id);
      const remainingTasks = tasks.filter((task) => task.projectId !== project.id);
      setProjects(remainingProjects);
      setTasks(remainingTasks);
      if (selectedProjectId === project.id) {
        setSelectedProjectId(remainingProjects[0]?.id ?? null);
        setSelectedTaskId(remainingTasks[0]?.id ?? null);
      }
    } catch (error) {
      setNotice(String(error));
    }
  };

  const openProjectContext = (project: Project) => {
    setSelectedProjectId(project.id);
    setProjectContextId(project.id);
    setProjectInstructions(project.instructions ?? '');
    setProjectMemory(project.memory ?? '');
    setProjectContextOpen(true);
  };

  const saveProjectContext = async () => {
    if (!contextProject) return;
    try {
      const project = await api.updateProjectContext(
        contextProject.id,
        projectInstructions,
        projectMemory,
      );
      setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
      setProjectContextOpen(false);
    } catch (error) {
      setNotice(String(error));
    }
  };

  const answerPermission = async (decision: 'allow_once' | 'allow_session' | 'deny') => {
    if (!permission) return;
    try {
      await api.resolvePermission(permission.taskId, permission.requestId, decision);
      setTaskStatuses((current) => ({ ...current, [permission.taskId]: 'streaming' }));
      setPermission(null);
    } catch (error) {
      setNotice(String(error));
    }
  };

  const runTerminal = async () => {
    const command = terminalInput.trim();
    if (!selectedTask || !command) return;
    setTerminalInput('');
    try {
      if (!terminalActive[selectedTask.id]) {
        await api.terminalStart(selectedTask.id);
        setTerminalActive((current) => ({ ...current, [selectedTask.id]: true }));
      }
      await api.terminalWrite(selectedTask.id, `${command}\r`);
      window.setTimeout(() => void refreshGit(selectedTask.id), 450);
    } catch (error) {
      setNotice(String(error));
    }
  };

  const mutateGit = async (operation: 'stage' | 'unstage', paths: string[]) => {
    if (!selectedTask) return;
    try {
      if (operation === 'stage') await api.gitStage(selectedTask.id, paths);
      else await api.gitUnstage(selectedTask.id, paths);
      await refreshGit(selectedTask.id);
    } catch (error) {
      setNotice(String(error));
    }
  };

  const saveSettings = async () => {
    const nextSettings: AppSettings = { customEnginePath: settingsPath.trim() || null };
    try {
      const nextRuntime = await api.updateSettings(nextSettings);
      setSettings(nextSettings);
      setRuntime(nextRuntime);
      setSettingsOpen(false);
    } catch (error) {
      setNotice(String(error));
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <BrandMark size={54} />
        <div className="loading-line" />
        <span>Starting Nolira Build…</span>
      </div>
    );
  }

  return (
    <div
      className={`app-shell ${sidebarVisible ? '' : 'sidebar-hidden'} ${inspectorVisible ? '' : 'inspector-hidden'}`}
    >
      {sidebarVisible && (
        <aside className="sidebar">
          <div className="sidebar-titlebar" data-tauri-drag-region>
            <BrandMark size={28} />
            <strong data-tauri-drag-region>Nolira Build</strong>
            <button className="icon-button" onClick={openProject} title="Open project">
              <Icon name="folder" />
              <span className="button-plus">+</span>
            </button>
          </div>

          <button className="new-task-button" onClick={createTask}>
            <Icon name="edit" /> New task
          </button>

          <label className="sidebar-search">
            <Icon name="search" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks"
            />
          </label>

          <div className="project-list">
            {projects.map((project) => {
              const projectTasks = tasks
                .filter(
                  (task) =>
                    task.projectId === project.id &&
                    task.title.toLowerCase().includes(search.toLowerCase()),
                )
                .sort((left, right) => right.updatedAt - left.updatedAt);
              return (
                <section className="project-group" key={project.id}>
                  <div className="project-heading">
                    <Icon name="folder" />
                    <button onClick={() => setSelectedProjectId(project.id)}>{project.name}</button>
                    <span />
                    <button
                      className="mini-action"
                      onClick={() => openProjectContext(project)}
                      title="Project instructions and memory"
                    >
                      <Icon name="memory" />
                    </button>
                    <button
                      className="mini-action"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        void api.createTask(project.id).then((task) => {
                          setTasks((current) => [...current, task]);
                          setSelectedTaskId(task.id);
                        });
                      }}
                      title="New task"
                    >
                      <Icon name="plus" />
                    </button>
                    <button
                      className="mini-action danger-action"
                      onClick={() => void removeProject(project)}
                      title="Remove project"
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                  <div className="task-list">
                    {projectTasks.map((task) => (
                      <div
                        className={`task-row ${task.id === selectedTaskId ? 'active' : ''}`}
                        key={task.id}
                      >
                        <button className="task-select" onClick={() => selectTask(task)}>
                          <TaskIndicator status={taskStatuses[task.id] ?? 'idle'} />
                          <span>
                            <strong>{task.title}</strong>
                            <small>
                              {task.mode === 'plan' ? 'Plan · ' : ''}
                              {relativeTime(task.updatedAt)}
                            </small>
                          </span>
                        </button>
                        <div className="task-actions">
                          <button onClick={() => void renameTask(task)} title="Rename">
                            <Icon name="edit" />
                          </button>
                          <button onClick={() => void removeTask(task)} title="Delete">
                            <Icon name="trash" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="sidebar-footer">
            <span className={`runtime-dot ${runtime.status === 'ready' ? 'ready' : ''}`} />
            <span title={runtime.path ?? runtime.status}>
              {runtime.version ??
                (runtime.status === 'ready' ? 'Grok ready' : 'Runtime unavailable')}
            </span>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} title="Settings">
              <Icon name="settings" />
            </button>
          </div>
        </aside>
      )}

      <main className="main-pane">
        {selectedTask && selectedProject ? (
          <>
            <header className="workspace-header" data-tauri-drag-region>
              {!sidebarVisible && (
                <button className="icon-button" onClick={() => setSidebarVisible(true)}>
                  <Icon name="panel" />
                </button>
              )}
              <div className="workspace-title" data-tauri-drag-region>
                <strong>{selectedTask.title}</strong>
                <span>
                  <Icon name="folder" /> {selectedProject.path} · Grok Build
                </span>
              </div>
              <div className="header-actions">
                {selectedTask.mode === 'plan' && <span className="mode-badge">Plan</span>}
                {contextUsage[selectedTask.id] ? (
                  <span className="token-badge">
                    {contextUsage[selectedTask.id].toLocaleString()} tokens
                  </span>
                ) : null}
                <StatusBadge status={selectedStatus} />
                <button
                  className="icon-button"
                  onClick={() => void startReview()}
                  title="Review working tree"
                >
                  <Icon name="review" />
                </button>
                <button
                  className="icon-button"
                  onClick={() => void forkSelectedTask()}
                  title="Fork task"
                >
                  <Icon name="fork" />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setInspectorVisible((value) => !value)}
                  title="Toggle inspector"
                >
                  <Icon name="panel" />
                </button>
              </div>
            </header>

            <div className="transcript" ref={transcriptRef}>
              <div className="transcript-inner">
                {selectedTask.messages.length === 0 ? (
                  <div className="empty-task">
                    <BrandMark size={52} />
                    <h1>What should Grok build?</h1>
                    <p>
                      Grok can inspect, edit, run, and verify code in{' '}
                      <strong>{selectedProject.name}</strong>. Attach files, type @ to add project
                      context, or switch to Plan before implementation.
                    </p>
                    <div className="feature-row">
                      <span>Grok ACP</span>
                      <span>Plan & fork</span>
                      <span>Files & images</span>
                      <span>Artifacts</span>
                    </div>
                    <div className="starter-actions">
                      <button onClick={() => updateComposer('/review')}>Review changes</button>
                      <button onClick={() => void updatePreference({ mode: 'plan' })}>
                        Start in Plan
                      </button>
                      <button onClick={() => openProjectContext(selectedProject)}>
                        Add project context
                      </button>
                    </div>
                  </div>
                ) : (
                  selectedTask.messages.map((message) => (
                    <article className={`message ${message.role}`} key={message.id}>
                      {message.role === 'assistant' && message.thought ? (
                        <details className="thought-block">
                          <summary>
                            <Icon name="sparkles" /> Reasoning
                          </summary>
                          <pre>{message.thought}</pre>
                        </details>
                      ) : null}
                      {message.role === 'assistant' ? (
                        message.text ? (
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.text}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="working-label">
                            <span className="spinner" /> Grok is working…
                          </div>
                        )
                      ) : (
                        <div className="user-message-card">
                          {message.text && <p>{message.text}</p>}
                          {message.attachments.length > 0 && (
                            <AttachmentList
                              attachments={message.attachments}
                              projectPath={selectedProject.path}
                            />
                          )}
                        </div>
                      )}
                    </article>
                  ))
                )}

                {selectedTask.tools.length > 0 && <ToolTimeline tools={selectedTask.tools} />}

                {permission?.taskId === selectedTask.id && (
                  <div className="permission-card">
                    <div className="permission-title">
                      <Icon name="warning" />
                      <span>
                        <strong>Approval required</strong>
                        <small>{permission.toolName}</small>
                      </span>
                    </div>
                    <p>{permission.summary}</p>
                    {permission.detail && <pre>{permission.detail}</pre>}
                    <div className="permission-actions">
                      <button onClick={() => void answerPermission('deny')}>Deny</button>
                      <span />
                      <button onClick={() => void answerPermission('allow_session')}>
                        Allow for session
                      </button>
                      <button
                        className="primary-button"
                        onClick={() => void answerPermission('allow_once')}
                      >
                        Allow once
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer className="composer-area">
              <div
                className={`composer-card ${draggingFiles ? 'dragging' : ''}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDraggingFiles(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDraggingFiles(false)}
                onDrop={handleDrop}
              >
                {draggingFiles && <div className="drop-overlay">Drop files to attach</div>}
                {attachments.length > 0 && (
                  <div className="composer-attachments">
                    {attachments.map((attachment) => (
                      <span className="attachment-chip" key={attachment.path}>
                        <Icon name={attachment.mime?.startsWith('image/') ? 'artifact' : 'file'} />
                        <span>{displayPath(attachment.path, selectedProject.path)}</span>
                        <button
                          onClick={() =>
                            setAttachments((current) =>
                              current.filter((item) => item.path !== attachment.path),
                            )
                          }
                          title="Remove attachment"
                        >
                          <Icon name="close" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="composer-input-wrap">
                  <textarea
                    value={composer}
                    onChange={(event) => updateComposer(event.target.value)}
                    onPaste={handlePaste}
                    placeholder="Ask Grok to build…  @ files · / commands"
                    rows={3}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        event.preventDefault();
                        void sendPrompt();
                      }
                      if (event.key === 'Escape') {
                        setFileQuery(null);
                        setFileMatches([]);
                      }
                    }}
                  />
                  {fileQuery !== null && fileMatches.length > 0 && (
                    <div className="file-picker-popover">
                      <header>Project files</header>
                      {fileMatches.slice(0, 10).map((file) => (
                        <button key={file.path} onClick={() => selectFileMatch(file)}>
                          <Icon name="file" />
                          <span>{displayPath(file.path, selectedProject.path)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {composer.startsWith('/') && (
                    <SlashMenu value={composer} onSelect={updateComposer} />
                  )}
                </div>
                <div className="composer-controls">
                  <button
                    className="composer-icon-button"
                    onClick={() => void chooseAttachments()}
                    title="Attach files or images"
                  >
                    <Icon name="attachment" />
                  </button>
                  <span className="provider-chip">
                    <Icon name="sparkles" /> Grok
                  </span>
                  <select
                    value={selectedTask.modelId}
                    onChange={(event) => void updatePreference({ modelId: event.target.value })}
                    title="Model"
                  >
                    {models.map((model) => (
                      <option value={model.id} key={model.id || 'default'}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedTask.reasoningEffort}
                    onChange={(event) =>
                      void updatePreference({
                        reasoningEffort: event.target.value as ReasoningEffort,
                      })
                    }
                    title="Reasoning effort"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="xhigh">Extra high</option>
                  </select>
                  <select
                    value={selectedTask.mode}
                    onChange={(event) =>
                      void updatePreference({ mode: event.target.value as TaskMode })
                    }
                    title="Agent mode"
                  >
                    <option value="default">Build</option>
                    <option value="plan">Plan</option>
                  </select>
                  <select
                    value={selectedTask.approvalMode}
                    onChange={(event) =>
                      void updatePreference({ approvalMode: event.target.value as ApprovalMode })
                    }
                    title="Approval policy"
                  >
                    <option value="ask">Ask</option>
                    <option value="full_access">Full access</option>
                  </select>
                  <span />
                  {busy ? (
                    <button
                      className="send-button stop-button"
                      onClick={() => void api.cancelTask(selectedTask.id)}
                      title="Stop"
                    >
                      <Icon name="stop" />
                    </button>
                  ) : (
                    <>
                      <small>⌘↩</small>
                      <button
                        className="send-button"
                        disabled={!composer.trim() && attachments.length === 0}
                        onClick={() => void sendPrompt()}
                        title="Send"
                      >
                        <Icon name="send" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </footer>
          </>
        ) : (
          <div className="welcome-view" data-tauri-drag-region>
            {!sidebarVisible && (
              <button className="floating-sidebar-button" onClick={() => setSidebarVisible(true)}>
                <Icon name="panel" />
              </button>
            )}
            <BrandMark size={68} />
            <h1>Build with Grok</h1>
            <p>Open a local project to start a persistent Grok Build workspace.</p>
            <button className="primary-button large-button" onClick={openProject}>
              <Icon name="folder" /> Open Project
            </button>
          </div>
        )}
      </main>

      {inspectorVisible && selectedTask && (
        <aside className="inspector-pane">
          <div className="inspector-titlebar" data-tauri-drag-region>
            <div className="segmented-control three">
              <button
                className={inspectorTab === 'changes' ? 'active' : ''}
                onClick={() => setInspectorTab('changes')}
              >
                <Icon name="git" /> Changes
                {git.files.length > 0 && <em>{git.files.length}</em>}
              </button>
              <button
                className={inspectorTab === 'terminal' ? 'active' : ''}
                onClick={() => setInspectorTab('terminal')}
              >
                <Icon name="terminal" /> Terminal
              </button>
              <button
                className={inspectorTab === 'artifacts' ? 'active' : ''}
                onClick={() => setInspectorTab('artifacts')}
              >
                <Icon name="artifact" /> Artifacts
                {artifacts.length > 0 && <em>{artifacts.length}</em>}
              </button>
            </div>
            <button
              className="icon-button"
              onClick={() => {
                if (inspectorTab === 'changes') void refreshGit();
                if (inspectorTab === 'terminal' && selectedTask) {
                  setTerminalOutputs((current) => ({ ...current, [selectedTask.id]: '' }));
                }
              }}
              title={inspectorTab === 'changes' ? 'Refresh changes' : 'Clear panel'}
            >
              <Icon name={inspectorTab === 'changes' ? 'refresh' : 'trash'} />
            </button>
          </div>
          {inspectorTab === 'changes' && (
            <ChangesPanel
              snapshot={git}
              loading={gitLoading}
              error={gitError}
              onRefresh={() => void refreshGit()}
              onStage={(paths) => void mutateGit('stage', paths)}
              onUnstage={(paths) => void mutateGit('unstage', paths)}
              onReview={() => void startReview()}
            />
          )}
          {inspectorTab === 'terminal' && (
            <div className="terminal-panel">
              <div className="terminal-toolbar">
                <span className={terminalActive[selectedTask.id] ? 'online' : ''} />
                <strong>
                  {terminalActive[selectedTask.id] ? 'Shell running' : 'Shell stopped'}
                </strong>
                <button onClick={() => void api.terminalWrite(selectedTask.id, '\u0003')}>
                  ⌃C
                </button>
                <button
                  onClick={() => {
                    void api.terminalStop(selectedTask.id);
                    setTerminalActive((current) => ({ ...current, [selectedTask.id]: false }));
                  }}
                >
                  Stop
                </button>
              </div>
              <pre ref={terminalRef}>{terminalOutput}</pre>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void runTerminal();
                }}
              >
                <span>❯</span>
                <input
                  value={terminalInput}
                  onChange={(event) => setTerminalInput(event.target.value)}
                  placeholder="Run in project"
                />
                <button type="submit">↵</button>
              </form>
            </div>
          )}
          {inspectorTab === 'artifacts' && (
            <ArtifactsPanel
              artifacts={artifacts}
              selected={selectedArtifact}
              onSelect={setSelectedArtifactId}
              onSave={(artifact) =>
                void api
                  .saveArtifact(artifact.title, artifact.content, artifact.language)
                  .catch((error) => setNotice(String(error)))
              }
            />
          )}
        </aside>
      )}

      {notice && (
        <div className="notice-toast">
          <Icon name="warning" />
          <span>{notice}</span>
          <button onClick={() => setNotice(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}

      {projectContextOpen && contextProject && (
        <div className="modal-backdrop" onMouseDown={() => setProjectContextOpen(false)}>
          <div
            className="settings-modal context-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>{contextProject.name} context</h2>
                <p>Injected into every new Grok turn for this project</p>
              </div>
              <button className="icon-button" onClick={() => setProjectContextOpen(false)}>
                <Icon name="close" />
              </button>
            </header>
            <section>
              <h3>Project instructions</h3>
              <textarea
                value={projectInstructions}
                onChange={(event) => setProjectInstructions(event.target.value)}
                placeholder="Architecture rules, commands, coding conventions, verification requirements…"
                rows={8}
              />
              <p className="field-note">
                Stable instructions that shape how Grok works in this repository.
              </p>
            </section>
            <section>
              <h3>Project memory</h3>
              <textarea
                value={projectMemory}
                onChange={(event) => setProjectMemory(event.target.value)}
                placeholder="Decisions, constraints, known pitfalls, handoff notes…"
                rows={8}
              />
              <p className="field-note">
                User-controlled scoped memory. It stays local in Nolira Build.
              </p>
            </section>
            <footer>
              <button onClick={() => setProjectContextOpen(false)}>Cancel</button>
              <button className="primary-button" onClick={() => void saveProjectContext()}>
                Save context
              </button>
            </footer>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <div className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>Settings</h2>
                <p>Runtime and provider configuration</p>
              </div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)}>
                <Icon name="close" />
              </button>
            </header>
            <section>
              <h3>Grok runtime</h3>
              <label>
                <span>Executable</span>
                <input
                  value={settingsPath}
                  onChange={(event) => setSettingsPath(event.target.value)}
                  placeholder="Auto-detect ~/.grok/bin/grok"
                />
              </label>
              <div className="runtime-card">
                <span className={`runtime-dot ${runtime.status === 'ready' ? 'ready' : ''}`} />
                <div>
                  <strong>{runtime.version ?? runtime.status}</strong>
                  <small>{runtime.path ?? 'Choose a Grok executable or install the CLI.'}</small>
                </div>
              </div>
              <p className="settings-note">
                Credentials remain in the Grok CLI store. Nolira Build never copies API keys into
                project files.
              </p>
            </section>
            <section>
              <h3>Providers</h3>
              <div className="provider-list">
                {providers.map((provider) => (
                  <div className="provider-row" key={provider.id}>
                    <span className={provider.isAvailable ? 'available' : ''}>
                      <Icon name={provider.isAvailable ? 'check' : 'plus'} />
                    </span>
                    <div>
                      <strong>{provider.name}</strong>
                      <small>
                        {provider.detail} · {provider.transport}
                      </small>
                    </div>
                    <em>{provider.isAvailable ? 'Enabled' : 'Roadmap'}</em>
                  </div>
                ))}
              </div>
            </section>
            <footer>
              <button
                onClick={() => {
                  setSettingsPath(settings.customEnginePath ?? '');
                  setSettingsOpen(false);
                }}
              >
                Cancel
              </button>
              <button className="primary-button" onClick={() => void saveSettings()}>
                Save
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandMark({ size }: { size: number }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.29 }}>
      <Icon name="sparkles" style={{ width: size * 0.54, height: size * 0.54 }} />
    </div>
  );
}

function TaskIndicator({ status }: { status: TaskStatus }) {
  return status === 'connecting' || status === 'streaming' ? (
    <span className="spinner small" />
  ) : (
    <span className={`task-dot ${status}`} />
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const labels: Record<TaskStatus, string> = {
    idle: 'Ready',
    connecting: 'Connecting',
    streaming: 'Working',
    waiting_approval: 'Approval',
    failed: 'Needs attention',
  };
  return (
    <span className={`status-badge ${status}`}>
      {status === 'connecting' || status === 'streaming' ? (
        <span className="spinner small" />
      ) : (
        <span className="task-dot" />
      )}
      {labels[status]}
    </span>
  );
}

function ToolTimeline({ tools }: { tools: ToolActivity[] }) {
  return (
    <details className="tool-timeline" open>
      <summary>
        <Icon name="terminal" /> Agent activity · {tools.length}
      </summary>
      <div>
        {tools.map((tool) => (
          <div className="tool-row" key={tool.id}>
            <span className={`tool-status ${tool.status}`}>
              {tool.status === 'running' || tool.status === 'pending' ? (
                <span className="spinner small" />
              ) : (
                <Icon name={tool.status === 'completed' ? 'check' : 'warning'} />
              )}
            </span>
            <div>
              <strong>{tool.title}</strong>
              {tool.input && <pre>{tool.input}</pre>}
              {tool.output && <pre>{tool.output}</pre>}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function AttachmentList({
  attachments,
  projectPath,
}: {
  attachments: PromptAttachment[];
  projectPath: string;
}) {
  return (
    <div className="message-attachments">
      {attachments.map((attachment) => (
        <span key={attachment.path} title={attachment.path}>
          <Icon name={attachment.mime?.startsWith('image/') ? 'artifact' : 'file'} />
          {displayPath(attachment.path, projectPath)}
        </span>
      ))}
    </div>
  );
}

function SlashMenu({ value, onSelect }: { value: string; onSelect: (value: string) => void }) {
  const commands = [
    ['/plan', 'Toggle Plan / Build mode'],
    ['/review', 'Review current working tree'],
    ['/fork', 'Fork this Grok session'],
    ['/terminal', 'Open persistent terminal'],
  ].filter(([command]) => command.startsWith(value.toLowerCase()));
  if (!commands.length) return null;
  return (
    <div className="file-picker-popover slash-menu">
      <header>Commands</header>
      {commands.map(([command, detail]) => (
        <button key={command} onClick={() => onSelect(command)}>
          <code>{command}</code>
          <span>{detail}</span>
        </button>
      ))}
    </div>
  );
}

function ChangesPanel({
  snapshot,
  loading,
  error,
  onRefresh,
  onStage,
  onUnstage,
  onReview,
}: {
  snapshot: GitSnapshot;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onReview: () => void;
}) {
  const stageable = snapshot.files.filter((file) => file.unstaged).map((file) => file.path);
  const staged = snapshot.files.filter((file) => file.staged).map((file) => file.path);
  return (
    <div className="changes-panel">
      <header className="changes-toolbar">
        <div>
          <Icon name="git" />
          <span>
            <strong>{snapshot.branch || 'Working tree'}</strong>
            <small>
              {snapshot.files.length} changed file{snapshot.files.length === 1 ? '' : 's'}
            </small>
          </span>
        </div>
        <button onClick={onReview} disabled={!snapshot.files.length}>
          <Icon name="review" /> Review
        </button>
      </header>
      {snapshot.files.length > 0 && (
        <div className="bulk-git-actions">
          <button disabled={!stageable.length} onClick={() => onStage(stageable)}>
            Stage all
          </button>
          <button disabled={!staged.length} onClick={() => onUnstage(staged)}>
            Unstage all
          </button>
        </div>
      )}
      {loading && (
        <div className="panel-empty">
          <span className="spinner" /> Refreshing changes…
        </div>
      )}
      {!loading && error && (
        <div className="panel-empty error-panel">
          <Icon name="warning" />
          <p>{error}</p>
          <button onClick={onRefresh}>Try again</button>
        </div>
      )}
      {!loading && !error && snapshot.clean && (
        <div className="panel-empty">
          <Icon name="check" />
          <strong>Working tree clean</strong>
          <span>No staged or unstaged changes.</span>
        </div>
      )}
      {!loading && !error && snapshot.files.length > 0 && (
        <div className="change-file-list">
          {snapshot.files.map((file) => (
            <details className="change-file" key={file.path}>
              <summary>
                <span className={`git-status ${file.status === '?' ? 'untracked' : ''}`}>
                  {file.status}
                </span>
                <span className="change-path" title={file.path}>
                  {file.path}
                </span>
                <span className="change-stats">
                  {file.additions > 0 && <em>+{file.additions}</em>}
                  {file.deletions > 0 && <i>-{file.deletions}</i>}
                </span>
              </summary>
              <div className="change-actions">
                {file.unstaged && <button onClick={() => onStage([file.path])}>Stage</button>}
                {file.staged && <button onClick={() => onUnstage([file.path])}>Unstage</button>}
                {file.staged && <span>Staged</span>}
                {file.unstaged && <span>Working tree</span>}
              </div>
              <pre>{file.patch || 'Binary file or no textual diff available.'}</pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactsPanel({
  artifacts,
  selected,
  onSelect,
  onSave,
}: {
  artifacts: Artifact[];
  selected: Artifact | null;
  onSelect: (id: string) => void;
  onSave: (artifact: Artifact) => void;
}) {
  if (!selected) {
    return (
      <div className="panel-empty artifact-empty">
        <Icon name="artifact" />
        <strong>No artifacts yet</strong>
        <span>Ask Grok for an HTML or SVG prototype. Fenced output appears here live.</span>
      </div>
    );
  }
  return (
    <div className="artifacts-panel">
      <div className="artifact-tabs">
        {artifacts.map((artifact) => (
          <button
            className={artifact.id === selected.id ? 'active' : ''}
            onClick={() => onSelect(artifact.id)}
            key={artifact.id}
          >
            <Icon name="artifact" /> {artifact.title}
          </button>
        ))}
      </div>
      <div className="artifact-toolbar">
        <span>{selected.language.toUpperCase()} · sandboxed preview</span>
        <button onClick={() => void navigator.clipboard.writeText(selected.content)}>Copy</button>
        <button onClick={() => onSave(selected)}>Save</button>
      </div>
      <iframe
        className="artifact-preview"
        title={selected.title}
        sandbox="allow-scripts"
        srcDoc={artifactDocument(selected)}
      />
      <details className="artifact-source">
        <summary>Source</summary>
        <pre>{selected.content}</pre>
      </details>
    </div>
  );
}

function extractArtifacts(messages: string[]): Artifact[] {
  const artifacts: Artifact[] = [];
  const pattern = /```(html|svg)\s*\n([\s\S]*?)```/gi;
  messages.forEach((message, messageIndex) => {
    let match: RegExpExecArray | null;
    let artifactIndex = 0;
    while ((match = pattern.exec(message)) !== null) {
      const language = match[1].toLowerCase();
      artifacts.push({
        id: `${messageIndex}-${match.index}`,
        title: `${language === 'svg' ? 'SVG' : 'HTML'} artifact ${artifactIndex + 1}`,
        language,
        content: match[2].trim(),
      });
      artifactIndex += 1;
    }
  });
  return artifacts;
}

function artifactDocument(artifact: Artifact) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'">`;
  if (artifact.language === 'svg') {
    return `<!doctype html><html><head>${policy}<style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100%}</style></head><body>${artifact.content}</body></html>`;
  }
  if (/<html[\s>]/i.test(artifact.content)) {
    return artifact.content.replace(/<head([^>]*)>/i, `<head$1>${policy}`);
  }
  return `<!doctype html><html><head>${policy}<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${artifact.content}</body></html>`;
}

function displayPath(path: string, projectPath?: string) {
  if (projectPath && path.startsWith(`${projectPath}/`)) return path.slice(projectPath.length + 1);
  return path.split('/').pop() || path;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Cannot read file'));
    reader.onload = () => resolve(String(reader.result).split(',').pop() ?? '');
    reader.readAsDataURL(file);
  });
}

function cleanTerminalOutput(value: string) {
  const withoutEscapes = value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[@-_]/g, '')
    .replace(/\u001b.*$/g, '');
  let resolved = '';
  for (const character of withoutEscapes.replace(/\r\n/g, '\n').replace(/\r/g, '\n')) {
    if (character === '\b') resolved = resolved.slice(0, -1);
    else if (character === '\n' || character === '\t' || character >= ' ') resolved += character;
  }
  return resolved.replace(/\n{3,}/g, '\n\n');
}

function relativeTime(timestamp: number) {
  const delta = Date.now() - timestamp;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
