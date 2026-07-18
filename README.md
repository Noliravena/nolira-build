# Nolira Build

Grok-first desktop coding workspace, structured as two real applications under `apps/`:

| App                 | Stack                                    | Role                                              |
| ------------------- | ---------------------------------------- | ------------------------------------------------- |
| `apps/desktop`      | Tauri 2 + Rust + React + TypeScript      | Recommended cross-platform product                |
| `apps/native-macos` | SwiftUI + AppKit + Swift Package Manager | Fully native macOS reference and experience track |

Both clients connect to the installed Grok CLI through Agent Client Protocol (ACP) over stdio. They reuse Grok's own credential/session store and keep Nolira task metadata in each platform's Application Support directory.

## Architecture choice

The primary app uses Tauri rather than Electron. A Codex-like workspace needs a fast-changing, component-heavy UI, but its most sensitive work belongs outside the renderer: managing Grok processes, correlating JSON-RPC requests, parking approvals, persisting tasks, and constraining filesystem/Git operations. React and Rust split cleanly across that boundary.

The native SwiftUI app is intentionally maintained as a first-class app, not a screenshot prototype. It provides the same Grok ACP core loop and lets the project compare native windowing, controls, accessibility, memory use, and macOS integrations against the cross-platform product.

The initial architecture was informed by [`tangf-ai/grokx`](https://github.com/tangf-ai/grokx): process isolation, ACP over `grok agent stdio`, local tasks, persistent sessions, and explicit permission decisions. Nolira Build's implementation is organized around a Provider adapter from the start so Grok-specific process details do not leak into product state.

## Current functional baseline

- Project and task management
- Real Grok session create/resume
- Streaming response and reasoning UI
- Structured plan and tool activity
- Allow once, allow for session, and deny flows
- Model and reasoning-effort selection
- Build / Plan modes and per-task approval policy
- Project-scoped instructions and user-maintained memory
- File and image attachments, clipboard/drop support, and `@file` project search
- Grok server-side session forks when supported, with an isolated local-context fallback for older CLI versions, plus Codex-style slash commands
- Local persistence across relaunches
- Structured Git changes with staged/unstaged patches and staging actions
- Persistent project-scoped terminal sessions
- Sandboxed HTML/SVG artifact previews with copy and save actions
- Runtime path settings and provider capability catalog

## Run

```bash
pnpm install

# Main Tauri app
pnpm --filter @nolirabuild/desktop desktop:dev

# Native macOS app
pnpm --filter @nolirabuild/native-macos dev
```

## Product roadmap toward full Codex-style parity

1. Worktree and remote execution modes with setup scripts and reusable project actions.
2. Hunk-level stage/revert, commit/push/PR flows, and inline review comments.
3. MCP/connector management, quick entry, voice capture, and controlled computer-use surfaces.
4. Additional Provider adapters, starting with ACP-compatible agents; API-only providers can use a separate transport adapter behind the same capability model.
5. Scheduled/background tasks, browser automation, and coordinated multi-agent activity.

The current UI does not pretend that roadmap items are complete. Grok is the only enabled Provider in this first version.
