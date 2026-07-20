import { describe, expect, it } from 'vitest'

import { mapExtendedUpdate } from './client'

describe('extended Grok session events', () => {
  it('normalizes goal and subagent lifecycle updates', () => {
    expect(
      mapExtendedUpdate(
        {
          sessionUpdate: 'goal_updated',
          goal_id: 'goal-1',
          objective: 'Ship the desktop app',
          status: 'user_paused'
        },
        'session-1',
        1_000
      )[0]
    ).toMatchObject({
      type: 'goal-updated',
      payload: {
        id: 'goal-1',
        objective: 'Ship the desktop app',
        status: 'paused'
      }
    })

    expect(
      mapExtendedUpdate(
        {
          sessionUpdate: 'subagent_progress',
          subagent_id: 'sub-1',
          child_session_id: 'child-1',
          turn_count: 2,
          tool_call_count: 5
        },
        'session-1'
      )[0]
    ).toMatchObject({
      type: 'subagent-updated',
      payload: {
        id: 'sub-1',
        childSessionId: 'child-1',
        phase: 'progress',
        status: 'working',
        turnCount: 2,
        toolCallCount: 5
      }
    })
  })

  it('normalizes background completion and monitor notifications', () => {
    expect(
      mapExtendedUpdate(
        {
          sessionUpdate: 'TaskCompleted',
          willWake: true,
          taskSnapshot: {
            taskId: 'task-1',
            command: 'pnpm test',
            exitCode: 0,
            output: 'passed'
          }
        },
        'session-1'
      )[0]
    ).toMatchObject({
      type: 'background-task-updated',
      payload: {
        id: 'task-1',
        phase: 'completed',
        success: true,
        willWake: true,
        exitCode: 0,
        output: 'passed'
      }
    })

    expect(
      mapExtendedUpdate(
        {
          sessionUpdate: 'monitor_event',
          task_id: 'monitor-1',
          description: 'Watch CI',
          event_text: 'Build failed'
        },
        'session-1'
      )[0]
    ).toMatchObject({
      payload: {
        id: 'monitor-1',
        phase: 'monitor',
        isMonitor: true,
        eventText: 'Build failed'
      }
    })
  })
})
