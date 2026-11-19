import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createTar, createTgz, isArchivePath, readTar, readTgz } from '../scripts/lib/tar.mjs';
import { tempDir } from './helpers.mjs';

const files = [
  { path: 'mire-plugin.json', data: Buffer.from('{"id":"a.b"}') },
  { path: 'i18n/en.json', data: Buffer.from('{}') },
  { path: 'vide.txt', data: Buffer.alloc(0) },
  { path: 'gros.bin', data: Buffer.alloc(1300, 7) },
];

describe('archives des plugins', () => {
  it('relit exactement ce qu’elle a écrit, fichiers triés', () => {
    const out = readTgz(createTgz(files));
    assert.deepEqual(out.map((f) => f.path), ['gros.bin', 'i18n/en.json', 'mire-plugin.json', 'vide.txt']);
    for (const f of files) assert.ok(out.find((o) => o.path === f.path).data.equals(f.data));
  });

  it('est déterministe : même contenu, mêmes octets, quel que soit l’ordre donné', () => {
    assert.ok(createTgz(files).equals(createTgz([...files].reverse())));
    assert.equal(createTgz(files)[9], 255);
  });

  it('se lit avec tar du système', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'p.tgz'), createTgz(files));
    execFileSync('tar', ['xzf', 'p.tgz'], { cwd: dir });
    assert.equal(readFileSync(path.join(dir, 'i18n', 'en.json'), 'utf8'), '{}');
    assert.ok(readdirSync(dir).includes('gros.bin'));
  });

  it('refuse les chemins dangereux à l’écriture', () => {
    for (const p of ['../x', '/etc/x', 'a/../b', 'a\\b', 'c:x', './a', 'a//b', 'x'.repeat(101)]) {
      assert.equal(isArchivePath(p), false, p);
      assert.throws(() => createTar([{ path: p, data: Buffer.from('') }]));
    }
    assert.throws(() => createTar([files[0], files[0]]), /double/);
  });

  /** En-tête ustar écrit à la main, pour fabriquer des archives hostiles. */
  function rawEntry(name, type, data = Buffer.alloc(0)) {
    const tar = createTar([{ path: 'x', data }]).subarray(0, 512 + Math.ceil(data.length / 512) * 512);
    const h = Buffer.from(tar.subarray(0, 512));
    h.fill(0, 0, 100);
    h.write(name, 0);
    h[156] = type.charCodeAt(0);
    h.fill(32, 148, 156);
    const sum = h.reduce((a, b) => a + b, 0);
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    return Buffer.concat([h, tar.subarray(512)]);
  }
  const end = Buffer.alloc(1024);

  it('refuse à la lecture liens, dossiers, chemins dangereux et archives tronquées', () => {
    assert.throws(() => readTar(Buffer.concat([rawEntry('lien', '2'), end])), /fichier ordinaire/);
    assert.throws(() => readTar(Buffer.concat([rawEntry('dossier/', '5'), end])), /fichier ordinaire/);
    assert.throws(() => readTar(Buffer.concat([rawEntry('../evasion', '0'), end])), /Chemin refusé/);
    assert.throws(() => readTar(Buffer.concat([rawEntry('a', '0'), rawEntry('a', '0'), end])), /Chemin refusé/);
    assert.throws(() => readTar(rawEntry('a', '0', Buffer.alloc(600))), /tronquée/);
    assert.throws(() => readTar(createTar(files).subarray(0, 700)), /tronquée/);
  });

  it('refuse une somme de contrôle altérée', () => {
    const tar = createTar(files);
    tar[0] ^= 1;
    assert.throws(() => readTar(tar), /contrôle/);
    assert.throws(() => readTgz(gzipSync(Buffer.from('pas un tar'))));
  });
});
