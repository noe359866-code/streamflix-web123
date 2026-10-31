'use strict';

/**
 * Proveedores extra v1.3.0: AnimeJara · Latanime · AnimeD23.
 * Ver INVESTIGACION-PROVEEDORES-EXTRA.md para la evidencia de cada patrón.
 *
 * Modelos:
 *  - AnimeJara : UNA ficha por serie con TODAS las temporadas agrupadas;
 *                episodio /episode/{slug}-{T}x{E}/ con pestañas de idioma
 *                LATINO / JAPONÉS(=Sub) / CASTELLANO. Películas: /movie/{slug}.
 *                Los servidores salen en 2 pasos: `const enlaces=[...]` por
 *                idioma -> página de servidor con botones playVideo("...").
 *  - Latanime  : fichas separadas por idioma (título/slug con Latino o
 *                Castellano; sin marca = subtitulado). Buscador /buscar?q=,
 *                ver /ver/{slug}-episodio-{n}; reproductores en
 *                a.play-video[data-player] (URL en base64).
 *  - AnimeD23  : WordPress. Ficha /anime/{slug}/, capítulo
 *                /capitulo/{slug}-ep-{n}/ (badge Lat/Sub por episodio),
 *                buscador WP /?s= + REST /wp-json/wp/v2/search.
 */

const cheerio = require('cheerio');
const { JARA_BASE_URL, LAT_BASE_URL, D23_BASE_URL, LANGS } = require('./config');
const { fetchText } = require('./http');
const {
  normalizeSpaces,
  absoluteUrl,
  findDirectMediaUrls,
  findAllUrls,
  hostOf,
  titleTokens,
  normalizeTitle,
} = require('./util');
const { spacedText, scanElementForUrls } = require('./scraper');
const { toEmbedUrl, prettyServerName } = require('./infinity');

/* ==================================================================== */
/* Utilidades compartidas                                                */
/* ==================================================================== */

const BLOCK_RE =
  /google|googlesyndication|doubleclick|facebook|twitter\.com|x\.com|instagram|tiktok|disqus|challenges\.cloudflare|recaptcha|tawk|crisp|intercom|youtube\.com|youtu\.be|whatsapp|telegram/i;

const DOWNLOAD_HOST_RE =
  /mega\.nz|mega\.co\.nz|1fichier|gofile|mediafire|kraken|zippyshare|rapidgator|nitroflare|uploaded\.|turbobit|pixeldrain|drive\.google|terabox|sendspace|vikingfile|uptobox|file-upload|download\.php|descargas\./i;

function titleCase(str) {
  return String(str || '')
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();
}

function abs(url, base) {
  const out = absoluteUrl(url, base);
  return out || null;
}

function purge(raw) {
  const s = String(raw || '').trim();
  try {
    const u = new URL(s);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|ref_src)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return s;
  }
}

/** Castellano > Latino/Dub > Japonés/Sub, buscando en un texto cualquiera. */
function langFromText(text) {
  const t = ` ${normalizeTitle(text || '')} `;
  if (/ castellano | espana /.test(t)) return LANGS.cast;
  if (/ latino | doblado | dub | lat /.test(t)) return LANGS.lat;
  if (/ subtitulado | sub | japones /.test(t)) return LANGS.sub;
  return null;
}

const GROUP_RE =
  /^(sub|subtitulado|japones|japon[eé]s|dub|doblado|latino|lat|castellano|espa[nñ]ol(?:\s+(?:latino|castellano))?)\s*:?$/i;

function isEmbedLike(url) {
  if (!url || BLOCK_RE.test(url)) return false;
  if (/\.(jpg|jpeg|png|webp|gif|css|js|svg|ico|woff2?)(\?|$)/i.test(url)) return false;
  return /(embed|\/e\/|\/v\/|\/d\/|player|watch|video|stream|filemoon|mp4upload|streamtape|voe|dood|vidhide|filelions|streamwish|mixdrop|vidara|ok\.ru|sibnet|yourupload|lulustream|hglink|streamhide)/i.test(url);
}

function ownText($, $el) {
  let t = '';
  $el.contents().each((_, n) => { if (n && n.type === 'text') t += ` ${n.data}`; });
  return normalizeSpaces(t);
}

