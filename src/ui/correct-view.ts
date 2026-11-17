import { checkFrench, CorrectorError } from '../lib/correct'
import { excerptOf, remember, type HistoryRecord } from '../lib/history'
import { applyReplacements, countChars, escapeHtml } from '../lib/text'
import { applyTypography, type Issue } from '../lib/typography'
import { copyText, toast } from './toast'

const DRAFT = 'correcteur-pro-draft-correct'

export type CorrectView = { load: (text: string) => void }

export function mountCorrect(host: HTMLElement): CorrectView {
  host.innerHTML = `
    <p class="lede">Collez un texte ou un message. Les fautes sont soulignées, avec une explication courte. Vous pouvez accepter une suggestion, ou tout corriger d’un coup.</p>
    <div class="editor">
      <div class="back" aria-hidden="true"><div class="back-inner"></div></div>
      <textarea id="correct-input" spellcheck="false" aria-label="Texte à corriger" placeholder="Écrivez ou collez votre texte ici."></textarea>
    </div>
    <div class="toolbar">
      <button class="btn" id="check-btn" type="button">Vérifier</button>
      <button class="btn primary" id="fix-all" type="button">Tout corriger</button>
      <button class="btn" id="copy-correct" type="button">Copier</button>
      <button class="btn quiet" id="clear-correct" type="button">Effacer</button>
      <span class="meta" id="correct-count"></span>
    </div>
    <p class="status" id="correct-status" role="status"></p>
    <div class="issues" id="correct-issues"></div>
  `
  const input = host.querySelector<HTMLTextAreaElement>('#correct-input')!
  const back = host.querySelector<HTMLElement>('.back-inner')!
  const status = host.querySelector<HTMLElement>('#correct-status')!
  const issuesHost = host.querySelector<HTMLElement>('#correct-issues')!
  const count = host.querySelector<HTMLElement>('#correct-count')!
  const checkBtn = host.querySelector<HTMLButtonElement>('#check-btn')!
  const fixBtn = host.querySelector<HTMLButtonElement>('#fix-all')!
  const clearBtn = host.querySelector<HTMLButtonElement>('#clear-correct')!
  let issues: Issue[] = []
  let active = -1
  let busy = false
  let pauseAuto = false
  let timer = 0
  let clearArmed = false
  let clearTimer = 0

  try { input.value = sessionStorage.getItem(DRAFT) ?? '' } catch { /* privé */ }

  const paint = () => {
    const html = renderMarks(input.value, issues, active)
    back.innerHTML = html
    count.textContent = countChars(input.value)
    fixBtn.disabled = busy || !issues.some((issue) => issue.replacements.length)
  }

  const persist = () => {
    try { sessionStorage.setItem(DRAFT, input.value) } catch { /* privé */ }
  }

  input.addEventListener('scroll', () => {
    back.style.transform = `translateY(${-input.scrollTop}px)`
  })
  input.addEventListener('input', () => {
    issues = []
    active = -1
    paint()
    persist()
    window.clearTimeout(timer)
    if (pauseAuto || input.value.trim().length < 2) return
    if ([...input.value].length > 8000) {
      status.textContent = 'Texte long : appuyez sur Vérifier.'
      return
    }
    timer = window.setTimeout(() => { void run() }, 1400)
  })
  back.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-offset]')
    if (!target) return
    const offset = Number(target.dataset.offset)
    active = offset
    input.focus()
    const issue = issues.find((item) => item.offset === offset)
    if (issue) input.setSelectionRange(issue.offset, issue.offset + issue.length)
    paint()
    issuesHost.querySelector<HTMLElement>(`[data-offset="${offset}"]`)?.scrollIntoView({ block: 'nearest' })
  })

  async function run() {
    const text = input.value
    if (!text.trim()) {
      status.textContent = 'Collez ou écrivez un texte avant de lancer la vérification.'
      issues = []
      paint()
      return
    }
    if ([...text].length > 40000) {
      status.textContent = 'Le texte dépasse 40 000 caractères. Divisez-le en plusieurs parties.'
      return
    }
    busy = true
    checkBtn.disabled = true
    checkBtn.textContent = 'Vérification…'
    status.textContent = 'Vérification en cours…'
    try {
      const result = await checkFrench(text)
      if (input.value !== text) return
      issues = result.issues
      active = issues[0]?.offset ?? -1
      if (!issues.length) status.textContent = 'Aucune erreur détectée. Le texte est prêt.'
      else status.textContent = result.partial
        ? `${issues.length} remarque${issues.length > 1 ? 's' : ''}. Une partie du texte n’a pas pu être vérifiée.`
        : `${issues.length} remarque${issues.length > 1 ? 's' : ''}.`
      paintIssues()
    } catch (error) {
      issues = []
      pauseAuto = error instanceof CorrectorError && error.kind === 'rate'
      status.textContent = error instanceof Error ? error.message : 'Le service de correction est inaccessible.'
    } finally {
      busy = false
      checkBtn.disabled = false
      checkBtn.textContent = 'Vérifier'
      paint()
    }
  }

  function paintIssues() {
    issuesHost.replaceChildren()
    for (const issue of issues) {
      const card = document.createElement('article')
      card.className = 'issue'
      card.dataset.offset = String(issue.offset)
      const quote = document.createElement('p')
      const wrong = input.value.slice(issue.offset, issue.offset + issue.length)
      quote.innerHTML = `${escapeHtml(issue.shortMessage)} — <strong>${escapeHtml(wrong)}</strong>`
      const explain = document.createElement('p')
      explain.textContent = issue.message
      card.append(quote, explain)
      if (issue.replacements.length) {
        const row = document.createElement('div')
        row.className = 'suggestions'
        for (const suggestion of issue.replacements) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'btn'
          button.textContent = labelFor(input.value, issue, suggestion)
          button.addEventListener('click', () => accept(issue, suggestion))
          row.append(button)
        }
        card.append(row)
      }
      issuesHost.append(card)
    }
  }

  function accept(issue: Issue, replacement: string) {
    const delta = replacement.length - issue.length
    input.value = input.value.slice(0, issue.offset) + replacement + input.value.slice(issue.offset + issue.length)
    issues = issues.flatMap((other) => {
      if (other.offset === issue.offset) return []
      if (other.offset > issue.offset) return [{ ...other, offset: other.offset + delta }]
      if (other.offset + other.length > issue.offset) return []
      return [other]
    })
    persist()
    paint()
    paintIssues()
    status.textContent = 'Suggestion acceptée.'
  }

  checkBtn.addEventListener('click', () => {
    pauseAuto = false
    void run()
  })
  fixBtn.addEventListener('click', () => {
    const spans = issues.flatMap((issue) => {
      const replacement = issue.replacements[0]
      return replacement === undefined ? [] : [{ offset: issue.offset, length: issue.length, replacement }]
    })
    if (!spans.length) {
      toast('Aucune correction automatique n’est proposée.')
      return
    }
    input.value = applyTypography(applyReplacements(input.value, spans))
    issues = []
    persist()
    paint()
    paintIssues()
    toast('Corrections appliquées.')
    void remember(record(input.value))
    void run()
  })
  host.querySelector('#copy-correct')!.addEventListener('click', async () => {
    if (!input.value.trim()) return
    const ok = await copyText(input.value)
    toast(ok ? 'Texte copié.' : 'La copie a échoué. Sélectionnez le texte à la main.')
    if (ok) void remember(record(input.value))
  })
  clearBtn.addEventListener('click', () => {
    if (!input.value) return
    if (!clearArmed) {
      clearArmed = true
      clearBtn.textContent = 'Confirmer l’effacement'
      clearTimer = window.setTimeout(() => {
        clearArmed = false
        clearBtn.textContent = 'Effacer'
      }, 4000)
      return
    }
    window.clearTimeout(clearTimer)
    clearArmed = false
    clearBtn.textContent = 'Effacer'
    input.value = ''
    issues = []
    status.textContent = ''
    persist()
    paint()
    paintIssues()
  })

  paint()
  return {
    load(text: string) {
      input.value = text
      issues = []
      persist()
      paint()
      paintIssues()
      void run()
    },
  }
}

