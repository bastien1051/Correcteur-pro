import { describe, expect, it } from 'vitest'
import { guessLanguage } from './languages'
import { opusRoute } from './opus'
import { parseGoogle, parseMyMemory } from './translate'

describe('détection', () => {
  it('reconnaît les grandes langues', () => {
    expect(guessLanguage('Bonjour, je voudrais un billet pour demain.')).toBe('fr')
    expect(guessLanguage('Where is the train station?')).toBe('en')
    expect(guessLanguage('Buenos días, ¿dónde está la estación?')).toBe('es')
    expect(guessLanguage('مرحبا كيف حالك')).toBe('ar')
    expect(guessLanguage('Где вокзал?')).toBe('ru')
    expect(guessLanguage('Де вокзал і що далі?')).toBe('uk')
    expect(guessLanguage('駅はどこですか')).toBe('ja')
    expect(guessLanguage('火车站在哪里')).toBe('zh')
  })
})

describe('analyse des réponses', () => {
  it('lit une réponse Google et les autres sens', () => {
    const parsed = parseGoogle({
      src: 'en',
      sentences: [{ trans: 'banque' }],
      dict: [{ pos: 'noun', terms: ['banque', 'rive', 'banc'], entry: [{ word: 'banque', score: 0.9 }, { word: 'rive', score: 0.4 }] }],
    })
    expect(parsed.text).toBe('banque')
    expect(parsed.detected).toBe('en')
    expect(parsed.alternatives[0]).toEqual({ pos: 'Nom', terms: ['banque', 'rive'] })
  })

  it('refuse un quota MyMemory épuisé', () => {
    expect(() => parseMyMemory({
      responseStatus: 200,
      quotaFinished: true,
      responseData: { translatedText: 'Bonjour' },
    }, 'Hello')).toThrow()
    expect(() => parseMyMemory({
      responseStatus: 200,
      responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' },
    }, 'Hello there, this is a sentence.')).toThrow()
  })
})

describe('modèle hors ligne', () => {
  it('passe par l’anglais lorsqu’il n’y a pas de modèle direct', () => {
    expect(opusRoute('fr', 'es')).toEqual([['Xenova/opus-mt-fr-en'], ['Xenova/opus-mt-en-es']])
    expect(opusRoute('en', 'fr')).toEqual([['Xenova/opus-mt-en-fr']])
    expect(opusRoute('fr', 'fr')).toEqual([])
  })
})
