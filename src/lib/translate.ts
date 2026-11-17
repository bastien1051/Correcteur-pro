import { polishFrench } from './correct'
import { googleCode, guessLanguage, isSingleWord, myMemoryCode, type LangCode } from './languages'
import { opusTranslate } from './opus'
import { chunkByUtf8, chunkText } from './text'

export class TranslateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranslateError'
  }
}

export type Alternative = { pos: string; terms: string[] }

export type TranslateResult = {
  text: string
  detected: string
  alternatives: Alternative[]
  engine: 'google' | 'lingva' | 'libre' | 'mymemory' | 'opus'
  frenchReviewed: boolean
}

type FetchLike = typeof fetch

const POS: Record<string, string> = {
  noun: 'Nom',
  verb: 'Verbe',
  adjective: 'Adjectif',
  adverb: 'Adverbe',
  pronoun: 'Pronom',
  preposition: 'Préposition',
  conjunction: 'Conjonction',
  interjection: 'Interjection',
}

const LINGVA = [
  'https://lingva.ml',
  'https://translate.plausibility.cloud',
  'https://lingva.lunar.icu',
  'https://lingva.garudalinux.org',
]

const LIBRE = [
  'https://translate.cutie.dating',
  'https://libretranslate.de',
]

export function parseGoogle(payload: unknown): { text: string; detected?: string; alternatives: Alternative[] } {
  if (!payload || typeof payload !== 'object') throw new Error('Réponse de traduction illisible.')
  const data = payload as {
    src?: string
    sentences?: { trans?: string }[]
    dict?: { pos?: string; terms?: string[]; entry?: { word?: string; score?: number }[] }[]
  }
  const text = (data.sentences ?? []).map((sentence) => sentence.trans ?? '').join('').trim()
  if (!text) throw new Error('Traduction vide.')
  const alternatives: Alternative[] = []
  for (const group of data.dict ?? []) {
    const ranked = (group.entry ?? [])
      .map((entry) => ({ word: (entry.word ?? '').trim(), score: entry.score ?? 0 }))
      .filter((entry) => entry.word)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.word)
    const terms = [...new Set((ranked.length ? ranked : group.terms ?? []).map((term) => term.trim()).filter(Boolean))].slice(0, 4)
    if (!terms.length) continue
    alternatives.push({ pos: POS[(group.pos ?? '').toLowerCase()] ?? 'Sens', terms })
  }
  return { text, detected: data.src, alternatives: alternatives.slice(0, 4) }
}

export function parseMyMemory(payload: unknown, sourceText: string): { text: string; alternatives: string[] } {
  if (!payload || typeof payload !== 'object') throw new Error('Réponse de secours illisible.')
  const data = payload as {
    responseStatus?: number
    quotaFinished?: boolean
    responseData?: { translatedText?: string }
    matches?: { translation?: string; quality?: number | string }[]
  }
  const text = data.responseData?.translatedText?.trim() ?? ''
  if (!text || data.responseStatus !== 200 || data.quotaFinished) throw new Error('Service de secours indisponible.')
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGPAIR/i.test(text)) throw new Error('Service de secours indisponible.')
  if (sourceText.trim().length > 16 && text.toLocaleLowerCase('fr-FR') === sourceText.trim().toLocaleLowerCase('fr-FR')) {
    throw new Error('Traduction inchangée.')
  }
  const alternatives: string[] = []
  for (const match of data.matches ?? []) {
    const value = match.translation?.trim() ?? ''
    const quality = Number(match.quality ?? 0)
    if (!value || value === text || alternatives.includes(value)) continue
    if (Number.isFinite(quality) && quality > 0 && quality < 45) continue
    alternatives.push(value)
  }
  return { text, alternatives: alternatives.slice(0, 6) }
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text()
  if (!response.ok || raw.trim().startsWith('<')) throw new Error('Service indisponible.')
  return JSON.parse(raw) as unknown
}

function keepBreaks(text: string): string[] {
  return text.split(/(\n+)/)
}

async function mapParts(
  text: string,
  limit: number,
  byBytes: boolean,
  convert: (chunk: string) => Promise<string>,
): Promise<string> {
  const out: string[] = []
  for (const part of keepBreaks(text)) {
    if (!part) continue
    if (/^\n+$/.test(part)) {
      out.push(part)
      continue
    }
    const chunks = byBytes ? chunkByUtf8(part, limit) : chunkText(part, limit)
    const translated: string[] = []
    for (const chunk of chunks) translated.push(await convert(chunk.text))
    out.push(translated.join(''))
  }
  return out.join('')
}

async function translateGoogle(text: string, source: string, target: string, fetchImpl: FetchLike): Promise<Omit<TranslateResult, 'frenchReviewed'>> {
  let detected = source === 'auto' ? '' : source
  const alternatives: Alternative[] = []
  const single = isSingleWord(text)
  const translated = await mapParts(text, 3800, false, async (chunk) => {
    const sl = detected || source
    const url = new URL('https://translate.googleapis.com/translate_a/single')
    url.searchParams.set('client', 'gtx')
    url.searchParams.set('sl', googleCode(sl))
    url.searchParams.set('tl', googleCode(target))
    url.searchParams.append('dt', 't')
    if (single) url.searchParams.append('dt', 'bd')
    url.searchParams.set('dj', '1')
    url.searchParams.set('q', chunk)
    const response = await fetchImpl(url, { referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) })
    const parsed = parseGoogle(await readJson(response))
    if (!detected && parsed.detected) detected = parsed.detected
    if (single && !alternatives.length) alternatives.push(...parsed.alternatives)
    return parsed.text
  })
  return { text: translated, detected: detected || guessLanguage(text), alternatives, engine: 'google' }
}

