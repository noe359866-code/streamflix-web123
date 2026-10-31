'use strict';

/**
 * Definición del addon de Stremio: manifiesto + handlers.
 *
 * Catálogos (todos salen de rutas reales de estrenosanime.net):
 *   Series:  Populares · Últimos EP Sub/Latino/Castellano · Agregados ·
 *            Actualizados · En emisión · Por género · Por formato
 *   Películas: Películas · Por género
 * La búsqueda usa /search?keyword= y se filtra por idioma en el addon
 * (la web separa Sub/Latino/Castellano como fichas distintas).
 */

const { addonBuilder } = require('stremio-addon-sdk');
const {
  BASE_URL,
  ROUTES,
  GENRES,
  CACHE_TTL,
  DEMO_FALLBACK,
  USER_AGENT,
} = require('./config');
const scraper = require('./scraper');
const { resolveEmbed, discoverViaAjax } = require('./extractors');
const demo = require('./demo');
const {
  detectLang,
  parseStreamId,
  serverNameFromUrl,
  qualityFromUrl,
  withTimeout,
} = require('./util');

const searchExtra = [
  { name: 'search', isRequired: false },
  { name: 'skip', isRequired: false },
];
const skipExtra = [{ name: 'skip', isRequired: false }];

/** Catálogo -> ruta del sitio (los de género/formato/búsqueda son dinámicos). */
const CATALOG_PATHS = {
  'ea-series-popular': ROUTES.popular,
  'ea-episodios-sub': ROUTES.ultimoSubtitulado,
  'ea-episodios-lat': ROUTES.ultimoLatino,
  'ea-episodios-cast': ROUTES.ultimoCastellano,
  'ea-series-agregados': ROUTES.ultimoAnime,
  'ea-series-actualizados': ROUTES.ultimoActualizado,
  'ea-series-emision': ROUTES.enEmision,
  'ea-peliculas': ROUTES.peliculas,
};

/** Catálogos que ya son de un idioma concreto (no se les aplica el filtro global). */
const CATALOG_FIXED_LANG = {
  'ea-episodios-sub': 'sub',
  'ea-episodios-lat': 'lat',
  'ea-episodios-cast': 'cast',
};

const manifest = {
  id: 'com.streamflex.estrenosanime',
  version: '1.0.0',
  name: 'Estrenos Anime ES',
  description:
    '🌸 Anime en español desde estrenosanime.net — 💬 Subtitulado, 🌎 Latino y 🇪🇸 Castellano. Series, películas, últimos episodios, populares, por género y buscador. Sin anuncios dentro de Stremio.',
  logo: `${BASE_URL}/uploads/LogoEstrenosanime.png`,
  background: `${BASE_URL}/images/poster-min.webp?v=0.1`,
  resources: ['catalog', 'meta', 'stream'],
  types: ['series', 'movie'],
  idPrefixes: ['ea:'],
  catalogs: [
    { type: 'series', id: 'ea-series-popular', name: '🔥 Populares', extra: searchExtra },
    { type: 'series', id: 'ea-episodios-sub', name: '💬 Últimos episodios · Sub Español', extra: skipExtra },
    { type: 'series', id: 'ea-episodios-lat', name: '🌎 Últimos episodios · Latino', extra: skipExtra },
    { type: 'series', id: 'ea-episodios-cast', name: '🇪🇸 Últimos episodios · Castellano', extra: skipExtra },
    { type: 'series', id: 'ea-series-agregados', name: '🆕 Últimos animes agregados', extra: skipExtra },
    { type: 'series', id: 'ea-series-actualizados', name: '🔄 Recién actualizados', extra: skipExtra },
    { type: 'series', id: 'ea-series-emision', name: '📺 En emisión', extra: skipExtra },
    {
      type: 'series',
      id: 'ea-series-genero',
      name: '🎭 Series por género',
      extra: [
        { name: 'genre', isRequired: true, options: GENRES },
        { name: 'skip', isRequired: false },
      ],
    },
    {
      type: 'series',
      id: 'ea-series-formato',
      name: '🎞️ Por formato (TV/OVA/ONA...)',
      extra: [
        { name: 'formato', isRequired: true, options: ['TV', 'OVA', 'ONA', 'Especial'] },
        { name: 'skip', isRequired: false },
      ],
    },
    { type: 'movie', id: 'ea-peliculas', name: '🎬 Películas de anime', extra: searchExtra },
    {
      type: 'movie',
      id: 'ea-peliculas-genero',
      name: '🎭 Películas por género',
      extra: [
        { name: 'genre', isRequired: true, options: GENRES },
        { name: 'skip', isRequired: false },
      ],
    },
  ],
  behaviorHints: { configurable: true, configurationRequired: false },
  config: [
    {
      key: 'idioma',
      type: 'select',
      title: '🌐 Idioma preferido — filtra los catálogos mixtos y la búsqueda (los catálogos "Últimos episodios" ya son por idioma)',
      options: ['Todos', 'Subtitulado', 'Latino', 'Castellano'],
      default: 'Todos',
    },
    {
      key: 'resolver',
      type: 'select',
      title: '▶️ Reproducción — "Auto" intenta obtener el vídeo directo de cada servidor y, si no puede, ofrece abrirlo en el navegador',
      options: ['Auto', 'Solo externo'],
      default: 'Auto',
    },
    {
      key: 'descargas',
      type: 'checkbox',
      title: '⬇️ Mostrar también los enlaces de descarga (Krakenfiles, Gofile, 1fichier...) como opciones externas',
    },
  ],
};

