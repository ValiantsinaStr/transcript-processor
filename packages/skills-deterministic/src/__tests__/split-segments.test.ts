import { describe, expect, it } from 'vitest'
import type { StepContext, ConversationModelWriter } from '@transcript-sdk/core'
import { SplitSegmentsStep } from '../split-segments.js'

function makeContext(chunkText: string): StepContext {
    return {
        chunkIndex: 0,
        totalChunks: 1,
        segments: [],
        model: {} as ConversationModelWriter,
        output: undefined,
        state: {
            'sdk.chunkText': chunkText,
        },
        pipelineState: {},
    }
}

describe('SplitSegmentsStep', () => {
    it('builds deterministic segment IDs and extracts speaker prefix', async () => {
        const step = new SplitSegmentsStep()
        const text = 'Alice: We should update docs. Bob: I can do that.'

        const ctxA = makeContext(text)
        await step.execute(ctxA, async () => { })

        const ctxB = makeContext(text)
        await step.execute(ctxB, async () => { })

        expect(ctxA.segments.length).toBeGreaterThan(0)
        expect(ctxA.segments[0]?.speakerId).toBe('Alice')
        expect(ctxA.segments.map((segment) => segment.id)).toEqual(
            ctxB.segments.map((segment) => segment.id),
        )
    })
})
