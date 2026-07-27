# Nolira Build desktop

Electron 39 + React 19 desktop workspace for Grok ACP. The product shell follows the dense project/task/chat hierarchy of 1Code while using original Nolira Build branding and a provider boundary built around `grok agent stdio`.

## Implemented capabilities

- **Sessions:** indexes real Grok `summary.json` and `chat_history.jsonl` files for approved repositories; supports search, continue recent, on-demand history hydration, local rename/archive metadata, and Markdown export.
- **Composer:** supports `@` workspace files, `/` commands, discovered Skills, native attachments, clipboard images, model/effort/permission controls, and cancel.
- **Workspace:** browses and edits files through a validated main-process API, detects save conflicts by mtime, shows Git changes and unified diffs, and opens paths in the system editor.
- **Agent activity:** normalizes streamed messages, reasoning, tools, permissions, plan exit approvals, goals, subagents, background jobs, and monitor wakeups before they reach React.
- **Integrations:** exposes Grok runtime/provider status, Skills discovery, MCP configuration, per-project memory, recurring automations, and a persistent Inbox.

The account and credential boundary intentionally remains with the Grok CLI. Nolira Build does not duplicate an OAuth session or store a second plaintext API key in renderer-managed settings.

`Ask first` surfaces every ACP approval. `Auto-edit` automatically accepts only
recognized file-edit tools and continues to ask for shell commands or unknown
actions. `Full access` asks the CLI to bypass per-action approval. Grok still
runs with the current operating-system account permissions; it is not an OS
sandbox.

## Local development

From the repository root:

```bash
pnpm install
pnpm --filter @nolira-build/desktop dev
```

By default the application resolves `grok` from the user's configured path, `~/.grok/bin`, or `PATH`. Project and task metadata are stored as JSON below Electron's per-user `userData` directory; credentials and Grok's own session data remain owned by the Grok CLI.

The session index reads `${GROK_HOME:-~/.grok}/sessions` but only admits sessions whose resolved working directory is one of the repositories the user has added to Nolira Build. Disk-owned Grok messages are hydrated when a session opens and are not copied into the desktop state file.

For isolated UI or integration checks, set `NOLIRA_USER_DATA_DIR` to an empty
temporary directory before starting the development app.

## Security boundary

The renderer has `contextIsolation` enabled, Node integration disabled, and a
sandboxed preload. It can access native capabilities only through the
allow-listed `window.nolira` bridge. A packaged build always loads its bundled
renderer; development URLs are limited to loopback HTTP(S). Navigation,
new-window requests, external URL opening, filesystem dialogs, and ACP process
control are validated in the main process.

Workspace file and open-path APIs resolve symlinks and reject paths outside an
approved repository. Writes carry the last observed modification time and fail
on concurrent changes instead of silently overwriting them. Persistent
integration files are written atomically with owner-only permissions.

Selected text and image attachments are limited to 8 MB per inline file and 24
MB total per prompt. Other file types are passed as approved on-disk paths.

## Packaging

```bash
pnpm --filter @nolira-build/desktop dist:mac
pnpm --filter @nolira-build/desktop dist:win
pnpm --filter @nolira-build/desktop dist:linux
```

Configured outputs are DMG/ZIP on macOS, NSIS/portable on Windows, and AppImage/DEB on Linux. Cross-building platform installers is not guaranteed; release CI should build and sign each target on its native runner.

The optional `resources/runtime` directory is copied into packaged applications. Do not distribute a Grok binary there until licensing, platform signing, and update responsibilities are confirmed.

The application reports `CLI detected` after a binary version check and `ACP
verified` only after a task successfully completes the ACP connection
handshake. Recurring automations are in-process timers and run only while the
desktop application is open.

See the repository-level
[production release checklist](../../docs/RELEASE_CHECKLIST.md). The current
tree intentionally contains no signing credentials, update-provider choice, or
permission to redistribute Grok; those remain explicit public-release gates.
