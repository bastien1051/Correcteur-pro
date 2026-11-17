export type FieldKind = 'text' | 'textarea' | 'date' | 'select' | 'email' | 'tel'

export type Field = {
  id: string
  label: string
  kind: FieldKind
  required?: boolean
  options?: { value: string; label: string }[]
  autocomplete?: string
  rows?: number
  hint?: string
  placeholder?: string
}

export type Letter = {
  sender: string[]
  recipient: string[]
  placeDate: string
  subject: string
  pieces: string
  salutation: string
  paragraphs: string[]
  closing: string
  signature: string
}

export type Values = Record<string, string>

export type Template = {
  id: string
  group: string
  title: string
  description: string
  fields: Field[]
  build: (values: Values) => Letter
}

const CIVILITE: Field = {
  id: 'civilite',
  label: 'Civilité',
  kind: 'select',
  required: true,
  options: [
    { value: 'Madame', label: 'Madame' },
    { value: 'Monsieur', label: 'Monsieur' },
  ],
}

const APPEL: Field = {
  id: 'appel',
  label: 'Formule d’appel',
  kind: 'select',
  required: true,
  options: [
    { value: 'Madame, Monsieur', label: 'Madame, Monsieur' },
    { value: 'Madame', label: 'Madame' },
    { value: 'Monsieur', label: 'Monsieur' },
  ],
}

function text(id: string, label: string, extra: Partial<Field> = {}): Field {
  return { id, label, kind: 'text', required: true, ...extra }
}

function area(id: string, label: string, extra: Partial<Field> = {}): Field {
  return { id, label, kind: 'textarea', required: true, rows: 4, ...extra }
}

function date(id: string, label: string, extra: Partial<Field> = {}): Field {
  return { id, label, kind: 'date', required: true, ...extra }
}

function choice(id: string, label: string, options: { value: string; label: string }[], extra: Partial<Field> = {}): Field {
  return { id, label, kind: 'select', required: true, options, ...extra }
}

const IDENTITY: Field[] = [
  CIVILITE,
  text('prenom', 'Prénom', { autocomplete: 'given-name' }),
  text('nom', 'Nom', { autocomplete: 'family-name' }),
  text('adresse', 'Adresse', { autocomplete: 'street-address' }),
  text('codePostal', 'Code postal', { autocomplete: 'postal-code' }),
  text('ville', 'Ville', { autocomplete: 'address-level2' }),
  text('telephone', 'Téléphone', { kind: 'tel', required: false, autocomplete: 'tel' }),
  text('email', 'Adresse électronique', { kind: 'email', required: false, autocomplete: 'email' }),
  text('lieu', 'Lieu d’expédition', { required: false, hint: 'Si vous ne le remplissez pas, la ville ci-dessus est utilisée.' }),
  date('date', 'Date de la lettre'),
]

const RECIPIENT: Field[] = [
  text('destinataire', 'Destinataire', { hint: 'Nom de la personne ou de l’organisme.' }),
  text('service', 'Service', { required: false, placeholder: 'Service du recrutement' }),
  text('destAdresse', 'Adresse du destinataire', { autocomplete: 'street-address' }),
  text('destCp', 'Code postal du destinataire', { autocomplete: 'postal-code' }),
  text('destVille', 'Ville du destinataire', { autocomplete: 'address-level2' }),
  APPEL,
]

function val(values: Values, id: string): string {
  return (values[id] ?? '').replace(/\s+/g, ' ').trim()
}

function femme(values: Values): boolean {
  return val(values, 'civilite') === 'Madame'
}

function acc(values: Values, masculine: string, feminine: string): string {
  return femme(values) ? feminine : masculine
}

export function formatFrenchDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return iso.trim()
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function when(values: Values, id: string): string {
  return formatFrenchDate(val(values, id))
}

function asParagraph(textValue: string): string {
  const clean = textValue.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const headed = /^\p{Ll}/u.test(clean) ? clean.charAt(0).toLocaleUpperCase('fr-FR') + clean.slice(1) : clean
  return /[.!?…]$/.test(headed) ? headed : `${headed}.`
}

