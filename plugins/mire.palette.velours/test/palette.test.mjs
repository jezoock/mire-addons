import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ID = 'mire.palette.velours';
const dir = new URL('../', import.meta.url);
const lire = (rel) => JSON.parse(readFileSync(new URL(rel, dir), 'utf8'));

// Jetons obligatoires du cœur de Mire (PALETTE_TOKENS) : couleurs #rrggbb, sauf ring-mix (pourcentage).
const OBLIGATOIRES = ['bg', 'bg-rail', 'surface', 'surface-2', 'line', 'line-strong', 'text', 'muted', 'ink',
  'bar-white', 'bar-yellow', 'bar-cyan', 'bar-green', 'bar-magenta', 'bar-red', 'bar-blue', 'ring-mix'];

// Valeurs de référence : celles de la palette « velours » du cœur de Mire avant P5-02.
const REFERENCE = {
  "scheme": "dark",
  "tokens": {
    "bg": "#1c1513",
    "bg-rail": "#160f0e",
    "surface": "#271c19",
    "surface-2": "#332522",
    "line": "#40302b",
    "line-strong": "#6b544c",
    "text": "#f5ede5",
    "muted": "#bdaa9e",
    "ink": "#1c1513",
    "bar-white": "#f2e8dc",
    "bar-yellow": "#f0c850",
    "bar-cyan": "#5cc8c2",
    "bar-green": "#8cc66a",
    "bar-magenta": "#d86fa8",
    "bar-red": "#e8604f",
    "bar-blue": "#7d8fea",
    "ring-mix": "100%"
  }
};

describe(ID, () => {
  const manifeste = lire('mire-plugin.json');
  const palette = lire('palettes/velours.json');

  it('est un plugin de données sans permission, en 1.0.0', () => {
    assert.equal(manifeste.id, ID);
    assert.equal(manifeste.version, '1.0.0');
    assert.equal(manifeste.level, 'data');
    assert.equal(manifeste.permissions, undefined);
    assert.equal(manifeste.main, undefined);
    assert.deepEqual(manifeste.contributes.palettes, [{ id: 'velours', file: 'palettes/velours.json' }]);
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
      assert.ok(m.palettes['velours'].name, l);
    }
  });
});
