import type { BaseLlmStepOptions, LlmGenerationRequest, LlmGenerationResponse, LlmProviderAdapter } from './types.js'

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_RETRIES = 1
const DEFAULT_RETRY_DELAY_MS = 200

export function resolveRuntimeOptions(options: BaseLlmStepOptions): Required<BaseLlmStepOptions> {
    return {
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        retries: options.retries ?? DEFAULT_RETRIES,
        retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
        maxSegmentsInPrompt: options.maxSegmentsInPrompt ?? 100,
    }
}

export async function generateWithRetry(
    adapter: LlmProviderAdapter,
    request: LlmGenerationRequest,
    options: Required<BaseLlmStepOptions>,
): Promise<LlmGenerationResponse> {
    let attempt = 0
    let lastError: unknown

    while (attempt <= options.retries) {
        try {
            const response = await withTimeout(adapter.generate(request), options.timeoutMs)
            return response
        } catch (error) {
            lastError = error
            if (attempt >= options.retries) break
            await delay(options.retryDelayMs)
        }
        attempt += 1
    }

    throw new Error(`LLM generation failed after ${options.retries + 1} attempts: ${stringifyError(lastError)}`)
}

export function parseJsonOutput<T>(raw: string, schemaName: string): T {
    try {
        return JSON.parse(raw) as T
    } catch (error) {
        throw new Error(`${schemaName}: adapter response is not valid JSON (${stringifyError(error)})`)
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function stringifyError(value: unknown): string {
    if (value instanceof Error) return `${value.name}: ${value.message}`
    return String(value)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`timeout after ${timeoutMs}ms`))
        }, timeoutMs)

        promise.then(
            (value) => {
                clearTimeout(timer)
                resolve(value)
            },
            (error) => {
                clearTimeout(timer)
                reject(error)
            },
        )
    })
}
