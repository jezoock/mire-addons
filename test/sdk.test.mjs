import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CONTRIBUTION_KINDS, validateManifest } from '@mire/plugin-sdk';
import { validatePluginDir } from '@mire/plugin-sdk/validate';
import { ROOT } from '../scripts/lib/plugins.mjs';
import { copySdk, sdkFingerprints, vendoredPackage } from '../scripts/update-sdk.mjs';
import { tempDir, writePlugin } from './helpers.mjs';

const source = JSON.parse(readFileSync(path.join(ROOT, 'sdk', 'source.json'), 'utf8'));

describe('copie de @mire/plugin-sdk', () => {
  it('vient d’un commit précis de Mire et n’a pas été modifiée à la main', () => {
    assert.match(source.commit, /^[0-9a-f]{40}$/);
    assert.deepEqual(sdkFingerprints(), source.files, 'sdk/ diffère de sa copie : corriger le SDK dans Mire, puis npm run update-sdk');
  });

  it('s’importe et valide sans construction ni dépendance', async () => {
    assert.ok(CONTRIBUTION_KINDS.includes('packs'));
    assert.equal(validateManifest({}).ok, false);
    const dir = writePlugin(tempDir(), { id: 'org.exemple.sdk' });
    assert.deepEqual((await validatePluginDir(dir)).issues, []);
  });

  it('fournit l’outil mire-plugin aux espaces de travail', () => {
    const bin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'mire-plugin.cmd' : 'mire-plugin');
    const ok = execFileSync(bin, ['validate', 'plugins/mire.exemple.donnees', '--official'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
    assert.match(ok, /plugin valide/);
    assert.equal(spawnSync(bin, ['validate', 'plugins/mire.exemple.donnees'], { cwd: ROOT, shell: process.platform === 'win32' }).status, 1);
  });
});

describe('mise à jour de la copie', () => {
  it('copie src/, schema/ et le README, et réécrit package.json vers les sources', () => {
    const mire = tempDir();
    const sdk = path.join(mire, 'packages', 'plugin-sdk');
    mkdirSync(path.join(sdk, 'src'), { recursive: true });
    mkdirSync(path.join(sdk, 'schema'));
    mkdirSync(path.join(sdk, 'dist'));
    writeFileSync(path.join(sdk, 'src', 'index.ts'), 'export {};\n');
    writeFileSync(path.join(sdk, 'schema', 's.json'), '{}');
    writeFileSync(path.join(sdk, 'dist', 'index.js'), '');
    writeFileSync(path.join(sdk, 'README.md'), '# SDK\n');
    writeFileSync(path.join(sdk, 'package.json'), JSON.stringify({ name: '@mire/plugin-sdk', version: '9.9.9', type: 'module', scripts: { build: 'tsc' } }));
    const dest = tempDir();
    writeFileSync(path.join(dest, 'ancien.txt'), '');
    const s = copySdk(mire, 'a'.repeat(40), 'https://github.com/jezoock/mire', dest);
    assert.equal(s.version, '9.9.9');
    assert.deepEqual(Object.keys(s.files), ['src/index.ts', 'schema/s.json', 'README.md']);
    const pkg = JSON.parse(readFileSync(path.join(dest, 'package.json'), 'utf8'));
    assert.equal(pkg.exports['.'], './src/index.ts');
    assert.equal(pkg.scripts, undefined);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dest, 'source.json'), 'utf8')).files, s.files);
  });

  it('garde nom, version, licence et engines du paquet de Mire', () => {
    const p = vendoredPackage({ name: '@mire/plugin-sdk', version: '1.0.0', license: 'MIT', type: 'module', engines: { node: '>=22' }, devDependencies: { x: '1' } });
    assert.equal(p.private, true);
    assert.equal(p.devDependencies, undefined);
    assert.deepEqual(p.bin, { 'mire-plugin': 'src/cli.ts' });
  });
});
