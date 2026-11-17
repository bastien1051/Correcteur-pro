import { languageLabel, languageMeta, TARGET_LANGUAGES } from '../lib/languages'
import { excerptOf, remember, type HistoryRecord } from '../lib/history'
import { TranslateError, translateText, type Alternative } from '../lib/translate'
import { copyText, toast } from './toast'

const DRAFT = 'correcteur-pro-draft-translate'

const ENGINE_NOTE: Record<string, string> = {
  google: 'Traduction automatique, relue en français lorsque la langue d’arrivée est le français.',
  lingva: 'Traduction de secours. Relisez le résultat.',
  libre: 'Traduction de secours. Relisez le résultat.',
  mymemory: 'Traduction de secours. Relisez le résultat.',
  opus: 'Traduction hors ligne. Relisez-la avec attention.',
}

export type TranslateView = {
  load: (text: string, source?: string, target?: string, output?: string) => void
}

export function mountTranslate(host: HTMLElement): TranslateView {
  const sourceOptions = ['<option value="auto">Détecter la langue</option>']
    .concat(TARGET_LANGUAGES.map((lang) => `<option value="${lang.id}">${lang.label}</option>`))
    .join('')
  const targetOptions = TARGET_LANGUAGES.map((lang) => `<option value="${lang.id}"${lang.id === 'fr' ? ' selected' : ''}>${lang.label}</option>`).join('')
  host.innerHTML = `
    <p class="lede">La langue d’arrivée est le français. Vous pouvez aussi partir du français vers une autre langue. Un mot isolé affiche d’autres sens lorsqu’ils existent.</p>
    <div class="row">
      <label class="field grow">Langue du texte
        <select id="source-lang">${sourceOptions}</select>
      </label>
      <button class="btn" id="swap-lang" type="button">Échanger</button>
      <label class="field grow">Langue d’arrivée
        <select id="target-lang">${targetOptions}</select>
      </label>
    </div>
    <label class="field">Texte à traduire
      <textarea id="translate-input" placeholder="Un mot, une phrase ou un message."></textarea>
    </label>
    <div class="toolbar">
      <button class="btn primary" id="translate-btn" type="button">Traduire</button>
      <button class="btn" id="copy-translation" type="button">Copier</button>
      <button class="btn" id="speak-btn" type="button">Lire</button>
    </div>
    <p class="status" id="translate-status" role="status"></p>
    <div class="result" id="translate-result" hidden>
      <p class="meta" id="translate-pair"></p>
      <p class="plain" id="translate-output"></p>
      <div id="translate-alts"></div>
    </div>
  `
  const input = host.querySelector<HTMLTextAreaElement>('#translate-input')!
  const source = host.querySelector<HTMLSelectElement>('#source-lang')!
  const target = host.querySelector<HTMLSelectElement>('#target-lang')!
  const status = host.querySelector<HTMLElement>('#translate-status')!
  const result = host.querySelector<HTMLElement>('#translate-result')!
  const pair = host.querySelector<HTMLElement>('#translate-pair')!
  const output = host.querySelector<HTMLElement>('#translate-output')!
  const alts = host.querySelector<HTMLElement>('#translate-alts')!
  const button = host.querySelector<HTMLButtonElement>('#translate-btn')!
  const speakBtn = host.querySelector<HTMLButtonElement>('#speak-btn')!
  let detected = ''
  let speaking = false

  try {
    const saved = sessionStorage.getItem(DRAFT)
    if (saved) input.value = saved
  } catch { /* privé */ }
  input.addEventListener('input', () => {
    try { sessionStorage.setItem(DRAFT, input.value) } catch { /* privé */ }
  })

  host.querySelector('#swap-lang')!.addEventListener('click', () => {
    const from = source.value === 'auto' ? (detected || 'fr') : source.value
    const to = target.value
    source.value = to
    target.value = from === to ? 'en' : from
  })

  button.addEventListener('click', () => { void run() })

  async function run() {
    button.disabled = true
    button.textContent = 'Traduction…'
    status.textContent = 'Traduction en cours…'
    try {
      const translated = await translateText(
        { text: input.value, source: source.value, target: target.value },
        { onStatus: (message) => { status.textContent = message } },
      )
      detected = translated.detected
      show(translated.text, translated.detected, target.value, translated.alternatives, translated.engine, translated.frenchReviewed)
      void remember(record(input.value, translated.text, translated.detected, target.value))
    } catch (error) {
      result.hidden = true
      status.textContent = error instanceof TranslateError || error instanceof Error
        ? error.message
        : 'La traduction est impossible pour le moment.'
    } finally {
      button.disabled = false
      button.textContent = 'Traduire'
    }
  }

  function show(text: string, from: string, to: string, alternatives: Alternative[], engine: string, reviewed: boolean) {
    output.textContent = text
    output.dir = languageMeta(to).dir
    output.lang = to
    pair.textContent = `${languageLabel(from)} → ${languageLabel(to)}`
    const note = engine === 'google' ? 'Traduction automatique.' : (ENGINE_NOTE[engine] ?? 'Traduction automatique.')
    const review = to === 'fr'
      ? (reviewed ? ' Le français a été relu.' : ' La relecture française n’a pas pu être faite.')
      : ''
    status.textContent = `${note}${review}`
    alts.replaceChildren()
    const main = text.trim().toLocaleLowerCase('fr-FR')
    for (const group of alternatives) {
      const terms = group.terms.filter((term) => term.trim().toLocaleLowerCase('fr-FR') !== main)
      if (!terms.length) continue
      const block = document.createElement('div')
      block.className = 'alt-group'
      const title = document.createElement('h3')
      title.textContent = group.pos
      const row = document.createElement('div')
      row.className = 'suggestions'
      for (const term of terms) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'btn'
        chip.textContent = term
        chip.addEventListener('click', () => {
          output.textContent = term
          toast('Sens retenu. Vous pouvez le copier.')
        })
        row.append(chip)
      }
      block.append(title, row)
      alts.append(block)
    }
    result.hidden = false
  }

  host.querySelector('#copy-translation')!.addEventListener('click', async () => {
    const text = output.textContent ?? ''
    if (!text.trim()) return
    const ok = await copyText(text)
    toast(ok ? 'Traduction copiée.' : 'La copie a échoué.')
  })

  speakBtn.addEventListener('click', () => {
    const text = output.textContent ?? ''
    if (!text.trim() || !('speechSynthesis' in window)) {
      toast('La lecture vocale n’est pas disponible sur cet appareil.')
      return
    }
    if (speaking) {
      window.speechSynthesis.cancel()
      speaking = false
      speakBtn.textContent = 'Lire'
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    const meta = languageMeta(target.value)
    utterance.lang = meta.speech
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(meta.speech.slice(0, 2).toLowerCase()))
    if (voice) utterance.voice = voice
    utterance.onend = () => {
      speaking = false
      speakBtn.textContent = 'Lire'
    }
    speaking = true
    speakBtn.textContent = 'Arrêter'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  })
  window.speechSynthesis?.getVoices()
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => { window.speechSynthesis.getVoices() })

  return {
    load(text: string, from?: string, to?: string, translated?: string) {
      input.value = text
      if (from) source.value = from
      if (to) target.value = to
      try { sessionStorage.setItem(DRAFT, text) } catch { /* privé */ }
      if (translated) show(translated, from && from !== 'auto' ? from : 'fr', to || 'fr', [], 'google', to === 'fr' || !to)
      else void run()
    },
  }
}

function record(original: string, text: string, source: string, target: string): HistoryRecord {
  return {
    id: crypto.randomUUID(),
    kind: 'traduction',
    title: `${languageLabel(source)} → ${languageLabel(target)}`,
    excerpt: excerptOf(text),
    createdAt: Date.now(),
    text,
    extra: { original, source, target },
  }
}
