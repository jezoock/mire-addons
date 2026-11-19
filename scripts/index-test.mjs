#!/usr/bin/env node
/**
 * Essai complet de la chaîne, sans réseau ni secret : les plugins sont empaquetés et « publiés » dans un dossier
 * local qui a la forme des Releases (`dist/test-repo/<étiquette>/<fichier>`), puis l'index est signé par une paire
 * de clés générée pour l'occasion, vérifié et écrit avec la clé publique de test (`dist/test-repo/test.pub.pem`).
 * La clé privée n'est jamais écrite. Ce dossier peut servir de dépôt de test à Mire (P3-07, P3-08).
 *
 * Usage : node scripts/index-test.mjs [propriétaire/dépôt]  (adresses écrites dans l'index ; défaut : GITHUB_REPOSITORY
 * ou jezoock/mire-addons)
 */
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { keyId, verifyIndex } from './lib/index-file.mjs';
import { isMain, listPluginDirs, readRepositoryConfig, ROOT } from './lib/plugins.mjs';
import { publish } from './lib/publish.mjs';
import { FolderStore, INDEX_FILE, INDEX_TAG } from './lib/store.mjs';
import { packAll, PACKAGES_DIR } from './pack.mjs';

export const TEST_REPO_DIR = path.join(ROOT, 'dist', 'test-repo');

async function main(args) {
  const repo = args[0] ?? process.env.GITHUB_REPOSITORY ?? 'jezoock/mire-addons';
  const { official, name } = await readRepositoryConfig();
  const built = await packAll(await listPluginDirs(), PACKAGES_DIR, { official });
  await rm(TEST_REPO_DIR, { recursive: true, force: true });
  await mkdir(TEST_REPO_DIR, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const store = new FolderStore({ dir: path.join(TEST_REPO_DIR, 'releases'), repo });
  const signed = await publish({ store, built, privateKey, official, repositoryName: name, log: console.log });
  verifyIndex(signed, publicKey);
  await writeFile(path.join(TEST_REPO_DIR, 'test.pub.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`Index de test signé et vérifié (clé de test ${keyId(publicKey)}) : ${path.relative(ROOT, path.join(store.dir, INDEX_TAG, INDEX_FILE))}`);
}

if (isMain(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
