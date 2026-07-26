import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Icon, type IconName } from "../../icons"
import { formatTime } from "../../lib/format"
import { isMac } from "../../lib/platform"
import type {
  AppSettings,
  AutomationDefinition,
  EffortLevel,
  McpServerConfig,
  PermissionMode,
  Project,
  ProviderSummary,
  RuntimeStatus,
  SkillSummary,
  WorkspaceMemory,
} from "../../types"
import { BrandMark } from "../brand/BrandMark"
import { RuntimeDot } from "../chrome/RuntimeDot"
import { SelectControl } from "../chrome/SelectControl"

type SettingsSection = "general" | "runtime" | "appearance" | "integrations"

export interface SettingsViewProps {
  settings: AppSettings
  runtime: RuntimeStatus
  projects: Project[]
  platform: string
  sidebarOpen: boolean
  onBack: () => void
  onNotify: (message: string) => void
  toggleSidebar: () => void
  onUpdate: (patch: Partial<AppSettings>) => void
}

export function SettingsView({
  settings,
  runtime,
  projects,
  sidebarOpen,
  onBack,
  onNotify,
  toggleSidebar,
  onUpdate,
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>("general")
  const [grokPath, setGrokPath] = useState(settings.grokPath)

  useEffect(() => setGrokPath(settings.grokPath), [settings.grokPath])

  const sections: Array<{
    id: SettingsSection
    label: string
    icon: IconName
  }> = [
    { id: "general", label: "General", icon: "gear" },
    { id: "runtime", label: "Grok runtime", icon: "terminal" },
    { id: "appearance", label: "Appearance", icon: "spark" },
    { id: "integrations", label: "Integrations", icon: "code" },
  ]

  return (
    <div className="settings-screen">
      <header className="settings-header drag-region">
        <div className="no-drag settings-header-actions">
          {!sidebarOpen && (
            <button
              className="icon-button sidebar-toggle-open"
              onClick={toggleSidebar}
              aria-label="Open sidebar"
            >
              <Icon name="layout-left" size={16} />
            </button>
          )}
          <button className="back-button" onClick={onBack}>
            <Icon name="chevron-left" size={16} />
            Workspace
          </button>
        </div>
        <h1>Settings</h1>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map((item) => (
            <button
              className={section === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSection(item.id)}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === "general" && (
            <SettingsSectionView
              title="General"
              description="Defaults for new Grok tasks in every workspace."
            >
              <SettingRow
                title="Default model"
                description="The ACP model selected when a task starts."
              >
                <input
                  className="settings-input short"
                  value={settings.defaultModel}
                  onChange={(event) =>
                    onUpdate({ defaultModel: event.target.value })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Reasoning effort"
                description="Higher effort can improve complex coding work."
              >
                <SelectControl
                  ariaLabel="Default reasoning effort"
                  onChange={(value) =>
                    onUpdate({ defaultEffort: value as EffortLevel })
                  }
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                    { value: "max", label: "Max" },
                  ]}
                  value={settings.defaultEffort}
                />
              </SettingRow>
              <SettingRow
                title="Permission mode"
                description="Controls when Grok asks before using workspace tools."
              >
                <SelectControl
                  ariaLabel="Default permission mode"
                  onChange={(value) =>
                    onUpdate({ defaultPermissionMode: value as PermissionMode })
                  }
                  options={[
                    { value: "default", label: "Ask every time" },
                    { value: "accept-edits", label: "Accept edits" },
                    { value: "full-access", label: "Full access" },
                  ]}
                  value={settings.defaultPermissionMode}
                />
              </SettingRow>
              <SettingRow
                title="Notifications"
                description="Notify when a background task completes or needs approval."
              >
                <Toggle
                  checked={settings.notifications}
                  onChange={(checked) => onUpdate({ notifications: checked })}
                />
              </SettingRow>
            </SettingsSectionView>
          )}

          {section === "runtime" && (
            <SettingsSectionView
              title="Grok runtime"
              description="Nolira Build starts Grok locally and communicates over ACP stdio."
            >
              <div className={`runtime-card runtime-card-${runtime.state}`}>
                <span className="runtime-card-icon">
                  <Icon name="terminal" size={20} />
                </span>
                <div>
                  <strong>
                    {runtime.state === "ready"
                      ? runtime.version
                        ? runtime.version.replace(/^grok\b/i, "Grok")
                        : "Grok is ready"
                      : runtime.state === "checking"
                        ? "Checking Grok…"
                        : "Grok is unavailable"}
                  </strong>
                  <p>{runtime.message ?? "Local ACP runtime"}</p>
                </div>
                <RuntimeDot runtime={runtime} />
              </div>
              <SettingRow
                title="Grok executable"
                description="Leave empty to discover Grok from the bundled runtime or PATH."
                vertical
              >
                <div className="path-input-wrap">
                  <Icon name="terminal" size={16} />
                  <input
                    className="settings-input"
                    onBlur={() => onUpdate({ grokPath })}
                    onChange={(event) => setGrokPath(event.target.value)}
                    placeholder="Auto-detect"
                    value={grokPath}
                  />
                </div>
              </SettingRow>
              <div className="settings-note">
                <Icon name="info" size={16} />
                <p>
                  The renderer never receives shell access or Node.js APIs. Files,
                  sessions, and permission decisions cross the isolated preload bridge.
                </p>
              </div>
            </SettingsSectionView>
          )}

          {section === "appearance" && (
            <SettingsSectionView
              title="Appearance"
              description="Match the desktop or choose a fixed theme."
            >
              <SettingRow title="Theme" description="Used across every workspace.">
                <div className="theme-picker">
                  {(["system", "light", "dark"] as const).map((theme) => (
                    <button
                      className={settings.theme === theme ? "active" : ""}
                      key={theme}
                      onClick={() => onUpdate({ theme })}
                    >
                      <span className={`theme-preview theme-${theme}`}>
                        <i />
                        <b />
                      </span>
                      {theme.charAt(0).toUpperCase() + theme.slice(1)}
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow
                title="Activity panel"
                description="Show tool calls beside the conversation by default."
              >
                <Toggle
                  checked={settings.showActivityPanel}
                  onChange={(checked) =>
                    onUpdate({ showActivityPanel: checked })
                  }
                />
              </SettingRow>
            </SettingsSectionView>
          )}

          {section === "integrations" && (
            <IntegrationsSettings onNotify={onNotify} projects={projects} />
          )}
        </div>
      </div>
    </div>
  )
}

export type IntegrationTab = "provider" | "skills" | "mcp" | "memory" | "automations"

export function IntegrationsSettings({
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
      onNotify("MCP server saved; it will be used by new sessions")
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not save MCP server")
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
      onNotify(error instanceof Error ? error.message : "Could not save memory")
    } finally {
      setSaving(false)
    }
  }

  const saveNewAutomation = async () => {
    if (!api || !projectId || !automationName.trim() || !automationPrompt.trim()) {
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
      onNotify(error instanceof Error ? error.message : "Could not save automation")
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
    if (!api || !window.confirm(`Remove automation “${automation.name}”?`)) return
    const response = await api.invoke("automations.remove", { id: automation.id })
    if (response.ok) setAutomations(response.data.automations)
    else onNotify(response.error.message)
  }

  const runAutomationNow = async (automation: AutomationDefinition) => {
    if (!api) return
    const response = await api.invoke("automations.runNow", { id: automation.id })
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

  const integrationTabs: Array<{
    id: IntegrationTab
    label: string
  }> = [
    { id: "provider", label: "Provider" },
    { id: "skills", label: "Skills" },
    { id: "mcp", label: "MCP" },
    { id: "memory", label: "Memory" },
    { id: "automations", label: "Automations" },
  ]

  return (
    <section className="settings-section integrations-settings">
      <div className="settings-section-heading">
        <h2>Integrations</h2>
        <p>Connect the Grok runtime to your tools and recurring workflows.</p>
      </div>
      <div className="integration-tabs" role="tablist">
        {integrationTabs.map((item) => (
          <button
            type="button"
            className={tab === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setTab(item.id)}
            role="tab"
            aria-selected={tab === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(tab === "skills" || tab === "memory" || tab === "automations") && (
        <label className="integration-project-picker">
          <span>Repository</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {tab === "provider" && (
        <div className="integration-card-list">
          {providers.map((provider) => (
            <div className="integration-card provider-card" key={provider.id}>
              <span className="integration-card-icon">
                <BrandMark size={20} />
              </span>
              <div>
                <strong>{provider.name}</strong>
                <p>
                  Authentication is owned by the Grok CLI; Nolira Build never stores
                  or copies the account token.
                </p>
                <small>
                  {provider.version ?? provider.state}
                  {provider.models.length > 0
                    ? ` · ${provider.models.length} models`
                    : ""}
                </small>
              </div>
              <RuntimeDot runtime={{ state: provider.state }} />
            </div>
          ))}
        </div>
      )}

      {tab === "skills" && (
        <div className="integration-card-list compact-list">
          {skills.map((skill) => (
            <div className="integration-card" key={skill.id}>
              <span className="integration-card-icon"><Icon name="spark" size={16} /></span>
              <div>
                <strong>{skill.name}</strong>
                <p>{skill.description ?? "Installed skill"}</p>
                <small>{skill.source}</small>
              </div>
            </div>
          ))}
          {skills.length === 0 && <div className="integration-empty">No skills found.</div>}
        </div>
      )}

      {tab === "mcp" && (
        <>
          <div className="integration-card-list compact-list">
            {servers.map((server) => (
              <div className="integration-card integration-manage-row" key={server.id}>
                <span className="integration-card-icon"><Icon name="terminal" size={16} /></span>
                <div>
                  <strong>{server.name}</strong>
                  <p><code>{server.command} {server.args.join(" ")}</code></p>
                </div>
                <Toggle
                  checked={server.enabled}
                  onChange={(enabled) => void updateMcp(server, enabled)}
                />
                <button type="button" onClick={() => void removeMcp(server)} aria-label={`Remove ${server.name}`}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="integration-form">
            <h3>Add stdio MCP server</h3>
            <input placeholder="Name" value={mcpName} onChange={(event) => setMcpName(event.target.value)} />
            <input placeholder="Command, e.g. npx" value={mcpCommand} onChange={(event) => setMcpCommand(event.target.value)} />
            <textarea placeholder="Arguments, one per line" value={mcpArgs} onChange={(event) => setMcpArgs(event.target.value)} />
            <button type="button" disabled={saving || !mcpName.trim() || !mcpCommand.trim()} onClick={() => void saveNewMcp()}>
              Add MCP server
            </button>
          </div>
        </>
      )}

      {tab === "memory" && (
        <div className="integration-form memory-form">
          <div className="integration-form-heading">
            <div>
              <h3>Workspace memory</h3>
              <p>Injected as ACP session rules when a new session connects.</p>
            </div>
            <Toggle checked={memoryEnabled} onChange={setMemoryEnabled} />
          </div>
          <textarea
            className="memory-editor"
            placeholder="Repository conventions, verification expectations, and durable context…"
            value={memoryContent}
            onChange={(event) => setMemoryContent(event.target.value)}
          />
          <div className="integration-form-footer">
            <small>{memory?.updatedAt && Date.parse(memory.updatedAt) > 0 ? `Last saved ${formatTime(memory.updatedAt)}` : "Not saved yet"}</small>
            <button type="button" disabled={saving || !projectId} onClick={() => void saveMemory()}>
              Save memory
            </button>
          </div>
        </div>
      )}

      {tab === "automations" && (
        <>
          <div className="integration-card-list compact-list">
            {automations.map((automation) => (
              <div className="integration-card automation-row" key={automation.id}>
                <span className="integration-card-icon"><Icon name="activity" size={16} /></span>
                <div>
                  <strong>{automation.name}</strong>
                  <p>{automation.prompt}</p>
                  <small>
                    Every {automation.intervalMinutes} min
                    {automation.nextRunAt ? ` · next ${formatTime(automation.nextRunAt)}` : ""}
                  </small>
                </div>
                <div className="automation-actions">
                  <button type="button" onClick={() => void runAutomationNow(automation)}>Run</button>
                  <Toggle checked={automation.enabled} onChange={(enabled) => void updateAutomation(automation, enabled)} />
                  <button type="button" onClick={() => void removeAutomation(automation)} aria-label={`Remove ${automation.name}`}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="integration-form">
            <h3>New recurring automation</h3>
            <input placeholder="Name" value={automationName} onChange={(event) => setAutomationName(event.target.value)} />
            <textarea placeholder="Prompt to run" value={automationPrompt} onChange={(event) => setAutomationPrompt(event.target.value)} />
            <label className="automation-interval">
              <span>Every</span>
              <input type="number" min={5} max={10080} value={automationInterval} onChange={(event) => setAutomationInterval(Number(event.target.value))} />
              <span>minutes</span>
            </label>
            <button type="button" disabled={saving || !projectId || !automationName.trim() || !automationPrompt.trim()} onClick={() => void saveNewAutomation()}>
              Create automation
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export function SettingsSectionView({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-card">{children}</div>
    </section>
  )
}

export function SettingRow({
  title,
  description,
  children,
  vertical,
}: {
  title: string
  description: string
  children: ReactNode
  vertical?: boolean
}) {
  return (
    <div className={`setting-row ${vertical ? "vertical" : ""}`}>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      aria-checked={checked}
      className={`toggle ${checked ? "checked" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
    >
      <span />
    </button>
  )
}
