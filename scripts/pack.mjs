#!/usr/bin/env node
/**
 * Empaquette chaque plugin valide en `dist/packages/<id>-<version>.tgz` et écrit les empreintes sha256 dans
 * `dist/packages/SHA256SUMS` (format de `sha256sum`). Refuse d'empaqueter si un plugin est invalide.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './lib/index-file.mjs';
import { isMain, listPluginDirs, loadPlugin, packageFileName, readRepositoryConfig, ROOT } from './lib/plugins.mjs';
import { createTgz } from './lib/tar.mjs';

export const PACKAGES_DIR = path.join(ROOT, 'dist', 'packages');

/** Empaquette les plugins de `dirs` dans `out` ; rend [{ id, version, file, sha256, size, tgz, files }]. */
export async function packAll(dirs, out, { official }) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const built = [];
  for (const dir of dirs) {
    const r = await loadPlugin(dir, { official });
    if (!r.ok) throw new Error(`${path.basename(dir)} est invalide : lancez npm run validate.`);
    const tgz = createTgz(r.files);
    const file = packageFileName(r.manifest.id, r.manifest.version);
    await writeFile(path.join(out, file), tgz);
    built.push({ id: r.manifest.id, version: r.manifest.version, file, sha256: sha256(tgz), size: tgz.length, tgz, files: r.files });
  }
  await writeFile(path.join(out, 'SHA256SUMS'), built.map((b) => `${b.sha256}  ${b.file}\n`).join(''));
  return built;
}

async function main() {
  const { official } = await readRepositoryConfig();
  const built = await packAll(await listPluginDirs(), PACKAGES_DIR, { official });
  for (const b of built) console.log(`${b.sha256}  ${b.file} (${b.size} octets)`);
  console.log(`${built.length} paquet(s) dans ${path.relative(ROOT, PACKAGES_DIR)}/.`);
}

if (isMain(import.meta.url)) {
  try {
    await main();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
