import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import {
  discoverSkills,
  listWorkspaceChanges,
  listWorkspaceFiles,
  readWorkspaceFile,
  workspaceDiff,
  writeWorkspaceFile
} from '.'

const execFileAsync = promisify(execFile)

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true })
    )
  )
})

describe('workspace discovery', () => {
  it('finds relevant files while skipping dependency and build directories', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nolira-files-'))
    temporaryDirectories.push(workspace)
    await mkdir(join(workspace, 'src', 'components'), { recursive: true })
    await mkdir(join(workspace, 'node_modules', 'hidden'), { recursive: true })
    await writeFile(join(workspace, 'src', 'components', 'SessionView.tsx'), 'export {}')
    await writeFile(join(workspace, 'src', 'main.ts'), 'export {}')
    await writeFile(join(workspace, 'node_modules', 'hidden', 'SessionView.tsx'), 'ignored')

    const files = await listWorkspaceFiles(workspace, 'session', 20)
    expect(files).toEqual([
      expect.objectContaining({
        name: 'SessionView.tsx',
        relativePath: join('src', 'components', 'SessionView.tsx'),
        mimeType: 'text/tsx'
      })
    ])
  })

  it('reads project skill metadata for the composer picker', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nolira-skills-'))
    temporaryDirectories.push(workspace)
    const skillDirectory = join(workspace, '.agents', 'skills', 'workspace-review')
    await mkdir(skillDirectory, { recursive: true })
    await writeFile(
      join(skillDirectory, 'SKILL.md'),
      [
        '---',
        'name: workspace-review',
        'description: Review workspace architecture safely',
        '---',
        '# Workspace review'
      ].join('\n')
    )

    const skills = await discoverSkills({
      projectPath: workspace,
      query: 'Review workspace architecture safely'
    })
    expect(skills).toEqual([
      expect.objectContaining({
        name: 'workspace-review',
        description: 'Review workspace architecture safely',
        source: 'project'
      })
    ])
  })

  it('reads and saves workspace files with an external-change guard', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nolira-editor-'))
    temporaryDirectories.push(workspace)
    await mkdir(join(workspace, 'src'), { recursive: true })
    await writeFile(join(workspace, 'src', 'index.ts'), 'export const value = 1\n')

    const opened = await readWorkspaceFile(workspace, join('src', 'index.ts'))
    const saved = await writeWorkspaceFile(
      workspace,
      join('src', 'index.ts'),
      'export const value = 2\n',
      opened.mtimeMs
    )
    expect(saved.content).toBe('export const value = 2\n')
    expect(await readFile(join(workspace, 'src', 'index.ts'), 'utf8')).toBe(
      'export const value = 2\n'
    )
    await expect(
      writeWorkspaceFile(
        workspace,
        join('src', 'index.ts'),
        'stale edit',
        opened.mtimeMs
      )
    ).rejects.toThrow('changed on disk')
  })

  it('lists Git changes and returns staged and untracked diffs', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nolira-diff-'))
    temporaryDirectories.push(workspace)
    await execFileAsync('git', ['init', '--quiet', workspace])
    await writeFile(join(workspace, 'tracked.ts'), 'export const tracked = true\n')
    await execFileAsync('git', ['-C', workspace, 'add', 'tracked.ts'])
    await writeFile(join(workspace, 'untracked.ts'), 'export const fresh = true\n')

    const status = await listWorkspaceChanges(workspace)
    expect(status.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'tracked.ts', status: 'added', staged: true }),
        expect.objectContaining({
          path: 'untracked.ts',
          status: 'untracked',
          staged: false
        })
      ])
    )
    await expect(workspaceDiff(workspace, 'tracked.ts', true)).resolves.toMatchObject({
      staged: true,
      diff: expect.stringContaining('+export const tracked = true')
    })
    await expect(workspaceDiff(workspace, 'untracked.ts')).resolves.toMatchObject({
      staged: false,
      diff: expect.stringContaining('+export const fresh = true')
    })
  })
})
