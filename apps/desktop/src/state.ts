import type { AgentEvent, ConversationTask, ToolActivity } from './types';

function mutateTask(
  tasks: ConversationTask[],
  taskId: string,
  mutation: (task: ConversationTask) => ConversationTask,
): ConversationTask[] {
  return tasks.map((task) => (task.id === taskId ? mutation(task) : task));
}

function updateLastAssistant(
  task: ConversationTask,
  mutation: (message: ConversationTask['messages'][number]) => ConversationTask['messages'][number],
): ConversationTask {
  let index = -1;
  for (let cursor = task.messages.length - 1; cursor >= 0; cursor -= 1) {
    if (task.messages[cursor].role === 'assistant') {
      index = cursor;
      break;
    }
  }
  if (index < 0) return task;
  const messages = [...task.messages];
  messages[index] = mutation(messages[index]);
  return { ...task, messages };
}

function upsertTool(task: ConversationTask, tool: ToolActivity): ConversationTask {
  const index = task.tools.findIndex((item) => item.id === tool.id);
  if (index < 0) return { ...task, tools: [...task.tools, tool] };
  const tools = [...task.tools];
  tools[index] = tool;
  return { ...task, tools };
}

export function applyAgentEvent(
  tasks: ConversationTask[],
  event: AgentEvent,
): ConversationTask[] {
  switch (event.kind) {
    case 'ready':
      return mutateTask(tasks, event.taskId, (task) => ({
        ...task,
        engineSessionId: String(event.data.sessionId ?? task.engineSessionId ?? ''),
      }));
    case 'message_delta':
      return mutateTask(tasks, event.taskId, (task) =>
        updateLastAssistant(task, (message) => ({
          ...message,
          text: message.text + String(event.data.text ?? ''),
        })),
      );
    case 'thought_delta':
      return mutateTask(tasks, event.taskId, (task) =>
        updateLastAssistant(task, (message) => ({
          ...message,
          thought: message.thought + String(event.data.text ?? ''),
        })),
      );
    case 'tool_started':
    case 'tool_updated': {
      const tool = event.data.tool as ToolActivity | undefined;
      return tool ? mutateTask(tasks, event.taskId, (task) => upsertTool(task, tool)) : tasks;
    }
    case 'plan': {
      const steps = Array.isArray(event.data.steps) ? event.data.steps.map(String) : [];
      const tool: ToolActivity = {
        id: 'plan',
        title: 'Plan',
        kind: 'plan',
        status: 'running',
        output: steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
      };
      return mutateTask(tasks, event.taskId, (task) => upsertTool(task, tool));
    }
    case 'error':
      return mutateTask(tasks, event.taskId, (task) =>
        updateLastAssistant(task, (message) => ({
          ...message,
          text: message.text || `Unable to complete the turn: ${String(event.data.message ?? '')}`,
        })),
      );
    default:
      return tasks;
  }
}
