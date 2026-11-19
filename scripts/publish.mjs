#!/usr/bin/env node
/**
 * Publication réelle (CI, branche main) : empaquette les plugins, publie les nouvelles versions en Releases GitHub,
 * relit tous les paquets publiés, puis signe et publie l'index.
 *
 * Variables d'environnement :
 * - MIRE_ADDONS_SIGNING_KEY : clé privée ed25519 (PKCS#8 PEM), secret du dépôt. Jamais affichée.
 * - GITHUB_REPOSITORY (`propriétaire/dépôt`), GITHUB_SHA (commit publié), GH_TOKEN (pour `gh`) : fournis par la CI.
 *
 * Écrit aussi `dist/index.json` et `dist/index-signing.pub.pem` (clé publique, pour l'étape de vérification).
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPublicKey } from 'node:crypto';
import { keyId, loadPrivateKey, loadPublicKey } from './lib/index-file.mjs';
import { isMain, listPluginDirs, readRepositoryConfig, ROOT } from './lib/plugins.mjs';
import { publish } from './lib/publish.mjs';
import { GitHubStore } from './lib/store.mjs';
import { packAll, PACKAGES_DIR } from './pack.mjs';

const KEY_VAR = 'MIRE_ADDONS_SIGNING_KEY';
const KEYS_DIR = path.join(ROOT, 'keys');

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

/** Si des clés publiques sont versionnées dans keys/, la clé du secret doit être l'une d'elles. */
export async function checkCommittedKey(privateKey, dir = KEYS_DIR) {
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.pub.pem'));
  if (files.length === 0) return null;
  const ids = await Promise.all(files.map(async (f) => keyId(loadPublicKey(await readFile(path.join(dir, f), 'utf8')))));
  if (!ids.includes(keyId(privateKey))) {
    throw new Error(`La clé du secret ${KEY_VAR} (${keyId(privateKey)}) ne correspond à aucune clé publique de keys/ : index non publié.`);
  }
  return keyId(privateKey);
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
  await writeFile(path.join(ROOT, 'dist', 'index-signing.pub.pem'), createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }));
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
