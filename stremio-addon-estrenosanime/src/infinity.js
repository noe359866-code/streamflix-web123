'use strict';

/**
 * Proveedor InfinityAnime (https://infinityanime.net) — WordPress.
 *
 * Modelo (verificado en INVESTIGACION-INFINITY.md), MUY distinto a EstrenosAnime:
 *  - UNA ficha por título: /{slug}/  y  /{slug}/episodio-{n}/
 *  - Los idiomas conviven en la MISMA página del episodio, agrupados como
 *    "Sub:" y "Dub:" (Dub = doblaje latino; única etiqueta de idioma del sitio).
 *    No hay Castellano etiquetado en InfinityAnime.
 *  - Sección «Descargas» con enlaces directos por idioma y servidor:
 *    "SUBTITULADO filemoon", "DOBLADO vidara", ... convertibles a embeds.
 *  - Buscador: /directorio/?s_keyword=  + REST de WordPress abierta
 *    (/wp-json/wp/v2/serie?search=), sin players en la REST (meta no expuesta).
 */

const cheerio = require('cheerio');
const { INF_BASE_URL, INF_ROUTES, LANGS, DEMO_FALLBACK } = require('./config');
const { fetchText } = require('./http');
const {
  normalizeSpaces,
  absoluteUrl,
  findDirectMediaUrls,
  findAllUrls,
  hostOf,
} = require('./util');
const { spacedText, scanElementForUrls } = require('./scraper');

const INF_HOST = (() => {
  try { return new URL(INF_BASE_URL).hostname.replace(/^www\./, ''); } catch { return 'infinityanime.net'; }
})();
const ALLOWED_HOSTS = new Set([INF_HOST, 'infinityanime.net', 'animeonline.lat']);

const EMBED_BLOCKLIST_RE =
  /google|googlesyndication|doubleclick|facebook|twitter\.com|x\.com|instagram|tiktok|disqus|challenges\.cloudflare|recaptcha|tawk|crisp|intercom|youtube\.com|youtu\.be|whatsapp|telegram/i;

// Slugs de raíz que son páginas del sitio (no fichas de anime)
const RESERVED_SLUGS = new Set([
  'directorio', 'calendario', 'genero', 'generos', 'estudio', 'tipo', 'estado',
  'temporada', 'anio', 'ano', 'etiqueta', 'etiquetas', 'wp-admin', 'wp-json',
  'wp-login.php', 'wp-content', 'wp-includes', 'feed', 'comments', 'buscar',
  'search', 'login', 'logout', 'registro', 'register', 'mi-cuenta', 'mi-lista',
  'contacto', 'dmca', 'terminos', 'privacidad', 'nosotros', 'favoritos',
  'author', 'category', 'categoria', 'tag', 'page', 'random', 'serie',
  'episode', 'episodio', 'home', 'inicio', 'sitemap.xml', 'robots.txt',
]);

function titleCase(str) {
  return String(str || '')
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();
}

function toAbsoluteInf(url) {
  const abs = absoluteUrl(url, INF_BASE_URL);
  return abs || null;
}