/** Idioma según el contenedor cercano (fila de tabla, tarjeta de descarga...). */
function containerLang($, $el) {
  let node = $el;
  for (let i = 0; i < 5; i += 1) {
    const parent = node.parent();
    if (!parent || !parent.length) break;
    node = parent;
    const txt = spacedText($, node);
    if (txt.length > 300) break;
    const lang = langFromText(txt);
    if (lang) return lang;
    if ((node[0].tagName || '').toLowerCase() === 'tr') break;
  }
  return null;
}

async function getText(url, referer) {
  const { text, finalUrl } = await fetchText(url, { referer: referer || `${new URL(url).origin}/` });
  return { text, finalUrl };
}

/** Filtra ruido (sidebars/populares) quedándose con títulos afines a la búsqueda. */
function filterRelevant(items, query) {
  const qTokens = titleTokens(query, { stripSeason: true }).filter((t) => t.length >= 3);
  if (!qTokens.length) return items;
  return items.filter((it) => {
    const toks = titleTokens(`${it.title} ${String(it.slug || '').replace(/-/g, ' ')}`, { stripSeason: true });
    const hits = qTokens.filter((t) => toks.includes(t)).length;
    return qTokens.length === 1 ? hits >= 1 : hits >= Math.min(2, qTokens.length);
  });
}

/**
 * Parser genérico de listados: sube por el DOM desde cada enlace de ficha
 * mientras el contenedor solo enlace a ese mismo slug (la «tarjeta»).
 */
function parseCards(html, { base, slugFromHref, build }) {
  const $ = cheerio.load(String(html || ''));
  const bySlug = new Map();
  const anchors = [];
  $('a[href]').each((_, el) => {
    const info = slugFromHref($(el).attr('href'));
    if (info && info.kind === 'detail') anchors.push({ $el: $(el), ...info });
  });

  const findCard = ($el, slug) => {
    let node = $el;
    for (let i = 0; i < 8; i += 1) {
      const parent = node.parent();
      if (!parent || !parent.length) break;
      const tag = (parent[0].tagName || '').toLowerCase();
      if (['body', 'html', 'main', 'section', 'ul'].includes(tag)) break;
      const slugs = new Set();
      parent.find('a[href]').each((_, a) => {
        const s = slugFromHref($(a).attr('href'));
        if (s && s.kind === 'detail') slugs.add(s.slug);
      });
      if (slugs.size === 0 || (slugs.size === 1 && slugs.has(slug))) node = parent;
      else break;
    }
    return node;
  };

  for (const a of anchors) {
    if (bySlug.has(a.slug)) continue;
    const $card = findCard(a.$el, a.slug);
    const text = spacedText($, $card);
    let title = normalizeSpaces($card.find('h1, h2, h3, h4').first().text());
    if (!title) {
      $card.find('a[href]').each((_, el) => {
        const info = slugFromHref($(el).attr('href'));
        if (!info || info.slug !== a.slug) return;
        const t = normalizeSpaces($(el).text());
        if (t && t.length > title.length && !/ver (ahora|anime|todo)/i.test(t)) title = t;
      });
    }
    if (!title || /^(ver|episodio|capitulo)\b/i.test(title)) {
      title = titleCase(a.slug.replace(/-tv$/i, '').replace(/-/g, ' '));
    }

    let poster = null;
    $card.find('img').each((_, img) => {
      if (poster) return;
      const $img = $(img);
      const srcset = ($img.attr('srcset') || '').split(',').map((s) => s.trim().split(' ')[0]).filter(Boolean);
      const cand = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || srcset[srcset.length - 1];
      if (cand && !/logo|avatar|emoji/i.test(cand)) poster = abs(cand, base) || cand;
    });

    const yearM = text.match(/\b(19[5-9]\d|20\d{2})\b/);
    const item = build({ $, $card, slug: a.slug, title, text, poster, year: yearM ? parseInt(yearM[1], 10) : null });
    if (item) bySlug.set(a.slug, item);
  }
  return [...bySlug.values()];
}

/* -------------------------------------------------------------------- */
/* Parser genérico de página de reproducción                            */
/* -------------------------------------------------------------------- */

