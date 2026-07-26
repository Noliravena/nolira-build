import { useState } from "react"
import { Icon } from "../../icons"
import type { PermissionRequest } from "../../types"

export interface PermissionDialogProps {
  request: PermissionRequest
  apiAvailable: boolean
  onClose: () => void
  onError: (message: string) => void
}

export function PermissionDialog({
  request,
  apiAvailable,
  onClose,
  onError,
}: PermissionDialogProps) {
  const [submitting, setSubmitting] = useState<string | null>(null)

  const respond = async (optionId: string) => {
    setSubmitting(optionId)
    if (!window.nolira) {
      window.setTimeout(onClose, 250)
      return
    }
    try {
      await window.nolira.respondPermission({
        requestId: request.id,
        optionId,
      })
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message : "Permission response failed")
      setSubmitting(null)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        aria-describedby="permission-description"
        aria-labelledby="permission-title"
        aria-modal="true"
        className="permission-dialog"
        role="dialog"
      >
        <div className="permission-heading">
          <span className="permission-icon">
            <Icon name="warning" size={16} />
          </span>
          <div>
            <span className="eyebrow">Permission request</span>
            <h2 id="permission-title">{request.title}</h2>
          </div>
        </div>
        <p id="permission-description" className="permission-description">
          {request.description ??
            "Grok needs your approval before it can continue this action."}
        </p>
        {(request.tool || request.command) && (
          <div className="permission-command">
            <div>
              <Icon name="terminal" size={13} />
              <span>{request.tool ?? "Command"}</span>
            </div>
            {request.command && <pre>{request.command}</pre>}
          </div>
        )}
        <div className="permission-options">
          {request.options.map((option) => (
            <button
              className={`${option.dangerous ? "danger" : ""} ${
                option.kind?.startsWith("allow") ? "allow" : ""
              }`}
              disabled={Boolean(submitting)}
              key={option.id}
              onClick={() => respond(option.id)}
            >
              <span>
                <strong>{option.label}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
              {submitting === option.id ? (
                <span className="mini-spinner" />
              ) : (
                <Icon name="chevron-right" size={13} />
              )}
            </button>
          ))}
          {!apiAvailable && (
            <button onClick={onClose}>
              <span><strong>Close preview</strong></span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
