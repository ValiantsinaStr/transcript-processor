import { describe, it, expect } from 'vitest'
import { coreRedact } from '../pii/core-redactor.js'

const replacements = { email: '[Email]', phone: '[Phone]', name: '[Person]' }

describe('coreRedact', () => {
  it('redacts email addresses', () => {
    const { redactedText, matches } = coreRedact('Contact john@example.com today.', replacements)
    expect(redactedText).toBe('Contact [Email] today.')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.type).toBe('email')
  })

  it('redacts phone numbers', () => {
    const { redactedText } = coreRedact('Call +1 555-123-4567 now.', replacements)
    expect(redactedText).toContain('[Phone]')
    expect(redactedText).not.toContain('555-123-4567')
  })

  it('redacts credit card numbers', () => {
    const { redactedText, matches } = coreRedact('Card: 4111 1111 1111 1111 expires soon.', replacements)
    expect(redactedText).toContain('[Card]')
    expect(redactedText).not.toContain('4111')
    expect(matches[0]!.type).toBe('financial')
  })

  it('redacts SSNs', () => {
    const { redactedText } = coreRedact('SSN is 123-45-6789 on file.', replacements)
    expect(redactedText).toContain('[SSN]')
    expect(redactedText).not.toContain('123-45-6789')
  })

  it('redacts multiple PII types in one pass', () => {
    const text = 'Email: bob@test.org, Card: 1234-5678-9012-3456.'
    const { redactedText } = coreRedact(text, replacements)
    expect(redactedText).toContain('[Email]')
    expect(redactedText).toContain('[Card]')
  })

  it('returns empty matches for clean text', () => {
    const { matches } = coreRedact('No PII here at all.', replacements)
    expect(matches).toHaveLength(0)
  })

  it('does not alter text without PII', () => {
    const text = 'Alice and Bob discussed the project timeline.'
    const { redactedText } = coreRedact(text, replacements)
    expect(redactedText).toBe(text)
  })

  it('match offsets are non-overlapping', () => {
    const text = 'a@b.com and c@d.com'
    const { matches } = coreRedact(text, replacements)
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i]!.start).toBeGreaterThanOrEqual(matches[i - 1]!.end)
    }
  })
})
