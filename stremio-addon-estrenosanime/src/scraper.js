'use strict';

/**
 * Scraper de estrenosanime.net
 * -----------------------------
 * La web no tiene API pública: se lee el HTML con cheerio.
 * Los selectores son deliberadamente "heurísticos" (basados en las URL
 * /anime/{slug} y /ver/{slug}/episodio-{n}, en badges SUB/LATINO/
 * CASTELLANO y en etiquetas de texto estables como "Resumen:",
 * "Idioma:", "Episodios:") para sobrevivir a cambios de clases CSS.
 * Ver INVESTIGACION.md para la evidencia de cada patrón.
 */

const cheerio = require('cheerio');
const { BASE_URL, ROUTES, GENRES, SITE_TYPES } = require('./config');
const { fetchSitePage } = require('./http');
const {
  normalizeSpaces,
  detectLang,
  metaId,
  videoId,
  absoluteUrl,
  decodeBase64Url,
  findDirectMediaUrls,
  findAllUrls,
  hostOf,
} = require('./util');

const DOWNLOAD_HOST_RE =
  /krakenfiles|gofile|1fichier|vikingfile|transfer|mega\.nz|mediafire|rapidgator|nitroflare|turbobit|uptobox|file-upload/i;
const IFRAME_BLOCKLIST_RE =
  /google|facebook|twitter\.com|x\.com|disqus|challenges\.cloudflare|googlesyndication|doubleclick|youtube\.com|recaptcha|tawk|crisp|intercom/i;

/* ------------------------------------------------------------------ */
/* Utilidades de parseo                                                */
/* ------------------------------------------------------------------ */

/**
 * Texto visible con un espacio entre cada elemento.
 * cheerio .text() pega los nodos ("TVEn Emision1999", tal y como se ve
 * en la web real) y eso rompe expresiones como \b1999\b. Con esta
 * versión obtenemos "TV En Emision 1999".
 */
function spacedText($, $el) {
  const $clone = $el.clone();
  $clone.find('script, style, noscript').remove();
  $clone.find('*').each((_, e) => {
    $(e).prepend(' ');
  });
  return normalizeSpaces($clone.text());
}

function slugFromHref(href) {
  try {
    const { pathname } = new URL(href, BASE_URL);
    const parts = pathname.split('/').filter(Boolean);
    // /anime/{slug}  |  /ver/{slug}/episodio-{n}
    if ((parts[0] === 'anime' || parts[0] === 'ver') && parts[1]) {
      const epMatch = pathname.match(/episodio-(\d+)/i);
      return {
        slug: decodeURIComponent(parts[1]),
        kind: parts[0],
        episode: epMatch ? parseInt(epMatch[1], 10) : null,
      };
    }
  } catch {
    /* href inválido */
  }
  return null;
}

/**
 * Encuentra la "tarjeta" de un anime subiendo por el DOM mientras el
 * contenedor solo contenga enlaces de ese mismo slug.
 */
function findCardContainer($, $anchor, slug) {
  let $node = $anchor;
  let $best = $anchor;
  for (let i = 0; i < 6; i += 1) {
    const $parent = $node.parent();
    if (!$parent.length || $parent.is('body') || $parent.is('html')) break;
    const slugs = new Set();
    $parent.find('a[href]').each((_, a) => {
      const info = slugFromHref($(a).attr('href') || '');
      if (info) slugs.add(info.slug);
    });
    if (slugs.size > 1) break; // ya abarcaría otra tarjeta distinta
    $node = $parent;
    $best = $parent;
  }
  return $best;
}

function posterFromContainer($, $container) {
  let poster = '';
  $container.find('img').each((_, img) => {
    if (poster) return;
    const $img = $(img);
    const candidates = [
      $img.attr('data-src'),
      $img.attr('data-lazy-src'),
      $img.attr('data-original'),
      $img.attr('src'),
    ].filter(Boolean);
    for (const c of candidates) {
      const url = absoluteUrl(c, BASE_URL);
      if (!url || url.startsWith('data:')) continue;
      if (/pick-|logo|icon|\.svg($|\?)/i.test(url)) continue;
      poster = url;
      break;
    }
  });
  return poster;
}

