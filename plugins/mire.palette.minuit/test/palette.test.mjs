import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ID = 'mire.palette.minuit';
const dir = new URL('../', import.meta.url);
const lire = (rel) => JSON.parse(readFileSync(new URL(rel, dir), 'utf8'));

// Jetons obligatoires du cœur de Mire (PALETTE_TOKENS) : couleurs #rrggbb, sauf ring-mix (pourcentage).
const OBLIGATOIRES = ['bg', 'bg-rail', 'surface', 'surface-2', 'line', 'line-strong', 'text', 'muted', 'ink',
  'bar-white', 'bar-yellow', 'bar-cyan', 'bar-green', 'bar-magenta', 'bar-red', 'bar-blue', 'ring-mix'];

// Valeurs de référence : celles de la palette « minuit » du cœur de Mire avant P5-02.
const REFERENCE = {
  "scheme": "dark",
  "tokens": {
    "bg": "#0f1524",
    "bg-rail": "#0b101c",
    "surface": "#182038",
    "surface-2": "#212a46",
    "line": "#29345a",
    "line-strong": "#46527c",
    "text": "#e8ecf7",
    "muted": "#97a1c2",
    "ink": "#0f1524",
    "bar-white": "#e6e9f2",
    "bar-yellow": "#f3d35a",
    "bar-cyan": "#4fd5e0",
    "bar-green": "#6cd08f",
    "bar-magenta": "#d86ee6",
    "bar-red": "#f06b78",
    "bar-blue": "#7c95ff",
    "ring-mix": "100%"
  }
};

describe(ID, () => {
  const manifeste = lire('mire-plugin.json');
  const palette = lire('palettes/minuit.json');

  it('est un plugin de données sans permission, en 1.0.0', () => {
    assert.equal(manifeste.id, ID);
    assert.equal(manifeste.version, '1.0.0');
    assert.equal(manifeste.level, 'data');
    assert.equal(manifeste.permissions, undefined);
    assert.equal(manifeste.main, undefined);
    assert.deepEqual(manifeste.contributes.palettes, [{ id: 'minuit', file: 'palettes/minuit.json' }]);
  });

  it('a le mode sombre', () => {
    assert.equal(palette.scheme, 'dark');
  });

  it('définit tous les jetons obligatoires dans leur forme', () => {
    for (const nom of OBLIGATOIRES) {
      const v = palette.tokens[nom];
      assert.ok(typeof v === 'string', `jeton absent : ${nom}`);
      assert.match(v, nom === 'ring-mix' ? /^\d{1,3}%$/ : /^#[0-9a-f]{6}$/i, nom);
    }
  });

  it('reprend exactement les valeurs de référence', () => {
    assert.deepEqual(palette, REFERENCE);
  });

  it('a son nom en français et en anglais', () => {
    for (const l of ['fr', 'en']) {
      const m = lire(`i18n/${l}.json`).messages;
      assert.ok(m.plugin.name && m.plugin.description, l);
      assert.ok(m.palettes['minuit'].name, l);
    }
  });
});
