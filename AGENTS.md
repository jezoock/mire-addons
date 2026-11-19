# mire-addons — consignes pour les agents

Ce fichier est lu tel quel par plusieurs outils (Claude Code par `CLAUDE.md`, Gemini par `.gemini/settings.json`,
et ceux qui lisent `AGENTS.md`). Il se suffit à lui-même : tout ce qu'il faut pour travailler ici est dans ce dépôt.

## Ce dépôt

Le dépôt officiel des plugins de **Mire** (application Electron : lecteur multimédia, streaming, télévision, jeux ;
dépôt `jezoock/mire`). Il contient les sources des plugins, la copie du SDK qui définit leur contrat, et la chaîne qui
les valide, les empaquette et publie un index signé que Mire lit.

- `plugins/<id>/` : un plugin par dossier, nommé d'après son identifiant ; un espace de travail npm.
- `sdk/` : copie versionnée de `@mire/plugin-sdk` (contrat des plugins). **Ne pas la modifier à la main** : un test
  le refuse. On corrige le SDK dans Mire, puis `npm run update-sdk -- <sha du commit de Mire>`.
- `scripts/` : validation, empaquetage, index signé, publication, clés ; `scripts/lib/` : leur code commun.
- `test/` : tests (`node:test`) ; un plugin peut avoir les siens dans `plugins/<id>/test/`.
- `docs/ecrire-un-plugin.md` : pas à pas ; `docs/index-format.md` : format de l'index, des paquets, signature,
  chaîne de publication.
- `repository.json` : nom du dépôt et mode officiel ; `keys/` : clés **publiques** de signature.

## Où trouver le contrat des plugins

- Manifeste `mire-plugin.json` : types dans `sdk/src/manifest.ts`, schéma JSON dans
  `sdk/schema/mire-plugin.schema.json`, règles dans `sdk/src/validate.ts` et `sdk/src/validate-dir.ts`.
- Contributions de code (`ElementSource`, `Tagger`, `MetadataProvider`…) : `sdk/src/contributions.ts` ; contexte
  d'un plugin (`http`, `files`, `storage`, `settings`, `log`, `events`) : `sdk/src/context.ts` ; éléments :
  `sdk/src/element.ts` ; cibles : `sdk/src/targets.ts`.
- `sdk/README.md` résume le tout ; `sdk/source.json` donne le commit de Mire copié.

## Périmètre d'un plugin

- Une tâche = un plugin (ou une version d'un plugin) = une PR. On ne touche ni à `sdk/`, ni à `scripts/`, ni à la CI
  pour publier un plugin.
- Identifiant en notation inversée ; le préfixe `mire.` est réservé à ce dépôt (officiel).
- Niveaux (décision D-18 de Mire), vérifiés par le validateur :
  - `data` : seulement des fichiers de données (JSON, images, sons, polices, jetons de couleurs) ; aucun `main`,
    aucune permission ;
  - `code` : du JavaScript qui n'utilise que le contexte fourni par Mire ; il tourne dans un hôte isolé, sans Node
    ni réseau direct ; chaque hôte Internet est déclaré dans `permissions.hosts` ;
  - `privileged` : code dans le processus principal de Mire (réseau local, programmes, vues web, suppression de
    fichiers, extensions des vues web, téléchargements). Réservé aux cas où rien d'autre ne suffit ; à justifier
    dans la PR.
- Toujours le niveau le plus bas possible, et les permissions les plus étroites.
- Textes : `i18n/en.json` et `i18n/fr.json` obligatoires ici (format des catalogues de Mire : `meta`, `messages`) ;
  `plugin.name`, et `plugin.description` conseillé.
- Toute modification publiée change la `version` du manifeste (semver). Une version publiée ne change jamais : la CI
  refuse de republier une version dont le contenu diffère.
- `package.json` du plugin : `name` = identifiant, `private: true`, pas de `version` (elle est dans le manifeste),
  `files` = ce qui part dans le paquet, `devDependencies: { "@mire/plugin-sdk": "<version de sdk/>" }`.

## Commandes

Node 22.18 ou plus (le SDK est en TypeScript, exécuté directement par Node). Aucune dépendance externe.

- `npm install` : relie les espaces de travail (rien n'est téléchargé).
- `npm run validate` : valide tous les plugins (SDK + règles du dépôt) ; `npm run validate -- plugins/<id>` pour un
  seul. Dans un dossier de plugin : `npm run validate` (outil `mire-plugin` du SDK).
- `npm run build` : construit les plugins qui ont un script `build` (aucun pour l'instant).
- `npm test` : tous les tests.
- `npm run pack` : paquets `.tgz` et `SHA256SUMS` dans `dist/packages/`.
- `npm run index:test` : toute la chaîne de publication dans `dist/test-repo/`, signée par une clé de test jetable.
- `node scripts/verify-index.mjs <index.json ou adresse> --key <clé publique> [--packages] [--official]` : vérifie
  un index comme le fera Mire.
- `npm run update-sdk -- <sha>` (ou `-- --from <clone de Mire>`) : met à jour `sdk/`.
- `npm run publish:release` : publication réelle ; **réservée à la CI** sur `main`.

## Sécurité

- Jamais de clé privée, de jeton ou de secret dans le dépôt, dans un test, dans un journal ou dans une PR. La clé de
  signature est le secret `MIRE_ADDONS_SIGNING_KEY` de la CI ; les tests génèrent leurs propres clés à la volée.
  `npm run keygen` refuse d'écrire dans le dépôt.
- Ne pas affaiblir la chaîne : rien n'est signé sans avoir été relu depuis l'endroit où Mire le téléchargera
  (empreinte, manifeste) ; la publication ne tourne que sur `main` ; les actions de la CI sont épinglées par SHA de
  commit et chaque job a les permissions minimales (`contents: write` pour la seule publication).
- Un plugin de données ne contient que des adresses `https:` et aucun HTML interprété. Un plugin de code n'appelle
  que les hôtes déclarés.
- Toute nouvelle dépendance (même de développement) se justifie dans la PR (décision D-03 de Mire : minimiser les
  dépendances). Un plugin qui a besoin d'une construction déclare la sienne dans son `package.json`.

## Conventions

- Français pour la documentation, les commentaires et les messages des scripts ; textes destinés à l'utilisateur de
  Mire : simples, sans jargon, en français et en anglais.
- Style : 2 espaces, guillemets simples, points-virgules, fonctions courtes ; commentaires pour le « pourquoi ».
- Branche par tâche, PR vers `main`, titre qui commence par l'identifiant de la tâche du plan de Mire quand il y en
  a un (`P5-06 — …`). Ne pas fusionner soi-même.
