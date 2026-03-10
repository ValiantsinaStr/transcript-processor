# User Stories — Transcript Processing SDK v1

**Author:** V.strazhnikava
**Date:** 2026-03-09
**Status:** In Progress (Sprint 5 started: 2026-03-10)
**Based on:** `_bmad-output/prd/prd-transcript-sdk-v1.md` + `_bmad-output/architecture/architecture-transcript-sdk-v1.md`

---

## Story Map Overview

```
Epic 1: Core Pipeline       → CORE-01 … CORE-07
Epic 2: Scale & Reliability → SCALE-01 … SCALE-04
Epic 3: Developer Experience → DX-01, DX-02
Epic 4: Safety & Privacy    → SEC-01 … SEC-03
Epic 5: Configuration       → CFG-01, CFG-02
Epic 6: Reference Skills    → SKL-01 … SKL-04
Epic 7: Integrations        → INT-01 … INT-03
```

**Sprint Recommendation:**
- Sprint 1 → CORE-01, CORE-02, CORE-03, CFG-01 (foundation)
- Sprint 2 → CORE-04, CORE-05, SCALE-01, SCALE-02, SEC-01 (pipeline completes)
- Sprint 3 → DX-01, DX-02 (developer tooling)
- Sprint 4 → CORE-06, CORE-07, SCALE-03, SCALE-04, SEC-02, SEC-03, CFG-02 (completion + polish)
- Sprint 5 → SKL-01, SKL-02, SKL-03, SKL-04, INT-01, INT-02, INT-03 (reference skills + integrations)

---

## Epic 1: Core Pipeline

### CORE-01: Pipeline Execution Engine

**Story:** As a backend engineer, I want a pipeline execution engine so that I can register steps in order and have them execute sequentially on a transcript without writing orchestration code myself.

**Priority:** Must Have — Sprint 1
**Estimate:** L (large)

**Acceptance Criteria:**
- [ ] `new SDK()` creates an SDK instance with zero configuration
- [ ] `sdk.process(transcript)` executes all registered steps in order via middleware chain
- [ ] Each step receives `StepContext` and a `next()` function to pass control forward
- [ ] A step that throws without calling `next()` stops that step but chain continues (fault isolation)
- [ ] Each pipeline run creates a fresh isolated `StepContext` (no shared state between runs)
- [ ] 100 concurrent `sdk.process()` calls complete without data leakage between runs

**Technical Notes:**
- Node.js-only runtime (v1)
- Stateless execution: no singletons, no module-level state
- References: Architecture §5.1, §5.2

---

### CORE-02: IStep Interface

**Story:** As a developer building a custom plugin, I want a single typed `IStep` interface so that I know exactly what to implement and get compile-time errors if I implement it incorrectly.

**Priority:** Must Have — Sprint 1
**Estimate:** M (medium)

**Acceptance Criteria:**
- [ ] `IStep` TypeScript interface exported from `@transcript-sdk/core`
- [ ] `IStep` requires: `name: string`, `version: string`, `execute(ctx, next): Promise<void>`
- [ ] `IStep` has optional `inputSchema?: JSONSchema` field
- [ ] `StepContext` exported with: `segments`, `model`, `output`, `state`, `chunkIndex`, `totalChunks`
- [ ] Implementing a step with wrong `execute` signature produces a TypeScript compile error
- [ ] `IPiiDetector` interface also defined here (used by SEC-01) — separate from `IStep`
- [ ] Each interface ships with a working JSDoc code example in the type definition

**Technical Notes:**
- Roles (parser / processor / formatter) are conventions, not separate types
- References: Architecture §3.1, §3.2, §3.3

---

### CORE-03: Plugin Registry

**Story:** As a developer, I want to register named steps into the SDK so that I can assemble a pipeline from independently developed plugins without modifying the core.

**Priority:** Must Have — Sprint 1
**Estimate:** M (medium)

**Acceptance Criteria:**
- [ ] `sdk.register('name', step)` accepts any `IStep` implementation
- [ ] Registering a plugin with missing/empty `name` or `version` throws `PluginRegistrationError` with descriptive message
- [ ] Registering a duplicate name throws a descriptive error
- [ ] Pipeline config can reference plugins by registered name
- [ ] Registry is instance-scoped, not global

