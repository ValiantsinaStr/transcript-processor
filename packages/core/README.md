# @transcript-sdk/core

Core runtime for Transcript Processing SDK.

## Getting Started

`sdk.process(transcript)` returns simple JSON output by default.
Use `sdk.process(transcript, { mode: 'model' })` to get a full `ConversationModel` instance.

## Logging And Data Safety Contract

The SDK emits structured NDJSON logs and guarantees that raw `RawTranscript` content is never logged.

Guarantees in v1:
- Raw transcript text is never written to logs at any log level.
- `RawTranscript` objects are never serialized by the logger.
- Step failures are sanitized before logging, including transcript fragment replacement with `[REDACTED_TRANSCRIPT]`.
- Lifecycle log events (`pipeline.start`, `step.complete`, `step.failed`, `merge.complete`, `output.emitted`, `pipeline.complete`) contain only metadata fields.

This contract is enforced by automated tests in `packages/core/src/__tests__/sdk.test.ts`.
