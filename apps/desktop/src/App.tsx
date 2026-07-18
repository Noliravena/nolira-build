import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from './api';
import { Icon } from './icons';
import { applyAgentEvent } from './state';
import type {
  AgentEvent,
  AppSettings,
  ConversationTask,
  ModelOption,
  PendingPermission,
  Project,
  ProviderDescriptor,
  ReasoningEffort,
  RuntimeInfo,
  TaskStatus,
  ToolActivity,
} from './types';

const defaultModels: ModelOption[] = [{ id: '', name: 'Grok default' }];

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
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'changes' | 'terminal'>('changes');
  const [gitSummary, setGitSummary] = useState('Select a task to inspect its working tree.');
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('Nolira Build terminal\n');
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPath, setSettingsPath] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    selectedTaskRef.current = selectedTaskId;
    if (selectedTaskId) localStorage.setItem('nolira:selected-task', selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;

    const start = async () => {
      try {
        stopListening = await listen<AgentEvent>('agent-event', ({ payload }) => {
          if (disposed) return;
          setTasks((current) => applyAgentEvent(current, payload));

          switch (payload.kind) {
            case 'ready': {
              const nextModels = payload.data.models;
              if (Array.isArray(nextModels)) setModels(nextModels as ModelOption[]);
              break;
            }
            case 'status': {
              const status = String(payload.data.status ?? 'idle') as TaskStatus;
              setTaskStatuses((current) => ({ ...current, [payload.taskId]: status }));
              break;
            }
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
              if (selectedTaskRef.current === payload.taskId) {
                void api.gitSnapshot(payload.taskId).then(setGitSummary).catch(() => undefined);
              }
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
        });

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
          [...payload.tasks].sort((a, b) => b.updatedAt - a.updatedAt)[0];
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
      stopListening?.();
    };
  }, []);

  useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [selectedTask?.messages, selectedTask?.tools, permission]);

  const refreshGit = useCallback(async (taskId = selectedTaskId) => {
    if (!taskId) return;
    setGitSummary('Refreshing…');
    try {
      setGitSummary(await api.gitSnapshot(taskId));
    } catch (error) {
      setGitSummary(String(error));
    }
  }, [selectedTaskId]);

  useEffect(() => {
    if (selectedTaskId) void refreshGit(selectedTaskId);
  }, [refreshGit, selectedTaskId]);

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
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
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

  const sendPrompt = useCallback(async () => {
    const prompt = composer.trim();
    if (!selectedTask || !prompt || busy) return;
    setComposer('');
    setTaskStatuses((current) => ({ ...current, [selectedTask.id]: 'connecting' }));
    try {
      const updated = await api.sendPrompt({
        taskId: selectedTask.id,
        prompt,
        modelId: selectedTask.modelId,
        reasoningEffort: selectedTask.reasoningEffort,
      });
      setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
    } catch (error) {
      setTaskStatuses((current) => ({ ...current, [selectedTask.id]: 'failed' }));
      setNotice(String(error));
    }
  }, [busy, composer, selectedTask]);

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

  const updateSelectedTask = (patch: Partial<ConversationTask>) => {
    if (!selectedTaskId) return;
    setTasks((current) =>
      current.map((task) => (task.id === selectedTaskId ? { ...task, ...patch } : task)),
    );
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
    if (!selectedTask || !command || terminalRunning) return;
    setTerminalInput('');
    setTerminalRunning(true);
    setTerminalOutput((current) => `${current}\n❯ ${command}\n`);
    try {
      const output = await api.runTerminalCommand(selectedTask.id, command);
      setTerminalOutput((current) => `${current}${output}${output.endsWith('\n') ? '' : '\n'}`);
      void refreshGit(selectedTask.id);
    } catch (error) {
      setTerminalOutput((current) => `${current}${String(error)}\n`);
    } finally {
      setTerminalRunning(false);
    }
  };

  const saveSettings = async () => {
    const nextSettings: AppSettings = {
      customEnginePath: settingsPath.trim() || null,
    };
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
            <Icon name="edit" />
            New task
          </button>

          <label className="sidebar-search">
            <Icon name="search" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" />
          </label>

          <div className="project-list">
            {projects.map((project) => {
              const projectTasks = tasks
                .filter(
                  (task) =>
                    task.projectId === project.id &&
                    task.title.toLowerCase().includes(search.toLowerCase()),
                )
                .sort((a, b) => b.updatedAt - a.updatedAt);
              return (
                <section className="project-group" key={project.id}>
                  <div className="project-heading">
                    <Icon name="folder" />
                    <button onClick={() => setSelectedProjectId(project.id)}>{project.name}</button>
                    <span />
                    <button className="mini-action" onClick={() => {
                      setSelectedProjectId(project.id);
                      void api.createTask(project.id).then((task) => {
                        setTasks((current) => [...current, task]);
                        setSelectedTaskId(task.id);
                      });
                    }} title="New task">
                      <Icon name="plus" />
                    </button>
                    <button className="mini-action danger-action" onClick={() => void removeProject(project)} title="Remove project">
                      <Icon name="trash" />
                    </button>
                  </div>
                  <div className="task-list">
                    {projectTasks.map((task) => (
                      <div className={`task-row ${task.id === selectedTaskId ? 'active' : ''}`} key={task.id}>
                        <button className="task-select" onClick={() => selectTask(task)}>
                          <TaskIndicator status={taskStatuses[task.id] ?? 'idle'} />
                          <span>
                            <strong>{task.title}</strong>
                            <small>{relativeTime(task.updatedAt)}</small>
                          </span>
                        </button>
                        <div className="task-actions">
                          <button onClick={() => void renameTask(task)} title="Rename"><Icon name="edit" /></button>
                          <button onClick={() => void removeTask(task)} title="Delete"><Icon name="trash" /></button>
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
              {runtime.version ?? (runtime.status === 'ready' ? 'Grok ready' : 'Runtime unavailable')}
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
                <button className="icon-button" onClick={() => setSidebarVisible(true)}><Icon name="panel" /></button>
              )}
              <div className="workspace-title" data-tauri-drag-region>
                <strong>{selectedTask.title}</strong>
                <span><Icon name="folder" /> {selectedProject.path} · Grok Build</span>
              </div>
              <div className="header-actions">
                {contextUsage[selectedTask.id] ? (
                  <span className="token-badge">{contextUsage[selectedTask.id].toLocaleString()} tokens</span>
                ) : null}
                <StatusBadge status={selectedStatus} />
                <button className="icon-button" onClick={() => setInspectorVisible((value) => !value)} title="Toggle inspector">
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
                    <p>Grok can inspect, edit, run, and verify code in <strong>{selectedProject.name}</strong>. You stay in control of tool approvals.</p>
                    <div className="feature-row">
                      <span>ACP streaming</span><span>Tool approvals</span><span>Git-aware</span>
                    </div>
                  </div>
                ) : (
                  selectedTask.messages.map((message) => (
                    <article className={`message ${message.role}`} key={message.id}>
                      {message.role === 'assistant' && message.thought ? (
                        <details className="thought-block">
                          <summary><Icon name="sparkles" /> Reasoning</summary>
                          <pre>{message.thought}</pre>
                        </details>
                      ) : null}
                      {message.role === 'assistant' ? (
                        message.text ? (
                          <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>
                        ) : (
                          <div className="working-label"><span className="spinner" /> Grok is working…</div>
                        )
                      ) : (
                        <p>{message.text}</p>
                      )}
                    </article>
                  ))
                )}

                {selectedTask.tools.length > 0 && <ToolTimeline tools={selectedTask.tools} />}

                {permission?.taskId === selectedTask.id && (
                  <div className="permission-card">
                    <div className="permission-title"><Icon name="warning" /><span><strong>Approval required</strong><small>{permission.toolName}</small></span></div>
                    <p>{permission.summary}</p>
                    {permission.detail && <pre>{permission.detail}</pre>}
                    <div className="permission-actions">
                      <button onClick={() => void answerPermission('deny')}>Deny</button>
                      <span />
                      <button onClick={() => void answerPermission('allow_session')}>Allow for session</button>
                      <button className="primary-button" onClick={() => void answerPermission('allow_once')}>Allow once</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer className="composer-area">
              <div className="composer-card">
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder="Ask Grok to build, inspect, or explain…"
                  rows={3}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void sendPrompt();
                    }
                  }}
                />
                <div className="composer-controls">
                  <span className="provider-chip"><Icon name="sparkles" /> Grok</span>
                  <select value={selectedTask.modelId} onChange={(event) => updateSelectedTask({ modelId: event.target.value })}>
                    {models.map((model) => <option value={model.id} key={model.id || 'default'}>{model.name}</option>)}
                  </select>
                  <select value={selectedTask.reasoningEffort} onChange={(event) => updateSelectedTask({ reasoningEffort: event.target.value as ReasoningEffort })}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option>
                  </select>
                  <span />
                  {busy ? (
                    <button className="send-button stop-button" onClick={() => void api.cancelTask(selectedTask.id)} title="Stop"><Icon name="stop" /></button>
                  ) : (
                    <><small>⌘↩ to send</small><button className="send-button" disabled={!composer.trim()} onClick={() => void sendPrompt()} title="Send"><Icon name="send" /></button></>
                  )}
                </div>
              </div>
            </footer>
          </>
        ) : (
          <div className="welcome-view" data-tauri-drag-region>
            {!sidebarVisible && <button className="floating-sidebar-button" onClick={() => setSidebarVisible(true)}><Icon name="panel" /></button>}
            <BrandMark size={68} />
            <h1>Build with Grok</h1>
            <p>Open a local project to start a Grok Build task.</p>
            <button className="primary-button large-button" onClick={openProject}><Icon name="folder" /> Open Project</button>
          </div>
        )}
      </main>

      {inspectorVisible && selectedTask && (
        <aside className="inspector-pane">
          <div className="inspector-titlebar" data-tauri-drag-region>
            <div className="segmented-control">
              <button className={inspectorTab === 'changes' ? 'active' : ''} onClick={() => setInspectorTab('changes')}><Icon name="git" />Changes</button>
              <button className={inspectorTab === 'terminal' ? 'active' : ''} onClick={() => setInspectorTab('terminal')}><Icon name="terminal" />Terminal</button>
            </div>
            <button className="icon-button" onClick={() => inspectorTab === 'changes' ? void refreshGit() : setTerminalOutput('Nolira Build terminal\n')}>
              <Icon name={inspectorTab === 'changes' ? 'refresh' : 'trash'} />
            </button>
          </div>
          {inspectorTab === 'changes' ? (
            <pre className="code-panel">{gitSummary}</pre>
          ) : (
            <div className="terminal-panel">
              <pre>{terminalOutput}</pre>
              <form onSubmit={(event) => { event.preventDefault(); void runTerminal(); }}>
                <span>❯</span>
                <input value={terminalInput} onChange={(event) => setTerminalInput(event.target.value)} placeholder="Run in project" disabled={terminalRunning} />
                {terminalRunning ? <span className="spinner" /> : <button type="submit">↵</button>}
              </form>
            </div>
          )}
        </aside>
      )}

      {notice && (
        <div className="notice-toast"><Icon name="warning" /><span>{notice}</span><button onClick={() => setNotice(null)}><Icon name="close" /></button></div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <div className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><h2>Settings</h2><p>Runtime and provider configuration</p></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><Icon name="close" /></button></header>
            <section>
              <h3>Grok runtime</h3>
              <label><span>Executable</span><input value={settingsPath} onChange={(event) => setSettingsPath(event.target.value)} placeholder="Auto-detect ~/.grok/bin/grok" /></label>
              <div className="runtime-card"><span className={`runtime-dot ${runtime.status === 'ready' ? 'ready' : ''}`} /><div><strong>{runtime.version ?? runtime.status}</strong><small>{runtime.path ?? 'Choose a Grok executable or install the CLI.'}</small></div></div>
              <p className="settings-note">Credentials remain in the Grok CLI store. Nolira Build never copies API keys into project files.</p>
            </section>
            <section>
              <h3>Providers</h3>
              <div className="provider-list">
                {providers.map((provider) => (
                  <div className="provider-row" key={provider.id}><span className={provider.isAvailable ? 'available' : ''}><Icon name={provider.isAvailable ? 'check' : 'plus'} /></span><div><strong>{provider.name}</strong><small>{provider.detail} · {provider.transport}</small></div><em>{provider.isAvailable ? 'Enabled' : 'Roadmap'}</em></div>
                ))}
              </div>
            </section>
            <footer><button onClick={() => { setSettingsPath(settings.customEnginePath ?? ''); setSettingsOpen(false); }}>Cancel</button><button className="primary-button" onClick={() => void saveSettings()}>Save</button></footer>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandMark({ size }: { size: number }) {
  return <div className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.29 }}><Icon name="sparkles" style={{ width: size * 0.54, height: size * 0.54 }} /></div>;
}

function TaskIndicator({ status }: { status: TaskStatus }) {
  return status === 'connecting' || status === 'streaming' ? <span className="spinner small" /> : <span className={`task-dot ${status}`} />;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const labels: Record<TaskStatus, string> = { idle: 'Ready', connecting: 'Connecting', streaming: 'Working', waiting_approval: 'Approval', failed: 'Needs attention' };
  return <span className={`status-badge ${status}`}>{status === 'connecting' || status === 'streaming' ? <span className="spinner small" /> : <span className="task-dot" />}{labels[status]}</span>;
}

function ToolTimeline({ tools }: { tools: ToolActivity[] }) {
  return (
    <details className="tool-timeline" open>
      <summary><Icon name="terminal" />Agent activity · {tools.length}</summary>
      <div>{tools.map((tool) => <div className="tool-row" key={tool.id}><span className={`tool-status ${tool.status}`}>{tool.status === 'running' || tool.status === 'pending' ? <span className="spinner small" /> : <Icon name={tool.status === 'completed' ? 'check' : 'warning'} />}</span><div><strong>{tool.title}</strong>{tool.input && <pre>{tool.input}</pre>}{tool.output && <pre>{tool.output}</pre>}</div></div>)}</div>
    </details>
  );
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
