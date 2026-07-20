import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type {
  AutomationDefinition,
  McpServerConfig,
  WorkspaceMemory
} from '../../shared/models'

interface IntegrationState {
  version: 1
  mcpServers: McpServerConfig[]
  memories: Record<string, WorkspaceMemory>
  automations: AutomationDefinition[]
}

const EMPTY_STATE: IntegrationState = {
  version: 1,
  mcpServers: [],
  memories: {},
  automations: []
}

export class IntegrationStore {
  private state: IntegrationState = structuredClone(EMPTY_STATE)
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {
    this.filePath = resolve(filePath)
  }

  async load(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    try {
      const decoded: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      if (!isRecord(decoded)) return
      this.state = {
        version: 1,
        mcpServers: Array.isArray(decoded.mcpServers)
          ? decoded.mcpServers as McpServerConfig[]
          : [],
        memories: isRecord(decoded.memories)
          ? decoded.memories as Record<string, WorkspaceMemory>
          : {},
        automations: Array.isArray(decoded.automations)
          ? decoded.automations as AutomationDefinition[]
          : []
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Unable to load integrations state.', error)
      }
    }
  }

  listMcpServers(): McpServerConfig[] {
    return structuredClone(this.state.mcpServers)
  }

  enabledMcpServers(): Array<{
    name: string
    command: string
    args: string[]
  }> {
    return this.state.mcpServers
      .filter((server) => server.enabled)
      .map(({ name, command, args }) => ({ name, command, args: [...args] }))
  }

  async saveMcpServer(input: {
    id?: string
    name: string
    command: string
    args: string[]
    enabled: boolean
  }): Promise<McpServerConfig[]> {
    const timestamp = new Date().toISOString()
    const existing = input.id
      ? this.state.mcpServers.find((server) => server.id === input.id)
      : undefined
    if (input.id && !existing) throw new Error('MCP server does not exist.')

    if (existing) {
      Object.assign(existing, input, { updatedAt: timestamp })
    } else {
      this.state.mcpServers.push({
        ...input,
        id: randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp
      })
    }
    await this.persist()
    return this.listMcpServers()
  }

  async removeMcpServer(id: string): Promise<McpServerConfig[]> {
    const next = this.state.mcpServers.filter((server) => server.id !== id)
    if (next.length === this.state.mcpServers.length) {
      throw new Error('MCP server does not exist.')
    }
    this.state.mcpServers = next
    await this.persist()
    return this.listMcpServers()
  }

  getMemory(projectId: string): WorkspaceMemory {
    return structuredClone(
      this.state.memories[projectId] ?? {
        projectId,
        enabled: true,
        content: '',
        updatedAt: new Date(0).toISOString()
      }
    )
  }

  memoryRules(projectId: string): string | undefined {
    const memory = this.state.memories[projectId]
    if (!memory?.enabled || !memory.content.trim()) return undefined
    return memory.content.trim()
  }

  async setMemory(input: {
    projectId: string
    enabled: boolean
    content: string
  }): Promise<WorkspaceMemory> {
    const memory: WorkspaceMemory = {
      ...input,
      updatedAt: new Date().toISOString()
    }
    this.state.memories[input.projectId] = memory
    await this.persist()
    return structuredClone(memory)
  }

  listAutomations(): AutomationDefinition[] {
    return structuredClone(
      [...this.state.automations].sort((left, right) =>
        left.name.localeCompare(right.name)
      )
    )
  }

  getAutomation(id: string): AutomationDefinition | undefined {
    const automation = this.state.automations.find((entry) => entry.id === id)
    return automation ? structuredClone(automation) : undefined
  }

  dueAutomations(now = Date.now()): AutomationDefinition[] {
    return this.state.automations
      .filter((automation) => automation.enabled)
      .filter(
        (automation) =>
          !automation.nextRunAt || Date.parse(automation.nextRunAt) <= now
      )
      .map((automation) => structuredClone(automation))
  }

  async saveAutomation(input: {
    id?: string
    name: string
    projectId: string
    prompt: string
    intervalMinutes: number
    enabled: boolean
  }): Promise<AutomationDefinition[]> {
    const timestamp = new Date().toISOString()
    const existing = input.id
      ? this.state.automations.find((automation) => automation.id === input.id)
      : undefined
    if (input.id && !existing) throw new Error('Automation does not exist.')
    const nextRunAt = input.enabled
      ? new Date(Date.now() + input.intervalMinutes * 60_000).toISOString()
      : undefined

    if (existing) {
      Object.assign(existing, input, { nextRunAt, updatedAt: timestamp })
    } else {
      this.state.automations.push({
        ...input,
        id: randomUUID(),
        nextRunAt,
        createdAt: timestamp,
        updatedAt: timestamp
      })
    }
    await this.persist()
    return this.listAutomations()
  }

  async markAutomationRun(
    id: string,
    runAt = new Date()
  ): Promise<AutomationDefinition> {
    const automation = this.state.automations.find((entry) => entry.id === id)
    if (!automation) throw new Error('Automation does not exist.')
    automation.lastRunAt = runAt.toISOString()
    automation.nextRunAt = automation.enabled
      ? new Date(runAt.getTime() + automation.intervalMinutes * 60_000).toISOString()
      : undefined
    automation.updatedAt = runAt.toISOString()
    await this.persist()
    return structuredClone(automation)
  }

  async removeAutomation(id: string): Promise<AutomationDefinition[]> {
    const next = this.state.automations.filter((automation) => automation.id !== id)
    if (next.length === this.state.automations.length) {
      throw new Error('Automation does not exist.')
    }
    this.state.automations = next
    await this.persist()
    return this.listAutomations()
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify(this.state, null, 2)
    const temporaryPath = `${this.filePath}.next`
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await writeFile(temporaryPath, payload, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.filePath)
    })
    return this.writeQueue
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
