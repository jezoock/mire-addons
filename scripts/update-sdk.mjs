#!/usr/bin/env node
/**
 * Met à jour la copie de `@mire/plugin-sdk` (dossier `sdk/`) depuis un commit de jezoock/mire.
 *
 * Usage :
 *   node scripts/update-sdk.mjs <commit>                  récupère le commit sur GitHub (SHA complet)
 *   node scripts/update-sdk.mjs --from <dossier de Mire>  copie depuis un clone local (son commit courant)
 *
 * Le SDK est privé dans Mire et n'est pas publié sur npm : on en garde une copie versionnée, pour qu'un agent ou une
 * CI qui ne clone que ce dépôt puisse construire, tester et lire le contrat des plugins. Seuls `src/`, `schema/` et
 * `README.md` sont copiés ; `package.json` est réécrit pour pointer vers les sources TypeScript, que Node exécute
 * directement (suppression des types, Node 22.18 ou plus) : aucune construction, aucune dépendance.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SDK_DIR = path.join(ROOT, 'sdk');
const DEFAULT_REPO = 'https://github.com/jezoock/mire';
const SDK_PATH = 'packages/plugin-sdk';
const COPIED = ['src', 'schema', 'README.md'];

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** package.json de la copie : celui de Mire, avec les points d'entrée tournés vers les sources. */
export function vendoredPackage(upstream) {
  const { name, version, description, license, type, engines } = upstream;
  return {
    name,
    version,
    description,
    license,
    private: true,
    type,
    exports: {
      '.': './src/index.ts',
      './validate': './src/validate-dir.ts',
      './mire-plugin.schema.json': './schema/mire-plugin.schema.json',
      './package.json': './package.json',
    },
    bin: { 'mire-plugin': 'src/cli.ts' },
    engines,
  };
}

/**
 * Empreintes sha256 des fichiers copiés (chemins relatifs à `dir`, triés) : un test vérifie que la copie n'a pas
 * été modifiée à la main. On corrige le SDK dans Mire, puis on relance ce script.
 */
export function sdkFingerprints(dir = SDK_DIR) {
  const out = {};
  const walk = (rel) => {
    const abs = path.join(dir, rel);
    if (statSync(abs).isDirectory()) for (const e of readdirSync(abs).sort()) walk(rel ? `${rel}/${e}` : e);
    else out[rel] = createHash('sha256').update(readFileSync(abs)).digest('hex');
  };
  for (const entry of COPIED) walk(entry);
  return out;
}

/** Copie le SDK d'un clone de Mire (`mireDir`) vers `dest`, et note son origine. */
export function copySdk(mireDir, commit, repo, dest = SDK_DIR) {
  const src = path.join(mireDir, SDK_PATH);
  if (!existsSync(path.join(src, 'package.json'))) throw new Error(`${SDK_PATH} introuvable dans ${mireDir}.`);
  for (const entry of COPIED) rmSync(path.join(dest, entry), { recursive: true, force: true });
  for (const entry of COPIED) cpSync(path.join(src, entry), path.join(dest, entry), { recursive: true });
  const upstream = JSON.parse(readFileSync(path.join(src, 'package.json'), 'utf8'));
  // L'outil `mire-plugin` se lance directement (lien de node_modules/.bin) : il doit être exécutable.
  if (existsSync(path.join(dest, 'src', 'cli.ts'))) chmodSync(path.join(dest, 'src', 'cli.ts'), 0o755);
  writeFileSync(path.join(dest, 'package.json'), `${JSON.stringify(vendoredPackage(upstream), null, 2)}\n`);
  const source = { repository: repo, path: SDK_PATH, commit, version: upstream.version, files: sdkFingerprints(dest) };
  writeFileSync(path.join(dest, 'source.json'), `${JSON.stringify(source, null, 2)}\n`);
  return source;
}

function fetchCommit(repo, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Donnez le SHA complet (40 caractères) du commit de Mire.');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'mire-sdk-'));
  git(['init', '-q'], tmp);
  git(['fetch', '-q', '--depth', '1', repo, commit], tmp);
  git(['checkout', '-q', 'FETCH_HEAD', '--', SDK_PATH], tmp);
  return tmp;
}

function main(argv) {
  const fromIndex = argv.indexOf('--from');
  const repoIndex = argv.indexOf('--repo');
  const repo = repoIndex >= 0 ? argv[repoIndex + 1] : DEFAULT_REPO;
  if (fromIndex >= 0) {
    const dir = path.resolve(argv[fromIndex + 1] ?? '');
    const commit = git(['rev-parse', 'HEAD'], dir);
    if (git(['status', '--porcelain', '--', SDK_PATH], dir)) throw new Error(`${SDK_PATH} a des modifications non commitées dans ${dir}.`);
    return copySdk(dir, commit, repo);
  }
  const commit = argv.find((a) => !a.startsWith('--') && a !== repo);
  if (!commit) throw new Error('Usage : node scripts/update-sdk.mjs <commit> | --from <dossier de Mire>');
  const tmp = fetchCommit(repo, commit);
  try {
    return copySdk(tmp, commit, repo);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const s = main(process.argv.slice(2));
    console.log(`SDK ${s.version} copié depuis ${s.repository}@${s.commit}. Relancez npm install, npm run validate et npm test.`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
