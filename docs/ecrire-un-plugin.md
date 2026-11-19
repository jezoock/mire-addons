# Écrire un plugin, pas à pas

On part du plugin d'exemple, `plugins/mire.exemple.donnees/` : un plugin de **données seules** qui ajoute un pack
vide. Le contrat complet (manifeste, contributions, contexte) est dans `sdk/` (voir `sdk/README.md`).

## 1. Copier l'exemple

```sh
cp -r plugins/mire.exemple.donnees plugins/org.exemple.monplugin
```

Le dossier porte l'identifiant du plugin : notation inversée, en minuscules. Dans ce dépôt (officiel), on choisit un
identifiant `mire.<domaine>.<nom>` ; un dépôt tiers ne peut pas utiliser le préfixe `mire.`.

## 2. Le manifeste : `mire-plugin.json`

```json
{
  "$schema": "../../sdk/schema/mire-plugin.schema.json",
  "id": "mire.exemple.donnees",
  "version": "1.0.0",
  "engines": { "mire": "^1.0.0" },
  "level": "data",
  "contributes": { "packs": [{ "id": "exemple", "file": "packs/exemple.json" }] },
  "i18n": "i18n/"
}
```

- `id` : le nom du dossier.
- `version` : `1.0.0` pour une première publication, puis à augmenter à chaque changement publié.
- `engines.mire` : les versions de Mire compatibles.
- `level` : `data` tant que le plugin ne contient que des fichiers ; `code` ou `privileged` pour du JavaScript
  (voir le README, « Niveaux de confiance »).
- `contributes` : ce que le plugin ajoute. Une contribution de données a un `id` et un `file` ; une contribution de
  code a un `main`. La liste des natures est dans `sdk/src/manifest.ts`.
- `permissions`, `dependencies`, `settings` : facultatifs (un plugin `data` ne demande aucune permission).

Le champ `$schema` donne la complétion dans les éditeurs.

## 3. Les fichiers de données

Ici `packs/exemple.json`. Le cœur de Mire lit et valide ces fichiers : seulement des données, adresses `https:`
seulement, aucun HTML.

## 4. Les textes : `i18n/en.json` et `i18n/fr.json`

```json
{
  "meta": { "code": "fr", "name": "Français", "app": "1.0.0" },
  "messages": {
    "plugin": {
      "name": "Plugin d'exemple",
      "description": "Un plugin de données seules qui montre comment les plugins sont publiés."
    }
  }
}
```

L'anglais et le français sont obligatoires dans ce dépôt. Les tags, infos et réglages déclarés ont aussi leurs textes
(`tags.<id>`, `infos.<id>`, `settings.<clé>.label`) : le validateur dit lesquels manquent.

## 5. `package.json`

```json
{
  "name": "mire.exemple.donnees",
  "private": true,
  "files": ["mire-plugin.json", "i18n/", "packs/"],
  "scripts": { "validate": "mire-plugin validate . --official" },
  "devDependencies": { "@mire/plugin-sdk": "0.1.0" }
}
```

- `name` : l'identifiant ; `private: true` (un plugin ne va pas sur npm) ; pas de `version`.
- `files` : tout ce qui part dans le paquet. Le manifeste, les fichiers déclarés et les catalogues doivent y être.

## 6. Valider, tester, empaqueter

```sh
npm install                 # relie le nouvel espace de travail
npm run validate            # tous les plugins
npm test
npm run pack                # dist/packages/<id>-<version>.tgz et SHA256SUMS
npm run index:test          # chaîne complète, signée par une clé de test
```

## 7. Publier

Ouvrir une PR : la CI refait ces vérifications. À la fusion sur `main`, elle publie la version (Release
`<id>@<version>`) et met à jour l'index signé. Pour publier un changement plus tard : modifier, augmenter `version`,
nouvelle PR.
