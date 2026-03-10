import type { IStep, StepContext, SDKConfig, RawTranscript, ConversationJSON } from './types.js'
import { ConversationModel } from './conversation-model.js'
import { PluginRegistry } from './plugin-registry.js'
import { Logger } from './logger.js'
import { chunkText } from './chunker.js'
import { coreRedact } from './pii/core-redactor.js'
import { mergeChunkModels } from './merge.js'

export interface PipelineRunOptions {
  mode?: 'simple' | 'model'
  validation?: boolean
  context?: Record<string, unknown>
}

interface ResolvedStep {
  /** Name declared in pipeline.yaml — used for status tracking */
  configName: string
  step: IStep
}

export class PipelineEngine {
  private readonly logger: Logger

  constructor(
    private readonly config: SDKConfig,
    private readonly registry: PluginRegistry,
    logger?: Logger,
  ) {
    this.logger = logger ?? new Logger(config.logging.level)
  }

  async run(
    transcript: RawTranscript,
    options?: PipelineRunOptions,
  ): Promise<ConversationJSON | ConversationModel> {
    const mode = options?.mode ?? this.config.output.mode
    const validation = options?.validation ?? true
    const meetingContext = options?.context

    // 1. PII Redaction — full transcript before chunking
    const redactedText = this.redact(transcript.text)

    // 2. Chunking
    const chunks = chunkText(redactedText, this.config.chunking)
    const totalChunks = chunks.length
    this.logger.debug({ event: 'pipeline.start', totalChunks })

    // 3. Resolve step chain once (steps are stateless)
    const steps: ResolvedStep[] = this.config.pipeline.steps.map((sc) => ({
      configName: sc.name,
      step: this.registry.resolveStep(sc.plugin),
    }))

    // 4. Shared state — same object reference for every chunk in this run
    const pipelineState: Record<string, unknown> = {}

    // 5. Run step chain per chunk — parallel up to maxParallel
    const { maxParallel } = this.config.chunking
    const chunkModels: ConversationModel[] = new Array(totalChunks)

    for (let batchStart = 0; batchStart < totalChunks; batchStart += maxParallel) {
      const batch = chunks.slice(batchStart, batchStart + maxParallel)
      const results = await Promise.all(
        batch.map(async (chunk) => {
          const model = new ConversationModel()
          const ctx = this.makeContext(
            model,
            chunk.index,
            totalChunks,
            pipelineState,
            meetingContext,
          )
          ctx.state['sdk.chunkText'] = chunk.text
          await this.runChain(steps, ctx, validation)
          return { index: chunk.index, model }
        }),
      )
      for (const { index, model } of results) {
        chunkModels[index] = model
      }
    }

    // 5. Merge
    const { model: finalModel, degraded } = mergeChunkModels(
      chunkModels as ConversationModel[],
      this.config.pipeline.steps,
    )
    if (degraded) finalModel._setDegraded()
    this.logger.debug({
      event: 'merge.complete',
      totalChunks,
      stepCount: this.config.pipeline.steps.length,
      degraded,
    })

    const outputPreview = finalModel.toJSON()
    this.logger.debug({
      event: 'output.emitted',
      mode,
      degraded: outputPreview.degraded,
      hasSummary: outputPreview.summary !== null && outputPreview.summary.length > 0,
      actionsCount: outputPreview.actions.length,
      decisionsCount: outputPreview.decisions.length,
      topicsCount: outputPreview.topics.length,
    })

    this.logger.info({ event: 'pipeline.complete', totalChunks, degraded })

    if (mode === 'model') return finalModel
    return outputPreview
  }

  private redact(text: string): string {
    const { privacy } = this.config
    if (!privacy.piiRedaction) return text
    let { redactedText } = coreRedact(text, privacy.replacements)
    if (privacy.piiDetectorPlugin) {
      const detector = this.registry.resolveDetector(privacy.piiDetectorPlugin)
      redactedText = detector.redact(redactedText).redactedText
    }
    return redactedText
  }

  private makeContext(
    model: ConversationModel,
    chunkIndex: number,
    totalChunks: number,
    pipelineState: Record<string, unknown>,
    meetingContext: Record<string, unknown> | undefined,
  ): StepContext {
    const state: Record<string, unknown> = {}
    if (meetingContext !== undefined) {
      state['sdk.meetingContext'] = meetingContext
    }

    return {
      chunkIndex,
      totalChunks,
      segments: [],
      model: model.asWriter(),
      output: undefined,
      state,
      pipelineState,
    }
  }

