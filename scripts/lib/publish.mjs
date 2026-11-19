/**
 * Chaîne de publication, commune à la CI (Releases GitHub) et aux essais (dossier local) :
 *
 * 1. chaque paquet construit est publié s'il est nouveau ; une version déjà publiée doit avoir exactement le même
 *    contenu (sinon : changer la version) ;
 * 2. tous les paquets publiés, anciens compris, sont relus : manifeste validé, étiquette cohérente, empreinte
 *    calculée sur les octets téléchargés ;
 * 3. l'index est construit d'après ce qui a été relu, vérifié, signé, sa signature contrôlée, puis publié.
 *
 * Rien n'est signé sans avoir été relu depuis l'endroit où les clients le téléchargeront.
 */
import { createPublicKey } from 'node:crypto';
import { buildIndex, checkIndexContent, readPackage, sha256, signIndex, verifyIndex, versionEntry } from './index-file.mjs';
import { packageFileName, parseReleaseTag, releaseTag } from './plugins.mjs';
import { readTgz } from './tar.mjs';

/** Même contenu : mêmes chemins, mêmes octets. */
export function sameContent(a, b) {
  if (a.length !== b.length) return false;
  const byPath = new Map(b.map((f) => [f.path, f.data]));
  return a.every((f) => byPath.get(f.path)?.equals(f.data));
}

async function publishBuilt(store, releases, pkg, log) {
  const tag = releaseTag(pkg.id, pkg.version);
  const existing = releases.find((r) => r.tag === tag);
  if (existing) {
    if (!existing.assets.includes(pkg.file)) throw new Error(`La Release ${tag} existe sans le paquet ${pkg.file} : corrigez-la à la main.`);
    const published = readTgz(await store.download(tag, pkg.file));
    if (!sameContent(pkg.files, published)) {
      throw new Error(`${pkg.id} ${pkg.version} est déjà publié avec un autre contenu : augmentez « version » dans son mire-plugin.json.`);
    }
    log(`= ${tag} déjà publié, contenu identique.`);
    return;
  }
  const notes = `${pkg.id} ${pkg.version}\n\nsha256 : \`${pkg.sha256}\``;
  await store.createRelease(tag, pkg.file, pkg.tgz, notes);
  const back = await store.download(tag, pkg.file);
  if (sha256(back) !== pkg.sha256) throw new Error(`${tag} : le paquet relu après publication n'a pas l'empreinte attendue.`);
  log(`+ ${tag} publié (sha256 ${pkg.sha256}).`);
}

/** Relit un paquet publié et rend son entrée d'index. */
async function entryFor(store, tag, assets, official) {
  const { id, version } = parseReleaseTag(tag);
  const file = packageFileName(id, version);
  if (!assets.includes(file)) throw new Error(`La Release ${tag} n'a pas de paquet ${file}.`);
  const data = await store.download(tag, file);
  const { manifest, catalogs } = readPackage(readTgz(data), { id, version, official });
  return { id, entry: versionEntry({ manifest, catalogs, url: store.urls.asset(tag, file), sha: sha256(data), size: data.length }) };
}

/**
 * Publie `built` (paquets de `packAll`, avec leurs fichiers et leur `.tgz`) dans `store`, puis l'index signé par
 * `privateKey`. Rend l'index signé.
 */
export async function publish({ store, built, privateKey, official, repositoryName, now = new Date(), log = () => {} }) {
  const before = await store.releases();
  for (const pkg of built) await publishBuilt(store, before, pkg, log);
  const releases = (await store.releases()).filter((r) => parseReleaseTag(r.tag));
  const versions = [];
  for (const r of releases) versions.push(await entryFor(store, r.tag, r.assets, official));
  const repository = { name: repositoryName, source: store.urls.source, index: store.urls.index };
  const index = buildIndex({ repository, generated: now.toISOString(), versions });
  const errors = checkIndexContent(index, { official });
  if (errors.length) throw new Error(`Index refusé :\n- ${errors.join('\n- ')}`);
  const signed = signIndex(index, privateKey);
  verifyIndex(signed, createPublicKey(privateKey));
  await store.publishIndex(Buffer.from(`${JSON.stringify(signed, null, 2)}\n`));
  log(`Index signé publié : ${versions.length} version(s), clé ${signed.signature.keyId}.`);
  return signed;
}
