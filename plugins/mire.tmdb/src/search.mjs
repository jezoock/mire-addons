/**
 * « Où regarder » (contribution `search`, id `ouregarder`) : films et séries trouvés sur TMDB, avec les services qui
 * les proposent dans le pays choisi (données JustWatch, servies par TMDB). Reprise de `src/main/search/streaming.ts`
 * de Mire (avant P5-15) ; le rapprochement avec les sites configurés reste dans le cœur (`src/main/search/watch.ts`).
 *
 * Réponse (forme lue par `watch.ts`) : `{ ok: true, results: [{ key, title, year, type, poster, providers: [{ name }] }],
 * attribution }`, ou `{ ok: false, message, setup? }` (`setup: 'token'` : la clé est à saisir).
 */
import { createTmdb, TmdbFailure, tmdbImageUrl } from './tmdb.mjs';

const TIMEOUT = 9000;
const MAX_RESULTS = 12;

/** Services d'un titre (abonnement, gratuit, avec publicité), sans doublon. */
function offersOf(offers) {
  const seen = new Set();
  const out = [];
  for (const o of [...(offers?.flatrate || []), ...(offers?.free || []), ...(offers?.ads || [])]) {
    if (!o || typeof o.provider_name !== 'string' || seen.has(o.provider_id)) continue;
    seen.add(o.provider_id);
    out.push({ name: o.provider_name });
  }
  return out;
}

export default function createSearch(ctx) {
  const tmdb = createTmdb(ctx);
  const { t } = tmdb;
  const get = (pathname, params) => tmdb.get(pathname, params, { timeout: TIMEOUT });

  async function resultOf(r, region) {
    // Sans les offres d'un titre (erreur, délai), le titre est gardé, sans services.
    const offers = await get(`/${r.media_type}/${r.id}/watch/providers`)
      .then((d) => d?.results?.[region] || null)
      .catch(() => null);
    return {
      key: `${r.media_type}-${r.id}`,
      title: r.title || r.name || '',
      year: String(r.release_date || r.first_air_date || '').slice(0, 4),
      type: r.media_type,
      poster: typeof r.poster_path === 'string' && r.poster_path ? tmdbImageUrl(r.poster_path, 'w342') : null,
      providers: offersOf(offers),
    };
  }

  return {
    id: 'ouregarder',
    async search(query) {
      const q = String(query ?? '').trim();
      const attribution = t('attribution');
      if (!q) return { ok: true, results: [], attribution };
      if (!tmdb.hasKey()) return { ok: false, message: t('watchNoKey'), setup: 'token' };
      try {
        const data = await get('/search/multi', { query: q, language: tmdb.language(), include_adult: 'false', page: '1' });
        const items = (data?.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, MAX_RESULTS);
        const region = tmdb.region();
        return { ok: true, results: await Promise.all(items.map((r) => resultOf(r, region))), attribution };
      } catch (err) {
        if (!(err instanceof TmdbFailure)) throw err;
        return { ok: false, message: err.message, ...(err.key ? { setup: 'token' } : {}) };
      }
    },
  };
}
