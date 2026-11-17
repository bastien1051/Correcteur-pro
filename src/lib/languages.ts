export type LangCode =
  | 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' | 'nl'
  | 'ar' | 'tr' | 'pl' | 'ro' | 'ru' | 'zh' | 'ja' | 'uk'

export const TARGET_LANGUAGES: { id: LangCode; label: string; speech: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'fr', label: 'Français', speech: 'fr-FR', dir: 'ltr' },
  { id: 'en', label: 'Anglais', speech: 'en-GB', dir: 'ltr' },
  { id: 'es', label: 'Espagnol', speech: 'es-ES', dir: 'ltr' },
  { id: 'de', label: 'Allemand', speech: 'de-DE', dir: 'ltr' },
  { id: 'it', label: 'Italien', speech: 'it-IT', dir: 'ltr' },
  { id: 'pt', label: 'Portugais', speech: 'pt-PT', dir: 'ltr' },
  { id: 'nl', label: 'Néerlandais', speech: 'nl-NL', dir: 'ltr' },
  { id: 'ar', label: 'Arabe', speech: 'ar', dir: 'rtl' },
  { id: 'tr', label: 'Turc', speech: 'tr-TR', dir: 'ltr' },
  { id: 'pl', label: 'Polonais', speech: 'pl-PL', dir: 'ltr' },
  { id: 'ro', label: 'Roumain', speech: 'ro-RO', dir: 'ltr' },
  { id: 'ru', label: 'Russe', speech: 'ru-RU', dir: 'ltr' },
  { id: 'zh', label: 'Chinois', speech: 'zh-CN', dir: 'ltr' },
  { id: 'ja', label: 'Japonais', speech: 'ja-JP', dir: 'ltr' },
  { id: 'uk', label: 'Ukrainien', speech: 'uk-UA', dir: 'ltr' },
]

const NAMES: Record<string, string> = Object.fromEntries(TARGET_LANGUAGES.map((lang) => [lang.id, lang.label.toLowerCase()]))

export function languageLabel(code: string): string {
  return NAMES[code] ?? code
}

export function languageMeta(code: string) {
  return TARGET_LANGUAGES.find((lang) => lang.id === code) ?? TARGET_LANGUAGES[0]
}

export function googleCode(code: string): string {
  if (code === 'zh') return 'zh-CN'
  if (code === 'auto') return 'auto'
  return code
}

export function myMemoryCode(code: string): string {
  if (code === 'zh') return 'zh-CN'
  return code
}

const STOPS: Record<string, string[]> = {
  fr: ['le', 'la', 'les', 'de', 'des', 'un', 'une', 'et', 'est', 'que', 'qui', 'dans', 'pour', 'pas', 'avec', 'sur', 'ce', 'je', 'vous', 'nous', 'au', 'aux', 'du', 'bonjour', 'merci', 'oui', 'non', 'madame', 'monsieur'],
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'it', 'for', 'you', 'with', 'this', 'are', 'was', 'hello', 'please'],
  es: ['el', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'por', 'con', 'para', 'como', 'más', 'hola', 'gracias'],
  de: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'nicht', 'den', 'mit', 'auf', 'ich', 'sie'],
  it: ['il', 'lo', 'la', 'che', 'non', 'di', 'per', 'una', 'sono', 'con', 'ciao', 'grazie'],
  pt: ['os', 'as', 'de', 'que', 'em', 'um', 'uma', 'para', 'com', 'não', 'do', 'da', 'olá'],
  nl: ['de', 'het', 'een', 'van', 'niet', 'met', 'voor', 'zijn', 'op', 'te', 'dat', 'hallo'],
  pl: ['i', 'w', 'na', 'nie', 'się', 'to', 'jest', 'do', 'od', 'jak', 'ale'],
  ro: ['și', 'de', 'nu', 'un', 'este', 'cu', 'pe', 'la', 'din', 'că'],
  tr: ['bir', 've', 'bu', 'için', 'ile', 'da', 'de', 'mi', 'ne', 'var'],
}

/** Détection locale, utilisée seulement si le service en ligne ne répond pas. */
export function guessLanguage(text: string): LangCode {
  const sample = text.trim().slice(0, 2000)
  if (/[\u0600-\u06FF]/.test(sample)) return 'ar'
  if (/[\u3040-\u30FF]/.test(sample)) return 'ja'
  if (/[\u4E00-\u9FFF]/.test(sample)) return 'zh'
  if (/[\u0400-\u04FF]/.test(sample)) return /[іїєґІЇЄҐ]/.test(sample) ? 'uk' : 'ru'
  const words = sample.toLowerCase().match(/\p{L}+/gu) ?? []
  let best: LangCode = 'en'
  let bestScore = 0
  for (const [code, stops] of Object.entries(STOPS)) {
    const set = new Set(stops)
    let score = 0
    for (const word of words) if (set.has(word)) score += 1
    if (code === 'fr' && /[éèêëàâùûôîïçœæ]/i.test(sample)) score += 2
    if (code === 'es' && /[ñ¿¡]/i.test(sample)) score += 2
    if (code === 'de' && /[ßäöü]/i.test(sample)) score += 1
    if (code === 'pt' && /[ãõ]/i.test(sample)) score += 2
    if (code === 'pl' && /[ąćęłńśźż]/i.test(sample)) score += 2
    if (code === 'ro' && /[ășț]/i.test(sample)) score += 2
    if (code === 'tr' && /[ğıİşçöü]/i.test(sample)) score += 2
    if (score > bestScore) {
      bestScore = score
      best = code as LangCode
    }
  }
  return best
}

export function isSingleWord(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length > 0 && trimmed.length <= 48 && !/\s/u.test(trimmed)
}
