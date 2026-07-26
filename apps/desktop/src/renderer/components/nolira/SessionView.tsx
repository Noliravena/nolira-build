import { useEffect, useMemo, useRef, useState } from "react"

import { Icon, type IconName } from "../../icons"
import {
  CARD_STATUS_LABELS,
  cardStatus,
} from "../../lib/agentPresentation"
import { formatBytes, formatDuration, formatTime } from "../../lib/format"
import { isMac } from "../../lib/platform"
import type {
  AppSettings,
  ChatMessage,
  Project,
  RuntimeStatus,
  Task,
  ToolPart,
  WorkspaceChange,
  WorkspaceFile,
  WorkspaceFileContent,
} from "../../types"
import { Composer } from "../chat/Composer"
import { MessageView } from "../chat/MessageView"

export type PaneTab = "terminal" | "changes" | "files" | "activity" | "info"

export interface SessionViewProps {
  task: Task
  project: Project | null
  settings: AppSettings
  models: string[]
  runtime: RuntimeStatus
  apiAvailable: boolean
  paneOpen: boolean
  onTogglePane: () => void
  onCreateTask: (projectId?: string) => Promise<Task | null>
  onSendError: (message: string) => void
  onStop: (task: Task) => void
  onRename: (task: Task) => void
  onExport: (task: Task) => void
  onArchive: (task: Task) => void
}

export function SessionView({
  task,
  project,
  settings,
  models,
  runtime,
  apiAvailable,
  paneOpen,
  onTogglePane,
  onCreateTask,
  onSendError,
  onStop,
  onRename,
  onExport,
  onArchive,
}: SessionViewProps) {
  const [previewMessages, setPreviewMessages] = useState<ChatMessage[]>([])
  const [composerSending, setComposerSending] = useState(false)
  const [paneTab, setPaneTab] = useState<PaneTab>("terminal")
  const [branch, setBranch] = useState<string>()
  const [changes, setChanges] = useState<WorkspaceChange[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPreviewMessages([])
  }, [task.id])

  const messages = apiAvailable
    ? task.messages
    : [...task.messages, ...previewMessages]
  const busy =
    composerSending || task.status === "running" || task.status === "starting"
  const status = cardStatus(task)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
  }, [messages.length, task.updatedAt, busy])

  // Track git changes for the review bar + Changes tab.
  useEffect(() => {
    if (!window.nolira || !project) return
    let alive = true
    const load = () => {
      void window.nolira!
        .invoke("workspace.changes", { projectId: project.id })
        .then((response) => {
          if (!alive || !response.ok) return
          setBranch(response.data.branch)
          setChanges(response.data.changes)
        })
        .catch(() => undefined)
    }
    const timer = window.setTimeout(load, 250)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [project, task.updatedAt, paneTab])

  const tabs: Array<{
    key: PaneTab
    label: string
    icon: IconName
    badge?: string
  }> = [
    { key: "terminal", label: "Terminal", icon: "terminal" },
    {
      key: "changes",
      label: "Changes",
      icon: "branch",
      badge: changes.length > 0 ? String(changes.length) : undefined,
    },
    { key: "files", label: "Files", icon: "code" },
    { key: "activity", label: "Activity", icon: "activity" },
    { key: "info", label: "Info", icon: "sliders" },
  ]

  return (
    <main className="nol-session">
      <div className="nol-chat">
        <div className="nol-chat-head">
          <div className="nol-chat-head-row">
            <span
              className="nol-status"
              data-tone={status}
              data-pulse={status === "running"}
            >
              <span className="nol-status-dot" />
              {CARD_STATUS_LABELS[status]}
            </span>
            <span className="nol-chat-branch">
              {branch ?? task.model ?? ""}
            </span>
            <div className="nol-flex1" />
            <button
              type="button"
              className="nol-outline-icon"
              data-active={paneOpen}
              onClick={onTogglePane}
              aria-label="Toggle live pane"
              title={
                isMac(window.nolira?.platform ?? "")
                  ? "Toggle live pane ⌘\\"
                  : "Toggle live pane Ctrl+\\"
              }
            >
              <Icon name="layout-right" size={16} />
            </button>
            {status === "running" ? (
              <button
                type="button"
                className="nol-outline-btn"
                onClick={() => onStop(task)}
              >
                Stop
              </button>
            ) : (
              task.sessionId && (
                <button
                  type="button"
                  className="nol-outline-btn"
                  onClick={() => onRename(task)}
                >
                  Rename
                </button>
              )
            )}
          </div>
          <div className="nol-chat-title">{task.title || "New task"}</div>
        </div>

        <div className="nol-chat-scroll" ref={scrollRef}>
          {messages.map((message) => (
            <MessageView key={message.id} message={message} />
          ))}
          {busy && (
            <div className="nol-working">
              <span className="nol-pulse-dot" />
              <span>Agent is working…</span>
            </div>
          )}
          {messages.length === 0 && !busy && (
            <div className="nol-pane-empty" style={{ paddingTop: 80 }}>
              <Icon name="spark" size={24} />
              <strong>Describe the task below</strong>
              <p>The agent plans first, then edits files and runs commands.</p>
            </div>
          )}
        </div>

        <div className="nol-chat-foot">
          {changes.length > 0 && (
            <button
              type="button"
              className="nol-reviewbar"
              onClick={() => {
                setPaneTab("changes")
                if (!paneOpen) onTogglePane()
              }}
            >
              <Icon name="code" size={15} style={{ color: "var(--fa)" }} />
              <span style={{ color: "var(--tx)" }}>
                {changes.length === 1
                  ? "1 file changed"
                  : `${changes.length} files changed`}
              </span>
              <div className="nol-flex1" />
              <span className="nol-review-cta">
                Review
                <Icon
                  name="chevron-right"
                  size={13}
                  style={{ color: "var(--fa)" }}
                />
              </span>
            </button>
          )}
          <Composer
            apiAvailable={apiAvailable}
            busy={busy}
            models={models}
            onBusyChange={setComposerSending}
            onCreateTask={onCreateTask}
            onSendError={onSendError}
            project={project}
            setPreviewMessages={setPreviewMessages}
            settings={settings}
            task={task}
            variant="session"
          />
        </div>
      </div>

      {paneOpen && (
        <aside className="nol-pane">
          <div className="nol-pane-tabs">
            {tabs.map((tab) => (
              <button
                type="button"
                className="nol-tab"
                data-active={paneTab === tab.key}
                key={tab.key}
                onClick={() => setPaneTab(tab.key)}
              >
                <Icon name={tab.icon} size={15} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="nol-tab-badge">{tab.badge}</span>
                )}
              </button>
            ))}
            <div className="nol-flex1" />
            <span className="nol-pane-meta">
              {runtime.state === "ready"
                ? (runtime.version ?? "runtime up")
                : runtime.state}
            </span>
          </div>
          <div className="nol-pane-body">
            {paneTab === "terminal" && <TerminalPane task={task} />}
            {paneTab === "changes" && (
              <ChangesPane
                changes={changes}
                onNotify={onSendError}
                project={project}
              />
            )}
            {paneTab === "files" && (
              <FilesPane onNotify={onSendError} project={project} />
            )}
            {paneTab === "activity" && <ActivityPane task={task} />}
            {paneTab === "info" && (
              <InfoPane
                onArchive={onArchive}
                onExport={onExport}
                project={project}
                runtime={runtime}
                task={task}
              />
            )}
          </div>
        </aside>
      )}
    </main>
  )
}

