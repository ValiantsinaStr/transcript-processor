import { describe, it, expect } from 'vitest'
import { ConversationModel } from '../conversation-model.js'

describe('ConversationModel', () => {
  it('starts empty', () => {
    const model = new ConversationModel()
    expect(model.getSummary()).toBeNull()
    expect(model.getActions()).toEqual([])
    expect(model.getDecisions()).toEqual([])
    expect(model.getTopics()).toEqual([])
    expect(model.isDegraded()).toBe(false)
  })

  it('writer sets summary', () => {
    const model = new ConversationModel()
    model.asWriter().setSummary('hello')
    expect(model.getSummary()).toBe('hello')
  })

  it('writer adds actions', () => {
    const model = new ConversationModel()
    model.asWriter().addAction({ id: '1', text: 'Buy milk', status: 'open' })
    expect(model.getActions()).toHaveLength(1)
  })

  it('getActions filters by status', () => {
    const model = new ConversationModel()
    const w = model.asWriter()
    w.addAction({ id: '1', text: 'A', status: 'open' })
    w.addAction({ id: '2', text: 'B', status: 'done' })
    expect(model.getActions({ status: 'open' })).toHaveLength(1)
    expect(model.getActions({ status: 'done' })).toHaveLength(1)
  })

  it('getActions filters by assignee', () => {
    const model = new ConversationModel()
    const w = model.asWriter()
    w.addAction({ id: '1', text: 'A', status: 'open', assignee: 'ivan' })
    w.addAction({ id: '2', text: 'B', status: 'open', assignee: 'anna' })
    expect(model.getActions({ assignee: 'ivan' })).toHaveLength(1)
  })

  it('getTopics returns sorted by relevance desc', () => {
    const model = new ConversationModel()
    const w = model.asWriter()
    w.addTopic({ id: '1', label: 'Low', relevance: 0.2 })
    w.addTopic({ id: '2', label: 'High', relevance: 0.9 })
    w.addTopic({ id: '3', label: 'Mid', relevance: 0.5 })
    const topics = model.getTopics()
    expect(topics[0]!.label).toBe('High')
    expect(topics[2]!.label).toBe('Low')
  })

  it('marks step success and failure', () => {
    const model = new ConversationModel()
    const w = model.asWriter()
    w.markStepSuccess('parse', 12)
    w.markStepFailed('summarize', new Error('timeout'))
    expect(model.getStepStatus('parse')).toMatchObject({ status: 'success', durationMs: 12 })
    expect(model.getStepStatus('summarize')).toMatchObject({ status: 'failed', error: 'timeout' })
  })

  it('toJSON returns a plain object with all fields', () => {
    const model = new ConversationModel()
    const json = model.toJSON()
    expect(json).toMatchObject({
      summary: null,
      actions: [],
      decisions: [],
      topics: [],
      stepStatuses: {},
      degraded: false,
    })
  })
})