function langKeyFromConfig(config) {
  const v = String((config && config.idioma) || 'Todos');
  if (/latino/i.test(v)) return 'lat';
  if (/castellano/i.test(v)) return 'cast';
  if (/subtitulado/i.test(v)) return 'sub';
  return null;
}

function isTruthyConfig(value) {
  return value === true || value === 'on' || value === 'true' || value === '1';
}

const builder = new addonBuilder(manifest);

/* ---------------------------------------------------------------- */
/* CATALOG                                                           */
/* ---------------------------------------------------------------- */
builder.defineCatalogHandler(async ({ type, id, extra = {}, config = {} }) => {
  const skip = Math.max(0, parseInt(extra.skip, 10) || 0);
  const fixedLang = CATALOG_FIXED_LANG[id] || null;
  const configLang = langKeyFromConfig(config);

  let sourcePath;
  let langKey = fixedLang;
  if (extra.search) {
    sourcePath = ROUTES.search(extra.search);
    if (!langKey) langKey = configLang;
  } else if (id.endsWith('-genero')) {
    sourcePath = ROUTES.genero(extra.genre || 'Accion');
    if (!langKey) langKey = configLang;
  } else if (id === 'ea-series-formato') {
    sourcePath = ROUTES.tipo(extra.formato || 'TV');
    if (!langKey) langKey = configLang;
  } else {
    sourcePath = CATALOG_PATHS[id] || ROUTES.popular;
    if (!langKey) langKey = configLang;
  }

  try {
    const metas = await scraper.getCatalogMetas(sourcePath, skip, { type, langKey });
    return {
      metas,
      cacheMaxAge: CACHE_TTL.catalog,
      staleRevalidate: CACHE_TTL.catalog * 2,
      staleError: 24 * 60 * 60,
    };
  } catch (err) {
    console.error(`[catalog] ${id} (${sourcePath}): ${err.message}`);
    if (DEMO_FALLBACK) {
      return {
        metas: demo.demoCatalogMetas({ type, langKey, search: extra.search }),
        cacheMaxAge: 60,
      };
    }
    return { metas: [], cacheMaxAge: 60 };
  }
});

/* ---------------------------------------------------------------- */
/* META                                                              */
/* ---------------------------------------------------------------- */
builder.defineMetaHandler(async ({ type, id }) => {
  const slug = String(id || '').replace(/^ea:/, '');
  if (!slug) return { meta: null };
  try {
    const meta = await scraper.getMetaDetail(slug);
    return {
      meta,
      cacheMaxAge: CACHE_TTL.meta,
      staleRevalidate: CACHE_TTL.meta,
      staleError: 7 * 24 * 60 * 60,
    };
  } catch (err) {
    console.error(`[meta] ${slug}: ${err.message}`);
    if (DEMO_FALLBACK) {
      const meta = demo.demoMeta(slug);
      if (meta) return { meta, cacheMaxAge: 60 };
    }
    return { meta: null };
  }
});

/* ---------------------------------------------------------------- */
/* STREAM                                                            */
/* ---------------------------------------------------------------- */
function playableStream({ url, referer, lang, server, slug, episode, isMovie }) {
  return {
    name: `EstrenosAnime\n${lang.emoji} ${lang.label}`,
    title: `▶️ ${server} · ${qualityFromUrl(url)}${isMovie ? '' : ` · Episodio ${episode}`}\nVídeo directo`,
    url,
    behaviorHints: {
      notWebReady: true,
      bingeGroup: isMovie ? undefined : `estrenosanime-${slug}-${server.toLowerCase()}`,
      proxyHeaders: {
        request: {
          Referer: referer || `${BASE_URL}/`,
          'User-Agent': USER_AGENT,
        },
      },
    },
  };
}