/* ---------- Terminal ---------- */

function TerminalPane({ task }: { task: Task }) {
  const lines = useMemo(() => {
    const result: Array<{ text: string; tone: string }> = []
    for (const message of task.messages) {
      for (const part of message.parts) {
        if (part.type !== "tool") continue
        const isShell = part.kind === "terminal" || part.kind === "shell"
        const command = isShell ? (part.input ?? part.title) : part.title
        result.push({
          text: `$ ${command}`,
          tone: "nol-t-cmd",
        })
        if (part.output) {
          const outputLines = part.output.split("\n").slice(0, 40)
          for (const line of outputLines) {
            result.push({ text: line, tone: "nol-t-dim" })
          }
        }
        result.push({
          text:
            part.status === "success"
              ? "✓ done"
              : part.status === "error"
                ? "✗ failed"
                : part.status === "running"
                  ? "… running"
                  : "· pending",
          tone:
            part.status === "success"
              ? "nol-t-ok"
              : part.status === "error"
                ? "nol-t-err"
                : "nol-t-dim",
        })
        result.push({ text: "", tone: "nol-t-dim" })
      }
    }
    return result
  }, [task.messages])

  if (lines.length === 0) {
    return (
      <PaneEmpty
        icon="terminal"
        text="Commands the agent runs will stream here."
        title="No terminal activity yet"
      />
    )
  }
  return (
    <div className="nol-terminal">
      {lines.map((line, index) => (
        <div className={line.tone} key={index}>
          {line.text || " "}
        </div>
      ))}
    </div>
  )
}

