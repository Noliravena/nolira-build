/**
 * Nolira Agents design tokens.
 * Informed by local Cursor Agents (solid / vibrancy-off) analysis.
 * Original values for Nolira — not a copy of Cursor source.
 */

export const agentsTokens = {
  color: {
    dark: {
      bgPrimary: "#0c0e11",
      bgSecondary: "#14171d",
      bgElevated: "#1b1f27",
      bgSidebar: "#0f1115",
      bgChrome: "#0c0e11",
      bgHover: "hsla(0, 0%, 100%, 0.07)",
      bgActive: "hsla(0, 0%, 100%, 0.10)",
      strokeTertiary: "hsla(0, 0%, 100%, 0.09)",
      strokeSecondary: "hsla(0, 0%, 100%, 0.16)",
      textPrimary: "#ecf1fa",
      textSecondary: "rgba(226, 233, 244, 0.62)",
      textTertiary: "rgba(226, 233, 244, 0.42)",
      iconPrimary: "rgba(236, 241, 250, 0.88)",
      iconSecondary: "rgba(226, 233, 244, 0.62)",
      accent: "#4c8bf5",
      sendBg: "#ecf1fa",
      sendFg: "#0c0e11",
    },
    light: {
      bgPrimary: "#f7f7f4",
      bgSecondary: "#efefec",
      bgElevated: "#ffffff",
      bgSidebar: "#f0f0ed",
      bgChrome: "#f7f7f4",
      bgHover: "rgba(0, 0, 0, 0.05)",
      bgActive: "rgba(0, 0, 0, 0.08)",
      strokeTertiary: "rgba(0, 0, 0, 0.08)",
      strokeSecondary: "rgba(0, 0, 0, 0.14)",
      textPrimary: "#171717",
      textSecondary: "rgba(23, 23, 23, 0.62)",
      textTertiary: "rgba(23, 23, 23, 0.42)",
      iconPrimary: "rgba(23, 23, 23, 0.88)",
      iconSecondary: "rgba(23, 23, 23, 0.55)",
      accent: "#2563eb",
      sendBg: "#171717",
      sendFg: "#f7f7f4",
    },
  },
  radius: {
    base: 8,
    lg: 10,
    xl: 14,
    "2xl": 16,
    "3xl": 18,
    pill: 9999,
  },
  layout: {
    sidebarWidth: 260,
    topbarHeight: 40,
    composerMaxWidth: 840,
    controlHeight: 28,
    rowHeight: 32,
    iconSize: 16,
    iconStroke: 1.5,
    userBubblePadding: "8px 10px",
  },
} as const

export type AgentsTokens = typeof agentsTokens
