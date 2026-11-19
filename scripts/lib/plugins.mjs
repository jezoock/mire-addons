/**
 * Plugins du dépôt : un dossier par plugin dans `plugins/`, nommé d'après son identifiant, avec son manifeste
 * (`mire-plugin.json`) et son `package.json` d'espace de travail npm. Ce module vérifie les règles propres au dépôt
 * (le contrat du manifeste est vérifié par le SDK) et rassemble les fichiers qui partent dans le paquet.
 */
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { declaredFiles, MANIFEST_FILE } from '@mire/plugin-sdk';
import { validatePluginDir } from '@mire/plugin-sdk/validate';
import { isArchivePath } from './tar.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const PLUGINS_DIR = path.join(ROOT, 'plugins');

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const issue = (code, where, message) => ({ code, path: where, message });

/** Réglages du dépôt (`repository.json`) : nom affiché et mode officiel (préfixe `mire.`, textes français). */
export async function readRepositoryConfig(root = ROOT) {
  const cfg = await readJson(path.join(root, 'repository.json'));
  if (typeof cfg?.name?.en !== 'string' || typeof cfg.official !== 'boolean') {
    throw new Error('repository.json : « name.en » (texte) et « official » (oui/non) sont obligatoires.');
  }
  return cfg;
}

/** Dossiers de plugins (`plugins/*`), triés. */
export async function listPluginDirs(pluginsDir = PLUGINS_DIR) {
  const entries = await readdir(pluginsDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(pluginsDir, e.name))
    .sort();
}

/**
 * Fichiers du paquet : ceux que liste `files` dans le `package.json` du plugin (fichiers ou dossiers), plus le
 * manifeste. Liens symboliques et chemins hors du plugin refusés.
 */
export async function collectFiles(dir, pkg) {
  const out = new Map();
  const add = async (rel) => {
    const abs = path.join(dir, rel);
    const st = await lstat(abs).catch(() => null);
    if (!st) throw new Error(`« files » : ${rel} est introuvable.`);
    if (st.isSymbolicLink()) throw new Error(`Lien symbolique refusé : ${rel}`);
    if (st.isDirectory()) {
      for (const e of await readdir(abs)) await add(`${rel}/${e}`);
    } else if (st.isFile()) {
      if (!isArchivePath(rel)) throw new Error(`Chemin refusé : ${rel}`);
      out.set(rel, await readFile(abs));
    } else throw new Error(`Ni un fichier ni un dossier : ${rel}`);
  };
  for (const entry of new Set([MANIFEST_FILE, ...pkg.files])) {
    const rel = entry.replace(/\/+$/, '');
    if (!isArchivePath(rel)) throw new Error(`« files » : chemin refusé : ${entry}`);
    await add(rel);
  }
  return [...out].map(([p, data]) => ({ path: p, data })).sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Règles du dépôt sur le `package.json` d'un plugin. */
function checkPackageJson(pkg, manifest, folder) {
  const issues = [];
  if (folder !== manifest.id) issues.push(issue('folder-name', 'plugins/', `Le dossier doit porter l'identifiant du plugin : ${manifest.id}.`));
  if (pkg.name !== manifest.id) issues.push(issue('package-name', 'package.json#name', `« name » doit valoir « ${manifest.id} ».`));
  if (pkg.private !== true) issues.push(issue('package-private', 'package.json#private', '« private » doit valoir true : un plugin ne se publie pas sur npm.'));
  if (pkg.version !== undefined && pkg.version !== manifest.version) {
    issues.push(issue('package-version', 'package.json#version', 'La version se règle dans mire-plugin.json ; retirez-la de package.json ou alignez-la.'));
  }
  if (!Array.isArray(pkg.files) || pkg.files.length === 0 || !pkg.files.every((f) => typeof f === 'string')) {
    issues.push(issue('package-files', 'package.json#files', '« files » liste les fichiers et dossiers du paquet.'));
  }
  return issues;
}

/** Le paquet contient le manifeste, les fichiers déclarés et les textes. */
function checkPackageContent(files, manifest, official) {
  const names = new Set(files.map((f) => f.path));
  const i18n = manifest.i18n.replace(/\/+$/, '');
  const needed = [...declaredFiles(manifest).map((d) => d.file), `${i18n}/en.json`, ...(official ? [`${i18n}/fr.json`] : [])];
  return needed.filter((f) => !names.has(f)).map((f) => issue('not-packaged', 'package.json#files', `${f} n'est pas dans « files » : il manquerait au paquet.`));
}

/**
 * Lit et vérifie un plugin du dépôt : SDK (manifeste, fichiers, textes), puis règles du dépôt et contenu du paquet.
 * Rend { ok, issues, manifest, pkg, files }.
 */
export async function loadPlugin(dir, { official }) {
  const result = await validatePluginDir(dir, { official });
  if (!result.ok) return { ok: false, issues: result.issues };
  const manifest = await readJson(path.join(dir, MANIFEST_FILE));
  const pkg = await readJson(path.join(dir, 'package.json')).catch((err) => ({ __error: err.message }));
  if (pkg.__error) return { ok: false, issues: [issue('package-json', 'package.json', `package.json illisible (${pkg.__error}).`)], manifest };
  const issues = checkPackageJson(pkg, manifest, path.basename(dir));
  if (issues.length) return { ok: false, issues, manifest, pkg };
  let files;
  try {
    files = await collectFiles(dir, pkg);
  } catch (err) {
    return { ok: false, issues: [issue('package-files', 'package.json#files', err.message)], manifest, pkg };
  }
  issues.push(...checkPackageContent(files, manifest, official));
  return { ok: issues.length === 0, issues, manifest, pkg, files };
}

/** Nom du paquet d'une version : `<id>-<version>.tgz`. */
export const packageFileName = (id, version) => `${id}-${version}.tgz`;

/** Étiquette (et Release GitHub) d'une version publiée : `<id>@<version>`. */
export const releaseTag = (id, version) => `${id}@${version}`;

/** Lit une étiquette `<id>@<version>` ; null pour une autre étiquette (celle de l'index, par exemple). */
export function parseReleaseTag(tag) {
  const at = tag.indexOf('@');
  if (at <= 0) return null;
  return { id: tag.slice(0, at), version: tag.slice(at + 1) };
}

/** Vrai si le module d'adresse `url` est le script lancé (`node scripts/x.mjs`), pas un module importé. */
export const isMain = (url) => Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(url);
