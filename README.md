# Nolira Build

A cross-platform desktop coding workspace built around the local Grok ACP
runtime. The desktop app uses an Electron + React shell inspired by 1Code's
workspace interaction model while keeping the runtime, persistence, product
identity, and network boundaries independent.

## What is included

- macOS, Windows, and Linux Electron targets
- local projects and persisted task conversations
- one long-lived `grok agent stdio` ACP connection per active task
- streamed replies, thoughts, plans, tool activity, and permission requests
- model, reasoning-effort, approval-mode, attachment, and runtime settings

The app invokes a separately installed Grok CLI. It does not bundle the CLI or
depend on 21st.dev hosted services.

## Structure

```text
apps/desktop/  # Electron main/preload and React renderer
packages/      # Shared monorepo packages
```

## Setup

```bash
pnpm install
pnpm --filter @nolirabuild/desktop dev
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Start development tasks |
| `pnpm lint` | Run static checks |
| `pnpm test` | Run tests |
| `pnpm --filter @nolirabuild/desktop dist:mac` | Package macOS builds |
| `pnpm --filter @nolirabuild/desktop dist:win` | Package Windows builds |
| `pnpm --filter @nolirabuild/desktop dist:linux` | Package Linux builds |

See [apps/desktop/README.md](apps/desktop/README.md) for runtime discovery,
security boundaries, and packaging notes. Third-party attribution is recorded
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
