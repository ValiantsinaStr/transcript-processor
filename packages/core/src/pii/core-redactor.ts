import type { PiiRedactionResult, PiiMatch, PrivacyConfig } from '../types.js'

/** Pattern definitions — order matters (more specific first) */
const PATTERNS: Array<{
  type: PiiMatch['type']
  regex: RegExp
  replacement: (cfg: PrivacyConfig['replacements']) => string
}> = [
  {
    // Credit card: 4×4 digit groups separated by space or dash
    type: 'financial',
    regex: /\b(?:\d{4}[-\s]){3}\d{4}\b/g,
    replacement: () => '[Card]',
  },
  {
    // SSN: XXX-XX-XXXX
    type: 'financial',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: () => '[SSN]',
  },
  {
    // Email
    type: 'email',
    regex: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi,
    replacement: (cfg) => cfg.email,
  },
  {
    // Phone — international and local formats
    type: 'phone',
    regex:
      /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}\b/g,
    replacement: (cfg) => cfg.phone,
  },
]

/**
 * Core regex-based PII redactor.
 * Runs all patterns left-to-right; overlapping matches are skipped.
 */
export function coreRedact(
  text: string,
  replacements: PrivacyConfig['replacements'],
): PiiRedactionResult {
  // Collect all matches across all patterns
  const rawMatches: Array<{ start: number; end: number; replacement: string; type: PiiMatch['type'] }> = []

  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.regex.source, pattern.regex.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      rawMatches.push({
        type: pattern.type,
        start: m.index,
        end: m.index + m[0].length,
        replacement: pattern.replacement(replacements),
      })
    }
  }

  // Sort by start position; resolve overlaps (keep first, skip overlapping)
  rawMatches.sort((a, b) => a.start - b.start)

  const matches: PiiMatch[] = []
  let cursor = 0

  for (const m of rawMatches) {
    if (m.start < cursor) continue // overlaps previous match — skip
    matches.push({ type: m.type, start: m.start, end: m.end, replacement: m.replacement })
    cursor = m.end
  }

  // Build redacted text
  let redactedText = ''
  let pos = 0
  for (const match of matches) {
    redactedText += text.slice(pos, match.start) + match.replacement
    pos = match.end
  }
  redactedText += text.slice(pos)

  return { redactedText, matches }
}