function titleFromCard($, $anchor, $container) {
  const BAD = /^(ver ahora|detalles|ver detalles|ver m[aá]s|ver|watch now)$/i;
  const candidates = [
    $anchor.attr('title'),
    $container.find('h2, h3, h4').first().text(),
    $container.find('img').first().attr('alt'),
    $anchor.text(),
  ];
  for (const c of candidates) {
    const t = normalizeSpaces(c);
    if (t.length >= 2 && !BAD.test(t)) return t;
  }
  return '';
}

/* ------------------------------------------------------------------ */
/* Listados (catálogos, búsqueda, últimos episodios...)                */
/* ------------------------------------------------------------------ */

function parseListing(html) {
  const $ = cheerio.load(html);
  const itemsBySlug = new Map();

  $('a[href]').each((_, el) => {
    const $a = $(el);
    const info = slugFromHref($a.attr('href') || '');
    if (!info) return;

    const $card = findCardContainer($, $a, info.slug);
    const cardText = spacedText($, $card);
    const poster = posterFromContainer($, $card);
    const title = titleFromCard($, $a, $card);

    const epMatch = cardText.match(/\bEP\s*(\d+)(?:\s*\/\s*(\d+|\?+))?/i);
    const yearMatches = cardText.match(/(?<!\d)(19\d{2}|20\d{2})(?!\d)/g);
    const siteType = SITE_TYPES.find((t) =>
      new RegExp(`\\b${t}\\b`).test(cardText)
    );
    const estado = /En Emision/i.test(cardText)
      ? 'En Emision'
      : /Completado/i.test(cardText)
        ? 'Completado'
        : /Proximamente/i.test(cardText)
          ? 'Proximamente'
          : '';
    const badgeMatch = cardText.match(/\b(CASTELLANO|LATINO|SUB)\b/);

    let snippet = '';
    $card.find('p').each((__, p) => {
      if (snippet) return;
      const t = normalizeSpaces($(p).text());
      if (t.length >= 40) snippet = t.slice(0, 400);
    });

    const item = {
      slug: info.slug,
      title: title || info.slug,
      poster,
      lang: detectLang({
        slug: info.slug,
        title,
        badge: badgeMatch ? badgeMatch[1] : '',
      }),
      siteType: siteType || 'TV',
      estado,
      year: yearMatches ? yearMatches[yearMatches.length - 1] : '',
      epCurrent: epMatch ? parseInt(epMatch[1], 10) : info.episode,
      epTotal: epMatch && epMatch[2] && /^\d+$/.test(epMatch[2]) ? parseInt(epMatch[2], 10) : null,
      episodeFromCard: info.kind === 'ver' ? info.episode : null,
      snippet,
    };

    const existing = itemsBySlug.get(info.slug);
    if (!existing) {
      itemsBySlug.set(info.slug, item);
    } else {
      // Fusiona: conserva el primer orden, rellena huecos con duplicados
      if (!existing.poster && item.poster) existing.poster = item.poster;
      if (item.title.length > existing.title.length) existing.title = item.title;
      if (!existing.snippet && item.snippet) existing.snippet = item.snippet;
      if (!existing.year && item.year) existing.year = item.year;
      if (existing.epCurrent == null && item.epCurrent != null) existing.epCurrent = item.epCurrent;
      if (!existing.epTotal && item.epTotal) existing.epTotal = item.epTotal;
      if (existing.episodeFromCard == null && item.episodeFromCard != null)
        existing.episodeFromCard = item.episodeFromCard;
    }
  });

  return [...itemsBySlug.values()].filter((i) => i.title && i.slug);
}

