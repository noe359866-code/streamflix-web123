'use strict';

/**
 * Datos DEMO (offline).
 * ---------------------
 * Solo se usan si DEMO_FALLBACK=1 y la web/Cinemeta no responden (p. ej.
 * en la vista previa de Arena, donde el sandbox no tiene salida a
 * estrenosanime.net). Son títulos/posters REALES recogidos durante la
 * investigación, para probar el mapeo IMDb->streams sin red.
 * En un despliegue normal (Render/Beamup/VPS) esto nunca se activa.
 * (demoCatalogMetas/demoMeta quedan como utilidades históricas; el addon
 *  v1.1+ es solo-stream y solo usa demoSearchItems/DEMO_IMDB_TITLES.)
 */

const { LANGS, BASE_URL } = require('./config');
const { itemToMetaPreview, detailToMeta } = require('./scraper');
const { normalizeTitle, titleTokens } = require('./util');

/** IMDb -> título, solo para probar el modo solo-stream sin red. */
const DEMO_IMDB_TITLES = {
  tt0388629: 'One Piece', // One Piece
  tt0409591: 'Naruto',
  tt0434665: 'Bleach',
  tt7441658: 'Black Clover',
  tt12343534: 'Jujutsu Kaisen',
  tt9335498: 'Kimetsu no Yaiba', // Demon Slayer
  tt4644488: 'Dragon Ball Super',
};

/** Buscador offline sobre DEMO_ITEMS (misma forma que scraper.searchItems). */
function demoSearchItems(query) {
  const qTokens = titleTokens(query, { stripSeason: true });
  if (!qTokens.length) return [];
  const qNorm = normalizeTitle(query);
  return DEMO_ITEMS.filter((item) => {
    const tNorm = normalizeTitle(item.title);
    if (tNorm.includes(qNorm) || qNorm.includes(tNorm)) return true;
    const tTokens = titleTokens(item.title, { stripSeason: true });
    return qTokens.some((t) => tTokens.includes(t));
  });
}

const P = (hash) => `${BASE_URL}/uploads/anime/${hash}.jpg`;

