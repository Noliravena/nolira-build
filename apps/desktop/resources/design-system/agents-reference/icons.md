# Icon language (Nolira Agents)

## Principles

Cursor Agents chrome icons behave like **codicon + thin Lucide strokes**:

| Property | Value |
|---|---|
| View box | 24×24 |
| Default size (chrome) | 16px |
| Stroke width | 1.5 |
| Caps / joins | round |
| Default color | `iconSecondary` |
| Hover / active | `iconPrimary` |
| Fill | mostly none (dots/more may fill) |

## Implementation

All icons are **original SVG paths** in:

```text
apps/desktop/src/renderer/icons.tsx
```

Do **not** copy Cursor’s codicon font files or brand SVGs.

## Role map

| Role | IconName | Where used |
|---|---|---|
| New agent / chat | `compose` | Sidebar New chat |
| Search | `search` | Sidebar search |
| Collapse panels | `layout-left` / `layout-right` | Header / sidebar |
| Send | `arrow-up` | Composer send |
| Stop | `stop` | Composer cancel |
| Attach | `attachment` | Composer |
| Settings | `gear` | Footer / settings |
| Project | `folder` | Project rows / chips |
| Code ref | `code` | Context chips |
| Agent spark | `spark` | Welcome / skills |
| Inbox | `inbox` | Sidebar nav |
| More menu | `more` | Row menus |
| Reasoning | `brain` | Thinking cards |
| Tool shell | `terminal` | Tool cards |

## Checklist when adding icons

1. Add path to `icons.tsx` with 1.5 stroke geometry  
2. Use 16px in chrome; 13–14px in dense chips  
3. Prefer `currentColor`; let CSS set icon hierarchy  
4. Avoid filled heavy icons except stop/play where needed  
