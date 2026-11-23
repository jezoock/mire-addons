import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ID = 'mire.free-games';
const dir = new URL('../', import.meta.url);
const lire = (rel) => JSON.parse(readFileSync(new URL(rel, dir), 'utf8'));
// Extensions de fichier par système RetroArch de la boutique (voir `SYSTEMS` dans @mire/shared).
const EXTENSIONS = { nes: ['.nes', '.fds', '.unf'], gb: ['.gb'], gbc: ['.gbc'], md: ['.md', '.gen', '.smd'] };

describe(ID, () => {
  const manifeste = lire('mire-plugin.json');
  const pack = lire('packs/free-games.json');
  const fr = lire('i18n/fr.json');
  const en = lire('i18n/en.json');

  it('est un plugin de données sans permission, en 1.0.0', () => {
    assert.equal(manifeste.id, ID);
    assert.equal(manifeste.version, '1.0.0');
    assert.equal(manifeste.level, 'data');
    assert.equal(manifeste.permissions, undefined);
    assert.equal(manifeste.main, undefined);
    assert.deepEqual(manifeste.contributes.packs, [{ id: 'free-games', file: 'packs/free-games.json' }]);
  });

  it('a la forme freeGames, bornée', () => {
    assert.equal(pack.kind, 'freeGames');
    assert.ok(pack.games.length > 0 && pack.games.length <= 64);
    const ids = new Set();
    for (const g of pack.games) {
      assert.match(g.id, /^[a-z0-9-]{1,40}$/);
      assert.ok(!ids.has(g.id), `doublon ${g.id}`);
      ids.add(g.id);
      for (const c of ['name', 'system', 'author', 'url', 'file', 'desc']) assert.equal(typeof g[c], 'string', `${g.id}.${c}`);
      assert.ok(g.basedOn === undefined || typeof g.basedOn === 'string');
      assert.ok(!/[<>]/.test(g.name + g.author + (g.basedOn ?? '')), g.id);
    }
  });

  it('n’a que des adresses https: vers github.com, et des noms de fichiers simples', () => {
    for (const g of pack.games) {
      const u = new URL(g.url);
      assert.equal(u.protocol, 'https:', g.id);
      assert.equal(u.hostname, 'github.com', g.id);
      assert.equal(u.username + u.password, '', g.id);
      assert.ok(g.url.length <= 500, g.id);
      assert.ok(/^[^/\\]+\.[A-Za-z0-9]+$/.test(g.file) && !g.file.includes('..'), g.file);
    }
  });

  it('chaque jeu vise un système connu et un fichier de ce système', () => {
    for (const g of pack.games) {
      const ext = EXTENSIONS[g.system];
      assert.ok(ext, `${g.id} : système ${g.system}`);
      assert.ok(ext.includes(g.file.slice(g.file.lastIndexOf('.')).toLowerCase()), g.file);
    }
  });

  it('a un nom, une description du plugin et un texte par jeu en français et en anglais', () => {
    for (const [l, c] of [['fr', fr], ['en', en]]) {
      assert.equal(c.meta.code, l);
      assert.ok(c.messages.plugin.name && c.messages.plugin.description);
      for (const g of pack.games) {
        assert.equal(g.desc, `freeGames.${g.id}.desc`);
        const t = c.messages.freeGames?.[g.id]?.desc;
        assert.ok(typeof t === 'string' && t.length > 0 && t.length <= 300, `${l} ${g.id}`);
      }
    }
    assert.equal(fr.messages.plugin.name, 'Jeux libres');
    assert.equal(en.messages.plugin.name, 'Free games');
  });
});