function itemToMetaPreview(item) {
  const type = item.siteType === 'Pelicula' ? 'movie' : 'series';
  const bits = [`${item.lang.emoji} ${item.lang.label}`];
  if (item.epCurrent) bits.push(item.epTotal ? `EP ${item.epCurrent}/${item.epTotal}` : `EP ${item.epCurrent}`);
  if (item.siteType) bits.push(item.siteType);
  if (item.estado) bits.push(item.estado);
  if (item.year) bits.push(item.year);
  const description = [bits.join(' · '), item.snippet].filter(Boolean).join('\n\n');
  return {
    id: metaId(item.slug),
    type,
    name: item.title,
    poster: item.poster || undefined,
    posterShape: 'poster',
    background: item.poster || undefined,
    releaseInfo: item.year || undefined,
    description,
  };
}

/* ------------------------------------------------------------------ */
/* Ficha de anime (/anime/{slug})                                     */
/* ------------------------------------------------------------------ */

function textBetween(text, startMarker, endMarkers) {
  const start = text.indexOf(startMarker);
  if (start < 0) return '';
  let rest = text.slice(start + startMarker.length);
  let end = rest.length;
  for (const marker of endMarkers) {
    const idx = rest.indexOf(marker);
    if (idx >= 0 && idx < end) end = idx;
  }
  rest = rest.slice(0, end);
  return normalizeSpaces(rest);
}

function findJsonLd(html) {
  const blocks = [...String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  const parsed = [];
  for (const b of blocks) {
    try {
      parsed.push(JSON.parse(b[1]));
    } catch {
      /* JSON-LD malformado */
    }
  }
  return parsed;
}

function deepFindRating(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.aggregateRating && obj.aggregateRating.ratingValue) {
    const v = parseFloat(obj.aggregateRating.ratingValue);
    return Number.isFinite(v) ? v : null;
  }
  for (const v of Object.values(obj)) {
    const found = deepFindRating(v);
    if (found) return found;
  }
  return null;
}

