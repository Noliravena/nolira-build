import { useState } from "react"
import { Icon } from "../../icons"
import type { PermissionRequest } from "../../types"

export interface PermissionDialogProps {
  request: PermissionRequest
  apiAvailable: boolean
  onDefer: () => void
  onError: (message: string) => void
}

export function PermissionDialog({
  request,
  apiAvailable,
  onDefer,
  onError,
}: PermissionDialogProps) {
  const [submitting, setSubmitting] = useState<string | null>(null)

  const respond = async (optionId: string) => {
    setSubmitting(optionId)
    if (!window.nolira) {
      window.setTimeout(onDefer, 250)
      return
    }
    try {
      await window.nolira.respondPermission({
        requestId: request.id,
        optionId,
      })
    } catch (error) {
      onError(error instanceof Error ? error.message : "Permission response failed")
      setSubmitting(null)
    }
  }

  return (
    <div className="nol-overlay" role="presentation" style={{ zIndex: 75 }}>
      <div
        aria-describedby="permission-description"
        aria-labelledby="permission-title"
        aria-modal="true"
        className="nol-dialog nol-permission-dialog"
        role="dialog"
      >
        <div className="nol-dialog-head">
          <span
            className="nol-inbox-kind"
            style={{ color: "var(--wr)" }}
          >
            Approval
          </span>
          <span className="nol-dialog-sub">
            the agent is waiting on you
          </span>
          <div className="nol-flex1" />
          <button
            type="button"
            className="nol-dialog-close"
            onClick={onDefer}
            aria-label="Review this approval later"
            title="Review later"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="nol-permission-body">
          <h2 className="nol-inbox-title" id="permission-title">
            {request.title}
          </h2>
          <p className="nol-inbox-detail" id="permission-description">
            {request.description ??
              "Grok needs your approval before it can continue this action."}
          </p>
          {(request.tool || request.command) && (
            <div className="nol-permission-command">
              <div>
                <Icon name="terminal" size={13} />
                <span>{request.tool ?? "Command"}</span>
              </div>
              {request.command && <pre>{request.command}</pre>}
            </div>
          )}
          <div className="nol-permission-options">
            {request.options.map((option) => (
              <button
                type="button"
                data-kind={
                  option.dangerous
                    ? "danger"
                    : option.kind?.startsWith("allow")
                      ? "allow"
                      : "reject"
                }
                disabled={Boolean(submitting)}
                key={option.id}
                onClick={() => respond(option.id)}
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                <Icon name="chevron-right" size={13} />
              </button>
            ))}
            {!apiAvailable && (
              <button type="button" data-kind="reject" onClick={onDefer}>
                <span>
                  <strong>Close preview</strong>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
