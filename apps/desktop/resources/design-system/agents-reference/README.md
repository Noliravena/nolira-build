# Agents UI design reference (Nolira original)

This folder is **not** a decompile of Cursor.

Cursor Agents (`workbench.glass.main.*`, brand logos, webm splash assets, bundled JS) are proprietary. They must **not** be copied into this repository or shipped with Nolira Build.

What lives here instead:

| File | Purpose |
|---|---|
| `tokens.json` | Color / radius / spacing / surface tokens observed from local Cursor install analysis, rewritten as Nolira design tokens |
| `components.md` | Component inventory & layout contracts for Nolira’s Agents shell |
| `icons.md` | Icon language (stroke, size, roles) — implement with original SVG in `src/renderer/icons.tsx` |

Use these specs to implement **original** React + CSS in `src/renderer/`. Do not vendor Cursor binaries or media.

## Legal boundary

- ✅ Measure public UI, write original tokens and components
- ✅ Use open icon languages (Lucide-like stroke geometry) recreated by us
- ❌ Copy `Cursor.app` JS/CSS bundles into `resources/`
- ❌ Copy Cursor logos, splash webm/png, or codicon font files for redistribution
- ❌ Ship Cursor proprietary code as part of Nolira

## Mapping to app code

| Spec | Implementation |
|---|---|
| Tokens | `src/renderer/styles.css` (`--cursor-*` / `--bg*` variables) |
| Icons | `src/renderer/icons.tsx` |
| Shell / sidebar / composer | `src/renderer/components/**` |
| Window chrome (solid, no vibrancy) | `src/main/index.ts` `windowOptions()` |

## How to refresh analysis (local only)

On a machine with Cursor installed, an engineer may **read** (not commit):

```text
/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.glass.main.css
/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.glass.main.js
```

Then update `tokens.json` / `components.md` with new measurements. Never check Cursor app files into git.
