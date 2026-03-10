# Product Requirements Document
## Transcript Processing SDK — v1

**Author:** V.strazhnikava
**Date:** 2026-03-09
**Status:** Draft
**Source:** Brainstorming session `_bmad-output/brainstorming/brainstorming-session-2026-03-09-1.md`

---

## 1. Executive Summary

A developer-oriented SDK for processing raw meeting transcripts into structured data. The SDK provides a minimal, opinion-free pipeline framework — developers bring their own AI models and processors; the SDK provides the execution engine, contracts, and tooling.

**One-liner:** *"Express.js for meeting intelligence — bring your own AI, we handle the pipeline."*

---

## 2. Problem Statement

Backend engineers and ML/AI teams who need to extract structured information from meeting transcripts (action items, summaries, decisions, topics) currently face two bad options:

1. **DIY from raw API calls** — writing 500+ lines of prompt engineering + JSON parsing code with no standards, no testability, no resilience, and hard vendor lock-in.
2. **Opinionated SaaS tools** (AssemblyAI, Recall.ai, etc.) — fast to start but locked into specific AI models, output schemas, and pricing models; cannot self-host; often lack privacy controls required by enterprise/fintech/healthcare.

There is no composable, local-first, testable SDK that treats conversation processing as a first-class engineering discipline.

---

## 3. Target Users

### Primary: Backend / ML Engineers
- Integrating meeting intelligence into products or internal tools
- Work in teams where **data security matters** — enterprise, fintech, healthcare
- Need stable plugin contracts with clear compatibility documentation
- Require **unit-testability** for conversation processing logic
- Value **fast onboarding** — from zero to working pipeline in under 15 minutes

### Context
- Deploy as local library embedded in Python/Node.js services
- Integrate with CI/CD pipelines for automated testing and benchmarking
- Cannot rely on mandatory cloud runtime — data must stay local

---

## 4. Goals

### v1 Goals
| # | Goal | Success Metric |
|---|------|---------------|
| G1 | Developer onboards in < 15 minutes | Time-to-working-pipeline benchmark |
| G2 | Swap AI model with zero code changes | Config-only model replacement works end-to-end |
| G3 | Process any transcript length without memory failure | 8-hour conference transcript processed successfully |
| G4 | Unit-test any processor in isolation | `MockConversationBuilder` covers all test scenarios |
| G5 | PII-safe by default — no configuration required | PII redaction active on fresh install with no config |
| G6 | Partial pipeline failure returns usable data | Failed step marked, rest of model populated |

### Non-Goals (v1)
- Real-time / streaming processing
- Multi-modal input (audio, video)
- Cloud-hosted runtime or managed service
- Cross-meeting organizational memory
- Role-aware or context-intelligent processing
- Export adapters to external tools (Jira, GCal, BI)
- REPL / interactive sandbox (deferred to v1.1+)

---

## 5. Architecture Decisions

*Validated through Morphological Analysis during brainstorming.*

| Dimension | v1 Decision | Rationale |
|-----------|------------|-----------|
| **Input** | Raw text transcript | Scope control; multi-modal in v2+ |
| **Core Model** | `ConversationModel` (rich object) | Living object beats flat JSON for testability and DX |
| **Pipeline Execution** | Parallel chunks, sequential API surface | Scales to 8-hour conferences; developer sees simple API |
| **Component Contracts** | Typed interfaces (`version: string` in v1) | Keep runtime lean; compatibility matrix documented in README |
| **Output** | `ConversationModel` with methods | `.getSummary()`, `.getActions()`, `.getDecisions()` |
| **Configuration** | Hybrid: YAML/JSON + fluent code API | YAML for simple pipelines; code for complex ones |
| **Error Handling** | Partial results + `status: failed` | Fault-tolerant; broken step doesn't kill pipeline |
| **Extensibility** | Plugin registry | Community npm ecosystem in v2+ |
| **Developer Tooling** | CLI + testing utils | `create-transcript-app`, scaffold, MockConversationBuilder |
| **Observability** | Structured JSON logs | OpenTelemetry integration in v2+ |
| **Security** | PII-first redaction (pre-pipeline) | Default-on; no opt-in required |
| **Context** | Optional metadata hooks | Foundation for v2 role-aware processing |

---

## 6. Feature Requirements

### 6.1 Core Runtime

