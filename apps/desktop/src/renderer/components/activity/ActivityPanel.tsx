import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Icon, type IconName } from "../../icons"
import { formatBytes, formatDuration, formatTime } from "../../lib/format"
import { isMac } from "../../lib/platform"
import type {
  Project,
  RuntimeStatus,
  Task,
  ToolPart,
  WorkspaceChange,
  WorkspaceDiff,
  WorkspaceFile,
  WorkspaceFileContent,
} from "../../types"
import { RuntimeDot } from "../chrome/RuntimeDot"
import { StatusDot } from "../chrome/StatusDot"

export interface ActivityPanelProps {
  task: Task | null
  project: Project | null
  runtime: RuntimeStatus
  onClose: () => void
  onNotify: (message: string) => void
}

export type ActivityPanelTab = "activity" | "files" | "changes" | "info"

export function ActivityPanel({
  task,
  project,
  runtime,
  onClose,
  onNotify,
}: ActivityPanelProps) {
  const [tab, setTab] = useState<ActivityPanelTab>("activity")
  const [requestedFile, setRequestedFile] = useState<string>()
  const plan = task?.plan ?? []
  const goal = task?.goal
  const subagents = task?.subagents ?? []
  const backgroundTasks = task?.backgroundTasks ?? []
  const tools = useMemo(
    () =>
      (task?.messages ?? []).flatMap((message) =>
        message.parts.filter((part): part is ToolPart => part.type === "tool"),
      ),
    [task?.messages],
  )

  return (
    <aside className="activity-panel" id="activity-panel">
      <div className="panel-header drag-region">
        <div
          className="panel-tabs no-drag"
          role="tablist"
          aria-label="Details panel sections"
        >
          {(
            [
              ["activity", "Activity"],
              ["files", "Files"],
              ["changes", "Changes"],
              ["info", "Info"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
              id={`activity-${value}-tab`}
              role="tab"
              aria-controls={`activity-${value}-panel`}
              aria-selected={tab === value}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="icon-button no-drag"
          onClick={onClose}
          aria-label="Close details panel"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {tab === "activity" && (
        <div
          className="activity-content"
          id="activity-activity-panel"
          role="tabpanel"
          aria-labelledby="activity-activity-tab"
        >
          {goal ||
          plan.length > 0 ||
          tools.length > 0 ||
          subagents.length > 0 ||
          backgroundTasks.length > 0 ? (
            <>
              {goal && (
                <div className={`activity-goal goal-${goal.status}`}>
                  <span className="eyebrow">Goal · {goal.status}</span>
                  <strong>{goal.objective || "Active goal"}</strong>
                  {(goal.message || goal.lastEvent) && (
                    <p>{goal.message ?? goal.lastEvent}</p>
                  )}
                  {goal.elapsedMs !== undefined && (
                    <small>{formatDuration(goal.elapsedMs)}</small>
                  )}
                </div>
              )}
              {plan.length > 0 && (
                <div className="activity-plan">
                  <span className="eyebrow">Plan</span>
                  <ol>
                    {plan.map((step, index) => (
                      <li key={`${index}-${step}`}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              {tools.length > 0 && (
                <div className="activity-timeline">
                  {tools.map((tool) => (
                    <div className="activity-item" key={tool.id}>
                      <span className={`timeline-node node-${tool.status}`}>
                        {tool.status === "success" ? (
                          <Icon name="check" size={11} />
                        ) : (
                          <Icon name={tool.kind === "terminal" ? "terminal" : "code"} size={13} />
                        )}
                      </span>
                      <div>
                        <strong>{tool.title}</strong>
                        {tool.description && <p>{tool.description}</p>}
                        <small>{tool.status}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {subagents.length > 0 && (
                <div className="activity-group">
                  <span className="eyebrow">Subagents</span>
                  <div className="subagent-list">
                    {subagents.map((subagent) => (
                      <div className="subagent-item" key={subagent.id}>
                        <span className={`subagent-node subagent-${subagent.status}`}>
                          {subagent.phase === "finished" ? (
                            <Icon
                              name={subagent.error ? "close" : "check"}
                              size={11}
                            />
                          ) : (
                            <span className="status-pulse" />
                          )}
                        </span>
                        <div>
                          <strong>{subagent.type ?? "Subagent"}</strong>
                          <p>{subagent.description ?? subagent.id}</p>
                          <small>
                            {[
                              subagent.status,
                              subagent.turnCount !== undefined
                                ? `${subagent.turnCount} turns`
                                : undefined,
                              subagent.toolCallCount !== undefined
                                ? `${subagent.toolCallCount} tools`
                                : undefined,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {backgroundTasks.length > 0 && (
                <div className="activity-group">
                  <span className="eyebrow">Background tasks</span>
                  <div className="background-task-list">
                    {backgroundTasks.map((backgroundTask) => (
                      <div className="background-task-item" key={backgroundTask.id}>
                        <span
                          className={`background-task-node task-${backgroundTask.phase}`}
                        >
                          {backgroundTask.phase === "completed" ? (
                            <Icon
                              name={backgroundTask.success === false ? "close" : "check"}
                              size={11}
                            />
                          ) : backgroundTask.isMonitor ? (
                            <Icon name="activity" size={12} />
                          ) : (
                            <span className="status-pulse" />
                          )}
                        </span>
                        <div>
                          <strong>
                            {backgroundTask.description ??
                              backgroundTask.command ??
                              backgroundTask.id}
                          </strong>
                          {(backgroundTask.eventText || backgroundTask.output) && (
                            <p>
                              {backgroundTask.eventText ?? backgroundTask.output}
                            </p>
                          )}
                          <small>
                            {[
                              backgroundTask.phase,
                              backgroundTask.exitCode !== undefined &&
                              backgroundTask.exitCode !== null
                                ? `exit ${backgroundTask.exitCode}`
                                : undefined,
                              backgroundTask.durationMs !== undefined
                                ? formatDuration(backgroundTask.durationMs)
                                : undefined,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <PanelEmpty
              icon="activity"
              title="No activity yet"
              text="Tool calls and workspace actions will appear here."
            />
          )}
        </div>
      )}

      {tab === "files" && (
        <WorkspaceFilesPanel
          onNotify={onNotify}
          project={project}
          requestedPath={requestedFile}
        />
      )}

      {tab === "changes" && (
        <WorkspaceChangesPanel
          onNotify={onNotify}
          onOpenFile={(path) => {
            setRequestedFile(path)
            setTab("files")
          }}
          project={project}
        />
      )}

      {tab === "info" && (
        <div
          className="task-info-content"
          id="activity-info-panel"
          role="tabpanel"
          aria-labelledby="activity-info-tab"
        >
          <InfoRow label="Status">
            {task ? (
              <span className="inline-status"><StatusDot status={task.status} />{task.status}</span>
            ) : "—"}
          </InfoRow>
          <InfoRow label="Workspace">{project?.name ?? "—"}</InfoRow>
          <InfoRow label="Model">{task?.model ?? "—"}</InfoRow>
          <InfoRow label="Effort">{task?.effort ?? "—"}</InfoRow>
          <InfoRow label="Permissions">
            {task?.permissionMode ?? "—"}
          </InfoRow>
          <InfoRow label="Session">
            <code>{task?.sessionId ?? "Not started"}</code>
          </InfoRow>
          <InfoRow label="Context">
            {task?.contextTokens
              ? `${task.contextTokens.toLocaleString()} tokens`
              : "—"}
          </InfoRow>
          <div className="info-section-title">Runtime</div>
          <InfoRow label="Grok">
            <span className="inline-status">
              <RuntimeDot runtime={runtime} />
              {runtime.version ?? runtime.state}
            </span>
          </InfoRow>
          {runtime.binaryPath && (
            <button
              className="runtime-path"
              onClick={() => window.nolira?.openPath(runtime.binaryPath!)}
              title={runtime.binaryPath}
            >
              <Icon name="terminal" size={15} />
              <span>{runtime.binaryPath}</span>
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

export function WorkspaceFilesPanel({
  project,
  requestedPath,
  onNotify,
}: {
  project: Project | null
  requestedPath?: string
  onNotify: (message: string) => void
}) {
  const [query, setQuery] = useState("")
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [opened, setOpened] = useState<WorkspaceFileContent | null>(null)
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const dirty = Boolean(opened && draft !== opened.content)

  useEffect(() => {
    if (!window.nolira || !project) {
      setFiles([])
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      void window.nolira!
        .invoke("workspace.files", {
          projectId: project.id,
          query,
          limit: 120,
        })
        .then((response) => {
          if (!alive) return
          if (!response.ok) throw new Error(response.error.message)
          setFiles(response.data.files)
        })
        .catch((error: unknown) => {
          if (alive) {
            onNotify(
              error instanceof Error ? error.message : "Could not list files",
            )
          }
        })
    }, 90)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [project, query, refreshKey, onNotify])

  const openFile = async (path: string) => {
    if (!window.nolira || !project) return
    if (
      dirty &&
      opened?.file.relativePath !== path &&
      !window.confirm("Discard the unsaved editor changes?")
    ) {
      return
    }
    setLoading(true)
    try {
      const response = await window.nolira.invoke("workspace.readFile", {
        projectId: project.id,
        path,
      })
      if (!response.ok) throw new Error(response.error.message)
      setOpened(response.data)
      setDraft(response.data.content)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not open file")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (requestedPath) void openFile(requestedPath)
    // requestedPath is an explicit navigation request; editor state is read inside openFile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, requestedPath])

  const save = async () => {
    if (!window.nolira || !project || !opened || !dirty || saving) return
    setSaving(true)
    try {
      const response = await window.nolira.invoke("workspace.writeFile", {
        projectId: project.id,
        path: opened.file.relativePath,
        content: draft,
        expectedMtimeMs: opened.mtimeMs,
      })
      if (!response.ok) throw new Error(response.error.message)
      setOpened(response.data)
      setDraft(response.data.content)
      setRefreshKey((value) => value + 1)
      onNotify(`Saved ${response.data.file.relativePath}`)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not save file")
    } finally {
      setSaving(false)
    }
  }

  if (!project) {
    return (
      <PanelEmpty
        icon="folder"
        title="No repository selected"
        text="Choose a repository to browse and edit files."
      />
    )
  }

  return (
    <div
      className={`workspace-files-panel ${opened ? "has-editor" : ""}`}
      id="activity-files-panel"
      role="tabpanel"
      aria-labelledby="activity-files-tab"
    >
      <div className="panel-search-row">
        <Icon name="search" size={14} />
        <input
          aria-label="Filter repository files"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files"
          value={query}
        />
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          aria-label="Refresh files"
          title="Refresh files"
        >
          <Icon name="activity" size={14} />
        </button>
      </div>

      <div className="workspace-file-list">
        {files.map((file) => (
          <button
            type="button"
            className={opened?.file.relativePath === file.relativePath ? "active" : ""}
            key={file.path}
            onClick={() => void openFile(file.relativePath)}
            title={file.relativePath}
          >
            <Icon name="code" size={13} />
            <span>{file.relativePath}</span>
            <small>{formatBytes(file.size)}</small>
          </button>
        ))}
        {files.length === 0 && (
          <span className="panel-list-empty">No matching files</span>
        )}
      </div>

      {opened && (
        <div className="workspace-editor">
          <div className="workspace-editor-header">
            <span title={opened.file.relativePath}>
              {opened.file.relativePath}
              {dirty && <i> • edited</i>}
            </span>
            <button type="button" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <textarea
            aria-label={`Edit ${opened.file.relativePath}`}
            disabled={loading}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              const command = isMac(window.nolira?.platform ?? "")
                ? event.metaKey
                : event.ctrlKey
              if (command && event.key.toLowerCase() === "s") {
                event.preventDefault()
                void save()
              }
            }}
            spellCheck={false}
            value={draft}
          />
        </div>
      )}
    </div>
  )
}

export function WorkspaceChangesPanel({
  project,
  onOpenFile,
  onNotify,
}: {
  project: Project | null
  onOpenFile: (path: string) => void
  onNotify: (message: string) => void
}) {
  const [changes, setChanges] = useState<WorkspaceChange[]>([])
  const [branch, setBranch] = useState<string>()
  const [selected, setSelected] = useState<WorkspaceChange>()
  const [diff, setDiff] = useState<WorkspaceDiff>()
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!window.nolira || !project) return
    let alive = true
    setLoading(true)
    void window.nolira
      .invoke("workspace.changes", { projectId: project.id })
      .then((response) => {
        if (!alive) return
        if (!response.ok) throw new Error(response.error.message)
        setChanges(response.data.changes)
        setBranch(response.data.branch)
        if (
          selected &&
          !response.data.changes.some((change) => change.path === selected.path)
        ) {
          setSelected(undefined)
          setDiff(undefined)
        }
      })
      .catch((error: unknown) => {
        if (alive) onNotify(error instanceof Error ? error.message : "Could not read Git status")
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [project, refreshKey])

  const openDiff = async (change: WorkspaceChange) => {
    if (!window.nolira || !project) return
    setSelected(change)
    setLoading(true)
    try {
      const response = await window.nolira.invoke("workspace.diff", {
        projectId: project.id,
        path: change.path,
        staged: change.staged,
      })
      if (!response.ok) throw new Error(response.error.message)
      setDiff(response.data)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not load diff")
    } finally {
      setLoading(false)
    }
  }

  if (!project) {
    return (
      <PanelEmpty
        icon="code"
        title="No repository selected"
        text="Choose a Git repository to inspect changes."
      />
    )
  }

  return (
    <div
      className="workspace-changes-panel"
      id="activity-changes-panel"
      role="tabpanel"
      aria-labelledby="activity-changes-tab"
    >
      <div className="changes-toolbar">
        <span>{branch || "Detached HEAD"}</span>
        <small>{changes.length} changed</small>
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          aria-label="Refresh changes"
          title="Refresh changes"
        >
          <Icon name="activity" size={14} />
        </button>
      </div>
      <div className="workspace-change-list">
        {changes.map((change) => (
          <button
            type="button"
            className={selected?.path === change.path ? "active" : ""}
            key={`${change.indexStatus}${change.worktreeStatus}:${change.path}`}
            onClick={() => void openDiff(change)}
            title={change.path}
          >
            <span className={`change-badge change-${change.status}`}>
              {change.status.slice(0, 1).toUpperCase()}
            </span>
            <span>{change.path}</span>
            {change.staged && <small>staged</small>}
          </button>
        ))}
        {!loading && changes.length === 0 && (
          <span className="panel-list-empty">Working tree is clean</span>
        )}
      </div>
      {selected && (
        <div className="workspace-diff-shell">
          <div className="workspace-diff-header">
            <span>{selected.path}</span>
            {selected.status !== "deleted" && (
              <button type="button" onClick={() => onOpenFile(selected.path)}>
                Open file
              </button>
            )}
          </div>
          <DiffView diff={diff?.diff ?? (loading ? "Loading diff…" : "No diff available")} />
        </div>
      )}
    </div>
  )
}

export function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="workspace-diff-view">
      {diff.split("\n").map((line, index) => {
        const className = line.startsWith("+")
          ? "diff-added"
          : line.startsWith("-")
            ? "diff-removed"
            : line.startsWith("@@")
              ? "diff-hunk"
              : line.startsWith("diff ") || line.startsWith("index ")
                ? "diff-meta"
                : ""
        return (
          <span className={className} key={`${index}-${line.slice(0, 24)}`}>
            {line || " "}
            {"\n"}
          </span>
        )
      })}
    </pre>
  )
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  )
}

export function PanelEmpty({
  icon,
  title,
  text,
}: {
  icon: IconName
  title: string
  text: string
}) {
  return (
    <div className="panel-empty">
      <Icon name={icon} size={24} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}