function record(text: string): HistoryRecord {
  return {
    id: crypto.randomUUID(),
    kind: 'correction',
    title: 'Correction',
    excerpt: excerptOf(text),
    createdAt: Date.now(),
    text,
  }
}

function labelFor(text: string, issue: Issue, suggestion: string): string {
  if ([...suggestion].length >= 2) return suggestion
  let start = issue.offset
  let end = issue.offset + issue.length
  while (start > 0 && /[\p{L}'’]/u.test(text[start - 1] ?? '')) start -= 1
  while (end < text.length && /[\p{L}'’]/u.test(text[end] ?? '')) end += 1
  const word = text.slice(start, issue.offset) + suggestion + text.slice(issue.offset + issue.length, end)
  return word.trim() || 'Corriger'
}

function renderMarks(text: string, issues: Issue[], active: number): string {
  const sorted = [...issues].sort((a, b) => a.offset - b.offset)
  let html = ''
  let cursor = 0
  for (const issue of sorted) {
    if (issue.offset < cursor || issue.offset + issue.length > text.length) continue
    html += escapeHtml(text.slice(cursor, issue.offset))
    const cls = issue.offset === active ? 'bad on' : 'bad'
    html += `<span class="${cls}" data-offset="${issue.offset}">${escapeHtml(text.slice(issue.offset, issue.offset + issue.length))}</span>`
    cursor = issue.offset + issue.length
  }
  html += escapeHtml(text.slice(cursor))
  if (text.endsWith('\n')) html += ' '
  return html
}