#### FR-01: Pipeline Execution Engine
**Priority:** Must Have
The SDK MUST provide a pipeline execution engine that:
- Executes registered processors in configured order
- Manages data flow between steps
- Handles retries, timeouts, and lifecycle events
- Runs each step in an isolated context (stateless execution)

**Acceptance Criteria:**
- [ ] Pipeline executes all registered steps in declared order
- [ ] Each pipeline run is fully isolated — no shared state between runs
- [ ] 100 concurrent pipeline runs complete without race conditions
- [ ] Step execution timeout is configurable per step

---

#### FR-02: Typed Component Interfaces
**Priority:** Must Have
The SDK MUST define and enforce typed interfaces:
- `IParser` — transforms raw transcript text into normalized segments
- `IProcessor` — transforms/enriches `ConversationModel`
- `IFormatter` — serializes `ConversationModel` to output format
- `version: string` field present on plugin interfaces

**Acceptance Criteria:**
- [ ] TypeScript types ship with the SDK
- [ ] Implementing wrong interface shape produces compile-time error
- [ ] Plugin `version` field is required and documented in compatibility matrix
- [ ] Each interface documented with working code example

---

#### FR-03: Plugin Registry
**Priority:** Must Have
The SDK MUST provide a plugin registry that:
- Registers processors, parsers, and formatters by name
- Validates plugin interface shape at registration time
- Resolves plugin execution order based on declared dependencies

**Acceptance Criteria:**
- [ ] `sdk.register('name', plugin)` works for all component types
- [ ] Registering plugin missing `version` throws descriptive error
- [ ] Circular dependency between plugins is detected and reported

---

#### FR-04: Bundled Reference Plugins
**Priority:** Must Have
The SDK MUST ship 2–3 working reference plugins:
- `@transcript-sdk/summarize-openai` — summary via OpenAI API
- `@transcript-sdk/extract-actions` — action item extraction
- `@transcript-sdk/format-json` — basic JSON formatter

**Acceptance Criteria:**
- [ ] Each plugin is a separate installable package
- [ ] Each plugin includes README, working example, and unit tests
- [ ] Reference plugins serve as canonical implementation patterns
- [ ] All reference plugins work on the sample transcript from `create-transcript-app`

---

### 6.2 Transcript Processing

#### FR-05: Parallel Chunk Execution
**Priority:** Must Have
The SDK MUST handle transcripts of any length by:
- Automatically splitting transcript into configurable chunks
- Processing chunks in parallel
- Merging chunk results into a single `ConversationModel`
- Exposing a simple sequential API — developer does not interact with chunks

**Acceptance Criteria:**
- [ ] `sdk.process(transcript)` API is identical for 1-minute and 8-hour transcripts
- [ ] Configurable `chunkSize`, `maxParallel`, `memoryLimit` in config
- [ ] 8-hour conference transcript processed without OOM error on standard laptop
- [ ] Chunk processing order does not affect final `ConversationModel` content

---

#### FR-06: Default Merge Strategies
**Priority:** Must Have
The SDK MUST provide built-in merge strategies for combining chunk results:
- `concat` — append items from each chunk in order
- `deduplicate` — merge items, remove exact normalized duplicates

**Acceptance Criteria:**
- [ ] Merge strategy configurable per processor type in pipeline config
- [ ] `concat` produces ordered union of all chunk outputs
- [ ] `deduplicate` removes items with identical normalized text

---

#### FR-07: Fault-Tolerant Execution
**Priority:** Must Have
The SDK MUST continue pipeline execution when a step fails:
- Failed step marked as `status: 'failed'` with error details in `ConversationModel`
- Remaining steps execute normally
- Downstream processors can inspect failed step status

**Acceptance Criteria:**
- [ ] Throwing exception in one processor does not halt remaining processors
- [ ] `model.getStepStatus('summarize')` returns `{status: 'failed', error: ...}` on failure
- [ ] Final `ConversationModel` contains all successfully extracted data
- [ ] Failed step error is included in structured JSON log output

---

#### FR-08: PII-First Redaction
**Priority:** Must Have
The SDK MUST redact PII before any processor runs:
- Detects: names, email addresses, phone numbers, financial figures
- Redacts by default — no configuration required
- Output can include anonymized placeholders (`[Person A]`, `[Email]`)
- Opt-out available via explicit config flag

**Acceptance Criteria:**
- [ ] PII redaction active on fresh install with zero configuration
- [ ] Names, emails, phones detected and replaced in pre-pipeline stage
- [ ] Opt-out requires explicit `privacy: { piiRedaction: false }` in config
- [ ] Redacted transcript never logged, even at DEBUG level

