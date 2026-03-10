import type { LlmGenerationRequest, LlmGenerationResponse, LlmProviderAdapter } from './types.js'

export interface LocalHttpAdapterOptions {
    endpoint: string
    model: string
    headers?: Record<string, string>
    /**
     * How to format the JSON body for /api/generate. Some Ollama versions expect
     * `{ model, prompt }` while others expect `{ model, messages: [{ role, content }] }`.
     * Supported: 'prompt' | 'messages'
     */
    bodyFormat?: 'prompt' | 'messages'
}

export interface HostedHttpAdapterOptions {
    endpoint: string
    apiKey: string
    model: string
    headers?: Record<string, string>
    bodyFormat?: 'prompt' | 'messages'
}

export function createLocalHttpAdapter(options: LocalHttpAdapterOptions): LlmProviderAdapter {
    return {
        async generate(request: LlmGenerationRequest): Promise<LlmGenerationResponse> {
            const bodyPayload: Record<string, unknown> =
                options.bodyFormat === 'messages'
                    ? {
                          model: options.model,
                          messages: [{ role: 'user', content: request.prompt }],
                          stream: false,
                      }
                    : {
                          model: options.model,
                          prompt: request.prompt,
                          stream: false,
                      }

            const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
            const maxAttempts = 6
            const retryDelayMs = 500

            let lastErr: unknown = null
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    // Log outgoing request for debugging
                    try {
                        // eslint-disable-next-line no-console
                        console.debug('[local-http] POST', options.endpoint, JSON.stringify(bodyPayload))
                    } catch {}

                    const response = await fetch(options.endpoint, {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            ...(options.headers ?? {}),
                        },
                        body: JSON.stringify(bodyPayload),
                    })

                    const rawText = await response.text()
                    try {
                        // eslint-disable-next-line no-console
                        console.debug('[local-http] response status', response.status)
                        // eslint-disable-next-line no-console
                        console.debug('[local-http] raw response:', rawText)
                    } catch {}

                    if (!response.ok) {
                        lastErr = new Error(`local adapter HTTP ${response.status} - ${rawText}`)
                        if (attempt === maxAttempts) throw lastErr
                        await sleep(retryDelayMs)
                        continue
                    }

                    let body: Record<string, unknown>
                    try {
                        body = JSON.parse(rawText) as Record<string, unknown>
                    } catch (err) {
                        lastErr = new Error(`summary: adapter response is not valid JSON (${err instanceof Error ? err.message : String(err)}) -- raw: ${rawText}`)
                        if (attempt === maxAttempts) throw lastErr
                        await sleep(retryDelayMs)
                        continue
                    }

                    const text = typeof body.response === 'string' ? body.response : ''
                    if (text.trim() === '') {
                        // empty response — retry a couple times in case model is still loading
                        lastErr = new Error(`adapter returned empty response -- raw: ${rawText}`)
                        if (attempt === maxAttempts) throw lastErr
                        await sleep(retryDelayMs)
                        continue
                    }

                    return {
                        text,
                        provider: 'local-http',
                        model: options.model,
                        raw: body,
                    }
                } catch (err) {
                    lastErr = err
                    if (attempt === maxAttempts) throw err
                    await sleep(retryDelayMs)
                }
            }

            // If we used `messages` format and failed, try a fallback with `prompt` format
            if (options.bodyFormat === 'messages') {
                const promptPayload = {
                    model: options.model,
                    prompt: request.prompt,
                    stream: false,
                }

                let promptLastErr: unknown = null
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        // eslint-disable-next-line no-console
                        console.debug('[local-http] FALLBACK POST (prompt)', options.endpoint, JSON.stringify(promptPayload))

                        const response = await fetch(options.endpoint, {
                            method: 'POST',
                            headers: {
                                'content-type': 'application/json',
                                ...(options.headers ?? {}),
                            },
                            body: JSON.stringify(promptPayload),
                        })

                        const rawText = await response.text()
                        // eslint-disable-next-line no-console
                        console.debug('[local-http] FALLBACK response status', response.status)
                        // eslint-disable-next-line no-console
                        console.debug('[local-http] FALLBACK raw response:', rawText)

                        if (!response.ok) {
                            promptLastErr = new Error(`local adapter HTTP ${response.status} - ${rawText}`)
                            await sleep(retryDelayMs)
                            continue
                        }

                        let body: Record<string, unknown>
                        try {
                            body = JSON.parse(rawText) as Record<string, unknown>
                        } catch (err) {
                            promptLastErr = new Error(`fallback: adapter response is not valid JSON (${err instanceof Error ? err.message : String(err)}) -- raw: ${rawText}`)
                            await sleep(retryDelayMs)
                            continue
                        }

                        const text = typeof body.response === 'string' ? body.response : ''
                        if (text.trim() === '') {
                            promptLastErr = new Error(`fallback: adapter returned empty response -- raw: ${rawText}`)
                            await sleep(retryDelayMs)
                            continue
                        }

                        return {
                            text,
                            provider: 'local-http',
                            model: options.model,
                            raw: body,
                        }
                    } catch (err) {
                        promptLastErr = err
                        await sleep(retryDelayMs)
                    }
                }

                // if fallback failed, throw the promptLastErr if present
                throw promptLastErr ?? lastErr
            }

            // should not be reachable, but keep TS happy
            throw lastErr
        },
    }
}

export function createHostedHttpAdapter(options: HostedHttpAdapterOptions): LlmProviderAdapter {
    return {
        async generate(request: LlmGenerationRequest): Promise<LlmGenerationResponse> {
            const hostedBody: Record<string, unknown> =
                options.bodyFormat === 'messages'
                    ? {
                          model: options.model,
                          messages: [{ role: 'user', content: request.prompt }],
                      }
                    : {
                          model: options.model,
                          prompt: request.prompt,
                      }

            // Log outgoing request for debugging
            try {
                // eslint-disable-next-line no-console
                console.debug('[hosted-http] POST', options.endpoint, JSON.stringify(hostedBody))
            } catch {}

            const response = await fetch(options.endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${options.apiKey}`,
                    ...(options.headers ?? {}),
                },
                body: JSON.stringify(hostedBody),
            })

            const rawText = await response.text()
            try {
                // eslint-disable-next-line no-console
                console.debug('[hosted-http] response status', response.status)
                // eslint-disable-next-line no-console
                console.debug('[hosted-http] raw response:', rawText)
            } catch {}

            if (!response.ok) {
                throw new Error(`hosted adapter HTTP ${response.status} - ${rawText}`)
            }

            let body: Record<string, unknown>
            try {
                body = JSON.parse(rawText) as Record<string, unknown>
            } catch (err) {
                throw new Error(`hosted adapter response is not valid JSON (${err instanceof Error ? err.message : String(err)}) -- raw: ${rawText}`)
            }

            const text =
                typeof body.text === 'string'
                    ? body.text
                    : typeof body.output === 'string'
                        ? body.output
                        : JSON.stringify(body)

            return {
                text,
                provider: 'hosted-http',
                model: options.model,
                raw: body,
            }
        },
    }
}
