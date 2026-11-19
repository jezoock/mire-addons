import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { keyId } from '../scripts/lib/index-file.mjs';
import { ROOT } from '../scripts/lib/plugins.mjs';
import { insideRepo, PRIVATE_FILE, PUBLIC_FILE } from '../scripts/keygen.mjs';
import { checkCommittedKey, signingKeyFromEnv } from '../scripts/publish.mjs';
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

  it('la clé du secret doit correspondre à une clé publique de keys/ quand il y en a', async () => {
    const dir = tempDir();
    const a = generateKeyPairSync('ed25519');
    const b = generateKeyPairSync('ed25519');
    assert.equal(await checkCommittedKey(a.privateKey, dir), null);
    writeFileSync(path.join(dir, 'officielle.pub.pem'), a.publicKey.export({ type: 'spki', format: 'pem' }));
    assert.equal(await checkCommittedKey(signingKeyFromEnv({ MIRE_ADDONS_SIGNING_KEY: pem(a.privateKey) }), dir), keyId(a.publicKey));
    await assert.rejects(checkCommittedKey(b.privateKey, dir), /ne correspond à aucune clé publique/);
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
