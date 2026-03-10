import type { ChunkingConfig } from './types.js'

export interface TextChunk {
  text: string
  index: number
}

/**
 * Splits text into overlapping chunks.
 * - Splits on word count, snapping to nearest sentence boundary.
 * - Overlap words are taken from the end of the previous chunk.
 */
export function chunkText(text: string, config: ChunkingConfig): TextChunk[] {
  const { chunkSize, overlap } = config

  // Tokenize into sentences (split on . ! ? followed by whitespace or end)
  const sentences = splitSentences(text)
  if (sentences.length === 0) return []

  const chunks: TextChunk[] = []
  let sentenceStart = 0

  while (sentenceStart < sentences.length) {
    // Accumulate sentences until we hit chunkSize words
    let wordCount = 0
    let sentenceEnd = sentenceStart

    while (sentenceEnd < sentences.length) {
      const words = countWords(sentences[sentenceEnd]!)
      if (wordCount > 0 && wordCount + words > chunkSize) break
      wordCount += words
      sentenceEnd++
    }

    // Guarantee at least one sentence per chunk (prevents infinite loop)
    if (sentenceEnd === sentenceStart) sentenceEnd = sentenceStart + 1

    const chunkSentences = sentences.slice(sentenceStart, sentenceEnd)
    let chunkText = chunkSentences.join(' ')

    // Prepend overlap words from end of previous chunk
    if (chunks.length > 0 && overlap > 0) {
      const prev = chunks[chunks.length - 1]!
      const overlapText = lastNWords(prev.text, overlap)
      if (overlapText) chunkText = overlapText + ' ' + chunkText
    }

    chunks.push({ text: chunkText.trim(), index: chunks.length })
    sentenceStart = sentenceEnd
  }

  return chunks
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).length
}

function lastNWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/)
  return words.slice(-n).join(' ')
}