/** Quita #fragmento y parámetros de tracking de una URL. */
function purgeUrl(raw) {
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

function isInfUrl(url) {
  return ALLOWED_HOSTS.has(hostOf(url));
}

function isEmbedLikeInf(url) {
  if (!url || EMBED_BLOCKLIST_RE.test(url)) return false;
  if (/\.(jpg|jpeg|png|webp|gif|css|js|svg|ico|woff2?)(\?|$)/i.test(url)) return false;
  return /(embed|\/e\/|\/v\/|\/d\/|player|watch|video|stream|filemoon|mp4upload|streamtape|voe|dood|vidhide|filelions|streamwish|mixdrop|vidara|ok\.ru|sibnet|yourupload)/i.test(url);
}

/** /one-piece-tv/ → detail · /one-piece-tv/episodio-1180/ → watch */
function infSlugFromHref(href) {
  if (!href || typeof href !== 'string') return null;
  let u;
  try {
    u = new URL(href.trim(), `${INF_BASE_URL}/`);
  } catch {
    return null;
  }
  if (!ALLOWED_HOSTS.has(u.hostname.replace(/^www\./, ''))) return null;
  const parts = u.pathname.split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  if (parts.length === 0 || parts.length > 2) return null;
  const slug = parts[0].toLowerCase();
  if (!slug || slug.includes('.') || RESERVED_SLUGS.has(slug)) return null;
  if (parts.length === 1) return { slug, kind: 'detail' };
  const m = parts[1].match(/^episodio-(\d+)$/i);
  if (m) return { slug, kind: 'watch', episode: parseInt(m[1], 10) };
  return null;
}

// ---------------------------------------------------------------------------
// Listados / buscador (directorio HTML)
// ---------------------------------------------------------------------------

function parseDirectorio(html, baseUrl = INF_BASE_URL) {
  const $ = cheerio.load(String(html || ''));
  const byslug = new Map();
  const anchors = [];
  $('a[href]').each((_, el) => {
    const info = infSlugFromHref($(el).attr('href'));
    if (info) anchors.push({ $el: $(el), ...info });
  });

  // Igual que en EstrenosAnime: subir por el DOM mientras todos los enlaces
  // del contenedor apunten al mismo slug => la tarjeta completa.
  const findCard = ($el, slug) => {
    let node = $el;
    for (let i = 0; i < 8; i += 1) {
      const parent = node.parent();
      if (!parent || parent.length === 0) break;
      const tag = (parent[0].tagName || '').toLowerCase();
      if (['body', 'html', 'main', 'section', 'ul'].includes(tag)) break;
      const slugs = new Set();
      parent.find('a[href]').each((_, a) => {
        const s = infSlugFromHref($(a).attr('href'));
        if (s) slugs.add(s.slug);
      });
      if (slugs.size === 0 || (slugs.size === 1 && slugs.has(slug))) node = parent;
      else break;
    }
    return node;
  };

  for (const a of anchors) {
    if (byslug.has(a.slug)) continue;
    const $card = findCard(a.$el, a.slug);
    const text = spacedText($, $card);

    let title = '';
    const heading = normalizeSpaces($card.find('h1, h2, h3, h4').first().text());
    if (heading) title = heading;
    if (!title) {
      $card.find('a[href]').each((_, el) => {
        const info = infSlugFromHref($(el).attr('href'));
        if (!info || info.slug !== a.slug || info.kind !== 'detail') return;
        const t = normalizeSpaces($(el).text());
        if (t && !/ver ahora/i.test(t) && t.length > title.length) title = t;
      });
    }
    if (!title || /^ver ahora$/i.test(title) || /^episodio\s*\d+$/i.test(title)) {
      title = titleCase(a.slug.replace(/-tv$/i, '').replace(/-/g, ' '));
    }

    let poster = null;
    $card.find('img').each((_, img) => {
      if (poster) return;
      const $img = $(img);
      const srcset = ($img.attr('srcset') || '').split(',').map((s) => s.trim().split(' ')[0]).filter(Boolean);
      const cand = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || srcset[srcset.length - 1];
      if (cand && !/logo|InfinityAnime\.net_/i.test(cand)) poster = toAbsoluteInf(cand) || cand;
    });

    const yearM = text.match(/\b(19[5-9]\d|20\d{2})\b/);
    const tipoM = text.match(/\b(Pel[ií]cula|OVA|ONA|Especial|Anime)\b/);
    const epsM = text.match(/\b(\d{1,5})\s*eps?\b/i);
    const estadoM = text.match(/\b(Finalizado|En emisi[oó]n|Pausado|Pr[oó]ximamente)\b/i);

    byslug.set(a.slug, {
      provider: 'infinity',
      slug: a.slug,
      title,
      year: yearM ? parseInt(yearM[1], 10) : null,
      // Forma canónica compartida con EstrenosAnime: Pelicula | TV | OVA | ONA | Especial
      siteType: tipoM
        ? (/pel/i.test(tipoM[1]) ? 'Pelicula' : tipoM[1] === 'Anime' ? 'TV' : titleCase(tipoM[1]))
        : null,
      epCurrent: epsM ? parseInt(epsM[1], 10) : null,
      status: estadoM ? estadoM[1] : null,
      hasLat: /\blatino\b/i.test(text) || /\bLAT\b/.test(text),
      poster,
      url: `${baseUrl}${INF_ROUTES.anime(a.slug)}`,
      source: 'directorio',
      text: text.slice(0, 400),
    });
  }
  return [...byslug.values()];
}

// ---------------------------------------------------------------------------
// REST de WordPress (búsqueda rápida; sin players)
// ---------------------------------------------------------------------------

const TIPO_CLASS_MAP = {
  anime: 'TV', pelicula: 'Pelicula', 'película': 'Pelicula',
  ova: 'OVA', ona: 'ONA', especial: 'Especial', corto: 'Especial',
};

function parseSerieRest(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const s of arr) {
    const slug = String(s && s.slug ? s.slug : '').toLowerCase();
    if (!slug || RESERVED_SLUGS.has(slug)) continue;
    const classes = Array.isArray(s.class_list) ? s.class_list : [];
    const tipoClass = classes.find((c) => /^tipo-/.test(c));
    const etiquetas = Array.isArray(s.etiqueta) ? s.etiqueta : [];
    const rawTitle = s.title && s.title.rendered ? s.title.rendered : slug.replace(/-/g, ' ');
    const title = normalizeSpaces(cheerio.load(`<span>${rawTitle}</span>`)('span').text());
    out.push({
      provider: 'infinity',
      slug,
      title: title || titleCase(slug.replace(/-/g, ' ')),
      year: null,
      siteType: tipoClass ? (TIPO_CLASS_MAP[tipoClass.replace(/^tipo-/, '')] || null) : null,
      epCurrent: null,
      status: null,
      hasLat: etiquetas.includes(434) || classes.includes('etiqueta-latino'),
      poster: null,
      url: `${INF_BASE_URL}${INF_ROUTES.anime(slug)}`,
      source: 'rest',
      text: '',
    });
  }
  return out;
}

