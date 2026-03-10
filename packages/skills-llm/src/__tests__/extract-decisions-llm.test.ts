import { describe, expect, it } from 'vitest'
import { ExtractDecisionsLlmStep } from '../extract-decisions-llm.js'
import { makeContext, MockAdapter } from './test-helpers.js'

describe('ExtractDecisionsLlmStep', () => {
    it('adds extracted decisions to model', async () => {
        const adapter = new MockAdapter(async () => ({
            text: JSON.stringify({
                decisions: [
                    { text: 'Adopt PostgreSQL', madeBy: 'Team' },
                ],
            }),
            provider: 'mock',
        }))

        const step = new ExtractDecisionsLlmStep(adapter)
        const ctx = makeContext([{ id: 's1', text: 'We choose PostgreSQL as main DB.' }])

        await step.execute(ctx, async () => { })

        expect(ctx.__decisions.length).toBe(1)
        expect(ctx.__decisions[0]?.text).toBe('Adopt PostgreSQL')
        expect(ctx.__decisions[0]?.madeBy).toBe('Team')
    })
})
