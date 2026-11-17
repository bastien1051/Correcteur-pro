import { applyReplacements, chunkText, overlaps, sleep, type Span } from './text'
import { applyTypography, typographyIssues, type Issue } from './typography'

const ENDPOINT = 'https://api.languagetool.org/v2/check'
const MAX_CHARS = 6000
const GAP_MS = 400

export class CorrectorError extends Error {
  constructor(message: string, readonly kind: 'offline' | 'rate') {
    super(message)
    this.name = 'CorrectorError'
  }
}

type LtMatch = {
  offset: number
  length: number
  message: string
  shortMessage?: string
  replacements?: { value?: string }[]
  rule?: { id?: string; category?: { id?: string; name?: string } }
}

const SKIP_AUTO = /STYLE|REDOND|REPET|CREATIVE|SEMANTIC|COLLOQU|REGIONAL|BRAND|GENDER|EMPHASIS|WORDINESS|PLAIN_ENGLISH/i

export function isSafeAutoFix(issue: Issue): boolean {
  const replacement = issue.replacements[0]
  if (!replacement || replacement === '') return issue.replacements[0] === ''
  if (issue.source === 'typographie') return true
  return !SKIP_AUTO.test(issue.category) && !SKIP_AUTO.test(issue.ruleId)
}

async function checkChunk(text: string, fetchImpl: typeof fetch): Promise<Issue[]> {
  if (!text.trim()) return []
  let response: Response
  try {
    const body = new URLSearchParams()
    body.set('text', text)
    body.set('language', 'fr')
    body.set('enabledOnly', 'false')
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new CorrectorError(
      'Le service de correction est inaccessible. Vérifiez votre connexion, puis réessayez. Le texte saisi est conservé.',
      'offline',
    )
  }
  if (response.status === 429) {
    throw new CorrectorError(
      'Le service de correction est très sollicité. Patientez une minute, puis réessayez.',
      'rate',
    )
  }
  if (!response.ok) {
    throw new CorrectorError(
      'Le service de correction est inaccessible. Vérifiez votre connexion, puis réessayez. Le texte saisi est conservé.',
      'offline',
    )
  }
  const payload = await response.json() as { matches?: LtMatch[] }
  return (payload.matches ?? []).map((match) => ({
    offset: match.offset,
    length: match.length,
    message: match.message || 'Correction proposée.',
    shortMessage: match.shortMessage || match.rule?.category?.name || 'Correction',
    replacements: (match.replacements ?? []).map((item) => item.value ?? '').filter((value) => value !== undefined).slice(0, 6),
    ruleId: match.rule?.id || 'LT',
    category: match.rule?.category?.id || match.rule?.category?.name || 'AUTRE',
    source: 'languagetool' as const,
  }))
}

export async function checkFrench(text: string, fetchImpl: typeof fetch = fetch): Promise<{ issues: Issue[]; partial: boolean }> {
  const chunks = chunkText(text, MAX_CHARS)
  const remote: Issue[] = []
  let partial = false
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    if (!chunk) continue
    if (index > 0) await sleep(GAP_MS)
    try {
      const found = await checkChunk(chunk.text, fetchImpl)
      for (const issue of found) remote.push({ ...issue, offset: issue.offset + chunk.offset })
    } catch (error) {
      if (index === 0 || (error instanceof CorrectorError && error.kind === 'rate')) throw error
      partial = true
    }
  }
  const local = typographyIssues(text).filter((issue) => !remote.some((other) => overlaps(other.offset, other.length, issue.offset, issue.length)))
  const issues = [...remote, ...local].sort((a, b) => a.offset - b.offset || b.length - a.length)
  return { issues, partial }
}

function protectedRanges(text: string, needles: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const lower = text.toLowerCase()
  for (const needle of needles) {
    const clean = needle.trim()
    if (clean.length < 3) continue
    const target = clean.toLowerCase()
    let from = 0
    while (from < lower.length) {
      const at = lower.indexOf(target, from)
      if (at < 0) break
      ranges.push([at, at + clean.length])
      from = at + clean.length
    }
  }
  return ranges
}

function hitsProtected(offset: number, length: number, ranges: Array<[number, number]>): boolean {
  const end = offset + length
  return ranges.some(([start, stop]) => offset < stop && end > start)
}

/** Applique la typographie, puis les corrections sûres de LanguageTool. */
export async function polishFrench(
  text: string,
  protectedText: string[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<{ text: string; reviewed: boolean }> {
  const typed = applyTypography(text)
  try {
    const { issues } = await checkFrench(typed, fetchImpl)
    const ranges = protectedRanges(typed, protectedText)
    const spans: Span[] = []
    for (const issue of issues) {
      if (!isSafeAutoFix(issue) || hitsProtected(issue.offset, issue.length, ranges)) continue
      const replacement = issue.replacements[0]
      if (replacement === undefined) continue
      spans.push({ offset: issue.offset, length: issue.length, replacement })
    }
    return { text: applyReplacements(typed, spans), reviewed: true }
  } catch {
    return { text: typed, reviewed: false }
  }
}
