// Infos en ligne TMDB (repris de test/scrape/tmdb.test.ts de Mire), avec des réponses enregistrées, sans réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import createMetadata from '../src/metadata.mjs';
import { fakeContext, KEY, loadRoutes } from './helpers.mjs';

const Q = `language=fr-FR&api_key=${KEY}`;

function setup(extra = {}, options = {}) {
  const env = fakeContext({ routes: { ...loadRoutes('tmdb'), ...extra }, ...options });
  return { ...env, provider: createMetadata(env.ctx) };
}

test('film : recherche avec l’année, genres traduits (deux au plus), affiche et fond par adresse', async () => {
  const { provider } = setup();
  const r = await provider.scrape({ path: '/v/a.mkv', name: 'Le.Fabuleux.Destin.2001.1080p', dir: '/v' }, null);
  assert.deepEqual(r, {
    title: "Le Fabuleux Destin d'Amélie Poulain",
    year: '2001',
    overview: 'Amélie, une jeune serveuse dans un bar de Montmartre…',
    genre: 'Comédie, Romance',
    image: 'https://image.tmdb.org/t/p/w342/amelie.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/amelie-fond.jpg',
    series: false,
    source: 'TMDB',
  });
});

test('film : sans résultat avec l’année, nouvel essai sans, puis recherche multiple', async () => {
  const { provider, calls } = setup({
    [`https://api.themoviedb.org/3/search/movie?query=Inconnu&year=1999&${Q}`]: { json: { results: [] } },
    [`https://api.themoviedb.org/3/search/movie?query=Inconnu&${Q}`]: { json: { results: [] } },
    [`https://api.themoviedb.org/3/search/multi?query=Inconnu&${Q}`]: {
      json: { results: [{ media_type: 'person' }, { media_type: 'tv', name: 'Inconnu', first_air_date: '2010-01-01', genre_ids: [80] }] },
    },
  });
  const r = await provider.scrape({ path: '/v/i', name: 'Inconnu (1999)' });
  assert.deepEqual(r, { title: 'Inconnu', year: '2010', overview: '', genre: 'Crime', image: null, backdrop: null, series: true, source: 'TMDB' });
  assert.equal(calls.filter((c) => c.url.includes('/search/')).length, 3);
});

test('rien trouvé ou titre vide : null (échec noté par le moteur)', async () => {
  const { provider } = setup();
  assert.equal(await provider.scrape({ path: '/v/v', name: 'Vacances' }), null);
  assert.equal(await provider.scrape({ path: '/v/s', name: 'S01E01', dir: '/Saison 1' }), null);
});

test('série : une seule recherche pour les épisodes traités ensemble, même affiche', async () => {
  const { provider, calls } = setup();
  const ep = (n) => ({ path: `/v/S01E0${n}`, name: `S01E0${n}`, dir: '/v/Le Bureau des légendes/Saison 1' });
  const [a, b] = await Promise.all([provider.scrape(ep(1)), provider.scrape(ep(2))]);
  assert.equal(a.series, true);
  assert.equal(a.title, 'Le Bureau des Légendes');
  assert.equal(a.image, 'https://image.tmdb.org/t/p/w342/bdl.jpg');
  assert.equal(a.image, b.image);
  assert.equal(calls.filter((c) => c.url.includes('/search/tv')).length, 1);
});

test('erreur de TMDB : rendue { failure } (texte du plugin), la recherche de série n’est pas gardée', async () => {
  const url = `https://api.themoviedb.org/3/search/tv?query=Panne&${Q}`;
  const { provider, calls } = setup({ [url]: { status: 500, json: {} } });
  assert.deepEqual(await provider.scrape({ name: 'Panne S01E01' }), { failure: 'TMDB a répondu avec le code 500.' });
  assert.deepEqual(await provider.scrape({ name: 'Panne S01E02' }), { failure: 'TMDB a répondu avec le code 500.' });
  assert.equal(calls.filter((c) => c.url === url).length, 2);
});

test('clé refusée, TMDB injoignable : messages simples, sans la clé ni l’adresse', async () => {
  const url = `https://api.themoviedb.org/3/movie/7?${Q}`;
  for (const [reply, message] of [
    [{ status: 401, json: {} }, 'Clé TMDB refusée. Vérifiez-la dans les réglages du plugin TMDB.'],
    [{ unreachable: true }, 'Le catalogue TMDB est injoignable. Vérifiez la connexion Internet.'],
    [{ text: 'pas du JSON' }, 'Le catalogue TMDB est injoignable. Vérifiez la connexion Internet.'],
  ]) {
    const { provider, logs } = setup({ [url]: reply });
    const r = await provider.byId({ id: 'movie:7' }, {});
    assert.deepEqual(r, { failure: message });
    assert.ok(!JSON.stringify(r).includes(KEY));
    assert.deepEqual(logs, []);
  }
});

