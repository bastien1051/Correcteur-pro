import { excerptOf, remember } from '../lib/history'
import {
  filenameFor,
  letterToPlain,
  missingFields,
  protectedValues,
  TEMPLATES,
  templateById,
  type Letter,
  type Template,
  type Values,
} from '../lib/letters'
import { polishLetter } from '../lib/polish-letter'
import { copyText, saveBlob, toast } from './toast'

const PROFILE = 'correcteur-pro-profil'
const DRAFT = 'correcteur-pro-draft-letter'
const PROFILE_IDS = ['civilite', 'prenom', 'nom', 'adresse', 'codePostal', 'ville', 'telephone', 'email', 'lieu']

export type LettersView = { open: (templateId: string, fields: Values) => void }

export function mountLetters(host: HTMLElement): LettersView {
  const groups = new Map<string, Template[]>()
  for (const template of TEMPLATES) {
    const list = groups.get(template.group) ?? []
    list.push(template)
    groups.set(template.group, list)
  }
  const options = [...groups.entries()].map(([group, templates]) => {
    const inner = templates.map((template) => `<option value="${template.id}">${template.title}</option>`).join('')
    return `<optgroup label="${group}">${inner}</optgroup>`
  }).join('')

  host.innerHTML = `
    <p class="lede">Choisissez un modèle, remplissez les champs, puis préparez le courrier. La mise en page est celle d’une lettre formelle. Rien n’est laissé en blanc.</p>
    <div class="letters-layout">
      <div class="form-column">
        <label class="field">Modèle
          <select id="letter-template">${options}</select>
        </label>
        <p class="field-hint" id="letter-description"></p>
        <form id="letter-form"></form>
        <p class="field-hint">Les champs marqués d’une étoile sont obligatoires. Vos coordonnées restent sur cet appareil pour le prochain courrier.</p>
        <p class="status" id="letter-error" role="alert"></p>
        <div class="toolbar">
          <button class="btn primary" id="prepare-letter" type="button">Préparer le courrier</button>
          <button class="btn" id="download-pdf" type="button">Télécharger le PDF</button>
          <button class="btn" id="download-docx" type="button">Télécharger en Word</button>
          <button class="btn" id="copy-letter" type="button">Copier</button>
          <button class="btn quiet" id="print-letter" type="button">Imprimer</button>
        </div>
        <p class="letter-note">Ces modèles sont des bases sérieuses. Relisez-les avant l’envoi. Ils ne remplacent pas un conseil juridique.</p>
      </div>
      <div>
        <p class="status letter-note" id="letter-status" role="status"></p>
        <div id="letter-preview"></div>
      </div>
    </div>
  `

  const select = host.querySelector<HTMLSelectElement>('#letter-template')!
  const form = host.querySelector<HTMLFormElement>('#letter-form')!
  const description = host.querySelector<HTMLElement>('#letter-description')!
  const error = host.querySelector<HTMLElement>('#letter-error')!
  const status = host.querySelector<HTMLElement>('#letter-status')!
  const preview = host.querySelector<HTMLElement>('#letter-preview')!
  let template = templateById(select.value)
  let values: Values = {}
  let current: Letter | null = null
  let currentKey = ''
  let busy = false

  const readValues = (): Values => {
    const data: Values = {}
    for (const field of template.fields) {
      const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${field.id}"]`)
      data[field.id] = input?.value ?? ''
    }
    return data
  }

  const refreshPreview = () => {
    values = readValues()
    saveProfile(values)
    saveDraft(template.id, values)
    const missing = missingFields(template, values)
    current = null
    currentKey = ''
    if (missing.length) {
      preview.innerHTML = ''
      const note = document.createElement('div')
      note.className = 'notice'
      note.textContent = `Il reste à indiquer : ${missing.map((field) => field.label.toLowerCase()).join(', ')}.`
      preview.append(note)
      status.textContent = ''
      return
    }
    renderLetter(preview, template.build(values))
    status.textContent = 'Aperçu immédiat. La relecture automatique se fait au moment de préparer, copier ou télécharger.'
  }

  const renderForm = () => {
    description.textContent = template.description
    form.replaceChildren()
    const saved = { ...loadProfile(), ...loadDraft(template.id) }
    for (const field of template.fields) {
      const label = document.createElement('label')
      label.className = 'field'
      const title = document.createElement('span')
      title.textContent = field.label
      if (field.required) {
        const star = document.createElement('span')
        star.className = 'req'
        star.textContent = ' *'
        title.append(star)
      }
      label.append(title)
      const control = field.kind === 'textarea'
        ? document.createElement('textarea')
        : field.kind === 'select'
          ? document.createElement('select')
          : document.createElement('input')
      control.name = field.id
      control.id = `field-${field.id}`
      control.required = Boolean(field.required)
      control.setAttribute('aria-label', field.label)
      if (control instanceof HTMLInputElement) {
        control.type = field.kind === 'email' || field.kind === 'tel' || field.kind === 'date' ? field.kind : 'text'
        if (field.kind === 'date' && !saved[field.id]) control.value = today()
      }
      if (control instanceof HTMLTextAreaElement) control.rows = field.rows ?? 4
      if (field.autocomplete) control.setAttribute('autocomplete', field.autocomplete)
      if (field.placeholder && 'placeholder' in control) control.placeholder = field.placeholder
      if (control instanceof HTMLSelectElement) {
        for (const option of field.options ?? []) {
          const node = document.createElement('option')
          node.value = option.value
          node.textContent = option.label
          control.append(node)
        }
      }
      const initial = saved[field.id] || (field.kind === 'select' ? field.options?.[0]?.value ?? '' : '')
      if (initial) control.value = initial
      control.addEventListener('input', refreshPreview)
      control.addEventListener('change', refreshPreview)
      label.append(control)
      if (field.hint) {
        const hint = document.createElement('span')
        hint.className = 'field-hint'
        hint.textContent = field.hint
        label.append(hint)
      }
      form.append(label)
    }
    refreshPreview()
  }

  select.addEventListener('change', () => {
    template = templateById(select.value)
    renderForm()
  })

  async function ensure(action: string): Promise<Letter | null> {
    values = readValues()
    const missing = missingFields(template, values)
    if (missing.length) {
      error.textContent = `Il reste à indiquer : ${missing.map((field) => field.label.toLowerCase()).join(', ')}.`
      return null
    }
    error.textContent = ''
    const key = `${template.id}:${JSON.stringify(values)}`
    if (current && currentKey === key) return current
    if (busy) return null
    busy = true
    status.textContent = 'Relecture en cours…'
    try {
      const built = template.build(values)
      const polished = await polishLetter(built, protectedValues(values))
      current = polished.letter
      currentKey = key
      renderLetter(preview, current)
      status.textContent = polished.reviewed
        ? 'Courrier relu. Vous pouvez le copier, l’imprimer ou le télécharger.'
        : 'La typographie a été appliquée. La relecture en ligne était indisponible : relisez le courrier avant l’envoi.'
      void remember({
        id: crypto.randomUUID(),
        kind: 'courrier',
        title: template.title,
        excerpt: excerptOf(current.paragraphs[0] || current.subject || template.title),
        createdAt: Date.now(),
        text: letterToPlain(current),
        extra: { templateId: template.id, fields: values },
      })
      return current
    } catch {
      toast(`Impossible de ${action} pour le moment.`)
      return null
    } finally {
      busy = false
    }
  }

  host.querySelector('#prepare-letter')!.addEventListener('click', () => { void ensure('préparer le courrier') })
  host.querySelector('#download-pdf')!.addEventListener('click', async () => {
    const letter = await ensure('créer le PDF')
    if (!letter) return
    const { pdfBlob } = await import('../lib/export-pdf')
    saveBlob(pdfBlob(letter), filenameFor(template, 'pdf'))
    toast('PDF téléchargé.')
  })
  host.querySelector('#download-docx')!.addEventListener('click', async () => {
    const letter = await ensure('créer le document Word')
    if (!letter) return
    const { docxBlob } = await import('../lib/export-docx')
    saveBlob(await docxBlob(letter), filenameFor(template, 'docx'))
    toast('Document Word téléchargé.')
  })
  host.querySelector('#copy-letter')!.addEventListener('click', async () => {
    const letter = await ensure('copier le courrier')
    if (!letter) return
    const ok = await copyText(letterToPlain(letter))
    toast(ok ? 'Courrier copié.' : 'La copie a échoué.')
  })
  host.querySelector('#print-letter')!.addEventListener('click', async () => {
    const letter = await ensure('imprimer')
    if (!letter) return
    document.body.dataset.print = 'letter'
    window.print()
  })
  window.addEventListener('afterprint', () => { delete document.body.dataset.print })

  renderForm()
  return {
    open(templateId: string, fields: Values) {
      select.value = templateId
      template = templateById(templateId)
      saveDraft(templateId, fields)
      renderForm()
    },
  }
}