const DATA_ATTRS = [
  'data-url', 'data-src', 'data-video', 'data-embed', 'data-iframe',
  'data-player', 'data-link', 'data-href', 'data-server', 'data-server-url',
  'data-lazy-src', 'data-stream', 'data-file',
];

function parseWatchGeneric(html, {
  base,
  slug,
  finalUrl,
  slugFromHref,
  fallbackLang = LANGS.sub,
  isSiteUrl,
} = {}) {
  const $ = cheerio.load(String(html || ''));
  const pageUrl = finalUrl || base;
  const embeds = [];
  const seen = new Set();
  const downloads = [];
  const directMedia = [];
  const sameSite = isSiteUrl || ((u) => hostOf(u) === hostOf(base));

  const addEmbed = (e, allowSite = false) => {
    if (!e || !e.url) return;
    const absUrl = abs(e.url, base);
    if (!absUrl) return;
    const url = purge(absUrl);
    if (BLOCK_RE.test(url)) return;
    if (sameSite(url) && !(allowSite && /player|embed|video/i.test(url))) return;
    if (/\.(jpg|jpeg|png|webp|gif|css|js|svg|ico)(\?|$)/i.test(url)) return;
    if (/\.m3u8(\?|$)/i.test(url) || /\.(mp4|mkv|webm|mpd)(\?|$)/i.test(url)) {
      if (!directMedia.some((d) => d.url === url)) directMedia.push({ url, lang: e.lang || fallbackLang });
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);
    embeds.push({ name: e.name || null, url, origin: e.origin || 'html', lang: e.lang || fallbackLang });
  };

  // 1) Descargas (con idioma del texto/contenedor cuando exista)
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = abs($el.attr('href'), base);
    if (!href || BLOCK_RE.test(href)) return;
    const text = spacedText($, $el);
    const host = hostOf(href);
    const prefixMatch = text.match(/^(SUBTITULADO|SUB|DOBLADO|DUB|LATINO|CASTELLANO|JAPONES|JAPON[EÉ]S)\b[:.\s-]+(.+)$/i);
    const isDownload = Boolean(prefixMatch)
      || DOWNLOAD_HOST_RE.test(host)
      || DOWNLOAD_HOST_RE.test(text)
      || /^descargar\b|^download\b/i.test(text);
    if (!isDownload || sameSite(href)) return;
    const lang = (prefixMatch && langFromText(prefixMatch[1]))
      || containerLang($, $el)
      || langFromText(text)
      || fallbackLang;
    let name = prefixMatch
      ? prettyServerName(prefixMatch[2].split(/[·|]/)[0].trim().slice(0, 30))
      : prettyServerName(text.replace(/^(descargar|download)\s*/i, '').trim().slice(0, 30)) || prettyServerName(host.split('.')[0]);
    if (!downloads.some((d) => d.url === href)) downloads.push({ name, url: href, lang });
    // Si en realidad es un filehost con reproductor, también como embed
    const emb = toEmbedUrl(href);
    if (emb) addEmbed({ name, url: emb, origin: 'download', lang });
  });

  // 2) Reproductor en orden de documento, siguiendo rótulos de idioma
  let currentLang = fallbackLang;
  let inDownloads = false;
  $('h1, h2, h3, h4, h5, div, span, p, li, a, button, iframe, option').each((_, el) => {
    const $el = $(el);
    const tag = (el.tagName || '').toLowerCase();
    const txt = ownText($, $el);
    if (txt && txt.length <= 34) {
      if (/^(descargas|descargar( capitulo| capítulo| episodio)?)/i.test(txt)) { inDownloads = true; return; }
      const g = txt.match(GROUP_RE);
      if (g) { currentLang = langFromText(g[1]) || currentLang; return; }
    }
    if (inDownloads) return;
    const clickable = ['a', 'button', 'li', 'iframe', 'option'].includes(tag);
    const hasData = el.attribs && DATA_ATTRS.some((k) => el.attribs[k]);
    if (!clickable && !hasData) return;

    const btnName = (() => {
      const t = normalizeSpaces($el.text());
      return t && t.length >= 2 && t.length <= 28 && /^[a-z0-9 ._-]+$/i.test(t) ? prettyServerName(t) : null;
    })();

    if (tag === 'iframe') {
      const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src') || '';
      if (src) addEmbed({ name: btnName, url: src, origin: 'iframe', lang: currentLang }, true);
    }
    // playVideo("...") / cargarReproductor('...') y data-* (incl. base64)
    const onclick = (el.attribs && el.attribs.onclick) || '';
    const pv = onclick.match(/(?:playVideo|loadVideo|cargar(?:Reproductor|Video)|changeServer|setIframe)\s*\(\s*['"]([^'"]+)['"]/i);
    if (pv) addEmbed({ name: btnName, url: pv[1], origin: 'onclick', lang: currentLang }, tag === 'iframe');
    for (const f of scanElementForUrls(el)) {
      addEmbed({ name: btnName, url: f.url, origin: `attr:${f.attr}`, lang: currentLang }, tag === 'iframe');
    }
  });

  // 3) Scripts: medios directos y embeds sueltos
  const scriptSrcs = [];
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) { const a = abs(src, base); if (a) scriptSrcs.push(a); return; }
    const code = $(el).html() || '';
    if (!code) return;
    for (const u of findDirectMediaUrls(code)) addEmbed({ url: u, origin: 'script', lang: langFromText(u) || fallbackLang });
    for (const u of findAllUrls(code)) {
      if (isEmbedLike(u)) addEmbed({ url: u, origin: 'script', lang: langFromText(u) || fallbackLang });
    }
  });

  // 4) Episodios enlazados de este slug
  const episodeNumbers = new Set();
  if (slugFromHref) {
    $('a[href]').each((_, el) => {
      const info = slugFromHref($(el).attr('href'));
      if (info && info.kind === 'watch' && info.slug === slug) episodeNumbers.add(info.episode);
    });
  }
  const eps = [...episodeNumbers].sort((a, b) => a - b);

  return {
    slug,
    title: normalizeSpaces($('title').first().text() || '') || null,
    finalUrl: pageUrl,
    episodeNumbers: eps,
    maxEpisode: eps.length ? eps[eps.length - 1] : null,
    directMedia,
    embeds,
    downloads,
    scriptSrcs: [...new Set(scriptSrcs)],
    langsAvailable: [...new Set([
      ...embeds.map((e) => e.lang.key),
      ...downloads.map((d) => d.lang.key),
      ...directMedia.map((d) => d.lang.key),
    ])],
  };
}

