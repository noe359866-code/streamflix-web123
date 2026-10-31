'use strict';

/**
 * Addon SOLO-STREAM para Stremio.
 * --------------------------------
 * Regla del proyecto: este addon NO publica catálogos ni fichas,
 * únicamente responde peticiones de `stream`.
 *
 * Funciona sobre las fichas que traen otros addons:
 *   - Cinemeta/IMDb : tt... y tt...:T:E
 *   - Kitsu         : kitsu:{id}:{ep}
 *   - MyAnimeList   : mal:{id}:{ep}
 *   - Compat        : ea:{slug}[:1:{ep}] (ids de la propia web)
 *
 * Para cada petición busca el título en estrenosanime.net, elige la
 * mejor ficha por idioma (💬 Sub · 🌎 Latino · 🇪🇸 Castellano) y devuelve
 * sus servidores: vídeo directo cuando el resolvedor puede, enlace
 * externo en caso contrario, y siempre la página oficial del episodio.
 */

const { addonBuilder } = require('stremio-addon-sdk');
const {
  BASE_URL,
  ROUTES,
  CACHE_TTL,
  DEMO_FALLBACK,
  USER_AGENT,
} = require('./config');
const scraper = require('./scraper');
const { resolveEmbed, discoverViaAjax } = require('./extractors');
const idmap = require('./idmap');
const {
  detectLang,
  parseStreamId,
  serverNameFromUrl,
  qualityFromUrl,
  withTimeout,
} = require('./util');

