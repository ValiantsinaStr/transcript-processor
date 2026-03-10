import { describe, it, expect } from 'vitest'
import { mergeChunkModels, semanticMergeActions, semanticMergeDecisions, clusterTopics } from '../merge.js'
import { ConversationModel } from '../conversation-model.js'
import type { StepConfig, ActionItem, Decision, Topic } from '../types.js'

function makeModel(opts: {
  summary?: string
  actions?: Array<{ id: string; text: string; assignee?: string }>
  decisions?: Array<{ id: string; text: string; madeBy?: string }>
  topics?: Array<{ id: string; label: string; relevance: number }>
}): ConversationModel {
  const m = new ConversationModel()
  const w = m.asWriter()
  if (opts.summary) w.setSummary(opts.summary)
  for (const a of opts.actions ?? []) w.addAction({ ...a, status: 'open' })
  for (const d of opts.decisions ?? []) w.addDecision(d)
  for (const t of opts.topics ?? []) w.addTopic(t)
  return m
}

const concatSteps: StepConfig[] = [
  { name: 'extract-actions', plugin: 'p', merge: 'concat' },
  { name: 'summarize', plugin: 'p', merge: 'concat' },
]

const dedupeSteps: StepConfig[] = [
  { name: 'detect-topics', plugin: 'p', merge: 'deduplicate' },
  { name: 'extract-actions', plugin: 'p', merge: 'deduplicate' },
]

const semanticSteps: StepConfig[] = [
  { name: 'extract-actions', plugin: 'p', merge: 'semantic' },
  { name: 'extract-decisions', plugin: 'p', merge: 'semantic' },
]

const clusterSteps: StepConfig[] = [
  { name: 'detect-topics', plugin: 'p', merge: 'cluster' },
]

// ── Existing tests ─────────────────────────────────────────────────────────

describe('mergeChunkModels', () => {
  it('single chunk — returns it directly', () => {
    const m = makeModel({ summary: 'hello', actions: [{ id: '1', text: 'Do thing' }] })
    const { model } = mergeChunkModels([m], concatSteps)
    expect(model.getSummary()).toBe('hello')
    expect(model.getActions()).toHaveLength(1)
  })

  it('concat — combines actions from all chunks in order', () => {
    const m1 = makeModel({ actions: [{ id: '1', text: 'First' }] })
    const m2 = makeModel({ actions: [{ id: '2', text: 'Second' }] })
    const { model } = mergeChunkModels([m1, m2], concatSteps)
    expect(model.getActions()).toHaveLength(2)
    expect(model.getActions()[0]!.text).toBe('First')
    expect(model.getActions()[1]!.text).toBe('Second')
  })

  it('deduplicate — removes exact normalized duplicates', () => {
    const m1 = makeModel({ topics: [{ id: '1', label: 'Budget', relevance: 0.8 }] })
    const m2 = makeModel({ topics: [{ id: '2', label: 'Budget', relevance: 0.7 }] })
    const { model } = mergeChunkModels([m1, m2], dedupeSteps)
    expect(model.getTopics()).toHaveLength(1)
    expect(model.getTopics()[0]!.relevance).toBe(0.8)
  })

  it('deduplicate — keeps distinct items', () => {
    const m1 = makeModel({ actions: [{ id: '1', text: 'Update docs' }] })
    const m2 = makeModel({ actions: [{ id: '2', text: 'Fix bug' }] })
    const { model } = mergeChunkModels([m1, m2], dedupeSteps)
    expect(model.getActions()).toHaveLength(2)
  })

  it('summarize-of-summaries falls back to concat and sets degraded', () => {
    const steps: StepConfig[] = [{ name: 'summarize', plugin: 'p', merge: 'summarize-of-summaries' }]
    const m1 = makeModel({ summary: 'Part one.' })
    const m2 = makeModel({ summary: 'Part two.' })
    const { model, degraded } = mergeChunkModels([m1, m2], steps)
    expect(model.getSummary()).toContain('Part one.')
    expect(model.getSummary()).toContain('Part two.')
    expect(degraded).toBe(true)
  })

  it('summarize-of-summaries deduplicates repeated sentences', () => {
    const steps: StepConfig[] = [{ name: 'summarize', plugin: 'p', merge: 'summarize-of-summaries' }]
    const sentence = 'The team agreed to ship the feature next week.'
    const m1 = makeModel({ summary: sentence })
    const m2 = makeModel({ summary: sentence })
    const { model } = mergeChunkModels([m1, m2], steps)
    const count = (model.getSummary() ?? '').split(sentence).length - 1
    expect(count).toBe(1)
  })

  it('degraded false when no summarize-of-summaries used', () => {
    const { degraded } = mergeChunkModels(
      [makeModel({ summary: 'A' }), makeModel({ summary: 'B' })],
      concatSteps,
    )
    expect(degraded).toBe(false)
  })

  it('empty chunks array returns empty model', () => {
    const { model } = mergeChunkModels([], concatSteps)
    expect(model.getSummary()).toBeNull()
    expect(model.getActions()).toHaveLength(0)
  })
})

// ── Semantic merge — actions ───────────────────────────────────────────────

