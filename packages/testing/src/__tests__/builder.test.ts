import { describe, it, expect } from 'vitest'
import { MockConversationBuilder } from '../builder.js'
import { ConversationModel } from '@transcript-sdk/core'

describe('MockConversationBuilder', () => {
  it('build() returns a ConversationModel instance', () => {
    const model = new MockConversationBuilder().build()
    expect(model).toBeInstanceOf(ConversationModel)
  })

  it('empty build has null summary and empty arrays', () => {
    const model = new MockConversationBuilder().build()
    expect(model.getSummary()).toBeNull()
    expect(model.getActions()).toEqual([])
    expect(model.getDecisions()).toEqual([])
    expect(model.getTopics()).toEqual([])
  })

  it('withSummary sets summary', () => {
    const model = new MockConversationBuilder().withSummary('Test summary').build()
    expect(model.getSummary()).toBe('Test summary')
  })

  it('withAction adds an action', () => {
    const model = new MockConversationBuilder()
      .withAction({ text: 'Update docs', assignee: 'ivan' })
      .build()
    const actions = model.getActions()
    expect(actions).toHaveLength(1)
    expect(actions[0]!.text).toBe('Update docs')
    expect(actions[0]!.assignee).toBe('ivan')
    expect(actions[0]!.status).toBe('open')
  })

  it('withActions(n) adds n placeholder actions', () => {
    const model = new MockConversationBuilder().withActions(5).build()
    expect(model.getActions()).toHaveLength(5)
  })

  it('withDecision accepts a plain string', () => {
    const model = new MockConversationBuilder()
      .withDecision('Adopt PostgreSQL')
      .build()
    expect(model.getDecisions()[0]!.text).toBe('Adopt PostgreSQL')
  })

  it('withDecision accepts an object', () => {
    const model = new MockConversationBuilder()
      .withDecision({ text: 'Use Redis', madeBy: 'CTO' })
      .build()
    expect(model.getDecisions()[0]!.madeBy).toBe('CTO')
  })

  it('withTopic adds a topic', () => {
    const model = new MockConversationBuilder()
      .withTopic({ label: 'Budget', relevance: 0.9 })
      .build()
    expect(model.getTopics()[0]!.label).toBe('Budget')
    expect(model.getTopics()[0]!.relevance).toBe(0.9)
  })

  it('withFailedStep marks step as failed', () => {
    const model = new MockConversationBuilder()
      .withFailedStep('summarize', new Error('timeout'))
      .build()
    const status = model.getStepStatus('summarize')
    expect(status?.status).toBe('failed')
    expect(status?.status === 'failed' && status.error).toBe('timeout')
  })

  it('withSuccessStep marks step as success', () => {
    const model = new MockConversationBuilder().withSuccessStep('parse', 42).build()
    const status = model.getStepStatus('parse')
    expect(status?.status).toBe('success')
    expect(status?.status === 'success' && status.durationMs).toBe(42)
  })

  it('chained builder builds correctly', () => {
    const model = new MockConversationBuilder()
      .withSummary('Q2 planning complete')
      .withActions(3)
      .withAction({ text: 'Ship v1', assignee: 'team' })
      .withDecision('Launch in April')
      .withTopic({ label: 'Roadmap', relevance: 0.8 })
      .withSuccessStep('parse', 10)
      .withFailedStep('detect-topics', new Error('Model timeout'))
      .build()

    expect(model.getSummary()).toBe('Q2 planning complete')
    expect(model.getActions()).toHaveLength(4)
    expect(model.getDecisions()).toHaveLength(1)
    expect(model.getTopics()).toHaveLength(1)
    expect(model.getStepStatus('parse')?.status).toBe('success')
    expect(model.getStepStatus('detect-topics')?.status).toBe('failed')
  })

  it('toJSON() passes TypeScript type checks (shape matches ConversationJSON)', () => {
    const json = new MockConversationBuilder()
      .withSummary('hello')
      .withAction({ text: 'do thing' })
      .build()
      .toJSON()

    expect(json).toHaveProperty('summary', 'hello')
    expect(json).toHaveProperty('actions')
    expect(json).toHaveProperty('decisions')
    expect(json).toHaveProperty('topics')
    expect(json).toHaveProperty('stepStatuses')
    expect(json).toHaveProperty('degraded')
  })
})
