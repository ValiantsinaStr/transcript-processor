# Architecture Document
## Transcript Processing SDK — v1

**Author:** V.strazhnikava
**Date:** 2026-03-09
**Status:** Draft
**Based on:** `_bmad-output/prd/prd-transcript-sdk-v1.md`

---

## 1. System Overview

The SDK is a plugin-based pipeline framework for processing raw meeting transcripts into structured `ConversationModel` objects. It provides the execution engine and contracts; all business logic lives in plugins.

All plugins implement a single `IStep` interface — a standard middleware contract (`execute(ctx, next)`). The engine composes them into a chain; there are no separate parser/processor/formatter types.

```
┌─────────────────────────────────────────────────────────┐
│                    Developer's App                      │
│                                                         │
│  sdk.process(transcript, options)                       │
│        │                                                │
│        ▼                                                │
│  ┌─────────────┐    ┌──────────────────────────────┐   │
│  │ PII Redactor│───▶│  Step Chain (per chunk)      │   │
│  │  (pre-stage)│    │                              │   │
│  └─────────────┘    │  step(ctx, next) →           │   │
│                     │  step(ctx, next) →           │   │
│                     │  step(ctx, next)             │   │
│                     └──────────────┬───────────────┘   │
│                                    │                    │
│                     ┌──────────────▼───────────────┐   │
│                     │       ConversationModel       │   │
│                     └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Package Structure

```
@transcript-sdk/
├── core          # Pipeline engine, IStep, StepContext, ConversationModel
├── testing       # MockConversationBuilder, test utilities
└── plugins/
    ├── default-parser     # Built-in: text → TranscriptSegment[]
    ├── summarize-openai   # Reference: summary via OpenAI
    ├── summarize-claude   # Reference: summary via Anthropic Claude
    ├── extract-actions    # Reference: action item extraction
    └── format-json        # Reference: JSON output formatter
```

### Dependency Rules
- `core` has **zero** runtime dependencies
- `testing` depends on `core` only
- Each plugin declares its own external dependency
- Plugins never depend on each other

---

## 3. Core Interfaces

### 3.1 IStep — Universal Plugin Contract

Every plugin implements one interface:

```typescript
interface IStep {
  readonly name: string
  readonly version: string
  readonly inputSchema?: JSONSchema   // optional; validated by engine before execute()
  execute(ctx: StepContext, next: () => Promise<void>): Promise<void>
}
```

`next()` passes control to the next step. A step that does not call `next()` is terminal.

**Convention by role** (declared in config, not enforced by type):

| Role | What the step does |
|------|--------------------|
| Parser | Populates `ctx.segments`, then calls `next()` |
| Processor | Reads `ctx.segments`, writes to `ctx.model`, calls `next()` |
| Formatter | Reads `ctx.model`, writes `ctx.output`, does NOT call `next()` |

### 3.2 StepContext

Shared mutable state passed through the chain:

```typescript
interface StepContext {
  readonly chunkIndex: number
  readonly totalChunks: number
  segments: TranscriptSegment[]        // written by parser step; read by processors
  model: ConversationModelWriter       // written by processor steps
  output: FormatterOutput | undefined  // written by formatter step
  state: Record<string, unknown>       // step-to-step state; namespace keys as 'pluginName.key'
}

interface RawTranscript {
  text: string
  metadata?: Record<string, unknown>
}

interface TranscriptSegment {
  id: string
  text: string
  speakerId?: string
  startMs?: number
  endMs?: number
  language?: string
}

type FormatterOutput = string | Record<string, unknown>
```

### 3.3 IPiiDetector (pre-stage only, not an IStep)

PII redaction runs on the full transcript before chunking — outside the step chain.

```typescript
interface IPiiDetector {
  readonly version: string
  redact(text: string): PiiRedactionResult  // detect + replace in one atomic call
}

