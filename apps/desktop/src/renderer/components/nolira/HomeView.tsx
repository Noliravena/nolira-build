import { useMemo, useState } from "react"

import { Icon } from "../../icons"
import {
  CARD_STATUS_LABELS,
  cardStatus,
  greetingLabel,
  taskTimeLabel,
  type CardStatus,
} from "../../lib/agentPresentation"
import type { AppSettings, Project, Task } from "../../types"
import { Composer } from "../chat/Composer"
import { ActionMenu, Menu, type ActionMenuAction } from "./Menu"

export type HomeFilter = "all" | "running" | "review" | "done"
export type HomeViewMode = "grid" | "board"

export interface TaskActions {
  onOpen: (task: Task) => void
  onStop: (task: Task) => void
  onRename: (task: Task) => void
  onExport: (task: Task) => void
  onArchive: (task: Task) => void
}

export interface HomeViewProps {
  projects: Project[]
  tasks: Task[]
  settings: AppSettings
  models: string[]
  apiAvailable: boolean
  selectedProjectId: string | null
  view: HomeViewMode
  onViewChange: (view: HomeViewMode) => void
  onSelectProject: (projectId: string) => void
  onAddProject: () => void
  onCreateTask: (projectId?: string) => Promise<Task | null>
  onRefresh: () => Promise<void> | void
  onSendError: (message: string) => void
  taskActions: TaskActions
}

const STARTERS = [
  {
    kind: "Refactor",
    text: "Route every status badge through one shared palette module so the colors live in one place.",
  },
  {
    kind: "Fix",
    text: "Track down the flakiest failing test in this repo and make it deterministic.",
  },
  {
    kind: "Chore",
    text: "Audit the project dependencies and remove everything that is no longer imported.",
  },
]

function matchesFilter(status: CardStatus, filter: HomeFilter): boolean {
  if (filter === "all") return true
  if (filter === "review") return status === "review" || status === "error"
  return status === filter
}