/* ---------- Changes ---------- */

function ChangesPane({
  project,
  changes,
  onNotify,
}: {
  project: Project | null
  changes: WorkspaceChange[]
  onNotify: (message: string) => void
}) {
  const [openPath, setOpenPath] = useState<string>()
  const [diffs, setDiffs] = useState<Record<string, string>>({})

  const openDiff = async (change: WorkspaceChange) => {
    const next = openPath === change.path ? undefined : change.path
    setOpenPath(next)
    if (!next || diffs[change.path] || !window.nolira || !project) return
    try {
      const response = await window.nolira.invoke("workspace.diff", {
        projectId: project.id,
        path: change.path,
        staged: change.staged,
      })
      if (!response.ok) throw new Error(response.error.message)
      setDiffs((current) => ({
        ...current,
        [change.path]: response.data.diff,
      }))
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not load diff")
    }
  }

  if (!project) {
    return (
      <PaneEmpty
        icon="branch"
        text="Choose a repository to inspect changes."
        title="No repository"
      />
    )
  }
  if (changes.length === 0) {
    return (
      <PaneEmpty
        icon="branch"
        text="Edits land here as a reviewable change set."
        title="Working tree is clean"
      />
    )
  }

  return (
    <div className="nol-change-list">
      {changes.map((change) => {
        const diff = diffs[change.path]
        const counts = diff ? diffCounts(diff) : null
        return (
          <div className="nol-change-card" key={change.path}>
            <button
              type="button"
              className="nol-change-head"
              onClick={() => void openDiff(change)}
            >
              <span className="nol-change-kind" data-kind={change.status}>
                {change.status}
              </span>
              <span className="nol-change-path">{change.path}</span>
              <div className="nol-flex1" />
              {counts && (
                <>
                  <span
                    className="nol-mono"
                    style={{ fontSize: 12, color: "var(--ok)" }}
                  >
                    +{counts.add}
                  </span>
                  <span
                    className="nol-mono"
                    style={{ fontSize: 12, color: "var(--dn)" }}
                  >
                    −{counts.del}
                  </span>
                </>
              )}
              <Icon
                name="chevron-down"
                size={14}
                style={{
                  color: "var(--fa)",
                  transform:
                    openPath === change.path ? "rotate(180deg)" : undefined,
                }}
              />
            </button>
            {openPath === change.path && (
              <div className="nol-change-diff">
                {(diff ?? "Loading diff…").split("\n").map((line, index) => (
                  <div className={diffLineClass(line)} key={index}>
                    {line || " "}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "nol-line nol-line-add"
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "nol-line nol-line-del"
  }
  if (line.startsWith("@@")) return "nol-line nol-line-hunk"
  if (line.startsWith("diff ") || line.startsWith("index ")) {
    return "nol-line nol-line-meta"
  }
  return "nol-line"
}

function diffCounts(diff: string): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) add += 1
    else if (line.startsWith("-") && !line.startsWith("---")) del += 1
  }
  return { add, del }
}

/* ---------- Files ---------- */

function FilesPane({
  project,
  onNotify,
}: {
  project: Project | null
  onNotify: (message: string) => void
}) {
  const [query, setQuery] = useState("")
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [opened, setOpened] = useState<WorkspaceFileContent | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
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
          if (alive && response.ok) setFiles(response.data.files)
        })
        .catch(() => undefined)
    }, 90)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [project, query])

  const openFile = async (path: string) => {
    if (!window.nolira || !project) return
    if (
      dirty &&
      opened?.file.relativePath !== path &&
      !window.confirm("Discard the unsaved editor changes?")
    ) {
      return
    }
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
    }
  }

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
      onNotify(`Saved ${response.data.file.relativePath}`)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not save file")
    } finally {
      setSaving(false)
    }
  }

  if (!project) {
    return (
      <PaneEmpty
        icon="folder"
        text="Choose a repository to browse and edit files."
        title="No repository"
      />
    )
  }

  return (
    <div>
      <div className="nol-pane-search">
        <Icon name="search" size={14} />
        <input
          aria-label="Filter repository files"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files"
          value={query}
        />
      </div>
      <div className="nol-filetree">
        {files.map((file) => (
          <button
            type="button"
            data-active={opened?.file.relativePath === file.relativePath}
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
          <span style={{ color: "var(--fa)", fontSize: 12.5, padding: 8 }}>
            No matching files
          </span>
        )}
      </div>
      {opened && (
        <div className="nol-editor">
          <div className="nol-editor-head">
            <span title={opened.file.relativePath}>
              {opened.file.relativePath}
              {dirty && <i> • edited</i>}
            </span>
            <button
              type="button"
              className="nol-btn-outline"
              disabled={!dirty || saving}
              onClick={() => void save()}
              style={{ height: 26, padding: "0 10px" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <textarea
            aria-label={`Edit ${opened.file.relativePath}`}
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

/* ---------- Activity ---------- */

function ActivityPane({ task }: { task: Task }) {
  const goal = task.goal
  const plan = task.plan ?? []
  const subagents = task.subagents ?? []
  const backgroundTasks = task.backgroundTasks ?? []
  const tools = useMemo(
    () =>
      task.messages.flatMap((message) =>
        message.parts.filter((part): part is ToolPart => part.type === "tool"),
      ),
    [task.messages],
  )

  if (
    !goal &&
    plan.length === 0 &&
    tools.length === 0 &&
    subagents.length === 0 &&
    backgroundTasks.length === 0
  ) {
    return (
      <PaneEmpty
        icon="activity"
        text="Tool calls, plans and subagents will appear here."
        title="No activity yet"
      />
    )
  }

  return (
    <div className="nol-activity">
      {goal && (
        <div className="nol-activity-card">
          <span className="nol-eyebrow">Goal · {goal.status}</span>
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
        <div className="nol-activity-card">
          <span className="nol-eyebrow">Plan</span>
          <ol>
            {plan.map((step, index) => (
              <li key={`${index}-${step}`}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {subagents.length > 0 && (
        <div className="nol-activity-card">
          <span className="nol-eyebrow">Subagents</span>
          {subagents.map((subagent) => (
            <div key={subagent.id} style={{ marginTop: 8 }}>
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
          ))}
        </div>
      )}
      {backgroundTasks.length > 0 && (
        <div className="nol-activity-card">
          <span className="nol-eyebrow">Background tasks</span>
          {backgroundTasks.map((backgroundTask) => (
            <div key={backgroundTask.id} style={{ marginTop: 8 }}>
              <strong>
                {backgroundTask.description ??
                  backgroundTask.command ??
                  backgroundTask.id}
              </strong>
              {(backgroundTask.eventText || backgroundTask.output) && (
                <p>{backgroundTask.eventText ?? backgroundTask.output}</p>
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
          ))}
        </div>
      )}
      {tools.length > 0 && (
        <div className="nol-activity-card">
          <span className="nol-eyebrow">Tool calls</span>
          {tools.slice(-14).map((tool) => (
            <div key={tool.id} style={{ marginTop: 8 }}>
              <strong>{tool.title}</strong>
              {tool.description && <p>{tool.description}</p>}
              <small>{tool.status}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Info ---------- */

function InfoPane({
  task,
  project,
  runtime,
  onExport,
  onArchive,
}: {
  task: Task
  project: Project | null
  runtime: RuntimeStatus
  onExport: (task: Task) => void
  onArchive: (task: Task) => void
}) {
  const rows: Array<[string, string]> = [
    ["Project", project?.name ?? "—"],
    ["Worktree", project?.path ?? "—"],
    ["Status", task.status],
    ["Model", task.model ?? "—"],
    ["Reasoning", task.effort ?? "—"],
    ["Permission", task.permissionMode ?? "—"],
    ["Session", task.sessionId ?? "not started"],
    [
      "Context",
      task.contextTokens
        ? `${task.contextTokens.toLocaleString()} tokens`
        : "—",
    ],
    ["Runtime", runtime.version ?? runtime.state],
    ["Started", formatTime(task.createdAt) || "—"],
  ]

  return (
    <div>
      <div className="nol-info-rows">
        {rows.map(([key, value]) => (
          <div className="nol-info-row" key={key}>
            <span className="nol-info-k">{key}</span>
            <span className="nol-info-v">{value}</span>
          </div>
        ))}
      </div>
      {task.sessionId && (
        <div className="nol-info-actions">
          <button
            type="button"
            className="nol-ghost-btn"
            onClick={() => onExport(task)}
          >
            <Icon name="download" size={16} />
            <span>Export transcript</span>
          </button>
          <button
            type="button"
            className="nol-ghost-btn"
            onClick={() => onArchive(task)}
          >
            <Icon name="archive" size={16} />
            <span>Archive</span>
          </button>
        </div>
      )}
    </div>
  )
}

function PaneEmpty({
  icon,
  title,
  text,
}: {
  icon: IconName
  title: string
  text: string
}) {
  return (
    <div className="nol-pane-empty">
      <Icon name={icon} size={24} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}
