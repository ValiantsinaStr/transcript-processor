export function stableId(prefix: string, index: number, text: string): string {
    const hash = fnv1a(text)
    return `${prefix}-${index + 1}-${hash}`
}

export function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim()
}

function fnv1a(value: string): string {
    let hash = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = (hash * 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
}
