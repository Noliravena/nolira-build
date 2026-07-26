/**
 * Nolira Agents UI — public component surface.
 * Implement with original code; styles target Cursor Agents–like density.
 */

export { agentsTokens } from "./tokens"
export type { AgentsTokens } from "./tokens"

// Brand / chrome
export { BrandMark } from "../brand/BrandMark"
export { WindowChrome } from "../brand/WindowChrome"
export { StatusDot } from "../chrome/StatusDot"
export { RuntimeDot } from "../chrome/RuntimeDot"
export { SelectControl } from "../chrome/SelectControl"

// Sidebar (Agents list)
export { Sidebar } from "../sidebar/Sidebar"
export { SidebarProjectGroup } from "../sidebar/SidebarProjectGroup"
export { SidebarTaskRow as AgentRow } from "../sidebar/SidebarTaskRow"
export { SIDEBAR_MODES, ACTIVE_SIDEBAR_MODE_INDEX } from "../sidebar/sidebarModes"

// Chat / conversation
export { ChatWorkspace } from "../chat/ChatWorkspace"
export { WorkspaceHeader } from "../chat/WorkspaceHeader"
export { AgentWelcome } from "../chat/AgentWelcome"
export { Composer } from "../chat/Composer"
export { MessageList } from "../chat/MessageList"
export { MessageView } from "../chat/MessageView"
export { RichText } from "../chat/RichText"

// Panels / screens
export { ActivityPanel } from "../activity/ActivityPanel"
export { SettingsView } from "../screens/SettingsView"
export { InboxView } from "../screens/InboxView"
export { PermissionDialog } from "../screens/PermissionDialog"
