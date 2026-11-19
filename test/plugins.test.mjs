import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { listPluginDirs, loadPlugin, parseReleaseTag, releaseTag, ROOT } from '../scripts/lib/plugins.mjs';
import { tempDir, writePlugin } from './helpers.mjs';

const codes = (r) => r.issues.map((i) => i.code);

describe('plugins du dépôt', () => {
  it('chaque plugin de plugins/ est valide pour le dépôt officiel', async () => {
    const dirs = await listPluginDirs();
    assert.ok(dirs.length > 0);
    for (const dir of dirs) {
      const r = await loadPlugin(dir, { official: true });
      assert.deepEqual(r.issues, [], path.basename(dir));
    }
  });

  it('npm run validate réussit', () => {
    execFileSync(process.execPath, ['scripts/validate.mjs'], { cwd: ROOT, stdio: 'pipe' });
  });
});

describe('règles d’un plugin', () => {
  const parent = tempDir();

  it('accepte un plugin de données complet et rassemble ses fichiers', async () => {
    const r = await loadPlugin(writePlugin(parent, { id: 'org.exemple.ok' }), { official: false });
    assert.equal(r.ok, true, JSON.stringify(r.issues));
    assert.deepEqual(r.files.map((f) => f.path), ['i18n/en.json', 'i18n/fr.json', 'mire-plugin.json', 'packs/p.json']);
  });

  it('passe d’abord par le validateur du SDK : code dans un plugin data, préfixe réservé', async () => {
    const code = writePlugin(parent, { id: 'org.exemple.code', edit: (m) => (m.contributes = { taggers: [{ id: 't', main: 'x.js' }] }) });
    assert.ok(codes(await loadPlugin(code, { official: false })).includes('code-in-data'));
    const mire = writePlugin(parent, { id: 'mire.exemple.tiers' });
    assert.deepEqual(codes(await loadPlugin(mire, { official: false })), ['reserved-prefix']);
    assert.equal((await loadPlugin(mire, { official: true })).ok, true);
  });

  it('exige le français pour le dépôt officiel seulement', async () => {
    const dir = writePlugin(parent, { id: 'org.exemple.anglais', edit: (_m, p) => (p.files = ['mire-plugin.json', 'i18n/en.json', 'packs/']) });
    assert.equal((await loadPlugin(dir, { official: false })).ok, true);
    assert.ok(codes(await loadPlugin(dir, { official: true })).includes('not-packaged'));
  });

  it('vérifie le dossier et le package.json', async () => {
    const dir = writePlugin(parent, { id: 'org.exemple.pkg', edit: (_m, p) => Object.assign(p, { name: 'autre', private: false, version: '2.0.0' }) });
    assert.deepEqual(codes(await loadPlugin(dir, { official: false })), ['package-name', 'package-private', 'package-version']);
    const sansFiles = writePlugin(parent, { id: 'org.exemple.files', edit: (_m, p) => delete p.files });
    assert.deepEqual(codes(await loadPlugin(sansFiles, { official: false })), ['package-files']);
    const mauvaisDossier = writePlugin(parent, { id: 'org.exemple.dossier', edit: (m) => (m.id = 'org.exemple.autre') });
    assert.ok(codes(await loadPlugin(mauvaisDossier, { official: false })).includes('folder-name'));
  });

  it('refuse un paquet sans les fichiers déclarés, avec un lien symbolique ou un chemin hors du plugin', async () => {
    const manque = writePlugin(parent, { id: 'org.exemple.manque', edit: (_m, p) => (p.files = ['i18n/']) });
    assert.deepEqual(codes(await loadPlugin(manque, { official: false })), ['not-packaged']);
    const lien = writePlugin(parent, { id: 'org.exemple.lien' });
    symlinkSync('/etc/hostname', path.join(lien, 'packs', 'lien.json'));
    assert.match((await loadPlugin(lien, { official: false })).issues[0].message, /Lien symbolique/);
    const dehors = writePlugin(parent, { id: 'org.exemple.dehors', edit: (_m, p) => p.files.push('../secret') });
    assert.deepEqual(codes(await loadPlugin(dehors, { official: false })), ['package-files']);
  });

  it('signale un package.json illisible', async () => {
    const dir = writePlugin(parent, { id: 'org.exemple.json' });
    writeFileSync(path.join(dir, 'package.json'), '{');
    assert.deepEqual(codes(await loadPlugin(dir, { official: false })), ['package-json']);
    mkdirSync(path.join(parent, 'vide'));
    assert.deepEqual(codes(await loadPlugin(path.join(parent, 'vide'), { official: false })), ['missing-manifest']);
  });
});

describe('étiquettes des versions', () => {
  it('s’écrivent <id>@<version> et se relisent', () => {
    assert.equal(releaseTag('org.a.b', '1.0.0-rc.1'), 'org.a.b@1.0.0-rc.1');
    assert.deepEqual(parseReleaseTag('org.a.b@1.0.0-rc.1'), { id: 'org.a.b', version: '1.0.0-rc.1' });
    assert.equal(parseReleaseTag('index'), null);
  });
});
