'use strict';

/**
 * Resolvedor de embeds.
 * ---------------------
 * estrenosanime.net muestra casi siempre un único servidor llamado
 * "Multiserver" (un iframe agregador) y, según el episodio, enlaces de
 * descarga. Cuando Stremio pide un stream hacemos, en orden:
 *
 *  1. Buscar medios directos (.m3u8/.mp4) en la página /ver/...
 *  2. Para cada embed encontrado, intentar resolverlo a URL directa
 *     (técnica genérica: descargar el embed, desofuscar el "packer" de
 *     Dean Edwards que usan Filemoon/VidHide/StreamWish/VOE/MixDrop...,
 *     buscar `file:"..."`, fuentes HLS, etc., con casos especiales para
 *     DoodStream, StreamTape y OK.ru).
 *  3. Si la página no trae embeds en el HTML (se cargan por AJAX),
 *     auto-descubrir el endpoint: se prueban rutas AJAX habituales con
 *     el episode_id y se escanean los .js del propio sitio buscando
 *     rutas con "server/episode/embed".
 *  4. Lo que no se pueda resolver se devuelve como externalUrl
 *     (Stremio lo abre en el navegador), nunca se pierde.
 */

const { BASE_URL, USER_AGENT, EMBED_TIMEOUT_MS, CACHE_TTL } = require('./config');
const { fetchText } = require('./http');
const {
  findDirectMediaUrls,
  findAllUrls,
  hostOf,
  absoluteUrl,
  withTimeout,
} = require('./util');

/* ------------------------------------------------------------------ */
/* Dean Edwards packer (eval(function(p,a,c,k,e,d)...))               */
/* ------------------------------------------------------------------ */

function unpackPacked(p, a, c, k) {
  const encode = (n) =>
    (n < a ? '' : encode(Math.floor(n / a))) +
    ((n % a) > 35 ? String.fromCharCode((n % a) + 29) : (n % a).toString(36));
  let out = String(p);
  for (let i = c - 1; i >= 0; i -= 1) {
    if (k[i]) {
      out = out.replace(new RegExp(`\\b${encode(i)}\\b`, 'g'), k[i]);
    }
  }
  return out;
}

