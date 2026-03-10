import type {
  ActionItem,
  ActionFilter,
  ConversationJSON,
  ConversationModelWriter,
  Decision,
  StepStatus,
  Topic,
} from './types.js'

export class ConversationModel {
  private _summary: string | null = null
  private _actions: ActionItem[] = []
  private _decisions: Decision[] = []
  private _topics: Topic[] = []
  private _stepStatuses = new Map<string, StepStatus>()
  private _degraded = false

  // ─── Read API ──────────────────────────────────────────────────────────────

  getSummary(): string | null {
    return this._summary
  }

  getActions(filter?: ActionFilter): ActionItem[] {
    let items = this._actions
    if (filter?.status !== undefined) {
      items = items.filter((a) => a.status === filter.status)
    }
    if (filter?.assignee !== undefined) {
      items = items.filter((a) => a.assignee === filter.assignee)
    }
    return [...items]
  }

  getDecisions(): Decision[] {
    return [...this._decisions]
  }

  getTopics(): Topic[] {
    return [...this._topics].sort((a, b) => b.relevance - a.relevance)
  }

  getStepStatus(stepName: string): StepStatus | undefined {
    return this._stepStatuses.get(stepName)
  }

  isDegraded(): boolean {
    return this._degraded
  }

  // ─── Serialization ─────────────────────────────────────────────────────────

  toJSON(): ConversationJSON {
    const stepStatuses: Record<string, StepStatus> = {}
    for (const [k, v] of this._stepStatuses) {
      stepStatuses[k] = v
    }
    return {
      summary: this._summary,
      actions: this.getActions(),
      decisions: this.getDecisions(),
      topics: this.getTopics(),
      stepStatuses,
      degraded: this._degraded,
    }
  }

  // ─── Writer interface ──────────────────────────────────────────────────────

  asWriter(): ConversationModelWriter {
    return {
      setSummary: (value) => {
        this._summary = value
      },
      addAction: (item) => {
        this._actions.push(item)
      },
      addDecision: (item) => {
        this._decisions.push(item)
      },
      addTopic: (item) => {
        this._topics.push(item)
      },
      markStepSuccess: (stepName, durationMs) => {
        this._stepStatuses.set(stepName, { status: 'success', durationMs })
      },
      markStepFailed: (stepName, error) => {
        const existing = this._stepStatuses.get(stepName)
        const durationMs =
          existing && existing.status !== 'skipped' ? existing.durationMs : 0
        this._stepStatuses.set(stepName, {
          status: 'failed',
          durationMs,
          error: error.message,
        })
      },
    }
  }

  // ─── Internal merge helpers (used by pipeline engine) ─────────────────────

  /** @internal */
  _setDegraded(): void {
    this._degraded = true
  }

  /** @internal — copy everything from another model into this one */
  _mergeFrom(other: ConversationModel): void {
    if (other._summary !== null) this._summary = other._summary
    this._actions.push(...other._actions)
    this._decisions.push(...other._decisions)
    this._topics.push(...other._topics)
    this._mergeStatusesFrom(other)
  }

  /** @internal — copy only step statuses (last-write-wins per step name) */
  _mergeStatusesFrom(other: ConversationModel): void {
    for (const [k, v] of other._stepStatuses) {
      this._stepStatuses.set(k, v)
    }
  }
}
