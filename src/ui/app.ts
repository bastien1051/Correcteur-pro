import type { HistoryRecord } from '../lib/history'
import { consumeUpdateNotice } from '../lib/updates'
import { mountCorrect } from './correct-view'
import { mountHistory } from './history-view'
import { mountLetters } from './letters-view'
import { toast } from './toast'
import { mountTranslate } from './translate-view'

const TABS = [
  { id: 'corriger', label: 'Corriger' },
  { id: 'traduire', label: 'Traduire' },
  { id: 'courriers', label: 'Courriers' },
  { id: 'historique', label: 'Historique' },
] as const

type TabId = (typeof TABS)[number]['id']

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <a class="skip" href="#contenu">Aller au contenu</a>
    <header class="app-header">
      <div class="brand">
        <h1>Correcteur Pro</h1>
        <p class="imprint">Éditions Bastien</p>
      </div>
      <div class="header-actions">
        <button class="btn quiet" id="theme-toggle" type="button">Thème sombre</button>
      </div>
    </header>
    <nav class="tabs" aria-label="Fonctions">
      ${TABS.map((tab) => `<button class="tab" type="button" role="tab" id="tab-${tab.id}" data-tab="${tab.id}" aria-controls="panel-${tab.id}" aria-selected="false">${tab.label}</button>`).join('')}
    </nav>
    <main id="contenu">
      <section class="panel" id="panel-corriger" role="tabpanel" aria-labelledby="tab-corriger"></section>
      <section class="panel" id="panel-traduire" role="tabpanel" aria-labelledby="tab-traduire"></section>
      <section class="panel" id="panel-courriers" role="tabpanel" aria-labelledby="tab-courriers"></section>
      <section class="panel" id="panel-historique" role="tabpanel" aria-labelledby="tab-historique"></section>
    </main>
    <footer class="app-footer">
      <p class="footer-links">
        <a href="./partage.html">Installer l’application</a>
        <a href="https://languagetool.org" rel="noopener">LanguageTool</a>
      </p>
      <p>Correcteur Pro, par les Éditions Bastien. Outil gratuit, sans compte et sans publicité. La correction et la traduction passent par des services publics gratuits ; l’historique reste sur cet appareil.</p>
    </footer>
    <div id="toast" role="status"></div>
  `

  const correct = mountCorrect(root.querySelector('#panel-corriger')!)
  const translate = mountTranslate(root.querySelector('#panel-traduire')!)
  const letters = mountLetters(root.querySelector('#panel-courriers')!)
  const history = mountHistory(root.querySelector('#panel-historique')!, (record) => openRecord(record))
  const themeBtn = root.querySelector<HTMLButtonElement>('#theme-toggle')!

  const syncTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark'
    themeBtn.textContent = dark ? 'Thème clair' : 'Thème sombre'
    themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false')
  }
  syncTheme()
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    document.documentElement.style.colorScheme = next
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#141511' : '#f4f1ea')
    try { localStorage.setItem('correcteur-pro-theme', next) } catch { /* privé */ }
    syncTheme()
  })

  const show = (id: TabId) => {
    for (const tab of TABS) {
      const button = root.querySelector<HTMLButtonElement>(`#tab-${tab.id}`)!
      const panel = root.querySelector<HTMLElement>(`#panel-${tab.id}`)!
      const selected = tab.id === id
      button.setAttribute('aria-selected', selected ? 'true' : 'false')
      panel.classList.toggle('active', selected)
      panel.hidden = !selected
    }
    document.title = `${TABS.find((tab) => tab.id === id)?.label ?? 'Correcteur Pro'} — Correcteur Pro`
    if (id === 'historique') void history.refresh()
    try { sessionStorage.setItem('correcteur-pro-tab', id) } catch { /* privé */ }
  }

  function openRecord(record: HistoryRecord) {
    if (record.kind === 'correction') {
      show('corriger')
      correct.load(record.text)
    } else if (record.kind === 'traduction') {
      show('traduire')
      translate.load(record.extra?.original || record.text, record.extra?.source, record.extra?.target, record.text)
    } else {
      show('courriers')
      letters.open(record.extra?.templateId || 'motivation-premier', record.extra?.fields || {})
    }
  }

  root.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => {
    button.addEventListener('click', () => show(button.dataset.tab as TabId))
  })

  let initial: TabId = 'corriger'
  try {
    const stored = sessionStorage.getItem('correcteur-pro-tab')
    if (stored === 'traduire' || stored === 'courriers' || stored === 'historique') initial = stored
  } catch { /* privé */ }
  show(initial)
  if (consumeUpdateNotice()) toast('Mise à jour appliquée.')
}
