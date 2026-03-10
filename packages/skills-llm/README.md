# @transcript-sdk/skills-llm

LLM-based skill pack for Transcript SDK pipelines.

## Included Steps

- `summarize-llm`
- `extract-actions-llm`
- `extract-decisions-llm`

## Features

- Provider abstraction through `LlmProviderAdapter`
- Per-skill configurable timeout and retry policy
- Versioned prompt templates and output schemas

## Quick Start

```ts
import { PluginRegistry } from '@transcript-sdk/core'
import {
  SummarizeLlmStep,
  ExtractActionsLlmStep,
  ExtractDecisionsLlmStep,
  registerLlmSkills,
} from '@transcript-sdk/skills-llm'
import { createLocalHttpAdapter } from '@transcript-sdk/skills-llm'

const registry = new PluginRegistry()
const adapter = createLocalHttpAdapter({
  endpoint: 'http://localhost:11434/api/generate',
  model: 'llama3.1:8b',
})

registerLlmSkills(registry, adapter)

// or register with custom options
registry.registerStep(
  'summarize-llm',
  new SummarizeLlmStep(adapter, { timeoutMs: 20_000, retries: 2 }),
)
```

## Adapter Notes

- `createLocalHttpAdapter` demonstrates local-model integration.
- `createHostedHttpAdapter` demonstrates hosted API integration with headers.
- You can provide any custom adapter implementing `LlmProviderAdapter`.
