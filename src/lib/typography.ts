import { applyReplacements, overlaps, type Span } from './text'

export type Issue = {
  offset: number
  length: number
  message: string
  shortMessage: string
  replacements: string[]
  ruleId: string
  category: string
  source: 'languagetool' | 'typographie'
}

const NBSP = '\u00a0'
const THIN = '\u202f'

function occupied(issues: Issue[], offset: number, length: number): boolean {
  return issues.some((issue) => overlaps(issue.offset, issue.length, offset, length))
}

function push(issues: Issue[], text: string, offset: number, length: number, replacement: string, message: string, ruleId: string) {
  if (length <= 0 || offset < 0 || offset + length > text.length) return
  const original = text.slice(offset, offset + length)
  if (original === replacement || occupied(issues, offset, length)) return
  issues.push({
    offset,
    length,
    message,
    shortMessage: 'Typographie',
    replacements: [replacement],
    ruleId,
    category: 'TYPOGRAPHIE',
    source: 'typographie',
  })
}

function previous(text: string, index: number, count: number): string {
  return text.slice(Math.max(0, index - count), index)
}

/** Propositions de typographie française, sans modifier le texte. */
export function typographyIssues(text: string): Issue[] {
  const issues: Issue[] = []

  for (const match of text.matchAll(/ {2,}/g)) {
    const index = match.index ?? 0
    push(issues, text, index, match[0].length, ' ', 'Deux espaces se suivent.', 'DOUBLE_ESPACE')
  }

  for (const match of text.matchAll(/ (?=[,.])/g)) {
    const index = match.index ?? 0
    push(issues, text, index, match[0].length, '', 'Il ne faut pas d’espace avant la virgule ni avant le point.', 'ESPACE_AVANT_PONCTUATION_BASSE')
  }

  for (const match of text.matchAll(/\.{3,}/g)) {
    const index = match.index ?? 0
    if (previous(text, index, 12).includes('http') || previous(text, index, 4).includes('www')) continue
    push(issues, text, index, match[0].length, '…', 'Les points de suspension forment un seul signe : …', 'POINTS_SUSPENSION')
  }

  for (const match of text.matchAll(/(?<=\p{L})'(?=\p{L})/gu)) {
    const index = match.index ?? 0
    push(issues, text, index, 1, '’', 'L’apostrophe typographique (’) remplace l’apostrophe droite.', 'APOSTROPHE')
  }

  for (const match of text.matchAll(/«[ \t\u00a0\u202f]*/g)) {
    const index = match.index ?? 0
    push(issues, text, index, match[0].length, `«${NBSP}`, 'Le guillemet ouvrant est suivi d’une espace insécable.', 'GUILLEMET_OUVRANT')
  }

  for (const match of text.matchAll(/[ \t\u00a0\u202f]*»/g)) {
    const index = match.index ?? 0
    push(issues, text, index, match[0].length, `${NBSP}»`, 'Le guillemet fermant est précédé d’une espace insécable.', 'GUILLEMET_FERMANT')
  }

  for (const match of text.matchAll(/"([^"\n]{1,180})"/g)) {
    const index = match.index ?? 0
    const inner = match[1] ?? ''
    if (!inner.trim()) continue
    push(
      issues,
      text,
      index,
      match[0].length,
      `«${NBSP}${inner.trim()}${NBSP}»`,
      'En français, on emploie les guillemets « » plutôt que les guillemets droits.',
      'GUILLEMETS_DROITS',
    )
  }

  for (const match of text.matchAll(/(?<=[^\s\u202f])[ \t\u00a0]*([;!?])(?!\1)/g)) {
    const index = match.index ?? 0
    const sign = match[1] ?? ''
    if (!sign) continue
    if (previous(text, index, 10).includes('http')) continue
    const after = text[index + match[0].length] ?? ''
    const needsAfter = /\p{L}/u.test(after)
    const replacement = needsAfter ? `${THIN}${sign} ` : `${THIN}${sign}`
    push(
      issues,
      text,
      index,
      match[0].length,
      replacement,
      'En français, ce signe est précédé d’une espace insécable.',
      'ESPACE_HAUTE',
    )
  }

  for (const match of text.matchAll(/(?<=[^\d\s\u202f])[ \t\u00a0]*:(?![:/\d])/g)) {
    const index = match.index ?? 0
    if (previous(text, index, 12).toLowerCase().includes('http')) continue
    if (previous(text, index, 5).toLowerCase().includes('www')) continue
    const after = text[index + match[0].length] ?? ''
    const needsAfter = after !== '' && !/\s/.test(after)
    const replacement = needsAfter ? `${THIN}: ` : `${THIN}:`
    push(
      issues,
      text,
      index,
      match[0].length,
      replacement,
      'En français, les deux-points sont précédés d’une espace insécable et suivis d’une espace.',
      'DEUX_POINTS',
    )
  }

  return issues.sort((a, b) => a.offset - b.offset || b.length - a.length)
}

export function applyTypography(text: string, depth = 0): string {
  if (depth > 6) return text
  const spans: Span[] = typographyIssues(text).flatMap((issue) => {
    const replacement = issue.replacements[0]
    return replacement === undefined ? [] : [{ offset: issue.offset, length: issue.length, replacement }]
  })
  const next = applyReplacements(text, spans)
  return next === text ? text : applyTypography(next, depth + 1)
}