---

#### FR-09: Dirty-First Input Handling
**Priority:** Must Have
All SDK component interfaces MUST enforce graceful handling of noisy input:
- Component contracts require handling of partial/empty segments
- No component may throw on malformed or missing input fields
- Noise (filler words, interrupted sentences) passed through without crash

**Acceptance Criteria:**
- [ ] Processor receiving empty segment array returns empty result, not exception
- [ ] Processor receiving `null` confidence score treats it as low confidence
- [ ] SDK integration tests include "completely garbled transcript" test case that passes

---

### 6.3 ConversationModel

#### FR-10: ConversationModel — Simple Mode
**Priority:** Must Have
The SDK MUST support a simple output mode for fast onboarding:
- Default `sdk.process()` returns plain JavaScript/Python object
- Developer opts into full `ConversationModel` via config flag
- Simple mode and full model have identical data — different access patterns only

**Acceptance Criteria:**
- [ ] Default output: `{ summary: string, actions: Action[], decisions: Decision[] }`
- [ ] `mode: 'model'` config flag returns full `ConversationModel` instance
- [ ] Both modes produce identical data content
- [ ] Simple mode documented as default in Getting Started guide

---

#### FR-11: ConversationModel — Core Methods
**Priority:** Must Have
The full `ConversationModel` MUST expose:
- `.getSummary()` — returns meeting summary string
- `.getActions(filter?)` — returns action items, optional filter by assignee/status
- `.query(question: string)` — explicit v2 stub (`NotImplementedError` in v1)

**Acceptance Criteria:**
- [ ] `.getSummary()` returns string; empty string if no summary processor ran
- [ ] `.getActions({ assignee: 'ivan' })` returns only Ivan's action items
- [ ] `.query('...')` throws `NotImplementedError` with message "deferred to v2"
- [ ] All methods return empty results (not exceptions) when data is unavailable

---

#### FR-12: Language-Agnostic Core
**Priority:** Must Have (foundation)
The SDK core MUST make zero assumptions about transcript language:
- No language-specific processing in core components
- Language detection available as optional plugin
- All processors work with semantic structures, not raw language-specific text

**Acceptance Criteria:**
- [ ] Russian-only transcript processed without errors using default pipeline
- [ ] English/Russian mixed transcript processed without errors
- [ ] `@transcript-sdk/detect-language` plugin detects language per segment
- [ ] Language metadata available on `ConversationModel` when detection plugin is loaded

---

### 6.4 Configuration

#### FR-13: Hybrid Configuration
**Priority:** Must Have
The SDK MUST support two configuration approaches:
- **Declarative** — YAML/JSON pipeline config file
- **Fluent code API** — programmatic pipeline construction for complex cases

**Acceptance Criteria:**
- [ ] `pipeline.yaml` with processor list produces working pipeline
- [ ] Fluent API: `sdk.pipe(parser).pipe(processor).pipe(formatter)` works
- [ ] Both approaches produce identical pipeline behavior
- [ ] Config hot-reload supported in declarative mode (file watch)
- [ ] Configurable: `chunkSize`, `maxParallel`, `memoryLimit`, `mergeStrategy`, `privacy`

---

#### FR-14: Optional Context Hooks
**Priority:** Should Have (v1 optional — foundation for v2)
The SDK SHOULD accept optional context at pipeline initialization:
- Participant list with names/roles
- Meeting title, project name, date
- Context readable by processors but not used by any built-in logic

**Acceptance Criteria:**
- [ ] `sdk.process(transcript, { context: { participants: [...], title: '...' } })` accepted
- [ ] Context object available in processor via `pipeline.context`
- [ ] SDK applies no built-in logic to context data in v1
- [ ] Context fields documented with v2+ role-aware processing roadmap note

---

### 6.5 Developer Tooling

#### FR-15: `create-transcript-app`
**Priority:** Must Have
The SDK MUST ship a project bootstrapper:
- Single command creates working project with pipeline, sample transcript, tests, config
- Works for both TypeScript/JavaScript and Python
- Developer runs the sample project within 5 minutes of install

**Acceptance Criteria:**
- [ ] `npx create-transcript-app my-project` completes in <60 seconds
- [ ] Generated project runs `npm test` successfully out of the box
- [ ] Generated project includes inline comments explaining each component
- [ ] Generated project uses a reference plugin, not a mock

---

