import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.APP_URL || 'http://127.0.0.1:4179/'
const out = '/opt/cursor/artifacts'
await mkdir(out, { recursive: true })
const notes = []
const log = (line) => { notes.push(line); console.log(line) }

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

const context = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
page.setDefaultTimeout(45000)

async function shot(name) {
  await page.evaluate(() => {
    const toast = document.querySelector('#toast')
    if (!toast) return
    toast.classList.remove('show')
    toast.style.display = 'none'
  })
  await page.screenshot({ path: `${out}/${name}.png` })
  log(`capture ${name}`)
}

function tab(name) {
  return page.locator(`[data-tab="${name}"]`)
}

await page.goto(base, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })

const faulty = 'Bonjour, je vous ecrit pour vous dire que les enfant est malade et que nous ne pourrons pas venir demain. C\'est vraiment dommage! Merci de votre comprehension.'
await page.locator('#correct-input').fill(faulty)
await page.locator('#check-btn').click()
await page.waitForFunction(() => {
  const status = document.querySelector('#correct-status')?.textContent || ''
  return status.includes('remarque') || status.includes('Aucune') || status.includes('inaccessible') || status.includes('sollicité')
})
const correctStatus = await page.locator('#correct-status').innerText()
log(`correction statut: ${correctStatus}`)
if (/inaccessible|sollicité/.test(correctStatus)) throw new Error(correctStatus)
const issueCount = await page.locator('.issue').count()
log(`corrections proposées: ${issueCount}`)
if (issueCount < 3) throw new Error('Pas assez de fautes détectées')
await shot('01-corriger-bureau')

await page.setViewportSize({ width: 390, height: 844 })
await shot('02-corriger-mobile')
await page.setViewportSize({ width: 1280, height: 800 })
await page.locator('#theme-toggle').click()
await shot('03-corriger-sombre')
await page.locator('#theme-toggle').click()

