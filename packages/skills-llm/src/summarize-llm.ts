import type { IStep, StepContext } from '@transcript-sdk/core'
import type { BaseLlmStepOptions, LlmProviderAdapter, SummaryOutput } from './types.js'
import { buildSummaryPrompt, SUMMARY_PROMPT_VERSION, SUMMARY_SCHEMA_VERSION } from './prompting.js'
import { generateWithRetry, parseJsonOutput, resolveRuntimeOptions } from './runtime.js'
import { normalizeText } from './helpers.js'

export class SummarizeLlmStep implements IStep {
    readonly name = 'summarize-llm'
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
                prompt: buildSummaryPrompt({ segments }),
                schemaName: 'summary',
                schemaVersion: SUMMARY_SCHEMA_VERSION,
                timeoutMs: runtime.timeoutMs,
            },
            runtime,
        )

        const parsed = parseJsonOutput<SummaryOutput>(response.text, 'summary')
        const summary = normalizeText(parsed.summary ?? '')
        if (summary.length > 0) {
            ctx.model.setSummary(summary)
        }

        await next()
    }

    get promptVersion(): string {
        return SUMMARY_PROMPT_VERSION
    }

    get outputSchemaVersion(): string {
        return SUMMARY_SCHEMA_VERSION
    }
}
