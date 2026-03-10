import type { PluginRegistry } from '@transcript-sdk/core'
import type { BaseLlmStepOptions, LlmProviderAdapter } from './types.js'
import { SummarizeLlmStep } from './summarize-llm.js'
import { ExtractActionsLlmStep } from './extract-actions-llm.js'
import { ExtractDecisionsLlmStep } from './extract-decisions-llm.js'

export type {
    LlmProviderAdapter,
    LlmGenerationRequest,
    LlmGenerationResponse,
    BaseLlmStepOptions,
    RetryPolicy,
    SummaryOutput,
    ActionsOutput,
    DecisionsOutput,
} from './types.js'

export { SummarizeLlmStep } from './summarize-llm.js'
export { ExtractActionsLlmStep } from './extract-actions-llm.js'
export { ExtractDecisionsLlmStep } from './extract-decisions-llm.js'

export {
    createLocalHttpAdapter,
    createHostedHttpAdapter,
} from './adapters.js'

export function registerLlmSkills(
    registry: PluginRegistry,
    adapter: LlmProviderAdapter,
    options: BaseLlmStepOptions = {},
): void {
    registry.registerStep('summarize-llm', new SummarizeLlmStep(adapter, options))
    registry.registerStep('extract-actions-llm', new ExtractActionsLlmStep(adapter, options))
    registry.registerStep('extract-decisions-llm', new ExtractDecisionsLlmStep(adapter, options))
}
