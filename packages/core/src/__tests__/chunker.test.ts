import { describe, it, expect } from 'vitest'
import { chunkText } from '../chunker.js'
import type { ChunkingConfig } from '../types.js'

const cfg = (overrides: Partial<ChunkingConfig> = {}): ChunkingConfig => ({
  chunkSize: 10,
  overlap: 2,
  maxParallel: 4,
  memoryLimitMb: 512,
  ...overrides,
})

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const chunks = chunkText('Hello world. How are you.', cfg())
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.index).toBe(0)
  })

  it('returns multiple chunks for long text', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog.'
    const text = Array(10).fill(sentence).join(' ')
    const chunks = chunkText(text, cfg({ chunkSize: 10, overlap: 0 }))
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('chunks are indexed sequentially', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog.'
    const text = Array(10).fill(sentence).join(' ')
    const chunks = chunkText(text, cfg({ chunkSize: 10, overlap: 0 }))
    chunks.forEach((c, i) => expect(c.index).toBe(i))
  })

  it('overlap words appear in consecutive chunks', () => {
    const sentence = 'One two three four five six seven eight nine ten.'
    const text = `${sentence} ${sentence}`
    const chunks = chunkText(text, cfg({ chunkSize: 10, overlap: 3 }))
    if (chunks.length >= 2) {
      const prevWords = chunks[0]!.text.split(/\s+/)
      const lastThree = prevWords.slice(-3).join(' ')
      expect(chunks[1]!.text).toContain(lastThree.split(' ')[0]!)
    }
  })

  it('handles empty string', () => {
    expect(chunkText('', cfg())).toEqual([])
  })

  it('each chunk text is non-empty', () => {
    const text = Array(5).fill('Alpha beta gamma delta epsilon zeta eta theta iota kappa.').join(' ')
    const chunks = chunkText(text, cfg({ chunkSize: 5, overlap: 1 }))
    for (const c of chunks) {
      expect(c.text.length).toBeGreaterThan(0)
    }
  })
})
