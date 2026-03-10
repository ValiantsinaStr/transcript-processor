import { describe, it, expect, vi } from 'vitest'
import { SDK } from '../sdk.js'
import { PipelineConfigError } from '../types.js'
import type { IStep, StepContext } from '../types.js'

// Minimal in-memory config (no YAML file needed)
const minimalConfig = {
  schemaVersion: '1.0.0',
  pipeline: {
    steps: [{ name: 'parse', plugin: 'test-parser' }],
  },
}

const makeParserStep = (onExecute?: (ctx: StepContext) => void): IStep => ({
  name: 'test-parser',
  version: '1.0.0',
  async execute(ctx, next) {
    ctx.segments = [{ id: 's1', text: 'Hello world' }]
    onExecute?.(ctx)
    await next()
  },
})

describe('SDK', () => {
  it('executes a step chain and returns ConversationJSON by default', async () => {
    const sdk = new SDK()
    sdk.register('test-parser', makeParserStep())
    sdk.configure({ config: minimalConfig })

    const result = await sdk.process('Hello world')

    expect(result).toMatchObject({
      summary: null,
      actions: [],
      decisions: [],
      degraded: false,
    })
  })

  it('returns ConversationModel when mode=model', async () => {
    const { ConversationModel } = await import('../conversation-model.js')
    const sdk = new SDK()
    sdk.register('test-parser', makeParserStep())
    sdk.configure({ config: minimalConfig })

    const result = await sdk.process('Hello', { mode: 'model' })
    expect(result).toBeInstanceOf(ConversationModel)
  })

  it('simple and model modes return identical data content', async () => {
    const { ConversationModel } = await import('../conversation-model.js')
    const sdk = new SDK()
    sdk
      .register('test-parser', makeParserStep())
      .register('test-summarizer', {
        name: 'test-summarizer',
        version: '1.0.0',
        async execute(ctx, next) {
          ctx.model.setSummary('Summary from step')
          ctx.model.addAction({ id: 'a1', text: 'Do thing', status: 'open' })
          await next()
        },
      })
      .configure({
        config: {
          schemaVersion: '1.0.0',
          pipeline: {
            steps: [
              { name: 'parse', plugin: 'test-parser' },
              { name: 'summarize', plugin: 'test-summarizer' },
            ],
          },
        },
      })

    const simple = await sdk.process('hello world') as Record<string, unknown>
    const model = await sdk.process('hello world', { mode: 'model' })
    const modelJson = (model as ConversationModel).toJSON()

    expect(model).toBeInstanceOf(ConversationModel)
    expect(simple).toMatchObject({
      summary: modelJson.summary,
      actions: modelJson.actions,
      decisions: modelJson.decisions,
      topics: modelJson.topics,
      degraded: modelJson.degraded,
    })

    const simpleStatuses = simple['stepStatuses'] as Record<string, { status: string; durationMs?: number }>
    const modelStatuses = modelJson.stepStatuses
    expect(Object.keys(simpleStatuses).sort()).toEqual(Object.keys(modelStatuses).sort())
    for (const stepName of Object.keys(modelStatuses)) {
      expect(simpleStatuses[stepName]!.status).toBe(modelStatuses[stepName]!.status)
      expect(typeof simpleStatuses[stepName]!.durationMs).toBe('number')
      expect(typeof modelStatuses[stepName]!.durationMs).toBe('number')
    }
  })

  it('step can populate model via ctx.model', async () => {
    const processorConfig = {
      schemaVersion: '1.0.0',
      pipeline: {
        steps: [
          { name: 'parse', plugin: 'test-parser' },
          { name: 'summarize', plugin: 'test-summarizer' },
        ],
      },
    }

    const sdk = new SDK()
    sdk.register('test-parser', makeParserStep())
    sdk.register('test-summarizer', {
      name: 'test-summarizer',
      version: '1.0.0',
      async execute(ctx, next) {
        ctx.model.setSummary('Test summary')
        await next()
      },
    })
    sdk.configure({ config: processorConfig })

    const result = await sdk.process('hello') as { summary: string }
    expect(result.summary).toBe('Test summary')
  })

  it('pipeline continues when a step throws', async () => {
    const twoStepConfig = {
      schemaVersion: '1.0.0',
      pipeline: {
        steps: [
          { name: 'failing', plugin: 'failing-step' },
          { name: 'summarize', plugin: 'ok-step' },
        ],
      },
    }

    const sdk = new SDK()
    sdk.register('failing-step', {
      name: 'failing-step',
      version: '1.0.0',
      async execute(_ctx, _next) {
        throw new Error('step exploded')
      },
    })
    sdk.register('ok-step', {
      name: 'ok-step',
      version: '1.0.0',
      async execute(ctx, next) {
        ctx.model.setSummary('recovered')
        await next()
      },
    })
    sdk.configure({ config: twoStepConfig })

    const result = await sdk.process('hello') as { summary: string; stepStatuses: Record<string, unknown> }
    expect(result.summary).toBe('recovered')
    expect(result.stepStatuses['failing']).toMatchObject({ status: 'failed' })
    expect(result.stepStatuses['summarize']).toMatchObject({ status: 'success' })
  })

  it('throws PipelineConfigError when plugin not registered', async () => {
    const sdk = new SDK()
    sdk.configure({ config: minimalConfig })
    await expect(sdk.process('hello')).rejects.toThrowError(PipelineConfigError)
  })

  it('throws PipelineConfigError on invalid config (missing steps)', () => {
    const sdk = new SDK()
    expect(() =>
      sdk.configure({
        config: { schemaVersion: '1.0.0', pipeline: { steps: [] } } as never,
      }),
    ).toThrowError(PipelineConfigError)
  })

  it('pipelineState is shared across chunks within one run', async () => {
    const sdk = new SDK()
    sdk.register('tracker', {
      name: 'tracker',
      version: '1.0.0',
      async execute(ctx, next) {
        const seen = (ctx.pipelineState['tracker.chunks'] as number[]) ?? []
        seen.push(ctx.chunkIndex)
        ctx.pipelineState['tracker.chunks'] = seen
        // Last chunk writes accumulated count to summary
        if (ctx.chunkIndex === ctx.totalChunks - 1) {
          ctx.model.setSummary(`chunks:${seen.length}`)
        }
        await next()
      },
    })
    sdk.configure({
      config: {
        schemaVersion: '1.0.0',
        // Small chunkSize forces 3 chunks from 9-word input
        chunking: { chunkSize: 3, overlap: 0, maxParallel: 1, memoryLimitMb: 512 },
        pipeline: { steps: [{ name: 'track', plugin: 'tracker' }] },
      },
    })

    // 3 sentences × 3 words → chunkSize:3 produces 3 separate chunks
    const result = await sdk.process(
      'one two three. four five six. seven eight nine.',
    ) as { summary: string }
    expect(result.summary).toBe('chunks:3')
  })

  it('pipelineState is isolated between separate sdk.process() calls', async () => {
    const sdk = new SDK()
    sdk.register('tracker', {
      name: 'tracker',
      version: '1.0.0',
      async execute(ctx, next) {
        ctx.pipelineState['tracker.runId'] = ctx.pipelineState['tracker.runId'] ?? Math.random()
        ctx.model.setSummary(String(ctx.pipelineState['tracker.runId']))
        await next()
      },
    })
    sdk.configure({
      config: {
        schemaVersion: '1.0.0',
        pipeline: { steps: [{ name: 'track', plugin: 'tracker' }] },
      },
    })

    const r1 = await sdk.process('hello') as { summary: string }
    const r2 = await sdk.process('world') as { summary: string }
    expect(r1.summary).not.toBe(r2.summary)
  })

  it('500 concurrent calls produce independent results', async () => {
    const sdk = new SDK()
    let callCount = 0
    sdk.register('test-parser', {
      name: 'test-parser',
      version: '1.0.0',
      async execute(ctx, next) {
        const n = ++callCount
        await new Promise((r) => setTimeout(r, Math.random() * 5))
        ctx.model.setSummary(`Summary #${n}`)
        await next()
      },
    })
    sdk.configure({ config: minimalConfig })

    const results = await Promise.all(
      Array.from({ length: 500 }, () => sdk.process('text')) as Promise<{ summary: string }>[],
    )

    const summaries = new Set(results.map((r) => r.summary))
    expect(summaries.size).toBe(500)
  })

  it('writes logs to configured destination stream', async () => {
    const lines: string[] = []
    const sink = {
      write(chunk: unknown): boolean {
        lines.push(String(chunk))
        return true
      },
    } as unknown as NodeJS.WritableStream

    const sdk = new SDK()
    sdk
      .register('test-parser', makeParserStep())
      .configure({
        config: {
          schemaVersion: '1.0.0',
          logging: { level: 'debug' },
          pipeline: { steps: [{ name: 'parse', plugin: 'test-parser' }] },
        },
        logDestination: sink,
      })

    await sdk.process('hello world')
    const logs = lines.join('')
    const entries = logs
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('{') && line.endsWith('}'))
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    const stepComplete = entries.find((entry) => entry['event'] === 'step.complete')
    expect(stepComplete).toBeTruthy()
    expect(stepComplete).toMatchObject({
      step: 'parse',
      status: 'success',
      chunkIndex: 0,
      inputSegments: 1,
    })
    expect(typeof stepComplete?.['timestamp']).toBe('string')
    expect(typeof stepComplete?.['durationMs']).toBe('number')

    expect(logs).toContain('"event":"pipeline.start"')
    expect(logs).toContain('"event":"step.complete"')
    expect(logs).toContain('"event":"pipeline.complete"')
  })

  it('registering plugin during in-flight run does not affect that run', async () => {
    const sdk = new SDK()
    sdk
      .register('slow-step', {
        name: 'slow-step',
        version: '1.0.0',
        async execute(ctx, next) {
          await new Promise((resolve) => setTimeout(resolve, 25))
          ctx.model.setSummary('stable-result')
          await next()
        },
      })
      .configure({
        config: {
          schemaVersion: '1.0.0',
          pipeline: { steps: [{ name: 'slow', plugin: 'slow-step' }] },
        },
      })

    const inFlight = sdk.process('hello') as Promise<{ summary: string }>
    await new Promise((resolve) => setTimeout(resolve, 5))

    sdk.register('new-plugin', {
      name: 'new-plugin',
      version: '1.0.0',
      async execute(_ctx, next) {
        await next()
      },
    })

    const result = await inFlight
    expect(result.summary).toBe('stable-result')
  })

  it('never logs raw transcript data across pipeline lifecycle events', async () => {
    const sensitiveText = 'Alice email is alice@example.com and phone is +1-202-555-0111'
    const sensitiveMetadata = 'PROJECT-ORION-CONFIDENTIAL'
    const logLines: string[] = []
    const writeSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(((chunk: unknown) => {
        logLines.push(String(chunk))
        return true
      }) as never)

    try {
      const sdk = new SDK()
      sdk
        .register('failing-step', {
          name: 'failing-step',
          version: '1.0.0',
          async execute(ctx, _next) {
            throw new Error(`failure with transcript: ${String(ctx.state['sdk.chunkText'] ?? '')}`)
          },
        })
        .register('ok-step', {
          name: 'ok-step',
          version: '1.0.0',
          async execute(ctx, next) {
            ctx.model.setSummary('still-completes')
            await next()
          },
        })
        .configure({
          config: {
            schemaVersion: '1.0.0',
            chunking: { chunkSize: 5, overlap: 0, maxParallel: 2, memoryLimitMb: 512 },
            privacy: {
              piiRedaction: false,
              piiDetectorPlugin: null,
              replacements: { email: '[Email]', phone: '[Phone]', name: '[Person]' },
            },
            logging: { level: 'debug' },
            pipeline: {
              steps: [
                { name: 'failing', plugin: 'failing-step' },
                { name: 'ok', plugin: 'ok-step' },
              ],
            },
          },
        })

      const result = await sdk.process({
        text: sensitiveText,
        metadata: { classification: sensitiveMetadata },
      }) as { summary: string }
      expect(result.summary).toBe('still-completes')

      const logs = logLines.join('')
      const events = logs
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('{') && line.endsWith('}'))
        .map((line) => JSON.parse(line) as { event?: string })
        .map((entry) => entry.event)

      expect(events).toContain('pipeline.start')
      expect(events).toContain('step.complete')
      expect(events).toContain('step.failed')
      expect(events).toContain('merge.complete')
      expect(events).toContain('output.emitted')
      expect(events).toContain('pipeline.complete')

      expect(logs).not.toContain(sensitiveText)
      expect(logs).not.toContain(sensitiveMetadata)
      expect(logs).toContain('[REDACTED_TRANSCRIPT]')
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('skips step on inputSchema validation failure and continues chain', async () => {
    let validatedStepRan = false

    const sdk = new SDK()
    sdk
      .register('parse-invalid', {
        name: 'parse-invalid',
        version: '1.0.0',
        async execute(ctx, next) {
          // Force invalid type for schema validation testing.
          ctx.segments = [{ id: 's1', text: 123 as unknown as string }]
          await next()
        },
      })
      .register('validated-step', {
        name: 'validated-step',
        version: '1.0.0',
        inputSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
            },
          },
        },
        async execute(_ctx, next) {
          validatedStepRan = true
          await next()
        },
      })
      .register('after-step', {
        name: 'after-step',
        version: '1.0.0',
        async execute(ctx, next) {
          ctx.model.setSummary('continued-after-validation-failure')
          await next()
        },
      })
      .configure({
        config: {
          schemaVersion: '1.0.0',
          pipeline: {
            steps: [
              { name: 'parse', plugin: 'parse-invalid' },
              { name: 'validate', plugin: 'validated-step' },
              { name: 'after', plugin: 'after-step' },
            ],
          },
        },
      })

    const result = await sdk.process('hello') as {
      summary: string
      stepStatuses: Record<string, { status: string; error?: string }>
    }

    expect(validatedStepRan).toBe(false)
    expect(result.summary).toBe('continued-after-validation-failure')
    expect(result.stepStatuses['validate']?.status).toBe('failed')
    expect(result.stepStatuses['after']?.status).toBe('success')
    expect(result.stepStatuses['validate']?.error).toContain('segments[0].text')
    expect(result.stepStatuses['validate']?.error).toContain('expected string, got number')
  })

  it('runs step when validation is disabled via process option', async () => {
    let validatedStepRan = false

    const sdk = new SDK()
    sdk
      .register('parse-invalid', {
        name: 'parse-invalid',
        version: '1.0.0',
        async execute(ctx, next) {
          ctx.segments = [{ id: 's1', text: 123 as unknown as string }]
          await next()
        },
      })
      .register('validated-step', {
        name: 'validated-step',
        version: '1.0.0',
        inputSchema: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
            },
          },
        },
        async execute(ctx, next) {
          validatedStepRan = true
          ctx.model.setSummary(`validator-ran:${ctx.segments.length}`)
          await next()
        },
      })
      .configure({
        config: {
          schemaVersion: '1.0.0',
          pipeline: {
            steps: [
              { name: 'parse', plugin: 'parse-invalid' },
              { name: 'validate', plugin: 'validated-step' },
            ],
          },
        },
      })

    const result = await sdk.process('hello', { validation: false }) as {
      summary: string
      stepStatuses: Record<string, { status: string }>
    }

    expect(validatedStepRan).toBe(true)
    expect(result.summary).toBe('validator-ran:1')
    expect(result.stepStatuses['validate']?.status).toBe('success')
  })

  it('passes optional meeting context to step state as sdk.meetingContext', async () => {
    const sdk = new SDK()
    sdk
      .register('ctx-reader', {
        name: 'ctx-reader',
        version: '1.0.0',
        async execute(ctx, next) {
          const meetingContext = ctx.state['sdk.meetingContext'] as Record<string, unknown>
          const title = String(meetingContext['title'] ?? '')
          const participants = Array.isArray(meetingContext['participants'])
            ? meetingContext['participants'].length
            : 0
          ctx.model.setSummary(`title:${title};participants:${participants}`)
          await next()
        },
      })
      .configure({
        config: {
          schemaVersion: '1.0.0',
          pipeline: { steps: [{ name: 'ctx', plugin: 'ctx-reader' }] },
        },
      })

    const result = await sdk.process('hello', {
      context: {
        title: 'Q1 planning',
        participants: ['Alice', 'Bob', 'Carol'],
        project: 'Phoenix',
      },
    }) as { summary: string }

    expect(result.summary).toBe('title:Q1 planning;participants:3')
  })

  it('applies zero built-in logic to meeting context fields', async () => {
    const sdk = new SDK()
    sdk
      .register('fixed-summary', {
        name: 'fixed-summary',
        version: '1.0.0',
        async execute(ctx, next) {
          ctx.model.setSummary('unchanged')
          await next()
        },
      })
      .configure({
        config: {
          schemaVersion: '1.0.0',
          pipeline: { steps: [{ name: 'fixed', plugin: 'fixed-summary' }] },
        },
      })

    const withoutContext = await sdk.process('hello') as { summary: string }
    const withContext = await sdk.process('hello', {
      context: {
        title: 'Ignored title',
        participants: ['x'],
      },
    }) as { summary: string }

    expect(withoutContext.summary).toBe('unchanged')
    expect(withContext.summary).toBe('unchanged')
  })
})