export function HomeView({
  projects,
  tasks,
  settings,
  models,
  apiAvailable,
  selectedProjectId,
  view,
  onViewChange,
  onSelectProject,
  onAddProject,
  onCreateTask,
  onRefresh,
  onSendError,
  taskActions,
}: HomeViewProps) {
  const [filter, setFilter] = useState<HomeFilter>("all")
  const [spinning, setSpinning] = useState(false)
  const [starterText, setStarterText] = useState<string>()

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (task) => !task.archived && matchesFilter(cardStatus(task), filter),
      ),
    [tasks, filter],
  )
  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.archived),
    [tasks],
  )
  const counts = useMemo(() => {
    const result = { all: 0, running: 0, review: 0, done: 0 }
    for (const task of activeTasks) {
      result.all += 1
      const status = cardStatus(task)
      if (status === "running") result.running += 1
      else if (status === "review" || status === "error") result.review += 1
      else if (status === "done") result.done += 1
    }
    return result
  }, [activeTasks])

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ??
    projects[0] ??
    null
  const isEmpty = activeTasks.length === 0

  const refresh = async () => {
    setSpinning(true)
    try {
      await onRefresh()
    } finally {
      window.setTimeout(() => setSpinning(false), 700)
    }
  }

  const chips: Array<{ key: HomeFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "running", label: "Running", count: counts.running },
    { key: "review", label: "Needs review", count: counts.review },
    { key: "done", label: "Done", count: counts.done },
  ]

  return (
    <main className="nol-home" data-empty={isEmpty}>
      <div className="nol-home-body">
        <div className="nol-home-toolbar">
          <div className="nol-home-toolbar-start">
            {projects.length > 0 && (
              <Menu
                ariaLabel="Active project"
                drop="down"
                icon="folder"
                minWidth={290}
                mono
                onSelect={onSelectProject}
                options={projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                  icon: "folder" as const,
                }))}
                value={selectedProject?.id}
                variant="box"
              />
            )}
            <button
              type="button"
              className="nol-ghost-btn"
              onClick={onAddProject}
            >
              <Icon name="folder-plus" size={16} />
              <span>Add project</span>
            </button>
          </div>
          <div className="nol-flex1" />
          <div className="nol-home-toolbar-end">
            <div className="nol-chip-row">
              {chips.map((chip) => (
                <button
                  type="button"
                  className="nol-chip"
                  data-active={filter === chip.key}
                  key={chip.key}
                  onClick={() => setFilter(chip.key)}
                >
                  <span>{chip.label}</span>
                  <span className="nol-chip-count">{chip.count}</span>
                </button>
              ))}
            </div>
            <div className="nol-viewtoggle">
              <button
                type="button"
                title="Grid"
                aria-label="Grid view"
                data-active={view === "grid"}
                onClick={() => onViewChange("grid")}
              >
                <Icon name="grid" size={16} />
              </button>
              <button
                type="button"
                title="Board"
                aria-label="Board view"
                data-active={view === "board"}
                onClick={() => onViewChange("board")}
              >
                <Icon name="board" size={16} />
              </button>
            </div>
            <button
              type="button"
              className="nol-square-btn"
              title="Refresh sessions"
              aria-label="Refresh sessions"
              onClick={() => void refresh()}
            >
              <Icon
                className={spinning ? "nol-spin" : ""}
                name="refresh"
                size={16}
              />
            </button>
          </div>
        </div>

        {isEmpty ? (
          <div className="nol-empty">
            <h1 className="nol-greeting">{greetingLabel()}</h1>
            <Icon name="spark" size={28} />
            <div className="nol-empty-title">No agents in this workspace yet</div>
            <div className="nol-empty-sub">
              Describe a change below, or start from one of these.
            </div>
            <div className="nol-starters">
              {STARTERS.map((starter) => (
                <button
                  type="button"
                  className="nol-starter"
                  key={starter.kind}
                  onClick={() => setStarterText(starter.text)}
                >
                  <div className="nol-starter-kind">{starter.kind}</div>
                  <div className="nol-starter-text">{starter.text}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="nol-primary-btn"
              onClick={onAddProject}
            >
              <Icon name="folder-plus" size={16} />
              <span>Add project</span>
            </button>
          </div>
        ) : view === "grid" ? (
          <GridSections
            onCreateTask={onCreateTask}
            projects={projects}
            taskActions={taskActions}
            tasks={visibleTasks}
            allTasks={activeTasks}
          />
        ) : (
          <BoardView
            onCreateTask={() => void onCreateTask(selectedProject?.id)}
            projects={projects}
            taskActions={taskActions}
            tasks={visibleTasks}
          />
        )}
      </div>

      <div className="nol-home-composer">
        <Composer
          apiAvailable={apiAvailable}
          busy={false}
          initialText={starterText}
          models={models}
          onCreateTask={(projectId) =>
            onCreateTask(projectId ?? selectedProject?.id)
          }
          onSendError={onSendError}
          project={selectedProject}
          settings={settings}
          task={null}
          variant="home"
        />
      </div>
    </main>
  )
}

function GridSections({
  projects,
  tasks,
  allTasks,
  taskActions,
  onCreateTask,
}: {
  projects: Project[]
  tasks: Task[]
  allTasks: Task[]
  taskActions: TaskActions
  onCreateTask: (projectId?: string) => Promise<Task | null>
}) {
  const sections = projects
    .map((project) => {
      const mine = tasks.filter((task) => task.projectId === project.id)
      const active = allTasks.filter((task) => {
        if (task.projectId !== project.id) return false
        const status = cardStatus(task)
        return status === "running" || status === "review"
      }).length
      return { project, tasks: mine, active }
    })
    .filter((section) => section.tasks.length > 0)

  if (sections.length === 0) {
    return (
      <div className="nol-empty">
        <Icon name="search" size={26} />
        <div className="nol-empty-title">Nothing matches this filter</div>
      </div>
    )
  }

  return (
    <>
      {sections.map(({ project, tasks: sectionTasks, active }) => (
        <section className="nol-section" key={project.id}>
          <div className="nol-section-head">
            <Icon name="folder" size={17} style={{ color: "var(--mu)" }} />
            <span className="nol-section-name">{project.name}</span>
            <span className="nol-section-path">{project.path}</span>
            {active > 0 && (
              <span className="nol-section-active">
                <span className="nol-pulse-dot" />
                {active} active
              </span>
            )}
            <div className="nol-flex1" />
            <button
              type="button"
              className="nol-mini-btn"
              onClick={() => void onCreateTask(project.id)}
            >
              <Icon name="add" size={14} />
              <span>New</span>
            </button>
          </div>
          <div className="nol-cards">
            {sectionTasks.map((task) => (
              <AgentCard key={task.id} task={task} taskActions={taskActions} />
            ))}
            <button
              type="button"
              className="nol-newcard"
              onClick={() => void onCreateTask(project.id)}
            >
              <Icon name="add" size={18} />
              <span>New agent</span>
            </button>
          </div>
        </section>
      ))}
    </>
  )
}

const BOARD_COLUMNS: Array<{ key: CardStatus | "review+"; label: string; tone: string }> = [
  { key: "running", label: "Running", tone: "var(--ac)" },
  { key: "review+", label: "Needs review", tone: "var(--wr)" },
  { key: "done", label: "Done", tone: "var(--ok)" },
  { key: "draft", label: "Draft", tone: "var(--fa)" },
]

function BoardView({
  projects,
  tasks,
  taskActions,
  onCreateTask,
}: {
  projects: Project[]
  tasks: Task[]
  taskActions: TaskActions
  onCreateTask: () => void
}) {
  return (
    <div className="nol-board">
      {BOARD_COLUMNS.map((column) => {
        const list = tasks.filter((task) => {
          const status = cardStatus(task)
          if (column.key === "review+") {
            return status === "review" || status === "error"
          }
          return status === column.key
        })
        return (
          <div className="nol-col" key={column.key}>
            <div className="nol-col-head">
              <span
                className="nol-col-dot"
                style={{ background: column.tone }}
              />
              <span className="nol-col-label">{column.label}</span>
              <span className="nol-col-count">{list.length}</span>
            </div>
            <div className="nol-col-list">
              {list.map((task) => (
                <AgentCard
                  board
                  key={task.id}
                  projectName={
                    projects.find((project) => project.id === task.projectId)
                      ?.name
                  }
                  task={task}
                  taskActions={taskActions}
                />
              ))}
              <button
                type="button"
                className="nol-newcard-slim"
                onClick={onCreateTask}
              >
                <Icon name="add" size={15} />
                <span>New agent</span>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AgentCard({
  task,
  taskActions,
  board = false,
  projectName,
}: {
  task: Task
  taskActions: TaskActions
  board?: boolean
  projectName?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const status = cardStatus(task)
  const running = status === "running"
  const stoppable = ["starting", "running", "waiting"].includes(task.status)

  const actions: ActionMenuAction[] = [{ id: "open", label: "Open session" }]
  if (stoppable) actions.push({ id: "stop", label: "Stop agent" })
  if (task.sessionId) {
    actions.push({ id: "rename", label: "Rename" })
    actions.push({ id: "export", label: "Export transcript" })
    actions.push({ id: "archive", label: "Archive", danger: true })
  }

  const onAction = (id: string) => {
    if (id === "open") taskActions.onOpen(task)
    else if (id === "stop") taskActions.onStop(task)
    else if (id === "rename") taskActions.onRename(task)
    else if (id === "export") taskActions.onExport(task)
    else if (id === "archive") taskActions.onArchive(task)
  }

  return (
    <div
      className="nol-card"
      data-menu-open={menuOpen}
      onClick={() => taskActions.onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") taskActions.onOpen(task)
      }}
    >
      <div className="nol-card-top">
        {board ? (
          <span className="nol-card-project">{projectName ?? ""}</span>
        ) : (
          <span className="nol-status" data-tone={status} data-pulse={running}>
            <span className="nol-status-dot" />
            {CARD_STATUS_LABELS[status]}
          </span>
        )}
        <div className="nol-flex1" />
        <ActionMenu
          actions={actions}
          onAction={onAction}
          onToggle={setMenuOpen}
          open={menuOpen}
        />
      </div>
      <div className="nol-card-title">{task.title || "New task"}</div>
      {!board && (
        <div className="nol-card-branch">
          <Icon name="branch" size={14} />
          <span>{task.model ?? "no session yet"}</span>
        </div>
      )}
      <div className="nol-card-foot">
        <span>{taskTimeLabel(task)}</span>
        <div className="nol-flex1" />
        {task.contextTokens ? (
          <span className="nol-mono" style={{ fontSize: 11.5 }}>
            {Math.round(task.contextTokens / 1000)}k ctx
          </span>
        ) : null}
        {running && (
          <span className="nol-progress-ring" aria-label="Running">
            <svg width="17" height="17" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="var(--bd)"
                strokeWidth="2.6"
              />
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="var(--ac)"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeDasharray="56.5"
                strokeDashoffset="34"
              />
            </svg>
          </span>
        )}
      </div>
    </div>
  )
}
