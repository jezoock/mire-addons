#!/usr/bin/env node
/**
 * Publication réelle (CI, branche main) : empaquette les plugins, publie les nouvelles versions en Releases GitHub,
 * relit tous les paquets publiés, puis signe et publie l'index.
 *
 * Variables d'environnement :
 * - MIRE_ADDONS_SIGNING_KEY : clé privée ed25519 (PKCS#8 PEM), secret du dépôt. Jamais affichée.
 * - GITHUB_REPOSITORY (`propriétaire/dépôt`), GITHUB_SHA (commit publié), GH_TOKEN (pour `gh`) : fournis par la CI.
 *
 * Avant de signer, la clé du secret doit correspondre à `keys/mire-addons-signing.pub.pem`. Écrit aussi `dist/index.json`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPublicKey } from 'node:crypto';
import { keyId, loadPrivateKey, loadPublicKey } from './lib/index-file.mjs';
import { isMain, listPluginDirs, readRepositoryConfig, ROOT } from './lib/plugins.mjs';
import { publish } from './lib/publish.mjs';
import { GitHubStore } from './lib/store.mjs';
import { packAll, PACKAGES_DIR } from './pack.mjs';

const KEY_VAR = 'MIRE_ADDONS_SIGNING_KEY';
/** Clé publique officielle versionnée ; la CI relit l'index publié avec elle. */
export const COMMITTED_KEY = path.join(ROOT, 'keys', 'mire-addons-signing.pub.pem');

/** Clé privée lue dans l'environnement ; erreur explicite si le secret manque. */
export function signingKeyFromEnv(env = process.env) {
  const pem = env[KEY_VAR];
  if (!pem || !pem.trim()) {
    throw new Error(
      `Le secret ${KEY_VAR} est absent : la publication est impossible. Créez la paire de clés (README, « Clé de signature »), ` +
        'puis rangez la clé privée dans Settings → Secrets and variables → Actions du dépôt. Validation, build et tests ne sont pas concernés.',
    );
  }
  return loadPrivateKey(pem);
}

/**
 * La clé publique tirée du secret doit être identique à la clé officielle versionnée (`keys/`). Sinon on s'arrête
 * avant de signer : un index signé par une autre clé serait rejeté par Mire. Seules les empreintes (publiques) sont
 * citées, jamais la clé privée.
 */
export async function checkCommittedKey(privateKey, file = COMMITTED_KEY) {
  const name = path.relative(ROOT, file) || file;
  let committed;
  try {
    committed = loadPublicKey(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`La clé publique versionnée ${name} est illisible : ${err.message}`);
    throw new Error(`La clé publique officielle ${name} est absente du dépôt : index non signé, rien n'est publié.`);
  }
  const fromSecret = keyId(createPublicKey(privateKey));
  if (fromSecret !== keyId(committed)) {
    throw new Error(
      `La clé du secret ${KEY_VAR} (empreinte ${fromSecret}) n'est pas la clé publique versionnée ${name} (empreinte ${keyId(committed)}) : ` +
        'index non signé, rien n\'est publié. Rangez dans le secret la clé privée qui correspond à la clé versionnée, ou changez la clé versionnée par une PR si la clé a été remplacée.',
    );
  }
  return fromSecret;
}

async function main() {
  const privateKey = signingKeyFromEnv();
  await checkCommittedKey(privateKey);
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY est absent (propriétaire/dépôt).');
  const { official, name } = await readRepositoryConfig();
  const built = await packAll(await listPluginDirs(), PACKAGES_DIR, { official });
  const store = new GitHubStore({ repo, target: process.env.GITHUB_SHA });
  const signed = await publish({ store, built, privateKey, official, repositoryName: name, log: console.log });
  await writeFile(path.join(ROOT, 'dist', 'index.json'), `${JSON.stringify(signed, null, 2)}\n`);
  console.log(`Index : ${store.urls.index}`);
}

if (isMain(import.meta.url)) {
  try {
    await main();
  } catch (err) {
    // Annotation GitHub Actions : le message apparaît en tête du résumé du job.
    console.error(`::error::${err.message.replace(/\n/g, '%0A')}`);
    process.exitCode = 1;
  }
}