function siteMatcher(base, fn) {
  const hosts = new Set([hostOf(base)]);
  return (href) => {
    if (!href || typeof href !== 'string') return null;
    let u;
    try { u = new URL(href.trim(), `${base}/`); } catch { return null; }
    if (!hosts.has(u.hostname.replace(/^www\./, ''))) return null;
    const parts = u.pathname.split('/').filter(Boolean).map((p) => {
      try { return decodeURIComponent(p); } catch { return p; }
    });
    return fn(parts, u);
  };
}

/* ==================================================================== */
/* LATANIME — fichas por idioma                                          */
/* ==================================================================== */

const latSlugFromHref = siteMatcher(LAT_BASE_URL, (parts) => {
  if (parts.length === 2 && parts[0] === 'anime') return { slug: parts[1].toLowerCase(), kind: 'detail' };
  if (parts.length === 2 && parts[0] === 'ver') {
    const m = parts[1].match(/^(.+)-episodio-(\d+)$/i);
    if (m) return { slug: m[1].toLowerCase(), kind: 'watch', episode: parseInt(m[2], 10) };
  }
  return null;
});

function latLangFrom(title, slug, text) {
  const probe = `${title} ${String(slug).replace(/-/g, ' ')}`;
  if (/castellano/i.test(probe)) return LANGS.cast;
  if (/latino/i.test(probe)) return LANGS.lat;
  // La tarjeta repite la categoría/idioma tras el título
  const t = ` ${normalizeTitle(text || '')} `;
  if (/ castellano /.test(t)) return LANGS.cast;
  if (/ latino /.test(t)) return LANGS.lat;
  return LANGS.sub;
}

