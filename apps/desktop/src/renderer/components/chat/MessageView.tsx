import { Icon, type IconName } from "../../icons"
import type { ChatMessage, MessagePart, ToolPart } from "../../types"
import { formatTime } from "../../lib/format"
import { messageText } from "../../lib/composer"
import { BrandMark } from "../brand/BrandMark"
import { RichText } from "./RichText"

export function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="system-message">
        <Icon name="info" size={13} />
        <RichText text={messageText(message)} />
      </div>
    )
  }

  if (message.role === "user") {
    return (
      <article className="message user-message">
        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map((attachment, index) => (
              <span key={`${attachment.path}-${index}`}>
                <Icon
                  name={attachment.mimeType?.startsWith("image/") ? "image" : "attachment"}
                  size={13}
                />
                {attachment.name}
              </span>
            ))}
          </div>
        )}
        <div className="user-bubble">
          {message.parts.map((part) =>
            part.type === "text" ? (
              <RichText key={part.id} text={part.text} />
            ) : null,
          )}
        </div>
        <time>{formatTime(message.createdAt)}</time>
      </article>
    )
  }

  return (
    <article className="message assistant-message">
      <div className="assistant-gutter">
        <BrandMark size={18} />
      </div>
      <div className="assistant-content">
        {message.parts.map((part) => (
          <MessagePartView key={part.id} part={part} />
        ))}
        {message.streaming && <span className="streaming-cursor" />}
      </div>
    </article>
  )
}

export function MessagePartView({ part }: { part: MessagePart }) {
  if (part.type === "text") return <RichText text={part.text} />
  if (part.type === "thinking") {
    return (
      <details
        className="thinking-card"
        open={part.status === "streaming" ? true : undefined}
      >
        <summary>
          <span className="thinking-icon">
            <Icon name="brain" size={16} />
          </span>
          <span>
            {part.status === "streaming" ? "Grok is reasoning" : "Reasoning"}
          </span>
          {part.status === "streaming" && <span className="mini-spinner" />}
          <Icon name="chevron-down" size={14} className="details-chevron" />
        </summary>
        <div className="thinking-content">
          <RichText text={part.text} />
        </div>
      </details>
    )
  }
  if (part.type === "tool") return <ToolCard tool={part} />
  return (
    <div className="error-card">
      <Icon name="warning" size={16} />
      <div>
        <strong>{part.title ?? "Agent error"}</strong>
        <p>{part.text}</p>
      </div>
    </div>
  )
}

export function ToolCard({ tool }: { tool: ToolPart }) {
  const icon: IconName =
    tool.kind === "terminal" || tool.kind === "shell" ? "terminal" : "code"
  return (
    <details
      className={`tool-card tool-${tool.status}`}
      open={tool.status === "running" || tool.status === "error" ? true : undefined}
    >
      <summary>
        <span className="tool-icon">
          <Icon name={icon} size={16} />
        </span>
        <span className="tool-summary-text">
          <strong>{tool.title}</strong>
          {tool.description && <small>{tool.description}</small>}
        </span>
        <ToolStatus status={tool.status} />
        <Icon name="chevron-down" size={14} className="details-chevron" />
      </summary>
      {(tool.input || tool.output) && (
        <div className="tool-body">
          {tool.input && (
            <div className="tool-block">
              <span>Input</span>
              <pre>{tool.input}</pre>
            </div>
          )}
          {tool.output && (
            <div className="tool-block">
              <span>Output</span>
              <pre>{tool.output}</pre>
            </div>
          )}
        </div>
      )}
    </details>
  )
}

export function ToolStatus({ status }: { status: ToolPart["status"] }) {
  if (status === "running") return <span className="mini-spinner" />
  if (status === "success") {
    return (
      <span className="tool-status success">
        <Icon name="check" size={12} />
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="tool-status error">
        <Icon name="close" size={12} />
      </span>
    )
  }
  return <span className="tool-status pending" />
}