function lowerFirst(textValue: string): string {
  if (!textValue) return ''
  return textValue.charAt(0).toLocaleLowerCase('fr-FR') + textValue.slice(1)
}

function senderLines(values: Values): string[] {
  const name = [val(values, 'prenom'), val(values, 'nom')].filter(Boolean).join(' ')
  const city = [val(values, 'codePostal'), val(values, 'ville')].filter(Boolean).join(' ')
  return [name, val(values, 'adresse'), city, val(values, 'telephone'), val(values, 'email')].filter(Boolean)
}

function recipientLines(values: Values): string[] {
  const city = [val(values, 'destCp'), val(values, 'destVille')].filter(Boolean).join(' ')
  return [val(values, 'destinataire'), val(values, 'service'), val(values, 'destAdresse'), city].filter(Boolean)
}

function placeDate(values: Values): string {
  const place = val(values, 'lieu') || val(values, 'ville')
  const dated = when(values, 'date')
  return place ? `${place}, le ${dated}` : `Le ${dated}`
}

function closing(values: Values): string {
  const who = val(values, 'appel') || 'Madame, Monsieur'
  return `Je vous prie d’agréer, ${who}, l’expression de mes salutations distinguées.`
}

function signature(values: Values): string {
  return [val(values, 'prenom'), val(values, 'nom')].filter(Boolean).join(' ')
}

function letter(values: Values, subject: string, paragraphs: string[], extra: Partial<Letter> = {}): Letter {
  return {
    sender: senderLines(values),
    recipient: recipientLines(values),
    placeDate: placeDate(values),
    subject,
    pieces: val(values, 'pieces'),
    salutation: val(values, 'appel') || 'Madame, Monsieur',
    paragraphs: paragraphs.filter((paragraph) => paragraph.trim()),
    closing: closing(values),
    signature: signature(values),
    ...extra,
  }
}

function piecesField(): Field {
  return text('pieces', 'Pièces jointes', { required: false, hint: 'Indiquez les documents joints, sans les envoyer ici.' })
}

export function letterToPlain(source: Letter): string {
  const blocks = [
    source.sender.join('\n'),
    source.recipient.join('\n'),
    source.placeDate,
    source.subject ? `Objet\u202f: ${source.subject}` : '',
    source.pieces ? `Pièces jointes\u202f: ${source.pieces}` : '',
    source.salutation ? `${source.salutation.replace(/,\s*$/, '')},` : '',
    ...source.paragraphs,
    source.closing,
    source.signature,
  ].filter((block) => block.trim())
  return blocks.join('\n\n')
}

export function missingFields(template: Template, values: Values): Field[] {
  return template.fields.filter((field) => field.required && !val(values, field.id))
}

const PROTECTED_IDS = [
  'prenom', 'nom', 'adresse', 'codePostal', 'ville', 'telephone', 'email', 'lieu',
  'destinataire', 'service', 'destAdresse', 'destCp', 'destVille', 'entreprise',
  'poste', 'formation', 'etablissement', 'ancienMetier', 'organisme', 'reference',
  'immatriculation', 'numero', 'montant', 'iban', 'adresseInstallation',
]

export function protectedValues(values: Values): string[] {
  const full = [val(values, 'prenom'), val(values, 'nom')].filter(Boolean).join(' ')
  return [...PROTECTED_IDS.map((id) => val(values, id)), full].filter((item) => item.length >= 3)
}