function parseLatListing(html) {
  return parseCards(html, {
    base: LAT_BASE_URL,
    slugFromHref: latSlugFromHref,
    build: ({ slug, title, text, poster, year }) => {
      const lang = latLangFrom(title, slug, text);
      const cleanTitle = title
        .replace(/\s*[-–—]?\s*(latino|castellano)\s*$/i, '')
        .replace(/\s*\((latino|castellano)\)\s*$/i, '')
        .trim() || title;
      return {
        provider: 'latanime',
        slug,
        title: cleanTitle,
        rawTitle: title,
        lang,
        year,
        siteType: /pel[ií]cula/i.test(text) || /pel[ií]cula/i.test(title) ? 'Pelicula' : 'TV',
        epCurrent: null,
        poster,
        url: `${LAT_BASE_URL}/anime/${slug}`,
        source: 'buscar',
        text: text.slice(0, 400),
      };
    },
  });
}

async function searchLat(query) {
  const { text } = await getText(`${LAT_BASE_URL}/buscar?q=${encodeURIComponent(query)}`, `${LAT_BASE_URL}/`);
  return filterRelevant(parseLatListing(text), query);
}

function parseLatWatch(html, finalUrl, slug) {
  const $ = cheerio.load(String(html || ''));
  const heading = normalizeSpaces($('h2').first().text() || $('title').first().text() || '');
  const fallback = latLangFrom(heading, slug, heading);
  return parseWatchGeneric(html, {
    base: LAT_BASE_URL,
    slug,
    finalUrl,
    slugFromHref: latSlugFromHref,
    fallbackLang: fallback,
  });
}

async function getWatchLat(slug, episode) {
  const url = `${LAT_BASE_URL}/ver/${slug}-episodio-${episode}`;
  const { text, finalUrl } = await getText(url, `${LAT_BASE_URL}/anime/${slug}`);
  return parseLatWatch(text, finalUrl || url, slug);
}

/* ==================================================================== */
/* ANIMED23 — WordPress                                                  */
/* ==================================================================== */

const d23SlugFromHref = siteMatcher(D23_BASE_URL, (parts) => {
  if (parts.length === 2 && parts[0] === 'anime') return { slug: parts[1].toLowerCase(), kind: 'detail' };
  if (parts.length === 2 && parts[0] === 'capitulo') {
    const m = parts[1].match(/^(.+)-ep-(\d+)$/i);
    if (m) return { slug: m[1].toLowerCase(), kind: 'watch', episode: parseInt(m[2], 10) };
  }
  return null;
});

function d23Item({ slug, title, text, poster, year, source }) {
  return {
    provider: 'animed23',
    slug,
    title,
    year: year || null,
    siteType: /\b(pel[ií]cula|movie)\b/i.test(`${text || ''} ${title}`) ? 'Pelicula' : 'TV',
    epCurrent: (String(text || '').match(/\b(\d{1,4})\s*(?:ep\.|episodios?|capitulos?|capítulos?)\b/i) || [])[1]
      ? parseInt((String(text || '').match(/\b(\d{1,4})\s*(?:ep\.|episodios?|capitulos?|capítulos?)\b/i) || [])[1], 10)
      : null,
    hasLat: /\bLat\b|latino/i.test(text || ''),
    hasCast: /castellano|\bCas\b/i.test(text || ''),
    poster: poster || null,
    url: `${D23_BASE_URL}/anime/${slug}/`,
    source: source || 'wp-search',
    text: String(text || '').slice(0, 400),
  };
}

function parseD23Listing(html) {
  return parseCards(html, {
    base: D23_BASE_URL,
    slugFromHref: d23SlugFromHref,
    build: ({ slug, title, text, poster, year }) => d23Item({ slug, title, text, poster, year }),
  });
}

/** La REST de búsqueda devuelve capítulos (posts): se deriva la serie. */
function parseD23RestSearch(arr) {
  if (!Array.isArray(arr)) return [];
  const bySlug = new Map();
  for (const r of arr) {
    const info = d23SlugFromHref(r && r.url);
    if (!info) continue;
    const slug = info.slug;
    if (bySlug.has(slug)) continue;
    const title = normalizeSpaces(String(r.title || '').replace(/\s+ep\.?\s*\d+\s*$/i, ''))
      || titleCase(slug.replace(/-/g, ' '));
    bySlug.set(slug, d23Item({ slug, title, text: '', source: 'rest' }));
  }
  return [...bySlug.values()];
}