#### FR-16: Processor Scaffold Generator
**Priority:** Must Have
The SDK CLI MUST generate processor boilerplate:
- Correct interface implementation
- Unit test file with `MockConversationBuilder` example
- TypeScript types pre-wired

**Acceptance Criteria:**
- [ ] `transcript-sdk new processor my-summarizer` generates valid TypeScript
- [ ] Generated test file passes `npm test` immediately
- [ ] Generated processor registered and usable in pipeline without modification

---

#### FR-17: MockConversationBuilder
**Priority:** Must Have
The testing package MUST provide a fluent builder for test fixtures:

```ts
const model = new MockConversationBuilder()
  .withSummary('Discussed Q2 roadmap')
  .withActions(3)
  .withDecision('Use PostgreSQL')
  .build()
```

**Acceptance Criteria:**
- [ ] Builder supports: `.withSummary()`, `.withActions(n)`, `.withDecision()`, `.withParticipant()`
- [ ] Built model passes all `ConversationModel` type checks
- [ ] Builder ships in `@transcript-sdk/testing` — not in core runtime
- [ ] 5+ example test patterns documented in testing guide

---

#### FR-18: REPL / Sandbox
**Priority:** Could Have (Deferred to v1.1+)
The CLI MAY provide an interactive sandbox post-v1:
- Developer pastes transcript snippet, runs through configured pipeline, inspects `ConversationModel`
- No file setup required

**Acceptance Criteria (v1.1+):**
- [ ] `transcript-sdk repl` starts interactive session in terminal
- [ ] User can paste multi-line transcript and process it
- [ ] Output shows formatted `ConversationModel` with populated fields
- [ ] REPL loads pipeline config from current directory if present

---

#### FR-19: Dry-Run Mode
**Priority:** Must Have
The SDK MUST support pipeline validation without invoking processors:
- Returns execution plan: steps, order, estimated data flow
- Detects config errors without burning AI API tokens

**Acceptance Criteria:**
- [ ] `sdk.process(transcript, { dryRun: true })` returns plan, not results
- [ ] Plan includes: step names, order, input/output schema per step
- [ ] Config errors (missing plugin, invalid schema fields) reported in dry-run
- [ ] No external API calls made during dry-run

---

#### FR-20: Middleware / Lifecycle Hooks
**Priority:** Must Have
The SDK MUST support before/after hooks on pipeline steps:

```ts
sdk.before('summarize', (ctx) => { /* preprocess */ })
sdk.after('summarize', (ctx) => { /* audit log */ })
```

**Acceptance Criteria:**
- [ ] `before` hook can mutate `ctx.input` before processor runs
- [ ] `after` hook can read `ctx.output` after processor completes
- [ ] Hook errors are caught and reported without killing pipeline step
- [ ] Multiple hooks on same step execute in registration order

---

### 6.6 Observability & Safety

#### FR-21: Structured JSON Logging
**Priority:** Must Have
Every pipeline step MUST emit structured log events:
- Step start/end with duration
- Input/output data size (not content)
- Confidence scores in/out
- Step status (success/failed/skipped)

**Acceptance Criteria:**
- [ ] Log output is valid newline-delimited JSON
- [ ] Each log entry includes: `timestamp`, `step`, `status`, `durationMs`, `confidenceIn`, `confidenceOut`
- [ ] Log level configurable: `debug`, `info`, `warn`, `error`
- [ ] Raw transcript content NEVER appears in logs at any level

---

#### FR-22: Runtime Schema Validation
**Priority:** Must Have
The SDK MUST validate runtime boundaries in a lean v1 form:
- Each processor declares input/output schema
- SDK validates startup config and pre-step input
- Output schema validation is deferred to v1.1+

**Acceptance Criteria:**
- [ ] Invalid processor input shape triggers validation error before processor execution
- [ ] Validation error captured in `ConversationModel` step status
- [ ] Schema validation adds <5ms overhead per step on 1000-word transcript
- [ ] Validation can be disabled via config flag for performance-critical scenarios

---

## 7. Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| NFR-01 | Onboarding time | Working pipeline in <15 minutes from `npm install` |
| NFR-02 | Transcript size | 8-hour conference (100k+ words) processed without OOM |
| NFR-03 | Processing latency | Chunking overhead <10% vs single-chunk on same transcript |
| NFR-04 | Memory footprint | Core SDK runtime <50MB at idle |
| NFR-05 | Test coverage | Core runtime >90% unit test coverage |
| NFR-06 | TypeScript support | Full type definitions ship with package |
| NFR-07 | Python support | Python SDK parity with TypeScript SDK for v1 |
| NFR-08 | Zero cloud dependency | All v1 features work with no internet connection |
| NFR-09 | License | MIT or Apache 2.0 |

