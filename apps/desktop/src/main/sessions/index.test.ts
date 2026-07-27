import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { SessionIndexService } from '.'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true })
    )
  )
})

describe('SessionIndexService', () => {
  it('indexes approved Grok sessions and restores their conversation history', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-sessions-'))
    temporaryDirectories.push(directory)
    const workspace = join(directory, 'workspace')
    const grokHome = join(directory, '.grok')
    const sessionId = '019f-session-a'
    const sessionDirectory = join(
      grokHome,
      'sessions',
      encodeURIComponent(workspace),
      sessionId
    )
    await mkdir(sessionDirectory, { recursive: true })
    await writeFile(
      join(sessionDirectory, 'summary.json'),
      JSON.stringify({
        info: { id: sessionId, cwd: workspace },
        generated_title: 'Repair the desktop session view',
        created_at: '2026-07-19T08:00:00.000Z',
        updated_at: '2026-07-19T08:02:00.000Z',
        num_chat_messages: 4,
        current_model_id: 'grok-4.5'
      })
    )
    await writeFile(
      join(sessionDirectory, 'chat_history.jsonl'),
      [
        { type: 'system', content: 'hidden instructions' },
        { type: 'user', content: [{ type: 'text', text: 'Review the session view.' }] },
        {
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'Inspect the current implementation.' }]
        },
        {
          type: 'backend_tool_call',
          kind: {
            id: 'tool-1',
            tool_type: 'read_file',
            status: 'running',
            input: { path: 'src/App.tsx' }
          }
        },
        {
          type: 'backend_tool_call',
          kind: {
            id: 'tool-1',
            tool_type: 'read_file',
            status: 'completed',
            input: { path: 'src/App.tsx' }
          }
        },
        { type: 'tool_result', tool_call_id: 'tool-1', content: 'file contents' },
        {
          type: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tool-2',
              name: 'write_file',
              arguments: { path: 'src/App.tsx', content: 'updated' }
            }
          ]
        },
        { type: 'tool_result', tool_call_id: 'tool-2', content: 'updated file' },
        { type: 'assistant', content: 'The session view needs a history loader.' }
      ]
        .map((entry) => JSON.stringify(entry))
        .join('\n')
    )

    const service = new SessionIndexService({
      grokHome,
      metadataPath: join(directory, 'session-meta.json')
    })
    const sessions = await service.refresh([
      { id: 'project-1', name: 'Workspace', path: workspace }
    ])

    expect(sessions).toEqual([
      expect.objectContaining({
        sessionId,
        projectId: 'project-1',
        title: 'Repair the desktop session view',
        messageCount: 4,
        model: 'grok-4.5'
      })
    ])

    const history = await service.loadHistory(sessionId, 'task-1')
    expect(history.messages).toHaveLength(2)
    expect(history.messages[0]).toMatchObject({
      taskId: 'task-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Review the session view.' }]
    })
    expect(history.messages[1]).toMatchObject({
      role: 'assistant',
      parts: [
        { type: 'thinking', text: 'Inspect the current implementation.' },
        {
          type: 'tool',
          title: 'Read File',
          status: 'success',
          output: 'file contents'
        },
        {
          type: 'tool',
          title: 'Write File',
          kind: 'write_file',
          status: 'success',
          input: expect.stringContaining('src/App.tsx'),
          output: 'updated file'
        },
        { type: 'text', text: 'The session view needs a history loader.' }
      ]
    })
    expect(history.messages[1]?.parts.filter((part) => part.type === 'tool')).toHaveLength(
      2
    )

    const exported = await service.exportMarkdown(sessionId)
    expect(exported.suggestedName).toBe('Repair the desktop session view.md')
    expect(exported.markdown).toContain('# Repair the desktop session view')
    expect(exported.markdown).toContain('## Assistant')
    expect(exported.markdown).not.toContain('hidden instructions')
  })

  it('persists local rename and archive metadata without mutating Grok files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-session-meta-'))
    temporaryDirectories.push(directory)
    const workspace = join(directory, 'workspace')
    const grokHome = join(directory, '.grok')
    const sessionId = 'session-meta-a'
    const sessionDirectory = join(
      grokHome,
      'sessions',
      encodeURIComponent(workspace),
      sessionId
    )
    const metadataPath = join(directory, 'session-meta.json')
    await mkdir(sessionDirectory, { recursive: true })
    await writeFile(
      join(sessionDirectory, 'summary.json'),
      JSON.stringify({
        info: { id: sessionId, cwd: workspace },
        session_summary: 'Original title',
        created_at: '2026-07-19T08:00:00Z',
        updated_at: '2026-07-19T08:00:00Z'
      })
    )

    const first = new SessionIndexService({ grokHome, metadataPath })
    await first.refresh([{ id: 'project-1', name: 'Workspace', path: workspace }])
    await first.rename(sessionId, 'Local display title')
    await first.archive(sessionId, true)

    expect(first.list({})).toEqual([])
    expect(first.list({ includeArchived: true })[0]).toMatchObject({
      title: 'Local display title',
      archived: true
    })

    const restored = new SessionIndexService({ grokHome, metadataPath })
    await restored.refresh([{ id: 'project-1', name: 'Workspace', path: workspace }])
    expect(restored.list({ includeArchived: true })[0]).toMatchObject({
      title: 'Local display title',
      archived: true
    })
  })
})
