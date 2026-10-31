'use strict';

/**
 * Mapeo de IDs externos (addon SOLO_STREAM).
 * ------------------------------------------
 * Sin catálogos propios, el addon recibe peticiones de stream sobre
 * fichas creadas por otros addons:
 *   - Cinemeta / IMDb : tt0388629            (película)
 *                       tt0388629:1:5        (serie T1E5)
 *   - Kitsu           : kitsu:7442:5         (episodio 5)
 *   - MyAnimeList     : mal:21:5
 *   - Propio (compat) : ea:{slug}[:1:{ep}]   (lo resuelve addon.js)
 *
 * Flujo: ID externo -> título(s) + año [+ lista de episodios de Cinemeta]
 *        -> búsqueda en TODOS los proveedores (sin configuración):
 *          · modo perLang (EstrenosAnime, Latanime): 1 candidato por
 *            idioma (Sub / Latino / Castellano).
 *          · modo single (InfinityAnime, AnimeJara, AnimeD23): la mejor
 *            ficha única; los idiomas salen de la página del episodio.
 *        AnimeJara agrupa temporadas (multiSeason): el trabajo conserva
 *        temporada + episodio dentro de temporada para construir SxE.
 *
 * El nº de episodio es lo delicado: la web publica cada temporada como
 * ficha aparte ("... Temporada 2 (Latino)") con numeración propia, pero
 * las series largas (One Piece) van con numeración absoluta. Por eso:
 *   - si el candidato indica temporada K, se usa el episodio dentro de
 *     la temporada (y se exige K == temporada pedida);
 *   - si no indica temporada, se usa la posición absoluta calculada
 *     desde la lista de vídeos de Cinemeta.
 */

const { fetchText } = require('./http');
const { PROVIDERS, PROVIDERS_BY_ID } = require('./providers');
const {
  titleTokens,
  seasonOfTitle,
  absoluteEpisodeFromVideos,
} = require('./util');

/* ------------------------------------------------------------------ */
/* Parseo de IDs externos                                              */
/* ------------------------------------------------------------------ */

