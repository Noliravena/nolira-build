/// <reference types="vite/client" />

import type { NoliraAPI } from "./types"

declare global {
  interface Window {
    nolira?: NoliraAPI
  }
}

export {}
