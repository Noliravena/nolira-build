import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { IntegrationStore } from '.'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true })
    )
  )
})

describe('IntegrationStore', () => {
  it('persists MCP servers and workspace memory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-integrations-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'integrations.json')
    const store = new IntegrationStore(statePath)
    await store.load()

    await store.saveMcpServer({
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      enabled: true
    })
    await store.setMemory({
      projectId: 'project-1',
      enabled: true,
      content: 'Prefer focused tests.'
    })

    const restored = new IntegrationStore(statePath)
    await restored.load()
    expect(restored.enabledMcpServers()).toEqual([
      {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem']
      }
    ])
    expect(restored.memoryRules('project-1')).toBe('Prefer focused tests.')
  })

  it('schedules, marks, and removes recurring automations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-automations-'))
    temporaryDirectories.push(directory)
    const store = new IntegrationStore(join(directory, 'integrations.json'))
    await store.load()

    const [automation] = await store.saveAutomation({
      name: 'Run checks',
      projectId: 'project-1',
      prompt: 'Run the relevant checks.',
      intervalMinutes: 15,
      enabled: true
    })
    expect(automation).toBeDefined()
    expect(store.dueAutomations(Date.parse(automation!.nextRunAt!) + 1)).toEqual([
      expect.objectContaining({ id: automation!.id })
    ])

    const runAt = new Date('2026-07-20T00:00:00.000Z')
    const marked = await store.markAutomationRun(automation!.id, runAt)
    expect(marked).toMatchObject({
      lastRunAt: '2026-07-20T00:00:00.000Z',
      nextRunAt: '2026-07-20T00:15:00.000Z'
    })
    await store.removeAutomation(automation!.id)
    expect(store.listAutomations()).toEqual([])
  })
})