---

## 8. User Stories

### Epic 1: Core Pipeline

**US-01** — As a backend engineer, I want to process a raw transcript through a pipeline so that I get structured action items and a summary without writing prompt-engineering code.

**US-02** — As an ML engineer, I want to swap the summarization model from GPT-4 to Claude by changing one config line so that I can benchmark models without rewriting code.

**US-03** — As a developer, I want the pipeline to keep running when one step fails so that I still get the action items even if summarization threw an exception.

**US-04** — As an enterprise developer, I want PII automatically redacted before any processor sees the transcript so that I don't accidentally log or expose sensitive meeting data.

### Epic 2: Scale & Reliability

**US-05** — As a developer, I want to process an 8-hour all-hands transcript using the same API as a 5-minute standup so that I don't have to implement chunking logic myself.

**US-06** — As a developer, I want to configure memory limits for parallel chunk processing so that the SDK works on developer laptops, not just high-memory servers.

### Epic 3: Developer Experience

**US-07** — As a new user, I want to run `npx create-transcript-app` and see a working pipeline processing a sample transcript within 10 minutes so that I understand how the SDK works before writing any code.

**US-08** — As a developer, I want to unit-test my custom processor using `MockConversationBuilder` so that I can verify my logic without running a real pipeline or making AI API calls.

**US-09** — Deferred to v1.1+: REPL sandbox for interactive transcript debugging.

**US-10** — As a developer, I want `transcript-sdk new processor summarize` to generate a working processor template with tests so that I can focus on logic, not boilerplate.

---

## 9. v2+ Roadmap

The following features are explicitly out of scope for v1 and scheduled for future versions:

| Feature | Value | Why Deferred |
|---------|-------|-------------|
| Confidence propagation layer | High | Complex to implement correctly; v1 establishes foundation |
| Pipeline linter / static analysis | Medium | Requires stable v1 API surface first |
| Pipeline visualizer | Medium | Nice-to-have; tooling investment after core proven |
| OpenTelemetry integration | High | Structured JSON logs sufficient for v1 |
| `sdk migrate` CLI | Medium | Needed once ecosystem has multiple versions |
| npm community plugin ecosystem | High | Needs critical mass; v1 reference plugins start this |
| Role-aware processing | High | Requires context hooks (v1 optional) as foundation |
| Organizational memory | High | Requires stable per-meeting model first |
| Multi-modal input (audio, video) | High | Major scope expansion; separate milestone |
| Streaming / real-time pipeline | High | Architectural addition; post-v1 |
| Pluggable export adapters | Medium | Downstream integration; not core SDK concern |
| Official benchmark suite | Medium | Needs real-world usage data to design well |
| Conversation Graph core model | Very High | Evolutionary from ConversationModel; v3+ |

---

## 10. Open Questions

| # | Question | Owner | Target |
|---|----------|-------|--------|
| OQ-01 | TypeScript-first or language-agnostic from day 1? | **Resolved:** Language-agnostic core (pipeline engine, ConversationModel, chunking, plugin registry). TypeScript is first binding; Python in v2+. |
| OQ-02 | What AI provider for the 2–3 bundled reference plugins? | **Resolved:** OpenAI + Claude reference plugins in v1. Ollama/local LLM in v2+. |
| OQ-03 | Merge strategy for `decisions` and `summary` in parallel chunk mode? | **Resolved:** `decisions` → `concat` (deterministic, no data loss). `summary` → `summarize-of-summaries` (final AI pass over chunk summaries; `concat` fallback on failure). Both configurable in pipeline config. |
| OQ-04 | Should `ConversationModel.query()` require a plugin or be a core method? | **Resolved:** Deferred in v1. `query()` remains a documented stub; query semantics land in v2+. |
| OQ-05 | PII detection approach — regex, NER, or pluggable? | **Resolved:** Pluggable (option C). Core ships regex baseline (emails, phones, credit cards) — zero dependencies. `piiDetectorPlugin` slot for NER models or cloud APIs. Configurable via YAML or fluent API. |

---

*Document generated by BMad Master from brainstorming session results.*
*Next step: Architecture Document → User Stories breakdown → Implementation planning.*
