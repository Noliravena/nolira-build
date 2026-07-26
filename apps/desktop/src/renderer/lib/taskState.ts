import type { AgentEvent, ChatMessage, Project, Task } from "../types"

export function upsertTask(tasks: Task[], next: Task) {
  const index = tasks.findIndex((task) => task.id === next.id)
  if (index === -1) return [next, ...tasks]
  return tasks.map((task) => (task.id === next.id ? next : task))
}

export function upsertProject(projects: Project[], next: Project) {
  const index = projects.findIndex((project) => project.id === next.id)
  if (index === -1) return [next, ...projects]
  return projects.map((project) => (project.id === next.id ? next : project))
}

export function upsertMessage(task: Task, message: ChatMessage): Task {
  const messages = task.messages ?? []
  const index = messages.findIndex((item) => item.id === message.id)
  const nextMessages =
    index === -1
      ? [...messages, message]
      : messages.map((item) => (item.id === message.id ? message : item))
  return { ...task, messages: nextMessages, updatedAt: message.createdAt }
}

export function applyMessageDelta(
  task: Task,
  payload: Extract<AgentEvent, { type: "message.delta" }>["payload"],
): Task {
  const messages = [...(task.messages ?? [])]
  let messageIndex = messages.findIndex(
    (message) => message.id === payload.messageId,
  )

  if (messageIndex === -1) {
    messages.push({
      id: payload.messageId,
      taskId: task.id,
      role: "assistant",
      createdAt: new Date().toISOString(),
      streaming: true,
      parts: [],
    })
    messageIndex = messages.length - 1
  }

  const message = messages[messageIndex]!
  const parts = [...message.parts]
  const partIndex = parts.findIndex((part) => part.id === payload.partId)

  if (partIndex === -1) {
    if (payload.partType === "thinking") {
      parts.push({
        id: payload.partId,
        type: "thinking",
        text: payload.delta,
        status: "streaming",
      })
    } else {
      parts.push({
        id: payload.partId,
        type: "text",
        text: payload.delta,
      })
    }
  } else {
    const part = parts[partIndex]!
    if (part.type === "text" || part.type === "thinking") {
      parts[partIndex] = { ...part, text: part.text + payload.delta }
    }
  }

  messages[messageIndex] = { ...message, parts, streaming: true }
  return { ...task, messages, updatedAt: new Date().toISOString() }
}
