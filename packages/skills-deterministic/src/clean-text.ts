import type { IStep, StepContext } from '@transcript-sdk/core'
import { CLEANED_TEXT_KEY, getChunkText } from './shared.js'

export interface CleanTextStepOptions {
    removeTimestamps?: boolean
    collapseWhitespace?: boolean
    removeFillerMarkers?: boolean
    fillerMarkers?: string[]
}

const DEFAULT_FILLERS = ['um', 'uh', 'erm', 'hmm']

export class CleanTextStep implements IStep {
    readonly name = 'clean-text'
    readonly version = '1.0.0'

    constructor(private readonly options: CleanTextStepOptions = {}) { }

    async execute(ctx: StepContext, next: () => Promise<void>): Promise<void> {
        const source = getChunkText(ctx)
        let text = source

        if (this.options.removeTimestamps ?? true) {
            text = text.replace(/\[(\d{1,2}:)?\d{1,2}:\d{2}(\.\d+)?\]/g, ' ')
            text = text.replace(/\b(\d{1,2}:)?\d{1,2}:\d{2}(\.\d+)?\b/g, ' ')
        }

        if (this.options.removeFillerMarkers ?? true) {
            const fillers = this.options.fillerMarkers ?? DEFAULT_FILLERS
            for (const filler of fillers) {
                const pattern = new RegExp(`\\b${filler}\\b`, 'gi')
                text = text.replace(pattern, ' ')
            }
            text = text.replace(/[()\[\]]/g, ' ')
        }

        if (this.options.collapseWhitespace ?? true) {
            text = text.replace(/\s+/g, ' ').trim()
        }

        ctx.state[CLEANED_TEXT_KEY] = text

        if (ctx.segments.length > 0) {
            ctx.segments = ctx.segments.map((segment) => ({
                ...segment,
                text: this.options.collapseWhitespace === false
                    ? segment.text
                    : segment.text.replace(/\s+/g, ' ').trim(),
            }))
        }

        await next()
    }
}
