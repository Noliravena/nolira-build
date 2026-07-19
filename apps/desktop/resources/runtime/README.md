# Optional Grok runtime

Development builds discover `grok` from the configured path, `~/.grok/bin`, or `PATH`.

Release automation may place per-platform, executable Grok CLI builds in this directory before packaging. The application resolves the packaged binary from `process.resourcesPath/runtime` without embedding a developer-machine path. Runtime redistribution, signing, and update rights must be verified before shipping it to users.
