import { ConversationModel } from '@transcript-sdk/core'
import type { ActionItem, Decision, Topic } from '@transcript-sdk/core'

let _idCounter = 0
function nextId(): string {
  return `mock-${++_idCounter}`
}

export interface MockOptions {
  /** Reset the auto-increment ID counter (useful for deterministic test output) */
  resetIds?: boolean
}

/**
 * Fluent builder for constructing ConversationModel test fixtures.
 *
 * @example
 * const model = new MockConversationBuilder()
 *   .withSummary('Discussed Q2 roadmap')
 *   .withAction({ text: 'Update API docs', assignee: 'ivan' })
 *   .withDecision('Adopt PostgreSQL')
 *   .withTopic({ label: 'Budget', relevance: 0.9 })
 *   .withFailedStep('summarize', new Error('timeout'))
 *   .build()
 */
export class MockConversationBuilder {
  private _summary: string | null = null
  private _actions: ActionItem[] = []
  private _decisions: Decision[] = []
  private _topics: Topic[] = []
  private _successSteps: Array<{ name: string; durationMs: number }> = []
  private _failedSteps: Array<{ name: string; error: Error }> = []

  constructor(options?: MockOptions) {
    if (options?.resetIds) _idCounter = 0
  }

  withSummary(text: string): this {
    this._summary = text
    return this
  }

  /** Add a specific action item. `id` and `status` default to auto-generated values. */
  withAction(item: Partial<ActionItem> & { text: string }): this {
    const a: ActionItem = { id: item.id ?? nextId(), text: item.text, status: item.status ?? 'open' }
    if (item.assignee !== undefined) a.assignee = item.assignee
    if (item.dueDate !== undefined) a.dueDate = item.dueDate
    if (item.sourceSegmentId !== undefined) a.sourceSegmentId = item.sourceSegmentId
    this._actions.push(a)
    return this
  }

  /** Add `n` auto-generated placeholder action items. */
  withActions(n: number): this {
    for (let i = 0; i < n; i++) {
      this._actions.push({ id: nextId(), text: `Action item ${i + 1}`, status: 'open' })
    }
    return this
  }

  withDecision(textOrItem: string | (Partial<Decision> & { text: string })): this {
    if (typeof textOrItem === 'string') {
      this._decisions.push({ id: nextId(), text: textOrItem })
    } else {
      const d: Decision = { id: textOrItem.id ?? nextId(), text: textOrItem.text }
      if (textOrItem.madeBy !== undefined) d.madeBy = textOrItem.madeBy
      if (textOrItem.sourceSegmentId !== undefined) d.sourceSegmentId = textOrItem.sourceSegmentId
      this._decisions.push(d)
    }
    return this
  }

  withTopic(item: Partial<Topic> & { label: string }): this {
    this._topics.push({
      id: item.id ?? nextId(),
      label: item.label,
      relevance: item.relevance ?? 0.5,
    })
    return this
  }

  withSuccessStep(name: string, durationMs = 0): this {
    this._successSteps.push({ name, durationMs })
    return this
  }

  withFailedStep(name: string, error: Error): this {
    this._failedSteps.push({ name, error })
    return this
  }

  build(): ConversationModel {
    const model = new ConversationModel()
    const writer = model.asWriter()

    if (this._summary !== null) writer.setSummary(this._summary)
    for (const a of this._actions) writer.addAction(a)
    for (const d of this._decisions) writer.addDecision(d)
    for (const t of this._topics) writer.addTopic(t)
    for (const s of this._successSteps) writer.markStepSuccess(s.name, s.durationMs)
    for (const f of this._failedSteps) writer.markStepFailed(f.name, f.error)

    return model
  }
}
