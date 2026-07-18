# Nolira Build Native

Native macOS prototype for a Grok-first coding workspace. It uses SwiftUI for the app shell and talks to the installed Grok CLI through Agent Client Protocol (ACP) over stdio.

## Included

- Project and task navigation with persisted local metadata
- Real `grok agent stdio` sessions, streaming messages, thoughts, plans, and tool calls
- Interactive allow-once, allow-for-session, and deny decisions
- Model and reasoning-effort controls
- Build/Plan mode, approval policy, and server-side Grok forks with an isolated local-context fallback for older CLIs
- Project-scoped instructions and memory
- Text and image attachments encoded as ACP content blocks
- Grok session resume after relaunch
- Git change viewer with stage/unstage-all and review workflow
- Persistent project shell per task
- Sandboxed HTML/SVG artifact previews with copy and save
- Provider catalog designed around capabilities instead of Grok-specific UI state

## Run

```bash
pnpm --filter @nolirabuild/native-macos dev
```

The app auto-detects `~/.grok/bin/grok`, `/opt/homebrew/bin/grok`, or `/usr/local/bin/grok`. A custom binary can be selected in Settings.

Build an ad-hoc signed `.app` bundle:

```bash
pnpm --filter @nolirabuild/native-macos bundle
open "apps/native-macos/.build/Nolira Build Native.app"
```

This prototype deliberately reuses the Grok CLI credential store. It never writes API keys into this repository or its own task state.
