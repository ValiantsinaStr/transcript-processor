import type { PromptBuildInput } from './types.js'

export const SUMMARY_PROMPT_VERSION = 'v1'
export const SUMMARY_SCHEMA_VERSION = 'v1'
export const ACTIONS_PROMPT_VERSION = 'v1'
export const ACTIONS_SCHEMA_VERSION = 'v1'
export const DECISIONS_PROMPT_VERSION = 'v1'
export const DECISIONS_SCHEMA_VERSION = 'v1'

export function buildSummaryPrompt(input: PromptBuildInput): string {
    return [
        'You are a meeting analysis assistant.',
        'Return only JSON object: {"summary": string}.',
        'The summary must be concise and factual.',
        'Transcript segments:',
        renderSegments(input),
    ].join('\n')
}

export function buildActionsPrompt(input: PromptBuildInput): string {
    return [
        'You are a meeting analysis assistant.',
        'Return only JSON object: {"actions": [{"text": string, "assignee"?: string, "dueDate"?: string, "status"?: "open"|"done"}]}.',
        'Include only explicit action items.',
        'Transcript segments:',
        renderSegments(input),
    ].join('\n')
}

export function buildDecisionsPrompt(input: PromptBuildInput): string {
    return [
        'You are a meeting analysis assistant.',
        'Return only JSON object: {"decisions": [{"text": string, "madeBy"?: string}]}.',
        'Include only explicit decisions.',
        'Transcript segments:',
        renderSegments(input),
    ].join('\n')
}

function renderSegments(input: PromptBuildInput): string {
    if (input.segments.length === 0) return '(no segments)'

    return input.segments
        .map((segment, index) => {
            const speaker = segment.speakerId ? ` speaker=${segment.speakerId}` : ''
            return `${index + 1}. [id=${segment.id}${speaker}] ${segment.text}`
        })
        .join('\n')
}
