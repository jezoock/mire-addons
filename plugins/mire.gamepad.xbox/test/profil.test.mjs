import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ID = 'mire.gamepad.xbox';
const dir = new URL('../', import.meta.url);
const lire = (rel) => JSON.parse(readFileSync(new URL(rel, dir), 'utf8'));
const BOUTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select'];

describe(ID, () => {
  const manifeste = lire('mire-plugin.json');
  const profil = lire('gamepads/xbox.json');
  const cle = (v) => (typeof v === 'object' ? v.text : null);

  it('est un plugin de données sans permission, en 1.0.0', () => {
    assert.equal(manifeste.id, ID);
    assert.equal(manifeste.version, '1.0.0');
    assert.equal(manifeste.level, 'data');
    assert.equal(manifeste.permissions, undefined);
    assert.equal(manifeste.main, undefined);
  });

  it('a des motifs compilables et bornés', () => {
    assert.ok(Array.isArray(profil.match) && profil.match.length > 0 && profil.match.length <= 20);
    for (const m of profil.match) {
      assert.equal(typeof m, 'string');
      assert.ok(m.length > 0 && m.length <= 100, m);
      assert.doesNotThrow(() => new RegExp(m, 'i'), m);
    }
    assert.ok(Number.isInteger(profil.priority) && profil.priority >= 0 && profil.priority <= 1000);
  });

  it('définit un libellé pour chaque bouton', () => {
    for (const b of BOUTONS) {
      const v = profil.buttons[b];
      assert.ok(typeof v === 'string' ? v.length > 0 : typeof v?.text === 'string', b);
    }
  });

  it('fournit les textes en anglais et en français', () => {
    for (const code of ['en', 'fr']) {
      const cat = lire(`i18n/${code}.json`);
      assert.equal(cat.meta.code, code);
      assert.ok(cat.messages.plugin.name && cat.messages.plugin.description);
      assert.ok(cat.messages.gamepads.xbox.name);
      for (const b of BOUTONS) {
        const k = cle(profil.buttons[b]);
        if (!k) continue;
        const [groupe, nom] = k.split('.');
        assert.ok(cat.messages[groupe]?.[nom], `${code}: ${k}`);
      }
    }
  });
});
