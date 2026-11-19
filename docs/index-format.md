# Format de l'index et chaîne de publication

Ce document décrit ce qu'un dépôt de plugins de Mire publie, et comment. Il suffit pour écrire un client (Mire,
tâche P3-07) ou pour monter un dépôt tiers (tâche P3-08) : celui-ci peut reprendre ce dépôt tel quel (voir
« Reprendre la chaîne pour un dépôt tiers »).

L'implémentation de référence est dans `scripts/lib/` : `index-file.mjs` (index, signature), `tar.mjs` (paquets),
`publish.mjs` (chaîne), `store.mjs` (Releases GitHub).

## Ce qui est publié

| Quoi | Où (dépôt GitHub `<propriétaire>/<dépôt>`) |
| --- | --- |
| Paquet d'une version de plugin | Release d'étiquette `<id>@<version>`, asset `<id>-<version>.tgz` |
| Index signé | Release d'étiquette `index`, asset `index.json`, remplacé à chaque publication |

Adresse stable de l'index : `https://github.com/<propriétaire>/<dépôt>/releases/download/index/index.json`.
Pour le dépôt officiel : **`https://github.com/jezoock/mire-addons/releases/download/index/index.json`**.

GitHub répond par une redirection (302) vers son stockage : le client suit les redirections. Les adresses des
paquets sont écrites en entier dans l'index ; un client ne les reconstruit pas.

Pourquoi des Releases plutôt que GitHub Pages : tout est publié au même endroit avec la seule permission
`contents: write`, sans réglage du dépôt (Pages demande d'activer le service et deux permissions de plus, `pages` et
`id-token`), et un dépôt tiers n'a rien à configurer. L'asset `index.json` est remplacé en quelques secondes ; un
client qui tombe sur ce court instant (index absent) garde son cache et réessaie plus tard. La signature est dans le
même fichier que l'index : un client ne peut pas lire un index neuf avec une signature ancienne.

## `index.json`

```json
{
  "format": 1,
  "repository": {
    "name": { "en": "Official Mire plugins", "fr": "Plugins officiels de Mire" },
    "source": "https://github.com/jezoock/mire-addons",
    "index": "https://github.com/jezoock/mire-addons/releases/download/index/index.json"
  },
  "generated": "2026-11-19T14:31:02.489Z",
  "plugins": [
    {
      "id": "mire.exemple.donnees",
      "versions": [
        {
          "version": "1.0.0",
          "engines": { "mire": "^1.0.0" },
          "level": "data",
          "contributes": ["packs"],
          "permissions": {},
          "dependencies": {},
          "name": { "en": "Example plugin", "fr": "Plugin d'exemple" },
          "description": { "en": "…", "fr": "…" },
          "package": {
            "url": "https://github.com/jezoock/mire-addons/releases/download/mire.exemple.donnees%401.0.0/mire.exemple.donnees-1.0.0.tgz",
            "sha256": "56655efae10b3e1dc38a75b17a067188e672ef4e8a865c3411920390339d574b",
            "size": 552
          }
        }
      ]
    }
  ],
  "signature": {
    "algorithm": "ed25519",
    "keyId": "f34a5d93e78e1f393f466f7b5d16a0c377edc026b91180a6c9101567d61c737e",
    "value": "VyoIGLGD+ZxoJQ93IXqy4YUoBnRcvb8m…"
  }
}
```

| Champ | Contenu |
| --- | --- |
| `format` | `1`. Un client refuse un format qu'il ne connaît pas. |
| `repository.name` | Nom affiché du dépôt, par langue (`en` obligatoire). |
| `repository.source`, `repository.index` | Page du dépôt et adresse stable de l'index. |
| `generated` | Date de publication (ISO 8601, UTC). Un client refuse un index plus ancien que celui qu'il a en cache (retour en arrière). |
| `plugins` | Triés par `id`. Chaque plugin liste toutes ses versions publiées, de la plus récente à la plus ancienne (ordre semver). |
| `version`, `engines`, `level`, `permissions`, `dependencies` | Repris du manifeste `mire-plugin.json` **du paquet publié** (voir le contrat dans `sdk/`). |
| `contributes` | Natures de contributions présentes (`packs`, `sources`…), triées. |
| `name`, `description` | `plugin.name` et `plugin.description` des catalogues du paquet, par langue ; absents si le paquet n'en a pas. |
| `package.url` | Adresse `https:` du `.tgz`. |
| `package.sha256` | Empreinte sha256 du `.tgz`, en hexadécimal minuscule. |
| `package.size` | Taille du `.tgz` en octets. |
| `signature` | Voir ci-dessous. |

Toutes les valeurs numériques sont des entiers : la forme canonique (ci-dessous) n'a pas à traiter les décimaux.

## Signature