const motivationPremier: Template = {
  id: 'motivation-premier',
  group: 'Candidature',
  title: 'Lettre de motivation — premier emploi',
  description: 'Pour une première embauche, après une formation ou un stage.',
  fields: [
    ...IDENTITY,
    ...RECIPIENT,
    text('poste', 'Poste visé'),
    text('entreprise', 'Entreprise'),
    text('formation', 'Formation suivie', { hint: 'Intitulé du diplôme ou de la formation.' }),
    area('experience', 'Stage, projet ou expérience', { required: false, hint: 'Quelques faits concrets. Laissez vide s’il n’y en a pas.' }),
    area('motivation', 'Ce que vous voulez faire dans ce poste'),
    text('disponibilite', 'Disponibilité', { hint: 'Par exemple : immédiatement, ou à compter du 1er mars 2027.' }),
    piecesField(),
  ],
  build: (values) => letter(values, `Candidature au poste de ${val(values, 'poste')}`, [
    `Actuellement en fin de formation de ${val(values, 'formation')}, je vous présente ma candidature au poste de ${val(values, 'poste')} au sein de ${val(values, 'entreprise')}. Ce serait mon premier emploi, et je souhaite le commencer dans une maison dont le sérieux correspond à ce que j’ai appris.`,
    val(values, 'experience') ? asParagraph(val(values, 'experience')) : '',
    asParagraph(val(values, 'motivation')),
    `Je suis disponible ${val(values, 'disponibilite').replace(/\.$/, '')}, et je serais ${acc(values, 'heureux', 'heureuse')} de vous rencontrer afin de vous présenter mon parcours de vive voix.`,
  ]),
}

const motivationReconversion: Template = {
  id: 'motivation-reconversion',
  group: 'Candidature',
  title: 'Lettre de motivation — reconversion',
  description: 'Pour expliquer un changement de métier sans vous justifier plus qu’il ne faut.',
  fields: [
    ...IDENTITY,
    ...RECIPIENT,
    text('poste', 'Poste visé'),
    text('entreprise', 'Entreprise'),
    text('formation', 'Nouvelle formation'),
    text('ancienMetier', 'Métier exercé auparavant'),
    area('competences', 'Compétences que vous réutilisez', { hint: 'Par exemple : le sens du contact et la tenue d’un planning.' }),
    area('motivation', 'Pourquoi cette entreprise et ce métier'),
    piecesField(),
  ],
  build: (values) => letter(values, `Candidature au poste de ${val(values, 'poste')} — reconversion`, [
    `Après plusieurs années comme ${val(values, 'ancienMetier')}, j’ai choisi une reconversion. J’ai suivi une formation de ${val(values, 'formation')} afin d’exercer le métier de ${val(values, 'poste')}.`,
    `Cette décision est réfléchie. De mon métier précédent, je retiens notamment ${lowerFirst(val(values, 'competences').replace(/\.$/, ''))}. Ces acquis, et la rigueur déjà pratiquée, me seront utiles dans ce nouveau cadre.`,
    asParagraph(val(values, 'motivation')),
    `Je souhaite mettre cette expérience au service de ${val(values, 'entreprise')}. Je reste à votre disposition pour un entretien, au moment qui vous conviendra.`,
  ]),
}

const motivationSpontanee: Template = {
  id: 'motivation-spontanee',
  group: 'Candidature',
  title: 'Lettre de motivation — candidature spontanée',
  description: 'Quand aucune offre n’est publiée et que vous écrivez directement à l’entreprise.',
  fields: [
    ...IDENTITY,
    ...RECIPIENT,
    text('poste', 'Fonction que vous pouvez tenir'),
    text('entreprise', 'Entreprise'),
    area('parcours', 'Parcours en quelques lignes', { required: false }),
    area('motivation', 'Ce que vous proposez à cette entreprise'),
    piecesField(),
  ],
  build: (values) => letter(values, `Candidature spontanée — ${val(values, 'poste')}`, [
    `Je me permets de vous adresser une candidature spontanée afin de rejoindre ${val(values, 'entreprise')}, pour y tenir la fonction de ${val(values, 'poste')}.`,
    val(values, 'parcours') ? asParagraph(val(values, 'parcours')) : '',
    asParagraph(val(values, 'motivation')),
    `Je serais ${acc(values, 'heureux', 'heureuse')} d’en parler avec vous, même brièvement, afin de voir si mon profil peut être utile à votre équipe.`,
  ]),
}