function extractPackedScripts(html) {
  const results = [];
  const re =
    /eval\(function\(p,a,c,k,e,(?:d|r)\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/g;
  for (const m of String(html).matchAll(re)) {
    try {
      const p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      const a = parseInt(m[2], 10);
      const c = parseInt(m[3], 10);
      const k = m[4].split('|');
      const unpacked = unpackPacked(p, a, c, k);
      if (unpacked && unpacked !== p) results.push(unpacked);
    } catch {
      /* packer con formato distinto: se ignora */
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Búsqueda de fuentes reproducibles dentro de un embed                */
/* ------------------------------------------------------------------ */

function collectMediaCandidates(texts) {
  const found = new Set();
  for (const text of texts) {
    if (!text) continue;
    for (const u of findDirectMediaUrls(text)) found.add(u);
    // JWPlayer / Plyr: file: "https://...", "file":"...", sources:[{src:...}]
    for (const m of String(text).matchAll(/(?:file|source|src|hls|url)\s*['"]?\s*:\s*['"](https?:\/\/[^'"]+)['"]/gi)) {
      if (/\.(m3u8|mp4|mkv|webm|mpd)(\?|$)/i.test(m[1]) || /m3u8|playlist|manifest/i.test(m[1])) {
        found.add(m[1].replace(/\\\//g, '/'));
      }
    }
    // <source src="..."> y <video src="...">
    for (const m of String(text).matchAll(/<(?:source|video)[^>]+src=["'](https?:\/\/[^"']+)["']/gi)) {
      found.add(m[1]);
    }
  }
  const list = [...found];
  // Preferencia: HLS (.m3u8) primero, después MP4
  list.sort((a, b) => scoreMedia(b) - scoreMedia(a));
  return list;
}

function scoreMedia(url) {
  if (/\.m3u8(\?|$)/i.test(url)) return 30;
  if (/\.mp4(\?|$)/i.test(url)) return 20;
  if (/1080/.test(url)) return 15;
  return 10;
}

/* --- Casos especiales por host --- */

async function resolveDood(embedUrl, html) {
  const host = hostOf(embedUrl);
  const passMatch = String(html).match(/\/pass_md5\/[\w-]+\/([\w-]+)/);
  if (!passMatch) return null;
  const passPath = passMatch[0];
  const token = passMatch[1];
  const { text } = await fetchText(`https://${host}${passPath}`, {
    timeoutMs: EMBED_TIMEOUT_MS,
    referer: embedUrl,
    retries: 0,
  });
  const basePart = String(text || '').trim();
  if (!/^https?:\/\//.test(basePart)) return null;
  const rand = Array.from({ length: 10 }, () =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
      Math.floor(Math.random() * 62)
    )
  ).join('');
  return `${basePart}${rand}?token=${token}&expiry=${Date.now()}`;
}

function resolveStreamtape(embedUrl, html) {
  // El enlace real se monta por JS sobre #norobotlink / #robotlink
  const text = String(html);
  const direct = text.match(/get_video\?id=[A-Za-z0-9]+&expires=\d+&ip=[^'"&\s]+&token=[\w-]+/);
  if (direct) return `https://streamtape.com/${direct[0]}`;
  const parts = text.match(
    /(?:norobotlink|robotlink)['"]\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*(?:'([^']+)'|\(([^)]+)\))/
  );
  if (parts) {
    const p2 = (parts[2] || '').replace(/['"]/g, '');
    const tail = p2.startsWith('token=') || (parts[3] || '').includes('substring') ? p2 : p2;
    const built = `https:${parts[1]}${tail}`;
    if (built.includes('get_video')) return built;
  }
  return null;
}

function resolveOkru(html) {
  const unescaped = String(html)
    .replace(/&quot;/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&');
  const qualities = [...unescaped.matchAll(/"name":"(1080|720|480|360|240|144)","url":"(https?:\/\/[^"]+)"/g)];
  if (qualities.length) {
    qualities.sort((a, b) => parseInt(b[1], 10) - parseInt(a[1], 10));
    return qualities[0][2];
  }
  const hls = unescaped.match(/"hlsManifestUrl":"(https?:\/\/[^"]+)"/);
  return hls ? hls[1] : null;
}

/* ------------------------------------------------------------------ */
/* Resolvers por host (dispatcher)                                     */
/* ------------------------------------------------------------------ */
/*
 * ¿Es buena idea un resolver por reproductor? Sí, con matices:
 * los hosts cambian su player a menudo, así que cada resolver específico
 * es pequeño, está aislado por host y SIEMPRE cae al genérico (packer +
 * búsqueda de fuentes) si no encuentra nada. Añadir un host nuevo =
 * una entrada en HOST_PATTERNS (+ su extractor si es especial).
 */

const HOST_PATTERNS = [
  ['voe', /(^|[.-])voe([.-]|$)|voe\.sx|jilliandescribecompany|donaldssonlebons|marlyndamian|reputationsheriff|diananaturecure|paulpathsendless|gloriamurrayunlearn/i],
  ['filemoon', /filemoon|byseraguci|bysurodak|filesmoon|moonmov|mivalyo|fmoonhive|filemoonlink/i],
  ['mp4upload', /mp4upload/i],
  ['dood', /dood|ds2play|d0+0o0xd|do7go|d-s\.io|dooodster|dsvplay|playmogo|all3do/i],
  ['streamtape', /streamtape|strtape|tapewithadblock|tapeonsports|shavetape/i],
  ['okru', /(^|\.)ok\.ru$/i],
  ['mixdrop', /mixdrop|mxdrop|mixdrv/i],
  ['sibnet', /sibnet/i],
  ['yourupload', /yourupload/i],
  // Familia VidHide / StreamWish / FileLions (ranker JS muy parecido)
  ['vidhide', /vidhide|filelions|dhcplay|streamwish|hglink|swhrz|moontv|vidzy|awish|swashin|mwish|vidara|lulustream|luluvdo|lulustream|lulusvdo|embedv|kinoger|vidoza/i],
];

function classifyHost(url) {
  const host = hostOf(url);
  for (const [name, re] of HOST_PATTERNS) {
    if (re.test(host)) return name;
  }
  return 'generic';
}

/** Convierte URL de ficha/descarga a su forma de embed cuando el host la tiene. */
function normalizeEmbedUrl(raw) {
  const absUrl = absoluteUrl(raw, BASE_URL);
  if (!absUrl) return raw;
  let u;
  try { u = new URL(absUrl); } catch { return absUrl; }
  const kind = classifyHost(absUrl);
  const path = u.pathname;
  let m;
  if (kind === 'mp4upload' && (m = path.match(/^\/(?:embed-)?([A-Za-z0-9]+)\.html/))) {
    return `https://www.mp4upload.com/embed-${m[1]}.html`;
  }
  if (kind === 'streamtape' && (m = path.match(/^\/(?:v|e)\/([A-Za-z0-9]+)/))) {
    return `https://streamtape.com/e/${m[1]}`;
  }
  if (kind === 'mixdrop' && (m = path.match(/^\/(?:f|e)\/([A-Za-z0-9]+)/))) {
    return `${u.origin}/e/${m[1]}`;
  }
  if ((kind === 'filemoon' || kind === 'dood') && (m = path.match(/^\/(?:d|e)\/([A-Za-z0-9]{5,})/))) {
    return `${u.origin}/e/${m[1]}`;
  }
  if (kind === 'voe') {
    if ((m = path.match(/^\/e\/([A-Za-z0-9]+)/))) return `${u.origin}/e/${m[1]}`;
    if ((m = path.match(/^\/([A-Za-z0-9]{8,})(?:\.html)?\/?$/))) return `${u.origin}/e/${m[1]}`;
  }
  return absUrl;
}

/** Decodifica cadenas base64 que escondan URLs (VOE y otros ofuscan así). */
function decodeBase64Texts(text) {
  const out = [];
  const tokens = String(text || '').match(/[A-Za-z0-9+/=_-]{32,}/g) || [];
  for (const token of tokens.slice(0, 60)) {
    try {
      const decoded = Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (/https?:\/\//i.test(decoded) || /\.m3u8|\.mp4/i.test(decoded)) out.push(decoded);
    } catch { /* no era base64 útil */ }
  }
  return out;
}

/** collectMediaCandidates + URLs protocol-relativas/relativas y base64. */
function collectMediaRich(texts, baseForRelative = '') {
  const expanded = [];
  for (const t of texts) {
    if (!t) continue;
    expanded.push(t);
    expanded.push(...decodeBase64Texts(t));
  }
  const found = new Set(collectMediaCandidates(expanded));
  for (const text of expanded) {
    // file:"//host/x.mp4"  ·  src:"/v/x.mp4"  ·  "hls":"...m3u8"
    for (const m of String(text).matchAll(/(?:file|source|src|hls|video_url|contentUrl)\s*['"]?\s*:\s*['"]((?:\/\/|\/)[^'"]+)['"]/gi)) {
      let candidate = m[1].replace(/\\\//g, '/');
      if (candidate.startsWith('//')) candidate = `https:${candidate}`;
      else if (candidate.startsWith('/') && baseForRelative) {
        try { candidate = new URL(candidate, baseForRelative).href; } catch { continue; }
      } else continue;
      if (/\.(m3u8|mp4|mkv|webm|mpd)(\?|$)/i.test(candidate)) found.add(candidate);
    }
    for (const m of String(text).matchAll(/"contentUrl"\s*:\s*"(https?:\/\/[^"]+)"/gi)) {
      found.add(m[1].replace(/\\\//g, '/'));
    }
  }
  return [...found]
    .filter((u) => !/\.(jpg|jpeg|png|webp|vtt|srt)(\?|$)/i.test(u))
    .sort((a, b) => scoreMedia(b) - scoreMedia(a));
}

function extractVoeMedia(html, baseForRelative = '') {
  const texts = [html, ...extractPackedScripts(html)];
  const candidates = collectMediaRich(texts, baseForRelative);
  // VOE suele exponer HLS en un JSON-LD VideoObject/contentUrl: ya cubierto.
  return candidates[0] || null;
}

function extractMixdropMedia(html) {
  const texts = [html, ...extractPackedScripts(html)];
  for (const text of texts) {
    const m = String(text).match(/(?:MDCore\.)?wurl\s*=\s*["']((?:\/\/|https?:\/\/)[^"']+)["']/i)
      || String(text).match(/["']((?:\/\/|https?:\/\/)[^"']+\.mp4[^"']*)["']/i);
    if (m) {
      const url = m[1].startsWith('//') ? `https:${m[1]}` : m[1];
      if (url) return url;
    }
  }
  return collectMediaRich(texts)[0] || null;
}

function extractSibnetMedia(html, finalUrl = '') {
  const base = finalUrl || 'https://sibnet.ru/';
  return collectMediaRich([html], base)[0] || null;
}

function extractPackedMedia(html, baseForRelative = '') {
  // Filemoon · MP4Upload («Upload») · VidHide/StreamWish/FileLions ·
  // YourUpload · LuluStream: player empaquetado con Dean Edwards.
  const texts = [html, ...extractPackedScripts(html)];
  return collectMediaRich(texts, baseForRelative)[0] || null;
}

/**
 * Intenta convertir un embed (iframe) en una URL directa reproducible.
 * Devuelve { url, referer } o null si no fue posible.
 */
async function resolveEmbed(embedUrl, pageReferer = `${BASE_URL}/`, depth = 0) {
  const host = hostOf(embedUrl);
  const { text: html, finalUrl } = await fetchText(embedUrl, {
    timeoutMs: EMBED_TIMEOUT_MS,
    referer: pageReferer,
    retries: 0,
  });
  if (!html) return null;

  try {
    if (/dood|ds2play|d0000d|do7go|d-s\.io/i.test(host)) {
      const dood = await resolveDood(finalUrl || embedUrl, html);
      if (dood) return { url: dood, referer: finalUrl || embedUrl };
    }
    if (/streamtape|strtape/i.test(host)) {
      const st = resolveStreamtape(embedUrl, html);
      if (st) return { url: st, referer: embedUrl };
    }
    if (/(^|\.)ok\.ru$/i.test(host)) {
      const ok = resolveOkru(html);
      if (ok) return { url: ok, referer: 'https://ok.ru/' };
    }
  } catch {
    /* seguimos con la vía genérica */
  }

  const texts = [html, ...extractPackedScripts(html)];
  const candidates = collectMediaCandidates(texts).filter(
    (u) => !/\.jpg|\.png|\.vtt|\.srt/i.test(u)
  );
  if (candidates.length) {
    return { url: candidates[0], referer: finalUrl || embedUrl };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Auto-descubrimiento AJAX (cuando /ver/ no trae embeds en el HTML)  */
/* ------------------------------------------------------------------ */

function deepCollectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => deepCollectStrings(v, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => deepCollectStrings(v, out));
  return out;
}

function extractEmbedsFromText(text) {
  const embeds = [];
  const push = (url, origin) => {
    const abs = absoluteUrl(url, BASE_URL);
    if (!abs) return;
    if (embeds.some((e) => e.url === abs)) return;
    embeds.push({ name: '', url: abs, origin });
  };
  for (const m of String(text).matchAll(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi)) {
    push(m[1], 'ajax-iframe');
  }
  for (const u of findAllUrls(text)) {
    if (/(embed|\/e\/|\/v\/|player|watch|video)/i.test(u)) push(u, 'ajax');
  }
  return embeds;
}

async function tryAjaxPaths(paths, referer) {
  const embeds = [];
  const media = [];
  await Promise.allSettled(
    paths.map(async (path) => {
      const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
      const { text, status } = await fetchText(url, {
        timeoutMs: 8000,
        referer,
        retries: 0,
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/html;q=0.8' },
      });
      if (status < 200 || status >= 300 || !text) return;
      let strings = [text];
      try {
        strings = deepCollectStrings(JSON.parse(text), [text]);
      } catch {
        /* era HTML, no JSON */
      }
      for (const s of strings) {
        for (const u of findDirectMediaUrls(s)) media.push(u);
        for (const e of extractEmbedsFromText(s)) {
          if (!embeds.some((x) => x.url === e.url)) embeds.push(e);
        }
      }
    })
  );
  return { embeds, media: [...new Set(media)] };
}

/**
 * Busca los servidores llamando a los endpoints AJAX del sitio.
 * 1) Rutas habituales con episode_id / server ids de los botones.
 * 2) Escaneo de los ficheros .js del sitio buscando rutas reales.
 */
async function discoverViaAjax(watch, watchPageUrl) {
  const epId = watch.episodeId;
  const fixedPaths = [];
  if (epId) {
    fixedPaths.push(
      `/ajax/episode/${epId}/servers`,
      `/ajax/episode/servers/${epId}`,
      `/ajax/servers/${epId}`,
      `/ajax/episode/servers?episode_id=${epId}`,
      `/ajax/servers?episode_id=${epId}`,
      `/ajax/watch/servers/${epId}`,
      `/ajax/player/${epId}`,
      `/api/episodes/${epId}/servers`,
      `/api/episode/${epId}/servers`,
      `/api/episodes/${epId}`
    );
  }
  for (const btn of watch.serverButtons || []) {
    if (btn.serverId) {
      fixedPaths.push(
        `/ajax/server/${btn.serverId}`,
        `/ajax/episode/server/${btn.serverId}`,
        epId ? `/ajax/server?id=${btn.serverId}&episode_id=${epId}` : `/ajax/server?id=${btn.serverId}`
      );
    }
  }

  const run = async () => {
    let result = await tryAjaxPaths([...new Set(fixedPaths)].slice(0, 16), watchPageUrl);
    if (result.embeds.length || result.media.length) return result;

    // Escaneo de los .js del propio dominio
    const jsCandidates = new Set();
    const sameOriginJs = (watch.scriptSrcs || [])
      .filter((src) => hostOf(src) === hostOf(BASE_URL))
      .slice(0, 6);
    for (const src of sameOriginJs) {
      try {
        const { text: js } = await fetchText(src, {
          timeoutMs: 8000,
          retries: 0,
          useCache: true,
          cacheTtl: CACHE_TTL.jsFile,
        });
        for (const m of String(js).matchAll(/['"`](\/(?:ajax|api)\/[^'"`\s]{2,90})['"`]/g)) {
          let path = m[1];
          if (!/(server|episode|embed|player|watch|video)/i.test(path)) continue;
          if (path.includes('${')) {
            if (!epId) continue;
            path = path.replace(/\$\{[^}]+\}/g, epId);
          } else if (epId && !path.includes(epId)) {
            path = path.endsWith('/') ? `${path}${epId}` : `${path}${path.includes('?') ? '&' : '?'}episode_id=${epId}`;
          }
          jsCandidates.add(path);
        }
      } catch {
        /* JS inaccesible */
      }
    }
    if (jsCandidates.size) {
      result = await tryAjaxPaths([...jsCandidates].slice(0, 10), watchPageUrl);
    }
    return result;
  };

  return withTimeout(run(), 25000, { embeds: [], media: [] });
}

module.exports = {
  unpackPacked,
  extractPackedScripts,
  collectMediaCandidates,
  collectMediaRich,
  resolveEmbed,
  discoverViaAjax,
  extractEmbedsFromText,
  // resolvers por host (testeables)
  HOST_PATTERNS,
  classifyHost,
  normalizeEmbedUrl,
  extractVoeMedia,
  extractMixdropMedia,
  extractSibnetMedia,
  extractPackedMedia,
  resolveDood,
  resolveStreamtape,
  resolveOkru,
  USER_AGENT,
};
