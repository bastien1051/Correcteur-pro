import { describe, expect, it } from 'vitest'
import { docxBlob } from './export-docx'
import { pdfBlob } from './export-pdf'
import { letterToPlain, missingFields, templateById, TEMPLATES, type Values } from './letters'

const base: Values = {
  civilite: 'Madame',
  prenom: 'Claire',
  nom: 'Martin',
  adresse: '12 rue des Lilas',
  codePostal: '69007',
  ville: 'Lyon',
  telephone: '06 12 34 56 78',
  email: 'claire.martin@example.fr',
  lieu: 'Lyon',
  date: '2026-11-17',
  appel: 'Madame, Monsieur',
  destinataire: 'Maisons Dupont',
  service: 'Service du recrutement',
  destAdresse: '10 avenue de la République',
  destCp: '75011',
  destVille: 'Paris',
  poste: 'assistante de librairie',
  entreprise: 'Maisons Dupont',
  formation: 'libraire',
  motivation: 'je souhaite conseiller les lecteurs et tenir le rayon jeunesse',
  disponibilite: 'à compter du 1er janvier 2027',
  experience: 'j’ai tenu un stand au salon du livre de Lyon',
  competences: 'le sens de l’accueil et la gestion d’un rayon',
  ancienMetier: 'vendeuse',
  parcours: 'dix ans de vente',
  contrat: 'alternance',
  etablissement: 'lycée des Chartreux',
  periode: 'de septembre 2027 à août 2028',
  rythme: 'trois jours en entreprise',
  organisme: 'Lecture & Cie',
  reference: 'AB-45821',
  dateContrat: '2024-03-01',
  dateEffet: '2026-12-31',
  motif: 'je déménage à l’étranger',
  objetCourt: 'colis arrivé ouvert',
  dateFait: '2026-11-02',
  recit: 'le colis est arrivé ouvert et le livre était abîmé',
  demande: 'me rembourser 24 euros',
  typeConge: 'payé',
  debut: '2026-12-20',
  fin: '2026-12-31',
  jours: '8',
  preavis: 'un mois',
  dernierJour: '2026-12-15',
  numero: 'F-2026-19',
  dateFacture: '2026-09-01',
  montant: '240 euros',
  echeance: '2026-09-30',
  dateAvis: '2026-10-12',
  immatriculation: 'AB-123-CD',
  explication: 'le véhicule avait été vendu le 2 octobre et je n’en étais plus propriétaire',
  objet: 'demande de mise à jour de mon dossier',
  demandeAdmin: '',
  declaration: 'j’habite bien au 12 rue des Lilas à Lyon',
  objetAchat: 'un atlas',
  dateAchat: '2026-10-03',
}

function assertClean(text: string) {
  expect(text).not.toMatch(/undefined|null|\[|\]|\{|\}|TODO|XXX|lorem|à compléter|placeholder/i)
  expect(text).toContain('Claire Martin')
  expect(text).toContain('17 novembre 2026')
  expect(text).toContain('Lyon, le 17 novembre 2026')
}

describe('courriers', () => {
  it('rédige une lettre de motivation au féminin, complète', () => {
    const template = templateById('motivation-premier')
    expect(missingFields(template, base)).toEqual([])
    const text = letterToPlain(template.build(base))
    assertClean(text)
    expect(text).toContain('heureuse')
    expect(text).toContain('assistante de librairie')
    expect(text).toContain('Maisons Dupont')
    expect(text).toContain('Objet\u202f:')
    expect(text).toContain('Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.')
    expect(text).not.toContain('heureux')
  })

  it('accorde au masculin', () => {
    const text = letterToPlain(templateById('motivation-premier').build({ ...base, civilite: 'Monsieur', prenom: 'Paul' }))
    expect(text).toContain('heureux')
    expect(text).not.toContain('heureuse')
    expect(text).toContain('Paul Martin')
  })

  it('rédige une résiliation', () => {
    const text = letterToPlain(templateById('resiliation-abonnement').build(base))
    assertClean(text)
    expect(text.toLowerCase()).toContain('résil')
    expect(text).toContain('AB-45821')
    expect(text).toContain('1 mars 2024')
    expect(text).toContain('31 décembre 2026')
    expect(text).not.toContain('06 12 34 56 78\n\n\n')
  })

  it('omet le téléphone lorsqu’il est vide et tous les modèles restent complets', () => {
    for (const template of TEMPLATES) {
      const values: Values = { ...base, telephone: '', email: '', service: '', experience: '', parcours: '', pieces: '' }
      if (template.id === 'attestation') values.destinataire = ''
      const missing = missingFields(template, values).map((field) => field.id)
      expect(missing, template.id).toEqual([])
      const text = letterToPlain(template.build(values))
      expect(text, template.id).not.toMatch(/undefined|null|\[|\]|\{|\}|TODO|XXX|lorem|à compléter/i)
      expect(text, template.id).toContain('Claire Martin')
    }
  })

  it('exporte un PDF et un document Word', async () => {
    const letter = templateById('motivation-premier').build(base)
    const pdf = new Uint8Array(await pdfBlob(letter).arrayBuffer())
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(1500)
    const docx = new Uint8Array(await (await docxBlob(letter)).arrayBuffer())
    expect(String.fromCharCode(...docx.slice(0, 2))).toBe('PK')
    expect(docx.length).toBeGreaterThan(1500)
    const resignation = templateById('resiliation-abonnement').build(base)
    const pdf2 = new Uint8Array(await pdfBlob(resignation).arrayBuffer())
    expect(String.fromCharCode(...pdf2.slice(0, 5))).toBe('%PDF-')
  })

  it('rédige l’attestation au féminin', () => {
    const text = letterToPlain(templateById('attestation').build(base))
    expect(text).toContain('soussignée')
    expect(text).toContain('atteste sur l’honneur')
    expect(text).toContain('Fait à Lyon')
    expect(text).not.toContain('Madame, Monsieur,')
  })
})
