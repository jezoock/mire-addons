/**
 * Où sont rangés les paquets publiés et l'index : les Releases GitHub du dépôt (publication réelle, par l'outil `gh`
 * de la CI), ou un dossier local qui en reproduit la forme (tests, dépôt de test pour Mire, essais d'un dépôt tiers).
 *
 * - une Release par version de plugin, d'étiquette `<id>@<version>`, avec le paquet `<id>-<version>.tgz` ;
 * - une Release d'étiquette `index`, dont l'asset `index.json` est remplacé à chaque publication. Son adresse,
 *   `https://github.com/<propriétaire>/<dépôt>/releases/download/index/index.json`, ne change jamais.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const INDEX_TAG = 'index';
export const INDEX_FILE = 'index.json';

const run = promisify(execFile);

/** Adresses publiques d'un dépôt GitHub (`propriétaire/dépôt`). */
export function githubUrls(repo) {
  const base = `https://github.com/${repo}`;
  const asset = (tag, file) => `${base}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
  return { source: base, asset, index: asset(INDEX_TAG, INDEX_FILE) };
}

/** Releases GitHub, par l'outil `gh` (authentifié par GH_TOKEN dans la CI). */
export class GitHubStore {
  constructor({ repo, target }) {
    this.repo = repo;
    this.target = target;
    this.urls = githubUrls(repo);
  }

  async gh(args) {
    const { stdout } = await run('gh', [...args, '--repo', this.repo].filter(Boolean), { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  }

  /** Releases publiées (pas les brouillons) : [{ tag, assets: [nom] }]. */
  async releases() {
    const { stdout } = await run('gh', ['api', '--paginate', '--slurp', `repos/${this.repo}/releases?per_page=100`], { maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(stdout)
      .flat()
      .filter((r) => !r.draft)
      .map((r) => ({ tag: r.tag_name, assets: r.assets.map((a) => a.name) }));
  }

  async download(tag, file) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mire-addons-'));
    try {
      await this.gh(['release', 'download', tag, '--pattern', file, '--dir', dir]);
      return await readFile(path.join(dir, file));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async withFile(file, data, fn) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mire-addons-'));
    try {
      await writeFile(path.join(dir, file), data);
      return await fn(path.join(dir, file));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async createRelease(tag, file, data, notes) {
    await this.withFile(file, data, (p) =>
      this.gh(['release', 'create', tag, p, '--title', tag, '--notes', notes, '--latest=false', this.target ? `--target=${this.target}` : '']),
    );
  }

  async publishIndex(data) {
    const exists = (await this.releases()).some((r) => r.tag === INDEX_TAG);
    const notes = `Index signé du dépôt, à l'adresse stable ${this.urls.index}. Remplacé à chaque publication.`;
    await this.withFile(INDEX_FILE, data, async (p) => {
      if (!exists) await this.gh(['release', 'create', INDEX_TAG, '--title', 'Index du dépôt', '--notes', notes, '--latest=false', this.target ? `--target=${this.target}` : '']);
      await this.gh(['release', 'upload', INDEX_TAG, p, '--clobber']);
    });
  }
}

/** Dossier local de même forme : `<dossier>/<étiquette>/<fichier>`. Les adresses sont celles du dépôt GitHub `repo`. */
export class FolderStore {
  constructor({ dir, repo }) {
    this.dir = dir;
    this.urls = githubUrls(repo);
  }

  async releases() {
    const entries = await readdir(this.dir, { withFileTypes: true }).catch(() => []);
    const out = [];
    for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      out.push({ tag: e.name, assets: (await readdir(path.join(this.dir, e.name))).sort() });
    }
    return out;
  }

  download(tag, file) {
    return readFile(path.join(this.dir, tag, file));
  }

  async createRelease(tag, file, data) {
    await mkdir(path.join(this.dir, tag), { recursive: true });
    await writeFile(path.join(this.dir, tag, file), data);
  }

  async publishIndex(data) {
    await this.createRelease(INDEX_TAG, INDEX_FILE, data);
  }
}
