import { jsPDF } from 'jspdf'
import type { Letter } from './letters'

function pdfText(value: string): string {
  return value
    .replace(/\u202f/g, '\u00a0')
    .replace(/\u2011/g, '-')
}

export function pdfBlob(letter: Letter): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const margin = 20
  const pageWidth = 210
  const width = pageWidth - margin * 2
  let y = 18

  const ensure = (height: number) => {
    if (y + height > 282) {
      doc.addPage()
      y = 18
    }
  }

  const write = (
    value: string,
    options: { size?: number; bold?: boolean; align?: 'left' | 'right' | 'justify'; x?: number; box?: number; gap?: number } = {},
  ) => {
    if (!value.trim()) return
    const size = options.size ?? 12
    const box = options.box ?? width
    const x = options.x ?? margin
    doc.setFont('times', options.bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(pdfText(value), box) as string[]
    const lineHeight = size * 0.48
    ensure(lines.length * lineHeight)
    const align = options.align ?? 'left'
    const anchor = align === 'right' ? x + box : x
    doc.text(lines, anchor, y, { align, maxWidth: box })
    y += lines.length * lineHeight + (options.gap ?? 1.4)
  }

  for (const line of letter.sender) write(line, { gap: 0.4 })
  y += 6
  for (const line of letter.recipient) write(line, { x: 110, box: 80, gap: 0.4 })
  y += 4
  write(letter.placeDate, { align: 'right', gap: 6 })
  if (letter.subject) {
    doc.setFont('times', 'bold')
    doc.setFontSize(12)
    const label = 'Objet\u00a0: '
    const labelWidth = doc.getTextWidth(label)
    ensure(6)
    doc.text(label, margin, y)
    doc.setFont('times', 'normal')
    const lines = doc.splitTextToSize(pdfText(letter.subject), width - labelWidth) as string[]
    doc.text(lines, margin + labelWidth, y)
    y += lines.length * 5.8 + 2
  }
  if (letter.pieces) write(`Pièces jointes\u00a0: ${letter.pieces}`, { gap: 4 })
  if (letter.salutation) write(`${letter.salutation.replace(/,\s*$/, '')},`, { gap: 4 })
  for (const paragraph of letter.paragraphs) write(paragraph, { align: 'justify', gap: 3.2 })
  if (letter.closing) write(letter.closing, { gap: 8 })
  if (letter.signature) write(letter.signature, { gap: 2 })
  const data = doc.output('arraybuffer')
  return new Blob([data], { type: 'application/pdf' })
}
