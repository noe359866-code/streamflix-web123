'use strict';

/**
 * Registro de proveedores de streams (sin demos, sin configuración).
 *
 * Todos los proveedores se consultan siempre. Cada uno declara su modo de
 * selección de fichas y cómo construir sus URLs; el watch crudo se
 * normaliza a un formato común:
 *   { finalUrl, directMedia:[{url,lang}], embeds:[{name,url,origin,lang}],
 *     downloads:[{name,url,lang}] }
 *
 * Modos (`mode`):
 *  - 'perLang': la web separa cada idioma como ficha/slug distinto
 *               (EstrenosAnime, Latanime) -> 1 trabajo por idioma.
 *  - 'single' : una ficha por título y los idiomas se resuelven en la
 *               página del episodio (InfinityAnime, AnimeJara, AnimeD23).
 */

const {
  BASE_URL, INF_BASE_URL, JARA_BASE_URL, LAT_BASE_URL, D23_BASE_URL,
  ROUTES, INF_ROUTES, LANGS,
} = require('./config');
const scraper = require('./scraper');
const infinity = require('./infinity');
const extra = require('./extra-providers');

const PROVIDERS = [
  {
    id: 'estrenos',
    name: 'EstrenosAnime',
    prefix: 'ea:',
    baseUrl: BASE_URL,
    mode: 'perLang',
    multiLang: false,
    search: (q) => scraper.searchItems(q),
    getWatchRaw: (slug, ep) => scraper.getWatch(slug, ep),
    watchUrl: (slug, ep) => `${BASE_URL}${ROUTES.watch(slug, ep)}`,
    searchUrl: (q) => `${BASE_URL}${ROUTES.search(q)}`,
  },
  {
    id: 'infinity',
    name: 'InfinityAnime',
    prefix: 'ia:',
    baseUrl: INF_BASE_URL,
    mode: 'single',
    multiLang: true,
    search: (q) => infinity.searchInf(q),
    getWatchRaw: (slug, ep) => infinity.getWatchInf(slug, ep),
    watchUrl: (slug, ep) => `${INF_BASE_URL}${INF_ROUTES.watch(slug, ep)}`,
    searchUrl: (q) => `${INF_BASE_URL}${INF_ROUTES.directorioSearch(q)}`,
  },
  {
    id: 'animejara',
    name: 'AnimeJara',
    prefix: 'aj:',
    baseUrl: JARA_BASE_URL,
    mode: 'single',
    multiLang: true,
    search: (q) => extra.searchJara(q),
    getWatchRaw: (slug, ep, opts) => extra.getWatchJara(slug, ep, opts),
    watchUrl: (slug, ep, opts) => extra.jaraWatchUrl(slug, ep, opts || {}),
    searchUrl: (q) => `${JARA_BASE_URL}/catalogo?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'latanime',
    name: 'Latanime',
    prefix: 'lt:',
    baseUrl: LAT_BASE_URL,
    mode: 'perLang',
    multiLang: false,
    search: (q) => extra.searchLat(q),
    getWatchRaw: (slug, ep) => extra.getWatchLat(slug, ep),
    watchUrl: (slug, ep) => `${LAT_BASE_URL}/ver/${slug}-episodio-${ep}`,
    searchUrl: (q) => `${LAT_BASE_URL}/buscar?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'animed23',
    name: 'AnimeD23',
    prefix: 'd23:',
    baseUrl: D23_BASE_URL,
    mode: 'single',
    multiLang: true,
    search: (q) => extra.searchD23(q),
    getWatchRaw: (slug, ep) => extra.getWatchD23(slug, ep),
    watchUrl: (slug, ep) => `${D23_BASE_URL}/capitulo/${slug}-ep-${ep}/`,
    searchUrl: (q) => `${D23_BASE_URL}/?s=${encodeURIComponent(q)}`,
  },
];

const PROVIDERS_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/** Sin configurador: siempre están activos todos los proveedores. */
function activeProviders() {
  return PROVIDERS.map((p) => p.id);
}

/**
 * Normaliza el watch crudo de un proveedor. En modos `perLang` todo hereda
 * el idioma de la ficha si el parser no lo trae; en modo `single` cada
 * elemento ya trae su idioma.
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

async function getWatch(providerId, slug, episode, fallbackLang, opts = {}) {
  const provider = PROVIDERS_BY_ID[providerId];
  if (!provider) throw new Error(`Proveedor desconocido: ${providerId}`);
  const raw = await provider.getWatchRaw(slug, episode, { fallbackLang, ...opts });
  return { provider, raw, ...normalizeWatch(provider, raw, fallbackLang) };
}

module.exports = { PROVIDERS, PROVIDERS_BY_ID, activeProviders, normalizeWatch, getWatch };
