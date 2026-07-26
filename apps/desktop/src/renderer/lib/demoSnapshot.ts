import { DEFAULT_SETTINGS, type AppSnapshot } from "../types"

const DEMO_DATE = "2026-07-20T09:30:00.000Z"

export const demoSnapshot: AppSnapshot = {
  projects: [
    {
      id: "demo-project",
      name: "nolira-build",
      path: "/Users/you/Projects/nolira-build",
    },
    {
      id: "demo-api",
      name: "grok-api",
      path: "/Users/you/Projects/grok-api",
    },
  ],
  tasks: [
    {
      id: "demo-task",
      projectId: "demo-project",
      title: "Wire the Grok ACP runtime",
      status: "completed",
      model: "grok-4.5",
      effort: "high",
      permissionMode: "default",
      sessionId: "acp_demo_7f26",
      createdAt: DEMO_DATE,
      updatedAt: DEMO_DATE,
      messages: [
        {
          id: "demo-user",
          taskId: "demo-task",
          role: "user",
          createdAt: DEMO_DATE,
          parts: [
            {
              id: "demo-user-text",
              type: "text",
              text: "Review the desktop runtime and connect this workspace to Grok ACP.",
            },
          ],
        },
        {
          id: "demo-assistant",
          taskId: "demo-task",
          role: "assistant",
          createdAt: DEMO_DATE,
          parts: [
            {
              id: "demo-thinking",
              type: "thinking",
              status: "complete",
              text: "I’ll inspect the process boundary and verify how sessions, permissions, and streaming updates are represented.",
            },
            {
              id: "demo-tool",
              type: "tool",
              title: "Inspect workspace",
              kind: "terminal",
              status: "success",
              input: "rg --files apps/desktop | head",
              output:
                "apps/desktop/src/main/index.ts\napps/desktop/src/preload/index.ts\napps/desktop/src/renderer/App.tsx",
            },
            {
              id: "demo-answer",
              type: "text",
              text: "The Electron shell is ready to own the local workspace boundary. Grok runs as a child process over **ACP stdio**, while the renderer receives typed task, message, tool, and permission events through the preload bridge.\n\nThe UI stays provider-specific without leaking Node APIs into React.",
            },
          ],
        },
      ],
    },
    {
      id: "demo-task-2",
      projectId: "demo-project",
      title: "Polish empty state",
      status: "idle",
      model: "grok-4.5",
      effort: "medium",
      permissionMode: "accept-edits",
      createdAt: DEMO_DATE,
      updatedAt: DEMO_DATE,
      messages: [],
    },
    {
      id: "demo-task-3",
      projectId: "demo-api",
      title: "Trace streaming events",
      status: "running",
      model: "grok-4.5",
      effort: "high",
      permissionMode: "default",
      createdAt: DEMO_DATE,
      updatedAt: DEMO_DATE,
      messages: [],
    },
  ],
  activeTaskId: "demo-task",
  settings: DEFAULT_SETTINGS,
  runtime: {
    state: "offline",
    message: "Preview mode — Electron bridge unavailable",
  },
  models: ["grok-4.5"],
}

