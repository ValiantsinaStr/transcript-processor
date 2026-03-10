import type { StepContext } from '@transcript-sdk/core'

export const CLEANED_TEXT_KEY = 'skillsDeterministic.cleanedText'
const PARTICIPANT_MAP_KEY = 'skillsDeterministic.participantMap'
const PARTICIPANT_COUNTER_KEY = 'skillsDeterministic.participantCounter'

export function getChunkText(ctx: StepContext): string {
    const cleaned = ctx.state[CLEANED_TEXT_KEY]
    if (typeof cleaned === 'string' && cleaned.length > 0) return cleaned

    const raw = ctx.state['sdk.chunkText']
    return typeof raw === 'string' ? raw : ''
}

function getParticipantMap(ctx: StepContext): Map<string, string> {
    const existing = ctx.pipelineState[PARTICIPANT_MAP_KEY]
    if (existing instanceof Map) return existing as Map<string, string>

    const created = new Map<string, string>()
    ctx.pipelineState[PARTICIPANT_MAP_KEY] = created
    return created
}

function normalizePersonKey(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function pseudonymizePerson(ctx: StepContext, value: string): string {
    const map = getParticipantMap(ctx)
    const key = normalizePersonKey(value)
    const existing = map.get(key)
    if (existing) return existing

    const current = ctx.pipelineState[PARTICIPANT_COUNTER_KEY]
    const nextNumber = typeof current === 'number' ? current + 1 : 1
    ctx.pipelineState[PARTICIPANT_COUNTER_KEY] = nextNumber

    const alias = `PARTICIPANT_${String(nextNumber).padStart(2, '0')}`
    map.set(key, alias)
    return alias
}

export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
