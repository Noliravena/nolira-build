import React from "react"
import ReactDOM from "react-dom/client"

import { App } from "./App"
import "./styles.css"
/* Agents solid theme last so it wins over legacy layers */
import "./styles/agents-ui.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
