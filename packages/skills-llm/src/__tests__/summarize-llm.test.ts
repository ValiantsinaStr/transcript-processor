import { describe, expect, it } from 'vitest'
import { SummarizeLlmStep } from '../summarize-llm.js'
import { makeContext, MockAdapter } from './test-helpers.js'

describe('SummarizeLlmStep', () => {
    it('consumes ctx.segments and writes summary to model', async () => {
        const adapter = new MockAdapter(async () => ({
            text: JSON.stringify({ summary: 'Team agreed to ship on Friday.' }),
            provider: 'mock',
        }))

        const step = new SummarizeLlmStep(adapter)
        const ctx = makeContext([{ id: 's1', text: 'We can ship Friday.', speakerId: 'Alice' }])

        await step.execute(ctx, async () => { })

        expect(adapter.calls.length).toBe(1)
        expect(adapter.calls[0]?.prompt).toContain('We can ship Friday.')
        expect(ctx.__summary[0]).toBe('Team agreed to ship on Friday.')
    })

    it('retries on failure and then succeeds', async () => {
        let attempt = 0
        const adapter = new MockAdapter(async () => {
            attempt += 1
            if (attempt === 1) throw new Error('temporary')
            return {
                text: JSON.stringify({ summary: 'Recovered summary' }),
                provider: 'mock',
            }
        })

        const step = new SummarizeLlmStep(adapter, { retries: 1, retryDelayMs: 0 })
        const ctx = makeContext([{ id: 's1', text: 'Status update.' }])

        await step.execute(ctx, async () => { })

        expect(adapter.calls.length).toBe(2)
        expect(ctx.__summary[0]).toBe('Recovered summary')
    })
})
