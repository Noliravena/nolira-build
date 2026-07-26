import type { Attachment, ChatMessage, SkillSummary, WorkspaceFile } from "../types"

export interface ComposerCommand {
  name: string
  description: string
  prompt: string
}

export const COMPOSER_COMMANDS: ComposerCommand[] = [
  {
    name: "plan",
    description: "Plan the work before editing",
    prompt:
      "Create a concise implementation plan first. Do not modify files until I approve the plan. ",
  },
  {
    name: "review",
    description: "Review the current changes",
    prompt:
      "Review the current changes for correctness, regressions, security issues, and missing tests. Lead with actionable findings. ",
  },
  {
    name: "test",
    description: "Run the relevant checks",
    prompt:
      "Run the relevant tests and checks for this change. Diagnose any failures and report the exact verification performed. ",
  },
  {
    name: "fix",
    description: "Diagnose and implement a fix",
    prompt:
      "Diagnose the root cause, implement the smallest complete fix, and verify it with relevant tests. ",
  },
  {
    name: "explain",
    description: "Explain selected code or behavior",
    prompt:
      "Explain this clearly, including the important control flow, assumptions, and likely pitfalls. ",
  },
  {
    name: "init",
    description: "Orient to this repository",
    prompt:
      "Inspect this repository and summarize its architecture, development workflow, and the safest place to make the requested change. ",
  },
  {
    name: "goal",
    description: "Create a persistent execution goal",
    prompt:
      "Create a persistent goal for the following objective and keep working toward it across turns until it is complete or genuinely blocked: ",
  },
  {
    name: "monitor",
    description: "Run and monitor a background check",
    prompt:
      "Start the following check as a background monitor. Report meaningful state changes and wake this session when attention is needed: ",
  },
]

export type ComposerTrigger = {
  marker: "@" | "/"
  query: string
  start: number
  end: number
}

export type ComposerSuggestion =
  | { id: string; kind: "file"; file: WorkspaceFile }
  | { id: string; kind: "command"; command: ComposerCommand }
  | { id: string; kind: "skill"; skill: SkillSummary }

export function messageText(message: ChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
}

export function composerTriggerAt(text: string, cursor: number): ComposerTrigger | null {
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(^|\s)([@/])([^\s@/]*)$/)
  if (!match || (match[2] !== "@" && match[2] !== "/")) return null
  const query = match[3] ?? ""
  return {
    marker: match[2],
    query,
    start: cursor - query.length - 1,
    end: cursor,
  }
}

export function fileAsAttachment(file: WorkspaceFile): Attachment {
  return {
    name: file.name,
    path: file.path,
    mimeType: file.mimeType,
    size: file.size,
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"))
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      const separator = result.indexOf(",")
      if (separator < 0) reject(new Error("Clipboard image data is invalid"))
      else resolve(result.slice(separator + 1))
    }
    reader.readAsDataURL(file)
  })
}
