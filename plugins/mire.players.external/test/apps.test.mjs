import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ID = 'mire.players.external';
const dir = new URL('../', import.meta.url);
const lire = (rel) => JSON.parse(readFileSync(new URL(rel, dir), 'utf8'));
const nomFichier = (chemin) => chemin.split(/[\\/]/).pop();
const OPTIONS = ['fullscreen', 'title', 'start'];

describe(ID, () => {
  const manifeste = lire('mire-plugin.json');

  it('est un plugin de données sans permission', () => {
    assert.equal(manifeste.id, ID);
    assert.equal(manifeste.level, 'data');
    assert.equal(manifeste.permissions, undefined);
    assert.equal(manifeste.main, undefined);
    assert.deepEqual(manifeste.contributes.apps.map((a) => a.id), ['mpv', 'vlc']);
  });

  for (const { id, file } of manifeste.contributes.apps) {
    describe(id, () => {
      const app = lire(file);

      it('est un lecteur avec des noms', () => {
        assert.equal(app.kind, 'player');
        assert.ok(Array.isArray(app.names) && app.names.length > 0);
      });

      it('a des emplacements absolus, propres, dont le nom est dans names', () => {
        for (const [systeme, liste] of Object.entries(app.locations)) {
          assert.ok(['windows', 'mac', 'linux'].includes(systeme), systeme);
          assert.ok(liste.length > 0, systeme);
          for (const c of liste) {
            const absolu = systeme === 'windows' ? /^([A-Za-z]:\\|\{[A-Za-z0-9]+\}\\)/.test(c) : c.startsWith('/');
            assert.ok(absolu, `non absolu : ${c}`);
            assert.ok(!c.split(/[\\/]/).includes('..'), `« .. » : ${c}`);
            assert.ok(!c.startsWith('\\\\') && !c.startsWith('//'), `partage réseau : ${c}`);
            const nom = nomFichier(c).replace(/\.exe$/i, '').toLowerCase();
            assert.ok(app.names.some((n) => n.toLowerCase() === nom), `nom : ${c}`);
          }
        }
      });

      it('limite les options à leur forme', () => {
        for (const [nom, valeur] of Object.entries(app.options)) {
          assert.ok(OPTIONS.includes(nom), nom);
          assert.match(valeur, /^--[a-z-]+(=\{(title|start)\})?$/, nom);
        }
      });
    });
  }

  it('a ses textes en français et en anglais', () => {
    for (const l of ['fr', 'en']) {
      const m = lire(`i18n/${l}.json`).messages;
      assert.ok(m.plugin.name, l);
    }
  });
});
