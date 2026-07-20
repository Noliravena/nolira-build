import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { DesktopStore } from './store'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true })
    )
  )
})

describe('DesktopStore', () => {
  it('persists projects, tasks, settings, and the selected task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-store-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'state.json')
    const workspacePath = join(directory, 'workspace')

    const store = new DesktopStore(statePath)
    await store.load()
    const project = await store.createProject({
      path: workspacePath,
      name: 'Workspace'
    })
    const task = await store.createTask({ projectId: project.id })
    await store.updateSettings({ theme: 'dark' })

    const restored = new DesktopStore(statePath)
    await restored.load()

    expect(restored.snapshot()).toMatchObject({
      activeTaskId: task.id,
      projects: [{ id: project.id, name: 'Workspace' }],
      tasks: [{ id: task.id, projectId: project.id }],
      settings: { theme: 'dark', defaultModel: 'grok-4.5' }
    })
    expect(restored.isAllowedPath(join(workspacePath, 'src', 'index.ts'))).toBe(
      true
    )
    expect(restored.isAllowedPath(join(directory, 'outside.txt'))).toBe(false)
  })

  it('indexes Grok sessions without duplicating their disk-owned messages', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-store-session-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'state.json')
    const workspacePath = join(directory, 'workspace')

    const store = new DesktopStore(statePath)
    await store.load()
    const project = await store.createProject({ path: workspacePath })
    const [task] = await store.syncIndexedSessions([
      {
        sessionId: 'session-a',
        projectId: project.id,
        cwd: workspacePath,
        title: 'Imported Grok session',
        model: 'grok-4.5',
        messageCount: 1,
        createdAt: '2026-07-19T08:00:00.000Z',
        updatedAt: '2026-07-19T08:01:00.000Z',
        archived: false,
        pinned: false,
        source: 'grok'
      }
    ])
    expect(task).toBeDefined()
    await store.replaceMessages(task!.id, [
      {
        id: 'message-a',
        taskId: task!.id,
        role: 'user',
        parts: [{ id: 'part-a', type: 'text', text: 'Disk-owned message' }],
        createdAt: '2026-07-19T08:00:00.000Z'
      }
    ])
    await store.selectTask(task!.id)

    const restored = new DesktopStore(statePath)
    await restored.load()
    expect(restored.findTaskBySessionId('session-a')).toMatchObject({
      id: task!.id,
      sessionSource: 'grok',
      messages: []
    })
  })

  it('persists and resolves inbox items by their event source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-store-inbox-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'state.json')
    const store = new DesktopStore(statePath)
    await store.load()

    await store.addInbox({
      sourceId: 'permission-1',
      taskId: 'task-1',
      type: 'permission',
      title: 'Approve file edit'
    })
    expect(store.listInbox()).toEqual([
      expect.objectContaining({ sourceId: 'permission-1', read: false })
    ])
    await store.markAllInboxRead()

    const restored = new DesktopStore(statePath)
    await restored.load()
    expect(restored.listInbox()[0]).toMatchObject({
      sourceId: 'permission-1',
      read: true
    })
    await restored.dismissInboxBySource('permission-1')
    expect(restored.listInbox()).toEqual([])
  })

  it('repairs legacy tasks with missing message arrays while loading', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-store-legacy-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'state.json')
    await writeFile(
      statePath,
      JSON.stringify({
        version: 1,
        projects: [],
        tasks: [
          {
            id: 'legacy-task',
            projectId: 'legacy-project',
            title: 'Legacy task',
            status: 'idle',
            createdAt: '2026-07-19T08:00:00.000Z',
            updatedAt: '2026-07-19T08:00:00.000Z'
          }
        ],
        settings: {},
        inbox: []
      })
    )

    const store = new DesktopStore(statePath)
    await store.load()

    expect(store.getTask('legacy-task')?.messages).toEqual([])
  })
})
