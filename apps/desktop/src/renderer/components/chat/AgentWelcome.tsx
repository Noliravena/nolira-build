import type { ReactNode } from "react"
import { Icon } from "../../icons"
import { BrandMark } from "../brand/BrandMark"
import type { Project } from "../../types"

export interface AgentWelcomeProps {
  project: Project | null
  composer: ReactNode
  onAddProject: () => void
}

export function AgentWelcome({
  project,
  composer,
  onAddProject,
}: AgentWelcomeProps) {
  return (
    <div className="new-workspace-stage agents-welcome">
      {project ? (
        <>
          <div className="agents-welcome-splash" aria-hidden="true">
            <div className="agents-welcome-mark">
              <BrandMark size={40} />
            </div>
          </div>
          <div className="agents-welcome-copy">
            <h2>What should we work on?</h2>
            <p className="agents-welcome-subtitle">
              Plan, edit, and ship with your local Grok agent
            </p>
          </div>
          <div className="new-workspace-composer agents-welcome-composer">
            {composer}
          </div>
          <div className="new-workspace-context agents-welcome-chips">
            <span>
              <Icon name="code" size={13} />
              {project.name}
            </span>
            <span>
              <Icon name="folder" size={13} />
              Local agent
            </span>
            <span>
              <Icon name="spark" size={13} />
              ACP runtime
            </span>
          </div>
        </>
      ) : (
        <div className="agents-welcome-empty-repo">
          <div className="agents-welcome-splash" aria-hidden="true">
            <div className="agents-welcome-mark">
              <BrandMark size={40} />
            </div>
          </div>
          <div className="agents-welcome-copy">
            <h2>Open a workspace</h2>
            <p className="agents-welcome-subtitle">
              Choose a repository to start an agent session
            </p>
          </div>
          <button className="select-repo-button" onClick={onAddProject}>
            Select repo
          </button>
        </div>
      )}
    </div>
  )
}
