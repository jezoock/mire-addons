// Contrat attendu par Mire (branche de P5-15, jezoock/mire#101) : identifiant, contributions, réglages, hôtes, textes ;
// client TMDB (repris de test/net/tmdb.test.ts de Mire).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import createMetadata from '../src/metadata.mjs';
import createSearch from '../src/search.mjs';
import { TEXT_CATALOGS } from '../src/texts.mjs';
import { metadataLanguage, tmdbImageUrl, tmdbRequest, watchRegion } from '../src/tmdb.mjs';
import { fakeContext } from './helpers.mjs';

const read = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const manifest = read('mire-plugin.json');

test('manifeste : identifiant de la règle P5-15, niveau code, seuls les hôtes TMDB', () => {
  assert.equal(manifest.id, 'mire.tmdb');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.level, 'code');
  assert.deepEqual(manifest.permissions, { hosts: ['api.themoviedb.org', 'image.tmdb.org'] });
  assert.deepEqual(manifest.contributes.metadata, [{ id: 'tmdb', main: 'src/metadata.mjs', kinds: ['video'] }]);
  assert.deepEqual(manifest.contributes.search, [{ id: 'ouregarder', main: 'src/search.mjs' }]);
});

test('réglages : ceux où la règle P5-15 range les anciens (token secret, region, language)', () => {
  const byKey = Object.fromEntries(manifest.settings.map((s) => [s.key, s]));
  assert.deepEqual(Object.keys(byKey), ['token', 'region', 'language']);
  assert.equal(byKey.token.type, 'secret');
  // La règle met le pays en minuscules (anciennes valeurs FR, BE, CH, LU, CA) : chacune est une option.
  for (const r of ['fr', 'be', 'ch', 'lu', 'ca']) assert.ok(byKey.region.options.includes(r), r);
  // La langue reprise est libre (`en-US`, `nl-BE`…) ou `auto` : un texte.
  assert.equal(byKey.language.type, 'text');
  assert.equal(byKey.language.default, 'auto');
});

test('chaque fabrique rend la contribution déclarée (id attendu par l’hôte)', () => {
  const { ctx } = fakeContext();
  assert.equal(createMetadata(ctx).id, manifest.contributes.metadata[0].id);
  assert.equal(createSearch(ctx).id, manifest.contributes.search[0].id);
});

test('textes : ceux du code sont ceux des catalogues i18n (section tmdb), en français et en anglais', () => {
  for (const lang of ['fr', 'en']) {
    const catalog = read(`i18n/${lang}.json`);
    assert.equal(catalog.meta.code, lang);
    assert.deepEqual(catalog.messages.tmdb, TEXT_CATALOGS[lang]);
    for (const o of manifest.settings.find((s) => s.key === 'region').options) assert.equal(typeof catalog.messages.settings.region.options[o], 'string');
  }
});

test('tmdbRequest : clé courte dans l’adresse, jeton long (61 caractères ou plus) dans l’en-tête, paramètres vides omis', () => {
  assert.deepEqual(tmdbRequest('/search/movie', { query: 'Le Destin', year: '', page: 1, region: null, x: undefined }, 'courte'), {
    url: 'https://api.themoviedb.org/3/search/movie?query=Le+Destin&page=1&api_key=courte',
    headers: { accept: 'application/json' },
  });
  const long = `eyJ${'a'.repeat(60)}`;
  assert.deepEqual(tmdbRequest('/movie/1', {}, long), {
    url: 'https://api.themoviedb.org/3/movie/1',
    headers: { accept: 'application/json', authorization: `Bearer ${long}` },
  });
  assert.equal(tmdbRequest('/movie/1', {}, 'a'.repeat(60)).url, `https://api.themoviedb.org/3/movie/1?api_key=${'a'.repeat(60)}`);
  assert.equal(tmdbImageUrl('/a.jpg', 'w342'), 'https://image.tmdb.org/t/p/w342/a.jpg');
});

test('langue et pays : réglage fixé, sinon d’après l’interface ; valeur illisible → anglais', () => {
  assert.equal(metadataLanguage('auto', 'fr'), 'fr-FR');
  assert.equal(metadataLanguage('', 'en'), 'en-US');
  assert.equal(metadataLanguage(undefined, 'fr-BE'), 'fr-BE');
  assert.equal(metadataLanguage(' nl-BE ', 'fr'), 'nl-BE');
  assert.equal(metadataLanguage('auto', '!!'), 'en-US');
  assert.equal(watchRegion('auto', 'fr-FR'), 'FR');
  assert.equal(watchRegion('be', 'fr-FR'), 'BE');
  assert.equal(watchRegion(undefined, 'nl-BE'), 'BE');
  assert.equal(watchRegion('auto', 'xx'), 'US');
});