function parseDetail(html, slug) {
  const $ = cheerio.load(html);
  const bodyText = spacedText($, $('body'));
  const resumenIdx = bodyText.indexOf('Resumen:');
  const detailText = resumenIdx >= 0 ? bodyText.slice(resumenIdx) : bodyText;

  // Título: og:title -> JSON-LD -> primer h1/h2
  let title = $('meta[property="og:title"]').attr('content') || '';
  title = title
    .replace(/^Ver\s+/i, '')
    .replace(/\s+Online.*$/i, '')
    .replace(/\s*\|\s*Estrenos Anime.*$/i, '')
    .trim();
  const jsonLd = findJsonLd(html);
  if (!title || title.length < 2) {
    const ldName = jsonLd.map((j) => j && j.name).find(Boolean);
    title = ldName || normalizeSpaces($('h1, h2').first().text()) || slug;
  }

  // Imágenes
  let poster = absoluteUrl($('meta[property="og:image"]').attr('content') || '', BASE_URL);
  if (!poster) {
    $('img').each((_, img) => {
      if (poster) return;
      const src = absoluteUrl($(img).attr('data-src') || $(img).attr('src') || '', BASE_URL);
      if (/\/uploads\/anime\//.test(src)) poster = src;
    });
  }
  let background = '';
  $('img').each((_, img) => {
    if (background) return;
    const src = absoluteUrl($(img).attr('data-src') || $(img).attr('src') || '', BASE_URL);
    if (/\/uploads\/banners\//.test(src)) background = src;
  });

  // Campos de texto (etiquetas verificadas en la investigación)
  const description = textBetween(detailText, 'Resumen:', ['Japonés:', 'Japones:', 'Estrenos Anime Es una gran']);
  const japaneseTitle = textBetween(detailText, 'Japonés:', ['English:', 'Sinónimos:', 'Sinonimos:']);
  const englishTitle = textBetween(detailText, 'English:', ['Sinónimos:', 'Sinonimos:', 'Temporada estacional:']);
  const synonyms = textBetween(detailText, 'Sinónimos:', ['Temporada estacional:', 'Emisión:']) ||
    textBetween(detailText, 'Sinonimos:', ['Temporada estacional:', 'Emisión:']);
  const idiomaField = (detailText.match(/Idioma:\s*([A-Za-zÁÉÍÓÚ]+)/i) || [])[1] || '';
  const epMatch = detailText.match(/Episodios:\s*(\d+)(?:\s*\/\s*(\d+|\?+))?/i);
  const episodesAvailable = epMatch ? parseInt(epMatch[1], 10) : null;
  const episodesTotal = epMatch && epMatch[2] && /^\d+$/.test(epMatch[2]) ? parseInt(epMatch[2], 10) : null;
  const year = (detailText.match(/Año de lanzamiento:\s*(\d{4})/i) || [])[1] || '';
  let duration = textBetween(detailText, 'Duración:', ['Studios:', 'Tipo:', 'Estado:', 'Genero:']);
  if (duration.length > 25) duration = duration.slice(0, 25).trim();
  const aired = (detailText.match(/Emisión:\s*([A-Za-z]{3,9} \d{1,2}, \d{4})/i) || [])[1] || '';
  const studios = textBetween(detailText, 'Studios:', ['Tipo:', 'Estado:']).slice(0, 80);

  const tipoSegment = detailText.slice(Math.max(0, detailText.indexOf('Tipo:')), detailText.indexOf('Tipo:') + 40);
  const siteType = SITE_TYPES.find((t) => new RegExp(`\\b${t}\\b`).test(tipoSegment)) || '';
  const estadoSegment = detailText.slice(Math.max(0, detailText.indexOf('Estado:')), detailText.indexOf('Estado:') + 40);
  const estado = /En Emision/i.test(estadoSegment)
    ? 'En Emision'
    : /Completado/i.test(estadoSegment)
      ? 'Completado'
      : /Proximamente/i.test(estadoSegment)
        ? 'Proximamente'
        : '';

  // Géneros: texto entre "Genero:" e "Idiomas Disponibles" cruzado con la
  // lista oficial de géneros de la web (inmune al menú de navegación).
  const genreSegment = textBetween(detailText, 'Genero:', ['Idiomas Disponibles', 'Estrenos Anime Es una gran', 'Personajes']);
  const genres = GENRES.filter((g) => genreSegment.toLowerCase().includes(g.toLowerCase()));

  // Idiomas alternativos ("Cambiar a Idioma Latino/Subtitulado/Castellano")
  const alternatives = [];
  $('a[href]').each((_, a) => {
    const $a = $(a);
    const label = `${$a.attr('title') || ''} ${$a.text()}`;
    if (!/cambiar a/i.test(label)) return;
    const info = slugFromHref($a.attr('href') || '');
    if (info && info.slug !== slug) {
      alternatives.push({ slug: info.slug, lang: detectLang({ slug: info.slug }) });
    }
  });

  // Episodios enlazados directamente en la ficha (si los hubiera)
  const episodeNumbers = new Set();
  $('a[href]').each((_, a) => {
    const info = slugFromHref($(a).attr('href') || '');
    if (info && info.slug === slug && info.episode) episodeNumbers.add(info.episode);
  });

  // Tráiler/PV de YouTube (miniaturas i.ytimg.com/vi/{id}/)
  let trailerYtId = '';
  $('img, iframe').each((_, el) => {
    if (trailerYtId) return;
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    const m = src.match(/(?:vi\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (m) trailerYtId = m[1];
  });

  const rating = jsonLd.map(deepFindRating).find(Boolean) || null;

  return {
    slug,
    title,
    englishTitle,
    japaneseTitle,
    synonyms,
    poster,
    background: background || poster,
    description,
    lang: detectLang({ slug, title, idiomaField }),
    siteType: siteType || (episodesAvailable === 1 && episodesTotal === 1 ? 'Pelicula' : 'TV'),
    estado,
    year,
    duration,
    aired,
    studios,
    genres,
    episodesAvailable,
    episodesTotal,
    episodeNumbers: [...episodeNumbers].sort((a, b) => a - b),
    alternatives,
    trailerYtId,
    rating,
  };
}

function detailToMeta(detail) {
  const type = detail.siteType === 'Pelicula' ? 'movie' : 'series';
  const baseDescription = detail.description || '';
  const extraInfo = [
    `${detail.lang.emoji} Idioma: ${detail.lang.label}`,
    detail.siteType ? `Tipo: ${detail.siteType}` : '',
    detail.estado ? `Estado: ${detail.estado}` : '',
    detail.studios ? `Estudio: ${detail.studios}` : '',
    detail.episodesAvailable
      ? `Episodios: ${detail.episodesAvailable}${detail.episodesTotal ? ` / ${detail.episodesTotal}` : ''}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const meta = {
    id: metaId(detail.slug),
    type,
    name: detail.title,
    poster: detail.poster || undefined,
    posterShape: 'poster',
    background: detail.background || undefined,
    description: [baseDescription, extraInfo].filter(Boolean).join('\n\n'),
    releaseInfo: detail.year || undefined,
    year: detail.year ? parseInt(detail.year, 10) : undefined,
    genres: detail.genres.length ? detail.genres : undefined,
    runtime: detail.duration || undefined,
    imdbRating: detail.rating || undefined,
    trailers: detail.trailerYtId
      ? [{ source: detail.trailerYtId, type: 'Trailer' }]
      : undefined,
    links: detail.alternatives.map((alt) => ({
      name: `${alt.lang.emoji} Ver en ${alt.lang.label}`,
      category: 'Idiomas disponibles',
      url: `stremio:///detail/${type}/${encodeURIComponent(metaId(alt.slug))}`,
    })),
    behaviorHints:
      type === 'movie' ? { defaultVideoId: metaId(detail.slug) } : undefined,
  };

  if (type === 'series') {
    let count = detail.episodesAvailable || 0;
    if (detail.episodeNumbers.length) {
      count = Math.max(count, Math.max(...detail.episodeNumbers));
    }
    const released = detail.aired ? new Date(detail.aired) : null;
    const releasedIso =
      released && !Number.isNaN(released.getTime()) ? released.toISOString() : undefined;
    meta.videos = Array.from({ length: count }, (_, i) => ({
      id: videoId(detail.slug, i + 1),
      title: `Episodio ${i + 1}`,
      season: 1,
      episode: i + 1,
      released: releasedIso,
      thumbnail: detail.poster || undefined,
    }));
  }
  return meta;
}

/* ------------------------------------------------------------------ */
/* Página de reproducción (/ver/{slug}/episodio-{n})                   */
/* ------------------------------------------------------------------ */

/** Escanea TODOS los atributos de un elemento buscando URLs (o base64). */
function scanElementForUrls(el) {
  const urls = [];
  const attribs = (el && el.attribs) || {};
  for (const [attr, value] of Object.entries(attribs)) {
    if (!value || value.length < 8) continue;
    if (/^https?:\/\//i.test(value.trim())) urls.push({ attr, url: value.trim() });
    const decoded = decodeBase64Url(value);
    if (decoded) urls.push({ attr, url: decoded, viaBase64: true });
    if (attr === 'onclick' || value.includes('http')) {
      for (const u of findAllUrls(value)) urls.push({ attr, url: u });
    }
  }
  const seen = new Set();
  return urls.filter((u) => {
    if (seen.has(u.url)) return false;
    seen.add(u.url);
    return true;
  });
}

function parseWatch(html, finalUrl = '', expectedSlug = '') {
  const $ = cheerio.load(html);

  // IDs internos: blob JSON de la página {"anime_id":1,"episode_id":1,...}
  // y parámetro ?ep={episode_id} de la URL final tras redirigir.
  const epIdFromJson = (String(html).match(/"episode_id"\s*:\s*"?(\d+)"?/) || [])[1] || '';
  const animeId = (String(html).match(/"anime_id"\s*:\s*"?(\d+)"?/) || [])[1] || '';
  const epIdFromUrl = (String(finalUrl).match(/[?&]ep=(\d+)/) || [])[1] || '';
  const episodeId = epIdFromJson || epIdFromUrl;

  // Título desde JSON-LD (TVEpisode)
  const jsonLd = findJsonLd(html);
  const ldEpisode = jsonLd.find((j) => j && (j['@type'] === 'TVEpisode' || j.episodeNumber));
  const seriesName =
    (ldEpisode && ldEpisode.partOfSeries && ldEpisode.partOfSeries.name) || '';

  const embeds = [];
  const downloads = [];
  const pushEmbed = (entry, list) => {
    const abs = absoluteUrl(entry.url, BASE_URL);
    if (!abs) return;
    if (list.some((e) => e.url === abs)) return;
    if (hostOf(abs) === hostOf(BASE_URL) && /\/(anime|ver|search|home|login)\b/.test(abs)) return;
    list.push({ ...entry, url: abs });
  };

  // 1) Iframes del reproductor
  $('iframe').each((_, el) => {
    const src =
      $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
    const abs = absoluteUrl(src, BASE_URL);
    if (!abs || IFRAME_BLOCKLIST_RE.test(abs)) return;
    pushEmbed({ name: '', url: abs, origin: 'iframe' }, embeds);
  });

  // 2) Botones de servidor / descarga: en esta web son <a href="javascript:;">
  //    con la URL (o el id) en atributos data-*. Se escanean todos.
  const serverButtons = [];
  $('a, button, li, [data-server], [data-video], [data-url], [data-embed]').each((_, el) => {
    const $el = $(el);
    const name = normalizeSpaces($el.text()).slice(0, 40);
    const found = scanElementForUrls(el);
    const attribs = el.attribs || {};
    const serverId =
      attribs['data-server-id'] ||
      attribs['data-id'] ||
      attribs['data-server'] ||
      attribs['data-episode-server'] ||
      '';
    const looksLikeServerBtn =
      name && ($el.is('a') || $el.is('button') || $el.is('li')) && (found.length > 0 || serverId);
    if (found.length) {
      const isDownload = DOWNLOAD_HOST_RE.test(name) || found.some((f) => DOWNLOAD_HOST_RE.test(f.url));
      for (const f of found) {
        pushEmbed(
          { name: name || '', url: f.url, origin: `attr:${f.attr}`, serverId: serverId || '' },
          isDownload ? downloads : embeds
        );
      }
    }
    if (looksLikeServerBtn && serverId) {
      serverButtons.push({ name, serverId });
    }
  });

  // 3) Scripts inline: medios directos y posibles embeds
  let directMedia = [];
  const scriptSrcs = [];
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      const abs = absoluteUrl(src, BASE_URL);
      if (abs) scriptSrcs.push(abs);
      return;
    }
    const code = $(el).html() || '';
    if (!code) return;
    directMedia.push(...findDirectMediaUrls(code));
    for (const u of findAllUrls(code)) {
      if (/(embed|\/e\/|\/v\/|player|watch)/i.test(u) && !IFRAME_BLOCKLIST_RE.test(u)) {
        pushEmbed({ name: '', url: u, origin: 'script' }, embeds);
      }
    }
  });
  directMedia = [...new Set(directMedia)];
  // Por si algún medio directo viene fuera de <script> (atributos, etc.)
  for (const u of findDirectMediaUrls(html)) {
    if (!directMedia.includes(u)) directMedia.push(u);
  }

  // 4) Lista de episodios + rangos "EPS: 001-100" (para conteos fiables)
  const episodeNumbers = new Set();
  let maxFromRanges = 0;
  const bodyText = spacedText($, $('body'));
  for (const m of bodyText.matchAll(/EPS:\s*(\d+)\s*-\s*(\d+)/gi)) {
    maxFromRanges = Math.max(maxFromRanges, parseInt(m[2], 10));
  }
  $('a[href]').each((_, a) => {
    const info = slugFromHref($(a).attr('href') || '');
    if (info && info.kind === 'ver' && info.episode) {
      if (!expectedSlug || info.slug === expectedSlug) episodeNumbers.add(info.episode);
    }
  });

  return {
    episodeId,
    animeId,
    seriesName,
    embeds,
    downloads,
    directMedia,
    serverButtons,
    scriptSrcs: [...new Set(scriptSrcs)],
    episodeNumbers: [...episodeNumbers].sort((a, b) => a - b),
    maxEpisode: Math.max(maxFromRanges, ...[...episodeNumbers], 0),
    finalUrl,
  };
}

