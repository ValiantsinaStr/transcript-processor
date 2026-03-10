import type { IStep, StepContext } from '@transcript-sdk/core'
import { escapeRegex, pseudonymizePerson } from './shared.js'

export interface DeIdentifyStepOptions {
    pseudonymizeSpeakerIds?: boolean
    pseudonymizeNamesInText?: boolean
}

const PERSON_NAME_PATTERN = /\b([A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]{1,30})?|[А-ЯЁ][а-яё]{1,30}(?:\s+[А-ЯЁ][а-яё]{1,30})?)\b/gu

export class DeIdentifyStep implements IStep {
    readonly name = 'de-identify'
    readonly version = '1.0.0'

    constructor(private readonly options: DeIdentifyStepOptions = {}) { }

    async execute(ctx: StepContext, next: () => Promise<void>): Promise<void> {
        const maskSpeakers = this.options.pseudonymizeSpeakerIds ?? true
        const maskInText = this.options.pseudonymizeNamesInText ?? true

        ctx.segments = ctx.segments.map((segment) => {
            let speakerId = segment.speakerId
            let text = segment.text

            if (speakerId && maskSpeakers) {
                speakerId = pseudonymizePerson(ctx, speakerId)
            }

            if (maskInText) {
                const seenAliases = new Map<string, string>()
                const matches = [...text.matchAll(PERSON_NAME_PATTERN)]

                for (const match of matches) {
                    const full = match[0]
                    if (!full) continue

                    const existing = seenAliases.get(full)
                    const alias = existing ?? pseudonymizePerson(ctx, full)
                    seenAliases.set(full, alias)

                    text = text.replace(new RegExp(`\\b${escapeRegex(full)}\\b`, 'g'), alias)
                }
            }

            const nextSegment = {
                ...segment,
                text,
            }

            if (speakerId) {
                return {
                    ...nextSegment,
                    speakerId,
                }
            }

            return nextSegment
        })

        await next()
    }
}
