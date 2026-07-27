export function trustedDevelopmentRendererUrl(
  value: string | undefined,
  isPackaged: boolean
): string | undefined {
  if (isPackaged || !value) return undefined

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('ELECTRON_RENDERER_URL must be a valid URL.')
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !loopbackHosts.has(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'ELECTRON_RENDERER_URL is only allowed to use an HTTP(S) loopback address in development.'
    )
  }
  return url.href
}
