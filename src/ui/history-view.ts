import { clearHistory, formatHistoryDate, listHistory, removeHistory, type HistoryRecord } from '../lib/history'

const KINDS: Record<HistoryRecord['kind'], string> = {
  correction: 'Correction',
  traduction: 'Traduction',
  courrier: 'Courrier',
}

export type HistoryView = { refresh: () => Promise<void> }

export function mountHistory(host: HTMLElement, onOpen: (record: HistoryRecord) => void): HistoryView {
  host.innerHTML = `
    <p class="lede">Les derniers textes restent sur cet appareil seulement. Rien n’est envoyé vers un compte.</p>
    <div class="toolbar">
      <button class="btn quiet danger" id="clear-history" type="button">Tout effacer</button>
    </div>
    <div class="history-list" id="history-list"></div>
  `
  const list = host.querySelector<HTMLElement>('#history-list')!
  const clearBtn = host.querySelector<HTMLButtonElement>('#clear-history')!
  let armed = false
  let timer = 0

  clearBtn.addEventListener('click', async () => {
    if (!armed) {
      armed = true
      clearBtn.textContent = 'Confirmer l’effacement'
      timer = window.setTimeout(() => {
        armed = false
        clearBtn.textContent = 'Tout effacer'
      }, 4000)
      return
    }
    window.clearTimeout(timer)
    armed = false
    clearBtn.textContent = 'Tout effacer'
    await clearHistory()
    await refresh()
  })

  async function refresh() {
    const items = await listHistory()
    list.replaceChildren()
    if (!items.length) {
      const empty = document.createElement('div')
      empty.className = 'notice'
      empty.textContent = 'Aucun texte enregistré pour le moment. Les corrections, traductions et courriers resteront ici, sur cet appareil.'
      list.append(empty)
      return
    }
    for (const item of items) {
      const card = document.createElement('article')
      card.className = 'history-item'
      const body = document.createElement('div')
      const kind = document.createElement('p')
      kind.className = 'kind'
      kind.textContent = KINDS[item.kind]
      const title = document.createElement('h3')
      title.textContent = item.title
      const excerpt = document.createElement('p')
      excerpt.textContent = item.excerpt
      const when = document.createElement('p')
      when.className = 'meta'
      when.textContent = formatHistoryDate(item.createdAt)
      body.append(kind, title, excerpt, when)
      const actions = document.createElement('div')
      actions.className = 'toolbar'
      const open = document.createElement('button')
      open.type = 'button'
      open.className = 'btn'
      open.textContent = 'Ouvrir'
      open.addEventListener('click', () => onOpen(item))
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'btn quiet'
      remove.textContent = 'Supprimer'
      let confirmDelete = false
      remove.addEventListener('click', async () => {
        if (!confirmDelete) {
          confirmDelete = true
          remove.textContent = 'Confirmer'
          window.setTimeout(() => {
            confirmDelete = false
            remove.textContent = 'Supprimer'
          }, 4000)
          return
        }
        await removeHistory(item.id)
        await refresh()
      })
      actions.append(open, remove)
      card.append(body, actions)
      list.append(card)
    }
  }

  return { refresh }
}
