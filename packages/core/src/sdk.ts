import type { IStep, IPiiDetector, RawTranscript, SDKConfig, ConversationJSON } from './types.js'
import { PipelineConfigError } from './types.js'
import { PluginRegistry } from './plugin-registry.js'
import { PipelineEngine, type PipelineRunOptions } from './pipeline-engine.js'
import { loadConfig, buildConfig } from './config/loader.js'
import { ConversationModel } from './conversation-model.js'
import { Logger } from './logger.js'

export interface SDKInitOptions {
  /** Path to pipeline.yaml. Defaults to ./pipeline.yaml in cwd. */
  configPath?: string
  /** Pass config directly (skips YAML file loading) */
  config?: Partial<SDKConfig>
  /** Optional destination for NDJSON logs. Defaults to process.stderr. */
  logDestination?: NodeJS.WritableStream
}

export class SDK {
  private readonly registry = new PluginRegistry()
  private config: SDKConfig | null = null
  private engine: PipelineEngine | null = null
  private logDestination: NodeJS.WritableStream = process.stderr

  // ─── Fluent registration ───────────────────────────────────────────────────

  register(name: string, step: IStep): this {
    this.registry.registerStep(name, step)
    return this
  }

  registerDetector(name: string, detector: IPiiDetector): this {
    this.registry.registerDetector(name, detector)
    return this
  }

  // ─── Config ────────────────────────────────────────────────────────────────

  configure(options?: SDKInitOptions): this {
    if (options?.logDestination) {
      this.logDestination = options.logDestination
    }

    if (options?.config) {
      this.config = buildConfig(options.config)
    } else {
      this.config = loadConfig(options?.configPath)
    }

    // Config or destination changes should be reflected on next process() call.
    this.engine = null
    return this
  }

  // ─── Process ───────────────────────────────────────────────────────────────

  async process(
    transcript: RawTranscript | string,
    options?: PipelineRunOptions & { configPath?: string },
  ): Promise<ConversationJSON | ConversationModel> {
    const raw: RawTranscript =
      typeof transcript === 'string' ? { text: transcript } : transcript

    if (!this.config) {
      // Auto-load config on first process() call
      try {
        this.config = loadConfig(options?.configPath)
      } catch (err) {
        throw err instanceof PipelineConfigError ? err : new PipelineConfigError(String(err))
      }
    }

    // Validate that all referenced plugins are registered
    this.validateRegistrations(this.config)

    if (!this.engine) {
      this.engine = new PipelineEngine(
        this.config,
        this.registry,
        new Logger(this.config.logging.level, this.logDestination),
      )
    }

    return this.engine.run(raw, options)
  }

  // ─── Validation ────────────────────────────────────────────────────────────

  private validateRegistrations(config: SDKConfig): void {
    const missing: string[] = []
    for (const step of config.pipeline.steps) {
      if (!this.registry.hasStep(step.plugin)) {
        missing.push(`'${step.plugin}' (used by step '${step.name}')`)
      }
    }
    if (missing.length > 0) {
      throw new PipelineConfigError(
        `The following plugins are referenced in config but not registered: ${missing.join(', ')}`,
      )
    }
  }
}
