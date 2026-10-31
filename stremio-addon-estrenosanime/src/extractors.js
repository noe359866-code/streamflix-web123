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

const {
  BASE_URL,
  USER_AGENT,
  EMBED_TIMEOUT_MS,
  CACHE_TTL,
  EXTERNAL_RESOLVER_URL,
  EXTERNAL_RESOLVER_TOKEN,
  EXTERNAL_RESOLVER_TIMEOUT_MS,
  HOST_BLOCK_TTL_MS,
  HOST_FAILURE_COOLDOWN_MS,
  FORWARD_CLIENT_IP,
  CLIENT_IP_RETRY_TTL_MS,
  EMBED_PROXY_MAX_ATTEMPTS,
  EMBED_PROXY_RETRY_TTL_MS,
} = require('./config');
const { fetchText } = require('./http');
const { getClientIp, isPublicIp, hashIp } = require('./request-context');
const {
  getEmbedProxyCandidates,
  getEmbedProxyStatus,
  parseProxyEntry,
  proxyKey,
} = require('./proxy-egress');
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

async function resolveDood(embedUrl, html, fetchOptions = {}) {
  const host = hostOf(embedUrl);
  const passMatch = String(html).match(/\/pass_md5\/[\w-]+\/([\w-]+)/);
  if (!passMatch) return null;
  const passPath = passMatch[0];
  const token = passMatch[1];
  const { text } = await fetchText(`https://${host}${passPath}`, {
    timeoutMs: EMBED_TIMEOUT_MS,
    referer: embedUrl,
    retries: 0,
    clientIp: fetchOptions.clientIp || undefined,
    proxyUrl: fetchOptions.proxyUrl || undefined,
    fetchImpl: fetchOptions.fetchImpl || undefined,
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

/* ------------------------------------------------------------------ */
/* Salud por host: bloqueos de IP de datacenter / anti-bots            */
/* ------------------------------------------------------------------ */
/*
 * Cuando el addon corre en Beamup/Render/un VPS, algunos reproductores
 * (VOE, Filemoon y familia) responden 403/captcha/geo-bloqueo a la IP
 * del datacenter aunque el mismo embed abra bien desde la IP del
 * usuario. Estrategia:
 *  1. Detectar el bloqueo (HTTP + patrones anti-bot/geo/IP).
 *  2. Abrir un "circuito" por host unos minutos para no perder tiempo
 *     ni martillar al host en cada episodio.
 *  3. Reintentar UNA vez señalando la IP pública de quien pide el
 *     stream con X-Forwarded-For ("client-ip-forwarding"). No es la
 *     IP TCP real —eso no se puede poner desde el servidor—, pero
 *     hosts/proxies que se fían de esa cabecera pueden responder.
 *  4. Si el operador configuró una salida proxy (EA_EMBED_PROXY_URLS
 *     o la lista de Proxy5), reintentar la RESOLUCIÓN saliendo por
 *     esa otra IP ("proxy-egress"). Ojo: Proxy5 es datacenter, no
 *     residencial; solo ayuda si bloquean la IP/ASN de Beamup.
 *  5. Avisar a la capa de streams para ofrecer la vía externa con una
 *     nota clara, y opcionalmente delegar en un resolver externo
 *     residencial (EA_EXTERNAL_RESOLVER_URL, ver home-resolver.js).
 * Un proxy de medios en el MISMO servidor no arreglaría esto (sigue
 * saliendo por la IP bloqueada) y quemaría ancho de banda: por eso no
 * se hace. La salida proxy de arriba solo descarga el HTML del embed;
 * el vídeo lo reproduce Stremio directamente.
 */

const hostHealth = new Map();
// Reintentos con la IP del solicitante ya probados (host + HASH de la
// IP, nunca la IP en claro) para no repetirlos en cada episodio.
const clientIpRetryHealth = new Map();
// Salidas proxy ya probadas por host (host + HASH del endpoint, nunca
// sus credenciales) y última salida que funcionó para cada host.
const proxyEgressHealth = new Map();
const proxyHostSuccess = new Map();

function healthKey(urlOrHost) {
  const raw = String(urlOrHost || '').trim();
  if (!raw) return '';
  const host = raw.includes('://') ? hostOf(raw) : raw.replace(/^www\./i, '').toLowerCase();
  return host || raw.toLowerCase();
}

function recordHostSuccess(urlOrHost) {
  const key = healthKey(urlOrHost);
  if (!key) return null;
  const entry = { host: key, state: 'ok', failures: 0, lastOkAt: Date.now() };
  hostHealth.set(key, entry);
  return entry;
}

function recordHostBlock(urlOrHost, info = {}, ttlMs = HOST_BLOCK_TTL_MS) {
  const key = healthKey(urlOrHost);
  if (!key) return null;
  const prev = hostHealth.get(key);
  const entry = {
    host: key,
    state: 'blocked',
    kind: info.kind || classifyHost(urlOrHost),
    reason: info.reason || 'blocked',
    status: info.status || null,
    failures: (prev && prev.failures ? prev.failures : 0) + 1,
    lastBlockedAt: Date.now(),
    blockedUntil: Date.now() + Math.max(0, Number(ttlMs) || 0),
  };
  hostHealth.set(key, entry);
  return entry;
}

function recordHostFailure(urlOrHost, info = {}, ttlMs = HOST_FAILURE_COOLDOWN_MS) {
  const key = healthKey(urlOrHost);
  if (!key) return null;
  const open = getHostBlock(key);
  if (open && open.state === 'blocked') return open;
  const prev = hostHealth.get(key);
  const entry = {
    host: key,
    state: 'cooldown',
    kind: info.kind || classifyHost(urlOrHost),
    reason: info.reason || 'fetch-error',
    status: info.status || null,
    failures: (prev && prev.failures ? prev.failures : 0) + 1,
    lastFailureAt: Date.now(),
    blockedUntil: Date.now() + Math.max(0, Number(ttlMs) || 0),
  };
  hostHealth.set(key, entry);
  return entry;
}

function getHostBlock(urlOrHost) {
  const key = healthKey(urlOrHost);
  if (!key) return null;
  const entry = hostHealth.get(key);
  if (!entry || entry.state === 'ok') return null;
  if (!entry.blockedUntil || entry.blockedUntil <= Date.now()) {
    hostHealth.delete(key);
    return null;
  }
  return { ...entry, retryAfterMs: entry.blockedUntil - Date.now() };
}

function getHostBlockSnapshot() {
  return [...hostHealth.keys()].map((key) => getHostBlock(key)).filter(Boolean);
}

function clearHostHealth() {
  hostHealth.clear();
  clientIpRetryHealth.clear();
  proxyEgressHealth.clear();
  proxyHostSuccess.clear();
}

function clientIpRetryKey(urlOrHost, clientIp) {
  const host = healthKey(urlOrHost);
  const hashed = hashIp(clientIp);
  return host && hashed ? `${host}|${hashed}` : '';
}

function hasRecentClientIpRetry(urlOrHost, clientIp) {
  const key = clientIpRetryKey(urlOrHost, clientIp);
  if (!key) return false;
  const until = clientIpRetryHealth.get(key) || 0;
  if (until <= Date.now()) {
    clientIpRetryHealth.delete(key);
    return false;
  }
  return true;
}

function rememberClientIpRetry(urlOrHost, clientIp, ttlMs = CLIENT_IP_RETRY_TTL_MS) {
  const key = clientIpRetryKey(urlOrHost, clientIp);
  if (!key) return;
  // Limpieza oportunista para que el mapa no crezca sin límite.
  if (clientIpRetryHealth.size > 500) {
    const now = Date.now();
    for (const [k, until] of clientIpRetryHealth) {
      if (until <= now) clientIpRetryHealth.delete(k);
    }
  }
  clientIpRetryHealth.set(key, Date.now() + Math.max(0, Number(ttlMs) || 0));
}

function forgetClientIpRetry(urlOrHost, clientIp) {
  const key = clientIpRetryKey(urlOrHost, clientIp);
  if (key) clientIpRetryHealth.delete(key);
}

function proxyEgressKey(urlOrHost, proxyUrl) {
  const host = healthKey(urlOrHost);
  const hashed = proxyKey(proxyUrl);
  return host && hashed ? `${host}|${hashed}` : '';
}

function hasRecentProxyEgress(urlOrHost, proxyUrl) {
  const key = proxyEgressKey(urlOrHost, proxyUrl);
  if (!key) return false;
  const until = proxyEgressHealth.get(key) || 0;
  if (until <= Date.now()) {
    proxyEgressHealth.delete(key);
    return false;
  }
  return true;
}

function rememberProxyEgress(urlOrHost, proxyUrl, ttlMs = EMBED_PROXY_RETRY_TTL_MS) {
  const key = proxyEgressKey(urlOrHost, proxyUrl);
  if (!key) return;
  if (proxyEgressHealth.size > 1000) {
    const now = Date.now();
    for (const [k, until] of proxyEgressHealth) {
      if (until <= now) proxyEgressHealth.delete(k);
    }
  }
  proxyEgressHealth.set(key, Date.now() + Math.max(0, Number(ttlMs) || 0));
}

function rememberProxyHostSuccess(urlOrHost, proxyUrl) {
  const host = healthKey(urlOrHost);
  const normalized = parseProxyEntry(proxyUrl);
  if (host && normalized) proxyHostSuccess.set(host, normalized);
  const key = proxyEgressKey(urlOrHost, proxyUrl);
  if (key) proxyEgressHealth.delete(key); // si funcionó, se puede reusar ya
}

const BLOCK_BODY_PATTERNS = [
  ['antibot', /just a moment|checking your browser|cf-chl|challenges\.cloudflare|cloudflare turnstile/i],
  ['antibot', /attention required[^<]*cloudflare|sorry, you have been blocked|you are unable to access|error 1020|access denied[^<]*cloudflare/i],
  ['antibot', /ddos-guard|incapsula[^<]*incident|sucuri website firewall[^<]*access denied/i],
  ['antibot', /verify you are human|are you a robot|bot verification|please complete the security check/i],
  ['ip-block', /your ip(?: address)? (?:has been |was )?(?:blocked|banned)|ip address (?:blocked|banned)|direcci[oó]n ip[^<]*bloque|tu ip[^<]*bloque/i],
  ['geo', /(?:video|content) is not available in your (?:country|region|location)|not available in your (?:country|region)|no est[aá] disponible en tu pa[ií]s/i],
];

/**
 * Detecta si una respuesta parece un bloqueo al servidor (datacenter).
 * Acepta looksBlocked({status, body|text|html, finalUrl}) o (status, body).
 * Devuelve null o { blocked:true, reason, status }.
 */
function looksBlocked(input, maybeBody) {
  const opts = input && typeof input === 'object'
    ? input
    : { status: input, body: maybeBody };
  const status = Number(opts.status) || null;
  const body = String(opts.body || opts.text || opts.html || '').slice(0, 30000);
  const finalUrl = String(opts.finalUrl || opts.url || '');

  if (/__cf_chl|cdn-cgi\/challenge-platform/i.test(finalUrl)) {
    return { blocked: true, reason: 'antibot', status };
  }
  for (const [reason, re] of BLOCK_BODY_PATTERNS) {
    if (re.test(body)) return { blocked: true, reason, status };
  }
  // Captchas desnudos: solo cuentan como bloqueo con status raro o
  // acompañados de frases de verificación (evita falsos positivos).
  if (/(g-recaptcha|h-captcha|cf-turnstile)/i.test(body)
    && (status === 401 || status === 403 || status === 429 || status === 503 || /human|robot|verify|security check/i.test(body))) {
    return { blocked: true, reason: 'antibot', status };
  }
  if (status === 429) return { blocked: true, reason: 'rate-limit', status };
  if (status === 451) return { blocked: true, reason: 'geo', status };
  if (status === 401 || status === 403 || status === 407) {
    return { blocked: true, reason: `http-${status}`, status };
  }
  return null;
}

function blockInfoFromError(err) {
  if (!err) return null;
  return looksBlocked({
    status: err.status,
    body: err.bodySnippet || err.body || err.message || '',
    finalUrl: err.finalUrl || err.url || '',
  });
}

/** Enlaces firmados con la IP que resolvió (p. ej. Streamtape get_video?ip=). */
function isIpBoundSuspected(url) {
  const raw = String(url || '');
  try {
    const u = new URL(raw);
    for (const key of u.searchParams.keys()) {
      if (/^(ip|ipaddr|allowed_ip|iplock)$/i.test(key)) return true;
    }
    if (/\/get_video\b/i.test(u.pathname) && (u.searchParams.has('token') || u.searchParams.has('expires'))) return true;
    return false;
  } catch {
    return /[?&](?:ip|ipaddr|allowed_ip|iplock)=/i.test(raw) || /\/get_video\?/i.test(raw);
  }
}

function buildExternalResolverUrl(base, embedUrl, referer) {
  if (!base) return '';
  let u;
  try { u = new URL(String(base)); } catch { return ''; }
  if (!/\/resolve\/?$/i.test(u.pathname)) {
    u.pathname = `${u.pathname.replace(/\/+$/, '')}/resolve`;
  }
  u.searchParams.set('url', embedUrl);
  if (referer) u.searchParams.set('referer', referer);
  return u.href;
}

function pickExternalResolverResult(data) {
  const candidate = (data && (data.result || data.resolved || data)) || null;
  if (!candidate || typeof candidate !== 'object') return null;
  if (candidate.blocked) {
    return { blocked: true, reason: candidate.reason || 'external-blocked', status: candidate.status || null };
  }
  const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
  if (/^https?:\/\//i.test(url)) {
    return { url, referer: candidate.referer || candidate.finalUrl || '' };
  }
  return null;
}

async function resolveViaExternalResolver(embedUrl, referer, opts = {}) {
  const base = opts.externalResolverUrl !== undefined ? opts.externalResolverUrl : EXTERNAL_RESOLVER_URL;
  const endpoint = buildExternalResolverUrl(base, embedUrl, referer);
  if (!endpoint) return null;
  const token = opts.externalResolverToken !== undefined ? opts.externalResolverToken : EXTERNAL_RESOLVER_TOKEN;
  const timeoutMs = Number(opts.externalResolverTimeoutMs || EXTERNAL_RESOLVER_TIMEOUT_MS || 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(token ? { Authorization: `Bearer ${token}`, 'X-Resolver-Token': token } : {}),
      },
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) return { ok: false, reason: 'external-http', status: res.status };
    const picked = pickExternalResolverResult(data);
    if (picked && picked.url && picked.url !== embedUrl) {
      return { ok: true, url: picked.url, referer: picked.referer || embedUrl, via: 'external-resolver' };
    }
    if (picked && picked.blocked) return { ok: false, blocked: true, reason: picked.reason, status: picked.status };
    return { ok: false, reason: 'external-not-found', status: res.status };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'external-timeout' : 'external-error', error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function resolutionBase(inputUrl, embedUrl) {
  return {
    ok: false,
    url: null,
    referer: null,
    inputUrl: inputUrl || embedUrl,
    embedUrl,
    finalUrl: null,
    host: hostOf(embedUrl),
    kind: classifyHost(embedUrl),
    blocked: false,
    reason: null,
    status: null,
    via: 'local',
    ipBoundSuspected: false,
    clientIpTried: false,
    proxyTried: false,
    proxyAttempts: 0,
    externalTried: false,
  };
}

async function resolveEmbedLocalDetailed(embedUrl, pageReferer = `${BASE_URL}/`, options = {}) {
  const opts = typeof options === 'number' ? { depth: options } : (options || {});
  const depth = Number(opts.depth) || 0;
  const target = normalizeEmbedUrl(embedUrl);
  const outcome = resolutionBase(embedUrl, target);
  // Reintentos internos anti-bloqueo (los orquesta resolveEmbedDetailed
  // solo tras un bloqueo del datacenter): IP del solicitante señalada
  // o salida por un proxy del operador. No se mezclan: vía proxy no se
  // señala la IP del usuario a un tercero innecesariamente.
  const fetchProxyUrl = opts._proxyUrl ? parseProxyEntry(opts._proxyUrl) : '';
  const forwardedIp = !fetchProxyUrl && opts._forwardClientIp ? (opts.clientIp || getClientIp()) : '';
  const fetchClientIp = isPublicIp(forwardedIp) ? forwardedIp : '';

  const open = opts._bypassCircuit ? null : getHostBlock(target);
  if (open) {
    outcome.blocked = open.state === 'blocked';
    outcome.reason = open.state === 'blocked' ? 'circuit-open' : 'host-cooldown';
    outcome.status = open.status || null;
    outcome.retryAfterMs = open.retryAfterMs;
    outcome.hostHealth = open;
    return outcome;
  }

  let fetched;
  try {
    fetched = await fetchText(target, {
      timeoutMs: EMBED_TIMEOUT_MS,
      referer: pageReferer,
      retries: 0,
      clientIp: fetchClientIp || undefined,
      proxyUrl: fetchProxyUrl || undefined,
      fetchImpl: opts.fetchImpl || undefined,
    });
  } catch (err) {
    const info = blockInfoFromError(err);
    outcome.status = err.status || null;
    outcome.error = err.message;
    if (info) {
      outcome.blocked = true;
      outcome.reason = info.reason;
      outcome.hostHealth = recordHostBlock(target, { ...info, kind: outcome.kind });
    } else if (fetchProxyUrl && err.proxyError) {
      // Falló la salida proxy, no necesariamente el reproductor: no
      // se castiga al host en el circuito global por este intento.
      outcome.reason = 'proxy-error';
      outcome.proxyError = true;
    } else {
      outcome.reason = err.name === 'AbortError' ? 'timeout' : 'fetch-error';
      outcome.hostHealth = recordHostFailure(target, { reason: outcome.reason, status: outcome.status, kind: outcome.kind });
    }
    return outcome;
  }

  const { text: html, finalUrl, status } = fetched || {};
  const effectiveUrl = finalUrl || target;
  outcome.finalUrl = effectiveUrl;
  outcome.status = status || null;
  outcome.host = hostOf(effectiveUrl) || outcome.host;
  outcome.kind = classifyHost(effectiveUrl) !== 'generic'
    ? classifyHost(effectiveUrl)
    : classifyHost(target);

  if (!html) {
    outcome.reason = 'empty-response';
    if (!fetchProxyUrl && !fetchClientIp) {
      outcome.hostHealth = recordHostFailure(effectiveUrl, { reason: outcome.reason, status, kind: outcome.kind });
    }
    return outcome;
  }

  const blockedInfo = looksBlocked({ status, body: html, finalUrl: effectiveUrl });
  if (blockedInfo) {
    outcome.blocked = true;
    outcome.reason = blockedInfo.reason;
    outcome.hostHealth = recordHostBlock(effectiveUrl, { ...blockedInfo, kind: outcome.kind });
    return outcome;
  }

  let direct = null;
  try {
    switch (outcome.kind) {
      case 'dood':
        direct = await resolveDood(effectiveUrl, html, {
          clientIp: fetchClientIp || undefined,
          proxyUrl: fetchProxyUrl || undefined,
          fetchImpl: opts.fetchImpl || undefined,
        });
        break;
      case 'streamtape':
        direct = resolveStreamtape(target, html);
        break;
      case 'okru':
        direct = resolveOkru(html);
        break;
      case 'voe':
        direct = extractVoeMedia(html, effectiveUrl);
        break;
      case 'mixdrop':
        direct = extractMixdropMedia(html);
        break;
      case 'sibnet':
        direct = extractSibnetMedia(html, effectiveUrl);
        break;
      case 'filemoon':
      case 'mp4upload':
      case 'vidhide':
      case 'yourupload':
      default:
        direct = extractPackedMedia(html, effectiveUrl);
    }
  } catch (err) {
    const info = blockInfoFromError(err);
    if (info) {
      outcome.blocked = true;
      outcome.reason = info.reason;
      outcome.error = err.message;
      outcome.hostHealth = recordHostBlock(effectiveUrl, { ...info, kind: outcome.kind });
      return outcome;
    }
    outcome.dispatchError = err.message;
    if (err.proxyError) outcome.proxyError = true;
  }

  if (!direct) {
    direct = collectMediaRich([html, ...extractPackedScripts(html)], effectiveUrl)[0] || null;
  }

  if (direct) {
    if (fetchProxyUrl) {
      // Funcionó saliendo por el proxy: NO se marca el host como sano
      // para la IP del datacenter; puede seguir bloqueándola.
      outcome.via = 'proxy-egress';
    } else if (fetchClientIp) {
      // Funcionó señalando la IP del solicitante: NO se marca el host
      // como sano para todos; el datacenter puede seguir bloqueado.
      outcome.via = 'client-ip-forwarding';
    } else {
      recordHostSuccess(target);
      if (effectiveUrl !== target) recordHostSuccess(effectiveUrl);
    }
    outcome.ok = true;
    outcome.url = direct;
    outcome.referer = outcome.kind === 'okru' ? 'https://ok.ru/' : effectiveUrl;
    outcome.reason = null;
    outcome.ipBoundSuspected = isIpBoundSuspected(direct);
    return outcome;
  }

  // Agregadores tipo Multiserver: un iframe dentro de otro (1 nivel).
  if (depth < 1) {
    const iframeMatch = String(html).match(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/i);
    if (iframeMatch) {
      const inner = absoluteUrl(iframeMatch[1], effectiveUrl);
      if (inner && inner !== effectiveUrl && !/google|facebook|disqus/i.test(inner)) {
        const nested = await resolveEmbedLocalDetailed(inner, effectiveUrl, { ...opts, depth: depth + 1 });
        if (nested.ok) {
          return { ...nested, inputUrl: embedUrl, embedUrl: target, nestedFrom: effectiveUrl };
        }
        if (nested.blocked) {
          outcome.blocked = true;
          outcome.reason = nested.reason;
          outcome.blockedHost = nested.host;
          outcome.status = nested.status || outcome.status;
          return outcome;
        }
      }
    }
  }

  outcome.reason = status && status >= 400 ? 'http-error' : 'not-found';
  if (status && status >= 500 && !fetchProxyUrl && !fetchClientIp) {
    outcome.hostHealth = recordHostFailure(effectiveUrl, { reason: outcome.reason, status, kind: outcome.kind });
  }
  return outcome;
}

/**
 * Resolución detallada de un embed. Devuelve siempre un objeto:
 * { ok, url, referer, host, kind, blocked, reason, status, via, ... }.
 * Orden anti-bloqueo de datacenter:
 *  1. Resolución local normal (IP del hosting).
 *  2. Si esa IP está bloqueada, UN reintento señalando la IP pública
 *     de quien pide el stream (X-Forwarded-For; best effort, no es la
 *     IP TCP real). Solo se señala al reproductor que ya bloqueó.
 *  3. Si hay salida proxy configurada (lista estática o Proxy5),
 *     reintentar la resolución saliendo por esa otra IP. Solo se
 *     descarga el HTML del embed; el vídeo no pasa por el proxy.
 *  4. Si hay resolver externo residencial configurado, delegar ahí.
 */
async function resolveEmbedDetailed(embedUrl, pageReferer = `${BASE_URL}/`, options = {}) {
  const opts = typeof options === 'number' ? { depth: options } : (options || {});
  let current = await resolveEmbedLocalDetailed(embedUrl, pageReferer, opts);
  if (current.ok) return current;

  const retryEligible = current.blocked || [
    'circuit-open', 'host-cooldown', 'fetch-error', 'timeout', 'empty-response',
  ].includes(current.reason);

  // Paso 2: la IP del solicitante, señalada con cabeceras de proxy.
  const clientIp = opts.clientIp !== undefined ? opts.clientIp : getClientIp();
  const forwardEnabled = opts.forwardClientIp !== undefined
    ? Boolean(opts.forwardClientIp)
    : FORWARD_CLIENT_IP;
  const retryTarget = current.embedUrl || embedUrl;
  if (
    retryEligible
    && opts.allowClientIpRetry !== false
    && !opts._forwardClientIp
    && forwardEnabled
    && isPublicIp(clientIp)
    && !hasRecentClientIpRetry(retryTarget, clientIp)
  ) {
    // Se recuerda ANTES de esperar: si varios episodios del mismo
    // usuario llegan a la vez, solo uno martillea al host.
    rememberClientIpRetry(retryTarget, clientIp);
    const retried = await resolveEmbedLocalDetailed(embedUrl, pageReferer, {
      ...opts,
      clientIp,
      _forwardClientIp: true,
      _bypassCircuit: true,
    });
    if (retried.ok) {
      // Si funcionó, el siguiente episodio debe poder intentarlo ya:
      // el enfriamiento solo castiga los reintentos fallidos.
      forgetClientIpRetry(retryTarget, clientIp);
      return {
        ...retried,
        blocked: false,
        localReason: current.reason,
        clientIpTried: true,
      };
    }
    current.clientIpTried = true;
    current.clientIpResult = {
      ok: false,
      blocked: Boolean(retried.blocked),
      reason: retried.reason || null,
      status: retried.status || null,
    };
  }

  // Paso 3: salida proxy del operador (lista estática o Proxy5).
  // Cambia la IP TCP que ve el reproductor solo al resolver el embed;
  // el vídeo resultante lo reproduce Stremio directamente.
  if (retryEligible && opts.allowProxyEgress !== false && !opts._proxyUrl) {
    const configuredMax = opts.proxyMaxAttempts !== undefined
      ? Number(opts.proxyMaxAttempts)
      : Number(EMBED_PROXY_MAX_ATTEMPTS || 2);
    const maxAttempts = Math.max(0, Math.min(5, Number.isFinite(configuredMax) ? configuredMax : 2));
    if (maxAttempts > 0) {
      let candidates = [];
      try {
        candidates = await getEmbedProxyCandidates(Math.max(maxAttempts * 3, maxAttempts), opts);
      } catch {
        candidates = [];
        current.proxyResult = { ok: false, blocked: false, reason: 'proxy-pool-error', status: null };
      }
      const hostKey = healthKey(retryTarget);
      const lastGood = hostKey ? proxyHostSuccess.get(hostKey) : '';
      const ordered = [...new Set([
        ...(lastGood ? [lastGood] : []),
        ...candidates.map((candidate) => parseProxyEntry(candidate)).filter(Boolean),
      ])];
      let attempts = 0;
      let lastProxyOutcome = null;
      for (const proxyUrl of ordered) {
        if (attempts >= maxAttempts) break;
        if (hasRecentProxyEgress(retryTarget, proxyUrl)) continue;
        // Se recuerda antes de esperar para que peticiones paralelas
        // del mismo host no quemen la misma salida a la vez. Si
        // funciona, rememberProxyHostSuccess lo olvida al instante.
        rememberProxyEgress(retryTarget, proxyUrl);
        attempts += 1;
        const retried = await resolveEmbedLocalDetailed(embedUrl, pageReferer, {
          ...opts,
          _forwardClientIp: false,
          _proxyUrl: proxyUrl,
          _bypassCircuit: true,
        });
        if (retried.ok) {
          rememberProxyHostSuccess(retryTarget, proxyUrl);
          return {
            ...retried,
            blocked: false,
            localReason: current.reason,
            clientIpTried: Boolean(current.clientIpTried),
            proxyTried: true,
            proxyAttempts: attempts,
          };
        }
        lastProxyOutcome = retried;
        if (lastGood && proxyUrl === lastGood && hostKey) proxyHostSuccess.delete(hostKey);
        // Si el HTML llegó bien pero no trae vídeo, otra salida
        // recibirá lo mismo: no gastes más proxies en este embed.
        if (!retried.blocked && !['proxy-error', 'fetch-error', 'timeout', 'empty-response'].includes(retried.reason)) break;
      }
      if (attempts > 0) {
        current.proxyTried = true;
        current.proxyAttempts = attempts;
        current.proxyResult = {
          ok: false,
          blocked: Boolean(lastProxyOutcome && lastProxyOutcome.blocked),
          reason: (lastProxyOutcome && lastProxyOutcome.reason) || null,
          status: (lastProxyOutcome && lastProxyOutcome.status) || null,
        };
        if (lastProxyOutcome && lastProxyOutcome.proxyError) current.proxyError = true;
      }
    }
  }

  if (opts.allowExternal === false) return current;

  const resolverBase = opts.externalResolverUrl !== undefined ? opts.externalResolverUrl : EXTERNAL_RESOLVER_URL;
  if (!resolverBase || !retryEligible) return current;

  current.externalTried = true;
  const external = await resolveViaExternalResolver(current.embedUrl || embedUrl, pageReferer, opts);
  if (external && external.ok) {
    return {
      ...current,
      ok: true,
      url: external.url,
      referer: external.referer || current.embedUrl || embedUrl,
      blocked: false,
      localReason: current.reason,
      reason: null,
      via: 'external-resolver',
      ipBoundSuspected: isIpBoundSuspected(external.url),
    };
  }
  current.externalResult = external || null;
  if (external && external.blocked) current.externalBlocked = true;
  return current;
}

/**
 * Compatibilidad: { url, referer } o null.
 */
async function resolveEmbed(embedUrl, pageReferer = `${BASE_URL}/`, options = {}) {
  const result = await resolveEmbedDetailed(embedUrl, pageReferer, options);
  return result && result.ok ? { url: result.url, referer: result.referer } : null;
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
  resolveEmbedDetailed,
  resolveEmbedLocalDetailed,
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
  // bloqueos de datacenter / resolver externo (testeables)
  looksBlocked,
  blockInfoFromError,
  isIpBoundSuspected,
  recordHostSuccess,
  recordHostBlock,
  recordHostFailure,
  getHostBlock,
  getHostBlockSnapshot,
  clearHostHealth,
  hasRecentClientIpRetry,
  rememberClientIpRetry,
  forgetClientIpRetry,
  hasRecentProxyEgress,
  rememberProxyEgress,
  rememberProxyHostSuccess,
  getEmbedProxyStatus,
  buildExternalResolverUrl,
  pickExternalResolverResult,
  resolveViaExternalResolver,
  USER_AGENT,
};
