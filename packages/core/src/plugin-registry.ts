import type { IStep, IPiiDetector } from './types.js'
import { PluginRegistrationError } from './types.js'

type RegisteredPlugin = IStep | IPiiDetector

function isIStep(plugin: RegisteredPlugin): plugin is IStep {
  return typeof (plugin as IStep).execute === 'function'
}

export class PluginRegistry {
  private readonly steps = new Map<string, IStep>()
  private readonly detectors = new Map<string, IPiiDetector>()

  registerStep(name: string, step: IStep): void {
    this.validateStepShape(name, step)
    if (this.steps.has(name)) {
      throw new PluginRegistrationError(
        `Step '${name}' is already registered. Use a unique name.`,
      )
    }
    this.steps.set(name, step)
  }

  registerDetector(name: string, detector: IPiiDetector): void {
    if (!detector.version || typeof detector.version !== 'string') {
      throw new PluginRegistrationError(
        `IPiiDetector '${name}' must have a non-empty 'version' string.`,
      )
    }
    if (!detector.redact || typeof detector.redact !== 'function') {
      throw new PluginRegistrationError(
        `IPiiDetector '${name}' must implement redact(text): PiiRedactionResult.`,
      )
    }
    if (this.detectors.has(name)) {
      throw new PluginRegistrationError(
        `PiiDetector '${name}' is already registered. Use a unique name.`,
      )
    }
    this.detectors.set(name, detector)
  }

  resolveStep(name: string): IStep {
    const step = this.steps.get(name)
    if (!step) {
      throw new PluginRegistrationError(
        `Step '${name}' is not registered. Available steps: [${[...this.steps.keys()].join(', ')}]`,
      )
    }
    return step
  }

  resolveDetector(name: string): IPiiDetector {
    const detector = this.detectors.get(name)
    if (!detector) {
      throw new PluginRegistrationError(
        `PiiDetector '${name}' is not registered. Available detectors: [${[...this.detectors.keys()].join(', ')}]`,
      )
    }
    return detector
  }

  hasStep(name: string): boolean {
    return this.steps.has(name)
  }

  private validateStepShape(name: string, step: IStep): void {
    if (!step.name || typeof step.name !== 'string') {
      throw new PluginRegistrationError(
        `Step registered as '${name}' must have a non-empty 'name' string.`,
      )
    }
    if (!step.version || typeof step.version !== 'string') {
      throw new PluginRegistrationError(
        `Step '${name}' must have a non-empty 'version' string.`,
      )
    }
    if (typeof step.execute !== 'function') {
      throw new PluginRegistrationError(
        `Step '${name}' must implement execute(ctx, next): Promise<void>.`,
      )
    }
  }
}
