export type Span = {
  offset: number
  length: number
  replacement: string
}

export function applyReplacements(text: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => b.offset - a.offset || b.length - a.length)
  let out = text
  let cursor = text.length
  for (const span of sorted) {
    const end = span.offset + span.length
    if (span.offset < 0 || end > out.length || end > cursor) continue
    out = out.slice(0, span.offset) + span.replacement + out.slice(end)
    cursor = span.offset
  }
  return out
}

export function overlaps(aStart: number, aLen: number, bStart: number, bLen: number): boolean {
  return aStart < bStart + bLen && bStart < aStart + aLen
}

/** Découpe un texte en conservant tout le contenu, de préférence entre les phrases. */
export function chunkText(text: string, maxLen: number): { text: string; offset: number }[] {
  if (maxLen < 1) throw new Error('maxLen')
  if (text.length <= maxLen) return [{ text, offset: 0 }]
  const parts: { text: string; offset: number }[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + maxLen)
    if (end < text.length) {
      const slice = text.slice(start, end)
      const marks = ['\n\n', '\n', '. ', '! ', '? ', '… ', '; ', ', ']
      let cut = -1
      for (const mark of marks) {
        const at = slice.lastIndexOf(mark)
        if (at >= Math.floor(maxLen * 0.4)) {
          cut = at + mark.length
          break
        }
      }
      if (cut > 0) end = start + cut
    }
    if (end <= start) end = Math.min(text.length, start + maxLen)
    parts.push({ text: text.slice(start, end), offset: start })
    start = end
  }
  return parts
}

export function chunkByUtf8(text: string, maxBytes: number): { text: string; offset: number }[] {
  const encoder = new TextEncoder()
  if (encoder.encode(text).length <= maxBytes) return [{ text, offset: 0 }]
  const rough = Math.max(40, maxBytes - 40)
  const pieces = chunkText(text, rough)
  const out: { text: string; offset: number }[] = []
  for (const piece of pieces) {
    if (encoder.encode(piece.text).length <= maxBytes) {
      out.push(piece)
      continue
    }
    let start = 0
    const chars = [...piece.text]
    while (start < chars.length) {
      let end = start + 1
      while (end < chars.length && encoder.encode(chars.slice(start, end + 1).join('')).length <= maxBytes) end += 1
      const slice = chars.slice(start, end).join('')
      out.push({ text: slice, offset: piece.offset + [...piece.text].slice(0, start).join('').length })
      start = end
    }
  }
  return out
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function countChars(text: string): string {
  const n = [...text].length
  return n <= 1 ? `${n} caractère` : `${n.toLocaleString('fr-FR')} caractères`
}
