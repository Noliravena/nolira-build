import { useEffect, useRef } from "react"
import type { ChatMessage, Project, Task } from "../../types"
import { MessageView } from "./MessageView"

export interface MessageListProps {
  messages: ChatMessage[]
  task: Task | null
  project: Project | null
  busy: boolean
}

export function MessageList({ messages, task, project, busy }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
  }, [messages.length, task?.updatedAt, busy])

  return (
    <div className="messages-scroll" ref={scrollRef}>
      <div className="messages-column">
        <div className="conversation-title">
          <h1>{task?.title || "New Chat"}</h1>
          {project && <span>{project.name} · local agent</span>}
        </div>
        {messages.map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
        {busy && (
          <div className="agent-working">
            <span className="thinking-dots">
              <i />
              <i />
              <i />
            </span>
            <span>Agent is working…</span>
          </div>
        )}
      </div>
    </div>
  )
}