const motivationAlternance: Template = {
  id: 'motivation-alternance',
  group: 'Candidature',
  title: 'Lettre de motivation — alternance ou stage',
  description: 'Pour une convention de stage ou un contrat d’alternance.',
  fields: [
    ...IDENTITY,
    ...RECIPIENT,
    choice('contrat', 'Contrat recherché', [
      { value: 'alternance', label: 'Alternance' },
      { value: 'stage', label: 'Stage' },
    ]),
    text('poste', 'Mission ou poste'),
    text('entreprise', 'Entreprise'),
    text('formation', 'Formation en cours'),
    text('etablissement', 'Établissement'),
    text('periode', 'Période', { hint: 'Par exemple : du 1er septembre 2027 au 31 août 2028.' }),
    text('rythme', 'Rythme', { hint: 'Par exemple : trois jours en entreprise, deux jours en cours.' }),
    area('motivation', 'Ce que vous venez apprendre et apporter'),
    piecesField(),
  ],
  build: (values) => {
    const contrat = val(values, 'contrat') === 'stage' ? 'un stage' : 'une alternance'
    return letter(values, `Recherche ${contrat} — ${val(values, 'poste')}`, [
      `${acc(values, 'Étudiant', 'Étudiante')} en ${val(values, 'formation')} à ${val(values, 'etablissement')}, je recherche ${contrat} au sein de ${val(values, 'entreprise')}, pour la mission de ${val(values, 'poste')}.`,
      `La période envisagée est la suivante : ${val(values, 'periode').replace(/\.$/, '')}. Le rythme prévu est le suivant : ${val(values, 'rythme').replace(/\.$/, '')}.`,
      asParagraph(val(values, 'motivation')),
      'Cette expérience doit me permettre de mettre en pratique ce que j’apprends et d’être utile à votre équipe dès les premières semaines. L’établissement pourra vous adresser la convention correspondante.',
      'Je me tiens à votre disposition pour un entretien.',
    ])
  },
}

function resiliationFields(extra: Field[]): Field[] {
  return [
    ...IDENTITY,
    ...RECIPIENT,
    text('organisme', 'Organisme'),
    text('reference', 'Numéro de contrat ou d’abonné'),
    date('dateContrat', 'Date de souscription'),
    date('dateEffet', 'Date souhaitée de fin'),
    area('motif', 'Précision éventuelle', { required: false, hint: 'Un fait utile, sans développement inutile.' }),
    ...extra,
    piecesField(),
  ]
}

const resiliationAbonnement: Template = {
  id: 'resiliation-abonnement',
  group: 'Résiliation',
  title: 'Résiliation d’abonnement',
  description: 'Abonnement, prélèvement ou contrat renouvelable.',
  fields: resiliationFields([]),
  build: (values) => letter(values, `Résiliation de l’abonnement n°\u00a0${val(values, 'reference')}`, [
    `Je vous informe de ma décision de résilier l’abonnement n°\u00a0${val(values, 'reference')}, souscrit le ${when(values, 'dateContrat')} auprès de ${val(values, 'organisme')}.`,
    `Je vous prie de mettre fin à ce contrat à compter du ${when(values, 'dateEffet')}, dans le respect du préavis prévu, et de cesser tout prélèvement au-delà de cette date. Merci de me confirmer par écrit la date de fin et, s’il y a lieu, de me rembourser les sommes trop-perçues.`,
    val(values, 'motif') ? asParagraph(val(values, 'motif')) : '',
    'Je vous remercie de m’adresser la confirmation de résiliation.',
  ]),
}

