'use strict';

/**
 * Registro de proveedores de streams.
 *
 * Cada proveedor sabe buscar fichas y leer su página de reproducción, pero
 * con modelos distintos que aquí se normalizan a un formato común:
 *   watch normalizado = {
 *     finalUrl,
 *     directMedia: [{ url, lang }],
 *     embeds:      [{ name, url, origin, lang }],
 *     downloads:   [{ name, url, lang }],
 *   }
 * (`lang` = objeto de config.LANGS: sub · lat · cast)
 *
 * - EstrenosAnime: una ficha (slug) por idioma (-latino / -castellano / sub).
 * - InfinityAnime: una ficha por título; Sub y Dub conviven en el episodio.
 */

const { BASE_URL, INF_BASE_URL, ROUTES, INF_ROUTES, LANGS } = require('./config');
const scraper = require('./scraper');
const infinity = require('./infinity');

const PROVIDERS = [
  {
    id: 'estrenos',
    name: 'EstrenosAnime',
    prefix: 'ea:',
    baseUrl: BASE_URL,
    multiLang: false,
    search: (q) => scraper.searchItems(q),
    getWatchRaw: (slug, ep) => scraper.getWatch(slug, ep),
    watchUrl: (slug, ep) => `${BASE_URL}${ROUTES.watch(slug, ep)}`,
  },
  {
    id: 'infinity',
    name: 'InfinityAnime',
    prefix: 'ia:',
    baseUrl: INF_BASE_URL,
    multiLang: true,
    search: (q) => infinity.searchInf(q),
    getWatchRaw: (slug, ep) => infinity.getWatchInf(slug, ep),
    watchUrl: (slug, ep) => `${INF_BASE_URL}${INF_ROUTES.watch(slug, ep)}`,
  },
];

const PROVIDERS_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/** Filtro de la configuración «proveedores» → ids activos en orden. */
function activeProviders(configProviders) {
  const v = String(configProviders || 'Todos');
  if (/Estrenos/i.test(v)) return ['estrenos'];
  if (/Infinity/i.test(v)) return ['infinity'];
  return PROVIDERS.map((p) => p.id);
}

/**
 * Normaliza el watch crudo de un proveedor.
 * En EstrenosAnime todo hereda el idioma de la ficha; en InfinityAnime cada
 * elemento ya trae su idioma (grupo Sub/Dub o texto de la descarga).
 */
function normalizeWatch(provider, watch, fallbackLang) {
  const fb = fallbackLang || LANGS.sub;
  const withLang = (x) => (typeof x === 'string' ? { url: x, lang: fb } : { ...x, lang: x.lang || fb });
  return {
    finalUrl: watch.finalUrl,
    directMedia: (watch.directMedia || []).map(withLang),
    embeds: (watch.embeds || []).map(withLang),
    downloads: (watch.downloads || []).map(withLang),
  };
}

async function getWatch(providerId, slug, episode, fallbackLang) {
  const provider = PROVIDERS_BY_ID[providerId];
  if (!provider) throw new Error(`Proveedor desconocido: ${providerId}`);
  const raw = await provider.getWatchRaw(slug, episode);
  return { provider, raw, ...normalizeWatch(provider, raw, fallbackLang) };
}

module.exports = { PROVIDERS, PROVIDERS_BY_ID, activeProviders, normalizeWatch, getWatch };
