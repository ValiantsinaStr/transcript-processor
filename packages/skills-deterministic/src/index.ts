import type { PluginRegistry } from '@transcript-sdk/core'
import { CleanTextStep } from './clean-text.js'
import { SplitSegmentsStep } from './split-segments.js'
import { DeIdentifyStep } from './de-identify.js'

export { CleanTextStep } from './clean-text.js'
export type { CleanTextStepOptions } from './clean-text.js'

export { SplitSegmentsStep } from './split-segments.js'
export type { SplitSegmentsStepOptions } from './split-segments.js'

export { DeIdentifyStep } from './de-identify.js'
export type { DeIdentifyStepOptions } from './de-identify.js'

export function registerDeterministicSkills(registry: PluginRegistry): void {
    registry.registerStep('clean-text', new CleanTextStep())
    registry.registerStep('split-segments', new SplitSegmentsStep())
    registry.registerStep('de-identify', new DeIdentifyStep())
}
