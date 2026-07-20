import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { GrokAcpEvent } from '../../shared/acp'
import { GrokAcpClient } from './client'

const MOCK_AGENT = `#!/usr/bin/env node
const readline = require('node:readline')
const lines = readline.createInterface({ input: process.stdin })
let promptRequestId
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n')

lines.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: false, audio: false, embeddedContext: true }
        },
        _meta: {
          modelState: {
            currentModelId: 'grok-mock',
            availableModels: [{ modelId: 'grok-mock', name: 'Grok Mock' }]
          }
        }
      }
    })
    return
  }
  if (message.method === 'session/new') {
    send({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'mock-session' } })
    return
  }
  if (message.method === 'session/prompt') {
    promptRequestId = message.id
    send({
      jsonrpc: '2.0',
      id: 'permission-rpc',
      method: 'session/request_permission',
      params: {
        sessionId: 'mock-session',
        toolCall: { toolCallId: 'tool-1', title: 'Write fixture', kind: 'edit' },
        options: [
          { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'reject_once', name: 'Reject', kind: 'reject_once' }
        ]
      }
    })
    return
  }
  if (message.id === 'permission-rpc' && message.result) {
    send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'MOCK_PERMISSION_OK' }
        }
      }
    })
    send({
      jsonrpc: '2.0',
      id: promptRequestId,
      result: { stopReason: 'end_turn', _meta: { totalTokens: 321 } }
    })
  }
})
`

const PLAN_AGENT = `#!/usr/bin/env node
const readline = require('node:readline')
const lines = readline.createInterface({ input: process.stdin })
let promptRequestId
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n')

lines.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: message.id,
      result: { agentCapabilities: { loadSession: true, promptCapabilities: {} } }
    })
    return
  }
  if (message.method === 'session/new') {
    send({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'plan-session' } })
    return
  }
  if (message.method === 'session/prompt') {
    promptRequestId = message.id
    send({
      jsonrpc: '2.0', id: 'plan-rpc', method: 'x.ai/exit_plan_mode',
      params: { sessionId: 'plan-session', planContent: '# Plan\\n\\nImplement it.' }
    })
    return
  }
  if (message.id === 'plan-rpc' && message.result?.outcome === 'approved') {
    send({
      jsonrpc: '2.0', method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: 'PLAN_APPROVED' } } }
    })
    send({ jsonrpc: '2.0', id: promptRequestId, result: { stopReason: 'end_turn' } })
  }
})
`

describe('GrokAcpClient', () => {
  it('parks a server permission request and resumes with the selected option', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-acp-mock-'))
    const executable = join(directory, 'grok-mock')
    await writeFile(executable, MOCK_AGENT)
    await chmod(executable, 0o755)

    const client = new GrokAcpClient({
      taskId: 'mock-task',
      cwd: directory,
      executablePath: executable,
      permissionMode: 'ask'
    })
    const events: GrokAcpEvent[] = []
    let permissionResponse: Promise<void> | undefined
    const unsubscribe = client.onEvent((event) => {
      events.push(event)
      if (event.type === 'permission-request') {
        permissionResponse = client.respondPermission({
          requestId: event.payload.requestId,
          optionId: 'allow_once'
        })
      }
    })

    try {
      const ready = await client.start()
      expect(ready.sessionId).toBe('mock-session')
      await client.prompt({ text: 'exercise permission flow' })
      await permissionResponse

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'permission-request' }),
          expect.objectContaining({
            type: 'message-delta',
            payload: { text: 'MOCK_PERMISSION_OK' }
          }),
          expect.objectContaining({
            type: 'context-usage',
            payload: { usedTokens: 321 }
          }),
          expect.objectContaining({ type: 'completed' })
        ])
      )
    } finally {
      unsubscribe()
      await client.shutdown()
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('parks exit-plan mode until the desktop approves implementation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nolira-acp-plan-'))
    const executable = join(directory, 'grok-plan-mock')
    await writeFile(executable, PLAN_AGENT)
    await chmod(executable, 0o755)
    const client = new GrokAcpClient({
      taskId: 'plan-task',
      cwd: directory,
      executablePath: executable,
      permissionMode: 'ask'
    })
    const events: GrokAcpEvent[] = []
    const unsubscribe = client.onEvent((event) => {
      events.push(event)
      if (
        event.type === 'permission-request' &&
        event.payload.toolName === 'Plan approval'
      ) {
        void client.respondPermission({
          requestId: event.payload.requestId,
          optionId: 'plan-approve'
        })
      }
    })

    try {
      await client.start()
      await client.prompt({ text: 'plan this change' })
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'permission-request',
            payload: expect.objectContaining({ toolName: 'Plan approval' })
          }),
          expect.objectContaining({
            type: 'message-delta',
            payload: { text: 'PLAN_APPROVED' }
          })
        ])
      )
    } finally {
      unsubscribe()
      await client.shutdown()
      await rm(directory, { force: true, recursive: true })
    }
  })
})