describe('semanticMergeActions', () => {
  it('merges near-duplicate actions (Jaccard >= 0.75)', () => {
    // { update, project, docs } vs { update, project, docs, now } → 3/4 = 0.75
    const items: ActionItem[] = [
      { id: '1', text: 'Update project docs', status: 'open' },
      { id: '2', text: 'Update project docs now', status: 'open' },
    ]
    expect(semanticMergeActions(items)).toHaveLength(1)
  })

  it('keeps the item with more metadata when merging', () => {
    const items: ActionItem[] = [
      { id: '1', text: 'Update project docs', status: 'open' },
      { id: '2', text: 'Update project docs now', status: 'open', assignee: 'alice' },
    ]
    const result = semanticMergeActions(items)
    expect(result[0]!.assignee).toBe('alice')
  })

  it('preserves distinct actions (low word overlap)', () => {
    const items: ActionItem[] = [
      { id: '1', text: 'Deploy to production server', status: 'open' },
      { id: '2', text: 'Review pull request code', status: 'open' },
    ]
    expect(semanticMergeActions(items)).toHaveLength(2)
  })

  it('handles empty input', () => {
    expect(semanticMergeActions([])).toEqual([])
  })

  it('handles single item', () => {
    const items: ActionItem[] = [{ id: '1', text: 'Do something', status: 'open' }]
    expect(semanticMergeActions(items)).toHaveLength(1)
  })

  it('merges via mergeChunkModels with semantic strategy', () => {
    const m1 = makeModel({ actions: [{ id: '1', text: 'Fix login issue app' }] })
    const m2 = makeModel({ actions: [{ id: '2', text: 'Fix login issue app now', assignee: 'bob' }] })
    const { model } = mergeChunkModels([m1, m2], semanticSteps)
    expect(model.getActions()).toHaveLength(1)
    expect(model.getActions()[0]!.assignee).toBe('bob')
  })
})

// ── Semantic merge — decisions ─────────────────────────────────────────────

describe('semanticMergeDecisions', () => {
  it('merges near-duplicate decisions', () => {
    // { we, will, migrate, to, new, database } vs same + { system } → 6/7 = 0.86
    const items: Decision[] = [
      { id: '1', text: 'We will migrate to new database' },
      { id: '2', text: 'We will migrate to new database system', madeBy: 'CTO' },
    ]
    const result = semanticMergeDecisions(items)
    expect(result).toHaveLength(1)
    expect(result[0]!.madeBy).toBe('CTO')
  })

  it('preserves distinct decisions', () => {
    const items: Decision[] = [
      { id: '1', text: 'Adopt TypeScript for all new services' },
      { id: '2', text: 'Freeze hiring until Q4 budget review' },
    ]
    expect(semanticMergeDecisions(items)).toHaveLength(2)
  })

  it('handles empty input', () => {
    expect(semanticMergeDecisions([])).toEqual([])
  })
})

// ── Topic clustering ───────────────────────────────────────────────────────

describe('clusterTopics', () => {
  it('clusters identical labels', () => {
    const items: Topic[] = [
      { id: '1', label: 'Sprint Planning', relevance: 0.6 },
      { id: '2', label: 'Sprint Planning', relevance: 0.5 },
    ]
    expect(clusterTopics(items)).toHaveLength(1)
  })

  it('keeps the label from the highest-relevance topic', () => {
    const items: Topic[] = [
      { id: '1', label: 'Budget Review', relevance: 0.9 },
      { id: '2', label: 'Budget Review', relevance: 0.4 },
    ]
    expect(clusterTopics(items)[0]!.id).toBe('1')
  })

  it('sums relevance within a cluster, capped at 1.0', () => {
    const items: Topic[] = [
      { id: '1', label: 'Budget Review', relevance: 0.7 },
      { id: '2', label: 'Budget Review', relevance: 0.6 },
    ]
    expect(clusterTopics(items)[0]!.relevance).toBe(1.0)
  })

  it('sums relevance correctly when sum is below 1.0', () => {
    const items: Topic[] = [
      { id: '1', label: 'Sprint Planning', relevance: 0.3 },
      { id: '2', label: 'Sprint Planning', relevance: 0.4 },
    ]
    expect(clusterTopics(items)[0]!.relevance).toBeCloseTo(0.7)
  })

  it('does not cluster unrelated topics', () => {
    const items: Topic[] = [
      { id: '1', label: 'Security Audit', relevance: 0.8 },
      { id: '2', label: 'Team Hiring', relevance: 0.7 },
    ]
    expect(clusterTopics(items)).toHaveLength(2)
  })

  it('handles empty input', () => {
    expect(clusterTopics([])).toEqual([])
  })

  it('handles single item', () => {
    const items: Topic[] = [{ id: '1', label: 'Security', relevance: 0.5 }]
    expect(clusterTopics(items)).toHaveLength(1)
  })

  it('merges via mergeChunkModels with cluster strategy', () => {
    const m1 = makeModel({ topics: [{ id: '1', label: 'Sprint Planning', relevance: 0.3 }] })
    const m2 = makeModel({ topics: [{ id: '2', label: 'Sprint Planning', relevance: 0.4 }] })
    const { model } = mergeChunkModels([m1, m2], clusterSteps)
    expect(model.getTopics()).toHaveLength(1)
    expect(model.getTopics()[0]!.relevance).toBeCloseTo(0.7)
  })
})
