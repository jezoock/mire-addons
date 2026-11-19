# mire-addons — dépôt officiel des plugins de Mire

Les plugins officiels de [Mire](https://github.com/jezoock/mire), et la chaîne qui les valide, les empaquette et
publie un **index signé** que Mire lit pour les installer et les mettre à jour.

**Index du dépôt** (adresse stable, lisible par tous) :
`https://github.com/jezoock/mire-addons/releases/download/index/index.json`

Format de l'index, des paquets et de la signature, chaîne de publication, reprise par un dépôt tiers :
[`docs/index-format.md`](docs/index-format.md). Écrire un plugin pas à pas : [`docs/ecrire-un-plugin.md`](docs/ecrire-un-plugin.md).
Consignes pour les agents : [`AGENTS.md`](AGENTS.md).

## Organisation

| Dossier | Contenu |
| --- | --- |
| `plugins/<id>/` | Un plugin par dossier (espace de travail npm) : `mire-plugin.json`, `package.json`, `i18n/`, ses fichiers. |
| `sdk/` | Copie de `@mire/plugin-sdk` : types, schéma et validateur du manifeste (voir ci-dessous). |
| `scripts/` | Validation, empaquetage, index signé, publication, vérification, clés. |
| `test/` | Tests (`node:test`). |
| `keys/` | Clés **publiques** de signature de l'index. |
| `repository.json` | Nom du dépôt ; `official: true` pour le dépôt officiel. |

## Commandes

Node 22.18 ou plus. Aucune dépendance externe : `npm install` ne fait que relier les espaces de travail.

```sh
npm install
npm run validate      # manifestes (validateur du SDK) et règles du dépôt
npm run build         # plugins qui ont une construction (aucun pour l'instant)
npm test
npm run pack          # dist/packages/<id>-<version>.tgz et SHA256SUMS
npm run index:test    # chaîne complète dans dist/test-repo/, signée par une clé de test jetable
node scripts/verify-index.mjs <index.json ou adresse> --key <clé publique> [--packages] [--official]
```

## Publier un plugin

1. Créer ou modifier le plugin dans `plugins/<id>/` (voir [`docs/ecrire-un-plugin.md`](docs/ecrire-un-plugin.md)).
   Un changement publié augmente toujours la `version` du manifeste.
2. Ouvrir une PR. La CI valide, construit, teste, empaquette et essaie toute la chaîne avec une clé de test.
3. Fusionner sur `main`. La CI publie chaque nouvelle version en Release GitHub (`<id>@<version>`, paquet
   `<id>-<version>.tgz`), relit tous les paquets publiés, signe l'index et le publie dans la Release `index`.

Une version publiée ne change plus : la CI refuse de republier une version dont le contenu diffère. La publication
ne tourne que sur `main` (ou par Actions → CI et publication → Run workflow, sur `main`), jamais sur une PR.

## Conventions

- Identifiant en notation inversée, nom du dossier compris ; préfixe `mire.` réservé au dépôt officiel.
- `package.json` du plugin : `name` = identifiant, `private: true`, pas de `version` (elle est dans le manifeste),
  `files` = contenu du paquet, `devDependencies` sur `@mire/plugin-sdk`.
- Textes en anglais et en français (`i18n/en.json`, `i18n/fr.json`), au format des catalogues de Mire.
- Le niveau le plus bas possible, les permissions les plus étroites.
- Documentation et commentaires en français ; 2 espaces, guillemets simples, points-virgules.
- Toute dépendance (même de développement) se justifie dans la PR.

## Niveaux de confiance

Le manifeste déclare un niveau ; Mire le vérifie, il ne le suppose jamais.

| Niveau | Contient | Où ça tourne dans Mire | Peut venir de |
| --- | --- | --- | --- |
| **Données seules** (`data`) | JSON, images, sons, polices, couleurs | Rien ne s'exécute : Mire lit et valide les fichiers. | Tout dépôt |
| **Code limité** (`code`) | JavaScript qui n'utilise que l'API de Mire | Hôte isolé, sans Node ni réseau direct ; seulement les hôtes déclarés dans `permissions.hosts`. | Tout dépôt |
| **Code sensible** (`privileged`) | Code qui a besoin de Node ou d'un accès sensible (programmes, réseau local, vues web, suppression de fichiers) | Processus principal de Mire | Ce dépôt officiel signé ; un dépôt tiers seulement avec l'accord explicite de l'utilisateur, plugin par plugin |

L'origine d'un plugin compte autant : ce dépôt est signé par une clé intégrée à Mire ; un dépôt tiers est ajouté par
l'utilisateur avec sa propre clé, dont Mire affiche l'empreinte, et ses plugins ne peuvent pas utiliser le préfixe
`mire.`.

## Le SDK : une copie versionnée

`@mire/plugin-sdk` est privé dans Mire et n'est pas publié sur npm. `sdk/` en est une copie exacte (`src/`,
`schema/`, `README.md`) prise à un commit précis de Mire (`sdk/source.json`), avec un `package.json` qui pointe vers
les sources TypeScript, que Node exécute directement. Ainsi, un agent ou une CI qui ne clone que ce dépôt peut
construire, tester et lire le contrat des plugins, sans accès à Mire, sans construction ni dépendance. Un test vérifie
que la copie n'a pas été modifiée à la main.

Mise à jour, après un changement du SDK dans Mire :

```sh
npm run update-sdk -- <sha complet du commit de Mire>
# ou depuis un clone local de Mire :
npm run update-sdk -- --from ../mire
npm install && npm run validate && npm test
```

## Clé de signature

L'index est signé en ed25519. La clé privée ne vit que dans un secret du dépôt ; elle n'est jamais commitée.

**1. Créer la paire de clés**, sur votre machine, dans un dossier hors de tout dépôt (Linux, macOS, ou Git Bash sous
Windows) :

```sh
mkdir -p ~/mire-addons-cles && cd ~/mire-addons-cles
openssl genpkey -algorithm ed25519 -out mire-addons-signing.key
openssl pkey -in mire-addons-signing.key -pubout -out mire-addons-signing.pub.pem
```

Sans OpenSSL, depuis un clone de ce dépôt (Node 22.18 ou plus) : `node scripts/keygen.mjs ~/mire-addons-cles`
(mêmes fichiers ; affiche aussi l'empreinte de la clé).

Format attendu par la CI : clé privée ed25519 **PKCS#8 PEM** (`-----BEGIN PRIVATE KEY-----`), clé publique PEM SPKI
(`-----BEGIN PUBLIC KEY-----`).

**2. Ranger la clé privée** dans GitHub : dépôt `jezoock/mire-addons` → **Settings → Secrets and variables →
Actions** → **New repository secret**. Nom : `MIRE_ADDONS_SIGNING_KEY` ; valeur : tout le contenu de
`mire-addons-signing.key`, lignes `BEGIN` et `END` comprises. Ou, avec l'outil `gh` :

```sh
gh secret set MIRE_ADDONS_SIGNING_KEY --repo jezoock/mire-addons < mire-addons-signing.key
```

Puis gardez une copie de la clé privée hors ligne (gestionnaire de mots de passe, support chiffré) et effacez-la du
disque : perdue, elle oblige à changer de clé dans Mire ; volée, elle permet de signer un faux index.

**3. Donner la clé publique** (`mire-addons-signing.pub.pem`, sans danger à partager) : elle est versionnée dans
`keys/`, puis intégrée à Mire (tâche P3-07). Dès qu'une clé est dans `keys/`, la CI refuse de signer avec une autre.

Sans le secret, la publication échoue avec un message clair ; validation, build et tests continuent de passer.
