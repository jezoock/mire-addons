#!/usr/bin/env node
/**
 * Crée la paire de clés de signature de l'index (ed25519), hors du dépôt : on ne commite jamais une clé privée.
 *
 * Usage : node scripts/keygen.mjs <dossier hors du dépôt>
 * Écrit `mire-addons-signing.key` (clé privée, PKCS#8 PEM, droits 600) et `mire-addons-signing.pub.pem` (clé
 * publique), puis affiche l'empreinte de la clé et sa forme brute en base64. Équivaut à :
 *   openssl genpkey -algorithm ed25519 -out mire-addons-signing.key
 *   openssl pkey -in mire-addons-signing.key -pubout -out mire-addons-signing.pub.pem
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { keyId, rawPublicKey } from './lib/index-file.mjs';
import { isMain, ROOT } from './lib/plugins.mjs';

export const PRIVATE_FILE = 'mire-addons-signing.key';
export const PUBLIC_FILE = 'mire-addons-signing.pub.pem';

/** Vrai si `dir` est dans le dépôt (ou est le dépôt). */
export function insideRepo(dir, root = ROOT) {
  const rel = path.relative(realpathSync(root), dir);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function main(args) {
  if (!args[0]) throw new Error('Usage : node scripts/keygen.mjs <dossier hors du dépôt>');
  mkdirSync(args[0], { recursive: true });
  const dir = realpathSync(args[0]);
  if (insideRepo(dir)) throw new Error('Refusé : le dossier est dans le dépôt. Choisissez un dossier hors du dépôt (la clé privée ne doit jamais être commitée).');
  const priv = path.join(dir, PRIVATE_FILE);
  const pub = path.join(dir, PUBLIC_FILE);
  if (existsSync(priv) || existsSync(pub)) throw new Error(`Refusé : ${PRIVATE_FILE} ou ${PUBLIC_FILE} existe déjà dans ${dir}.`);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(pub, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`Clé privée : ${priv} (à ranger dans le secret MIRE_ADDONS_SIGNING_KEY, puis à garder hors ligne)`);
  console.log(`Clé publique : ${pub} (à copier dans keys/ du dépôt)`);
  console.log(`Empreinte (sha256 de la clé brute) : ${keyId(publicKey)}`);
  console.log(`Clé publique brute (base64) : ${rawPublicKey(publicKey).toString('base64')}`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