- **Algorithme** : ed25519 (RFC 8032), clé du dépôt.
- **Octets signés** : la chaîne `mire-addons-index:1\n` (en-tête de contexte, pour qu'une signature d'index ne
  puisse servir à rien d'autre), suivie de la **forme canonique** de l'index **sans** son champ `signature`, en UTF-8.
- **Forme canonique** : JSON sans aucun espace, clés des objets triées par ordre des unités de code UTF-16 (l'ordre
  de `Array.prototype.sort` en JavaScript, celui de RFC 8785), chaînes échappées comme par `JSON.stringify`, entiers
  écrits en décimal ; les champs absents ne sont pas écrits. Pour les données de l'index, c'est exactement RFC 8785
  (JCS). La mise en forme du fichier publié (indentation) n'a donc pas d'importance.
- **`signature.value`** : la signature (64 octets) en base64.
- **`signature.keyId`** : sha256, en hexadécimal, des 32 octets bruts de la clé publique. C'est aussi l'**empreinte**
  à afficher à l'utilisateur quand il ajoute un dépôt tiers.

Vérifier un index, dans cet ordre :

1. lire le JSON, vérifier que `signature.algorithm` vaut `ed25519` et que `signature.keyId` est celui de la clé
   attendue pour ce dépôt (la clé intégrée à Mire pour le dépôt officiel, celle donnée à l'ajout pour un dépôt tiers) ;
2. vérifier la signature sur les octets signés ; refuser l'index sinon ;
3. vérifier `format`, puis la structure : identifiants, versions semver, adresses `https:`, empreintes, tailles, et
   le préfixe `mire.` refusé hors du dépôt officiel ;
4. refuser un index dont `generated` est plus ancien que celui du cache.

Puis, à l'installation d'une version : télécharger `package.url`, vérifier la taille et l'empreinte sha256 **avant**
d'ouvrir l'archive, puis vérifier le manifeste qu'elle contient (identifiant et version égaux à ceux de l'index,
validation par le SDK).

Clés publiques acceptées par l'outillage : PEM SPKI (`-----BEGIN PUBLIC KEY-----`) ou les 32 octets bruts en base64.
`node scripts/verify-index.mjs <index.json ou adresse> --key <clé> [--packages] [--official]` fait toutes ces
vérifications (avec `--packages`, aussi le téléchargement de chaque paquet).

## Paquet `.tgz`

- tar au format ustar, compressé en gzip ;
- uniquement des fichiers ordinaires (ni dossier, ni lien, ni périphérique), à la racine du plugin : `mire-plugin.json`
  est à la racine de l'archive, sans dossier englobant ;
- chemins relatifs, séparateur `/`, sans `.`, `..`, `\` ni `:`, 100 octets au plus (champ `name`, pas de préfixe) ;
- archive déterministe : fichiers triés, date 0, propriétaire 0, droits 644, octet « système » de gzip à 255.

Un client refuse toute entrée qui ne respecte pas ces règles (`readTar` de `scripts/lib/tar.mjs` le fait) : il peut
alors extraire dans `userData/plugins/<id>/<version>/` sans autre contrôle de chemin.

Le contenu du paquet est la liste `files` du `package.json` du plugin (fichiers ou dossiers), plus le manifeste. La
validation vérifie que le manifeste, les fichiers qu'il déclare et les catalogues obligatoires y sont.

## Chaîne de publication

À chaque fusion sur `main` (workflow `.github/workflows/ci.yml`, job `publier`) :

1. validation de tous les plugins par le SDK (`npm run validate`) ;
2. lecture de la clé privée dans le secret `MIRE_ADDONS_SIGNING_KEY` ; sans secret, échec avec un message clair, avant
   tout accès à GitHub ; si `keys/` contient des clés publiques, la clé du secret doit être l'une d'elles ;
3. empaquetage de chaque plugin ;
4. pour chaque paquet : si la Release `<id>@<version>` existe, son contenu doit être identique (mêmes fichiers, mêmes
   octets), sinon la publication s'arrête (« augmentez la version ») ; sinon la Release est créée, puis le paquet est
   relu et son empreinte comparée ;
5. **relecture de tous les paquets publiés**, anciennes versions comprises : téléchargement, empreinte calculée sur
   les octets téléchargés, archive lue avec les règles ci-dessus, manifeste validé par le SDK et cohérent avec
   l'étiquette ;
6. construction de l'index d'après ce qui a été relu, contrôle de sa structure, signature, vérification de la
   signature, publication dans la Release `index` ;
7. relecture de l'index à son adresse publique et vérification complète (`verify-index.mjs --packages`).

L'index ne dépend que des Releases : il est reconstruit en entier à chaque publication, sans état caché. Une version
ne se retire pas en la supprimant du dossier `plugins/` (elle reste dans les Releases, donc dans l'index) : on
supprime sa Release, puis on relance la publication (Actions → CI et publication → Run workflow, sur `main`).

Sur une PR, le job `verifier` fait les étapes 1, 3 et 5 à 6 dans un dossier local (`npm run index:test`), avec une
paire de clés générée pour l'occasion, puis vérifie l'index obtenu. Aucun secret n'est utilisé. Le dossier
`dist/test-repo/` produit (paquets, index signé, clé publique de test) sert aussi de dépôt de test sans réseau.

## Reprendre la chaîne pour un dépôt tiers

1. Copier ce dépôt (ou le créer à partir de lui) ; garder `sdk/`, `scripts/`, `test/`, `.github/`, `package.json`.
2. Dans `repository.json` : le nom du dépôt, et `"official": false` (préfixe `mire.` refusé, textes français
   facultatifs).
3. Remplacer les plugins de `plugins/` par les siens (identifiants hors `mire.`).
4. Créer une paire de clés (README, « Clé de signature »), ranger la clé privée dans le secret
   `MIRE_ADDONS_SIGNING_KEY` du dépôt, versionner la clé publique dans `keys/`.
5. Fusionner sur `main` : la CI publie. Donner aux utilisateurs l'adresse de l'index et la clé publique ; Mire leur
   affichera l'empreinte (`keyId`) à vérifier.