interface PiiMatch {
  type: 'email' | 'phone' | 'name' | 'financial' | 'custom'
  start: number
  end: number
  replacement: string
}

interface PiiRedactionResult {
  redactedText: string
  matches: PiiMatch[]
}
```

### 3.4 Example Plugin Implementation

```typescript
// Processor step — reads segments, writes to model, chains next
const summarizeStep: IStep = {
  name: 'summarize',
  version: '1.0.0',
  async execute(ctx, next) {
    const summary = await openai.summarize(ctx.segments.map(s => s.text).join('\n'))
    ctx.model.setSummary(summary)
    await next()
  }
}

// Formatter step — terminal, does not call next()
const formatJsonStep: IStep = {
  name: 'format-json',
  version: '1.0.0',
  async execute(ctx, _next) {
    ctx.output = ctx.model.toJSON()
  }
}
```

---

## 4. ConversationModel

### 4.1 Structure

```typescript
class ConversationModel {
  private _summary: string | null
  private _actions: ActionItem[]
  private _decisions: Decision[]
  private _topics: Topic[]
  private _stepStatuses: Map<string, StepStatus>

  // Read API
  getSummary(): string | null
  getActions(filter?: ActionFilter): ActionItem[]
  getDecisions(): Decision[]
  getTopics(): Topic[]
  getStepStatus(stepName: string): StepStatus

  // Serialization
  toJSON(): ConversationJSON

  // Writer interface passed to steps via ctx.model
  asWriter(): ConversationModelWriter
}

interface ConversationModelWriter {
  setSummary(value: string): void
  addAction(item: ActionItem): void
  addDecision(item: Decision): void
  addTopic(item: Topic): void
  markStepSuccess(stepName: string, durationMs: number): void
  markStepFailed(stepName: string, error: Error): void
}
```

### 4.2 Output Modes

```typescript
// Simple mode (default)
const result = await sdk.process(transcript)
// result: ConversationJSON

// Full model (opt-in)
const result = await sdk.process(transcript, { mode: 'model' })
// result: ConversationModel instance
```

### 4.3 Core Data Types

```typescript
interface ActionItem {
  id: string
  text: string
  assignee?: string
  dueDate?: string
  status: 'open' | 'done'
  sourceSegmentId?: string
}

interface Decision {
  id: string
  text: string
  madeBy?: string
  sourceSegmentId?: string
}

interface Topic {
  id: string
  label: string
  relevance: number   // 0.0 – 1.0
}

interface ActionFilter {
  status?: 'open' | 'done'
  assignee?: string
}

interface ConversationJSON {
  summary: string | null
  actions: ActionItem[]
  decisions: Decision[]
  topics: Topic[]
  stepStatuses: Record<string, StepStatus>
  degraded: boolean   // true if any merge fallback was applied
}

type StepStatus =
  | { status: 'success'; durationMs: number }
  | { status: 'failed'; durationMs: number; error: string }
  | { status: 'skipped'; reason: string }
```

---

## 5. Pipeline Execution Engine

### 5.1 Execution Flow

```
sdk.process(transcript, options)
        │
        ▼
1. PRE-STAGE: PII Redaction (full transcript, via IPiiDetector)
        │
        ▼
2. CHUNKING: Split into chunks
        │
        ├── chunk[0] ──▶ step chain ──▶ ChunkModel[0]
        ├── chunk[1] ──▶ step chain ──▶ ChunkModel[1]
        └── chunk[n] ──▶ step chain ──▶ ChunkModel[n]
                                               │
        ▼                                      │
3. MERGE: Combine ChunkModels ◀──────────────┘
        │
        ▼
4. POST-MERGE: summarize-of-summaries (if configured)
        │
        ▼
5. OUTPUT: ConversationModel | ConversationJSON
```

Each chunk runs with its own isolated `ConversationModel` instance. Steps do not share mutable state across chunks. Only the merge step writes to the final aggregate model.

### 5.2 Step Chain Execution (per chunk)

The engine builds the chain from the `steps` list in config and runs it as a middleware stack:

```
StepContext (fresh per chunk)
        │
        ▼
