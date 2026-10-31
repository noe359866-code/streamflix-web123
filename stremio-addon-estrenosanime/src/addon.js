'use strict';

/**
 * Addon SOLO-STREAM para Stremio (multi-proveedor).
 * -------------------------------------------------
 * Regla del proyecto: este addon NO publica catálogos ni fichas,
 * únicamente responde peticiones de `stream`.
 *
 * Proveedores:
 *   - EstrenosAnime  (estrenosanime.net) — Sub · Latino · Castellano,
 *                      una ficha por idioma en la web.
 *   - InfinityAnime  (infinityanime.net) — Sub + Latino (Dub) en la
 *                      misma ficha/página de episodio.
 *
 * Funciona sobre las fichas que traen otros addons:
 *   - Cinemeta/IMDb : tt... y tt...:T:E
 *   - Kitsu         : kitsu:{id}:{ep}
 *   - MyAnimeList   : mal:{id}:{ep}
 *   - Compat        : ea:{slug}[:1:{ep}] · ia:{slug}[:1:{ep}]
 *
 * Para cada petición busca el título en los proveedores activos y
 * devuelve sus servidores etiquetados por proveedor e idioma:
 * vídeo directo cuando el resolvedor puede, enlace externo en caso
 * contrario, y siempre la página oficial del episodio.
 */

const { addonBuilder } = require('stremio-addon-sdk');
const {
  BASE_URL,
  INF_BASE_URL,
  ROUTES,
  INF_ROUTES,
  LANGS,
  CACHE_TTL,
  DEMO_FALLBACK,
  USER_AGENT,
} = require('./config');
const providers = require('./providers');
const { PROVIDERS, PROVIDERS_BY_ID } = providers;
const { resolveEmbed, discoverViaAjax } = require('./extractors');
const idmap = require('./idmap');
const {
  detectLang,
  serverNameFromUrl,
  qualityFromUrl,
  withTimeout,
  hostOf,
} = require('./util');

