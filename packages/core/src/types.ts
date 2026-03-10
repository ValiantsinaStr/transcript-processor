// ─── Primitive data types ─────────────────────────────────────────────────────

export interface RawTranscript {
  text: string
  metadata?: Record<string, unknown>
}

export interface TranscriptSegment {
  id: string
  text: string
  speakerId?: string
  startMs?: number
  endMs?: number
  language?: string
}

export type FormatterOutput = string | Record<string, unknown>

// ─── Conversation model types ──────────────────────────────────────────────────

export interface ActionItem {
  id: string
  text: string
  assignee?: string
  dueDate?: string
  status: 'open' | 'done'
  sourceSegmentId?: string
}

export interface Decision {
  id: string
  text: string
  madeBy?: string
  sourceSegmentId?: string
}

export interface Topic {
  id: string
  label: string
  relevance: number // 0.0 – 1.0
}

export interface ActionFilter {
  status?: 'open' | 'done'
  assignee?: string
}

export type StepStatus =
  | { status: 'success'; durationMs: number }
  | { status: 'failed'; durationMs: number; error: string }
  | { status: 'skipped'; reason: string }

export interface ConversationJSON {
  summary: string | null
  actions: ActionItem[]
  decisions: Decision[]
  topics: Topic[]
  stepStatuses: Record<string, StepStatus>
  degraded: boolean
}

// ─── ConversationModelWriter ───────────────────────────────────────────────────

export interface ConversationModelWriter {
  setSummary(value: string): void
  addAction(item: ActionItem): void
  addDecision(item: Decision): void
  addTopic(item: Topic): void
  markStepSuccess(stepName: string, durationMs: number): void
  markStepFailed(stepName: string, error: Error): void
}

// ─── IStep — universal plugin contract ────────────────────────────────────────

/** JSON Schema subset sufficient for runtime validation in v1 */
export type JSONSchema = Record<string, unknown>

export interface StepContext {
  readonly chunkIndex: number
  readonly totalChunks: number
  segments: TranscriptSegment[]
  model: ConversationModelWriter
  output: FormatterOutput | undefined
  /** Per-chunk state. Isolated: each chunk gets its own copy. Namespace keys as 'pluginName.key' */
  state: Record<string, unknown>
  /**
   * Shared mutable state across ALL chunks in one pipeline run.
   * Same object reference for every chunk — enables cross-chunk consistency:
   * speaker identity maps, seen-entity registries, topic accumulators.
   * Namespace keys as 'pluginName.key'.
   * Note: chunks within one parallel batch execute concurrently — avoid
   * non-atomic read-modify-write patterns without a lock.
   */
  pipelineState: Record<string, unknown>
}

export interface IStep {
  readonly name: string
  readonly version: string
  readonly inputSchema?: JSONSchema
  execute(ctx: StepContext, next: () => Promise<void>): Promise<void>
}

// ─── IPiiDetector — pre-stage only, not an IStep ──────────────────────────────

export interface PiiMatch {
  type: 'email' | 'phone' | 'name' | 'financial' | 'custom'
  start: number
  end: number
  replacement: string
}

export interface PiiRedactionResult {
  redactedText: string
  matches: PiiMatch[]
}

export interface IPiiDetector {
  readonly version: string
  /** Detect and replace PII in one atomic operation */
  redact(text: string): PiiRedactionResult
}

// ─── Configuration ─────────────────────────────────────────────────────────────

export type MergeStrategy =
  | 'concat'
  | 'deduplicate'
  | 'summarize-of-summaries'
  | 'semantic'
  | 'cluster'

export interface StepConfig {
  name: string
  plugin: string
  merge?: MergeStrategy | undefined
}

export interface ChunkingConfig {
  chunkSize: number
  overlap: number
  maxParallel: number
  memoryLimitMb: number
}

export interface PrivacyConfig {
  piiRedaction: boolean
  piiDetectorPlugin: string | null
  replacements: {
    email: string
    phone: string
    name: string
  }
}

export interface SDKConfig {
  schemaVersion: string
  chunking: ChunkingConfig
  privacy: PrivacyConfig
  pipeline: {
    steps: StepConfig[]
  }
  output: {
    mode: 'simple' | 'model'
  }
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
  }
}

// ─── Errors ────────────────────────────────────────────────────────────────────

export class PipelineConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipelineConfigError'
  }
}

export class PluginRegistrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginRegistrationError'
  }
}

export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: unknown[],
  ) {
    super(message)
    this.name = 'SchemaValidationError'
  }
}

export class StepError extends Error {
  constructor(
    message: string,
    public readonly stepName: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'StepError'
  }
}

export class PiiRedactionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PiiRedactionError'
  }
}

export class ChunkMergeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChunkMergeError'
  }
}
