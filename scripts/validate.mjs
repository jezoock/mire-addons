#!/usr/bin/env node
/**
 * Valide tous les plugins du dépôt (ou ceux donnés en argument) : manifeste, fichiers et textes par le validateur
 * du SDK (`mire-plugin validate`), puis les règles du dépôt (dossier, package.json, contenu du paquet).
 * Code de sortie : 0 si tout est valide, 1 sinon.
 */
import path from 'node:path';
import { listPluginDirs, loadPlugin, readRepositoryConfig } from './lib/plugins.mjs';

async function main(args) {
  const { official } = await readRepositoryConfig();
  const dirs = args.length ? args.map((a) => path.resolve(a)) : await listPluginDirs();
  if (dirs.length === 0) {
    console.error('Aucun plugin dans plugins/.');
    return 1;
  }
  const ids = new Map();
  let failed = 0;
  for (const dir of dirs) {
    const name = path.basename(dir);
    const r = await loadPlugin(dir, { official });
    if (r.manifest && ids.has(r.manifest.id)) r.issues.push({ code: 'duplicate-id', path: 'id', message: `Identifiant déjà pris par ${ids.get(r.manifest.id)}.` });
    if (r.manifest) ids.set(r.manifest.id, name);
    if (r.ok && r.issues.length === 0) {
      console.log(`✓ ${name} ${r.manifest.version}`);
      continue;
    }
    failed++;
    console.error(`✗ ${name}`);
    for (const i of r.issues) console.error(`  ${i.path || '(manifeste)'} [${i.code}] ${i.message}`);
  }
  console.log(`${dirs.length - failed}/${dirs.length} plugin(s) valide(s).`);
  return failed ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