function renderLetter(host: HTMLElement, letter: Letter) {
  host.replaceChildren()
  const article = document.createElement('article')
  article.className = 'sheet'
  article.lang = 'fr'
  const addBlock = (lines: string[], className: string) => {
    if (!lines.length) return
    const block = document.createElement('div')
    block.className = className
    for (const line of lines) {
      const paragraph = document.createElement('p')
      paragraph.textContent = line
      block.append(paragraph)
    }
    article.append(block)
  }
  addBlock(letter.sender, 'letter-sender')
  addBlock(letter.recipient, 'letter-recipient')
  const date = document.createElement('p')
  date.className = 'letter-date'
  date.textContent = letter.placeDate
  article.append(date)
  if (letter.subject) {
    const subject = document.createElement('p')
    subject.className = 'letter-subject'
    const strong = document.createElement('strong')
    strong.textContent = 'Objet\u202f: '
    subject.append(strong, document.createTextNode(letter.subject))
    article.append(subject)
  }
  if (letter.pieces) {
    const pieces = document.createElement('p')
    pieces.className = 'letter-pieces'
    const strong = document.createElement('strong')
    strong.textContent = 'Pièces jointes\u202f: '
    pieces.append(strong, document.createTextNode(letter.pieces))
    article.append(pieces)
  }
  if (letter.salutation) {
    const salute = document.createElement('p')
    salute.className = 'letter-salute'
    salute.textContent = `${letter.salutation.replace(/,\s*$/, '')},`
    article.append(salute)
  }
  for (const text of letter.paragraphs) {
    const paragraph = document.createElement('p')
    paragraph.className = 'letter-body'
    paragraph.textContent = text
    article.append(paragraph)
  }
  if (letter.closing) {
    const closing = document.createElement('p')
    closing.className = 'letter-closing'
    closing.textContent = letter.closing
    article.append(closing)
  }
  if (letter.signature) {
    const sign = document.createElement('p')
    sign.className = 'letter-sign'
    sign.textContent = letter.signature
    article.append(sign)
  }
  host.append(article)
}

function today(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function loadProfile(): Values {
  try { return JSON.parse(localStorage.getItem(PROFILE) || '{}') as Values } catch { return {} }
}

function saveProfile(values: Values) {
  const profile = loadProfile()
  for (const id of PROFILE_IDS) if (values[id]) profile[id] = values[id]
  try { localStorage.setItem(PROFILE, JSON.stringify(profile)) } catch { /* privé */ }
}

function loadDraft(templateId: string): Values {
  try {
    const raw = JSON.parse(sessionStorage.getItem(DRAFT) || '{}') as { id?: string; values?: Values }
    return raw.id === templateId ? raw.values ?? {} : {}
  } catch {
    return {}
  }
}

function saveDraft(templateId: string, values: Values) {
  try { sessionStorage.setItem(DRAFT, JSON.stringify({ id: templateId, values })) } catch { /* privé */ }
}
