import { describe, it, expect } from 'vitest'
import { PluginRegistry } from '../plugin-registry.js'
import { PluginRegistrationError } from '../types.js'
import type { IStep, StepContext } from '../types.js'

const makeStep = (overrides: Partial<IStep> = {}): IStep => ({
  name: 'test-step',
  version: '1.0.0',
  execute: async (_ctx: StepContext, next: () => Promise<void>) => { await next() },
  ...overrides,
})

describe('PluginRegistry', () => {
  it('registers and resolves a step', () => {
    const registry = new PluginRegistry()
    const step = makeStep()
    registry.registerStep('my-step', step)
    expect(registry.resolveStep('my-step')).toBe(step)
  })

  it('throws on duplicate step name', () => {
    const registry = new PluginRegistry()
    registry.registerStep('my-step', makeStep())
    expect(() => registry.registerStep('my-step', makeStep())).toThrowError(
      PluginRegistrationError,
    )
  })

  it('throws when resolving unknown step', () => {
    const registry = new PluginRegistry()
    expect(() => registry.resolveStep('missing')).toThrowError(PluginRegistrationError)
  })

  it('throws if step has no name', () => {
    const registry = new PluginRegistry()
    expect(() =>
      registry.registerStep('x', makeStep({ name: '' })),
    ).toThrowError(PluginRegistrationError)
  })

  it('throws if step has no version', () => {
    const registry = new PluginRegistry()
    expect(() =>
      registry.registerStep('x', makeStep({ version: '' })),
    ).toThrowError(PluginRegistrationError)
  })

  it('throws if step has no execute function', () => {
    const registry = new PluginRegistry()
    const bad = { name: 'x', version: '1.0.0' } as unknown as IStep
    expect(() => registry.registerStep('x', bad)).toThrowError(PluginRegistrationError)
  })

  it('hasStep returns true only after registration', () => {
    const registry = new PluginRegistry()
    expect(registry.hasStep('x')).toBe(false)
    registry.registerStep('x', makeStep())
    expect(registry.hasStep('x')).toBe(true)
  })
})