const DEMO_ITEMS = [
  // Subtitulado
  { slug: 'one-piece', title: 'One Piece', poster: P('4d6f6dbcdfc6b127fd8d266ce1e80703'), lang: LANGS.sub, siteType: 'TV', estado: 'En Emision', year: '1999', epCurrent: 1180, epTotal: 1180, snippet: 'Monkey D. Luffy quiere convertirse en el Rey de los Piratas y encontrar el tesoro One Piece.' },
  { slug: 'black-clover-2nd-season', title: 'Black Clover 2nd Season', poster: P('f67b8a1b0530beae4eb6e2bab075947f'), lang: LANGS.sub, siteType: 'TV', estado: 'En Emision', year: '2026', epCurrent: 4, epTotal: null, snippet: 'Asta entrena para dominar la Union del Demonio y rescatar a los capitanes.' },
  { slug: 'dragon-ball-super-beerus', title: 'Dragon Ball Super: Beerus', poster: P('a9481d5baa97a525b7b2522cce4bcd78'), lang: LANGS.sub, siteType: 'TV', estado: 'En Emision', year: '2026', epCurrent: 3, epTotal: null, snippet: 'Beerus despierta y llega a la Tierra buscando un rival a su altura: Goku.' },
  { slug: 'naruto-shippuden', title: 'Naruto Shippuden', poster: P('ef73fe96719dd3d3ffbebd95a15cde97'), lang: LANGS.sub, siteType: 'TV', estado: 'Completado', year: '2017', epCurrent: 500, epTotal: 500, snippet: '' },
  { slug: 'yeon-ui-pyeonji', title: 'Yeon-ui Pyeonji', poster: P('86fa31a2e8181c5a9e70e6477524a0b4'), lang: LANGS.sub, siteType: 'Pelicula', estado: 'Completado', year: '2025', epCurrent: 1, epTotal: 1, snippet: 'Sori encuentra una carta anonima bajo su escritorio que la lleva a una busqueda por toda la escuela.' },
  // Latino
  { slug: 'one-piece-latino', title: 'One Piece (Latino)', poster: P('7314d2b028ba53d50511f986d45918a1'), lang: LANGS.lat, siteType: 'TV', estado: 'En Emision', year: '1999', epCurrent: 877, epTotal: 1168, snippet: 'One Piece en espanol latino: Luffy y los Sombrero de Paja en busca del gran tesoro.' },
  { slug: 'black-clover-latino', title: 'Black Clover (Latino)', poster: P('e068c5f531f99692bf4c89ddf959b0da'), lang: LANGS.lat, siteType: 'TV', estado: 'Completado', year: '2017', epCurrent: 170, epTotal: 170, snippet: '' },
  { slug: 'jujutsu-kaisen-latino', title: 'Jujutsu Kaisen (Latino)', poster: P('93f986843adeb434732a23fb8865ac2d'), lang: LANGS.lat, siteType: 'TV', estado: 'Completado', year: '2020', epCurrent: 24, epTotal: 24, snippet: '' },
  { slug: 'kimetsu-no-yaiba-temporada-1-latino', title: 'Kimetsu no Yaiba Temporada 1 (Latino)', poster: P('72e98453eac6dfeb9d0166da7b6e3f8a'), lang: LANGS.lat, siteType: 'TV', estado: 'Completado', year: '2019', epCurrent: 26, epTotal: 26, snippet: '' },
  { slug: 'naruto-latino', title: 'Naruto (Latino)', poster: P('001bd523023ce51e4cee7cfd4b697277'), lang: LANGS.lat, siteType: 'TV', estado: 'Completado', year: '2002', epCurrent: 220, epTotal: 220, snippet: '' },
  { slug: 'bleach-latino', title: 'Bleach (Latino)', poster: P('597cebb8f110e5028ac5cd11c583c7da'), lang: LANGS.lat, siteType: 'TV', estado: 'Completado', year: '2004', epCurrent: 366, epTotal: 366, snippet: '' },
  // Castellano
  { slug: 'magic-knight-rayearth-2026-castellano', title: 'Magic Knight Rayearth 2026 (Castellano)', poster: P('7a3622b1739537235ac2975d225bda74'), lang: LANGS.cast, siteType: 'TV', estado: 'En Emision', year: '2026', epCurrent: 1, epTotal: 21, snippet: '' },
  { slug: 'boku-no-hero-academia-i-am-a-hero-too-castellano', title: 'Boku no Hero Academia: I Am a Hero Too (Castellano)', poster: P('660edeb9c45ecc79ae56cbe6613cec19'), lang: LANGS.cast, siteType: 'ONA', estado: 'Completado', year: '2026', epCurrent: 1, epTotal: 1, snippet: '' },
  { slug: 'tokyo-godfathers-los-padrinos-de-tokio-castellano', title: 'Tokyo Godfathers: Los padrinos de Tokio (Castellano)', poster: P('d2ed615e0328b0b504e94fd2ad0b3bb3'), lang: LANGS.cast, siteType: 'Pelicula', estado: 'Completado', year: '2003', epCurrent: 1, epTotal: 1, snippet: '' },
  { slug: 'guardianes-de-la-noche-kimetsu-no-yaiba-la-fortaleza-infinita-parte-1-akaza-sairai-castellano', title: 'Guardianes de la noche: Kimetsu no Yaiba - La fortaleza infinita (Castellano)', poster: P('050059b1f96baa9fe2a33b10b2708c0e'), lang: LANGS.cast, siteType: 'Pelicula', estado: 'Completado', year: '2025', epCurrent: 1, epTotal: 1, snippet: '' },
];

function demoCatalogMetas({ type, langKey, search } = {}) {
  let items = DEMO_ITEMS;
  if (search) {
    const q = String(search).toLowerCase();
    items = items.filter((i) => i.title.toLowerCase().includes(q) || i.slug.includes(q.replace(/\s+/g, '-')));
  }
  if (type) {
    items = items.filter((i) => (i.siteType === 'Pelicula' ? 'movie' : 'series') === type);
  }
  if (langKey) items = items.filter((i) => i.lang.key === langKey);
  return items.map((i) => ({
    ...itemToMetaPreview(i),
    description: `⚠️ MODO DEMO (sin conexión a estrenosanime.net)\n\n${itemToMetaPreview(i).description}`,
  }));
}

function demoMeta(slug) {
  const item = DEMO_ITEMS.find((i) => i.slug === slug);
  if (!item) return null;
  const detail = {
    slug: item.slug,
    title: item.title,
    poster: item.poster,
    background: item.poster,
    description: `⚠️ MODO DEMO: ficha de ejemplo con datos reales recogidos en la investigación. Despliega el addon con salida a internet para ver la ficha completa.\n\n${item.snippet || ''}`,
    lang: item.lang,
    siteType: item.siteType,
    estado: item.estado,
    year: item.year,
    duration: item.siteType === 'Pelicula' ? '1 hr 36 min' : '24 Min',
    aired: '',
    studios: '',
    genres: [],
    episodesAvailable: item.epCurrent || 1,
    episodesTotal: item.epTotal || null,
    episodeNumbers: [],
    alternatives: [],
    trailerYtId: '',
    rating: null,
  };
  return detailToMeta(detail);
}

module.exports = { DEMO_ITEMS, demoCatalogMetas, demoMeta, demoSearchItems, DEMO_IMDB_TITLES };