**Technical Notes:**
- References: Architecture §6

---

### CORE-04: ConversationModel — Simple Mode

**Story:** As a new user, I want `sdk.process(transcript)` to return a plain JavaScript object by default so that I can access summary, actions, and decisions without learning a new API.

**Priority:** Must Have — Sprint 2
**Estimate:** M (medium)

**Acceptance Criteria:**
- [x] Default output shape: `{ summary, actions, decisions, topics, stepStatuses, degraded }`
- [x] All fields present even if empty (empty string / empty array — never `undefined`)
- [x] `degraded: true` when any merge fallback was applied
- [x] `mode: 'model'` config flag switches to full `ConversationModel` instance
- [x] Simple mode and full model contain identical data
- [x] Simple mode documented as default in README Getting Started section

**Technical Notes:**
- `ConversationModel.toJSON()` powers simple mode serialization
- References: Architecture §4.2

---

### CORE-05: ConversationModel — Full Object with Core Methods

**Story:** As a developer building complex integrations, I want a `ConversationModel` object with methods so that I can query, filter, and inspect meeting data without parsing flat JSON.

**Priority:** Must Have — Sprint 2
**Estimate:** L (large)

**Acceptance Criteria:**
- [x] `.getSummary()` returns `string | null`
- [x] `.getActions()` returns `ActionItem[]`
- [x] `.getActions({ assignee: 'ivan' })` returns only matching items
- [x] `.getActions({ status: 'open' })` returns only open items
- [x] `.getDecisions()` returns `Decision[]`
- [x] `.getTopics()` returns `Topic[]` sorted by relevance descending
- [x] `.getStepStatus('stepName')` returns `StepStatus` object
- [x] All methods return empty results (not exceptions) when data is absent
- [x] `.toJSON()` returns plain object matching simple mode shape
- [x] `ConversationModelWriter` (passed to steps via `ctx.model`) has: `setSummary`, `addAction`, `addDecision`, `addTopic`, `markStepSuccess`, `markStepFailed`

**Technical Notes:**
- `query()` is not implemented in v1 — deferred to v2
- References: Architecture §4.1, §4.3

---

### CORE-06: Fault-Tolerant Step Execution

**Story:** As a developer, I want the pipeline to continue running when one step fails so that I still receive partial results with clear failure metadata rather than a total exception.

**Priority:** Must Have — Sprint 4
**Estimate:** M (medium)

**Acceptance Criteria:**
- [x] Exception thrown inside any step is caught; engine calls `next()` and continues chain
- [x] Failed step recorded as `{ status: 'failed', error: string, durationMs: number }` in model
- [x] `model.getStepStatus('stepName')` reflects failure accurately
- [x] All data written by successful steps is present in final model
- [x] Pipeline-level exception thrown only for `PipelineConfigError` (not step errors)
- [x] Failed step error appears in structured JSON log at `warn` level

**Technical Notes:**
- Each step wrapped in isolated try/catch; `next()` called in catch block
- References: Architecture §5.2, §11

---

### CORE-07: Runtime Schema Validation

**Story:** As a developer integrating multiple plugins, I want the SDK to validate step input at runtime so that schema mismatches are caught before a step executes.

**Priority:** Must Have — Sprint 4
**Estimate:** M (medium)

**Acceptance Criteria:**
- [x] If a step declares `inputSchema`, engine validates `ctx.segments` against it before calling `execute()`
- [x] Validation failure skips that step (marks as failed) and continues chain — does not throw
- [x] Validation error message includes field name and expected vs actual type
- [x] Validation can be disabled via `{ validation: false }` config flag
- [x] Startup config (`pipeline.yaml`) validated against SDK config schema before any processing begins

**Technical Notes:**
- `outputSchema` deferred — not runtime-enforced in v1
- References: Architecture §12

---

## Epic 2: Scale & Reliability

### SCALE-01: Parallel Chunk Execution

**Story:** As a developer, I want to process an 8-hour conference transcript using the same `sdk.process(transcript)` API as a 5-minute standup so that I don't implement chunking logic myself.

**Priority:** Must Have — Sprint 2
**Estimate:** L (large)

