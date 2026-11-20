/**
 * Infos en ligne des films et séries (contribution `metadata`, id `tmdb`) : reprise du fournisseur TMDB du cœur de
 * Mire (`src/main/scrape/providers/tmdb.ts`, avant P5-15).
 *
 * Contrat du cœur (`src/main/plugins/bridges.ts`) : les images sont rendues par leur adresse (`image.tmdb.org`,
 * déclaré dans `permissions.hosts`) et Mire les copie lui-même ; un échec attendu (clé refusée, TMDB injoignable) est
 * rendu `{ failure: "<message>" }` ; sans clé, `requires` dit ce qui manque.
 */
import { fold, parseVideo, rankByTitle } from './text.mjs';
import { createTmdb, orFailure, tmdbImageUrl } from './tmdb.mjs';

const TIMEOUT = 12000;
/** Recherches gardées en mémoire (une par série, une liste de genres par langue) avant d'être oubliées. */
const MEMORY = 500;

const yearOf = (r) => String(r.release_date || r.first_air_date || '').slice(0, 4);
const image = (file, size) => (typeof file === 'string' && file ? tmdbImageUrl(file, size) : null);

export default function createMetadata(ctx) {
  const tmdb = createTmdb(ctx);
  const { t } = tmdb;
  const get = (pathname, params) => tmdb.get(pathname, params, { timeout: TIMEOUT });

  // Listes des genres, lues une fois par langue ; pas gardées si TMDB n'a pas répondu.
  const genreMaps = new Map();
  function genres(lang) {
    if (!genreMaps.has(lang)) {
      if (genreMaps.size >= MEMORY) genreMaps.clear();
      const load = Promise.all([get('/genre/movie/list', { language: lang }).catch(() => null), get('/genre/tv/list', { language: lang }).catch(() => null)]).then(
        ([movies, series]) => {
          if (!movies && !series) genreMaps.delete(lang);
          return new Map([...(movies?.genres || []), ...(series?.genres || [])].map((g) => [g.id, g.name]));
        },
      );
      genreMaps.set(lang, load);
    }
    return genreMaps.get(lang);
  }
  async function genreNames(ids, lang) {
    const map = await genres(lang);
    return (Array.isArray(ids) ? ids : [])
      .map((id) => map.get(id))
      .filter(Boolean)
      .slice(0, 2)
      .join(', ');
  }

  // Une seule recherche par série : les épisodes traités en parallèle partagent la même requête.
  const series = new Map();
  function lookupSeries(title, lang) {
    const k = `${lang}\u0000${fold(title)}`;
    if (!series.has(k)) {
      if (series.size >= MEMORY) series.clear();
      const search = get('/search/tv', { query: title, language: lang }).then((data) => {
        const r = rankByTitle(data?.results || [], title, (x) => x.name)[0] || null;
        return r
          ? { title: r.name, year: yearOf(r), overview: r.overview || '', poster: r.poster_path, backdrop: r.backdrop_path, genreIds: r.genre_ids, tv: true }
          : null;
      });
      // Une recherche en échec n'est pas gardée : nouvel essai à l'épisode suivant.
      series.set(
        k,
        search.catch((err) => {
          series.delete(k);
          throw err;
        }),
      );
    }
    return series.get(k);
  }

  // Une clé changée (ou une autre langue) : ce qui a été appris avec l'ancienne est oublié.
  ctx.settings.onChange(() => {
    genreMaps.clear();
    series.clear();
  });

  async function lookupVideo(parsed, lang) {
    if (!parsed.title) return null;
    if (parsed.type === 'tv') return lookupSeries(parsed.title, lang);
    const title = parsed.title;
    const best = (d) =>
      rankByTitle(
        d?.results || [],
        title,
        (x) => x.title,
        (x) => x.release_date,
        parsed.year,
      )[0];
    let r = best(await get('/search/movie', { query: title, year: parsed.year, language: lang }));
    if (!r && parsed.year) r = best(await get('/search/movie', { query: title, language: lang }));
    if (!r) {
      const data = await get('/search/multi', { query: title, language: lang });
      r = (data?.results || []).find((x) => x.media_type === 'movie' || x.media_type === 'tv');
    }
    if (!r) return null;
    return {
      title: r.title || r.name,
      year: yearOf(r),
      overview: r.overview || '',
      poster: r.poster_path,
      backdrop: r.backdrop_path,
      genreIds: r.genre_ids,
      tv: r.media_type === 'tv',
    };
  }

  async function scrape(item, override) {
    const lang = tmdb.language();
    const parsed = override
      ? { type: override.type || 'movie', title: override.title, year: override.year || '' }
      : parseVideo(item ?? {});
    const found = await lookupVideo(parsed, lang);
    if (!found) return null;
    return {
      title: found.title,
      year: found.year,
      overview: found.overview,
      genre: await genreNames(found.genreIds, lang),
      image: image(found.poster, 'w342'),
      backdrop: image(found.backdrop, 'w1280'),
      series: !!found.tv || parsed.type === 'tv',
      source: 'TMDB',
    };
  }

  // Fiche choisie par l'utilisateur (« movie:123 » ou « tv:456 »).
  async function byId(pick) {
    const [media, id] = String(pick?.id ?? '').split(':');
    if (!/^\d+$/.test(id ?? '')) return undefined;
    const r = await get(`/${media === 'tv' ? 'tv' : 'movie'}/${id}`, { language: tmdb.language() });
    if (!r) return undefined;
    return {
      title: r.title || r.name,
      year: yearOf(r),
      overview: r.overview || '',
      genre: (r.genres || [])
        .map((g) => g.name)
        .slice(0, 2)
        .join(', '),
      image: image(r.poster_path, 'w342'),
      backdrop: image(r.backdrop_path, 'w1280'),
      series: media === 'tv',
      source: 'TMDB',
      picked: true,
    };
  }

  async function candidates({ item, query, year } = {}) {
    // Une série (regroupement) ou un épisode : seulement les séries.
    const tvOnly = item?.tv === true || /S\d{1,2}\s*E\d{1,3}/i.test(item?.name || '');
    const data = await get(tvOnly ? '/search/tv' : '/search/multi', { query, language: tmdb.language() });
    const list = (data?.results || []).filter((r) => tvOnly || r.media_type === 'movie' || r.media_type === 'tv');
    return rankByTitle(
      list,
      query,
      (r) => r.title || r.name,
      (r) => r.release_date || r.first_air_date,
      year,
    )
      .slice(0, 12)
      .map((r) => {
        const media = tvOnly ? 'tv' : r.media_type;
        const title = r.title || r.name;
        const original = r.original_title || r.original_name;
        return {
          id: `${media}:${r.id}`,
          title,
          year: yearOf(r),
          sub: [media === 'tv' ? t('series') : t('movie'), original && original !== title ? original : ''].filter(Boolean).join(', '),
          image: image(r.poster_path, 'w154'),
        };
      });
  }

  return {
    id: 'tmdb',
    kinds: ['video'],
    group: 'videos',
    concurrency: 4,
    requires: () => (tmdb.hasKey() ? null : { skipped: t('skipped'), error: t('noKey') }),
    key: (item) => `v:${item?.path ?? ''}`,
    collect: (opts) => (Array.isArray(opts?.videos) ? opts.videos : []),
    scrape: (item, override) => orFailure(() => scrape(item, override ?? undefined)),
    byId: (pick) => orFailure(() => byId(pick)),
    candidates: (query) => orFailure(() => candidates(query)),
  };
}
