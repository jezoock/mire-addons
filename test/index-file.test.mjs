import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  buildIndex,
  canonicalJson,
  checkIndexContent,
  compareVersions,
  keyId,
  loadPrivateKey,
  loadPublicKey,
  rawPublicKey,
  signedBytes,
  signIndex,
  verifyIndex,
  versionEntry,
} from '../scripts/lib/index-file.mjs';

const keys = () => generateKeyPairSync('ed25519');
const manifest = (version, extra = {}) => ({
  id: 'org.exemple.a',
  version,
  engines: { mire: '^1.0.0' },
  level: 'data',
  contributes: { packs: [{ id: 'p', file: 'p.json' }], themes: [] },
  i18n: 'i18n/',
  ...extra,
});
const entry = (version) =>
  versionEntry({
    manifest: manifest(version),
    catalogs: { en: { messages: { plugin: { name: 'A' } } }, fr: { messages: { plugin: { name: 'Un A', description: 'Desc' } } } },
    url: `https://github.com/o/r/releases/download/org.exemple.a%40${version}/org.exemple.a-${version}.tgz`,
    sha: 'a'.repeat(64),
    size: 10,
  });
const index = () =>
  buildIndex({
    repository: { name: { en: 'R' }, source: 'https://github.com/o/r', index: 'https://github.com/o/r/releases/download/index/index.json' },
    generated: '2026-11-19T12:00:00.000Z',
    versions: ['1.0.0', '1.10.0', '1.2.0', '2.0.0-beta.1'].map((v) => ({ id: 'org.exemple.a', entry: entry(v) })),
  });

describe('JSON canonique', () => {
  it('trie les clés, sans espace, et ignore les champs non définis', () => {
    assert.equal(canonicalJson({ b: [1, 'é', true, null], a: { d: 1, c: undefined } }), '{"a":{"d":1},"b":[1,"é",true,null]}');
  });
  it('refuse les nombres non entiers et les types inconnus', () => {
    assert.throws(() => canonicalJson({ a: 1.5 }), /entier/);
    assert.throws(() => canonicalJson({ a: () => 1 }));
  });
});

describe('versions', () => {
  it('suit l’ordre semver', () => {
    const sorted = ['1.0.0', '1.10.0', '1.2.0', '1.0.0-rc.1', '1.0.0-alpha', '1.0.0-alpha.2', '1.0.0-alpha.10', '1.0.0-beta'].sort(compareVersions);
    assert.deepEqual(sorted, ['1.0.0-alpha', '1.0.0-alpha.2', '1.0.0-alpha.10', '1.0.0-beta', '1.0.0-rc.1', '1.0.0', '1.2.0', '1.10.0']);
    assert.equal(compareVersions('1.0.0+abc', '1.0.0'), 0);
  });
});

describe('index', () => {
  it('décrit chaque version : nom, version, empreinte, adresse, niveau, permissions, dépendances, textes', () => {
    const i = index();
    assert.deepEqual(i.plugins[0].versions.map((v) => v.version), ['2.0.0-beta.1', '1.10.0', '1.2.0', '1.0.0']);
    const v = i.plugins[0].versions[0];
    assert.deepEqual(v.contributes, ['packs']);
    assert.deepEqual(v.name, { en: 'A', fr: 'Un A' });
    assert.deepEqual(v.description, { fr: 'Desc' });
    assert.deepEqual(v.permissions, {});
    assert.deepEqual(v.dependencies, {});
    assert.equal(v.package.sha256, 'a'.repeat(64));
    assert.deepEqual(checkIndexContent(i, { official: false }), []);
  });

  it('refuse une version en double, une empreinte ou une adresse invalide', () => {
    const v = { id: 'org.exemple.a', entry: entry('1.0.0') };
    assert.throws(() => buildIndex({ repository: {}, generated: 'x', versions: [v, v] }), /double/);
    assert.throws(() => versionEntry({ manifest: manifest('1.0.0'), catalogs: {}, url: 'https://x/y', sha: 'zz', size: 1 }), /Empreinte/);
    assert.throws(() => versionEntry({ manifest: manifest('1.0.0'), catalogs: {}, url: 'http://x/y', sha: 'a'.repeat(64), size: 1 }), /Adresse/);
  });

  it('signale le préfixe mire. hors du dépôt officiel et les champs mal formés', () => {
    const i = index();
    i.plugins[0].id = 'mire.a';
    assert.match(checkIndexContent(i).join(), /réservé/);
    assert.deepEqual(checkIndexContent(i, { official: true }), []);
    i.plugins[0].versions[0].package.url = 'http://non.chiffre/x.tgz';
    i.plugins[0].versions[1].package.size = 0;
    assert.equal(checkIndexContent(i, { official: true }).length, 2);
  });
});

