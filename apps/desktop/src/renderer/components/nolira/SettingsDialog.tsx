import { useEffect, useState, type ReactNode } from "react"

import { Icon } from "../../icons"
import { formatTime } from "../../lib/format"
import { isMac } from "../../lib/platform"
import type {
  AccentColor,
  AppSettings,
  AutomationDefinition,
  EffortLevel,
  McpServerConfig,
  PermissionMode,
  Project,
  ProviderSummary,
  RuntimeStatus,
  SkillSummary,
  ThemeMode,
  WorkspaceMemory,
} from "../../types"
import { Menu } from "./Menu"

type SettingsTab =
  | "general"
  | "runtime"
  | "appearance"
  | "integrations"
  | "shortcuts"

const ACCENT_HEX: Record<AccentColor, string> = {
  ember: "#bf7550",
  blue: "#7096c4",
  violet: "#8f83c6",
  mint: "#6fa88a",
}

export function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      aria-checked={checked}
      aria-label={ariaLabel}
      className="nol-toggle"
      data-on={checked}
      onClick={() => onChange(!checked)}
      role="switch"
    >
      <span />
    </button>
  )
}

function SettingRow({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <div className="nol-setting-row">
      <div className="nol-setting-copy">
        <div className="nol-setting-title">{title}</div>
        <div className="nol-setting-hint">{hint}</div>
      </div>
      <div style={{ flex: "none", position: "relative" }}>{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="nol-eyebrow">{children}</div>
}

export interface SettingsDialogProps {
  settings: AppSettings
  runtime: RuntimeStatus
  projects: Project[]
  models: string[]
  platform: string
  onUpdate: (patch: Partial<AppSettings>) => void
  onNotify: (message: string) => void
  onClose: () => void
}

export function SettingsDialog({
  settings,
  runtime,
  projects,
  models,
  platform,
  onUpdate,
  onNotify,
  onClose,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>("general")
  const [grokPath, setGrokPath] = useState(settings.grokPath)
  useEffect(() => setGrokPath(settings.grokPath), [settings.grokPath])

  const mac = isMac(platform)
  const mod = mac ? "⌘" : "Ctrl"

  const navItems: Array<[SettingsTab, string]> = [
    ["general", "General"],
    ["runtime", "Runtime"],
    ["appearance", "Appearance"],
    ["integrations", "Integrations"],
    ["shortcuts", "Shortcuts"],
  ]

  const modelOptions = Array.from(
    new Set([settings.defaultModel, ...models].filter(Boolean)),
  ).map((value) => ({ value, label: value }))

  return (
    <div className="nol-overlay" onClick={onClose}>
      <div
        className="nol-dialog nol-settings-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="nol-dialog-head">
          <Icon name="sliders" size={17} style={{ color: "var(--mu)" }} />
          <span className="nol-dialog-title">Settings</span>
          <span className="nol-kbd">{mod} ,</span>
          <div className="nol-flex1" />
          <button
            type="button"
            className="nol-dialog-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="nol-settings-body">
          <nav className="nol-settings-nav">
            {navItems.map(([key, label]) => (
              <button
                type="button"
                data-active={tab === key}
                key={key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
            <div className="nol-settings-nav-foot">
              <span
                className="nol-runtime-dot"
                data-state={runtime.state}
                style={{ width: 6, height: 6 }}
              />
              <span>
                {runtime.version ?? "runtime"} ·{" "}
                {runtime.state === "ready" ? "up" : runtime.state}
              </span>
            </div>
          </nav>
          <div className="nol-settings-content">
            {tab === "general" && (
              <>
                <SectionLabel>General</SectionLabel>
                <div className="nol-settings-rows">
                  <SettingRow
                    hint="Used for new tasks started from the home composer."
                    title="Default model"
                  >
                    <Menu
                      ariaLabel="Default model"
                      drop="down-right"
                      minWidth={230}
                      mono
                      onSelect={(value) => onUpdate({ defaultModel: value })}
                      options={modelOptions}
                      value={settings.defaultModel}
                      variant="setting"
                    />
                  </SettingRow>
                  <SettingRow
                    hint="Higher effort plans longer before touching files."
                    title="Reasoning effort"
                  >
                    <Menu
                      ariaLabel="Reasoning effort"
                      drop="down-right"
                      minWidth={180}
                      onSelect={(value) =>
                        onUpdate({ defaultEffort: value as EffortLevel })
                      }
                      options={[
                        { value: "low", label: "Low" },
                        { value: "medium", label: "Medium" },
                        { value: "high", label: "High" },
                        { value: "max", label: "Max" },
                      ]}
                      value={settings.defaultEffort}
                      variant="setting"
                    />
                  </SettingRow>
                  <SettingRow
                    hint="Controls when an agent may write files or run shell commands."
                    title="Permission mode"
                  >
                    <Menu
                      ariaLabel="Permission mode"
                      drop="down-right"
                      minWidth={200}
                      onSelect={(value) =>
                        onUpdate({
                          defaultPermissionMode: value as PermissionMode,
                        })
                      }
                      options={[
                        { value: "default", label: "Ask first" },
                        { value: "accept-edits", label: "Auto-edit" },
                        { value: "full-access", label: "Full access" },
                      ]}
                      value={settings.defaultPermissionMode}
                      variant="setting"
                    />
                  </SettingRow>
                  <SettingRow
                    hint="Ping me when an agent needs review or finishes."
                    title="Desktop notifications"
                  >
                    <Toggle
                      ariaLabel="Desktop notifications"
                      checked={settings.notifications}
                      onChange={(checked) =>
                        onUpdate({ notifications: checked })
                      }
                    />
                  </SettingRow>
                </div>
              </>
            )}

            {tab === "runtime" && (
              <>
                <SectionLabel>Runtime</SectionLabel>
                <div className="nol-runtime-card">
                  <div className="nol-runtime-card-row">
                    <span
                      className="nol-runtime-dot"
                      data-state={runtime.state}
                    />
                    <span>
                      {runtime.state === "ready"
                        ? `Grok ACP runtime — connected`
                        : runtime.state === "checking"
                          ? "Checking the Grok runtime…"
                          : "Grok runtime is unavailable"}
                    </span>
                    <div className="nol-flex1" />
                    <span className="nol-pane-meta">
                      {runtime.version ?? ""}
                    </span>
                  </div>
                  <p>
                    {runtime.message ??
                      "Agents run through a local ACP process per task. File writes and shell commands cross the isolated preload bridge and honor the permission mode."}
                  </p>
                  {runtime.binaryPath && (
                    <div className="nol-runtime-actions">
                      <button
                        type="button"
                        className="nol-btn-outline"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(runtime.binaryPath!)
                            .then(() => onNotify("Copied binary path"))
                        }}
                      >
                        Copy binary path
                      </button>
                      <button
                        type="button"
                        className="nol-btn-outline"
                        onClick={() =>
                          void window.nolira?.openPath(runtime.binaryPath!)
                        }
                      >
                        Reveal
                      </button>
                    </div>
                  )}
                </div>
                <div className="nol-settings-rows">
                  <SettingRow
                    hint="Leave empty to discover Grok from the bundled runtime or PATH."
                    title="Grok executable"
                  >
                    <input
                      className="nol-settings-input nol-mono"
                      onBlur={() => onUpdate({ grokPath })}
                      onChange={(event) => setGrokPath(event.target.value)}
                      placeholder="Auto-detect"
                      value={grokPath}
                    />
                  </SettingRow>
                </div>
                <div className="nol-settings-note">
                  <Icon name="shield" size={17} />
                  <p>
                    Full access bypasses per-command approval inside the
                    sandboxed runtime. The renderer never receives shell access
                    or Node.js APIs — every action crosses the isolated preload
                    bridge.
                  </p>
                </div>
              </>
            )}

            {tab === "appearance" && (
              <>
                <SectionLabel>Appearance</SectionLabel>
                <div style={{ marginTop: 16, fontSize: 14 }}>Theme</div>
                <div className="nol-theme-options">
                  {(
                    [
                      ["system", "System", "linear-gradient(90deg,#141416 50%,#f4f4f2 50%)"],
                      ["dark", "Dark", "#141416"],
                      ["light", "Light", "#f4f4f2"],
                    ] as Array<[ThemeMode, string, string]>
                  ).map(([value, label, swatch]) => (
                    <button
                      type="button"
                      className="nol-theme-option"
                      data-active={settings.theme === value}
                      key={value}
                      onClick={() => onUpdate({ theme: value })}
                    >
                      <div
                        className="nol-theme-swatch"
                        style={{ background: swatch }}
                      />
                      <div className="nol-theme-option-label">
                        <span>{label}</span>
                        {settings.theme === value && (
                          <Icon name="check" size={15} />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 22, fontSize: 14 }}>Accent</div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12.5,
                    color: "var(--mu)",
                  }}
                >
                  Used for status, focus rings and progress only.
                </div>
                <div className="nol-accent-row">
                  {(Object.keys(ACCENT_HEX) as AccentColor[]).map((accent) => (
                    <button
                      type="button"
                      className="nol-accent-swatch"
                      data-active={settings.accent === accent}
                      key={accent}
                      onClick={() => onUpdate({ accent })}
                      title={accent}
                      aria-label={`Accent ${accent}`}
                    >
                      <span style={{ background: ACCENT_HEX[accent] }} />
                    </button>
                  ))}
                </div>
                <div
                  className="nol-settings-rows"
                  style={{ marginTop: 22, borderTop: "1px solid var(--bd2)" }}
                >
                  <SettingRow
                    hint="Show terminal and diffs beside the conversation."
                    title="Open live pane by default"
                  >
                    <Toggle
                      ariaLabel="Open live pane by default"
                      checked={settings.showActivityPanel}
                      onChange={(checked) =>
                        onUpdate({ showActivityPanel: checked })
                      }
                    />
                  </SettingRow>
                </div>
              </>
            )}

            {tab === "integrations" && (
              <IntegrationsPane onNotify={onNotify} projects={projects} />
            )}

            {tab === "shortcuts" && (
              <>
                <SectionLabel>Shortcuts</SectionLabel>
                <div className="nol-settings-rows" style={{ marginTop: 12 }}>
                  {(
                    [
                      ["New task", `${mod} N`],
                      ["Search everything", `${mod} K`],
                      ["Start / send", `${mod} ↵`],
                      ["Toggle live pane", `${mod} \\`],
                      ["Settings", `${mod} ,`],
                      ["Close dialogs", "esc"],
                    ] as Array<[string, string]>
                  ).map(([label, keys]) => (
                    <div className="nol-shortcut-row" key={label}>
                      <span>{label}</span>
                      <span className="nol-shortcut-keys">{keys}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Integrations ---------- */

type IntegrationTab = "provider" | "skills" | "mcp" | "memory" | "automations"

function IntegrationsPane({
  projects,
  onNotify,
}: {
  projects: Project[]
  onNotify: (message: string) => void
}) {
  const api = window.nolira
  const [tab, setTab] = useState<IntegrationTab>("provider")
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "")
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [memory, setMemory] = useState<WorkspaceMemory>()
  const [memoryContent, setMemoryContent] = useState("")
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [automations, setAutomations] = useState<AutomationDefinition[]>([])
  const [mcpName, setMcpName] = useState("")
  const [mcpCommand, setMcpCommand] = useState("")
  const [mcpArgs, setMcpArgs] = useState("")
  const [automationName, setAutomationName] = useState("")
  const [automationPrompt, setAutomationPrompt] = useState("")
  const [automationInterval, setAutomationInterval] = useState(60)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id)
  }, [projectId, projects])

  useEffect(() => {
    if (!api) return
    let alive = true
    void api.invoke("providers.list", {}).then((response) => {
      if (alive && response.ok) setProviders(response.data.providers)
    })
    void api.invoke("mcp.list", {}).then((response) => {
      if (alive && response.ok) setServers(response.data.servers)
    })
    void api.invoke("automations.list", {}).then((response) => {
      if (alive && response.ok) setAutomations(response.data.automations)
    })
    return () => {
      alive = false
    }
  }, [api])

  useEffect(() => {
    if (!api) return
    let alive = true
    void api
      .invoke("skills.list", { projectId: projectId || undefined })
      .then((response) => {
        if (alive && response.ok) setSkills(response.data.skills)
      })
    if (projectId) {
      void api.invoke("memory.get", { projectId }).then((response) => {
        if (!alive || !response.ok) return
        setMemory(response.data.memory)
        setMemoryContent(response.data.memory.content)
        setMemoryEnabled(response.data.memory.enabled)
      })
    }
    return () => {
      alive = false
    }
  }, [api, projectId])

  const saveNewMcp = async () => {
    if (!api || !mcpName.trim() || !mcpCommand.trim()) return
    setSaving(true)
    try {
      const response = await api.invoke("mcp.save", {
        name: mcpName.trim(),
        command: mcpCommand.trim(),
        args: mcpArgs
          .split("\n")
          .map((argument) => argument.trim())
          .filter(Boolean),
        enabled: true,
      })
      if (!response.ok) throw new Error(response.error.message)
      setServers(response.data.servers)
      setMcpName("")
      setMcpCommand("")
      setMcpArgs("")
      onNotify("MCP server saved; new sessions will use it")
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : "Could not save MCP server",
      )
    } finally {
      setSaving(false)
    }
  }

  const updateMcp = async (server: McpServerConfig, enabled: boolean) => {
    if (!api) return
    const response = await api.invoke("mcp.save", { ...server, enabled })
    if (response.ok) setServers(response.data.servers)
    else onNotify(response.error.message)
  }

  const removeMcp = async (server: McpServerConfig) => {
    if (!api || !window.confirm(`Remove MCP server “${server.name}”?`)) return
    const response = await api.invoke("mcp.remove", { id: server.id })
    if (response.ok) setServers(response.data.servers)
    else onNotify(response.error.message)
  }

  const saveMemory = async () => {
    if (!api || !projectId) return
    setSaving(true)
    try {
      const response = await api.invoke("memory.set", {
        projectId,
        enabled: memoryEnabled,
        content: memoryContent,
      })
      if (!response.ok) throw new Error(response.error.message)
      setMemory(response.data.memory)
      onNotify("Workspace memory saved for new sessions")
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : "Could not save memory",
      )
    } finally {
      setSaving(false)
    }
  }

  const saveNewAutomation = async () => {
    if (
      !api ||
      !projectId ||
      !automationName.trim() ||
      !automationPrompt.trim()
    ) {
      return
    }
    setSaving(true)
    try {
      const response = await api.invoke("automations.save", {
        name: automationName.trim(),
        projectId,
        prompt: automationPrompt.trim(),
        intervalMinutes: automationInterval,
        enabled: true,
      })
      if (!response.ok) throw new Error(response.error.message)
      setAutomations(response.data.automations)
      setAutomationName("")
      setAutomationPrompt("")
      onNotify("Automation scheduled")
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : "Could not save automation",
      )
    } finally {
      setSaving(false)
    }
  }

  const updateAutomation = async (
    automation: AutomationDefinition,
    enabled: boolean,
  ) => {
    if (!api) return
    const response = await api.invoke("automations.save", {
      id: automation.id,
      name: automation.name,
      projectId: automation.projectId,
      prompt: automation.prompt,
      intervalMinutes: automation.intervalMinutes,
      enabled,
    })
    if (response.ok) setAutomations(response.data.automations)
    else onNotify(response.error.message)
  }

  const removeAutomation = async (automation: AutomationDefinition) => {
    if (!api || !window.confirm(`Remove automation “${automation.name}”?`)) {
      return
    }
    const response = await api.invoke("automations.remove", {
      id: automation.id,
    })
    if (response.ok) setAutomations(response.data.automations)
    else onNotify(response.error.message)
  }

  const runAutomationNow = async (automation: AutomationDefinition) => {
    if (!api) return
    const response = await api.invoke("automations.runNow", {
      id: automation.id,
    })
    if (!response.ok) {
      onNotify(response.error.message)
      return
    }
    setAutomations((current) =>
      current.map((item) =>
        item.id === response.data.automation.id
          ? response.data.automation
          : item,
      ),
    )
    onNotify(`Started ${automation.name}`)
  }

  const needsProject =
    tab === "skills" || tab === "memory" || tab === "automations"

  return (
    <>
      <SectionLabel>Integrations</SectionLabel>
      <div className="nol-chip-row" style={{ marginTop: 14, flexWrap: "wrap" }}>
        {(
          [
            ["provider", "Provider"],
            ["skills", "Skills"],
            ["mcp", "MCP"],
            ["memory", "Memory"],
            ["automations", "Automations"],
          ] as Array<[IntegrationTab, string]>
        ).map(([key, label]) => (
          <button
            type="button"
            className="nol-chip"
            data-active={tab === key}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
        {needsProject && projects.length > 0 && (
          <>
            <div className="nol-flex1" />
            <Menu
              ariaLabel="Repository"
              drop="down-right"
              icon="folder"
              minWidth={240}
              mono
              onSelect={setProjectId}
              options={projects.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
              value={projectId}
              variant="box"
            />
          </>
        )}
      </div>

      {tab === "provider" && (
        <div className="nol-integration-list">
          {providers.map((provider) => (
            <div className="nol-integration-card" key={provider.id}>
              <div className="nol-integration-copy">
                <div className="nol-integration-name-row">
                  <span className="nol-integration-name">{provider.name}</span>
                  <span
                    className="nol-integration-state"
                    style={{
                      color:
                        provider.state === "ready"
                          ? "var(--ok)"
                          : "var(--wr)",
                    }}
                  >
                    {provider.state === "ready" ? "connected" : provider.state}
                  </span>
                </div>
                <div className="nol-integration-detail">
                  Authentication is owned by the Grok CLI; Nolira never stores
                  or copies the account token.
                  {provider.models.length > 0
                    ? ` ${provider.models.length} models available.`
                    : ""}
                </div>
              </div>
              <span className="nol-pane-meta">{provider.version ?? ""}</span>
            </div>
          ))}
          {providers.length === 0 && (
            <div className="nol-integration-card">
              <div className="nol-integration-copy">
                <div className="nol-integration-name-row">
                  <span className="nol-integration-name">Grok ACP</span>
                  <span
                    className="nol-integration-state"
                    style={{ color: "var(--wr)" }}
                  >
                    offline
                  </span>
                </div>
                <div className="nol-integration-detail">
                  Provider details are available in the desktop app.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "skills" && (
        <div className="nol-integration-list">
          {skills.map((skill) => (
            <div className="nol-integration-card" key={skill.id}>
              <div className="nol-integration-copy">
                <div className="nol-integration-name-row">
                  <span className="nol-integration-name">{skill.name}</span>
                  <span
                    className="nol-integration-state"
                    style={{ color: "var(--mu)" }}
                  >
                    {skill.source}
                  </span>
                </div>
                <div className="nol-integration-detail">
                  {skill.description ?? "Installed skill"}
                </div>
              </div>
            </div>
          ))}
          {skills.length === 0 && (
            <div className="nol-pane-empty">
              <Icon name="spark" size={22} />
              <strong>No skills found</strong>
              <p>Skill packs are loaded from the workspace at task start.</p>
            </div>
          )}
        </div>
      )}

      {tab === "mcp" && (
        <>
          <div className="nol-integration-list">
            {servers.map((server) => (
              <div className="nol-integration-card" key={server.id}>
                <div className="nol-integration-copy">
                  <div className="nol-integration-name-row">
                    <span className="nol-integration-name">{server.name}</span>
                    <span
                      className="nol-integration-state"
                      style={{
                        color: server.enabled ? "var(--ok)" : "var(--fa)",
                      }}
                    >
                      {server.enabled ? "enabled" : "off"}
                    </span>
                  </div>
                  <div className="nol-integration-detail nol-mono">
                    {server.command} {server.args.join(" ")}
                  </div>
                </div>
                <Toggle
                  ariaLabel={`Toggle ${server.name}`}
                  checked={server.enabled}
                  onChange={(enabled) => void updateMcp(server, enabled)}
                />
                <button
                  type="button"
                  className="nol-dialog-close"
                  onClick={() => void removeMcp(server)}
                  aria-label={`Remove ${server.name}`}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="nol-integration-form">
            <h3>Add stdio MCP server</h3>
            <input
              placeholder="Name"
              value={mcpName}
              onChange={(event) => setMcpName(event.target.value)}
            />
            <input
              placeholder="Command, e.g. npx"
              value={mcpCommand}
              onChange={(event) => setMcpCommand(event.target.value)}
            />
            <textarea
              placeholder="Arguments, one per line"
              value={mcpArgs}
              onChange={(event) => setMcpArgs(event.target.value)}
            />
            <div className="nol-form-footrow">
              <small>New sessions pick up enabled servers automatically.</small>
              <button
                type="button"
                className="nol-btn-solid"
                disabled={saving || !mcpName.trim() || !mcpCommand.trim()}
                onClick={() => void saveNewMcp()}
              >
                Add MCP server
              </button>
            </div>
          </div>
        </>
      )}

      {tab === "memory" && (
        <div className="nol-integration-form">
          <div className="nol-form-footrow">
            <div style={{ flex: 1 }}>
              <h3>Workspace memory</h3>
              <small>
                Injected as session rules when a new session connects.
              </small>
            </div>
            <Toggle
              ariaLabel="Enable workspace memory"
              checked={memoryEnabled}
              onChange={setMemoryEnabled}
            />
          </div>
          <textarea
            className="nol-memory-editor"
            placeholder="Repository conventions, verification expectations, and durable context…"
            value={memoryContent}
            onChange={(event) => setMemoryContent(event.target.value)}
          />
          <div className="nol-form-footrow">
            <small>
              {memory?.updatedAt && Date.parse(memory.updatedAt) > 0
                ? `Last saved ${formatTime(memory.updatedAt)}`
                : "Not saved yet"}
            </small>
            <button
              type="button"
              className="nol-btn-solid"
              disabled={saving || !projectId}
              onClick={() => void saveMemory()}
            >
              Save memory
            </button>
          </div>
        </div>
      )}

      {tab === "automations" && (
        <>
          <div className="nol-integration-list">
            {automations.map((automation) => (
              <div className="nol-integration-card" key={automation.id}>
                <div className="nol-integration-copy">
                  <div className="nol-integration-name-row">
                    <span className="nol-integration-name">
                      {automation.name}
                    </span>
                    <span
                      className="nol-integration-state"
                      style={{
                        color: automation.enabled
                          ? "var(--ok)"
                          : "var(--wr)",
                      }}
                    >
                      {automation.enabled ? "active" : "paused"}
                    </span>
                  </div>
                  <div className="nol-integration-detail">
                    {automation.prompt}
                  </div>
                  <div
                    className="nol-integration-detail"
                    style={{ color: "var(--fa)" }}
                  >
                    Every {automation.intervalMinutes} min
                    {automation.nextRunAt
                      ? ` · next ${formatTime(automation.nextRunAt)}`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="nol-btn-outline"
                  onClick={() => void runAutomationNow(automation)}
                >
                  Run
                </button>
                <Toggle
                  ariaLabel={`Toggle ${automation.name}`}
                  checked={automation.enabled}
                  onChange={(enabled) =>
                    void updateAutomation(automation, enabled)
                  }
                />
                <button
                  type="button"
                  className="nol-dialog-close"
                  onClick={() => void removeAutomation(automation)}
                  aria-label={`Remove ${automation.name}`}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="nol-integration-form">
            <h3>New recurring automation</h3>
            <input
              placeholder="Name"
              value={automationName}
              onChange={(event) => setAutomationName(event.target.value)}
            />
            <textarea
              placeholder="Prompt to run"
              value={automationPrompt}
              onChange={(event) => setAutomationPrompt(event.target.value)}
            />
            <div className="nol-interval-row">
              <span>Every</span>
              <input
                type="number"
                min={5}
                max={10080}
                value={automationInterval}
                onChange={(event) =>
                  setAutomationInterval(Number(event.target.value))
                }
              />
              <span>minutes</span>
            </div>
            <div className="nol-form-footrow">
              <small>Triggers can open tasks unattended.</small>
              <button
                type="button"
                className="nol-btn-solid"
                disabled={
                  saving ||
                  !projectId ||
                  !automationName.trim() ||
                  !automationPrompt.trim()
                }
                onClick={() => void saveNewAutomation()}
              >
                Create automation
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
