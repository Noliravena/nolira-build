import { mkdtemp, rm } from 'node:fs/promises'
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
})