const resiliationBox: Template = {
  id: 'resiliation-box',
  group: 'Résiliation',
  title: 'Résiliation de box internet',
  description: 'Internet, téléphone et matériel à retourner.',
  fields: resiliationFields([
    text('adresseInstallation', 'Adresse du logement concerné', { required: false, hint: 'Si elle est différente de votre adresse.' }),
  ]),
  build: (values) => letter(values, `Résiliation de l’abonnement internet n°\u00a0${val(values, 'reference')}`, [
    `Je vous informe de la résiliation de mon abonnement internet n°\u00a0${val(values, 'reference')}, souscrit le ${when(values, 'dateContrat')} auprès de ${val(values, 'organisme')}, pour le logement situé au ${val(values, 'adresseInstallation') || val(values, 'adresse')}.`,
    `Je vous prie d’y mettre fin au ${when(values, 'dateEffet')}, de cesser les prélèvements après cette date et de m’indiquer comment vous retourner le matériel. Merci de me confirmer la résiliation par écrit et de m’adresser la facture de clôture.`,
    val(values, 'motif') ? asParagraph(val(values, 'motif')) : '',
  ]),
}

const resiliationAssurance: Template = {
  id: 'resiliation-assurance',
  group: 'Résiliation',
  title: 'Résiliation d’assurance',
  description: 'Pour un contrat d’assurance, à l’échéance ou selon le préavis prévu.',
  fields: resiliationFields([]),
  build: (values) => letter(values, `Résiliation du contrat d’assurance n°\u00a0${val(values, 'reference')}`, [
    `Je vous notifie la résiliation du contrat d’assurance n°\u00a0${val(values, 'reference')}, souscrit le ${when(values, 'dateContrat')} auprès de ${val(values, 'organisme')}, à effet du ${when(values, 'dateEffet')}, conformément au préavis et aux conditions de ce contrat.`,
    val(values, 'motif') ? asParagraph(val(values, 'motif')) : '',
    'Je vous prie de me confirmer la date de fin des garanties et de m’adresser le relevé de situation.',
  ]),
}

const resiliationSport: Template = {
  id: 'resiliation-sport',
  group: 'Résiliation',
  title: 'Résiliation de salle de sport',
  description: 'Pour arrêter un abonnement et les prélèvements.',
  fields: resiliationFields([]),
  build: (values) => letter(values, `Résiliation de l’abonnement n°\u00a0${val(values, 'reference')}`, [
    `Je vous informe de la résiliation de mon abonnement n°\u00a0${val(values, 'reference')} auprès de ${val(values, 'organisme')}, à compter du ${when(values, 'dateEffet')}. Le contrat avait été souscrit le ${when(values, 'dateContrat')}.`,
    'Je vous prie de mettre fin aux prélèvements automatiques à cette date et de me confirmer par écrit que le contrat est clos.',
    val(values, 'motif') ? asParagraph(val(values, 'motif')) : '',
  ]),
}

const reclamation: Template = {
  id: 'reclamation',
  group: 'Démarches',
  title: 'Réclamation',
  description: 'Pour exposer un fait et demander une suite précise.',
  fields: [
    ...IDENTITY,
    ...RECIPIENT,
    text('objetCourt', 'Objet de la réclamation'),
    date('dateFait', 'Date des faits'),
    area('recit', 'Ce qui s’est passé'),
    area('demande', 'Ce que vous demandez', { hint: 'Par exemple : remplacer l’article ou me rembourser 49 euros.' }),
    piecesField(),
  ],
  build: (values) => letter(values, val(values, 'objetCourt'), [
    `Je vous écris au sujet suivant : ${val(values, 'objetCourt').replace(/\.$/, '')}.`,
    `Les faits sont les suivants. Le ${when(values, 'dateFait')} : ${lowerFirst(asParagraph(val(values, 'recit')))}`,
    `Je vous demande de ${val(values, 'demande').replace(/\.$/, '')} dans un délai de quinze jours à compter de la réception de cette lettre.`,
    `Je reste ${acc(values, 'attaché', 'attachée')} à un règlement amiable et je vous remercie de me répondre par écrit. Sans réponse dans ce délai, je me réserverai la possibilité d’engager les autres démarches utiles.`,
  ]),
}

