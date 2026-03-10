import type { IStep, StepContext } from '@transcript-sdk/core'
import type { ActionsOutput, BaseLlmStepOptions, LlmProviderAdapter } from './types.js'
import { buildActionsPrompt, ACTIONS_PROMPT_VERSION, ACTIONS_SCHEMA_VERSION } from './prompting.js'
import { generateWithRetry, parseJsonOutput, resolveRuntimeOptions } from './runtime.js'
import { normalizeText, stableId } from './helpers.js'

export class ExtractActionsLlmStep implements IStep {
    readonly name = 'extract-actions-llm'
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
                prompt: buildActionsPrompt({ segments }),
                schemaName: 'actions',
                schemaVersion: ACTIONS_SCHEMA_VERSION,
                timeoutMs: runtime.timeoutMs,
            },
            runtime,
        )

        const parsed = parseJsonOutput<ActionsOutput>(response.text, 'actions')
        const actions = Array.isArray(parsed.actions) ? parsed.actions : []

        for (let i = 0; i < actions.length; i++) {
            const candidate = actions[i]
            if (!candidate || typeof candidate.text !== 'string') continue
            const text = normalizeText(candidate.text)
            if (text.length === 0) continue

            const status = candidate.status === 'done' ? 'done' : 'open'
            const action = {
                id: stableId('act', i, text),
                text,
                status,
            } as const

            if (candidate.assignee) {
                ctx.model.addAction({ ...action, assignee: normalizeText(candidate.assignee) })
            } else if (candidate.dueDate) {
                ctx.model.addAction({ ...action, dueDate: normalizeText(candidate.dueDate) })
            } else {
                ctx.model.addAction(action)
            }
        }

        await next()
    }

    get promptVersion(): string {
        return ACTIONS_PROMPT_VERSION
    }

    get outputSchemaVersion(): string {
        return ACTIONS_SCHEMA_VERSION
    }
}
