# Nolira Build

A cross-platform desktop coding workspace built around the local Grok ACP
runtime. The desktop app uses an Electron + React shell inspired by 1Code's
workspace interaction model while keeping the runtime, persistence, product
identity, and network boundaries independent.

## What is included

- macOS, Windows, and Linux Electron targets
- indexed Grok session history with search, resume, rename, archive, and export
- one isolated `grok agent stdio` ACP connection per active turn, released at
  the terminal state and reconnected to the existing session when needed
- streamed replies, thoughts, plans, goals, subagents, background work, and approvals
- `@` file references, slash commands, Skills, attachments, and pasted images
- workspace files, conflict-aware editing, Git changes, and unified diffs
- Inbox, MCP servers, workspace memory, and recurring automations
- model, reasoning-effort, approval-mode, appearance, and runtime settings

The app invokes a separately installed Grok CLI. It does not bundle the CLI or
depend on 21st.dev hosted services.

The runtime indicator distinguishes a detected CLI binary from a successfully
verified ACP connection. Recurring automations run only while the desktop app
is open.

## Structure

```text
apps/desktop/  # Electron main/preload and React renderer
packages/      # Shared monorepo packages
```

## Setup

```bash
pnpm install
pnpm --filter @nolira-build/desktop dev
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Start development tasks |
| `pnpm lint` | Run static checks |
| `pnpm test` | Run tests |
| `pnpm --filter @nolira-build/desktop dist:mac` | Package macOS builds |
| `pnpm --filter @nolira-build/desktop dist:win` | Package Windows builds |
| `pnpm --filter @nolira-build/desktop dist:linux` | Package Linux builds |

See [apps/desktop/README.md](apps/desktop/README.md) for the capability map,
runtime discovery, security boundaries, and packaging notes. Third-party
attribution is recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Public distribution remains gated by the signing, licensing, updater, and
operational items in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).
