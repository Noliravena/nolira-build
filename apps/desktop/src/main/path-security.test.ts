import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  canonicalizeExistingPath,
  isPathInsideCanonicalRoots
} from './path-security'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true })
    )
  )
})

describe('canonical path boundaries', () => {
  it('allows descendants and rejects direct paths outside a workspace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-path-security-'))
    temporaryDirectories.push(directory)
    const workspace = join(directory, 'workspace')
    const outside = join(directory, 'outside')
    await mkdir(workspace)
    await mkdir(outside)
    const insideFile = join(workspace, 'inside.txt')
    const outsideFile = join(outside, 'secret.txt')
    await writeFile(insideFile, 'inside')
    await writeFile(outsideFile, 'outside')

    expect(await isPathInsideCanonicalRoots(insideFile, [workspace])).toBe(true)
    expect(await isPathInsideCanonicalRoots(outsideFile, [workspace])).toBe(false)
  })

  const symlinkTest = process.platform === 'win32' ? it.skip : it
  symlinkTest('rejects symlinks that escape a workspace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-path-symlink-'))
    temporaryDirectories.push(directory)
    const workspace = join(directory, 'workspace')
    const outside = join(directory, 'outside')
    await mkdir(workspace)
    await mkdir(outside)
    const outsideFile = join(outside, 'secret.txt')
    await writeFile(outsideFile, 'outside')
    const escapedLink = join(workspace, 'escaped.txt')
    await symlink(outsideFile, escapedLink)

    expect(await isPathInsideCanonicalRoots(escapedLink, [workspace])).toBe(false)
    expect(await canonicalizeExistingPath(escapedLink)).toBe(
      await canonicalizeExistingPath(outsideFile)
    )
  })
})
