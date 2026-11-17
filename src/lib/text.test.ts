import { describe, expect, it } from 'vitest'
import { applyReplacements, chunkByUtf8, chunkText } from './text'
import { applyTypography } from './typography'

describe('découpage', () => {
  it('reconstruit le texte d’origine', () => {
    const text = 'Première phrase. Deuxième phrase !\n\nTroisième, plus longue, qui continue encore un peu.'
    const parts = chunkText(text, 28)
    expect(parts.map((part) => part.text).join('')).toBe(text)
    expect(parts.every((part) => part.text.length <= 28)).toBe(true)
  })

  it('respecte la limite en octets', () => {
    const text = 'Bonjour le monde. Ceci est une phrase assez longue pour être découpée proprement.'
    const parts = chunkByUtf8(text, 40)
    const encoded = new TextEncoder()
    expect(parts.map((part) => part.text).join('')).toBe(text)
    expect(parts.every((part) => encoded.encode(part.text).length <= 40)).toBe(true)
  })
})

describe('remplacements', () => {
  it('applique depuis la fin sans décaler les autres', () => {
    const text = 'un deux trois'
    const next = applyReplacements(text, [
      { offset: 0, length: 2, replacement: 'UNE' },
      { offset: 3, length: 4, replacement: 'DEUX' },
    ])
    expect(next).toBe('UNE DEUX trois')
  })
})

describe('typographie française', () => {
  it('corrige les fautes courantes et n’y revient pas', () => {
    const source = 'C\'est vraiment bien! Il a dit:bonjour. «bonjour» mot  mot. 10:30 https://exemple.fr'
    const next = applyTypography(source)
    expect(next).toBe('C’est vraiment bien\u202f! Il a dit\u202f: bonjour. «\u00a0bonjour\u00a0» mot mot. 10:30 https://exemple.fr')
    expect(applyTypography(next)).toBe(next)
  })

  it('transforme les guillemets droits', () => {
    expect(applyTypography('Il a dit "bonjour" hier.')).toBe('Il a dit «\u00a0bonjour\u00a0» hier.')
  })
})