const conge: Template = {
  id: 'conge',
  group: 'Travail',
  title: 'Demande de congé',
  description: 'Congés payés, congé sans solde ou événement familial.',
  fields: [
    ...IDENTITY,
    ...RECIPIENT,
    text('poste', 'Votre poste'),
    text('entreprise', 'Employeur'),
    choice('typeConge', 'Type de congé', [
      { value: 'payé', label: 'Congés payés' },
      { value: 'sans solde', label: 'Congé sans solde' },
      { value: 'pour événement familial', label: 'Événement familial' },
    ]),
    date('debut', 'Premier jour'),
    date('fin', 'Dernier jour'),
    text('jours', 'Nombre de jours', { required: false }),
    area('motif', 'Motif', { required: false, hint: 'Utile surtout pour un congé sans solde ou un événement familial.' }),
  ],
  build: (values) => {
    const days = val(values, 'jours')
    const count = days ? `, soit ${days} ${days === '1' ? 'jour' : 'jours'}` : ''
    return letter(values, `Demande de congé ${val(values, 'typeConge')}`, [
      `Je sollicite un congé ${val(values, 'typeConge')} du ${when(values, 'debut')} au ${when(values, 'fin')} inclus${count}. J’occupe le poste de ${val(values, 'poste')} au sein de ${val(values, 'entreprise')}.`,
      val(values, 'motif') ? asParagraph(val(values, 'motif')) : '',
      'Je vous remercie de me confirmer votre accord. J’organiserai la passation utile avant mon départ.',
    ])
  },
}

const demission: Template = {
  id: 'demission',
  group: 'Travail',
  title: 'Démission',
  description: 'Une lettre brève, nette, et qui prévoit le préavis.',
  fields: [
    ...IDENTITY,
    ...RECIPIENT,
    text('poste', 'Poste occupé'),
    text('entreprise', 'Employeur'),
    text('preavis', 'Durée du préavis', { hint: 'Par exemple : un mois, ou la durée prévue par mon contrat.' }),
    date('dernierJour', 'Dernier jour de travail'),
  ],
  build: (values) => letter(values, `Démission du poste de ${val(values, 'poste')}`, [
    `Je vous informe de ma décision de démissionner de mon poste de ${val(values, 'poste')} au sein de ${val(values, 'entreprise')}.`,
    `Conformément à mon contrat, j’effectuerai un préavis de ${val(values, 'preavis').replace(/\.$/, '')}. Mon dernier jour de travail sera le ${when(values, 'dernierJour')}.`,
    'Je vous remercie pour le travail accompli ensemble. Je reste disponible pour organiser la passation dans de bonnes conditions, et je vous prie de m’adresser les documents de fin de contrat ainsi que le solde de tout compte.',
  ]),
}

const relance: Template = {
  id: 'relance-facture',
  group: 'Démarches',
  title: 'Relance de facture impayée',
  description: 'Pour rappeler une facture échue, sans agressivité inutile.',
  fields: [
    ...IDENTITY,
    ...RECIPIENT,
    text('numero', 'Numéro de facture'),
    date('dateFacture', 'Date de la facture'),
    text('montant', 'Montant', { hint: 'Par exemple : 240 euros.' }),
    date('echeance', 'Date d’échéance'),
    area('precisions', 'Précision', { required: false }),
  ],
  build: (values) => letter(values, `Facture n°\u00a0${val(values, 'numero')} demeurée impayée`, [
    `Sauf erreur ou omission de ma part, la facture n°\u00a0${val(values, 'numero')} du ${when(values, 'dateFacture')}, d’un montant de ${val(values, 'montant')}, arrivée à échéance le ${when(values, 'echeance')}, n’a pas été réglée.`,
    'Je vous remercie de bien vouloir procéder à son paiement dans un délai de huit jours. Si votre règlement et cette lettre se sont croisés, vous pouvez ne pas en tenir compte.',
    val(values, 'precisions') ? asParagraph(val(values, 'precisions')) : '',
  ]),
}

