import { describe, expect, it } from 'vitest'
import { ExtractActionsLlmStep } from '../extract-actions-llm.js'
import { makeContext, MockAdapter } from './test-helpers.js'

describe('ExtractActionsLlmStep', () => {
    it('adds extracted actions to model', async () => {
        const adapter = new MockAdapter(async () => ({
            text: JSON.stringify({
                actions: [
                    { text: 'Prepare release notes', assignee: 'Ivan', status: 'open' },
                    { text: 'Close old tickets', status: 'done' },
                ],
            }),
            provider: 'mock',
        }))

        const step = new ExtractActionsLlmStep(adapter)
        const ctx = makeContext([{ id: 's1', text: 'Ivan will prepare release notes.' }])

        await step.execute(ctx, async () => { })

        expect(ctx.__actions.length).toBe(2)
        expect(ctx.__actions[0]?.text).toBe('Prepare release notes')
        expect(ctx.__actions[0]?.assignee).toBe('Ivan')
        expect(ctx.__actions[1]?.status).toBe('done')
    })
})
