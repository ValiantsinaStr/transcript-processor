import { describe, it, expect } from 'vitest'
import { buildConfig } from '../config/loader.js'
import { PipelineConfigError } from '../types.js'

describe('buildConfig', () => {
  const validBase = {
    schemaVersion: '1.0.0',
    pipeline: {
      steps: [{ name: 'parse', plugin: 'default-parser' }],
    },
  }

  it('builds config with defaults', () => {
    const cfg = buildConfig(validBase)
    expect(cfg.chunking.chunkSize).toBe(2000)
    expect(cfg.privacy.piiRedaction).toBe(true)
    expect(cfg.output.mode).toBe('simple')
    expect(cfg.logging.level).toBe('info')
  })

  it('merges chunking overrides', () => {
    const cfg = buildConfig({ ...validBase, chunking: { chunkSize: 500, overlap: 50, maxParallel: 2, memoryLimitMb: 256 } })
    expect(cfg.chunking.chunkSize).toBe(500)
  })

  it('throws on missing schemaVersion', () => {
    expect(() => buildConfig({ pipeline: validBase.pipeline } as never)).toThrowError(
      PipelineConfigError,
    )
  })

  it('throws on missing pipeline', () => {
    expect(() => buildConfig({ schemaVersion: '1.0.0' } as never)).toThrowError(
      PipelineConfigError,
    )
  })

  it('throws on empty steps array', () => {
    expect(() =>
      buildConfig({ schemaVersion: '1.0.0', pipeline: { steps: [] } }),
    ).toThrowError(PipelineConfigError)
  })

  it('throws on step missing plugin', () => {
    expect(() =>
      buildConfig({
        schemaVersion: '1.0.0',
        pipeline: { steps: [{ name: 'x' } as never] },
      }),
    ).toThrowError(PipelineConfigError)
  })

  it('throws on invalid output.mode', () => {
    expect(() =>
      buildConfig({ ...validBase, output: { mode: 'invalid' as never } }),
    ).toThrowError(PipelineConfigError)
  })

  it('throws on unsupported schemaVersion', () => {
    expect(() =>
      buildConfig({ ...validBase, schemaVersion: '2.0.0' }),
    ).toThrowError(PipelineConfigError)
  })

  it('throws on invalid logging.level', () => {
    expect(() =>
      buildConfig({ ...validBase, logging: { level: 'trace' as never } }),
    ).toThrowError(PipelineConfigError)
  })

  it('throws on non-positive chunking values', () => {
    expect(() =>
      buildConfig({
        ...validBase,
        chunking: { chunkSize: 0, overlap: 10, maxParallel: 1, memoryLimitMb: 256 },
      }),
    ).toThrowError(PipelineConfigError)

    expect(() =>
      buildConfig({
        ...validBase,
        chunking: { chunkSize: 2000, overlap: 10, maxParallel: -1, memoryLimitMb: 256 },
      }),
    ).toThrowError(PipelineConfigError)
  })

  it('throws on negative overlap', () => {
    expect(() =>
      buildConfig({
        ...validBase,
        chunking: { chunkSize: 2000, overlap: -1, maxParallel: 4, memoryLimitMb: 512 },
      }),
    ).toThrowError(PipelineConfigError)
  })

  it('throws on invalid privacy config shape', () => {
    expect(() =>
      buildConfig({
        ...validBase,
        privacy: {
          piiRedaction: 'yes' as never,
          piiDetectorPlugin: null,
          replacements: { email: '[Email]', phone: '[Phone]', name: '[Person]' },
        },
      }),
    ).toThrowError(PipelineConfigError)

    expect(() =>
      buildConfig({
        ...validBase,
        privacy: {
          piiRedaction: true,
          piiDetectorPlugin: 42 as never,
          replacements: { email: '[Email]', phone: '[Phone]', name: '[Person]' },
        },
      }),
    ).toThrowError(PipelineConfigError)

    expect(() =>
      buildConfig({
        ...validBase,
        privacy: {
          piiRedaction: true,
          piiDetectorPlugin: null,
          replacements: { email: '', phone: '[Phone]', name: '[Person]' },
        },
      }),
    ).toThrowError(PipelineConfigError)
  })
})
