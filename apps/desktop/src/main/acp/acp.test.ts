import { describe, expect, it } from 'vitest'

import type { JsonValue } from '../../shared/acp'
import { mapPermissionRequest, parseModels } from './client'
import { parseJsonRpcLine } from './jsonrpc'

describe('ACP protocol parsing', () => {
  it('parses responses, notifications, and rejects console noise', () => {
    expect(
      parseJsonRpcLine(
        '{"jsonrpc":"2.0","id":1,"result":{"sessionId":"session-1"}}'
      )
    ).toMatchObject({ id: 1, result: { sessionId: 'session-1' } })
    expect(
      parseJsonRpcLine(
        '{"jsonrpc":"2.0","method":"session/update","params":{}}'
      )
    ).toMatchObject({ method: 'session/update' })
    expect(parseJsonRpcLine('Grok CLI starting…')).toBeUndefined()
  })

  it('reads the model state advertised by current Grok initialize responses', () => {
    const payload: JsonValue = {
      _meta: {
        modelState: {
          availableModels: [
            {
              modelId: 'grok-4.5',
              name: 'Grok 4.5',
              _meta: {
                supportsReasoningEffort: true,
                totalContextTokens: 131072,
                reasoningEfforts: [{ value: 'high' }, { value: 'max' }]
              }
            }
          ]
        }
      }
    }

    expect(parseModels(payload)).toEqual([
      {
        id: 'grok-4.5',
        name: 'Grok 4.5',
        description: undefined,
        contextWindow: 131072,
        supportsReasoningEffort: true,
        reasoningEfforts: ['high', 'max']
      }
    ])
  })

  it('preserves server permission option ids verbatim', () => {
    const request = mapPermissionRequest('ui-request', {
      sessionId: 'session-1',
      toolCall: {
        toolCallId: 'tool-1',
        title: 'Run tests',
        kind: 'terminal',
        rawInput: { command: 'pnpm test' }
      },
      options: [
        { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject_once', name: 'Reject', kind: 'reject_once' }
      ]
    })

    expect(request).toMatchObject({
      requestId: 'ui-request',
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'Run tests',
      options: [
        { optionId: 'allow_once' },
        { optionId: 'reject_once' }
      ]
    })
  })
})