const amende: Template = {
  id: 'amende',
  group: 'Démarches',
  title: 'Contestation d’amende',
  description: 'Requête en exonération auprès de l’officier du ministère public.',
  fields: [
    ...IDENTITY,
    text('destinataire', 'Destinataire', { hint: 'En général : Officier du ministère public.' }),
    text('service', 'Service', { required: false }),
    text('destAdresse', 'Adresse indiquée sur l’avis'),
    text('destCp', 'Code postal'),
    text('destVille', 'Ville'),
    {
      ...APPEL,
      options: [
        { value: 'Monsieur l’Officier du ministère public', label: 'Monsieur l’Officier du ministère public' },
        { value: 'Madame, Monsieur', label: 'Madame, Monsieur' },
      ],
    },
    text('numero', 'Numéro de l’avis'),
    date('dateAvis', 'Date de l’avis'),
    text('immatriculation', 'Immatriculation'),
    choice('motif', 'Motif', [
      { value: 'le véhicule avait été cédé avant les faits', label: 'Le véhicule avait été cédé' },
      { value: 'le véhicule avait fait l’objet d’un vol', label: 'Le véhicule avait été volé' },
      { value: 'je n’étais pas l’auteur de l’infraction', label: 'Je n’étais pas l’auteur de l’infraction' },
      { value: 'l’infraction n’est pas constituée', label: 'L’infraction n’est pas constituée' },
      { value: 'autre', label: 'Un autre motif, que j’explique' },
    ]),
    area('explication', 'Explication des faits'),
    piecesField(),
  ],
  build: (values) => {
    const motif = val(values, 'motif')
    const ground = motif && motif !== 'autre'
      ? `Je forme une requête en exonération. Le motif est le suivant : ${motif}.`
      : 'Je forme une requête en exonération.'
    return letter(values, `Contestation de l’avis de contravention n°\u00a0${val(values, 'numero')}`, [
      `Je conteste l’avis de contravention n°\u00a0${val(values, 'numero')}, du ${when(values, 'dateAvis')}, concernant le véhicule immatriculé ${val(values, 'immatriculation')}.`,
      ground,
      asParagraph(val(values, 'explication')),
      `Je vous prie d’examiner cette contestation, d’annuler l’avis s’il y a lieu et de m’informer de votre décision par écrit.${val(values, 'pieces') ? '' : ' Je joins la copie de l’avis.'}`,
    ])
  },
}

const administration: Template = {
  id: 'administration',
  group: 'Démarches',
  title: 'Courrier à l’administration',
  description: 'CAF, impôts ou mairie.',
  fields: [
    ...IDENTITY,
    choice('organisme', 'Administration', [
      { value: 'Caisse d’allocations familiales', label: 'CAF' },
      { value: 'Direction générale des Finances publiques', label: 'Impôts' },
      { value: 'Mairie', label: 'Mairie' },
    ]),
    text('destinataire', 'Service destinataire'),
    text('service', 'Complément d’adresse', { required: false }),
    text('destAdresse', 'Adresse'),
    text('destCp', 'Code postal'),
    text('destVille', 'Ville'),
    {
      ...APPEL,
      options: [
        { value: 'Madame, Monsieur', label: 'Madame, Monsieur' },
        { value: 'Madame', label: 'Madame' },
        { value: 'Monsieur', label: 'Monsieur' },
        { value: 'Madame le Maire', label: 'Madame le Maire' },
        { value: 'Monsieur le Maire', label: 'Monsieur le Maire' },
      ],
    },
    text('reference', 'Numéro d’allocataire, fiscal ou de dossier', { required: false }),
    text('objet', 'Objet de la demande'),
    area('demande', 'Votre demande'),
    piecesField(),
  ],
  build: (values) => {
    const organism = val(values, 'organisme')
    const refName = organism.startsWith('Caisse') ? 'allocataire' : organism.startsWith('Direction') ? 'fiscal' : 'de dossier'
    return letter(values, val(values, 'objet'), [
      `Je me permets de saisir ${organism} au sujet suivant : ${val(values, 'objet').replace(/\.$/, '')}.`,
      val(values, 'reference') ? `Mon numéro ${refName} est le ${val(values, 'reference')}.` : '',
      asParagraph(val(values, 'demande')),
      'Je vous remercie d’examiner cette demande et de me répondre par écrit. Je reste disponible pour tout complément que vous jugerez utile.',
    ])
  },
}