async function translateLingva(text: string, source: string, target: string, fetchImpl: FetchLike): Promise<Omit<TranslateResult, 'frenchReviewed'>> {
  const src = source === 'auto' ? guessLanguage(text) : source
  const translated = await mapParts(text, 700, false, async (chunk) => {
    const calls = LINGVA.map(async (host) => {
      const url = `${host}/api/v1/${src}/${target}/${encodeURIComponent(chunk)}`
      const response = await fetchImpl(url, { referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(7000) })
      const payload = await readJson(response) as { translation?: string; error?: string }
      if (payload.error || !payload.translation?.trim()) throw new Error(payload.error || 'lingva')
      return payload.translation.trim()
    })
    return Promise.any(calls)
  })
  return { text: translated, detected: src, alternatives: [], engine: 'lingva' }
}

async function translateLibre(text: string, source: string, target: string, fetchImpl: FetchLike): Promise<Omit<TranslateResult, 'frenchReviewed'>> {
  const src = source === 'auto' ? 'auto' : source
  let detected = source === 'auto' ? '' : source
  const translated = await mapParts(text, 1800, false, async (chunk) => {
    const calls = LIBRE.map(async (host) => {
      const response = await fetchImpl(`${host}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ q: chunk, source: src === 'auto' ? 'auto' : src, target, format: 'text' }),
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(7000),
      })
      const payload = await readJson(response) as { translatedText?: string; detectedLanguage?: { language?: string } }
      if (!payload.translatedText?.trim()) throw new Error('libre')
      if (payload.detectedLanguage?.language) detected = payload.detectedLanguage.language
      return payload.translatedText.trim()
    })
    return Promise.any(calls)
  })
  return { text: translated, detected: detected || guessLanguage(text), alternatives: [], engine: 'libre' }
}

async function translateMyMemory(text: string, source: string, target: string, fetchImpl: FetchLike): Promise<Omit<TranslateResult, 'frenchReviewed'>> {
  const src = source === 'auto' ? guessLanguage(text) : source
  const single = isSingleWord(text)
  let alternatives: string[] = []
  const translated = await mapParts(text, 420, true, async (chunk) => {
    const pair = `${myMemoryCode(src)}|${myMemoryCode(target)}`
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${pair}`
    const response = await fetchImpl(url, { referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) })
    const parsed = parseMyMemory(await readJson(response), chunk)
    if (single) alternatives = parsed.alternatives
    return parsed.text
  })
  return {
    text: translated,
    detected: src,
    alternatives: alternatives.length ? [{ pos: 'Autre sens', terms: alternatives }] : [],
    engine: 'mymemory',
  }
}

async function reviewFrench(text: string, target: string, fetchImpl: FetchLike): Promise<{ text: string; frenchReviewed: boolean }> {
  if (target !== 'fr') return { text, frenchReviewed: false }
  const polished = await polishFrench(text, [], fetchImpl)
  return { text: polished.text, frenchReviewed: polished.reviewed }
}

export async function translateText(
  input: { text: string; source: string; target: string },
  options?: { fetch?: FetchLike; offline?: typeof opusTranslate; onStatus?: (message: string) => void },
): Promise<TranslateResult> {
  const text = input.text.replace(/\r\n/g, '\n').trim()
  if (!text) throw new TranslateError('Écrivez le texte à traduire.')
  if ([...text].length > 20000) throw new TranslateError('Le texte est trop long. Vingt mille caractères au maximum : divisez-le.')
  const source = input.source || 'auto'
  const target = input.target || 'fr'
  if (source !== 'auto' && source === target) {
    const reviewed = await reviewFrench(text, target, options?.fetch ?? fetch)
    return { text: reviewed.text, detected: source, alternatives: [], engine: 'google', frenchReviewed: reviewed.frenchReviewed }
  }
  const fetchImpl = options?.fetch ?? fetch
  const engines = [
    () => translateGoogle(text, source, target, fetchImpl),
    () => translateLingva(text, source, target, fetchImpl),
    () => translateLibre(text, source, target, fetchImpl),
    () => translateMyMemory(text, source, target, fetchImpl),
  ]
  let last: unknown
  for (const engine of engines) {
    try {
      options?.onStatus?.('Traduction en cours…')
      const result = await engine()
      if (!result.text.trim()) continue
      const reviewed = await reviewFrench(result.text, target, fetchImpl)
      return { ...result, text: reviewed.text, frenchReviewed: reviewed.frenchReviewed }
    } catch (error) {
      last = error
    }
  }
  try {
    const detected = (source === 'auto' ? guessLanguage(text) : source) as LangCode
    const offline = options?.offline ?? opusTranslate
    options?.onStatus?.('Les services en ligne ne répondent pas. Préparation de la traduction hors ligne…')
    const value = await offline(text, detected, target as LangCode, options?.onStatus)
    const reviewed = await reviewFrench(value, target, fetchImpl)
    return { text: reviewed.text, detected, alternatives: [], engine: 'opus', frenchReviewed: reviewed.frenchReviewed }
  } catch (error) {
    last = error
  }
  const detail = last instanceof Error ? last.message : ''
  throw new TranslateError(
    detail.includes('Paire')
      ? 'Cette paire de langues n’est pas disponible hors ligne, et les services en ligne ne répondent pas.'
      : 'La traduction est impossible pour le moment. Les services sont inaccessibles. Réessayez dans un instant.',
  )
}