test('correction (type, titre) et fiche choisie (picked) ; fiche choisie introuvable ou mal formée : undefined', async () => {
  const { provider } = setup();
  const fixed = await provider.scrape({ path: '/v/x', name: 'x' }, { type: 'tv', title: 'Le Bureau des légendes', year: '' });
  assert.equal(fixed.title, 'Le Bureau des Légendes');
  const picked = await provider.byId({ id: 'movie:194' }, { path: '/v/c' });
  assert.equal(picked.picked, true);
  assert.equal(picked.genre, 'Comédie, Romance');
  assert.equal(picked.image, 'https://image.tmdb.org/t/p/w342/amelie.jpg');
  assert.equal(picked.backdrop, 'https://image.tmdb.org/t/p/w1280/amelie-fond.jpg');
  assert.equal(await provider.byId({ id: 'tv:1' }, {}), undefined);
  assert.equal(await provider.byId({ id: 'movie:../x' }, {}), undefined);
});

test('jeton long : envoyé dans l’en-tête, jamais dans l’adresse', async () => {
  const long = `eyJ${'b'.repeat(70)}`;
  const { provider, calls } = setup({ 'https://api.themoviedb.org/3/movie/5?language=fr-FR': { json: { title: 'Cinq' } } }, { settings: { token: ` ${long} ` } });
  assert.equal((await provider.byId({ id: 'movie:5' }, {})).title, 'Cinq');
  assert.equal(calls[0].headers.authorization, `Bearer ${long}`);
  assert.ok(!calls[0].url.includes(long));
});

test('requires : clé absente → textes du plugin (français ou anglais) ; sans clé, aucune requête', async () => {
  const { provider, set, calls } = setup();
  assert.equal(provider.requires(), null);
  set('token', ' ');
  assert.deepEqual(provider.requires(), {
    skipped: 'vidéos (clé TMDB absente)',
    error: 'Ajoutez une clé TMDB dans les réglages du plugin TMDB pour chercher les films et séries.',
  });
  assert.deepEqual(await provider.candidates({ query: 'Dune' }), {
    failure: 'Ajoutez une clé TMDB dans les réglages du plugin TMDB pour chercher les films et séries.',
  });
  assert.equal(calls.length, 0);
  const en = setup({}, { locale: 'en', settings: { token: undefined } });
  assert.deepEqual(en.provider.requires(), { skipped: 'videos (no TMDB key)', error: 'Add a TMDB key in the TMDB plugin settings to look up movies and series.' });
});

test('candidates : épisode → séries seulement ; sinon films et séries de la recherche multiple', async () => {
  const { provider } = setup({
    [`https://api.themoviedb.org/3/search/multi?query=Dune&${Q}`]: {
      json: {
        results: [
          { media_type: 'person', name: 'Dune' },
          { media_type: 'movie', id: 1, title: 'Dune', original_title: 'Dune', release_date: '1984-12-14', poster_path: '/d.jpg' },
          { media_type: 'movie', id: 2, title: 'Dune', original_title: 'Dune: Part One', release_date: '2021-09-15' },
        ],
      },
    },
  });
  assert.deepEqual(await provider.candidates({ item: { name: 'Dune' }, query: 'Dune', year: '2021' }), [
    { id: 'movie:2', title: 'Dune', year: '2021', sub: 'Film, Dune: Part One', image: null },
    { id: 'movie:1', title: 'Dune', year: '1984', sub: 'Film', image: 'https://image.tmdb.org/t/p/w154/d.jpg' },
  ]);
  const tv = await provider.candidates({ item: { name: 'S01E03' }, query: 'Le Bureau des légendes' });
  assert.equal(tv[0].id, 'tv:62014');
  assert.equal(tv[0].sub, 'Série');
});

test('langue des fiches : réglage fixé, sinon celle de l’interface ; collect et clé', async () => {
  const routes = { 'https://api.themoviedb.org/3/movie/5?language=nl-BE&api_key=k': { json: { title: 'Vijf' } } };
  const fixed = createMetadata(fakeContext({ routes, settings: { token: 'k', language: 'nl-BE' } }).ctx);
  assert.equal((await fixed.byId({ id: 'movie:5' }, {})).title, 'Vijf');
  const env = fakeContext({ locale: 'en', settings: { token: 'k' }, routes: { 'https://api.themoviedb.org/3/movie/5?language=en-US&api_key=k': { json: { title: 'Five' } } } });
  const p = createMetadata(env.ctx);
  assert.equal((await p.byId({ id: 'movie:5' }, {})).title, 'Five');
  assert.deepEqual(p.collect({ videos: [{ path: '/a' }] }), [{ path: '/a' }]);
  assert.deepEqual(p.collect({}), []);
  assert.equal(p.key({ path: '/a' }), 'v:/a');
});
