import type { IStep, StepContext } from '@transcript-sdk/core'
import type { BaseLlmStepOptions, DecisionsOutput, LlmProviderAdapter } from './types.js'
import { buildDecisionsPrompt, DECISIONS_PROMPT_VERSION, DECISIONS_SCHEMA_VERSION } from './prompting.js'
import { generateWithRetry, parseJsonOutput, resolveRuntimeOptions } from './runtime.js'
import { normalizeText, stableId } from './helpers.js'

export class ExtractDecisionsLlmStep implements IStep {
    readonly name = 'extract-decisions-llm'
    readonly version = '1.0.0'

    constructor(
        private readonly adapter: LlmProviderAdapter,
        private readonly options: BaseLlmStepOptions = {},
    ) { }

    async execute(ctx: StepContext, next: () => Promise<void>): Promise<void> {
        const runtime = resolveRuntimeOptions(this.options)
        const segments = ctx.segments.slice(0, runtime.maxSegmentsInPrompt)

        const response = await generateWithRetry(
            this.adapter,
            {
                prompt: buildDecisionsPrompt({ segments }),
                schemaName: 'decisions',
                schemaVersion: DECISIONS_SCHEMA_VERSION,
                timeoutMs: runtime.timeoutMs,
            },
            runtime,
        )

        const parsed = parseJsonOutput<DecisionsOutput>(response.text, 'decisions')
        const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : []

        for (let i = 0; i < decisions.length; i++) {
            const candidate = decisions[i]
            if (!candidate || typeof candidate.text !== 'string') continue
            const text = normalizeText(candidate.text)
            if (text.length === 0) continue

            if (candidate.madeBy) {
                ctx.model.addDecision({
                    id: stableId('dec', i, text),
                    text,
                    madeBy: normalizeText(candidate.madeBy),
                })
            } else {
                ctx.model.addDecision({
                    id: stableId('dec', i, text),
                    text,
                })
            }
        }

        await next()
    }

    get promptVersion(): string {
        return DECISIONS_PROMPT_VERSION
    }

    get outputSchemaVersion(): string {
        return DECISIONS_SCHEMA_VERSION
    }
}