describe('signature', () => {
  it('signe et vérifie ; l’identifiant de clé est le sha256 de la clé brute', () => {
    const { privateKey, publicKey } = keys();
    const signed = signIndex(index(), privateKey);
    assert.equal(signed.signature.keyId, keyId(publicKey));
    assert.equal(rawPublicKey(publicKey).length, 32);
    assert.equal(verifyIndex(signed, publicKey), signed);
    // L'ordre des clés et la mise en forme du fichier ne comptent pas.
    assert.ok(verifyIndex(JSON.parse(JSON.stringify(signed, null, 4)), publicKey));
  });

  it('refuse un index altéré : nom, version, empreinte, adresse', () => {
    const { privateKey, publicKey } = keys();
    const alter = [
      (i) => (i.plugins[0].id = 'org.exemple.b'),
      (i) => (i.plugins[0].versions[0].version = '9.0.0'),
      (i) => (i.plugins[0].versions[0].package.sha256 = 'b'.repeat(64)),
      (i) => (i.plugins[0].versions[0].package.url = 'https://ailleurs.example/x.tgz'),
      (i) => (i.plugins[0].versions[0].level = 'privileged'),
      (i) => (i.generated = '2030-01-01T00:00:00.000Z'),
    ];
    for (const change of alter) {
      const signed = structuredClone(signIndex(index(), privateKey));
      change(signed);
      assert.throws(() => verifyIndex(signed, publicKey), /invalide/);
    }
  });

  it('refuse un index signé par une autre clé, non signé ou d’un format inconnu', () => {
    const a = keys();
    const b = keys();
    assert.throws(() => verifyIndex(signIndex(index(), a.privateKey), b.publicKey), /autre clé/);
    assert.throws(() => verifyIndex(index(), a.publicKey), /non signé/);
    const forged = { ...signIndex(index(), a.privateKey), signature: { ...signIndex(index(), b.privateKey).signature, keyId: keyId(a.publicKey) } };
    assert.throws(() => verifyIndex(forged, a.publicKey), /invalide/);
    assert.throws(() => verifyIndex(signIndex({ ...index(), format: 2 }, a.privateKey), a.publicKey), /Format/);
  });

  it('signe un en-tête de contexte avant l’index canonique', () => {
    assert.match(signedBytes({ b: 1, a: 2, signature: { x: 1 } }).toString(), /^mire-addons-index:1\n\{"a":2,"b":1\}$/);
  });
});

describe('clés', () => {
  it('lit une clé privée PKCS#8 PEM et une clé publique PEM ou base64', () => {
    const { privateKey, publicKey } = keys();
    const priv = loadPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
    assert.equal(keyId(priv), keyId(publicKey));
    assert.equal(keyId(loadPublicKey(publicKey.export({ type: 'spki', format: 'pem' }))), keyId(publicKey));
    assert.equal(keyId(loadPublicKey(rawPublicKey(publicKey).toString('base64'))), keyId(publicKey));
  });

  it('refuse une clé illisible ou qui n’est pas ed25519', () => {
    assert.throws(() => loadPrivateKey('pas une clé'), /PKCS#8/);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 });
    assert.throws(() => loadPrivateKey(rsa.privateKey.export({ type: 'pkcs8', format: 'pem' })), /ed25519/);
    assert.throws(() => loadPublicKey(rsa.publicKey.export({ type: 'spki', format: 'pem' })), /ed25519/);
    assert.throws(() => loadPublicKey('QUJD'), /illisible/);
  });
});