await page.locator('#fix-all').click()
await page.waitForFunction((source) => {
  const value = document.querySelector('#correct-input')?.value || ''
  return value && value !== source
}, faulty)
const fixed = await page.locator('#correct-input').inputValue()
log(`texte corrigé: ${fixed}`)
if (!/écris/i.test(fixed)) throw new Error('ecrit non corrigé')
if (/les enfant\b/i.test(fixed)) throw new Error('accord du nom non corrigé')
if (!(/l[’']enfant est malade/i.test(fixed) || /les enfants sont malades/i.test(fixed))) throw new Error(`accord non corrigé: ${fixed}`)
if (!/compréhension/i.test(fixed)) throw new Error('comprehension non corrigée')
if (fixed.includes('dommage!')) throw new Error('espace avant ! manquante')

await tab('traduire').click()
async function translate(text, source, target) {
  if (source) await page.locator('#source-lang').selectOption(source)
  if (target) await page.locator('#target-lang').selectOption(target)
  await page.locator('#translate-input').fill(text)
  const before = await page.locator('#translate-output').innerText().catch(() => '')
  await page.locator('#translate-btn').click()
  await page.waitForFunction((previous) => {
    const status = document.querySelector('#translate-status')?.textContent || ''
    const output = document.querySelector('#translate-output')?.textContent || ''
    const hidden = document.querySelector('#translate-result')?.hidden
    if (/en cours|Téléchargement|hors ligne|Préparation/.test(status)) return false
    return !hidden && output.trim() && output.trim() !== previous.trim()
  }, before)
  const output = (await page.locator('#translate-output').innerText()).trim()
  const status = await page.locator('#translate-status').innerText()
  log(`traduction [${source || 'auto'}→${target || 'fr'}] ${JSON.stringify(text)} => ${JSON.stringify(output)} | ${status}`)
  if (/impossible|inaccessibles/.test(status) || !output) throw new Error(status || 'traduction vide')
  return output
}
const english = await translate('Where is the train station?', 'en', 'fr')
if (!/gare/i.test(english)) throw new Error('anglais incorrect')
await page.locator('#translate-output').scrollIntoViewIfNeeded()
await shot('04-traduire-bureau')
const spanish = await translate('Buenos días, ¿dónde está la estación?', 'es', 'fr')
if (!/bonjour/i.test(spanish) || !/gare|station/i.test(spanish)) throw new Error('espagnol incorrect')
const toEnglish = await translate('Je voudrais un billet pour demain matin.', 'fr', 'en')
if (!/ticket/i.test(toEnglish) || !/tomorrow/i.test(toEnglish)) throw new Error('français vers anglais incorrect')
await page.locator('#target-lang').selectOption('fr')
const word = await translate('bank', 'en', 'fr')
if (!/banque/i.test(word)) throw new Error('mot isolé incorrect')
const alts = await page.locator('#translate-alts button').count()
log(`autres sens: ${alts}`)
if (alts < 1) throw new Error('pas d’autres sens')

await page.setViewportSize({ width: 390, height: 844 })
await page.locator('#translate-output').scrollIntoViewIfNeeded()
await shot('05-traduire-mobile')
await page.setViewportSize({ width: 1280, height: 800 })

await tab('courriers').click()
async function fill(name, value) {
  const field = page.locator(`[name="${name}"]`)
  const tag = await field.evaluate((node) => node.tagName)
  if (tag === 'SELECT') await field.selectOption(value)
  else await field.fill(value)
}
async function letter(template, fields) {
  await page.locator('#letter-template').selectOption(template)
  for (const [name, value] of Object.entries(fields)) await fill(name, value)
  await page.locator('#prepare-letter').click()
  await page.waitForFunction(() => /relu|indisponible|reste à indiquer/i.test(document.querySelector('#letter-status')?.textContent || document.querySelector('#letter-error')?.textContent || ''))
  const status = `${await page.locator('#letter-status').innerText()} ${await page.locator('#letter-error').innerText()}`.trim()
  log(`courrier ${template}: ${status}`)
  if (/reste à indiquer/i.test(status)) throw new Error(status)
  const plain = await page.locator('.sheet').innerText()
  if (/\[|à compléter|undefined|TODO/i.test(plain)) throw new Error('placeholder dans la lettre')
  return plain
}
const common = {
  civilite: 'Madame',
  prenom: 'Hélène',
  nom: 'Bernard',
  adresse: '12 rue des Lilas',
  codePostal: '69007',
  ville: 'Lyon',
  date: '2026-11-17',
  appel: 'Madame, Monsieur',
  destinataire: 'Librairie du Parc',
  destAdresse: '10 avenue de la République',
  destCp: '75011',
  destVille: 'Paris',
}
const motivation = await letter('motivation-premier', {
  ...common,
  poste: 'libraire',
  entreprise: 'Librairie du Parc',
  formation: 'métiers du livre',
  motivation: 'je souhaite conseiller les lecteurs et m occuper du rayon jeunesse',
  disponibilite: 'à compter du 1er janvier 2027',
})
if (!/Hélène Bernard/.test(motivation) || !/heureuse/.test(motivation) || !/libraire/.test(motivation)) {
  throw new Error('lettre de motivation incomplète')
}
await page.locator('.sheet').scrollIntoViewIfNeeded()
await shot('06-courriers-bureau')
const [pdf] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#download-pdf').click(),
])
const pdfPath = `${out}/lettre-motivation.pdf`
await pdf.saveAs(pdfPath)
const [docx] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#download-docx').click(),
])
const docxPath = `${out}/lettre-motivation.docx`
await docx.saveAs(docxPath)
log(`exports motivation ${pdf.suggestedFilename()} ${docx.suggestedFilename()}`)

const resignation = await letter('resiliation-abonnement', {
  ...common,
  destinataire: 'Lecture et Cie',
  organisme: 'Lecture et Cie',
  reference: 'AB-45821',
  dateContrat: '2024-03-01',
  dateEffet: '2026-12-31',
  motif: 'je déménage à l’étranger',
})
if (!/AB-45821/.test(resignation) || !/résil/i.test(resignation)) throw new Error('résiliation incomplète')
await page.setViewportSize({ width: 390, height: 844 })
await page.locator('.sheet').scrollIntoViewIfNeeded()
await shot('07-courriers-mobile')
const [pdf2] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#download-pdf').click(),
])
await pdf2.saveAs(`${out}/lettre-resiliation.pdf`)
const [docx2] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#download-docx').click(),
])
await docx2.saveAs(`${out}/lettre-resiliation.docx`)
log('exports résiliation enregistrés')

await page.setViewportSize({ width: 1280, height: 800 })
await tab('historique').click()
await page.waitForSelector('.history-item')
const historyCount = await page.locator('.history-item').count()
log(`historique: ${historyCount}`)
if (historyCount < 2) throw new Error('historique vide')
await shot('08-historique-bureau')
await page.setViewportSize({ width: 390, height: 844 })
await shot('09-historique-mobile')

await page.goto(new URL('partage.html', base).toString())
await shot('10-partage')

await writeFile(`${out}/e2e-notes.txt`, `${notes.join('\n')}\n`)
await browser.close()
log('parcours terminé')
