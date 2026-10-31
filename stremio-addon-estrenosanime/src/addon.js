'use strict';

/**
 * Addon SOLO-STREAM para Stremio (multi-proveedor).
 * -------------------------------------------------
 * Reglas del proyecto (del usuario):
 *   1. ÚNICAMENTE el recurso `stream` (sin catalog ni meta).
 *   2. Sin demos: cero datos de ejemplo; todo se lee en vivo de las webs.
 *   3. Sin configurador: no hay ajustes; siempre se consultan TODOS los
 *      proveedores y todos los idiomas, resolvedor en «Auto».
 *
 * Proveedores:
 *   - EstrenosAnime (estrenosanime.net) — Sub/Latino/Castellano, 1 ficha/idioma
 *   - InfinityAnime (infinityanime.net) — Sub + Latino (Dub), 1 ficha
 *   - AnimeJara     (animejara.com)     — Latino/Japonés(Sub)/Castellano,
 *                                         temporadas agrupadas (SxE)
 *   - Latanime      (latanime.org)      — fichas por idioma (Latino/Castellano/Sub)
 *   - AnimeD23      (animed23.com)      — WordPress, badge Lat/Sub por episodio
 *
 * Entrada: fichas de otros addons — tt... (Cinemeta), kitsu:..., mal:...,
 * y compatibilidad ea:/ia:/aj:/lt:/d23:.
 */

const { addonBuilder } = require('stremio-addon-sdk');
const { BASE_URL, LANGS, CACHE_TTL, USER_AGENT } = require('./config');
const providers = require('./providers');
const { PROVIDERS, PROVIDERS_BY_ID } = providers;
const { resolveEmbed, discoverViaAjax } = require('./extractors');
const idmap = require('./idmap');
const { detectLang, serverNameFromUrl, qualityFromUrl, withTimeout, hostOf } = require('./util');

const manifest = {
  id: 'com.streamflex.estrenosanime',
  version: '1.3.0',
  name: 'Anime Español Multi · Streams',
  description:
    '🎌 SOLO STREAMS de anime en español desde EstrenosAnime, InfinityAnime, AnimeJara, Latanime y AnimeD23 — 💬 Subtitulado, 🌎 Latino y 🇪🇸 Castellano. Sin catálogos propios y sin configurar nada: abre un anime desde Cinemeta o Kitsu y elige servidor.',
  logo: `${BASE_URL}/uploads/LogoEstrenosanime.png`,
  background: `${BASE_URL}/images/poster-min.webp?v=0.1`,
  // ⬇️ Regla: ÚNICAMENTE el recurso "stream" (sin catalog ni meta).
  resources: ['stream'],
  catalogs: [], // sin catálogos (el linter del SDK exige el array, pero vacío)
  types: ['series', 'movie', 'anime'],
  idPrefixes: ['tt', 'kitsu:', 'mal:', 'ea:', 'ia:', 'aj:', 'lt:', 'd23:'],
  // Sin configurador: ni `config` en el manifiesto ni página /configure.
  behaviorHints: { configurable: false, configurationRequired: false },
};

const providerIdx = (id) => PROVIDERS.findIndex((p) => p.id === id);
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

function sortEntries(entries, langOrder = ['lat', 'cast', 'sub']) {
  const rank = Object.fromEntries(langOrder.map((k, i) => [k, i]));
  return entries.slice().sort((a, b) =>
    ((rank[a.langKey] ?? 9) - (rank[b.langKey] ?? 9)) ||
    (a.providerIdx - b.providerIdx) ||
    (a.kind - b.kind));
}

/**
 * Streams de UN trabajo (proveedor + slug + episodio [+ temporada]).
 * resolvedor siempre en Auto. Nunca lanza: si la web falla, devuelve la
 * página oficial del episodio como única opción.
 */