const manifest = {
  id: 'com.streamflex.estrenosanime',
  version: '1.1.0',
  name: 'Estrenos Anime ES · Streams',
  description:
    '🎌 SOLO STREAMS de anime en español desde estrenosanime.net — 💬 Subtitulado, 🌎 Latino y 🇪🇸 Castellano. Sin catálogos propios: abre cualquier anime desde Cinemeta, Kitsu u otro catálogo y aquí aparecerán sus servidores en español.',
  logo: `${BASE_URL}/uploads/LogoEstrenosanime.png`,
  background: `${BASE_URL}/images/poster-min.webp?v=0.1`,
  // ⬇️ Regla: ÚNICAMENTE el recurso "stream" (sin catalog ni meta).
  resources: ['stream'],
  catalogs: [], // sin catálogos (el linter del SDK exige el array, pero vacío)
  types: ['series', 'movie', 'anime'],
  idPrefixes: ['tt', 'kitsu:', 'mal:', 'ea:'],
  behaviorHints: { configurable: true, configurationRequired: false },
  config: [
    {
      key: 'idioma',
      type: 'select',
      title: '🌐 Idiomas a devolver en los streams',
      options: ['Todos', 'Subtitulado', 'Latino', 'Castellano'],
      default: 'Todos',
    },
    {
      key: 'resolver',
      type: 'select',
      title: '▶️ Reproducción — «Auto» intenta el vídeo directo dentro de Stremio y, si no puede, ofrece abrir el servidor en el navegador',
      options: ['Auto', 'Solo externo'],
      default: 'Auto',
    },
    {
      key: 'descargas',
      type: 'checkbox',
      title: '⬇️ Mostrar también enlaces de descarga (Krakenfiles, Gofile, 1fichier...) como opciones externas',
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

function playableStream({ url, referer, lang, server, slug, episode, isMovie, sourceTitle }) {
  return {
    name: `EstrenosAnime\n${lang.emoji} ${lang.label}`,
    title:
      `▶️ ${server} · ${qualityFromUrl(url)}${isMovie ? '' : ` · Episodio ${episode}`}\n` +
      `${sourceTitle ? `${sourceTitle} · ` : ''}Vídeo directo`,
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

function externalStream({ url, lang, server, episode, isMovie, note, sourceTitle }) {
  return {
    name: `EstrenosAnime\n${lang.emoji} ${lang.label}`,
    title:
      `↗️ Abrir en el navegador: ${server}${isMovie ? '' : ` · Episodio ${episode}`}\n` +
      `${sourceTitle ? `${sourceTitle} · ` : ''}${note || ''}`.trim(),
    externalUrl: url,
  };
}

/**
 * Streams de UN slug+episodio concretos de estrenosanime.net.
 * Nunca lanza: ante cualquier fallo devuelve al menos el enlace oficial.
 */
async function getStreamsForSlug({ slug, episode, isMovie, config, sourceTitle }) {
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
        sourceTitle,
        note: DEMO_FALLBACK
          ? 'Modo demo/sin conexión en este servidor: se abre la web oficial'
          : 'No se pudo leer la página del episodio: se abre la web oficial',
      })
    );
    return streams;
  }

  // 1) Medios directos presentes ya en la página
  for (const url of (watch.directMedia || []).slice(0, 3)) {
    streams.push(playableStream({ url, referer: watchUrl, lang, server: 'Directo', slug, episode, isMovie, sourceTitle }));
  }

  // 2) Embeds (Multiserver...) + auto-descubrimiento AJAX si no hay
  let embeds = watch.embeds || [];
  if (!embeds.length && !streams.length) {
    try {
      const discovered = await discoverViaAjax(watch, watch.finalUrl || watchUrl);
      embeds = discovered.embeds || [];
      for (const url of (discovered.media || []).slice(0, 3)) {
        streams.push(playableStream({ url, referer: watchUrl, lang, server: 'Directo', slug, episode, isMovie, sourceTitle }));
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
      useResolver && resolved[i] && resolved[i].status === 'fulfilled' ? resolved[i].value : null;
    if (result && result.url) {
      streams.push(playableStream({ url: result.url, referer: result.referer, lang, server, slug, episode, isMovie, sourceTitle }));
    } else {
      streams.push(externalStream({
        url: embed.url,
        lang,
        server,
        episode,
        isMovie,
        sourceTitle,
        note: 'Este servidor se reproduce en su web (no admite vídeo directo)',
      }));
    }
  });
  for (const embed of embeds.slice(5, 10)) {
    streams.push(externalStream({
      url: embed.url,
      lang,
      server: embed.name || serverNameFromUrl(embed.url, 'Servidor'),
      episode,
      isMovie,
      sourceTitle,
    }));
  }

  // 3) Descargas (opcional)
  if (isTruthyConfig(config.descargas)) {
    for (const dl of (watch.downloads || []).slice(0, 6)) {
      streams.push(externalStream({
        url: dl.url,
        lang,
        server: `⬇️ ${dl.name || serverNameFromUrl(dl.url, 'Descarga')}`,
        episode,
        isMovie,
        sourceTitle,
        note: 'Enlace de descarga',
      }));
    }
  }

  // 4) Siempre: página oficial del episodio
  streams.push(externalStream({
    url: watch.finalUrl || watchUrl,
    lang,
    server: '🌐 estrenosanime.net',
    episode,
    isMovie,
    sourceTitle,
    note: 'Ver en la web oficial (con todos sus servidores)',
  }));

  return streams;
}

const builder = new addonBuilder(manifest);

/* ---------------------------------------------------------------- */
/* STREAM — el único recurso del addon                               */
/* ---------------------------------------------------------------- */
builder.defineStreamHandler(async ({ type, id, config = {} }) => {
  const cacheOk = {
    cacheMaxAge: CACHE_TTL.stream,
    staleRevalidate: CACHE_TTL.stream,
    staleError: 60 * 60,
  };
  const langFilter = langKeyFromConfig(config);
  const isMovie = type === 'movie';

  // a) Compat: ids propios ea:{slug}[:1:{ep}]
  const own = parseStreamId(id);
  if (own) {
    const streams = await getStreamsForSlug({
      slug: own.slug,
      episode: own.episode,
      isMovie: isMovie || own.isMovie,
      config,
    });
    return { streams, ...cacheOk };
  }

  // b) IDs externos: IMDb (tt), Kitsu, MAL
  const parsed = idmap.parseExternalStreamId(id);
  if (!parsed) return { streams: [] };

  // Orden de idiomas: el elegido en configuración primero (o único)
  const baseOrder = ['lat', 'cast', 'sub'];
  const langOrder = langFilter
    ? [langFilter]
    : baseOrder;

  const resolved = await idmap.resolveExternal(parsed, type, { langOrder })
    .catch((err) => {
      console.error(`[stream:idmap] ${id}: ${err.message}`);
      return { title: '', jobs: [] };
    });

  if (!resolved.jobs.length) {
    // Sin coincidencia en la web: al menos enlazamos su buscador.
    if (resolved.title) {
      const lang = langFilter ? detectLang({ slug: langFilter === 'lat' ? 'x-latino' : langFilter === 'cast' ? 'x-castellano' : 'x' }) : detectLang({});
      return {
        streams: [
          externalStream({
            url: `${BASE_URL}${ROUTES.search(resolved.title)}`,
            lang,
            server: '🔎 Buscar en estrenosanime.net',
            episode: parsed.episode || 1,
            isMovie,
            note: `Sin coincidencia automática para «${resolved.title}»: ábrelo en el buscador de la web`,
          }),
        ],
        cacheMaxAge: 60 * 5,
      };
    }
    return { streams: [] };
  }

  const perJob = await Promise.allSettled(
    resolved.jobs.map((job) =>
      getStreamsForSlug({
        slug: job.slug,
        episode: job.episode,
        isMovie,
        config,
        sourceTitle: job.title,
      })
    )
  );

  const seen = new Set();
  const streams = [];
  for (const r of perJob) {
    if (r.status !== 'fulfilled') continue;
    for (const s of r.value) {
      const key = `${s.url || ''}|${s.externalUrl || ''}|${s.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      streams.push(s);
    }
  }
  return { streams, ...cacheOk };
});

module.exports = { builder, manifest, getStreamsForSlug };
