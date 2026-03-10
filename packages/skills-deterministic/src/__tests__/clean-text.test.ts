import { describe, expect, it } from 'vitest'
import type { StepContext, ConversationModelWriter } from '@transcript-sdk/core'
import { CleanTextStep } from '../clean-text.js'

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

describe('CleanTextStep', () => {
    it('removes timestamps, filler words, and collapses whitespace', async () => {
        const step = new CleanTextStep()
        const ctx = makeContext(' [00:00:05] Alice: um   hello   uh there 10:03:22 ')

        await step.execute(ctx, async () => { })

        expect(ctx.state['skillsDeterministic.cleanedText']).toBe('Alice: hello there')
    })
})