async function searchD23(query) {
  const [htmlRes, restRes] = await Promise.allSettled([
    getText(`${D23_BASE_URL}/?s=${encodeURIComponent(query)}`),
    getText(`${D23_BASE_URL}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=20&_fields=title,url`),
  ]);
  const fromHtml = htmlRes.status === 'fulfilled' ? parseD23Listing(htmlRes.value.text) : [];
  let fromRest = [];
  if (restRes.status === 'fulfilled') {
    try { fromRest = parseD23RestSearch(JSON.parse(restRes.value.text)); } catch { fromRest = []; }
  }
  if (htmlRes.status === 'rejected' && restRes.status === 'rejected') throw htmlRes.reason;
  const map = new Map();
  for (const it of filterRelevant(fromHtml, query)) map.set(it.slug, it);
  for (const it of filterRelevant(fromRest, query)) if (!map.has(it.slug)) map.set(it.slug, it);
  return [...map.values()];
}

function parseD23Watch(html, finalUrl, slug) {
  // La ficha del episodio trae badge de idiomas ("Lat Sub", "Sub"...) bajo el título
  const $ = cheerio.load(String(html || ''));
  const headText = spacedText($, $('h1').first().parent());
  const fallback = (/\bLat\b/i.test(headText) && !/\bSub\b/i.test(headText)) ? LANGS.lat : LANGS.sub;
  return parseWatchGeneric(html, {
    base: D23_BASE_URL,
    slug,
    finalUrl,
    slugFromHref: d23SlugFromHref,
    fallbackLang: fallback,
  });
}

async function getWatchD23(slug, episode) {
  const url = `${D23_BASE_URL}/capitulo/${slug}-ep-${episode}/`;
  const { text, finalUrl } = await getText(url, `${D23_BASE_URL}/anime/${slug}/`);
  return parseD23Watch(text, finalUrl || url, slug);
}

/* ==================================================================== */
/* ANIMEJARA — temporadas agrupadas + pestañas de idioma                 */
/* ==================================================================== */

