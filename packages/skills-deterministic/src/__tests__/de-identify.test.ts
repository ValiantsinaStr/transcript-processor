import { describe, expect, it } from 'vitest'
import type { StepContext, ConversationModelWriter, TranscriptSegment } from '@transcript-sdk/core'
import { DeIdentifyStep } from '../de-identify.js'

function makeContext(segments: TranscriptSegment[], pipelineState: Record<string, unknown>): StepContext {
    return {
        chunkIndex: 0,
        totalChunks: 2,
        segments,
        model: {} as ConversationModelWriter,
        output: undefined,
        state: {},
        pipelineState,
    }
}

describe('DeIdentifyStep', () => {
    it('keeps speaker and name mapping consistent across executions in one run', async () => {
        const step = new DeIdentifyStep()
        const sharedPipelineState: Record<string, unknown> = {}

        const first = makeContext(
            [{ id: 's1', speakerId: 'Alice', text: 'Alice asked Bob to check this item.' }],
            sharedPipelineState,
        )
        await step.execute(first, async () => { })

        const second = makeContext(
            [{ id: 's2', speakerId: 'Alice', text: 'Alice followed up with Bob next day.' }],
            sharedPipelineState,
        )
        await step.execute(second, async () => { })

        expect(first.segments[0]?.speakerId).toBe('PARTICIPANT_01')
        expect(second.segments[0]?.speakerId).toBe('PARTICIPANT_01')
        expect(first.segments[0]?.text).toContain('PARTICIPANT_01')
        expect(first.segments[0]?.text).toContain('PARTICIPANT_02')
        expect(second.segments[0]?.text).toContain('PARTICIPANT_01')
        expect(second.segments[0]?.text).toContain('PARTICIPANT_02')
    })
})
