const MARK = 'correcteur-pro-updated'
const INTERVAL_MS = 30 * 60 * 1000

export function consumeUpdateNotice(): boolean {
  try {
    if (sessionStorage.getItem(MARK) !== '1') return false
    sessionStorage.removeItem(MARK)
    return true
  } catch {
    return false
  }
}

function busy(): boolean {
  const element = document.activeElement
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
}

export function watchUpdates(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  let pending = false
  const reload = () => {
    if (reloading || busy()) return
    try {
      const last = Number(sessionStorage.getItem('correcteur-pro-sw-reload') || 0)
      if (Date.now() - last < 120000) return
      sessionStorage.setItem('correcteur-pro-sw-reload', String(Date.now()))
      sessionStorage.setItem(MARK, '1')
    } catch {
      /* navigation privée */
    }
    reloading = true
    window.location.reload()
  }
  const apply = () => {
    if (!hadController) return
    pending = true
    reload()
  }
  navigator.serviceWorker.addEventListener('controllerchange', apply)
  window.setInterval(() => {
    if (pending) reload()
  }, 1500)
  window.addEventListener('load', () => {
    const url = new URL('sw.js', document.baseURI)
    void navigator.serviceWorker.register(url).then((registration) => {
      const check = () => { void registration.update().catch(() => undefined) }
      check()
      window.setInterval(check, INTERVAL_MS)
    }).catch(() => undefined)
  })
}
