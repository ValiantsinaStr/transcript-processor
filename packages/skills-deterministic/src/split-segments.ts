import type { IStep, StepContext, TranscriptSegment } from '@transcript-sdk/core'
import { getChunkText } from './shared.js'

export interface SplitSegmentsStepOptions {
    maxSegmentLength?: number
}

interface ParsedLine {
    speakerId?: string
    text: string
}

const SPEAKER_PREFIX_PATTERN = /^\s*([\p{L}][\p{L}\d_\- .]{0,30}):\s*(.+)$/u

export class SplitSegmentsStep implements IStep {
    readonly name = 'split-segments'
    readonly version = '1.0.0'

    constructor(private readonly options: SplitSegmentsStepOptions = {}) { }

    async execute(ctx: StepContext, next: () => Promise<void>): Promise<void> {
        const source = getChunkText(ctx)
        const parsed = splitIntoLines(source)
            .map(parseSpeakerPrefix)
            .flatMap((line) => chunkLine(line, this.options.maxSegmentLength ?? 280))

        ctx.segments = parsed.map((line, index) =>
            makeSegment(ctx.chunkIndex, index, line.text, line.speakerId),
        )

        await next()
    }
}

function splitIntoLines(text: string): string[] {
    return text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
}

function parseSpeakerPrefix(line: string): ParsedLine {
    const match = line.match(SPEAKER_PREFIX_PATTERN)
    if (!match) return { text: line }

    const [, speakerId, text] = match
    const parsedText = text?.trim() ?? ''
    const parsedSpeaker = speakerId?.trim()
    if (!parsedSpeaker) {
        return { text: parsedText }
    }

    return { speakerId: parsedSpeaker, text: parsedText }
}

function chunkLine(parsed: ParsedLine, maxLength: number): ParsedLine[] {
    if (parsed.text.length <= maxLength) return [parsed]

    const parts: ParsedLine[] = []
    const sentences = parsed.text.split(/(?<=[.!?])\s+/)
    let current = ''

    for (const sentence of sentences) {
        const candidate = current.length === 0 ? sentence : `${current} ${sentence}`
        if (candidate.length <= maxLength) {
            current = candidate
            continue
        }

        if (current.length > 0) {
            parts.push(makeParsedLine(current, parsed.speakerId))
            current = sentence
            continue
        }

        // Fallback for very long sentence without punctuation split opportunity.
        for (let i = 0; i < sentence.length; i += maxLength) {
            parts.push(makeParsedLine(sentence.slice(i, i + maxLength).trim(), parsed.speakerId))
        }
    }

    if (current.length > 0) {
        parts.push(makeParsedLine(current, parsed.speakerId))
    }

    return parts
}

function makeParsedLine(text: string, speakerId: string | undefined): ParsedLine {
    if (!speakerId) {
        return { text }
    }
    return { text, speakerId }
}

function makeSegment(
    chunkIndex: number,
    index: number,
    text: string,
    speakerId?: string,
): TranscriptSegment {
    const normalizedText = text.trim().replace(/\s+/g, ' ')
    const suffix = fnv1a(`${chunkIndex}|${index}|${normalizedText}`)
    const segment: TranscriptSegment = {
        id: `seg-${chunkIndex}-${index}-${suffix}`,
        text: normalizedText,
    }

    if (speakerId && speakerId.length > 0) {
        segment.speakerId = speakerId
    }

    return segment
}

function fnv1a(value: string): string {
    let hash = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = (hash * 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
}
