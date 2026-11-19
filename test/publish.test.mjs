import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readPackage, sha256, verifyIndex } from '../scripts/lib/index-file.mjs';
import { publish } from '../scripts/lib/publish.mjs';
import { FolderStore } from '../scripts/lib/store.mjs';
import { createTgz, readTgz } from '../scripts/lib/tar.mjs';
import { packAll } from '../scripts/pack.mjs';
import { tempDir, writePlugin } from './helpers.mjs';

const NAME = { en: 'Test repository' };

/** Dépôt d'essai : plugins écrits dans un dossier, publiés dans un autre. */
function setup() {
  const root = tempDir();
  const plugins = path.join(root, 'plugins');
  const store = new FolderStore({ dir: path.join(root, 'releases'), repo: 'exemple/depot' });
  return { root, plugins, store, out: path.join(root, 'dist') };
}

async function run(ctx, { dirs, privateKey, now }) {
  const built = await packAll(dirs, ctx.out, { official: false });
  return publish({ store: ctx.store, built, privateKey, official: false, repositoryName: NAME, now });
}

const readIndex = (ctx) => JSON.parse(readFileSync(path.join(ctx.store.dir, 'index', 'index.json'), 'utf8'));

describe('chaîne de publication', () => {
  it('publie les paquets et un index signé qui décrit exactement les octets publiés', async () => {
    const ctx = setup();
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const dirs = [writePlugin(ctx.plugins, { id: 'org.exemple.a' }), writePlugin(ctx.plugins, { id: 'org.exemple.b', version: '0.1.0' })];
    await run(ctx, { dirs, privateKey });
    const index = verifyIndex(readIndex(ctx), publicKey);
    assert.deepEqual(index.plugins.map((p) => p.id), ['org.exemple.a', 'org.exemple.b']);
    assert.equal(index.repository.index, 'https://github.com/exemple/depot/releases/download/index/index.json');
    const v = index.plugins[0].versions[0];
    assert.equal(v.package.url, 'https://github.com/exemple/depot/releases/download/org.exemple.a%401.0.0/org.exemple.a-1.0.0.tgz');
    const data = readFileSync(path.join(ctx.store.dir, 'org.exemple.a@1.0.0', 'org.exemple.a-1.0.0.tgz'));
    assert.equal(v.package.sha256, sha256(data));
    assert.equal(v.package.size, data.length);
    assert.equal(readPackage(readTgz(data), { id: 'org.exemple.a', version: '1.0.0', official: false }).manifest.level, 'data');
  });

  it('garde les anciennes versions et ajoute la nouvelle', async () => {
    const ctx = setup();
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    await run(ctx, { dirs: [writePlugin(ctx.plugins, { id: 'org.exemple.a' })], privateKey });
    const other = path.join(ctx.root, 'v2');
    await run(ctx, { dirs: [writePlugin(other, { id: 'org.exemple.a', version: '1.1.0' })], privateKey });
    const index = verifyIndex(readIndex(ctx), publicKey);
    assert.deepEqual(index.plugins[0].versions.map((v) => v.version), ['1.1.0', '1.0.0']);
  });

  it('republie sans rien changer quand le contenu est identique', async () => {
    const ctx = setup();
    const { privateKey } = generateKeyPairSync('ed25519');
    const dirs = [writePlugin(ctx.plugins, { id: 'org.exemple.a' })];
    await run(ctx, { dirs, privateKey });
    const first = readFileSync(path.join(ctx.store.dir, 'org.exemple.a@1.0.0', 'org.exemple.a-1.0.0.tgz'));
    await run(ctx, { dirs, privateKey });
    assert.ok(first.equals(readFileSync(path.join(ctx.store.dir, 'org.exemple.a@1.0.0', 'org.exemple.a-1.0.0.tgz'))));
  });

  it('refuse une version déjà publiée dont le contenu a changé', async () => {
    const ctx = setup();
    const { privateKey } = generateKeyPairSync('ed25519');
    const dir = writePlugin(ctx.plugins, { id: 'org.exemple.a' });
    await run(ctx, { dirs: [dir], privateKey });
    writeFileSync(path.join(dir, 'packs', 'p.json'), '{"channels":[1]}');
    await assert.rejects(run(ctx, { dirs: [dir], privateKey }), /déjà publié avec un autre contenu/);
  });

  it('ne signe pas un paquet publié altéré ou incohérent avec son étiquette', async () => {
    const ctx = setup();
    const { privateKey } = generateKeyPairSync('ed25519');
    // Un paquet publié à la main sous une étiquette qui ne correspond pas à son manifeste.
    const dir = writePlugin(ctx.plugins, { id: 'org.exemple.a' });
    const [built] = await packAll([dir], ctx.out, { official: false });
    mkdirSync(path.join(ctx.store.dir, 'org.exemple.a@2.0.0'), { recursive: true });
    writeFileSync(path.join(ctx.store.dir, 'org.exemple.a@2.0.0', 'org.exemple.a-2.0.0.tgz'), built.tgz);
    await assert.rejects(run(ctx, { dirs: [], privateKey }), /contient org.exemple.a 1.0.0/);
    // Un paquet dont le manifeste est invalide (niveau data avec du code).
    const bad = createTgz([{ path: 'mire-plugin.json', data: Buffer.from(JSON.stringify({ ...JSON.parse(built.files.find((f) => f.path === 'mire-plugin.json').data), version: '2.0.0', contributes: { taggers: [{ id: 't', main: 'x.js' }] } })) }]);
    writeFileSync(path.join(ctx.store.dir, 'org.exemple.a@2.0.0', 'org.exemple.a-2.0.0.tgz'), bad);
    await assert.rejects(run(ctx, { dirs: [], privateKey }), /manifeste du paquet invalide/);
  });

  it('refuse une Release sans paquet', async () => {
    const ctx = setup();
    const { privateKey } = generateKeyPairSync('ed25519');
    mkdirSync(path.join(ctx.store.dir, 'org.exemple.a@1.0.0'), { recursive: true });
    await assert.rejects(run(ctx, { dirs: [writePlugin(ctx.plugins, { id: 'org.exemple.a' })], privateKey }), /sans le paquet/);
  });

  it('n’empaquette pas un plugin invalide', async () => {
    const ctx = setup();
    const dir = writePlugin(ctx.plugins, { id: 'mire.exemple.a' });
    await assert.rejects(packAll([dir], ctx.out, { official: false }), /invalide/);
  });
});
