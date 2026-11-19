# Clés publiques de signature

Ce dossier contient la clé publique qui vérifie l'index du dépôt, au format SPKI PEM. Elle sera intégrée à Mire
(tâche P3-07). Aucune clé privée n'a sa place ici (le `.gitignore` les écarte).

## Clé officielle : `mire-addons-signing.pub.pem`

- Algorithme : ed25519.
- Empreinte sha256 de la forme DER :
  `37284e6151e1a56ee5d22da42cc545104168cb380ba1b66d5798ed46cf9dc993`
- Empreinte de l'index (`signature.keyId`, sha256 des 32 octets bruts de la clé) :
  `8aaa3d5816218d1ca8cbcb495175723a205f92b6e0727f71c62e9bb3e3396cd5`

Pour recalculer l'empreinte DER :

```sh
openssl pkey -pubin -in keys/mire-addons-signing.pub.pem -outform DER | sha256sum
```

Pour recalculer l'empreinte de l'index : `node -e "import('./scripts/lib/index-file.mjs').then(m => console.log(m.keyId(m.loadPublicKey(require('fs').readFileSync('keys/mire-addons-signing.pub.pem', 'utf8')))))"`.

## Rôle dans la CI

- Avant de signer, la publication vérifie que la clé publique tirée du secret `MIRE_ADDONS_SIGNING_KEY` est identique à
  cette clé ; sinon elle s'arrête avec un message clair (les empreintes seulement, jamais la clé privée).
- La « Lecture publique de l'index et des paquets » vérifie l'index publié avec cette clé versionnée.
- Changer de clé = remplacer ce fichier (et le secret) dans une même PR relue, puis prévenir Mire.
