import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx'
import type { Letter } from './letters'

const FONT = 'Times New Roman'

function run(text: string, bold = false): TextRun {
  return new TextRun({ text, font: FONT, size: 24, bold })
}

function paragraph(
  text: string,
  options: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; before?: number; after?: number; indent?: number } = {},
): Paragraph {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.LEFT,
    spacing: { before: options.before ?? 0, after: options.after ?? 120, line: 276 },
    indent: options.indent ? { left: options.indent } : undefined,
    children: [run(text, options.bold)],
  })
}

export async function docxBlob(letter: Letter): Promise<Blob> {
  const children: Paragraph[] = []
  for (const line of letter.sender) children.push(paragraph(line, { after: 40 }))
  children.push(paragraph('', { after: 200 }))
  for (const line of letter.recipient) children.push(paragraph(line, { after: 40, indent: 4820 }))
  children.push(paragraph(letter.placeDate, { align: AlignmentType.RIGHT, before: 200, after: 280 }))
  if (letter.subject) {
    children.push(new Paragraph({
      spacing: { after: 200 },
      children: [run('Objet\u202f: ', true), run(letter.subject)],
    }))
  }
  if (letter.pieces) {
    children.push(new Paragraph({
      spacing: { after: 200 },
      children: [run('Pièces jointes\u202f: ', true), run(letter.pieces)],
    }))
  }
  if (letter.salutation) children.push(paragraph(`${letter.salutation.replace(/,\s*$/, '')},`, { before: 120, after: 200 }))
  for (const block of letter.paragraphs) {
    children.push(paragraph(block, { align: AlignmentType.JUSTIFIED, after: 200 }))
  }
  if (letter.closing) children.push(paragraph(letter.closing, { before: 120, after: 360 }))
  if (letter.signature) children.push(paragraph(letter.signature, { after: 80 }))

  const document = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 24 } },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
      },
      children,
    }],
  })
  return Packer.toBlob(document)
}