async function fetchInf(path) {
  const { text } = await fetchText(`${INF_BASE_URL}${path}`, { referer: `${INF_BASE_URL}/` });
  return text;
}

/** Busca en InfinityAnime combinando directorio HTML + REST WP. */
async function searchInf(query) {
  const [htmlRes, restRes] = await Promise.allSettled([
    fetchInf(INF_ROUTES.directorioSearch(query)),
    fetchInf(INF_ROUTES.restSerieSearch(query)),
  ]);

  const fromHtml = htmlRes.status === 'fulfilled' ? parseDirectorio(htmlRes.value) : [];
  let fromRest = [];
  if (restRes.status === 'fulfilled') {
    try { fromRest = parseSerieRest(JSON.parse(restRes.value)); } catch { fromRest = []; }
  }

  if (htmlRes.status === 'rejected' && restRes.status === 'rejected') {
    if (DEMO_FALLBACK) {
      // eslint-disable-next-line global-require
      return require('./demo').demoSearchItemsInf(query);
    }
    throw htmlRes.reason;
  }

  const map = new Map();
  for (const it of fromHtml) map.set(it.slug, it);
  for (const it of fromRest) {
    const prev = map.get(it.slug);
    if (!prev) map.set(it.slug, it);
    else map.set(it.slug, { ...it, ...prev, hasLat: prev.hasLat || it.hasLat, source: 'directorio+rest' });
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Descargas → embeds
// ---------------------------------------------------------------------------

const DOWNLOAD_ONLY_HOSTS = /(mega\.nz|mega\.co\.nz|1fichier|zippyshare|mediafire|rapidgator|nitroflare|uploaded\.|turbobit|krakenfiles|gofile|pixeldrain|sendspace|workupload|katfile|fikper|filerio|clicknupload|dailyuploads|drop\.download|usersdrive)/i;

/**
 * Convierte una URL de «descarga» de filehost a su URL de reproductor/embed.
 * Devuelve null si el host no tiene reproductor (Mega, 1fichier, ...).
 */
function toEmbedUrl(raw) {
  const abs = toAbsoluteInf(String(raw || ''));
  if (!abs) return null;
  let u;
  try { u = new URL(purgeUrl(abs)); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const path = u.pathname;
  if (DOWNLOAD_ONLY_HOSTS.test(host)) return null;

  let m;
  // MP4Upload: /{id}.html → /embed-{id}.html
  if (/mp4upload/.test(host) && (m = path.match(/^\/(?:embed-)?([A-Za-z0-9]+)\.html/))) {
    return `https://www.mp4upload.com/embed-${m[1]}.html`;
  }
  // StreamTape: /v/{id}/ → /e/{id}
  if (/streamtape|strtape/.test(host) && (m = path.match(/^\/(?:v|e)\/([A-Za-z0-9]+)/))) {
    return `https://streamtape.com/e/${m[1]}`;
  }
  // MixDrop: /f/{id} → /e/{id}
  if (/mixdrop|mxdrop/.test(host) && (m = path.match(/^\/(?:f|e)\/([A-Za-z0-9]+)/))) {
    return `${u.origin}/e/${m[1]}`;
  }
  // Filemoon y mirrors + familia XFileSharing/Dood: /d/{id} → /e/{id}
  if ((m = path.match(/^\/(?:d|e)\/([A-Za-z0-9]{5,})/))) {
    return `${u.origin}/e/${m[1]}`;
  }
  // Vidara/VidHide y similares: la página /v/{id} ya es el reproductor (lo resuelve el extractor)
  if (/^\/(?:v|e|embed|video|watch)\/[A-Za-z0-9]/.test(path)) return u.href;
  if (isEmbedLikeInf(u.href)) return u.href;
  return null;
}

const SERVER_PRETTY = {
  filemoon: 'Filemoon', vidara: 'Vidara', mp4upload: 'MP4Upload', streamtape: 'StreamTape',
  mega: 'MEGA', '1fichier': '1fichier', zippyshare: 'Zippyshare', voe: 'Voe',
  doodstream: 'Doodstream', dood: 'Doodstream', streamwish: 'StreamWish',
  filelions: 'FileLions', vidhide: 'VidHide', mixdrop: 'MixDrop', okru: 'OK.ru',
  'ok.ru': 'OK.ru', sibnet: 'Sibnet', yourupload: 'YourUpload',
};

function prettyServerName(name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const key = clean.toLowerCase().replace(/[^a-z0-9.]/g, '');
  return SERVER_PRETTY[key] || titleCase(clean.toLowerCase());
}

function langFromWord(word) {
  const w = String(word || '').toLowerCase();
  if (/sub/.test(w)) return LANGS.sub;
  if (/castellano/.test(w)) return LANGS.cast;
  // Dub / Doblado / Latino: el doblaje que etiqueta InfinityAnime es el latino
  return LANGS.lat;
}

// ---------------------------------------------------------------------------
// Página de reproducción
// ---------------------------------------------------------------------------

const DATA_ATTRS = [
  'data-url', 'data-src', 'data-video', 'data-embed', 'data-iframe',
  'data-player', 'data-link', 'data-href', 'data-server', 'data-server-url',
  'data-lazy-src', 'data-stream', 'data-file',
];

const GROUP_RE = /^(sub|subtitulado|dub|doblado|latino|castellano|espa[nñ]ol(?:\s+(?:latino|castellano))?)\s*:?$/i;

function ownText($el) {
  let t = '';
  $el.contents().each((_, n) => { if (n && n.type === 'text') t += ` ${n.data}`; });
  return normalizeSpaces(t);
}

function parseWatchInf(html, finalUrl, slug) {
  const $ = cheerio.load(String(html || ''));
  const pageUrl = finalUrl || `${INF_BASE_URL}/${slug}/`;
  const embeds = [];
  const embedUrls = new Set();
  const downloads = [];
  const directMedia = [];

  const addEmbed = (e, { allowSite = false } = {}) => {
    if (!e || !e.url) return;
    const abs = toAbsoluteInf(e.url);
    if (!abs) return;
    const url = purgeUrl(abs);
    if (EMBED_BLOCKLIST_RE.test(url)) return;
    if (isInfUrl(url)) {
      if (!(allowSite && /player|embed|video/i.test(url))) return;
    }
    if (/\.(jpg|jpeg|png|webp|gif|css|js|svg|ico)(\?|$)/i.test(url)) return;
    if (/\.m3u8(\?|$)/i.test(url) || /\.(mp4|mkv|webm|mpd)(\?|$)/i.test(url)) {
      if (!directMedia.some((d) => d.url === url)) {
        directMedia.push({ url, lang: e.lang || LANGS.sub });
      }
      return;
    }
    if (embedUrls.has(url)) return;
    embedUrls.add(url);
    embeds.push({
      name: e.name || null,
      url,
      origin: e.origin || 'html',
      lang: e.lang || LANGS.sub,
    });
  };

  // 1) Descargas: idioma EXACTO en el texto del enlace (prioridad en el dedupe)
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = toAbsoluteInf($el.attr('href'));
    if (!href || isInfUrl(href) || EMBED_BLOCKLIST_RE.test(href)) return;
    const text = spacedText($, $el);
    const m = text.match(/^(SUBTITULADO|SUB|DOBLADO|DUB|LATINO|CASTELLANO)\b[:.\s-]+(.+)$/i);
    if (!m) return;
    const lang = langFromWord(m[1]);
    const server = prettyServerName(m[2].split(/[·|]/)[0].replace(/[-–—]\s*HD$/i, '').trim().slice(0, 30));
    if (!downloads.some((d) => d.url === href)) {
      downloads.push({ name: server, url: href, lang });
    }
    const embedUrl = toEmbedUrl(href);
    if (embedUrl) addEmbed({ name: server, url: embedUrl, origin: 'download', lang });
  });

  // 2) Reproductor: recorrido en orden de documento siguiendo los grupos
  //    «Sub:» / «Dub:» para etiquetar cada servidor con su idioma.
  let currentLang = LANGS.sub;
  let inDownloads = false;
  $('h1, h2, h3, h4, h5, div, span, p, li, a, button, iframe').each((_, el) => {
    const $el = $(el);
    const tag = (el.tagName || '').toLowerCase();
    const txt = ownText($el);
    if (txt && txt.length <= 32) {
      if (/^descargas$/i.test(txt)) { inDownloads = true; return; }
      const g = txt.match(GROUP_RE);
      if (g) { currentLang = langFromWord(g[1]); return; }
    }
    if (inDownloads) return;
    const clickable = ['a', 'button', 'li', 'iframe'].includes(tag);
    const hasData = el.attribs && DATA_ATTRS.some((k) => el.attribs[k]);
    if (!clickable && !hasData) return;

    const btnName = (() => {
      const t = normalizeSpaces($el.text());
      return t && t.length >= 2 && t.length <= 26 && /^[a-z0-9 ._-]+$/i.test(t) ? prettyServerName(t) : null;
    })();

    // iframe (incl. rutas relativas tipo /player/...)
    if (tag === 'iframe') {
      const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src') || '';
      if (src) addEmbed({ name: btnName, url: src, origin: 'iframe', lang: currentLang }, { allowSite: true });
    }
    // Cualquier atributo con URL (o base64) — reutiliza el escáner de EstrenosAnime
    for (const f of scanElementForUrls(el)) {
      addEmbed(
        { name: btnName, url: f.url, origin: `attr:${f.attr}`, lang: currentLang },
        { allowSite: tag === 'iframe' },
      );
    }
  });

  // 3) Scripts: medios directos y posibles embeds sueltos
  const scriptSrcs = [];
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      const abs = toAbsoluteInf(src);
      if (abs) scriptSrcs.push(abs);
      return;
    }
    const code = $(el).html() || '';
    if (!code) return;
    for (const u of findDirectMediaUrls(code)) {
      const lang = /\b(?:lat|dub|doblado|latino)\b/i.test(u) ? LANGS.lat : LANGS.sub;
      addEmbed({ url: u, origin: 'script', lang });
    }
    for (const u of findAllUrls(code)) {
      if (!isEmbedLikeInf(u)) continue;
      const lang = /\b(?:lat|dub|doblado|latino)\b/i.test(u) ? LANGS.lat : LANGS.sub;
      addEmbed({ url: u, origin: 'script', lang });
    }
  });

  // Episodios enlazados (la barra de episodios los lista todos)
  const episodeNumbers = new Set();
  $('a[href]').each((_, el) => {
    const info = infSlugFromHref($(el).attr('href'));
    if (info && info.kind === 'watch' && info.slug === slug) episodeNumbers.add(info.episode);
  });
  const epsSorted = [...episodeNumbers].sort((a, b) => a - b);

  const langsAvailable = [...new Set([
    ...embeds.map((e) => e.lang.key),
    ...downloads.map((d) => d.lang.key),
    ...directMedia.map((d) => d.lang.key),
  ])];

  return {
    slug,
    title: normalizeSpaces($('title').first().text() || '') || null,
    finalUrl: pageUrl,
    episodeNumbers: epsSorted,
    maxEpisode: epsSorted.length ? epsSorted[epsSorted.length - 1] : null,
    directMedia,
    embeds,
    downloads,
    scriptSrcs: [...new Set(scriptSrcs)],
    langsAvailable,
  };
}

async function getWatchInf(slug, episode) {
  const { text, finalUrl } = await fetchText(
    `${INF_BASE_URL}${INF_ROUTES.watch(slug, episode)}`,
    { referer: `${INF_BASE_URL}${INF_ROUTES.anime(slug)}` },
  );
  return parseWatchInf(text, finalUrl, slug);
}

module.exports = {
  INF_HOST,
  RESERVED_SLUGS,
  toAbsoluteInf,
  purgeUrl,
  isInfUrl,
  infSlugFromHref,
  parseDirectorio,
  parseSerieRest,
  searchInf,
  toEmbedUrl,
  prettyServerName,
  parseWatchInf,
  getWatchInf,
};
