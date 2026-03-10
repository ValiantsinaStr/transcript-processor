import type { ConversationModelWriter, StepContext, TranscriptSegment } from '@transcript-sdk/core'
import type { LlmGenerationRequest, LlmGenerationResponse, LlmProviderAdapter } from '../types.js'

export interface DebugStepContext extends StepContext {
    __summary: string[]
    __actions: Array<Record<string, unknown>>
    __decisions: Array<Record<string, unknown>>
}

export function makeContext(segments: TranscriptSegment[]): DebugStepContext {
    const summaries: string[] = []
    const actions: Array<Record<string, unknown>> = []
    const decisions: Array<Record<string, unknown>> = []

    const model: ConversationModelWriter = {
        setSummary(value: string): void {
            summaries.push(value)
        },
        addAction(item): void {
            actions.push(item as unknown as Record<string, unknown>)
        },
        addDecision(item): void {
            decisions.push(item as unknown as Record<string, unknown>)
        },
        addTopic(): void { },
        markStepSuccess(): void { },
        markStepFailed(): void { },
    }

    const ctx: StepContext = {
        chunkIndex: 0,
        totalChunks: 1,
        segments,
        model,
        output: undefined,
        state: {},
        pipelineState: {},
    }

    return Object.assign(ctx, {
        __summary: summaries,
        __actions: actions,
        __decisions: decisions,
    }) as DebugStepContext
}

export class MockAdapter implements LlmProviderAdapter {
    public calls: LlmGenerationRequest[] = []

    constructor(private readonly impl: (request: LlmGenerationRequest) => Promise<LlmGenerationResponse>) { }

    async generate(request: LlmGenerationRequest): Promise<LlmGenerationResponse> {
        this.calls.push(request)
        return this.impl(request)
    }
}
