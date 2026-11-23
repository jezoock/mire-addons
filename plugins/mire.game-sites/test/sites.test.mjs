import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ID = 'mire.game-sites';
const dir = new URL('../', import.meta.url);
const lire = (rel) => JSON.parse(readFileSync(new URL(rel, dir), 'utf8'));
// Systèmes connus de Mire (@mire/shared, `SYSTEMS`) ; le plugin n'en ajoute pas.
const SYSTEMES = new Set([
  'Nintendo - Nintendo Entertainment System', 'Nintendo - Super Nintendo Entertainment System',
  'Nintendo - Game Boy', 'Nintendo - Game Boy Color', 'Nintendo - Game Boy Advance', 'Nintendo - Nintendo 64',
  'Nintendo - Nintendo DS', 'Nintendo - Nintendo 3DS', 'Nintendo - GameCube', 'Nintendo - Wii', 'Nintendo - Wii U',
  'Sega - Mega Drive - Genesis', 'Sega - Master System - Mark III', 'Sega - Game Gear', 'Sega - Saturn',
  'Sega - Dreamcast', 'Sony - PlayStation', 'Sony - PlayStation 2', 'Sony - PlayStation Portable',
  'NEC - PC Engine - TurboGrafx 16', 'Atari - 2600', 'SNK - Neo Geo Pocket Color',
]);
const HOTES = new Set(['hh.gbdev.io', 'db.universal-team.net', 'pdroms.de', 'itch.io']);

describe(ID, () => {
  const manifeste = lire('mire-plugin.json');
  const pack = lire('packs/game-sites.json');
  const sites = Object.entries(pack.systems).flatMap(([systeme, liste]) => liste.map((s) => ({ systeme, ...s })));

  it('est un plugin de données sans permission, en 1.0.0', () => {
    assert.equal(manifeste.id, ID);
    assert.equal(manifeste.version, '1.0.0');
    assert.equal(manifeste.level, 'data');
    assert.equal(manifeste.permissions, undefined);
    assert.equal(manifeste.main, undefined);
    assert.deepEqual(manifeste.contributes.packs, [{ id: 'game-sites', file: 'packs/game-sites.json' }]);
  });

  it('a la forme romSites, bornée', () => {
    assert.equal(pack.kind, 'romSites');
    const noms = Object.keys(pack.systems);
    assert.ok(noms.length > 0 && noms.length <= 64);
    for (const nom of noms) {
      const liste = pack.systems[nom];
      assert.ok(Array.isArray(liste) && liste.length > 0 && liste.length <= 8, nom);
    }
    for (const s of sites) {
      assert.ok(s.name.length > 0 && s.name.length <= 80 && !/[<>]/.test(s.name), s.name);
      assert.deepEqual(Object.keys(s).sort(), ['name', 'search', 'systeme', 'url']);
    }
  });

  it('n’a que des adresses https: sans identifiants, de 500 caractères au plus', () => {
    for (const s of sites) {
      for (const champ of [s.url, s.search].filter((v) => v !== '')) {
        const u = new URL(champ.replace('{q}', 'test'));
        assert.equal(u.protocol, 'https:', champ);
        assert.equal(u.username + u.password, '', champ);
        assert.ok(champ.length <= 500, champ);
        assert.ok(HOTES.has(u.hostname), u.hostname);
      }
      assert.ok(s.search === '' || s.search.includes('{q}'), s.search);
    }
  });

  it('ne vise que des systèmes connus', () => {
    for (const nom of Object.keys(pack.systems)) assert.ok(SYSTEMES.has(nom), nom);
  });

  it('a un nom et une description en français et en anglais', () => {
    for (const l of ['fr', 'en']) {
      const c = lire(`i18n/${l}.json`);
      assert.equal(c.meta.code, l);
      assert.ok(c.messages.plugin.name && c.messages.plugin.description);
    }
    assert.equal(lire('i18n/fr.json').messages.plugin.name, 'Sites de jeux');
    assert.equal(lire('i18n/en.json').messages.plugin.name, 'Game sites');
  });
});
