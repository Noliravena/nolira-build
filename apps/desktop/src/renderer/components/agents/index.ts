/**
 * Nolira Agents UI — public component surface.
 * Layout and styling follow the Claude Design handoff (`Nolira Agents.dc.html`).
 */

export { agentsTokens } from "./tokens"
export type { AgentsTokens } from "./tokens"

// Brand
export { BrandMark } from "../brand/BrandMark"

// Shell chrome
export { AppHeader, StatusFooter } from "../nolira/AppChrome"

// Screens
export { HomeView, AgentCard } from "../nolira/HomeView"
export { SessionView } from "../nolira/SessionView"

// Dialogs
export { InboxDialog, CommandPalette } from "../nolira/dialogs"
export { SettingsDialog, Toggle } from "../nolira/SettingsDialog"
export { PermissionDialog } from "../screens/PermissionDialog"

// Primitives
export { Menu, ActionMenu } from "../nolira/Menu"

// Chat / conversation
export { Composer } from "../chat/Composer"
export { MessageView } from "../chat/MessageView"
export { RichText } from "../chat/RichText"