/* ------------------------------------------------------------------ */
/* Red: listados paginados, ficha y reproducción                       */
/* ------------------------------------------------------------------ */

function withPage(path, page) {
  if (!page || page <= 1) return path;
  return `${path}${path.includes('?') ? '&' : '?'}page=${page}`;
}

async function fetchListingPage(path, page = 1) {
  const { text } = await fetchSitePage(withPage(path, page));
  return parseListing(text);
}

/** Busca en la web (/search?keyword=) y devuelve las tarjetas tal cual. */
async function searchItems(query, page = 1) {
  return fetchListingPage(ROUTES.search(query), page);
}

// Aprendizaje del tamaño de página de cada listado (para el skip de Stremio)
const perPageBySource = new Map();
const DEFAULT_PER_PAGE = 24;
const WANT_PER_REQUEST = 48;

/**
 * Devuelve meta-previews para un listado o búsqueda, respetando skip.
 * filters: { type: 'series'|'movie', langKey: 'sub'|'lat'|'cast'|null }
 */
async function getCatalogMetas(sourcePath, skip = 0, filters = {}) {
  const { type, langKey } = filters;
  const learned = perPageBySource.get(sourcePath) || DEFAULT_PER_PAGE;
  let page = Math.floor(skip / learned) + 1;
  let offset = skip - (page - 1) * learned;

  const applyFilters = (items) =>
    items.filter((item) => {
      const itemType = item.siteType === 'Pelicula' ? 'movie' : 'series';
      if (type && itemType !== type) return false;
      if (langKey && item.lang.key !== langKey) return false;
      return true;
    });

  const collected = [];
  // Como máximo 4 páginas de la web por petición de Stremio
  for (let fetched = 0; fetched < 4; fetched += 1) {
    const items = await fetchListingPage(sourcePath, page);
    if (items.length > 0 && !perPageBySource.has(sourcePath)) {
      perPageBySource.set(sourcePath, items.length);
    }
    if (!items.length) break;
    const filtered = applyFilters(items);
    const sliced = fetched === 0 ? filtered.slice(offset) : filtered;
    collected.push(...sliced);
    if (collected.length >= WANT_PER_REQUEST) break;
    // Si la página cruda vino incompleta, es la última
    const perPage = perPageBySource.get(sourcePath) || learned;
    if (items.length < perPage) break;
    page += 1;
  }

  // Sin duplicados por slug entre páginas
  const seen = new Set();
  return collected
    .filter((i) => (seen.has(i.slug) ? false : seen.add(i.slug)))
    .map(itemToMetaPreview);
}