async function getStreamsForJob({ providerId, slug, episode, season = null, isMovie = false, sourceTitle, jobLang = null }) {
  const provider = PROVIDERS_BY_ID[providerId] || PROVIDERS[0];
  const watchUrl = provider.watchUrl(slug, episode, { season: season || 1, isMovie });
  const officialHost = hostOf(provider.baseUrl);
  const fallbackLang = jobLang || LANGS.sub;
  const entries = [];

  let watch;
  try {
    watch = await providers.getWatch(provider.id, slug, episode, fallbackLang, { season: season || 1, isMovie });
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
      note: 'No se pudo leer la página del episodio: se abre la web oficial',
    }));
    return entries;
  }

  const acceptsDirect = (watch.directMedia || []).slice(0, 3);
  for (const dm of acceptsDirect) {
    entries.push(playableEntry({ provider, url: dm.url, referer: watchUrl, lang: dm.lang, server: 'Directo', slug, episode, isMovie, sourceTitle }));
  }

  let embeds = watch.embeds || [];
  if (!embeds.length && !entries.length) {
    // Auto-descubrimiento AJAX (principalmente para EstrenosAnime)
    try {
      const discovered = await discoverViaAjax(watch.raw, watch.finalUrl || watchUrl);
      for (const url of (discovered.media || []).slice(0, 3)) {
        entries.push(playableEntry({ provider, url, referer: watchUrl, lang: fallbackLang, server: 'Directo', slug, episode, isMovie, sourceTitle }));
      }
      embeds = (discovered.embeds || []).map((e) => ({ ...e, lang: e.lang || fallbackLang }));
    } catch (err) {
      console.error(`[stream:ajax:${provider.id}] ${slug} ep${episode}: ${err.message}`);
    }
  }

  const MAX_RESOLVE = 5;
  const toResolve = embeds.slice(0, MAX_RESOLVE);
  const resolved = await Promise.allSettled(
    toResolve.map((e) => withTimeout(resolveEmbed(e.url, watchUrl), 22000, null))
  );

  toResolve.forEach((embed, i) => {
    const server = embed.name || serverNameFromUrl(embed.url, 'Servidor');
    const result = resolved[i] && resolved[i].status === 'fulfilled' ? resolved[i].value : null;
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
  for (const embed of embeds.slice(MAX_RESOLVE, MAX_RESOLVE + 6)) {
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

  // Descargas siempre (no hay configurador para ocultarlas; van al final)
  for (const dl of (watch.downloads || []).slice(0, 4)) {
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

  // Página oficial del episodio
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
      ? 'Ver en la web oficial (idiomas según el episodio)'
      : 'Ver en la web oficial (con todos sus servidores)',
  }));

  return entries;
}

/** Compat con la API v1.x: streams (planos) de un slug de EstrenosAnime. */
async function getStreamsForSlug({ slug, episode, isMovie, sourceTitle }) {
  const entries = await getStreamsForJob({
    providerId: 'estrenos',
    slug,
    episode,
    isMovie,
    sourceTitle,
    jobLang: detectLang({ slug }),
  });
  return entries.map((e) => e.stream);
}

const OWN_PREFIXES = {
  ea: 'estrenos',
  ia: 'infinity',
  aj: 'animejara',
  lt: 'latanime',
  d23: 'animed23',
};

/** IDs propios: ea:/ia:/aj:/lt:/d23:{slug}[:{temporada}:{ep}]. */
function parseOwnStreamId(id) {
  const m = String(id || '').trim().match(/^(ea|ia|aj|lt|d23):([^:]+)(?::(\d+)(?::(\d+))?)?$/i);
  if (!m) return null;
  let slug = m[2];
  try { slug = decodeURIComponent(slug); } catch { /* slug tal cual */ }
  const hasSeason = m[4] !== undefined;
  return {
    providerId: OWN_PREFIXES[m[1].toLowerCase()],
    slug,
    season: hasSeason ? parseInt(m[3], 10) : 1,
    episode: hasSeason ? parseInt(m[4], 10) : m[3] ? parseInt(m[3], 10) : 1,
    isMovie: !m[3],
  };
}

const builder = new addonBuilder(manifest);

/* ---------------------------------------------------------------- */
/* STREAM — el único recurso del addon                               */
/* ---------------------------------------------------------------- */
builder.defineStreamHandler(async ({ type, id }) => {
  const cacheOk = {
    cacheMaxAge: CACHE_TTL.stream,
    staleRevalidate: CACHE_TTL.stream,
    staleError: 60 * 60,
  };
  const isMovie = type === 'movie';
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
    // Limite sano de salida (5 proveedores x servidores puede ser mucho)
    const sorted = sortEntries(uniq).slice(0, 60);
    return { streams: sorted.map((e) => e.stream), ...cacheOk, ...extra };
  };

  // a) IDs propios de proveedor (compatibilidad/depuración)
  const own = parseOwnStreamId(id);
  if (own) {
    const entries = await getStreamsForJob({
      providerId: own.providerId,
      slug: own.slug,
      episode: own.episode,
      season: own.season,
      isMovie: isMovie || own.isMovie,
      jobLang: own.providerId === 'estrenos' ? detectLang({ slug: own.slug }) : null,
    });
    return finish(entries);
  }

  // b) IDs externos: IMDb (tt), Kitsu, MAL
  const parsed = idmap.parseExternalStreamId(id);
  if (!parsed) return { streams: [] };

  const resolved = await idmap.resolveExternal(parsed, type, {}).catch((err) => {
    console.error(`[stream:idmap] ${id}: ${err.message}`);
    return { title: '', jobs: [] };
  });

  if (!resolved.jobs.length) {
    if (resolved.title) {
      const lang = detectLang({});
      const entries = providers.activeProviders().map((pid) => {
        const provider = PROVIDERS_BY_ID[pid];
        return externalEntry({
          provider,
          url: provider.searchUrl(resolved.title),
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
        season: job.season || parsed.season || 1,
        isMovie: isMovie || job.isMovie,
        sourceTitle: job.title,
        jobLang: job.lang || null,
      })
    )
  );

  const entries = [];
  for (const r of perJob) {
    if (r.status === 'fulfilled') entries.push(...r.value);
  }
  return finish(entries);
});

module.exports = { builder, manifest, getStreamsForSlug, getStreamsForJob, parseOwnStreamId, sortEntries };