**Acceptance Criteria:**
- [ ] `sdk.process(longTranscript)` API is identical for any transcript length
- [ ] Transcript automatically split at nearest sentence boundary to `chunkSize` word count
- [ ] Chunks processed in parallel up to `maxParallel` limit
- [ ] `chunkSize` (default: 2000), `overlap` (default: 100), `maxParallel` (default: 4), `memoryLimitMb` (default: 512) configurable
- [ ] Each chunk runs its own isolated step chain with a fresh `StepContext`
- [ ] 8-hour conference transcript (~100k words) processed without OOM on 16GB machine

**Technical Notes:**
- Word-based chunking with sentence boundary alignment (AQ-04 resolved)
- Overlap applied to already-redacted text
- References: Architecture §5.3

---

### SCALE-02: Default Merge Strategies

**Story:** As a developer, I want built-in merge strategies for combining results from parallel chunks so that action items and decisions from all chunks are correctly unified into one `ConversationModel`.

**Priority:** Must Have — Sprint 2
**Estimate:** M (medium)

**Acceptance Criteria:**
- [x] `concat` strategy appends items from chunks in order
- [x] `deduplicate` strategy removes items with identical normalized text (lowercase, trim, collapse whitespace)
- [x] `summarize-of-summaries` runs a configured post-merge step over all chunk summaries
- [x] Merge strategy configurable per step in `pipeline.steps[]` config
- [x] If `summarize-of-summaries` fails, falls back to `concat`; final output has `degraded: true`

**Technical Notes:**
- `summarize-of-summaries` uses a separate registered plugin instance (AQ-05 resolved)
- References: Architecture §5.4

---

### SCALE-03: Structured JSON Logging

**Story:** As a developer debugging a pipeline, I want every step to emit structured JSON log events so that I can trace what happened, how long it took, and where failures occurred — without raw transcript data in the logs.

**Priority:** Must Have — Sprint 4
**Estimate:** S (small)

**Acceptance Criteria:**
- [x] Every step emits one JSON entry on completion with: `timestamp`, `event`, `step`, `status`, `durationMs`, `chunkIndex`, `inputSegments`
- [x] Log level configurable: `debug`, `info`, `warn`, `error`
- [x] Raw transcript text NEVER present in any log entry at any level
- [x] Log output is newline-delimited JSON (NDJSON)
- [x] Log destination configurable (default: stderr; accepts writable stream)

**Technical Notes:**
- References: Architecture §9

---

### SCALE-04: Stateless Pipeline Execution

**Story:** As a developer running batch processing, I want each pipeline run to be fully isolated so that I can safely process hundreds of transcripts in parallel without race conditions.

**Priority:** Must Have — Sprint 4
**Estimate:** S (small)

**Acceptance Criteria:**
- [x] No module-level or instance-level state mutated during `sdk.process()`
- [x] 500 concurrent `sdk.process()` calls produce 500 independent `ConversationModel` instances
- [x] Registering a plugin does not affect in-flight pipeline runs
- [x] Pipeline config readable by multiple concurrent runs without locks

**Technical Notes:**
- References: Architecture §5.2

---

## Epic 3: Developer Experience

### DX-01: MockConversationBuilder

**Story:** As a developer writing unit tests, I want a `MockConversationBuilder` so that I can create test fixtures for `ConversationModel` in two lines of code without running a real pipeline.

**Priority:** Must Have — Sprint 3
**Estimate:** M (medium)

**Acceptance Criteria:**
- [x] `new MockConversationBuilder().build()` returns a valid empty `ConversationModel`
- [x] `.withSummary(text)` sets the summary
- [x] `.withAction({ text, assignee })` adds a specific action item
- [x] `.withDecision(text)` adds a decision
- [x] `.withTopic({ label, relevance })` adds a topic
- [x] `.withFailedStep(name, error)` marks a step as failed
- [x] Built model passes all `ConversationModel` TypeScript type checks
- [x] Ships in `@transcript-sdk/testing` — not in core

**Technical Notes:**
- References: Architecture §10.1

---

### DX-02: Language-Agnostic Core

**Story:** As a developer processing multilingual meetings, I want the SDK core to make zero language assumptions so that I can process Russian, English, or mixed transcripts with the same pipeline.

