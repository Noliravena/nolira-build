import { describe, expect, it } from 'vitest'

import { GrokAcpClient } from './client'

const live = process.env.NOLIRA_LIVE_ACP === '1' ? describe : describe.skip

live('installed Grok ACP runtime', () => {
  it(
    'streams a real response through the production client',
    async () => {
      const client = new GrokAcpClient({
        taskId: 'live-smoke',
        cwd: process.cwd(),
        model: 'grok-4.5',
        permissionMode: 'ask'
      })
      let response = ''
      const unsubscribe = client.onEvent((event) => {
        if (event.type === 'message-delta') response += event.payload.text
      })

      try {
        const ready = await client.start()
        expect(ready.sessionId).toBeTruthy()
        await client.prompt({
          text: 'Reply with exactly ACP_LIVE_OK and do not use tools.',
          effort: 'low'
        })
        expect(response).toContain('ACP_LIVE_OK')
      } finally {
        unsubscribe()
        await client.shutdown()
      }
    },
    180_000
  )
})