[default-parser]    ctx.segments = [...]           → next()
        │
        ▼
[summarize-openai]  ctx.model.setSummary(...)      → next()
        │
        ▼
[extract-actions]   ctx.model.addAction(...)       → next()
        │
        ▼
[format-json]       ctx.output = ctx.model.toJSON()   (terminal)
```

Each step is wrapped in fault isolation:

```typescript
try {
  await step.execute(ctx, next)
  ctx.model.markStepSuccess(step.name, durationMs)
} catch (error) {
  ctx.model.markStepFailed(step.name, error)
  logger.warn({ step: step.name, error: error.message })
  await next()  // chain continues to next step
}
```

### 5.3 Chunking Strategy

```typescript
interface ChunkingConfig {
  chunkSize: number        // words per chunk (default: 2000)
  overlap: number          // word overlap between chunks (default: 100)
  maxParallel: number      // max concurrent chunk pipelines (default: 4)
  memoryLimitMb: number    // max memory before queuing (default: 512)
}
```

- Split at nearest sentence boundary to `chunkSize` word count
- Overlap is applied to already-redacted text (redaction precedes chunking)
- PII match offsets are global, not chunk-local

### 5.4 Merge Strategies

Declared per step in config:

| Strategy | Behavior |
|----------|----------|
| `concat` | Append results in chunk order |
| `deduplicate` | Normalize text (lowercase, trim, collapse whitespace); remove exact matches; keep first occurrence |
| `summarize-of-summaries` | AI call combining all chunk summaries into one final summary |

Fallback: if `summarize-of-summaries` fails → `concat`. Final output has `degraded: true`.

---

## 6. Plugin Registry

```typescript
class PluginRegistry {
  register(name: string, step: IStep): void
  resolve(name: string): IStep
  validateCompatibility(plugin: unknown): ValidationResult
}
```

Registration validates:
1. Plugin implements `IStep` shape
2. `name` and `version` are present and non-empty
3. No naming collision with existing registered plugin

---

## 7. PII Redaction (Pre-Pipeline Stage)

Runs before chunking. Original transcript is never passed to any step or logged.

```
RawTranscript
     │
     ▼
┌──────────────────┐
│ Core Regex Layer │  → emails, phones, credit cards, SSNs
└────────┬─────────┘
         │ (if piiDetectorPlugin configured)
         ▼
┌──────────────────┐
│ piiDetectorPlugin│  → NER-based name/org detection
└────────┬─────────┘
         │
         ▼
RedactedTranscript
```

Config:
```yaml
privacy:
  piiRedaction: true
  piiDetectorPlugin: null     # optional: name of registered IPiiDetector
  replacements:
    email: '[Email]'
    phone: '[Phone]'
    name: '[Person]'
```

---

## 8. Configuration Schema (pipeline.yaml)

```yaml
schemaVersion: '1.0.0'

chunking:
  chunkSize: 2000
  overlap: 100
  maxParallel: 4
  memoryLimitMb: 512

privacy:
  piiRedaction: true
  piiDetectorPlugin: null

pipeline:
  steps:
    - name: parse
      plugin: default-parser
    - name: summarize
      plugin: summarize-openai
      merge: summarize-of-summaries
    - name: extract-actions
      plugin: extract-actions
      merge: concat
    - name: detect-topics
      plugin: detect-topics
      merge: deduplicate
    - name: format
      plugin: format-json

output:
  mode: simple    # 'simple' | 'model'

logging:
  level: info     # 'debug' | 'info' | 'warn' | 'error'
