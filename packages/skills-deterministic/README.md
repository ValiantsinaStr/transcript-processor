# @transcript-sdk/skills-deterministic

Deterministic, no-network skill pack for Transcript SDK pipelines.

## Included Steps

- `clean-text`: removes transcript noise and normalizes whitespace.
- `split-segments`: converts text into deterministic transcript segments.
- `de-identify`: pseudonymizes person names and speaker IDs.

## Usage

```ts
import { PluginRegistry } from '@transcript-sdk/core'
import {
  CleanTextStep,
  SplitSegmentsStep,
  DeIdentifyStep,
  registerDeterministicSkills,
} from '@transcript-sdk/skills-deterministic'

const registry = new PluginRegistry()
registerDeterministicSkills(registry)

// or register individually
registry.registerStep('clean-text', new CleanTextStep())
registry.registerStep('split-segments', new SplitSegmentsStep())
registry.registerStep('de-identify', new DeIdentifyStep())
```

## Notes

- Skills are deterministic and do not call external APIs.
- `de-identify` keeps one shared participant map in `ctx.pipelineState` so names remain consistent in a run.