**Priority:** Must Have — Sprint 3
**Estimate:** S (small)

**Acceptance Criteria:**
- [x] Russian-only transcript processed through default pipeline without errors
- [x] English/Russian mixed transcript processed without errors
- [x] No language-specific logic in `@transcript-sdk/core`
- [x] `TranscriptSegment.language` field available for plugins that detect language

**Technical Notes:**
- Language detection is a plugin, not core
- References: Architecture §3.2

---

## Epic 4: Safety & Privacy

### SEC-01: PII-First Redaction

**Story:** As an enterprise developer, I want PII automatically redacted before any step sees the transcript so that meeting data cannot be accidentally logged or exposed through a misconfigured plugin.

**Priority:** Must Have — Sprint 2
**Estimate:** M (medium)

**Acceptance Criteria:**
- [ ] PII redaction active on fresh install with zero configuration
- [ ] Core regex baseline detects and replaces: email addresses, phone numbers, credit card numbers
- [ ] Replacements: `[Email]`, `[Phone]`, `[Card]` (configurable labels)
- [ ] `piiDetectorPlugin` config slot accepts custom `IPiiDetector` for NER-based detection
- [ ] `IPiiDetector.redact()` performs detect + replace atomically in one call
- [ ] Opt-out requires explicit `privacy: { piiRedaction: false }` in config
- [ ] Raw transcript NEVER appears in any log at any level
- [ ] Redaction runs on full transcript before chunking — only redacted text enters the step chain

**Technical Notes:**
- References: Architecture §7, §3.3

---

### SEC-02: Configurable Privacy Profiles

**Story:** As a developer deploying in different environments, I want to configure privacy redaction rules per deployment so that I can use strict profiles for production and relaxed profiles for development.

**Priority:** Must Have — Sprint 4
**Estimate:** S (small)

**Acceptance Criteria:**
- [x] `privacy.replacements` config allows customizing replacement labels per PII type
- [x] `privacy.piiRedaction: false` disables all redaction (dev/test use only)
- [x] `privacy.piiDetectorPlugin` accepts name of registered `IPiiDetector`
- [x] Invalid privacy config rejected at SDK init time with descriptive error

---

### SEC-03: Zero-Log Raw Data Contract

**Story:** As a security-conscious developer, I want a guaranteed contract that raw transcript text never appears in logs so that I can safely enable debug logging in production environments.

**Priority:** Must Have — Sprint 4
**Estimate:** S (small)

**Acceptance Criteria:**
- [x] Automated test asserts that no log entry at any level contains transcript text
- [x] Test covers: pipeline start, step execution, step failure, merge, output
- [x] SDK documentation explicitly states the no-raw-log guarantee
- [x] `RawTranscript` object is never serialized by logger under any code path

---

## Epic 5: Configuration

### CFG-01: Declarative YAML Config

**Story:** As a developer, I want to describe my pipeline in a `pipeline.yaml` file so that I can version-control my pipeline structure and share it with teammates without sharing code.

**Priority:** Must Have — Sprint 1
**Estimate:** M (medium)

**Acceptance Criteria:**
- [ ] `pipeline.yaml` loaded automatically from working directory or explicit path
- [ ] Config specifies: `schemaVersion`, `chunking`, `privacy`, `pipeline.steps[]`, `output.mode`, `logging.level`
- [ ] Each step entry in `steps[]` has: `name`, `plugin`, optional `merge`
- [ ] Invalid YAML or missing required fields produce `PipelineConfigError` before any processing
- [ ] Full config schema documented with all fields, types, and defaults

**Technical Notes:**
- `pipeline.steps[]` replaces previous `parser / processors[] / formatter` structure
- References: Architecture §8

---

### CFG-02: Optional Pipeline Context

**Story:** As a developer, I want to pass optional meeting metadata (participant list, title, project) to the pipeline so that my custom steps can use this context without the SDK imposing any built-in logic on it.

**Priority:** Should Have — Sprint 4
**Estimate:** S (small)

**Acceptance Criteria:**
- [x] `sdk.process(transcript, { context: { participants: [...], title: '...' } })` accepted
- [x] Context available in step via `ctx.state['sdk.meetingContext']`
- [x] SDK applies zero built-in logic to context fields in v1
- [x] Context fields accessible as `Record<string, unknown>` with documented key convention

