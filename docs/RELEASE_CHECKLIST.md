# Production release checklist

The source tree can be built and tested without release credentials. A public
production release additionally depends on product, legal, and signing inputs
that must not be guessed or committed to the repository.

## Automated gates

- [ ] CI passes on macOS, Windows, and Linux.
- [ ] `pnpm test`, `pnpm build`, and the production dependency audit pass from a
      clean checkout with the lockfile frozen.
- [ ] An unsigned native-directory package launches on each target platform.
- [ ] `pnpm --filter @nolira-build/desktop test:acp-live` passes against the
      exact Grok CLI version selected for release, using a disposable workspace.
- [ ] Approval queueing, Ask first, Auto-edit, Full access, cancellation, and
      restart recovery are exercised manually with that CLI.

## Distribution gates

- [ ] Confirm in writing that the Grok CLI may be redistributed. Until then,
      ship no binary in `resources/runtime` and require a separately installed
      CLI.
- [ ] Complete notices for every dependency redistributed in the packaged app;
      the current notices cover the design references but are not a generated
      dependency-license inventory.
- [ ] Sign and notarize macOS artifacts with the production Developer ID team.
- [ ] Authenticode-sign Windows installers and keep update signature
      verification enabled.
- [ ] Build Linux artifacts on a supported native runner and document package
      signing/checksum verification.
- [ ] Choose and configure a trusted update provider. The repository currently
      has no automatic update channel, staged rollout, or rollback service.

## Operational gates

- [ ] Publish privacy, data-retention, support, and security-reporting policies.
- [ ] Decide whether crash reporting is required and, if enabled, obtain consent
      and scrub prompts, paths, command output, and credentials.
- [ ] Verify migrations and recovery from a prior released state file.
- [ ] Confirm notification copy, attachment limits, symlink boundaries, and
      external-link behavior on all platforms.
- [ ] Run a signed/notarized smoke test from a clean standard-user account.

Recurring automations currently run only while Nolira Build is open. They are
not an operating-system background service and must not be marketed as
always-on scheduling.
