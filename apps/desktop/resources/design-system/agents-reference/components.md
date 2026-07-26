# Agents component contracts (Nolira)

Inventory of shell pieces to implement (and keep aligned with `tokens.json`). Names are Nolira’s, inspired by Agents UX patterns—not Cursor class names.

## App shell

```
┌────────────┬──────────────────────────────────────┐
│  Sidebar   │  Topbar (tabs + actions)             │
│  260px     ├──────────────────────────────────────┤
│            │  MessageList / Welcome               │
│  projects  │  max-width 840                       │
│  agents    │                                      │
│            ├──────────────────────────────────────┤
│  footer    │  Composer floating island            │
└────────────┴──────────────────────────────────────┘
```

| Component | Path | Notes |
|---|---|---|
| `WindowChrome` | `components/brand/WindowChrome.tsx` | Drag region; solid window |
| `Sidebar` | `components/sidebar/Sidebar.tsx` | Mode picker, New chat, project groups, runtime footer |
| `SidebarProjectGroup` | `components/sidebar/SidebarProjectGroup.tsx` | Collapsible project + agent rows |
| `SidebarTaskRow` | `components/sidebar/SidebarTaskRow.tsx` | Single agent/session row, hover actions |
| `WorkspaceHeader` | `components/chat/WorkspaceHeader.tsx` | Pill tab + panel toggle |
| `ChatWorkspace` | `components/chat/ChatWorkspace.tsx` | Empty vs conversation switch |
| `AgentWelcome` | `components/chat/AgentWelcome.tsx` | Centered empty state + composer |
| `MessageList` | `components/chat/MessageList.tsx` | Scroll + title + working indicator |
| `MessageView` | `components/chat/MessageView.tsx` | User bubble / assistant stream / tools |
| `Composer` | `components/chat/Composer.tsx` | Input, model/mode pills, send |
| `ActivityPanel` | `components/activity/ActivityPanel.tsx` | Right details panel |

## Visual rules (solid Agents)

1. **No glass**: no `backdrop-filter`, no translucent OS vibrancy.
2. **Sidebar**: solid `bgSidebar`; 1px right border `strokeTertiary`.
3. **Rows**: height ~32px; hover `bgHover`; active `bgActive`; radius 8.
4. **New agent**: text row with compose icon, not a heavy filled button.
5. **Composer**: elevated solid card, radius 16, max-width 840, circular send.
6. **User message**: elevated bubble, padding `8px 10px`, no heavy border.
7. **Icons**: 16px chrome, stroke 1.5, secondary color unless active/hover.

## Cursor BEM names (reference only — do not ship)

Observed in local Cursor install for mapping discussions:

- `glass-sidebar-docked`
- `glass-sidebar-project-group-header`
- `glass-sidebar-agent-menu-btn`
- `glass-sidebar-footer-account-trigger`
- `glass-welcome-splash` / `glass-welcome-splash__logo`
- `glass-chat-status-bar`
- `ui-sidebar-menu-button`

Nolira uses its own class names in `styles.css` (e.g. `.sidebar`, `.task-row`, `.composer`).
