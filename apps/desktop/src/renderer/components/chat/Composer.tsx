import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent,
} from "react"

import { Icon } from "../../icons"
import {
  COMPOSER_COMMANDS,
  composerTriggerAt,
  fileAsAttachment,
  fileToBase64,
  type ComposerSuggestion,
} from "../../lib/composer"
import { formatBytes } from "../../lib/format"
import { isMac } from "../../lib/platform"
import type {
  AppSettings,
  Attachment,
  EffortLevel,
  PermissionMode,
  Project,
  SkillSummary,
  Task,
  WorkspaceFile,
} from "../../types"
import { SelectControl } from "../chrome/SelectControl"

export interface ComposerProps {
  task: Task | null
  project: Project | null
  settings: AppSettings
  models: string[]
  busy: boolean
  className?: string
  onCreateTask: (projectId?: string) => Promise<Task | null>
  onSendError: (message: string) => void
  onBusyChange?: (busy: boolean) => void
  apiAvailable: boolean
  setPreviewMessages?: React.Dispatch<
    React.SetStateAction<import("../../types").ChatMessage[]>
  >
}

export function Composer({
  task,
  project,
  settings,
  models,
  busy: busyProp,
  className = "",
  onCreateTask,
  onSendError,
  onBusyChange,
  apiAvailable,
  setPreviewMessages,
}: ComposerProps) {
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [model, setModel] = useState(task?.model ?? settings.defaultModel)
  const [effort, setEffort] = useState<EffortLevel>(
    task?.effort ?? settings.defaultEffort,
  )
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    task?.permissionMode ?? settings.defaultPermissionMode,
  )
  const [sending, setSending] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [fileMatches, setFileMatches] = useState<WorkspaceFile[]>([])
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trigger = useMemo(
    () => composerTriggerAt(text, cursorPosition),
    [cursorPosition, text],
  )
  const suggestions = useMemo<ComposerSuggestion[]>(() => {
    if (!trigger || suggestionsDismissed) return []
    const query = trigger.query.toLowerCase()
    if (trigger.marker === "@") {
      return fileMatches.map((file) => ({
        id: `file:${file.path}`,
        kind: "file" as const,
        file,
      }))
    }

    const commands = COMPOSER_COMMANDS.filter(
      (command) => !query || command.name.includes(query),
    ).map((command) => ({
      id: `command:${command.name}`,
      kind: "command" as const,
      command,
    }))
    const skillQuery = query.startsWith("skill:")
      ? query.slice("skill:".length)
      : ""
    const skillItems = query.startsWith("skill")
      ? skills
          .filter(
            (skill) =>
              !skillQuery ||
              `${skill.name} ${skill.description ?? ""}`
                .toLowerCase()
                .includes(skillQuery),
          )
          .slice(0, 12)
          .map((skill) => ({
            id: `skill:${skill.id}`,
            kind: "skill" as const,
            skill,
          }))
      : []
    return [...commands, ...skillItems].slice(0, 14)
  }, [fileMatches, skills, suggestionsDismissed, trigger])

  const busy =
    busyProp || sending || task?.status === "running" || task?.status === "starting"

  useEffect(() => {
    onBusyChange?.(sending)
  }, [onBusyChange, sending])

  useEffect(() => {
    setModel(task?.model ?? settings.defaultModel)
    setEffort(task?.effort ?? settings.defaultEffort)
    setPermissionMode(
      task?.permissionMode ?? settings.defaultPermissionMode,
    )
  }, [task?.id, task?.model, task?.effort, task?.permissionMode, settings])

  useEffect(() => {
    const area = textareaRef.current
    if (!area) return
    area.style.height = "0px"
    area.style.height = `${Math.min(area.scrollHeight, 180)}px`
  }, [text])

  useEffect(() => {
    if (!window.nolira) return
    let alive = true
    void window.nolira
      .invoke("skills.list", { projectId: project?.id })
      .then((response) => {
        if (alive && response.ok) setSkills(response.data.skills)
      })
    return () => {
      alive = false
    }
  }, [project?.id])

  useEffect(() => {
    if (
      !window.nolira ||
      !project?.id ||
      trigger?.marker !== "@" ||
      suggestionsDismissed
    ) {
      setFileMatches([])
      return
    }

    let alive = true
    const timer = window.setTimeout(() => {
      void window.nolira!
        .invoke("workspace.files", {
          projectId: project.id,
          query: trigger.query,
          limit: 30,
        })
        .then((response) => {
          if (alive && response.ok) setFileMatches(response.data.files)
        })
    }, 80)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [project?.id, suggestionsDismissed, trigger?.marker, trigger?.query])

  useEffect(() => {
    setActiveSuggestion(0)
  }, [trigger?.marker, trigger?.query, suggestions.length])

  const addAttachments = async () => {
    if (!window.nolira) {
      onSendError("File attachments are available in the desktop app")
      return
    }
    try {
      const files = await window.nolira.pickAttachments()
      setAttachments((current) => [...current, ...files])
    } catch (error) {
      onSendError(error instanceof Error ? error.message : "Could not attach file")
    }
  }

  const applySuggestion = (suggestion: ComposerSuggestion) => {
    if (!trigger) return
    let replacement = ""

    if (suggestion.kind === "file") {
      const pathLabel = suggestion.file.relativePath.includes(" ")
        ? `@"${suggestion.file.relativePath}" `
        : `@${suggestion.file.relativePath} `
      replacement = pathLabel
      const attachment = fileAsAttachment(suggestion.file)
      setAttachments((current) =>
        current.some((item) => item.path === attachment.path)
          ? current
          : [...current, attachment],
      )
    } else if (suggestion.kind === "command") {
      replacement = suggestion.command.prompt
    } else {
      replacement = `Use the "${suggestion.skill.name}" skill for this task. `
    }

    const nextText = `${text.slice(0, trigger.start)}${replacement}${text.slice(
      trigger.end,
    )}`
    const nextCursor = trigger.start + replacement.length
    setText(nextText)
    setCursorPosition(nextCursor)
    setSuggestionsDismissed(true)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const importPastedImages = async (
    event: ReactClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const images = Array.from(event.clipboardData.files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 5)
    if (images.length === 0) return
    event.preventDefault()
    if (!window.nolira) {
      onSendError("Image paste is available in the desktop app")
      return
    }

    try {
      const imported = await Promise.all(
        images.map(async (file, index) => {
          if (file.size > 8 * 1024 * 1024) {
            throw new Error(`${file.name || "Pasted image"} is larger than 8 MB`)
          }
          const response = await window.nolira!.invoke("attachments.importData", {
            name: file.name || `pasted-image-${Date.now()}-${index + 1}`,
            mimeType: file.type,
            dataBase64: await fileToBase64(file),
          })
          if (!response.ok) throw new Error(response.error.message)
          return response.data.attachment
        }),
      )
      setAttachments((current) => [...current, ...imported])
    } catch (error) {
      onSendError(
        error instanceof Error ? error.message : "Could not import pasted image",
      )
    }
  }

  const send = async () => {
    const value = text.trim()
    if ((!value && attachments.length === 0) || sending) return
    let targetTask = task
    if (!targetTask) targetTask = await onCreateTask()
    if (!targetTask) return

    setSending(true)
    setText("")
    const selectedAttachments = attachments
    setAttachments([])

    if (!window.nolira) {
      const now = new Date().toISOString()
      const userMessage = {
        id: `preview-user-${Date.now()}`,
        taskId: targetTask.id,
        role: "user" as const,
        createdAt: now,
        attachments: selectedAttachments,
        parts: [{ id: `preview-text-${Date.now()}`, type: "text" as const, text: value }],
      }
      setPreviewMessages?.((current) => [...current, userMessage])
      window.setTimeout(() => {
        setPreviewMessages?.((current) => [
          ...current,
          {
            id: `preview-assistant-${Date.now()}`,
            taskId: targetTask!.id,
            role: "assistant",
            createdAt: new Date().toISOString(),
            parts: [
              {
                id: `preview-response-${Date.now()}`,
                type: "text",
                text: "This is the renderer preview. Start the Electron app to send this prompt through Grok ACP.",
              },
            ],
          },
        ])
        setSending(false)
      }, 450)
      return
    }

    try {
      await window.nolira.sendPrompt({
        taskId: targetTask.id,
        text: value,
        attachments: selectedAttachments,
        model,
        effort,
        permissionMode,
      })
    } catch (error) {
      setText(value)
      setAttachments(selectedAttachments)
      onSendError(error instanceof Error ? error.message : "Prompt failed")
    } finally {
      setSending(false)
    }
  }

  const cancel = async () => {
    if (!task || !window.nolira) return
    try {
      await window.nolira.cancelTask(task.id)
    } catch (error) {
      onSendError(error instanceof Error ? error.message : "Could not stop task")
    }
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const command = isMac(window.nolira?.platform ?? "")
      ? event.metaKey
      : event.ctrlKey
    if (event.key === "Enter" && command) {
      event.preventDefault()
      void send()
      return
    }
    if (suggestions.length === 0) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const direction = event.key === "ArrowDown" ? 1 : -1
      setActiveSuggestion(
        (current) => (current + direction + suggestions.length) % suggestions.length,
      )
      return
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const suggestion = suggestions[activeSuggestion]
      if (!suggestion) return
      event.preventDefault()
      applySuggestion(suggestion)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      setSuggestionsDismissed(true)
    }
  }

  const uniqueModels = Array.from(
    new Set([model, settings.defaultModel, ...models].filter(Boolean)),
  )

  return (
    <div className={`composer ${busy ? "is-busy" : ""} ${className}`.trim()}>
      {attachments.length > 0 && (
        <div className="attachment-list">
          {attachments.map((attachment, index) => (
            <div className="attachment-chip" key={`${attachment.path}-${index}`}>
              <span className="attachment-preview">
                <Icon
                  name={attachment.mimeType?.startsWith("image/") ? "image" : "code"}
                  size={15}
                />
              </span>
              <span className="attachment-name">
                {attachment.name}
                {attachment.size && <small>{formatBytes(attachment.size)}</small>}
              </span>
              <button
                aria-label={`Remove ${attachment.name}`}
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="composer-suggestions" id="composer-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => {
            const label =
              suggestion.kind === "file"
                ? suggestion.file.relativePath
                : suggestion.kind === "command"
                  ? `/${suggestion.command.name}`
                  : `/skill:${suggestion.skill.name}`
            const detail =
              suggestion.kind === "file"
                ? formatBytes(suggestion.file.size)
                : suggestion.kind === "command"
                  ? suggestion.command.description
                  : `${suggestion.skill.source} · ${suggestion.skill.description ?? "Installed skill"}`
            return (
              <button
                type="button"
                id={`composer-suggestion-${index}`}
                role="option"
                aria-selected={index === activeSuggestion}
                className={index === activeSuggestion ? "active" : ""}
                key={suggestion.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applySuggestion(suggestion)}
              >
                <span className="composer-suggestion-icon">
                  <Icon
                    name={
                      suggestion.kind === "file"
                        ? "code"
                        : suggestion.kind === "skill"
                          ? "spark"
                          : "terminal"
                    }
                    size={14}
                  />
                </span>
                <span className="composer-suggestion-copy">
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </button>
            )
          })}
        </div>
      )}
      <textarea
        ref={textareaRef}
        aria-label="Message agent"
        aria-autocomplete="list"
        aria-controls={suggestions.length > 0 ? "composer-suggestions" : undefined}
        aria-activedescendant={
          suggestions.length > 0
            ? `composer-suggestion-${activeSuggestion}`
            : undefined
        }
        onChange={(event) => {
          setText(event.target.value)
          setCursorPosition(event.target.selectionStart)
          setSuggestionsDismissed(false)
        }}
        onKeyDown={onComposerKeyDown}
        onPaste={(event) => void importPastedImages(event)}
        onSelect={(event) =>
          setCursorPosition(event.currentTarget.selectionStart)
        }
        placeholder="Message agent…  @ files  / commands"
        rows={1}
        value={text}
      />
      <div className="composer-toolbar">
        <div className="composer-tools">
          <SelectControl
            ariaLabel="Permission mode"
            className="composer-mode"
            compact
            onChange={(value) => setPermissionMode(value as PermissionMode)}
            options={[
              { value: "default", label: "Agent" },
              { value: "accept-edits", label: "Auto edit" },
              { value: "full-access", label: "Full access" },
            ]}
            value={permissionMode}
          />
          <SelectControl
            ariaLabel="Model"
            className="composer-model"
            compact
            onChange={setModel}
            options={uniqueModels.map((value) => ({ value, label: value }))}
            value={model}
          />
          <SelectControl
            ariaLabel="Reasoning effort"
            className="composer-effort"
            compact
            onChange={(value) => setEffort(value as EffortLevel)}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "max", label: "Max" },
            ]}
            value={effort}
          />
        </div>
        <div className="composer-actions">
          <button
            className="composer-icon-button"
            onClick={addAttachments}
            aria-label="Attach files"
            title="Attach files"
          >
            <Icon name="attachment" size={16} />
          </button>
          {busy ? (
            <button
              className="send-button stop-button"
              aria-label="Stop agent"
              onClick={cancel}
            >
              <Icon name="stop" size={16} />
            </button>
          ) : (
            <button
              className="send-button"
              aria-label="Send prompt"
              disabled={!text.trim() && attachments.length === 0}
              onClick={send}
            >
              <Icon name="arrow-up" size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