const remboursement: Template = {
  id: 'remboursement',
  group: 'Démarches',
  title: 'Demande de remboursement',
  description: 'Pour un achat, une somme trop versée ou une prestation non rendue.',
  fields: [
    ...IDENTITY,
    ...RECIPIENT,
    text('objetAchat', 'Achat ou prestation'),
    date('dateAchat', 'Date'),
    text('reference', 'Référence', { required: false, hint: 'Numéro de commande, de facture ou de dossier.' }),
    text('montant', 'Montant demandé'),
    area('motif', 'Motif du remboursement'),
    text('iban', 'IBAN', { required: false, hint: 'À remplir seulement si vous souhaitez le faire figurer dans la lettre.' }),
    piecesField(),
  ],
  build: (values) => letter(values, `Demande de remboursement de ${val(values, 'montant')}`, [
    `Je vous demande le remboursement de ${val(values, 'montant')}, correspondant à ${val(values, 'objetAchat')}, en date du ${when(values, 'dateAchat')}${val(values, 'reference') ? `, sous la référence ${val(values, 'reference')}` : ''}.`,
    `Le motif est le suivant : ${lowerFirst(asParagraph(val(values, 'motif')))}`,
    val(values, 'iban')
      ? `Le remboursement peut être effectué sur le compte dont l’IBAN est le ${val(values, 'iban')}.`
      : 'Je vous prie de m’indiquer les modalités du remboursement.',
    'Je vous remercie de traiter cette demande dès que possible et de m’en confirmer l’exécution par écrit.',
  ]),
}

const attestation: Template = {
  id: 'attestation',
  group: 'Démarches',
  title: 'Attestation sur l’honneur',
  description: 'Une déclaration que vous signez et dont vous répondez.',
  fields: [
    ...IDENTITY,
    text('destinataire', 'Destinataire', { required: false }),
    text('service', 'Service', { required: false }),
    text('destAdresse', 'Adresse du destinataire', { required: false }),
    text('destCp', 'Code postal du destinataire', { required: false }),
    text('destVille', 'Ville du destinataire', { required: false }),
    area('declaration', 'Ce que vous attestez', { rows: 6, hint: 'Écrivez uniquement ce qui est exact. La lettre rappelle qu’une fausse déclaration est sanctionnée.' }),
  ],
  build: (values) => {
    const declared = asParagraph(val(values, 'declaration'))
    const city = [val(values, 'codePostal'), val(values, 'ville')].filter(Boolean).join(' ')
    return letter(values, 'Attestation sur l’honneur', [
      `Je ${acc(values, 'soussigné', 'soussignée')} ${val(values, 'prenom')} ${val(values, 'nom')}, demeurant ${val(values, 'adresse')}, ${city}, atteste sur l’honneur que ${lowerFirst(declared)}`,
      'La présente attestation est établie pour servir et valoir ce que de droit. J’ai connaissance que toute déclaration inexacte m’expose aux sanctions prévues par la loi.',
    ], {
      placeDate: `Fait à ${val(values, 'lieu') || val(values, 'ville')}, le ${when(values, 'date')}`,
      salutation: '',
      closing: '',
    })
  },
}

export const TEMPLATES: Template[] = [
  motivationPremier,
  motivationReconversion,
  motivationSpontanee,
  motivationAlternance,
  resiliationAbonnement,
  resiliationBox,
  resiliationAssurance,
  resiliationSport,
  reclamation,
  conge,
  demission,
  relance,
  amende,
  administration,
  remboursement,
  attestation,
]

export function templateById(id: string): Template {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0]!
}

export function filenameFor(template: Template, extension: 'pdf' | 'docx' | 'txt'): string {
  const slug = template.title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug}.${extension}`
}
