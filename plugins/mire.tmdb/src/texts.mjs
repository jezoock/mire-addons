// Messages du plugin montrés par Mire (bilan d'une récupération, erreurs, « Où regarder »). Ce sont ceux de la section
// `tmdb` de i18n/fr.json et i18n/en.json (un test vérifie qu'ils sont identiques) : l'hôte isolé ne lit pas les
// catalogues, le code les embarque.

const TEXTS = {
  fr: {
    skipped: 'vidéos (clé TMDB absente)',
    noKey: 'Ajoutez une clé TMDB dans les réglages du plugin TMDB pour chercher les films et séries.',
    watchNoKey: 'Ajoutez une clé TMDB gratuite pour voir ici les films et séries correspondants, avec le service où les regarder.',
    unreachable: 'Le catalogue TMDB est injoignable. Vérifiez la connexion Internet.',
    keyRefused: 'Clé TMDB refusée. Vérifiez-la dans les réglages du plugin TMDB.',
    status: 'TMDB a répondu avec le code {status}.',
    series: 'Série',
    movie: 'Film',
    attribution: 'Catalogue : TMDB. Disponibilités : JustWatch.',
  },
  en: {
    skipped: 'videos (no TMDB key)',
    noKey: 'Add a TMDB key in the TMDB plugin settings to look up movies and series.',
    watchNoKey: 'Add a free TMDB key to see matching movies and series here, with the service where you can watch them.',
    unreachable: "Can't reach the TMDB catalogue. Check your internet connection.",
    keyRefused: 'TMDB key refused. Check it in the TMDB plugin settings.',
    status: 'TMDB responded with code {status}.',
    series: 'Series',
    movie: 'Movie',
    attribution: 'Catalogue: TMDB. Availability: JustWatch.',
  },
};

export const TEXT_CATALOGS = TEXTS;

/** Traduction d'après la langue de l'interface (`fr`, `fr-BE`… → français ; sinon anglais). */
export function translator(locale) {
  const lang = /^fr\b/i.test(String(locale || '')) ? 'fr' : 'en';
  return (key, vars = {}) => TEXTS[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
