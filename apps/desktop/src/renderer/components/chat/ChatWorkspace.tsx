import { useEffect, useState } from "react"
import type { AppSettings, ChatMessage, Project, Task } from "../../types"
import { AgentWelcome } from "./AgentWelcome"
import { Composer } from "./Composer"
import { MessageList } from "./MessageList"

export interface ChatWorkspaceProps {
  task: Task | null
  project: Project | null
  settings: AppSettings
  models: string[]
  apiAvailable: boolean
  onAddProject: () => void
  onCreateTask: (projectId?: string) => Promise<Task | null>
  onSendError: (message: string) => void
}

export function ChatWorkspace({
  task,
  project,
  settings,
  models,
  apiAvailable,
  onAddProject,
  onCreateTask,
  onSendError,
}: ChatWorkspaceProps) {
  const [previewMessages, setPreviewMessages] = useState<ChatMessage[]>([])
  const [composerSending, setComposerSending] = useState(false)

  useEffect(() => {
    setPreviewMessages([])
  }, [task?.id])

  const messages = apiAvailable
    ? (task?.messages ?? [])
    : [...(task?.messages ?? []), ...previewMessages]
  const busy =
    composerSending ||
    task?.status === "running" ||
    task?.status === "starting"

  const composer = (
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
    />
  )

  return (
    <main
      className={`chat-workspace ${messages.length === 0 ? "new-workspace" : ""}`}
    >
      {messages.length === 0 ? (
        <AgentWelcome
          composer={composer}
          onAddProject={onAddProject}
          project={project}
        />
      ) : (
        <>
          <MessageList
            busy={busy}
            messages={messages}
            project={project}
            task={task}
          />
          <div className="composer-wrap">{composer}</div>
        </>
      )}
    </main>
  )
}
