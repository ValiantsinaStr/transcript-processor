import { describe, it, expect } from 'vitest'
import { createMockTranscript } from '../fixtures.js'

describe('createMockTranscript', () => {
  it('returns an object with text and metadata', () => {
    const t = createMockTranscript()
    expect(typeof t.text).toBe('string')
    expect(t.text.length).toBeGreaterThan(0)
    expect(t.metadata).toBeDefined()
  })

  it('default language is English', () => {
    const t = createMockTranscript()
    expect(t.metadata?.['language']).toBe('en')
  })

  it('Russian transcript contains Cyrillic characters', () => {
    const t = createMockTranscript({ language: 'ru' })
    expect(/[а-яА-ЯёЁ]/.test(t.text)).toBe(true)
  })

  it('mixed transcript contains both Latin and Cyrillic', () => {
    const t = createMockTranscript({ language: 'mixed', words: 300 })
    expect(/[a-zA-Z]/.test(t.text)).toBe(true)
    expect(/[а-яА-ЯёЁ]/.test(t.text)).toBe(true)
  })

  it('includePii inserts a fake email and phone', () => {
    const t = createMockTranscript({ includePii: true })
    expect(t.text).toContain('@')
    expect(t.text).toMatch(/\d{3}-\d{3}-\d{4}/)
  })

  it('word count is approximately correct', () => {
    const t = createMockTranscript({ words: 100 })
    const count = t.text.split(/\s+/).length
    // Allow some slack for sentence-boundary trimming
    expect(count).toBeGreaterThanOrEqual(95)
    expect(count).toBeLessThanOrEqual(115)
  })
})