function parseExternalStreamId(id) {
  const raw = String(id || '').trim();
  let m = raw.match(/^(tt\d+)(?::(\d+):(\d+))?$/i);
  if (m) {
    return {
      source: 'imdb',
      sourceId: m[1].toLowerCase(),
      season: m[2] ? parseInt(m[2], 10) : null,
      episode: m[3] ? parseInt(m[3], 10) : 1,
    };
  }
  m = raw.match(/^(kitsu|mal):(\d+)(?::(\d+))?(?::(\d+))?$/i);
  if (m) {
    const hasSeason = m[4] !== undefined;
    return {
      source: m[1].toLowerCase(),
      sourceId: m[2],
      season: hasSeason ? parseInt(m[3], 10) : null,
      episode: parseInt(hasSeason ? m[4] : m[3] || '1', 10),
      // Kitsu/MAL ya representan la temporada como título propio:
      // el episodio pedido es el número dentro de esa entrada.
      ignoreSeason: true,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Título del ID externo (Cinemeta / Kitsu / Jikan)                    */
/* ------------------------------------------------------------------ */

async function fetchExternalInfo(parsed, type) {
  if (parsed.source === 'imdb') {
    const cinemetaType = type === 'movie' ? 'movie' : 'series';
    const url = `https://v3-cinemeta.strem.io/meta/${cinemetaType}/${parsed.sourceId}.json`;
    const { text } = await fetchText(url, { retries: 0, referer: 'https://www.strem.io/' });
    const meta = (JSON.parse(text) || {}).meta || {};
    const year = parseInt(meta.year, 10) ||
      parseInt(String(meta.releaseInfo || '').slice(0, 4), 10) || null;
    return {
      titles: [meta.name].filter(Boolean),
      year,
      videos: Array.isArray(meta.videos) ? meta.videos : null,
    };
  }
  if (parsed.source === 'kitsu') {
    const url = `https://kitsu.io/api/edge/anime/${parsed.sourceId}`;
    const { text } = await fetchText(url, {
      retries: 0,
      headers: { Accept: 'application/vnd.api+json, application/json' },
    });
    const attrs = (((JSON.parse(text) || {}).data || {}).attributes) || {};
    const titlesObj = attrs.titles || {};
    const titles = [titlesObj.en_jp, attrs.canonicalTitle, titlesObj.en, titlesObj.en_us]
      .filter(Boolean);
    return {
      titles: [...new Set(titles)],
      year: attrs.startDate ? parseInt(String(attrs.startDate).slice(0, 4), 10) : null,
      videos: null,
    };
  }
  if (parsed.source === 'mal') {
    const url = `https://api.jikan.moe/v4/anime/${parsed.sourceId}`;
    const { text } = await fetchText(url, { retries: 0 });
    const data = (JSON.parse(text) || {}).data || {};
    const alt = (data.titles || []).map((t) => t && t.title).filter(Boolean);
    return {
      titles: [...new Set([data.title, data.title_english, ...alt].filter(Boolean))],
      year: data.year || (data.aired && data.aired.prop && data.aired.prop.from && data.aired.prop.from.year) || null,
      videos: null,
    };
  }
  return { titles: [], year: null, videos: null };
}

/* ------------------------------------------------------------------ */
/* Puntuación y selección de candidatos                                */
/* ------------------------------------------------------------------ */

function episodeForCandidate(item, ctx) {
  if (ctx.isMovie) return 1;
  const ep = ctx.episode || 1;
  // Ficha que agrupa temporadas (AnimeJara SxE): siempre el episodio
  // dentro de la temporada pedida; la temporada va aparte en el trabajo.
  if (item.multiSeason) return ep;
  if (ctx.ignoreSeason) return ep;
  const season = ctx.season || 1;
  const candidateSeason = seasonOfTitle(item.title);
  if (candidateSeason) {
    // Ficha de una temporada concreta: solo vale si coincide.
    return candidateSeason === season ? ep : null;
  }
  if (season > 1) {
    // Ficha sin temporada = serie completa con numeración absoluta.
    return ctx.absoluteEpisode || null;
  }
  return ctx.absoluteEpisode || ep;
}

function scoreCandidate(item, ctx, position = 99) {
  let best = -Infinity;
  const itemTokens = titleTokens(item.title, { stripSeason: true });
  // Comparación SIN la parte de temporada ("Temporada 2", "2nd Season"...):
  // si no, la ficha base siempre ganaría por igualdad exacta a la de la
  // temporada pedida, pudiendo entregar el episodio equivocado.
  const itemNorm = itemTokens.join(' ');
  for (const title of ctx.titles || []) {
    let score = 0;
    const qTokens = titleTokens(title, { stripSeason: true });
    const qNorm = qTokens.join(' ');
    if (itemNorm === qNorm) score += 120;
    else if (itemNorm.includes(qNorm) || qNorm.includes(itemNorm)) score += 55;
    if (qTokens.length && itemTokens.length) {
      const hits = qTokens.filter((t) => itemTokens.includes(t)).length;
      const precision = hits / qTokens.length;
      const recall = hits / Math.max(1, Math.min(itemTokens.length, 6));
      score += Math.round(60 * precision + 20 * recall);
    }
    best = Math.max(best, score);
  }
  best += Math.max(0, 18 - position); // relevancia del buscador del sitio
  const itemType = item.siteType === 'Pelicula' ? 'movie' : 'series';
  best += ctx.isMovie === (itemType === 'movie') ? 20 : -80;
  if (ctx.season && !ctx.ignoreSeason) {
    const cs = seasonOfTitle(item.title);
    if (cs === ctx.season) best += 90;
    // Ficha multi-temporada: sirve para cualquier temporada pedida.
    else if (item.multiSeason) best += 40;
    // Sin temporada indicada solo sirve de respaldo absoluto: menos fiable.
    else if (cs === null) best += ctx.season > 1 ? -15 : 5;
  }
  if (ctx.year && item.year) {
    const diff = Math.abs(parseInt(item.year, 10) - ctx.year);
    if (diff === 0) best += 10;
    else if (diff > 6) best -= 20;
  }
  return best;
}

/**
 * De una lista de tarjetas de búsqueda elige la mejor por idioma.
 * Devuelve trabajos [{slug, episode, lang, title, score}] en el orden
 * de idiomas indicado.
 */
function pickJobsByLang(items, ctx, langOrder = ['lat', 'cast', 'sub'], providerId = 'estrenos') {
  const withPos = items.map((item, i) => ({ item, position: i }));
  const jobs = [];
  for (const langKey of langOrder) {
    const candidates = withPos
      .filter(({ item }) => item.lang && item.lang.key === langKey)
      .map(({ item, position }) => ({
        item,
        position,
        episode: episodeForCandidate(item, ctx),
        score: scoreCandidate(item, ctx, position),
      }))
      .filter((c) => c.episode && c.episode >= 1);
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];
    if (!top) continue;
    // Aceptamos la mejor opción del buscador del sitio salvo descartes
    // claros (tipo equivocado hunde la puntuación por debajo del umbral).
    if (top.score < 10 && !(top.position < 3 && top.score > -40)) continue;
    jobs.push({
      provider: providerId,
      slug: top.item.slug,
      episode: top.episode,
      season: seasonOfTitle(top.item.title) || ctx.season || 1,
      isMovie: Boolean(ctx.isMovie),
      lang: top.item.lang,
      title: top.item.title,
      score: top.score,
    });
  }
  return jobs;
}

/**
 * Para proveedores «multi-idioma por ficha» (InfinityAnime): elige la
 * mejor ficha única; los idiomas se averiguan luego en la página del
 * episodio (grupos Sub/Dub y descargas).
 */
function pickSingleJob(items, ctx, providerId = 'infinity') {
  const candidates = items
    .map((item, position) => ({
      item,
      position,
      episode: episodeForCandidate(item, ctx),
      score: scoreCandidate(item, ctx, position),
    }))
    .filter((c) => c.episode && c.episode >= 1);
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  if (!top) return null;
  if (top.score < 10 && !(top.position < 3 && top.score > -40)) return null;
  return {
    provider: providerId,
    slug: top.item.slug,
    episode: top.episode,
    season: ctx.season || seasonOfTitle(top.item.title) || 1,
    isMovie: Boolean(ctx.isMovie),
    multiSeason: Boolean(top.item.multiSeason),
    lang: null, // multi-idioma: se resuelve en el watch
    hasLat: Boolean(top.item.hasLat),
    title: top.item.title,
    score: top.score,
  };
}

/* ------------------------------------------------------------------ */
/* Resolución completa ID externo -> trabajos de stream                */
/* ------------------------------------------------------------------ */

async function searchProvider(providerId, query) {
  try {
    return await PROVIDERS_BY_ID[providerId].search(query);
  } catch (err) {
    console.error(`[idmap] buscar "${query}" en ${providerId}: ${err.message}`);
    return [];
  }
}

function ordinalEn(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

async function resolveExternal(parsed, type, { langOrder, providers: providerIds } = {}) {
  let info;
  try {
    info = await fetchExternalInfo(parsed, type);
  } catch (err) {
    console.error(`[idmap] título de ${parsed.source}:${parsed.sourceId}: ${err.message}`);
    return { title: '', jobs: [], error: err.message };
  }
  const titles = (info.titles || []).filter(Boolean);
  if (!titles.length) return { title: '', jobs: [] };

  const isMovie = type === 'movie' || (!parsed.season && parsed.source === 'imdb' && type !== 'series' && type !== 'anime' && !info.videos);
  const ctx = {
    titles,
    year: info.year || null,
    isMovie: Boolean(isMovie),
    season: parsed.season || (isMovie ? null : 1),
    episode: parsed.episode || 1,
    ignoreSeason: Boolean(parsed.ignoreSeason),
    absoluteEpisode: info.videos
      ? absoluteEpisodeFromVideos(info.videos, parsed.season || 1, parsed.episode || 1)
      : null,
  };

  const queries = [];
  const addQuery = (q) => { if (q && !queries.includes(q)) queries.push(q); };
  addQuery(titles[0]);
  if (ctx.season && ctx.season > 1 && !ctx.ignoreSeason) {
    addQuery(`${titles[0]} Temporada ${ctx.season}`);
    addQuery(`${titles[0]} ${ordinalEn(ctx.season)} Season`);
    addQuery(`${titles[0]} Season ${ctx.season}`);
  }
  if (titles[1]) addQuery(titles[1]);

  const active = Array.isArray(providerIds) && providerIds.length
    ? providerIds.filter((id) => PROVIDERS_BY_ID[id])
    : PROVIDERS.map((p) => p.id); // sin configurador: todos
  const queriesUsed = queries.slice(0, 4);
  const perProvider = await Promise.all(active.map(async (providerId) => {
    const bySlug = new Map();
    const results = await Promise.allSettled(
      queriesUsed.map((q) => searchProvider(providerId, q)),
    );
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const item of r.value) {
        if (!bySlug.has(item.slug)) bySlug.set(item.slug, item);
      }
    }
    const items = [...bySlug.values()];
    const provider = PROVIDERS_BY_ID[providerId];
    if (provider.mode === 'single') {
      const job = pickSingleJob(items, ctx, providerId);
      return job ? [job] : [];
    }
    return pickJobsByLang(items, ctx, langOrder, providerId);
  }));
  const jobs = perProvider.flat();
  return { title: titles[0], titles, ctx, queries: queriesUsed, providers: active, jobs };
}

module.exports = {
  parseExternalStreamId,
  fetchExternalInfo,
  episodeForCandidate,
  scoreCandidate,
  pickJobsByLang,
  pickSingleJob,
  searchProvider,
  resolveExternal,
};
;
