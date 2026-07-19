export class GrokAcpError extends Error {
  readonly code?: number
  readonly method?: string

  constructor(message: string, options: { code?: number; method?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'GrokAcpError'
    this.code = options.code
    this.method = options.method
  }
}

export class GrokAcpTimeoutError extends GrokAcpError {
  constructor(method: string, timeoutMs: number) {
    super(`Grok ACP request timed out after ${timeoutMs}ms: ${method}`, { method })
    this.name = 'GrokAcpTimeoutError'
  }
}
