/**
 * Client de l'API TMDB, par le client HTTP du contexte (seuls les hôtes déclarés sont joignables). La clé saisie dans
 * les réglages du plugin (`token`, secret) est soit un jeton d'accès long (en-tête `Authorization`), soit une clé
 * d'API courte (paramètre `api_key` de l'adresse). Elle n'apparaît dans aucun message ni aucun journal : les erreurs
 * rendues sont des textes du plugin (`TmdbFailure`), jamais celles du client HTTP.
 */
import { translator } from './texts.mjs';

export const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMAGES = 'https://image.tmdb.org/t/p/';

// Au-delà de cette longueur, la clé est un jeton d'accès (« lecture seule »), pas une clé d'API.
const TOKEN_MIN_LENGTH = 61;

/** Région implicite d'une langue, pour TMDB (`fr` → `fr-FR`). */
const DEFAULT_REGION = { fr: 'FR', en: 'US', de: 'DE', es: 'ES', it: 'IT', pt: 'BR', nl: 'NL', ja: 'JP' };

/**
 * Échec attendu (TMDB injoignable, clé refusée…) : `message` est un texte pour l'utilisateur ; `key` est vrai quand
 * la clé est en cause (absente ou refusée).
 */
export class TmdbFailure extends Error {
  constructor(message, { key = false } = {}) {
    super(message);
    this.name = 'TmdbFailure';
    this.key = key;
  }
}

/** Adresse et en-têtes d'une requête TMDB ; les paramètres vides ou absents sont omis. */
export function tmdbRequest(pathname, params, key) {
  const url = new URL(`${TMDB_API}${pathname}`);
  for (const [k, v] of Object.entries(params ?? {})) if (v !== '' && v != null) url.searchParams.set(k, String(v));
  const headers = { accept: 'application/json' };
  if (key.length >= TOKEN_MIN_LENGTH) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);
  return { url: url.toString(), headers };
}

/** Adresse d'une image TMDB (`size` : « w154 », « w342 », « w1280 »…). */
export const tmdbImageUrl = (file, size) => `${TMDB_IMAGES}${size}${file}`;

/** Langue des fiches (`fr-FR`) : le réglage `language` s'il est fixé, sinon d'après la langue de l'interface. */
export function metadataLanguage(setting, locale) {
  const fixed = typeof setting === 'string' ? setting.trim() : '';
  if (fixed && fixed.toLowerCase() !== 'auto') return fixed;
  let tag;
  try {
    tag = new Intl.Locale(String(locale || 'en'));
  } catch {
    tag = new Intl.Locale('en');
  }
  const region = tag.region ?? DEFAULT_REGION[tag.language];
  return region ? `${tag.language}-${region}` : tag.language;
}

/** Pays des disponibilités (`FR`) : le réglage `region`, sinon celui de la langue des fiches. */
export function watchRegion(setting, language) {
  const fixed = typeof setting === 'string' ? setting.trim() : '';
  if (fixed && fixed.toLowerCase() !== 'auto') return fixed.toUpperCase();
  try {
    const tag = new Intl.Locale(language);
    return (tag.region ?? DEFAULT_REGION[tag.language] ?? 'US').toUpperCase();
  } catch {
    return 'US';
  }
}

/** Client TMDB d'un plugin : réglages relus à chaque requête. */
export function createTmdb(ctx) {
  const t = translator(ctx.locale);
  const key = () => {
    const v = ctx.settings.get('token');
    return typeof v === 'string' ? v.trim() : '';
  };
  const language = () => metadataLanguage(ctx.settings.get('language'), ctx.locale);
  return {
    t,
    hasKey: () => key() !== '',
    language,
    region: () => watchRegion(ctx.settings.get('region'), language()),
    /** JSON d'une route ; `null` pour 404. Lève `TmdbFailure` (message pour l'utilisateur) sinon. */
    async get(pathname, params = {}, { timeout } = {}) {
      const k = key();
      if (!k) throw new TmdbFailure(t('noKey'), { key: true });
      const { url, headers } = tmdbRequest(pathname, params, k);
      let res;
      try {
        res = await ctx.http.request(url, { headers, ...(timeout ? { timeout } : {}) });
      } catch {
        // Le message du client HTTP n'est pas repris : il est technique (et en anglais).
        throw new TmdbFailure(t('unreachable'));
      }
      if (res.status === 404) return null;
      if (res.status === 401) throw new TmdbFailure(t('keyRefused'), { key: true });
      if (res.status < 200 || res.status > 299) throw new TmdbFailure(t('status', { status: res.status }));
      try {
        return JSON.parse(res.text);
      } catch {
        throw new TmdbFailure(t('unreachable'));
      }
    },
  };
}

/** Exécute `run` ; un échec attendu devient `{ failure }` (le contrat de Mire), le reste est relancé. */
export async function orFailure(run) {
  try {
    return await run();
  } catch (err) {
    if (err instanceof TmdbFailure) return { failure: err.message };
    throw err;
  }
}
