import { chunkText } from './text'
import type { LangCode } from './languages'

const DIRECT: Record<string, string> = {
  'en-fr': 'Xenova/opus-mt-en-fr',
  'fr-en': 'Xenova/opus-mt-fr-en',
  'es-en': 'Xenova/opus-mt-es-en',
  'en-es': 'Xenova/opus-mt-en-es',
  'de-en': 'Xenova/opus-mt-de-en',
  'en-de': 'Xenova/opus-mt-en-de',
  'it-en': 'Xenova/opus-mt-it-en',
  'en-it': 'Xenova/opus-mt-en-it',
  'pt-en': 'Xenova/opus-mt-pt-en',
  'en-pt': 'Xenova/opus-mt-en-pt',
  'nl-en': 'Xenova/opus-mt-nl-en',
  'en-nl': 'Xenova/opus-mt-en-nl',
  'ar-en': 'Xenova/opus-mt-ar-en',
  'en-ar': 'Xenova/opus-mt-en-ar',
  'tr-en': 'Xenova/opus-mt-tr-en',
  'en-tr': 'Xenova/opus-mt-en-tr',
  'pl-en': 'Xenova/opus-mt-pl-en',
  'en-pl': 'Xenova/opus-mt-en-pl',
  'ro-en': 'Xenova/opus-mt-ro-en',
  'en-ro': 'Xenova/opus-mt-en-ro',
  'ru-en': 'Xenova/opus-mt-ru-en',
  'en-ru': 'Xenova/opus-mt-en-ru',
  'zh-en': 'Xenova/opus-mt-zh-en',
  'en-zh': 'Xenova/opus-mt-en-zh',
  'ja-en': 'Xenova/opus-mt-ja-en',
  'en-ja': 'Xenova/opus-mt-en-jap',
  'uk-en': 'Xenova/opus-mt-uk-en',
  'en-uk': 'Xenova/opus-mt-en-uk',
}

export function opusRoute(source: LangCode, target: LangCode): string[][] {
  if (source === target) return []
  const direct = DIRECT[`${source}-${target}`]
  if (direct) return [[direct]]
  if (source !== 'en' && target !== 'en') {
    const toEn = DIRECT[`${source}-en`]
    const fromEn = DIRECT[`en-${target}`]
    if (toEn && fromEn) return [[toEn], [fromEn]]
  }
  return []
}

type Translator = (text: string) => Promise<string>

const cache = new Map<string, Promise<Translator>>()

function readTranslation(output: unknown): string {
  if (typeof output === 'string') return output.trim()
  const row = Array.isArray(output) ? output[0] : output
  if (row && typeof row === 'object' && 'translation_text' in row) {
    return String((row as { translation_text: unknown }).translation_text ?? '').trim()
  }
  return ''
}

async function loadModel(model: string, onStatus?: (message: string) => void): Promise<Translator> {
  const existing = cache.get(model)
  if (existing) return existing
  const pending = (async () => {
    onStatus?.('Téléchargement du modèle de traduction hors ligne. Cela peut prendre un moment, une seule fois.')
    const transformers = await import('@huggingface/transformers')
    transformers.env.allowLocalModels = false
    transformers.env.useBrowserCache = true
    const create = transformers.pipeline as unknown as (
      task: string,
      modelName: string,
      options?: { dtype?: string; progress_callback?: (event: { status?: string; progress?: number }) => void },
    ) => Promise<(input: string) => Promise<unknown>>
    const translator = await create('translation', model, {
      dtype: 'q8',
      progress_callback: (event) => {
        if (event.status === 'progress' && typeof event.progress === 'number') {
          onStatus?.(`Modèle hors ligne : ${Math.round(event.progress)} %.`)
        }
      },
    })
    return async (text: string) => readTranslation(await translator(text))
  })()
  cache.set(model, pending)
  try {
    return await pending
  } catch (error) {
    cache.delete(model)
    throw error
  }
}

async function translateWith(model: string, text: string, onStatus?: (message: string) => void): Promise<string> {
  const translator = await loadModel(model, onStatus)
  const parts = text.split(/(\n+)/)
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    if (/^\n+$/.test(part)) {
      out.push(part)
      continue
    }
    const chunks = chunkText(part, 350)
    const translated: string[] = []
    for (const chunk of chunks) {
      const value = await translator(chunk.text.trim())
      translated.push(value || chunk.text)
    }
    out.push(translated.join(' '))
  }
  return out.join('')
}

export async function opusTranslate(
  text: string,
  source: LangCode,
  target: LangCode,
  onStatus?: (message: string) => void,
): Promise<string> {
  const route = opusRoute(source, target)
  if (!route.length) throw new Error('Paire de langues indisponible hors ligne.')
  let current = text
  for (const step of route) {
    const model = step[0]
    if (!model) continue
    current = await translateWith(model, current, onStatus)
  }
  if (!current.trim()) throw new Error('Traduction hors ligne vide.')
  return current
}
