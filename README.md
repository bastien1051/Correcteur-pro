# Correcteur Pro

Assistant d’écriture en français, par les **Éditions Bastien**. Gratuit, sans compte, sans publicité et sans clé d’API.

Le site est publié à l’adresse <https://bastien1051.github.io/Correcteur-pro/>.  
L’application Android se télécharge à l’adresse stable <https://github.com/bastien1051/Correcteur-pro/releases/latest/download/Correcteur-Pro.apk>.  
La page d’installation est <https://bastien1051.github.io/Correcteur-pro/partage.html>.

## Quatre fonctions

- **Corriger** — orthographe, grammaire, conjugaison, accords, ponctuation et typographie française. Les fautes sont soulignées. Chaque faute a une explication et une suggestion. « Tout corriger » applique les suggestions.
- **Traduire** — détection de la langue, traduction vers le français par défaut, et du français vers l’anglais, l’espagnol, l’allemand, l’italien, le portugais, le néerlandais, l’arabe, le turc, le polonais, le roumain, le russe, le chinois, le japonais et l’ukrainien. Lecture à voix haute. Un mot isolé propose d’autres sens lorsqu’ils existent. Le français obtenu est relu.
- **Courriers** — lettres prêtes à remplir (motivation, résiliation, réclamation, congé, démission, relance, amende, administration, remboursement, attestation). Aperçu, copie, impression, PDF et Word.
- **Historique** — enregistré seulement sur l’appareil (IndexedDB, ou le stockage local si besoin).

## Moteurs

La correction utilise l’API publique de [LanguageTool](https://languagetool.org) (`api.languagetool.org`), sans clé. Les textes longs sont découpés (environ 6 000 caractères) pour rester sous la limite de 20 Ko par requête, avec une pause entre les envois. Vingt requêtes par minute au maximum. Si le service ne répond pas, la typographie française est tout de même proposée et un message clair l’indique.

La traduction essaie, dans l’ordre :

1. le point d’accès public de Google Traduction, parce que c’est le plus fidèle sans clé et qu’il fournit les autres sens d’un mot ;
2. des instances Lingva, qui relaient la même qualité ;
3. des instances publiques LibreTranslate (Argos) ;
4. MyMemory, mémoire de traduction sans clé, par fragments de moins de 500 octets ;
5. un modèle Helsinki-NLP Opus-MT dans le navigateur (Transformers.js), téléchargé une fois puis gardé sur l’appareil. Le français vers une autre langue passe par l’anglais lorsqu’il n’existe pas de modèle direct.

Aucun de ces services ne demande de compte. Les textes quittent l’appareil seulement le temps de la requête en ligne. L’historique n’est pas envoyé.

## Limites

LanguageTool peut refuser un envoi si l’adresse est trop sollicitée, et il ne propose des graphies que pour une trentaine de mots mal orthographiés par fragment. La traduction automatique se relit, elle ne remplace pas un traducteur. Les courriers sont des modèles sérieux, pas un conseil juridique. Le modèle hors ligne est lourd au premier téléchargement et couvre les langues de la liste, pas toutes les nuances d’un moteur en ligne.

## Publication

Le site est déployé par GitHub Actions (dossier `dist`, chemins relatifs, donc servis sous `/Correcteur-pro/`). Si la page n’est pas en ligne, dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

L’APK Capacitor charge le site en ligne et garde la copie embarquée si le réseau manque. Le fichier publié s’appelle `Correcteur-Pro.apk`.

```bash
npm ci
npm test
npm run build
npm run dev
```
