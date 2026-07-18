# Nolira Build Desktop

The primary cross-platform desktop client for Nolira Build. The UI is React + TypeScript; Tauri 2 and Rust own local process execution, persistence, Git inspection, and Agent Client Protocol (ACP) communication.

## Why Tauri

This is the recommended product path after comparing it with an Electron shell:

- The Rust core is a natural home for long-running child processes, JSON-RPC routing, permissions, and future sandbox boundaries.
- The web UI is productive for a Codex-style workspace with chat, diffs, terminal surfaces, settings, and future plugin panels.
- Tauri keeps the packaged shell substantially smaller than shipping a separate Chromium runtime.
- The same frontend and provider boundary can target macOS, Windows, and Linux.

## Included

- Persistent projects and tasks
- Real `grok agent stdio` session creation and resume
- Streamed messages, thoughts, plans, tool activity, context usage, and completion state
- Permission requests that remain parked until the user allows or denies them
- Model and reasoning-effort controls
- Persistent Build/Plan and ask/full-access task modes
- Project instructions and scoped memory injected into Grok turns
- File/image attachments, clipboard paste, drag and drop, and `@file` search
- Server-side Grok session fork when supported, an isolated local-context fallback for older CLIs, and `/plan`, `/fork`, `/review`, `/terminal`
- Structured staged/unstaged Git inspector and file/all staging actions
- Persistent cross-platform PTY terminal scoped to each task
- Claude-style sandboxed HTML/SVG artifact previews
- Capability-oriented Provider adapter; Grok is enabled and custom ACP is reserved
- Light and dark desktop themes, keyboard shortcuts, task search, and generated platform icons

## Development

```bash
# From the repository root
pnpm install
pnpm --filter @nolirabuild/desktop desktop:dev
```

Frontend checks:

```bash
pnpm --filter @nolirabuild/desktop test
pnpm --filter @nolirabuild/desktop build
```

Rust checks:

```bash
cd apps/desktop/src-tauri
cargo test
```

Package the desktop app:

```bash
pnpm --filter @nolirabuild/desktop desktop:build
```

The runtime resolver checks a custom path from Settings, `NOLIRA_GROK_PATH`, `~/.grok/bin/grok`, common package-manager paths, and finally `PATH`.

## Security boundary

The renderer cannot use Tauri's general shell plugin. It calls narrow Rust commands, while the ACP agent owns generated tool execution and returns explicit permission requests. The integrated PTY accepts only input typed by the local user and starts in the selected project directory. Artifact previews run in a unique-origin sandbox with network connections disabled by Content Security Policy.
