import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildPromptBlocks } from './attachments'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true })
    )
  )
})

describe('buildPromptBlocks', () => {
  it('embeds normal text attachments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-attachment-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'notes.txt')
    await writeFile(path, 'production notes')

    await expect(
      buildPromptBlocks({
        text: 'Review this',
        attachments: [{ path, name: 'notes.txt', mimeType: 'text/plain' }]
      })
    ).resolves.toEqual([
      { type: 'text', text: 'Review this' },
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('production notes')
      })
    ])
  })

  it('rejects oversized text before reading it into memory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-attachment-large-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'large.txt')
    await writeFile(path, '')
    await truncate(path, 8 * 1024 * 1024 + 1)

    await expect(
      buildPromptBlocks({
        text: '',
        attachments: [{ path, name: 'large.txt', mimeType: 'text/plain' }]
      })
    ).rejects.toThrow(/larger than 8 MB/)
  })
})
