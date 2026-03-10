import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import type { SDKConfig, ChunkingConfig, PrivacyConfig } from '../types.js'
import { PipelineConfigError } from '../types.js'

const SUPPORTED_SCHEMA_VERSION = '1.0.0'
const LOG_LEVELS: SDKConfig['logging']['level'][] = ['debug', 'info', 'warn', 'error']

const DEFAULT_CHUNKING: ChunkingConfig = {
  chunkSize: 2000,
  overlap: 100,
  maxParallel: 4,
  memoryLimitMb: 512,
}

const DEFAULT_PRIVACY: PrivacyConfig = {
  piiRedaction: true,
  piiDetectorPlugin: null,
  replacements: {
    email: '[Email]',
    phone: '[Phone]',
    name: '[Person]',
  },
}

export function loadConfig(configPath?: string): SDKConfig {
  const path = configPath
    ? resolve(configPath)
    : join(process.cwd(), 'pipeline.yaml')

  if (!existsSync(path)) {
    throw new PipelineConfigError(
      `pipeline.yaml not found at '${path}'. Create one or pass an explicit config path.`,
    )
  }

  let raw: unknown
  try {
    raw = parseYaml(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new PipelineConfigError(
      `Failed to parse '${path}': ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  return validateConfig(raw, path)
}

export function buildConfig(partial: Partial<SDKConfig>): SDKConfig {
  return validateConfig(partial, '<code>')
}

function validateConfig(raw: unknown, source: string): SDKConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PipelineConfigError(`Config in '${source}' must be a YAML/JSON object.`)
  }

  const obj = raw as Record<string, unknown>

  if (!obj['schemaVersion'] || typeof obj['schemaVersion'] !== 'string') {
    throw new PipelineConfigError(
      `Config '${source}' missing required field 'schemaVersion' (string).`,
    )
  }

  if (obj['schemaVersion'] !== SUPPORTED_SCHEMA_VERSION) {
    throw new PipelineConfigError(
      `Config '${source}': unsupported schemaVersion '${String(
        obj['schemaVersion'],
      )}'. Expected '${SUPPORTED_SCHEMA_VERSION}'.`,
    )
  }

  const pipeline = obj['pipeline']
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    throw new PipelineConfigError(
      `Config '${source}' missing required 'pipeline' section.`,
    )
  }

  const pipelineObj = pipeline as Record<string, unknown>
  const steps = pipelineObj['steps']

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new PipelineConfigError(
      `Config '${source}': 'pipeline.steps' must be a non-empty array.`,
    )
  }

  for (const [i, step] of steps.entries()) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new PipelineConfigError(
        `Config '${source}': pipeline.steps[${i}] must be an object.`,
      )
    }
    const s = step as Record<string, unknown>
    if (!s['name'] || typeof s['name'] !== 'string') {
      throw new PipelineConfigError(
        `Config '${source}': pipeline.steps[${i}] missing 'name'.`,
      )
    }
    if (!s['plugin'] || typeof s['plugin'] !== 'string') {
      throw new PipelineConfigError(
        `Config '${source}': pipeline.steps[${i}] ('${s['name']}') missing 'plugin'.`,
      )
    }
  }

  const outputMode = (obj['output'] as Record<string, unknown> | undefined)?.['mode']
  if (outputMode !== undefined && outputMode !== 'simple' && outputMode !== 'model') {
    throw new PipelineConfigError(
      `Config '${source}': output.mode must be 'simple' or 'model'.`,
    )
  }

  const loggingLevel = (obj['logging'] as Record<string, unknown> | undefined)?.['level']
  if (loggingLevel !== undefined && (typeof loggingLevel !== 'string' || !LOG_LEVELS.includes(loggingLevel as SDKConfig['logging']['level']))) {
    throw new PipelineConfigError(
      `Config '${source}': logging.level must be one of ${LOG_LEVELS.join(', ')}.`,
    )
  }

  const chunking = { ...DEFAULT_CHUNKING, ...((obj['chunking'] as Partial<ChunkingConfig>) ?? {}) }
  validateChunking(chunking, source)

  const privacy = { ...DEFAULT_PRIVACY, ...((obj['privacy'] as Partial<PrivacyConfig>) ?? {}) }
  validatePrivacy(privacy, source)

  return {
    schemaVersion: obj['schemaVersion'] as string,
    chunking,
    privacy,
    pipeline: {
      steps: (steps as Array<Record<string, unknown>>).map((s) => ({
        name: s['name'] as string,
        plugin: s['plugin'] as string,
        merge: s['merge'] as SDKConfig['pipeline']['steps'][number]['merge'],
      })),
    },
    output: {
      mode: (outputMode as 'simple' | 'model') ?? 'simple',
    },
    logging: {
      level: (loggingLevel as SDKConfig['logging']['level']) ?? 'info',
    },
  }
}

function validateChunking(chunking: ChunkingConfig, source: string): void {
  assertPositiveInteger(chunking.chunkSize, 'chunking.chunkSize', source)
  assertNonNegativeInteger(chunking.overlap, 'chunking.overlap', source)
  assertPositiveInteger(chunking.maxParallel, 'chunking.maxParallel', source)
  assertPositiveInteger(chunking.memoryLimitMb, 'chunking.memoryLimitMb', source)
}

function validatePrivacy(privacy: PrivacyConfig, source: string): void {
  if (typeof privacy.piiRedaction !== 'boolean') {
    throw new PipelineConfigError(`Config '${source}': privacy.piiRedaction must be boolean.`)
  }
  if (privacy.piiDetectorPlugin !== null && typeof privacy.piiDetectorPlugin !== 'string') {
    throw new PipelineConfigError(
      `Config '${source}': privacy.piiDetectorPlugin must be string or null.`,
    )
  }
  const replacements = privacy.replacements as Record<string, unknown>
  for (const key of ['email', 'phone', 'name']) {
    if (typeof replacements[key] !== 'string' || replacements[key].length === 0) {
      throw new PipelineConfigError(
        `Config '${source}': privacy.replacements.${key} must be a non-empty string.`,
      )
    }
  }
}

function assertPositiveInteger(value: unknown, field: string, source: string): void {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new PipelineConfigError(`Config '${source}': ${field} must be a positive integer.`)
  }
}

function assertNonNegativeInteger(value: unknown, field: string, source: string): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new PipelineConfigError(
      `Config '${source}': ${field} must be a non-negative integer.`,
    )
  }
}