function externalStream({ url, lang, server, episode, isMovie, note }) {
  return {
    name: `EstrenosAnime\n${lang.emoji} ${lang.label}`,
    title: `↗️ Abrir en el navegador: ${server}${isMovie ? '' : ` · Episodio ${episode}`}${note ? `\n${note}` : ''}`,
    externalUrl: url,
  };
}

builder.defineStreamHandler(async ({ type, id, config = {} }) => {
  const parsed = parseStreamId(id);
  if (!parsed) return { streams: [] };
  const { slug, episode } = parsed;
  const isMovie = type === 'movie' || parsed.isMovie;
  const lang = detectLang({ slug });
  const watchUrl = `${BASE_URL}${ROUTES.watch(slug, episode)}`;
  const streams = [];

  let watch;
  try {
    watch = await scraper.getWatch(slug, episode);
  } catch (err) {
    console.error(`[stream] ${slug} ep${episode}: ${err.message}`);
    streams.push(
      externalStream({
        url: watchUrl,
        lang,
        server: 'estrenosanime.net',
        episode,
        isMovie,
        note: DEMO_FALLBACK
          ? 'Modo demo/sin conexión en este servidor: se abre la web oficial'
          : 'No se pudo leer la página del episodio: se abre la web oficial',
      })
    );
    return { streams, cacheMaxAge: 30 };
  }

  // 1) Medios directos ya presentes en la página
  for (const url of (watch.directMedia || []).slice(0, 3)) {
    streams.push(
      playableStream({ url, referer: watchUrl, lang, server: 'Directo', slug, episode, isMovie })
    );
  }

  // 2) Embeds (Multiserver, etc.) — si no hay, auto-descubrimiento AJAX
  let embeds = watch.embeds || [];
  if (!embeds.length && !streams.length) {
    try {
      const discovered = await discoverViaAjax(watch, watch.finalUrl || watchUrl);
      embeds = discovered.embeds || [];
      for (const url of (discovered.media || []).slice(0, 3)) {
        streams.push(
          playableStream({ url, referer: watchUrl, lang, server: 'Directo', slug, episode, isMovie })
        );
      }
    } catch (err) {
      console.error(`[stream:ajax] ${slug} ep${episode}: ${err.message}`);
    }
  }

  const useResolver = String(config.resolver || 'Auto') !== 'Solo externo';
  const toResolve = embeds.slice(0, 5);
  const resolved = useResolver
    ? await Promise.allSettled(
        toResolve.map((e) => withTimeout(resolveEmbed(e.url, watchUrl), 22000, null))
      )
    : [];

  toResolve.forEach((embed, i) => {
    const server = embed.name || serverNameFromUrl(embed.url, 'Multiserver');
    const result =
      useResolver && resolved[i] && resolved[i].status === 'fulfilled'
        ? resolved[i].value
        : null;
    if (result && result.url) {
      streams.push(
        playableStream({ url: result.url, referer: result.referer, lang, server, slug, episode, isMovie })
      );
    } else {
      streams.push(
        externalStream({
          url: embed.url,
          lang,
          server,
          episode,
          isMovie,
          note: 'Este servidor se reproduce en su web (no admite vídeo directo)',
        })
      );
    }
  });
  // Embeds extra sin resolver -> también como externos
  for (const embed of embeds.slice(5, 10)) {
    streams.push(
      externalStream({
        url: embed.url,
        lang,
        server: embed.name || serverNameFromUrl(embed.url, 'Servidor'),
        episode,
        isMovie,
      })
    );
  }

  // 3) Descargas (opcional por configuración)
  if (isTruthyConfig(config.descargas)) {
    for (const dl of (watch.downloads || []).slice(0, 6)) {
      streams.push(
        externalStream({
          url: dl.url,
          lang,
          server: `⬇️ ${dl.name || serverNameFromUrl(dl.url, 'Descarga')}`,
          episode,
          isMovie,
          note: 'Enlace de descarga',
        })
      );
    }
  }

  // 4) Siempre: la página oficial del episodio
  streams.push(
    externalStream({
      url: watch.finalUrl || watchUrl,
      lang,
      server: '🌐 estrenosanime.net',
      episode,
      isMovie,
      note: 'Ver en la web oficial (con todos sus servidores)',
    })
  );

  return {
    streams,
    cacheMaxAge: CACHE_TTL.stream,
    staleRevalidate: CACHE_TTL.stream,
    staleError: 60 * 60,
  };
});

module.exports = { builder, manifest };
