#!/usr/bin/env node
/**
 * Vérifie un index signé, comme le fera un client : signature (avec la clé publique donnée), structure, et, avec
 * `--packages`, l'empreinte et le manifeste de chaque paquet téléchargé.
 *
 * Usage : node scripts/verify-index.mjs <fichier ou adresse https de index.json> --key <fichier .pub.pem ou base64>
 *           [--packages] [--official] [--retries <n>]
 * Code de sortie : 0 si l'index est valide, 1 sinon.
 */
import { readFile } from 'node:fs/promises';
import { checkIndexContent, keyId, loadPublicKey, readPackage, sha256, verifyIndex } from './lib/index-file.mjs';
import { isMain, parseReleaseTag } from './lib/plugins.mjs';
import { readTgz } from './lib/tar.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Octets d'une adresse https (redirections suivies) ou d'un fichier local. */
async function load(where, retries = 0) {
  if (!/^https:\/\//.test(where)) return readFile(where);
  for (let i = 0; ; i++) {
    const res = await fetch(where, { redirect: 'follow', cache: 'no-store' }).catch((err) => ({ ok: false, statusText: err.message }));
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (i >= retries) throw new Error(`${where} : ${res.status ?? ''} ${res.statusText}`.trim());
    await sleep(5000 * (i + 1));
  }
}

const option = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main(args) {
  const where = args.find((a, i) => !a.startsWith('--') && !['--key', '--retries'].includes(args[i - 1]));
  const keyArg = option(args, '--key');
  if (!where || !keyArg) throw new Error('Usage : node scripts/verify-index.mjs <index.json | https://…> --key <clé publique> [--packages] [--official]');
  const keyText = keyArg.includes('BEGIN') || /^[A-Za-z0-9+/]{43}=$/.test(keyArg) ? keyArg : await readFile(keyArg, 'utf8');
  const publicKey = loadPublicKey(keyText);
  const official = args.includes('--official');
  const index = verifyIndex(JSON.parse((await load(where, Number(option(args, '--retries') ?? 0))).toString('utf8')), publicKey);
  const errors = checkIndexContent(index, { official });
  if (errors.length) throw new Error(`Index mal formé :\n- ${errors.join('\n- ')}`);
  console.log(`Signature valide (clé ${keyId(publicKey)}), index du ${index.generated}.`);
  for (const p of index.plugins) {
    for (const v of p.versions) {
      if (args.includes('--packages')) {
        const data = await load(v.package.url, 2);
        if (sha256(data) !== v.package.sha256 || data.length !== v.package.size) throw new Error(`${p.id} ${v.version} : empreinte ou taille différente.`);
        const { id, version } = parseReleaseTag(`${p.id}@${v.version}`);
        readPackage(readTgz(data), { id, version, official });
      }
      console.log(`✓ ${p.id} ${v.version} (${v.level}) ${v.package.sha256}`);
    }
  }
}

if (isMain(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
