import { describe, it, expect } from 'vitest'
import { SDK } from '../sdk.js'
import type { IStep, StepContext } from '../types.js'

const config = {
  schemaVersion: '1.0.0',
  pipeline: {
    steps: [
      { name: 'parse', plugin: 'test-parser' },
      { name: 'summarize', plugin: 'test-summarizer' },
    ],
  },
  privacy: { piiRedaction: false, piiDetectorPlugin: null, replacements: { email: '[Email]', phone: '[Phone]', name: '[Person]' } },
}

const parserStep: IStep = {
  name: 'test-parser',
  version: '1.0.0',
  async execute(ctx: StepContext, next) {
    ctx.segments = [{ id: 's1', text: ctx.state['sdk.chunkText'] as string ?? '' }]
    await next()
  },
}

const summarizerStep: IStep = {
  name: 'test-summarizer',
  version: '1.0.0',
  async execute(ctx: StepContext, next) {
    ctx.model.setSummary(`Processed: ${ctx.segments.length} segment(s)`)
    await next()
  },
}

function makeSdk() {
  return new SDK()
    .register('test-parser', parserStep)
    .register('test-summarizer', summarizerStep)
    .configure({ config })
}

describe('DX-02: Language-agnostic core', () => {
  it('processes English-only transcript without errors', async () => {
    const result = await makeSdk().process(
      'Alice opened the meeting. Bob agreed to update the docs. Carol will follow up.',
    ) as { summary: string }
    expect(result.summary).toContain('segment')
  })

  it('processes Russian-only transcript without errors', async () => {
    const result = await makeSdk().process(
      'Алиса открыла встречу. Боб согласился обновить документацию. Карол выполнит задачу.',
    ) as { summary: string }
    expect(result.summary).toContain('segment')
  })

  it('processes mixed Russian/English transcript without errors', async () => {
    const result = await makeSdk().process(
      'Alice opened the meeting. Боб предложил перенести дедлайн. The team agreed.',
    ) as { summary: string }
    expect(result.summary).toContain('segment')
  })

  it('core has no language-specific logic — non-ASCII text passes through unchanged', async () => {
    let receivedText = ''
    const sdk = new SDK()
      .register('test-parser', {
        name: 'test-parser',
        version: '1.0.0',
        async execute(ctx, next) {
          receivedText = ctx.state['sdk.chunkText'] as string ?? ''
          ctx.segments = [{ id: 's1', text: receivedText }]
          await next()
        },
      })
      .configure({
        config: {
          schemaVersion: '1.0.0',
          pipeline: { steps: [{ name: 'parse', plugin: 'test-parser' }] },
          privacy: config.privacy,
        },
      })

    const input = 'Команда обсудила план на Q2. Все согласны.'
    await sdk.process(input)
    expect(receivedText).toContain('Q2')
    expect(receivedText).toMatch(/[а-яА-Я]/)
  })
})
