import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ID = 'mire.palette.jour';
const dir = new URL('../', import.meta.url);
const lire = (rel) => JSON.parse(readFileSync(new URL(rel, dir), 'utf8'));

// Jetons obligatoires du cœur de Mire (PALETTE_TOKENS) : couleurs #rrggbb, sauf ring-mix (pourcentage).
const OBLIGATOIRES = ['bg', 'bg-rail', 'surface', 'surface-2', 'line', 'line-strong', 'text', 'muted', 'ink',
  'bar-white', 'bar-yellow', 'bar-cyan', 'bar-green', 'bar-magenta', 'bar-red', 'bar-blue', 'ring-mix'];

// Valeurs de référence : celles de la palette « jour » du cœur de Mire avant P5-02.
const REFERENCE = {
  "scheme": "light",
  "tokens": {
    "bg": "#f1efe8",
    "bg-rail": "#e7e4db",
    "surface": "#e3e0d6",
    "surface-2": "#d8d4c8",
    "line": "#ccc7ba",
    "line-strong": "#9e998c",
    "text": "#1c1f1d",
    "muted": "#5b605b",
    "ink": "#1c1f1d",
    "bar-white": "#ffffff",
    "bar-yellow": "#ebc427",
    "bar-cyan": "#2cc1c5",
    "bar-green": "#4dbf4b",
    "bar-magenta": "#cf4ecf",
    "bar-red": "#e5504b",
    "bar-blue": "#5876f2",
    "ring-mix": "58%",
    "mire-edge": "1px",
    "mono-mix": "62%"
  }
};

describe(ID, () => {
  const manifeste = lire('mire-plugin.json');
  const palette = lire('palettes/jour.json');

  it('est un plugin de données sans permission, en 1.0.0', () => {
    assert.equal(manifeste.id, ID);
    assert.equal(manifeste.version, '1.0.0');
    assert.equal(manifeste.level, 'data');
    assert.equal(manifeste.permissions, undefined);
    assert.equal(manifeste.main, undefined);
    assert.deepEqual(manifeste.contributes.palettes, [{ id: 'jour', file: 'palettes/jour.json' }]);
  });

  it('a le mode clair', () => {
    assert.equal(palette.scheme, 'light');
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
      assert.ok(m.palettes['jour'].name, l);
    }
  });
});
