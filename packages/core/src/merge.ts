import type { ActionItem, Decision, Topic, StepConfig } from './types.js'
import { ConversationModel } from './conversation-model.js'

export function mergeChunkModels(
  chunks: ConversationModel[],
  stepConfigs: StepConfig[],
): { model: ConversationModel; degraded: boolean } {
  const merged = new ConversationModel()
  const writer = merged.asWriter()
  let degraded = false

  if (chunks.length === 0) return { model: merged, degraded }
  if (chunks.length === 1) {
    merged._mergeFrom(chunks[0]!)
    return { model: merged, degraded }
  }

  const summaryStrategy = findSummaryStrategy(stepConfigs)
  const summaries = chunks.map((c) => c.getSummary()).filter((s): s is string => s !== null)
  if (summaries.length > 0) {
    if (summaryStrategy === 'summarize-of-summaries') {
      writer.setSummary(dedupeSentences(summaries.join('\n\n')))
      degraded = true
    } else {
      writer.setSummary(summaries.join('\n\n'))
    }
  }

  const allActions = chunks.flatMap((c) => c.getActions())
  const actionStrategy = findStrategyForField('actions', stepConfigs)
  const mergedActions =
    actionStrategy === 'semantic'
      ? semanticMergeActions(allActions)
      : actionStrategy === 'deduplicate'
        ? deduplicateActions(allActions)
        : allActions
  for (const a of mergedActions) writer.addAction(a)

  const allDecisions = chunks.flatMap((c) => c.getDecisions())
  const decisionStrategy = findStrategyForField('decisions', stepConfigs)
  const mergedDecisions =
    decisionStrategy === 'semantic'
      ? semanticMergeDecisions(allDecisions)
      : decisionStrategy === 'deduplicate'
        ? deduplicateDecisions(allDecisions)
        : allDecisions
  for (const d of mergedDecisions) writer.addDecision(d)

  const allTopics = chunks.flatMap((c) => c.getTopics())
  const topicStrategy = findStrategyForField('topics', stepConfigs)
  const mergedTopics =
    topicStrategy === 'cluster'
      ? clusterTopics(allTopics)
      : topicStrategy === 'deduplicate'
        ? deduplicateTopics(allTopics)
        : allTopics
  for (const t of mergedTopics) writer.addTopic(t)

  for (const chunk of chunks) {
    merged._mergeStatusesFrom(chunk)
  }

  return { model: merged, degraded }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim()
}

function tokenSet(text: string): Set<string> {
  return new Set(normalize(text).split(' ').filter(Boolean))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0
  for (const word of a) {
    if (b.has(word)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 1 : intersection / union
}

function deduplicateActions(items: ActionItem[]): ActionItem[] {
  const seen = new Set<string>()
  return items.filter((a) => {
    const key = normalize(a.text)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function deduplicateDecisions(items: Decision[]): Decision[] {
  const seen = new Set<string>()
  return items.filter((d) => {
    const key = normalize(d.text)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function deduplicateTopics(items: Topic[]): Topic[] {
  const seen = new Map<string, Topic>()
  for (const t of items) {
    const key = normalize(t.label)
    const existing = seen.get(key)
    if (!existing || t.relevance > existing.relevance) seen.set(key, t)
  }
  return [...seen.values()]
}

const SEMANTIC_THRESHOLD = 0.75

export function semanticMergeActions(items: ActionItem[]): ActionItem[] {
  return semanticMerge(items, (a) => a.text, (candidates) =>
    candidates.reduce((best, cur) => {
      const score = (a: ActionItem) =>
        (a.assignee ? 1 : 0) + (a.dueDate ? 1 : 0) + (a.sourceSegmentId ? 1 : 0)
      return score(cur) > score(best) ? cur : best
    }),
  )
}

export function semanticMergeDecisions(items: Decision[]): Decision[] {
  return semanticMerge(items, (d) => d.text, (candidates) =>
    candidates.reduce((best, cur) => {
      const score = (d: Decision) => (d.madeBy ? 1 : 0) + (d.sourceSegmentId ? 1 : 0)
      return score(cur) > score(best) ? cur : best
    }),
  )
}

function semanticMerge<T>(
  items: T[],
  getText: (item: T) => string,
  pickBest: (group: T[]) => T,
): T[] {
  const assigned = new Array<boolean>(items.length).fill(false)
  const groups: T[][] = []

  for (let i = 0; i < items.length; i++) {
    if (assigned[i]) continue
    const group: T[] = [items[i]!]
    const tokensI = tokenSet(getText(items[i]!))

    for (let j = i + 1; j < items.length; j++) {
      if (assigned[j]) continue
      if (jaccard(tokensI, tokenSet(getText(items[j]!))) >= SEMANTIC_THRESHOLD) {
        group.push(items[j]!)
        assigned[j] = true
      }
    }
    assigned[i] = true
    groups.push(group)
  }

  return groups.map(pickBest)
}

const CLUSTER_THRESHOLD = 0.5

export function clusterTopics(items: Topic[]): Topic[] {
  const assigned = new Array<boolean>(items.length).fill(false)
  const clusters: Topic[][] = []

  for (let i = 0; i < items.length; i++) {
    if (assigned[i]) continue
    const cluster: Topic[] = [items[i]!]
    const tokensI = tokenSet(items[i]!.label)

    for (let j = i + 1; j < items.length; j++) {
      if (assigned[j]) continue
      if (jaccard(tokensI, tokenSet(items[j]!.label)) >= CLUSTER_THRESHOLD) {
        cluster.push(items[j]!)
        assigned[j] = true
      }
    }
    assigned[i] = true
    clusters.push(cluster)
  }

  return clusters.map((cluster) => {
    const best = cluster.reduce((a, b) => (b.relevance > a.relevance ? b : a))
    const summedRelevance = Math.min(
      1.0,
      cluster.reduce((sum, t) => sum + t.relevance, 0),
    )
    return { ...best, relevance: summedRelevance }
  })
}

function dedupeSentences(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const kept: string[] = []
  const keptTokens: Set<string>[] = []

  for (const sentence of sentences) {
    const tokens = tokenSet(sentence)
    const isDupe = keptTokens.some((existing) => jaccard(existing, tokens) >= 0.8)
    if (!isDupe) {
      kept.push(sentence)
      keptTokens.push(tokens)
    }
  }
  return kept.join(' ')
}

function findSummaryStrategy(steps: StepConfig[]): StepConfig['merge'] {
  const step = steps.find((s) => s.name.toLowerCase().includes('summar'))
  return step?.merge ?? 'concat'
}

function findStrategyForField(
  field: 'actions' | 'decisions' | 'topics',
  steps: StepConfig[],
): StepConfig['merge'] {
  const keywords: Record<string, string> = {
    actions: 'action',
    decisions: 'decision',
    topics: 'topic',
  }
  const keyword = keywords[field]!
  const step = steps.find((s) => s.name.toLowerCase().includes(keyword))
  return step?.merge ?? 'concat'
}
