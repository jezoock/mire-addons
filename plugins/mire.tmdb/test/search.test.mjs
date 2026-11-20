// « Où regarder » (repris de test/search/streaming.test.ts de Mire) : réponses simulées, sans réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import createSearch from '../src/search.mjs';
import { fakeContext } from './helpers.mjs';

const API = 'https://api.themoviedb.org/3';
const offer = (id, name) => ({ provider_id: id, provider_name: name });
const multi = (q, lang = 'fr-FR') => `${API}/search/multi?query=${encodeURIComponent(q)}&language=${lang}&include_adult=false&page=1&api_key=cle`;
const offers = (media, id) => `${API}/${media}/${id}/watch/providers?api_key=cle`;
const ATTRIBUTION = 'Catalogue : TMDB. Disponibilités : JustWatch.';

function setup(routes, options = {}) {
  const env = fakeContext({ routes, ...options, settings: { token: ' cle ', ...(options.settings ?? {}) } });
  return { ...env, search: createSearch(env.ctx) };
}

test('recherche : films et séries (12 au plus), offres du pays, doublons ignorés, affiche par adresse', async () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ id: 100 + i, media_type: 'movie', title: `Film ${i}` }));
  const { search, calls } = setup({
    [multi('amélie')]: {
      json: {
        results: [
          { id: 1, media_type: 'movie', title: 'Amélie', release_date: '2001-04-25', poster_path: '/amelie.jpg' },
          { id: 7, media_type: 'person', name: 'Audrey Tautou' },
          { id: 2, media_type: 'tv', name: 'Le Bureau', first_air_date: '2015-04-27' },
          ...many,
        ],
      },
    },
    [offers('movie', 1)]: {
      json: {
        results: {
          FR: {
            flatrate: [offer(8, 'Netflix'), offer(381, 'Canal+')],
            free: [offer(8, 'Netflix'), offer(35, 'Rakuten TV')],
            ads: [offer(381, 'Canal+'), offer(300, 'Pluto TV')],
            buy: [offer(2, 'Apple TV')],
          },
          BE: { flatrate: [offer(9, 'Prime Video')] },
        },
      },
    },
    [offers('tv', 2)]: { json: { results: { BE: { flatrate: [offer(381, 'Canal+')] } } } },
  });
  const r = await search.search('  amélie ');
  assert.equal(r.ok, true);
  assert.equal(r.attribution, ATTRIBUTION);
  assert.equal(r.results.length, 12);
  assert.deepEqual(r.results[0], {
    key: 'movie-1',
    title: 'Amélie',
    year: '2001',
    type: 'movie',
    poster: 'https://image.tmdb.org/t/p/w342/amelie.jpg',
    providers: [{ name: 'Netflix' }, { name: 'Canal+' }, { name: 'Rakuten TV' }, { name: 'Pluto TV' }],
  });
  assert.deepEqual(r.results[1], { key: 'tv-2', title: 'Le Bureau', year: '2015', type: 'tv', poster: null, providers: [] });
  // Titre sans offres (route absente : 404) : gardé, sans services.
  assert.deepEqual(r.results[2], { key: 'movie-100', title: 'Film 0', year: '', type: 'movie', poster: null, providers: [] });
  assert.equal(calls.length, 13);
  assert.ok(calls.every((c) => c.timeout === 9000));
});

test('recherche : langue et pays des réglages ; pays « auto » d’après la langue', async () => {
  const routes = {
    [multi('dune', 'nl-BE')]: { json: { results: [{ id: 3, media_type: 'movie', title: 'Dune' }] } },
    [multi('dune', 'en-US')]: { json: { results: [{ id: 3, media_type: 'movie', title: 'Dune' }] } },
    [offers('movie', 3)]: {
      json: { results: { BE: { flatrate: [offer(9, 'Prime Video')] }, CH: { flatrate: [offer(1, 'Play Suisse')] }, US: { flatrate: [offer(15, 'Hulu')] } } },
    },
  };
  const be = await setup(routes, { settings: { language: 'nl-BE', region: 'auto' } }).search.search('dune');
  assert.deepEqual(be.results[0].providers, [{ name: 'Prime Video' }]);
  const ch = await setup(routes, { settings: { language: 'nl-BE', region: 'ch' } }).search.search('dune');
  assert.deepEqual(ch.results[0].providers, [{ name: 'Play Suisse' }]);
  const us = await setup(routes, { locale: 'en' }).search.search('dune');
  assert.deepEqual(us.results[0].providers, [{ name: 'Hulu' }]);
  assert.equal(us.attribution, 'Catalogue: TMDB. Availability: JustWatch.');
});

test('recherche vide : aucun résultat, sans appel ; sans clé : message et réglage à remplir', async () => {
  const { search, calls } = setup({});
  assert.deepEqual(await search.search('   '), { ok: true, results: [], attribution: ATTRIBUTION });
  const sansCle = setup({}, { settings: { token: '  ' } });
  assert.deepEqual(await sansCle.search.search('dune'), {
    ok: false,
    message: 'Ajoutez une clé TMDB gratuite pour voir ici les films et séries correspondants, avec le service où les regarder.',
    setup: 'token',
  });
  assert.equal(calls.length + sansCle.calls.length, 0);
});

test('erreurs : TMDB injoignable, clé refusée (401, réglage à revoir), autre code ; jamais la clé', async () => {
  const cases = [
    [{ unreachable: true }, { ok: false, message: 'Le catalogue TMDB est injoignable. Vérifiez la connexion Internet.' }],
    [{ status: 401 }, { ok: false, message: 'Clé TMDB refusée. Vérifiez-la dans les réglages du plugin TMDB.', setup: 'token' }],
    [{ status: 503 }, { ok: false, message: 'TMDB a répondu avec le code 503.' }],
  ];
  for (const [reply, expected] of cases) {
    const { search, logs } = setup({ [multi('dune')]: reply });
    const r = await search.search('dune');
    assert.deepEqual(r, expected);
    assert.ok(!JSON.stringify(r).includes('api_key') && !/\bcle\b/.test(JSON.stringify(r)));
    assert.deepEqual(logs, []);
  }
});

test('erreur sur les offres d’un titre : titre gardé, sans services', async () => {
  const { search } = setup({
    [multi('kaamelott')]: { json: { results: [{ id: 4, media_type: 'tv', name: 'Kaamelott', first_air_date: '2005-01-03' }] } },
    [offers('tv', 4)]: { unreachable: true },
  });
  assert.deepEqual(await search.search('kaamelott'), {
    ok: true,
    results: [{ key: 'tv-4', title: 'Kaamelott', year: '2005', type: 'tv', poster: null, providers: [] }],
    attribution: ATTRIBUTION,
  });
});
