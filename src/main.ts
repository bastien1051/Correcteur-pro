import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-600.css'
import '@fontsource/source-sans-3/latin-700.css'
import '@fontsource/source-serif-4/latin-500.css'
import '@fontsource/source-serif-4/latin-600.css'
import { mountApp } from './ui/app'
import { watchUpdates } from './lib/updates'
import './styles.css'

const root = document.querySelector('#app')
if (root instanceof HTMLElement) mountApp(root)
watchUpdates()
