import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { keyId, loadPublicKey } from '../scripts/lib/index-file.mjs';
import { ROOT } from '../scripts/lib/plugins.mjs';
import { insideRepo, PRIVATE_FILE, PUBLIC_FILE } from '../scripts/keygen.mjs';
import { checkCommittedKey, COMMITTED_KEY, signingKeyFromEnv } from '../scripts/publish.mjs';
import { tempDir } from './helpers.mjs';

const pem = (k) => k.export({ type: 'pkcs8', format: 'pem' });

describe('clé de signature de la CI', () => {
  it('sans le secret, la publication s’arrête avec un message clair', () => {
    for (const env of [{}, { MIRE_ADDONS_SIGNING_KEY: '' }, { MIRE_ADDONS_SIGNING_KEY: '  \n' }]) {
      assert.throws(() => signingKeyFromEnv(env), /MIRE_ADDONS_SIGNING_KEY est absent.*Secrets and variables → Actions/s);
    }
  });

  it('le script de publication échoue sans le secret, avant tout accès au réseau, sans afficher de clé', () => {
    const env = { ...process.env, MIRE_ADDONS_SIGNING_KEY: '', GITHUB_REPOSITORY: 'exemple/depot', GH_TOKEN: '' };
    const r = spawnSync(process.execPath, ['scripts/publish.mjs'], { cwd: ROOT, env, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^::error::Le secret MIRE_ADDONS_SIGNING_KEY est absent/);
  });

  it('une clé mal formée est refusée sans être recopiée dans le message', () => {
    const secret = 'NE-PAS-AFFICHER-1234';
    assert.throws(() => signingKeyFromEnv({ MIRE_ADDONS_SIGNING_KEY: secret }), (err) => !err.message.includes(secret));
  });

  it('la clé du secret doit être identique à la clé publique versionnée', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'officielle.pub.pem');
    const a = generateKeyPairSync('ed25519');
    writeFileSync(file, a.publicKey.export({ type: 'spki', format: 'pem' }));
    const fromEnv = signingKeyFromEnv({ MIRE_ADDONS_SIGNING_KEY: pem(a.privateKey) });
    assert.equal(await checkCommittedKey(fromEnv, file), keyId(a.publicKey));
  });

  it('une autre clé que la versionnée arrête la publication, avec les empreintes et sans clé privée', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'officielle.pub.pem');
    const a = generateKeyPairSync('ed25519');
    const b = generateKeyPairSync('ed25519');
    writeFileSync(file, a.publicKey.export({ type: 'spki', format: 'pem' }));
    const privatePem = pem(b.privateKey);
    const body = privatePem.split('\n')[1];
    await assert.rejects(checkCommittedKey(signingKeyFromEnv({ MIRE_ADDONS_SIGNING_KEY: privatePem }), file), (err) => {
      assert.match(err.message, /n'est pas la clé publique versionnée/);
      assert.ok(err.message.includes(keyId(a.publicKey)) && err.message.includes(keyId(b.publicKey)));
      assert.ok(!err.message.includes(body) && !err.message.includes('PRIVATE KEY'));
      return true;
    });
  });

  it('sans clé publique versionnée, ou illisible, on ne signe pas', async () => {
    const dir = tempDir();
    const key = generateKeyPairSync('ed25519').privateKey;
    await assert.rejects(checkCommittedKey(key, path.join(dir, 'absente.pub.pem')), /est absente du dépôt/);
    const bad = path.join(dir, 'mauvaise.pub.pem');
    writeFileSync(bad, 'pas une clé');
    await assert.rejects(checkCommittedKey(key, bad), /est illisible/);
  });

  it('le script de publication refuse une clé qui n’est pas la clé versionnée, avant tout accès au réseau', () => {
    const env = {
      ...process.env,
      MIRE_ADDONS_SIGNING_KEY: pem(generateKeyPairSync('ed25519').privateKey),
      GITHUB_REPOSITORY: 'exemple/depot',
      GH_TOKEN: '',
    };
    const r = spawnSync(process.execPath, ['scripts/publish.mjs'], { cwd: ROOT, env, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^::error::La clé du secret MIRE_ADDONS_SIGNING_KEY .* n'est pas la clé publique versionnée/);
    assert.ok(!r.stdout.includes('PRIVATE KEY') && !r.stderr.includes('PRIVATE KEY'));
  });

  it('la clé officielle versionnée est lisible et a l’empreinte annoncée', () => {
    const der = loadPublicKey(readFileSync(COMMITTED_KEY, 'utf8')).export({ type: 'spki', format: 'der' });
    assert.equal(createHash('sha256').update(der).digest('hex'), '37284e6151e1a56ee5d22da42cc545104168cb380ba1b66d5798ed46cf9dc993');
    assert.ok(readFileSync(path.join(ROOT, 'keys', 'README.md'), 'utf8').includes('37284e6151e1a56ee5d22da42cc545104168cb380ba1b66d5798ed46cf9dc993'));
  });

  it('la CI relit l’index publié avec la clé versionnée', () => {
    const ci = readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    assert.match(ci, /--key keys\/mire-addons-signing\.pub\.pem --packages/);
    assert.ok(!ci.includes('index-signing.pub.pem'));
  });
});

describe('création de la paire de clés', () => {
  it('écrit la paire hors du dépôt, clé privée en droits 600', () => {
    const dir = tempDir();
    const out = execFileSync(process.execPath, ['scripts/keygen.mjs', dir], { cwd: ROOT, encoding: 'utf8' });
    const priv = readFileSync(path.join(dir, PRIVATE_FILE), 'utf8');
    assert.match(priv, /^-----BEGIN PRIVATE KEY-----/);
    if (process.platform !== 'win32') assert.equal(statSync(path.join(dir, PRIVATE_FILE)).mode & 0o777, 0o600);
    assert.match(readFileSync(path.join(dir, PUBLIC_FILE), 'utf8'), /^-----BEGIN PUBLIC KEY-----/);
    const key = signingKeyFromEnv({ MIRE_ADDONS_SIGNING_KEY: priv });
    assert.ok(out.includes(keyId(key)));
    assert.ok(!out.includes('PRIVATE KEY'));
    // Ne remplace jamais une clé existante.
    assert.notEqual(spawnSync(process.execPath, ['scripts/keygen.mjs', dir], { cwd: ROOT }).status, 0);
  });

  it('refuse d’écrire dans le dépôt', () => {
    assert.equal(insideRepo(ROOT), true);
    assert.equal(insideRepo(path.join(ROOT, 'keys')), true);
    assert.equal(insideRepo(tempDir()), false);
    assert.notEqual(spawnSync(process.execPath, ['scripts/keygen.mjs', 'keys'], { cwd: ROOT }).status, 0);
  });
});
