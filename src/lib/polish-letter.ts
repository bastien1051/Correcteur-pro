import { polishFrench } from './correct'
import { applyTypography } from './typography'
import type { Letter } from './letters'

export async function polishLetter(
  source: Letter,
  protectedText: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ letter: Letter; reviewed: boolean }> {
  let reviewed = true
  const one = async (text: string) => {
    if (!text.trim()) return text
    const result = await polishFrench(text, protectedText, fetchImpl)
    if (!result.reviewed) reviewed = false
    return result.text.trim()
  }
  const subject = await one(source.subject)
  const closing = source.closing ? await one(source.closing) : ''
  const body = source.paragraphs.join('\n\n')
  const polishedBody = body ? await one(body) : ''
  const parts = polishedBody ? polishedBody.split(/\n\n/) : []
  const paragraphs = parts.length === source.paragraphs.length ? parts : source.paragraphs.map((paragraph) => applyTypography(paragraph))
  return {
    reviewed,
    letter: {
      ...source,
      subject,
      closing,
      paragraphs: paragraphs.filter((paragraph) => paragraph.trim()),
      sender: source.sender.map((line) => applyTypography(line)),
      recipient: source.recipient.map((line) => applyTypography(line)),
      placeDate: applyTypography(source.placeDate),
      pieces: source.pieces ? applyTypography(source.pieces) : '',
      signature: applyTypography(source.signature),
    },
  }
}
