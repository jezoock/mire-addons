// Analyse des noms de fichiers vidéo et classement des résultats par titre. Repris de Mire (`@mire/shared`,
// `src/main/scrape/parse.ts`) : un plugin de code n'importe rien du cœur.

/** Minuscules sans accents (« Été » → « ete »). */
export const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Tout ce qui suit une mention technique (résolution, source, codec, langue…) est retiré du titre.
const JUNK =
  /\b(2160p|1080p|1080i|720p|576p|480p|4k|uhd|hdr10?|dv|bluray|blu-ray|brrip|bdrip|webrip|web-dl|webdl|web|hdtv|dvdrip|dvd|remux|x264|x265|h264|h265|hevc|avc|aac|ac3|eac3|dts|truehd|atmos|10bit|multi|vff|vfq|vfi|vf2|vf|vostfr|vost|truefrench|french|subfrench|custom|proper|repack|extended|unrated|remastered|imax|internal|complete|integrale|intégrale)\b.*$/i;

/** Titre lisible d'après un nom de fichier : « Le.Fabuleux.Destin.1080p » → « Le Fabuleux Destin ». */
export function cleanTitle(s) {
  return String(s)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(JUNK, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s([{-]+$/, '')
    .trim();
}

/** Dossier sans intérêt pour nommer une série (« Saison 1 », « Disc 2 »…). */
const GENERIC_DIR = /^(saison|season|s\d{1,2}|disc|disque|cd|dvd|partie|part|volume|vol)\b/i;

/** Position de la mention d'épisode (S01E03, 1x03) dans le nom, -1 s'il n'y en a pas. */
export function episodeIndex(name) {
  const m = /\bS(\d{1,2})\s*E(\d{1,3})\b/i.exec(name) || /\b(\d{1,2})x(\d{2})\b/.exec(name);
  return m ? m.index : -1;
}

/**
 * « Le.Fabuleux.Destin.2001.1080p.mkv » → film « Le Fabuleux Destin », 2001 ;
 * « S01E03.mkv » dans « Le Bureau des légendes/Saison 1 » → série « Le Bureau des légendes ».
 */
export function parseVideo(item) {
  const name = String(item?.name ?? '');
  const ep = episodeIndex(name);
  if (ep >= 0) {
    let title = cleanTitle(name.slice(0, ep));
    if (!title) {
      const parts = String(item?.dir || '')
        .split(/[\\/]/)
        .filter(Boolean);
      const folder = parts[parts.length - 1] || '';
      title = cleanTitle(GENERIC_DIR.test(folder) ? parts[parts.length - 2] || '' : folder);
    }
    return { type: 'tv', title, year: '' };
  }
  // Une année postérieure à l'année prochaine fait partie du titre (« Blade Runner 2049 »).
  const latest = new Date().getFullYear() + 1;
  const years = [...name.matchAll(/(?:^|[\s.(_[-])((?:19|20)\d{2})(?=$|[\s.)_\]-])/g)].filter((m) => Number(m[1]) <= latest);
  let year = '';
  let title = name;
  if (years.length) {
    const last = years[years.length - 1];
    // Le séparateur capturé devant l'année est absent quand l'année ouvre le nom.
    const before = name.slice(0, last.index + last[0].length - last[1].length);
    if (cleanTitle(before)) {
      year = last[1];
      title = before;
    }
  }
  return { type: 'movie', title: cleanTitle(title), year };
}

/** Clé de comparaison de titres : « Tom & Jerry ! » → « tom and jerry ». */
const titleKey = (s) =>
  fold(s)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Classe des résultats d'après leur titre : identique > commence par > contient, l'ordre d'origine départage.
 * Une année identique à `year` fait passer devant.
 */
export function rankByTitle(list, query, getTitle, getYear, year) {
  const q = titleKey(query);
  return list
    .map((x, i) => {
      const t = titleKey(getTitle(x));
      let score = t === q ? 3 : t.startsWith(`${q} `) || q.startsWith(`${t} `) ? 1.5 : t.includes(q) ? 1 : 0;
      if (year && getYear && String(getYear(x) || '').slice(0, 4) === String(year)) score += 2;
      return { x, score, i };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.x);
}