```

`schemaVersion` policy:
- `1.x.y`: additive, backward-compatible changes
- `2.0.0+`: breaking changes require migration or hard failure

---

## 9. Structured Logging Schema

Every step emits one log entry on completion:

```json
{
  "timestamp": "2026-03-09T10:23:45.123Z",
  "level": "info",
  "event": "step.complete",
  "step": "summarize",
  "status": "success",
  "durationMs": 1243,
  "chunkIndex": 2,
  "inputSegments": 47
}
```

On failure:
```json
{
  "timestamp": "2026-03-09T10:23:46.001Z",
  "level": "warn",
  "event": "step.failed",
  "step": "summarize",
  "status": "failed",
  "durationMs": 302,
  "error": "OpenAI rate limit exceeded"
}
```

**Rule:** Raw transcript text NEVER appears in any log entry at any level.

---

## 10. Developer Tooling

### 10.1 MockConversationBuilder

```typescript
import { MockConversationBuilder } from '@transcript-sdk/testing'

const model = new MockConversationBuilder()
  .withSummary('Discussed Q2 roadmap and budget')
  .withAction({ text: 'Update API docs', assignee: 'ivan' })
  .withDecision('Adopt PostgreSQL for primary storage')
  .withTopic({ label: 'Budget', relevance: 0.9 })
  .withFailedStep('detect-topics', new Error('Model timeout'))
  .build()
```

---

## 11. Error Taxonomy

| Error Type | Behavior | Logged As |
|------------|----------|-----------|
| `SchemaValidationError` | Step skipped, chain continues | `warn` |
| `StepError` | Step fails, chain continues | `warn` |
| `PipelineConfigError` | Pipeline refuses to start | `error` |
| `PluginRegistrationError` | Registration rejected | `error` |
| `ChunkMergeError` | Fallback applied, `degraded: true` | `warn` |
| `PiiRedactionError` | Pipeline refuses to start | `error` |

---

## 12. v1 Package API Surface (TypeScript)

```typescript
// @transcript-sdk/core — public API

export { SDK } from './sdk'
export { ConversationModel } from './model'
export type {
  IStep,
  IPiiDetector,
  StepContext,
  TranscriptSegment,
  RawTranscript,
  ActionItem,
  Decision,
  Topic,
  ActionFilter,
  ConversationJSON,
  StepStatus,
  SDKConfig,
  ChunkingConfig
} from './types'

// @transcript-sdk/testing — public API

export { MockConversationBuilder } from './builder'
export { createMockTranscript } from './fixtures'
export type { MockOptions } from './types'
```

---

## 13. Deferred to v2

| Feature | Notes |
|---------|-------|
| CLI (`create-transcript-app`, scaffold generator, dry-run) | Reduces v1 scope; core pipeline is the deliverable |
| REPL | Nice-to-have; deferred pending adoption signal |
| Plugin sandboxing and capabilities | Requires ecosystem maturity |
| `ConversationModel.query()` | Semantics unclear; deferred to v2 design |
| `vote` merge strategy | Needs real-world data to validate |
| Speaker diarization boundary handling | Requires dedicated design; v1 known limitation |
| Typed `TranscriptMetadata` schema | `Record<string, unknown>` sufficient for v1 |

---

## 14. Open Architecture Questions

| # | Question | Status |
|---|----------|--------|
| AQ-01 | Monorepo (nx/turborepo) or independent packages? | **Resolved:** Monorepo (Nx/Turborepo) |
| AQ-02 | Runtime target: Node.js only, or also browser/edge? | **Resolved:** Node.js-only in v1 |
| AQ-03 | `ConversationModel.query()` — keyword or semantic? | **Resolved:** Deferred to v2 |
| AQ-04 | Chunk overlap strategy — word count or sentence boundary? | **Resolved:** Word-based with sentence boundary alignment |
| AQ-05 | `summarize-of-summaries` — same plugin instance or separate registration? | **Resolved:** Separate plugin instance for post-merge step |

---

*Document generated by BMad Master.*
*Next step: User Story breakdown → Implementation sprint planning.*