  private async runChain(
    steps: ResolvedStep[],
    ctx: StepContext,
    validation: boolean,
  ): Promise<void> {
    let i = 0

    const next = async (): Promise<void> => {
      if (i >= steps.length) return
      const { configName, step } = steps[i++]!
      const startMs = Date.now()

      if (validation && step.inputSchema) {
        const valid = this.validateSchema(ctx, step.inputSchema)
        if (!valid.ok) {
          this.logger.warn({
            event: 'step.skipped',
            step: configName,
            reason: 'schema_validation_failed',
            errors: valid.errors,
          })
          ctx.model.markStepFailed(
            configName,
            new Error(`Schema validation failed: ${valid.errors.join(', ')}`),
          )
          await next()
          return
        }
      }

      try {
        await step.execute(ctx, next)
        const durationMs = Date.now() - startMs
        ctx.model.markStepSuccess(configName, durationMs)
        this.logger.info({
          event: 'step.complete',
          step: configName,
          status: 'success',
          durationMs,
          chunkIndex: ctx.chunkIndex,
          inputSegments: ctx.segments.length,
        })
      } catch (err) {
        const durationMs = Date.now() - startMs
        const error = err instanceof Error ? err : new Error(String(err))
        ctx.model.markStepFailed(configName, error)
        this.logger.warn({
          event: 'step.failed',
          step: configName,
          status: 'failed',
          durationMs,
          error: this.sanitizeErrorForLog(error, ctx.state['sdk.chunkText']),
        })
        await next()
      }
    }

    await next()
  }

  private validateSchema(
    ctx: StepContext,
    schema: Record<string, unknown>,
  ): { ok: true } | { ok: false; errors: string[] } {
    const errors = this.validateValueAgainstSchema(ctx.segments, schema, 'segments')
    return errors.length === 0 ? { ok: true } : { ok: false, errors }
  }

  private validateValueAgainstSchema(
    value: unknown,
    schema: Record<string, unknown>,
    path: string,
  ): string[] {
    const errors: string[] = []
    const expectedType = schema['type']
    if (typeof expectedType === 'string') {
      const actualType = this.getValueType(value)
      if (actualType !== expectedType) {
        errors.push(`${path}: expected ${expectedType}, got ${actualType}`)
        return errors
      }
    }

    if (Array.isArray(value)) {
      const itemSchema = schema['items']
      if (itemSchema && typeof itemSchema === 'object' && !Array.isArray(itemSchema)) {
        value.forEach((item, index) => {
          errors.push(
            ...this.validateValueAgainstSchema(
              item,
              itemSchema as Record<string, unknown>,
              `${path}[${index}]`,
            ),
          )
        })
      }
      return errors
    }

    if (this.isPlainObject(value)) {
      const objectValue = value as Record<string, unknown>

      const required = schema['required']
      if (Array.isArray(required)) {
        for (const field of required) {
          if (typeof field !== 'string') continue
          if (!(field in objectValue)) {
            const expectedFieldType = this.getExpectedPropertyType(schema, field)
            if (expectedFieldType) {
              errors.push(
                `${path}.${field}: expected ${expectedFieldType}, got undefined (required)`,
              )
            } else {
              errors.push(`${path}.${field}: expected required field, got undefined`)
            }
          }
        }
      }

      const properties = schema['properties']
      if (properties && this.isPlainObject(properties)) {
        for (const [key, propertySchema] of Object.entries(properties)) {
          if (!this.isPlainObject(propertySchema)) continue
          if (!(key in objectValue)) continue
          errors.push(
            ...this.validateValueAgainstSchema(
              objectValue[key],
              propertySchema,
              `${path}.${key}`,
            ),
          )
        }
      }
    }

    return errors
  }

  private getExpectedPropertyType(schema: Record<string, unknown>, key: string): string | null {
    const properties = schema['properties']
    if (!this.isPlainObject(properties)) return null
    const propSchema = properties[key]
    if (!this.isPlainObject(propSchema)) return null
    const propType = propSchema['type']
    return typeof propType === 'string' ? propType : null
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private getValueType(value: unknown): string {
    if (Array.isArray(value)) return 'array'
    if (value === null) return 'null'
    return typeof value
  }

  private sanitizeErrorForLog(error: Error, chunkText: unknown): string {
    // Never emit raw transcript fragments in structured logs.
    let message = `${error.name}: ${error.message}`
    if (typeof chunkText === 'string' && chunkText.length > 0 && message.includes(chunkText)) {
      message = message.split(chunkText).join('[REDACTED_TRANSCRIPT]')
    }
    return message
  }
}
