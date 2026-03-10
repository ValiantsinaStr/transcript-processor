import {
    createLocalHttpAdapter,
    SummarizeLlmStep,
    ExtractActionsLlmStep,
    ExtractDecisionsLlmStep,
} from './dist/index.js'

const adapter = createLocalHttpAdapter({
    endpoint: 'http://127.0.0.1:11434/api/generate',
    model: 'qwen3.5:0.8b',
    bodyFormat: 'prompt',
})

const out = { summary: null, actions: [], decisions: [] }

const ctx = {
    chunkIndex: 0,
    totalChunks: 1,
    segments: [
        { id: 's1', speakerId: 'Alice', text: 'We should ship the beta on Friday.' },
        { id: 's2', speakerId: 'Bob', text: 'Ivan will prepare the release notes by Thursday.' },
        { id: 's3', speakerId: 'Team', text: 'Decision: use PostgreSQL as primary database.' },
    ],
    model: {
        setSummary(v) {
            out.summary = v
        },
        addAction(v) {
            out.actions.push(v)
        },
        addDecision(v) {
            out.decisions.push(v)
        },
        addTopic() { },
        markStepSuccess() { },
        markStepFailed() { },
    },
    output: undefined,
    state: {},
    pipelineState: {},
}

async function main() {
    const summarize = new SummarizeLlmStep(adapter, {
        timeoutMs: 120000,
        retries: 0,
        retryDelayMs: 200,
    })
    const actions = new ExtractActionsLlmStep(adapter, {
        timeoutMs: 120000,
        retries: 0,
        retryDelayMs: 200,
    })
    const decisions = new ExtractDecisionsLlmStep(adapter, {
        timeoutMs: 120000,
        retries: 0,
        retryDelayMs: 200,
    })

    await summarize.execute(ctx, async () => { })
    await actions.execute(ctx, async () => { })
    await decisions.execute(ctx, async () => { })

    console.log(JSON.stringify(out, null, 2))
}

main().catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    process.exit(1)
})