const jaraSlugFromHref = siteMatcher(JARA_BASE_URL, (parts) => {
  if (parts.length === 2 && parts[0] === 'anime') return { slug: parts[1].toLowerCase(), kind: 'detail' };
  if (parts.length === 2 && parts[0] === 'movie') return { slug: parts[1].toLowerCase(), kind: 'detail', movie: true };
  if (parts.length === 2 && parts[0] === 'episode') {
    const m = parts[1].match(/^(.+)-(\d+)x(\d+)$/i);
    if (m) return { slug: m[1].toLowerCase(), kind: 'watch', season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
  }
  return null;
});

function jaraItem({ slug, title, text, poster, year, isMovieHint, source }) {
  const langs = [];
  if (/latino/i.test(text || '')) langs.push('lat');
  if (/castellano/i.test(text || '')) langs.push('cast');
  if (/japones|japon[eé]s|subtitulado|\bsub\b/i.test(text || '')) langs.push('sub');
  return {
    provider: 'animejara',
    slug,
    title,
    year: year || null,
    siteType: isMovieHint || /\b(pel[ií]cula|movie)\b/i.test(`${text || ''} ${title}`) ? 'Pelicula' : 'TV',
    epCurrent: (String(text || '').match(/\b(\d{1,4})\s*episodios?\b/i) || [])[1]
      ? parseInt((String(text || '').match(/\b(\d{1,4})\s*episodios?\b/i) || [])[1], 10)
      : null,
    multiSeason: true,
    langsHint: langs,
    poster: poster || null,
    url: `${JARA_BASE_URL}/anime/${slug}/`,
    source: source || 'catalogo',
    text: String(text || '').slice(0, 400),
  };
}

function parseJaraCatalogo(html) {
  const $ = cheerio.load(String(html || ''));
  const items = [];
  $('#anime-results > div.anime-card-wrapper').each((_, el) => {
    const $card = $(el);
    const $a = $card.find('a[href]').first();
    const info = jaraSlugFromHref($a.attr('href'));
    if (!info) return;
    let data = null;
    try { data = JSON.parse($card.find('a.anime-card').attr('data-anime') || ''); } catch { data = null; }
    const text = spacedText($, $card);
    // Las banderas de idioma son imágenes (latino.png/japones.png/castellano.png)
    const flags = [];
    $card.find('img').each((__, img) => {
      const s = `${$(img).attr('src') || ''} ${$(img).attr('alt') || ''}`;
      const l = langFromText(s);
      if (l) flags.push(l.label);
    });
    const title = normalizeSpaces($card.find('h3').first().text())
      || (data && (data.titulo || data.title))
      || titleCase(info.slug.replace(/-/g, ' '));
    // Póster: la primera imagen que NO sea una bandera de idioma
    let posterImg = null;
    $card.find('img').each((__, img) => {
      if (posterImg) return;
      const src = $(img).attr('data-src') || $(img).attr('src') || '';
      const probe = `${src} ${$(img).attr('alt') || ''}`;
      if (src && !langFromText(probe) && !/flag|bandera|idioma/i.test(probe)) posterImg = src;
    });
    items.push(jaraItem({
      slug: info.slug,
      title,
      text: `${text} ${flags.join(' ')}`,
      poster: (data && data.poster) || abs(posterImg, JARA_BASE_URL),
      year: (data && parseInt(data.anio || data.year, 10)) || null,
      isMovieHint: Boolean(info.movie),
    }));
  });
  if (items.length) return items;
  return parseCards(html, {
    base: JARA_BASE_URL,
    slugFromHref: jaraSlugFromHref,
    build: ({ slug, title, text, poster, year }) => jaraItem({ slug, title, text, poster, year }),
  });
}

/** Respaldo: índice completo de series en /anime-sitemap.xml */
function parseJaraSitemap(xml, query) {
  const urls = [...String(xml || '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const items = [];
  for (const url of urls) {
    const info = jaraSlugFromHref(url);
    if (!info || info.kind !== 'detail') continue;
    items.push(jaraItem({
      slug: info.slug,
      title: titleCase(info.slug.replace(/-tv$/i, '').replace(/-/g, ' ')),
      text: '',
      source: 'sitemap',
    }));
  }
  return filterRelevant(items, query).slice(0, 12);
}

async function searchJara(query) {
  const { text } = await getText(`${JARA_BASE_URL}/catalogo?q=${encodeURIComponent(query)}`, `${JARA_BASE_URL}/`);
  const found = filterRelevant(parseJaraCatalogo(text), query);
  if (found.length) return found;
  try {
    const sm = await getText(`${JARA_BASE_URL}/anime-sitemap.xml`);
    return parseJaraSitemap(sm.text, query);
  } catch {
    return found;
  }
}

/** Botones de idioma + arreglo `enlaces`/`movieLinks` de la página de episodio. */
function parseJaraEnlaces(html) {
  const $ = cheerio.load(String(html || ''));
  const buttons = [];
  $('div.botones-idioma > div.boton-idioma').each((_, el) => {
    const $el = $(el);
    const onclick = $el.attr('onclick') || '';
    const idx = (onclick.match(/cambiarIdioma(?:Movie)?\((\d+)/) || [])[1];
    const nameText = normalizeSpaces($el.find('.lang-name').text() || $el.text())
      || ($el.find('img').attr('alt') || '');
    buttons.push({
      index: idx !== undefined ? parseInt(idx, 10) : buttons.length,
      lang: langFromText(nameText) || langFromText($el.find('img').attr('src') || '') || LANGS.sub,
    });
  });

  let enlaces = [];
  $('script').each((_, el) => {
    if (enlaces.length) return;
    const code = $(el).html() || '';
    const m = code.match(/\b(?:enlaces|movieLinks)\s*=\s*(\[[\s\S]*?\]);/);
    if (!m) return;
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) enlaces = parsed.map((e) => (typeof e === 'string' ? e : e && (e.url || e.link))).filter(Boolean);
    } catch { enlaces = []; }
  });
  return { buttons, enlaces };
}

/** Página intermedia de servidores (streamhj): botones playVideo("url"). */
function parseJaraServerPage(html, lang) {
  const $ = cheerio.load(String(html || ''));
  const out = [];
  const seenSrv = new Set();
  $('[onclick*="playVideo"], #logo-list > li, li, button, a').each((_, el) => {
    const $el = $(el);
    const onclick = ($el.attr('onclick') || '').replace(/&quot;/g, '"');
    const m = onclick.match(/playVideo\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
    if (!m) return;
    let url = m[1].trim();
    // Envoltorio go.php?v=... -> destino real si viene como URL
    const wrapper = url.match(/[?&]v=([^&]+)/);
    if (/go\.php/i.test(url) && wrapper) {
      try {
        const inner = decodeURIComponent(wrapper[1]);
        if (/^https?:\/\//i.test(inner)) url = inner;
      } catch { /* se deja el envoltorio */ }
    }
    url = purge(url);
    if (!/^https?:\/\//i.test(url) || seenSrv.has(url) || BLOCK_RE.test(url)) return;
    seenSrv.add(url);
    const name = prettyServerName(normalizeSpaces($el.find('.nombre-server').first().text()))
      || prettyServerName(hostOf(url).split('.')[0]);
    out.push({ name, url, origin: 'jara:playVideo', lang });
  });
  return out;
}

function jaraWatchUrl(slug, episode, { season = 1, isMovie = false } = {}) {
  return isMovie
    ? `${JARA_BASE_URL}/movie/${slug}`
    : `${JARA_BASE_URL}/episode/${slug}-${season || 1}x${episode || 1}/`;
}

async function getWatchJara(slug, episode, opts = {}) {
  const url = jaraWatchUrl(slug, episode, opts);
  const { text: html, finalUrl } = await getText(url, `${JARA_BASE_URL}/anime/${slug}/`);
  const generic = parseWatchGeneric(html, {
    base: JARA_BASE_URL,
    slug,
    finalUrl: finalUrl || url,
    slugFromHref: jaraSlugFromHref,
    fallbackLang: opts.fallbackLang || LANGS.sub,
  });

  const { buttons, enlaces } = parseJaraEnlaces(html);
  if (!enlaces.length) return generic;

  const embeds = [];
  const seenE = new Set();
  const pushE = (e) => { if (!seenE.has(e.url)) { seenE.add(e.url); embeds.push(e); } };
  await Promise.allSettled(enlaces.map(async (link, i) => {
    const btn = buttons.find((b) => b.index === i) || buttons[i];
    const lang = (btn && btn.lang) || LANGS.sub;
    const absLink = abs(link, JARA_BASE_URL);
    if (!absLink) return;
    try {
      const page = await getText(absLink, `${JARA_BASE_URL}/`);
      const servers = parseJaraServerPage(page.text, lang);
      if (servers.length) servers.forEach(pushE);
      else pushE({ name: null, url: purge(absLink), origin: 'jara:enlace', lang });
    } catch {
      pushE({ name: null, url: purge(absLink), origin: 'jara:enlace', lang });
    }
  }));

  // Los embeds genéricos que sean el propio envoltorio quedan fuera si ya
  // tenemos servidores reales de segundo nivel.
  const extra = (generic.embeds || []).filter(
    (e) => !enlaces.some((l) => purge(abs(l, JARA_BASE_URL) || l) === e.url)
  );
  const merged = [...embeds, ...extra.filter((e) => !seenE.has(e.url))];
  return {
    ...generic,
    embeds: merged,
    langsAvailable: [...new Set([
      ...merged.map((e) => e.lang.key),
      ...(generic.downloads || []).map((d) => d.lang.key),
      ...(generic.directMedia || []).map((d) => d.lang.key),
    ])],
  };
}

module.exports = {
  // compartidos (tests)
  parseCards,
  parseWatchGeneric,
  langFromText,
  filterRelevant,
  // Latanime
  latSlugFromHref,
  parseLatListing,
  parseLatWatch,
  searchLat,
  getWatchLat,
  // AnimeD23
  d23SlugFromHref,
  parseD23Listing,
  parseD23RestSearch,
  parseD23Watch,
  searchD23,
  getWatchD23,
  // AnimeJara
  jaraSlugFromHref,
  parseJaraCatalogo,
  parseJaraSitemap,
  parseJaraEnlaces,
  parseJaraServerPage,
  jaraWatchUrl,
  searchJara,
  getWatchJara,
};
