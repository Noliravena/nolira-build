# Nolira Build desktop

Electron 39 + React 19 desktop workspace for Grok ACP. The product shell follows the dense project/task/chat hierarchy of 1Code while using original Nolira Build branding and a provider boundary built around `grok agent stdio`.

## Local development

From the repository root:

```bash
pnpm install
pnpm --filter @nolirabuild/desktop dev
```

By default the application resolves `grok` from the user's configured path, `~/.grok/bin`, or `PATH`. Project and task metadata are stored as JSON below Electron's per-user `userData` directory; credentials and Grok's own session data remain owned by the Grok CLI.

For isolated UI or integration checks, set `NOLIRA_USER_DATA_DIR` to an empty
temporary directory before starting the development app.

## Security boundary

The renderer has `contextIsolation` enabled, Node integration disabled, and a sandboxed preload. It can access native capabilities only through the allow-listed `window.nolira` bridge. Navigation, new-window requests, external URL opening, filesystem dialogs, and ACP process control are validated in the main process.

## Packaging

```bash
pnpm --filter @nolirabuild/desktop dist:mac
pnpm --filter @nolirabuild/desktop dist:win
pnpm --filter @nolirabuild/desktop dist:linux
```

Configured outputs are DMG/ZIP on macOS, NSIS/portable on Windows, and AppImage/DEB on Linux. Cross-building platform installers is not guaranteed; release CI should build and sign each target on its native runner.

The optional `resources/runtime` directory is copied into packaged applications. Do not distribute a Grok binary there until licensing, platform signing, and update responsibilities are confirmed.
