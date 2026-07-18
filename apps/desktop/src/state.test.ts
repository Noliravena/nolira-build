import { describe, expect, it } from 'vitest';
import { applyAgentEvent } from './state';
import type { ConversationTask } from './types';

const task: ConversationTask = {
  id: 'task-1',
  projectId: 'project-1',
  title: 'Test',
  providerId: 'grok',
  modelId: '',
  reasoningEffort: 'medium',
  messages: [
    { id: 'a', role: 'assistant', text: '', thought: '', createdAt: 1 },
  ],
  tools: [],
  createdAt: 1,
  updatedAt: 1,
};

describe('applyAgentEvent', () => {
  it('appends streamed answer and thought chunks', () => {
    let tasks = applyAgentEvent([task], {
      kind: 'message_delta',
      taskId: task.id,
      data: { text: 'hello' },
    });
    tasks = applyAgentEvent(tasks, {
      kind: 'thought_delta',
      taskId: task.id,
      data: { text: 'checking' },
    });
    expect(tasks[0].messages[0].text).toBe('hello');
    expect(tasks[0].messages[0].thought).toBe('checking');
  });

  it('upserts tool activity by tool id', () => {
    const tasks = applyAgentEvent([task], {
      kind: 'tool_updated',
      taskId: task.id,
      data: { tool: { id: 'tool-1', title: 'Read', kind: 'read', status: 'completed' } },
    });
    expect(tasks[0].tools).toHaveLength(1);
    expect(tasks[0].tools[0].status).toBe('completed');
  });
});