const manifest = {
  id: 'com.streamflex.estrenosanime',
  version: '1.2.0',
  name: 'Anime Español Multi · Streams',
  description:
    '🎌 SOLO STREAMS de anime en español desde EstrenosAnime e InfinityAnime — 💬 Subtitulado, 🌎 Latino y 🇪🇸 Castellano. Sin catálogos propios: abre cualquier anime desde Cinemeta, Kitsu u otro catálogo y aquí aparecerán sus servidores en español.',
  logo: `${BASE_URL}/uploads/LogoEstrenosanime.png`,
  background: `${BASE_URL}/images/poster-min.webp?v=0.1`,
  // ⬇️ Regla: ÚNICAMENTE el recurso "stream" (sin catalog ni meta).
  resources: ['stream'],
  catalogs: [], // sin catálogos (el linter del SDK exige el array, pero vacío)
  types: ['series', 'movie', 'anime'],
  idPrefixes: ['tt', 'kitsu:', 'mal:', 'ea:', 'ia:'],
  behaviorHints: { configurable: true, configurationRequired: false },
  config: [
    {
      key: 'proveedores',
      type: 'select',
      title: '🌐 Proveedores (webs) a consultar',
      options: ['Todos', 'EstrenosAnime', 'InfinityAnime'],
      default: 'Todos',
    },
    {
      key: 'idioma',
      type: 'select',
      title: '🗣️ Idiomas a devolver en los streams (InfinityAnime: Sub/Latino; el Castellano lo aporta EstrenosAnime)',
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
      title: '⬇️ Mostrar también enlaces de descarga (Mega, 1fichier, Krakenfiles...) como opciones externas',
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

const providerIdx = (id) => PROVIDERS.findIndex((p) => p.id === id);

/* Los streams se construyen como { stream, langKey, providerIdx, kind }
   para poder ordenarlos al final: idioma → proveedor → tipo.          */
const KIND = { playable: 0, external: 1, download: 2, official: 3, fallback: 4 };

function entry(stream, lang, providerId, kind) {
  return { stream, langKey: lang ? lang.key : 'sub', providerIdx: providerIdx(providerId), kind };
}

function playableEntry({ provider, url, referer, lang, server, slug, episode, isMovie, sourceTitle }) {
  const stream = {
    name: `${provider.name}\n${lang.emoji} ${lang.label}`,
    title:
      `▶️ ${server} · ${qualityFromUrl(url)}${isMovie ? '' : ` · Episodio ${episode}`}\n` +
      `${sourceTitle ? `${sourceTitle} · ` : ''}Vídeo directo`,
    url,
    behaviorHints: {
      notWebReady: true,
      bingeGroup: isMovie ? undefined : `${provider.id}-${slug}-${server.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
      proxyHeaders: {
        request: {
          Referer: referer || `${provider.baseUrl}/`,
          'User-Agent': USER_AGENT,
        },
      },
    },
  };
  return entry(stream, lang, provider.id, KIND.playable);
}

function externalEntry({ provider, url, lang, server, episode, isMovie, note, sourceTitle, kind = KIND.external }) {
  const stream = {
    name: `${provider.name}\n${lang.emoji} ${lang.label}`,
    title:
      `↗️ Abrir en el navegador: ${server}${isMovie ? '' : ` · Episodio ${episode}`}\n` +
      `${sourceTitle ? `${sourceTitle} · ` : ''}${note || ''}`.trim(),
    externalUrl: url,
  };
  return entry(stream, lang, provider.id, kind);
}

function sortEntries(entries, langOrder) {
  const rank = Object.fromEntries(langOrder.map((k, i) => [k, i]));
  return entries
    .slice()
    .sort((a, b) =>
      ((rank[a.langKey] ?? 9) - (rank[b.langKey] ?? 9)) ||
      (a.providerIdx - b.providerIdx) ||
      (a.kind - b.kind));
}

/**
 * Streams de UN trabajo (proveedor + slug + episodio).
 * Nunca lanza: ante cualquier fallo devuelve al menos el enlace oficial.
 */
async function getStreamsForJob({ providerId, slug, episode, isMovie, config = {}, sourceTitle, jobLang = null, langFilter = null }) {
  const provider = PROVIDERS_BY_ID[providerId] || PROVIDERS[0];
  const watchUrl = provider.watchUrl(slug, episode);
  const officialHost = hostOf(provider.baseUrl);
  const fallbackLang = jobLang || (langFilter ? LANGS[langFilter] : LANGS.sub);
  const accept = (lang) => !langFilter || (lang && lang.key === langFilter);
  const entries = [];

  let watch;
  try {
    watch = await providers.getWatch(provider.id, slug, episode, fallbackLang);
  } catch (err) {
    console.error(`[stream:${provider.id}] ${slug} ep${episode}: ${err.message}`);
    entries.push(externalEntry({
      provider,
      url: watchUrl,
      lang: fallbackLang,
      server: `🌐 ${officialHost}`,
      episode,
      isMovie,
      sourceTitle,
      kind: KIND.official,
      note: DEMO_FALLBACK
        ? 'Modo demo/sin conexión en este servidor: se abre la web oficial'
        : 'No se pudo leer la página del episodio: se abre la web oficial',
    }));
    return entries;
  }

  // 1) Medios directos presentes ya en la página
  for (const dm of (watch.directMedia || []).filter((d) => accept(d.lang)).slice(0, 3)) {
    entries.push(playableEntry({ provider, url: dm.url, referer: watchUrl, lang: dm.lang, server: 'Directo', slug, episode, isMovie, sourceTitle }));
  }

  // 2) Embeds (+ auto-descubrimiento AJAX si no hay ninguno usable)
  let embeds = (watch.embeds || []).filter((e) => accept(e.lang));
  if (!embeds.length && !entries.length) {
    try {
      const discovered = await discoverViaAjax(watch.raw, watch.finalUrl || watchUrl);
      for (const url of (discovered.media || []).slice(0, 3)) {
        entries.push(playableEntry({ provider, url, referer: watchUrl, lang: fallbackLang, server: 'Directo', slug, episode, isMovie, sourceTitle }));
      }
      embeds = (discovered.embeds || []).map((e) => ({ ...e, lang: e.lang || fallbackLang }))
        .filter((e) => accept(e.lang));
    } catch (err) {
      console.error(`[stream:ajax:${provider.id}] ${slug} ep${episode}: ${err.message}`);
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
      entries.push(playableEntry({ provider, url: result.url, referer: result.referer, lang: embed.lang, server, slug, episode, isMovie, sourceTitle }));
    } else {
      entries.push(externalEntry({
        provider,
        url: embed.url,
        lang: embed.lang,
        server,
        episode,
        isMovie,
        sourceTitle,
        note: 'Este servidor se reproduce en su web (no admite vídeo directo)',
      }));
    }
  });
  for (const embed of embeds.slice(5, 10)) {
    entries.push(externalEntry({
      provider,
      url: embed.url,
      lang: embed.lang,
      server: embed.name || serverNameFromUrl(embed.url, 'Servidor'),
      episode,
      isMovie,
      sourceTitle,
    }));
  }

  // 3) Descargas (opcional)
  if (isTruthyConfig(config.descargas)) {
    for (const dl of (watch.downloads || []).filter((d) => accept(d.lang)).slice(0, 6)) {
      entries.push(externalEntry({
        provider,
        url: dl.url,
        lang: dl.lang,
        server: `⬇️ ${dl.name || serverNameFromUrl(dl.url, 'Descarga')}`,
        episode,
        isMovie,
        sourceTitle,
        kind: KIND.download,
        note: 'Enlace de descarga',
      }));
    }
  }

  // 4) Página oficial del episodio.
  //    Con filtro de idioma en un proveedor multi-idioma, solo se añade si
  //    el episodio realmente tiene algo de ese idioma (no engañar).
  const tieneDelIdioma = entries.length > 0;
  if (!langFilter || jobLang || tieneDelIdioma) {
    const firstLang = (entries[0] && LANGS[entries[0].langKey]) || fallbackLang;
    entries.push(externalEntry({
      provider,
      url: watch.finalUrl || watchUrl,
      lang: jobLang || firstLang,
      server: `🌐 ${officialHost}`,
      episode,
      isMovie,
      sourceTitle,
      kind: KIND.official,
      note: provider.multiLang
        ? 'Ver en la web oficial (Sub/Dub latino según el episodio)'
        : 'Ver en la web oficial (con todos sus servidores)',
    }));
  }

  return entries;
}

/** Compat con la API v1.x: streams (planos) de un slug de EstrenosAnime. */
async function getStreamsForSlug({ slug, episode, isMovie, config = {}, sourceTitle }) {
  const entries = await getStreamsForJob({
    providerId: 'estrenos',
    slug,
    episode,
    isMovie,
    config,
    sourceTitle,
    jobLang: detectLang({ slug }),
  });
  return entries.map((e) => e.stream);
}

/** IDs propios: ea:{slug}[:1:{ep}] (EstrenosAnime) · ia:{...} (InfinityAnime). */
function parseOwnStreamId(id) {
  const m = String(id || '').trim().match(/^(ea|ia):([^:]+)(?::(\d+)(?::(\d+))?)?$/i);
  if (!m) return null;
  let slug = m[2];
  try { slug = decodeURIComponent(slug); } catch { /* slug tal cual */ }
  const episode = m[4] ? parseInt(m[4], 10) : m[3] ? parseInt(m[3], 10) : 1;
  return {
    providerId: m[1].toLowerCase() === 'ia' ? 'infinity' : 'estrenos',
    slug,
    episode,
    isMovie: !m[3],
  };
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
  const baseOrder = ['lat', 'cast', 'sub'];
  const langOrder = langFilter ? [langFilter] : baseOrder;
  const sortOrder = langFilter
    ? [langFilter, ...baseOrder.filter((k) => k !== langFilter)]
    : baseOrder;
  const finish = (entries, extra = {}) => {
    const seen = new Set();
    const uniq = [];
    for (const e of entries) {
      const s = e.stream;
      const key = `${s.url || ''}|${s.externalUrl || ''}|${s.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(e);
    }
    return { streams: sortEntries(uniq, sortOrder).map((e) => e.stream), ...cacheOk, ...extra };
  };

  // a) Compat: ids propios ea:/ia:
  const own = parseOwnStreamId(id);
  if (own) {
    const entries = await getStreamsForJob({
      providerId: own.providerId,
      slug: own.slug,
      episode: own.episode,
      isMovie: isMovie || own.isMovie,
      config,
      jobLang: own.providerId === 'estrenos' ? detectLang({ slug: own.slug }) : null,
    });
    return finish(entries);
  }

  // b) IDs externos: IMDb (tt), Kitsu, MAL
  const parsed = idmap.parseExternalStreamId(id);
  if (!parsed) return { streams: [] };

  const providerIds = providers.activeProviders(config.proveedores);
  const resolved = await idmap.resolveExternal(parsed, type, { langOrder, providers: providerIds })
    .catch((err) => {
      console.error(`[stream:idmap] ${id}: ${err.message}`);
      return { title: '', jobs: [] };
    });

  if (!resolved.jobs.length) {
    // Sin coincidencia automática: enlazamos los buscadores de cada web.
    if (resolved.title) {
      const lang = langFilter ? LANGS[langFilter] : detectLang({});
      const entries = providerIds.map((pid) => {
        const provider = PROVIDERS_BY_ID[pid];
        const url = pid === 'infinity'
          ? `${INF_BASE_URL}${INF_ROUTES.directorioSearch(resolved.title)}`
          : `${BASE_URL}${ROUTES.search(resolved.title)}`;
        return externalEntry({
          provider,
          url,
          lang,
          server: `🔎 Buscar en ${hostOf(provider.baseUrl)}`,
          episode: parsed.episode || 1,
          isMovie,
          kind: KIND.fallback,
          note: `Sin coincidencia automática para «${resolved.title}»: ábrelo en el buscador de la web`,
        });
      });
      return finish(entries, { cacheMaxAge: 60 * 5 });
    }
    return { streams: [] };
  }

  const perJob = await Promise.allSettled(
    resolved.jobs.map((job) =>
      getStreamsForJob({
        providerId: job.provider || 'estrenos',
        slug: job.slug,
        episode: job.episode,
        isMovie,
        config,
        sourceTitle: job.title,
        jobLang: job.lang || null,
        langFilter,
      })
    )
  );

  const entries = [];
  for (const r of perJob) {
    if (r.status === 'fulfilled') entries.push(...r.value);
  }
  return finish(entries);
});

module.exports = { builder, manifest, getStreamsForSlug, getStreamsForJob, parseOwnStreamId };
