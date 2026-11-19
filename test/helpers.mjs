// Outils communs aux tests : dossiers temporaires et plugins d'essai écrits sur le disque.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

/** Dossier temporaire supprimé à la fin du fichier de test. */
export function tempDir(prefix = 'mire-addons-test-') {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const catalog = (code, name) => ({ meta: { code, name: code, app: '1.0.0' }, messages: { plugin: { name } } });

/**
 * Écrit un plugin de données valide dans `<parent>/<id>/` ; `edit` modifie le manifeste et le package.json avant
 * écriture. Rend le dossier.
 */
export function writePlugin(parent, { id = 'org.exemple.essai', version = '1.0.0', edit = () => {} } = {}) {
  const dir = path.join(parent, id);
  const manifest = { id, version, engines: { mire: '^1.0.0' }, level: 'data', contributes: { packs: [{ id: 'p', file: 'packs/p.json' }] }, i18n: 'i18n/' };
  const pkg = { name: id, private: true, files: ['mire-plugin.json', 'i18n/', 'packs/'] };
  edit(manifest, pkg);
  mkdirSync(path.join(dir, 'i18n'), { recursive: true });
  mkdirSync(path.join(dir, 'packs'), { recursive: true });
  writeFileSync(path.join(dir, 'mire-plugin.json'), JSON.stringify(manifest));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  writeFileSync(path.join(dir, 'i18n', 'en.json'), JSON.stringify(catalog('en', 'Test plugin')));
  writeFileSync(path.join(dir, 'i18n', 'fr.json'), JSON.stringify(catalog('fr', 'Plugin d’essai')));
  writeFileSync(path.join(dir, 'packs', 'p.json'), JSON.stringify({ channels: [], sites: [], games: [] }));
  return dir;
}
