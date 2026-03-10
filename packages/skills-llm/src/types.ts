import type { TranscriptSegment } from '@transcript-sdk/core'

export interface LlmGenerationRequest {
    prompt: string
    schemaName: string
    schemaVersion: string
    timeoutMs: number
}

export interface LlmGenerationResponse {
    text: string
    provider: string
    model?: string
    raw?: unknown
}

export interface LlmProviderAdapter {
    generate(request: LlmGenerationRequest): Promise<LlmGenerationResponse>
}

export interface RetryPolicy {
    timeoutMs?: number
    retries?: number
    retryDelayMs?: number
}

export interface BaseLlmStepOptions extends RetryPolicy {
    maxSegmentsInPrompt?: number
}

export interface ActionExtraction {
    text: string
    assignee?: string
    dueDate?: string
    status?: 'open' | 'done'
}

export interface DecisionExtraction {
    text: string
    madeBy?: string
}

export interface SummaryOutput {
    summary: string
}

export interface ActionsOutput {
    actions: ActionExtraction[]
}

export interface DecisionsOutput {
    decisions: DecisionExtraction[]
}

export interface PromptBuildInput {
    segments: TranscriptSegment[]
}