async function getMetaDetail(slug) {
  const { text } = await fetchSitePage(ROUTES.anime(slug));
  const detail = parseDetail(text, slug);

  // Caso sospechoso: la ficha dice 1 episodio pero no es película
  // (pasa en algunos datos de la web). Se verifica en la página del
  // episodio 1, donde la lista/rangos dan el conteo real.
  const isSeriesLike = detail.siteType && detail.siteType !== 'Pelicula';
  if (isSeriesLike && (!detail.episodesAvailable || detail.episodesAvailable <= 1)) {
    try {
      const watch = await getWatch(slug, 1);
      if (watch.maxEpisode > (detail.episodesAvailable || 0)) {
        detail.episodesAvailable = watch.maxEpisode;
      }
    } catch {
      /* si falla, nos quedamos con el dato de la ficha */
    }
  }
  return detailToMeta(detail);
}

async function getWatch(slug, episode) {
  const { text, finalUrl } = await fetchSitePage(ROUTES.watch(slug, episode));
  return parseWatch(text, finalUrl, slug);
}

module.exports = {
  // parseo puro (testeable sin red)
  parseListing,
  parseDetail,
  parseWatch,
  itemToMetaPreview,
  detailToMeta,
  slugFromHref,
  withPage,
  // con red
  fetchListingPage,
  searchItems,
  getCatalogMetas,
  getMetaDetail,
  getWatch,
};
