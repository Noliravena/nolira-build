import { describe, expect, it } from 'vitest'

import { trustedDevelopmentRendererUrl } from './window-security'

describe('trustedDevelopmentRendererUrl', () => {
  it('accepts loopback development servers', () => {
    expect(
      trustedDevelopmentRendererUrl('http://localhost:5173', false)
    ).toBe('http://localhost:5173/')
    expect(
      trustedDevelopmentRendererUrl('https://127.0.0.1:4173/app', false)
    ).toBe('https://127.0.0.1:4173/app')
  })

  it('rejects remote or credentialed renderer URLs', () => {
    expect(() =>
      trustedDevelopmentRendererUrl('https://example.com', false)
    ).toThrow(/loopback/)
    expect(() =>
      trustedDevelopmentRendererUrl('http://user@localhost:5173', false)
    ).toThrow(/loopback/)
  })

  it('ignores renderer URL environment overrides in packaged builds', () => {
    expect(
      trustedDevelopmentRendererUrl('https://example.com', true)
    ).toBeUndefined()
  })
})