---

## Epic 6: Reference Skills

### SKL-01: Deterministic Skill Pack

**Story:** As a developer, I want a built-in deterministic skill pack (`clean`, `split`, `de-identify`) so that I can run a useful baseline pipeline without calling an LLM.

**Priority:** Must Have — Sprint 5
**Estimate:** M (medium)

**Acceptance Criteria:**
- [x] `@transcript-sdk/skills-deterministic` package provides `clean-text`, `split-segments`, `de-identify` steps implementing `IStep`
- [x] `clean-text` removes obvious transcript noise (timestamps artifacts, repeated whitespace, filler markers by configurable rules)
- [x] `split-segments` produces deterministic segments with stable IDs
- [x] `de-identify` can pseudonymize person names (`PARTICIPANT_01`, `PARTICIPANT_02`) while preserving speaker consistency in one run
- [x] Each skill has unit tests and README usage examples

**Technical Notes:**
- Deterministic skills must not call external APIs
- References: Architecture modular plugin model

---

### SKL-02: LLM Analysis Skill Pack

**Story:** As a developer, I want built-in LLM skills for summary, action items, and decisions so that I can get structured meeting insights from one pipeline run.

**Priority:** Must Have — Sprint 5
**Estimate:** L (large)

**Acceptance Criteria:**
- [x] `@transcript-sdk/skills-llm` package provides `summarize-llm`, `extract-actions-llm`, `extract-decisions-llm`
- [x] Each LLM skill consumes `ctx.segments` and writes output through `ConversationModelWriter`
- [x] All LLM skills support provider abstraction via adapter (local model or hosted API)
- [x] Timeouts and retries are configurable per LLM skill
- [x] Failures are isolated per skill and reflected via existing step status contract

**Technical Notes:**
- Prompt templates and output schemas versioned per skill
- References: CORE-06, CORE-07

---

### SKL-03: Report Generation Skill

**Story:** As a developer, I want a report-generation skill so that pipeline output can be exported as human-readable meeting notes without custom post-processing.

**Priority:** Should Have — Sprint 5
**Estimate:** M (medium)

**Acceptance Criteria:**
- [ ] `generate-report` skill produces Markdown output with sections: Summary, Actions, Decisions, Topics
- [ ] Report includes step-status appendix for failed/skipped steps
- [ ] Output can be written to `ctx.output` as markdown string or JSON object by config
- [ ] Empty data sections render gracefully without runtime errors

**Technical Notes:**
- Keep report formatting deterministic for snapshot testing

---

### SKL-04: Pipeline Presets by Meeting Type

**Story:** As a developer, I want ready-made pipeline presets for common meeting types so that I can start quickly and customize later.

**Priority:** Should Have — Sprint 5
**Estimate:** S (small)

**Acceptance Criteria:**
- [ ] Presets provided: `general`, `standup`, `strategy`
- [ ] Each preset maps to a valid `pipeline.yaml` template with documented steps
- [ ] Presets can be overridden by user config without editing core code
- [ ] Sample transcripts for each preset produce non-empty output in tests

**Technical Notes:**
- Presets are config templates, not hardcoded branching in core

---

## Epic 7: Integrations

### INT-01: CLI Runner

**Story:** As a developer, I want a CLI entry point so that I can run pipelines from terminal and CI without writing glue code.

**Priority:** Must Have — Sprint 5
**Estimate:** M (medium)

**Acceptance Criteria:**
- [ ] `transcript-sdk run -c pipeline.yaml -i transcript.txt` executes pipeline and returns exit code 0 on success
- [ ] CLI supports input from file and stdin
- [ ] CLI supports output as JSON and Markdown
- [ ] Non-recoverable config/runtime errors return non-zero exit code with concise error message

**Technical Notes:**
- CLI package separated from `@transcript-sdk/core`

---

### INT-02: Scheduler / Queue Worker Mode

**Story:** As a platform engineer, I want worker mode for scheduled or queued processing so that transcripts can be processed asynchronously at scale.

**Priority:** Should Have — Sprint 5
**Estimate:** M (medium)

**Acceptance Criteria:**
- [ ] Worker mode consumes jobs from a queue adapter interface (`enqueue`, `dequeue`, `ack`, `retry`)
- [ ] Job payload includes transcript reference, config reference, and metadata
- [ ] Failed jobs retry with backoff and dead-letter after configured attempts
- [ ] Worker processing emits structured logs compatible with SCALE-03

**Technical Notes:**
- Queue backend is adapter-based (in-memory for tests, pluggable for production)

---

### INT-03: Slash Command Adapter

**Story:** As a developer integrating with chat tools, I want a slash-command adapter so that users can trigger pipeline runs from chat contexts.

**Priority:** Could Have — Sprint 5
**Estimate:** S (small)

**Acceptance Criteria:**
- [ ] Adapter maps slash command payload to SDK `process` call
- [ ] Adapter supports command options for preset and privacy profile
- [ ] Adapter response includes run status and link or inline summary
- [ ] Adapter keeps transport-specific logic outside core package

**Technical Notes:**
- Provide reference implementation and integration test stub

---

## Sprint Planning Summary

### Sprint 1 — Foundation
| Story | Size |
|-------|------|
| CORE-01: Pipeline Execution Engine | L |
| CORE-02: IStep Interface | M |
| CORE-03: Plugin Registry | M |
| CFG-01: Declarative YAML Config | M |

**Goal:** `sdk.process(transcript)` executes a configured step chain end-to-end.

---

### Sprint 2 — Pipeline Completes
| Story | Size |
|-------|------|
| CORE-04: ConversationModel Simple Mode | M |
| CORE-05: ConversationModel Full Object | L |
| SCALE-01: Parallel Chunk Execution | L |
| SCALE-02: Default Merge Strategies | M |
| SEC-01: PII-First Redaction | M |

**Goal:** Full pipeline processes any-length transcript, returns `ConversationModel`, PII safe.

---

### Sprint 3 — Developer Experience
| Story | Size |
|-------|------|
| DX-01: MockConversationBuilder | M |
| DX-02: Language-Agnostic Core | S |

**Goal:** Custom steps testable in isolation. Multilingual transcripts supported.

---

### Sprint 4 — Completion & Polish
| Story | Size |
|-------|------|
| CORE-06: Fault-Tolerant Step Execution | M |
| CORE-07: Runtime Schema Validation | M |
| SCALE-03: Structured JSON Logging | S |
| SCALE-04: Stateless Pipeline Execution | S |
| SEC-02: Configurable Privacy Profiles | S |
| SEC-03: Zero-Log Raw Data Contract | S |
| CFG-02: Optional Pipeline Context | S |

**Goal:** All v1 features complete. Ready for reference plugin development and public release.

---

### Sprint 5 — Skills & Integrations
| Story | Size |
|-------|------|
| SKL-01: Deterministic Skill Pack | M |
| SKL-02: LLM Analysis Skill Pack | L |
| SKL-03: Report Generation Skill | M |
| SKL-04: Pipeline Presets by Meeting Type | S |
| INT-01: CLI Runner | M |
| INT-02: Scheduler / Queue Worker Mode | M |
| INT-03: Slash Command Adapter | S |

**Goal:** Deliver usable reference skills and real integration channels on top of stable core.

---

### Deferred to v2

| Story | Reason |
|-------|--------|
| Project scaffold generator (`create-transcript-app`, dry-run planning) | Reduces scope |
| REPL / Sandbox | Nice-to-have; deferred pending adoption signal |
| Fluent code API | `pipeline.yaml` covers v1 needs |
| Plugin sandboxing and capabilities | Requires ecosystem maturity |
| `ConversationModel.query()` | Semantics unclear |

---

## Definition of Done (all stories)

- [ ] Feature implemented and passing all acceptance criteria
- [ ] Unit tests written and passing (>90% coverage on new code)
- [ ] TypeScript types exported correctly from package
- [ ] JSDoc on all public APIs
- [ ] No raw transcript text in any log path (automated assertion)
- [ ] `npm test` passes in CI
- [ ] README section updated or added if user-facing

---

*Document generated by BMad Master.*
*Next step: Implementation — begin Sprint 1 with monorepo scaffold.*
