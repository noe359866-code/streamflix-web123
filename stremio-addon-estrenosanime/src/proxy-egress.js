'use strict';

/**
 * Salida proxy opcional SOLO para resolver embeds bloqueados.
 *
 * Qué es: si un reproductor (VOE, Filemoon…) bloquea la IP de Beamup,
 * el addon puede reintentar la descarga del HTML del embed a través de
 * un proxy HTTP/SOCKS5 del operador, para que la petición salga por
 * otra IP. El VÍDEO nunca pasa por el proxy: el enlace directo lo
 * reproduce Stremio desde la conexión del usuario.
 *
 * Qué NO es: Proxy5 (https://api.proxy5.net/docs/) vende proxies de
 * DATACENTER —su propia FAQ dice que no ofrece residenciales—, así
 * que esto solo ayuda cuando el bloqueo es contra la IP/ASN concretas
 * de Beamup. Si el reproductor bloquea cualquier datacenter o exige
 * pasar un challenge de navegador, seguirá bloqueando.
 *
 * Fuentes de proxies (variables del despliegue, sin configurador):
 *  1. Lista estática EA_EMBED_PROXY_URLS (recomendado): pega los
 *     endpoints que exporte tu panel, de Proxy5 o de quien sea.
 *  2. API heredada de Proxy5: solo se hace el GET de lectura
 *     /api/iplist/{type}/{format}/{serviceId} para descargar la lista
 *     de un servicio ya comprado. Nunca se compran ni se modifican
 *     servicios desde el addon.
 *
 * Las credenciales viven solo en variables de entorno y en memoria:
 * no se loguean, no salen en /health ni en /debug y los errores se
 * sanean antes de mostrarse.
 */

const crypto = require('node:crypto');
const {
  EMBED_PROXY_URLS,
  EMBED_PROXY_SCHEME,
  PROXY5_API_BASE_URL,
  PROXY5_API_AUTH_KEY,
  PROXY5_SERVICE_ID,
  PROXY5_LIST_TYPE,
  PROXY5_LIST_FORMAT,
  PROXY5_LIST_CACHE_MS,
  PROXY5_API_TIMEOUT_MS,
} = require('./config');
const { isPrivateIp } = require('./request-context');

const PROXY5_LIST_TYPES = new Set(['http-ip', 'socks-ip', 'http-auth', 'ppr-http', 'ppr-socks']);
const PROXY5_LIST_FORMATS = new Set(['csv', 'txt', 'json']);

function normalizeScheme(raw) {
  const scheme = String(raw || '').trim().toLowerCase().replace(/:$/, '');
  if (scheme === 'socks' || scheme === 'socks5h') return 'socks5';
  return ['http', 'https', 'socks5'].includes(scheme) ? scheme : '';
}

function defaultPortFor(scheme) {
  if (scheme === 'https') return 443;
  if (scheme === 'socks5') return 1080;
  return 80;
}

function isBlockedProxyHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  return isPrivateIp(host);
}

function canonicalProxyUrl({ scheme, host, port, username = '', password = '' }, options = {}) {
  const proto = normalizeScheme(scheme || options.defaultScheme || 'http');
  const hostname = String(host || '').trim().replace(/^\[|\]$/g, '');
  const numericPort = Number(port || options.defaultPort || defaultPortFor(proto));
  if (!proto || !hostname || !Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) return '';
  if (options.allowPrivate === false && isBlockedProxyHost(hostname)) return '';
  const hostPart = hostname.includes(':') ? `[${hostname}]` : hostname;
  let url;
  try {
    url = new URL(`${proto}://${hostPart}:${numericPort}`);
  } catch {
    return '';
  }
  if (username) url.username = String(username);
  if (password) url.password = String(password);
  return url.href;
}

function proxyFromObject(entry, options) {
  if (!entry || typeof entry !== 'object') return '';
  const direct = entry.url || entry.proxy || entry.proxy_url || entry.proxyUrl || entry.address_url;
  if (typeof direct === 'string') return parseProxyEntry(direct, options);
  const schemeHint = entry.scheme || entry.protocol || entry.type || options.defaultScheme;
  const scheme = normalizeScheme(schemeHint) || 'http';
  const host = entry.host || entry.hostname || entry.ip || entry.server || entry.address || entry.domain;
  const port = entry.port
    || (scheme === 'socks5' ? (entry.socks5_port || entry.socks_port) : null)
    || entry.http_port
    || entry.https_port
    || entry.socks5_port
    || entry.socks_port;
  return canonicalProxyUrl({
    scheme,
    host,
    port,
    username: entry.username || entry.user || entry.login || '',
    password: entry.password || entry.pass || entry.pwd || '',
  }, options);
}

/** Acepta URL completa, user:pass@host:puerto y host:puerto[:user:pass]. */
function parseProxyEntry(entry, options = {}) {
  if (!entry) return '';
  if (typeof entry === 'object') return proxyFromObject(entry, options);
  let raw = String(entry).trim().replace(/^['"]|['"]$/g, '');
  if (!raw) return '';
  // En listas TXT a veces sobran columnas tras un espacio (país, etc.).
  if (!raw.includes('://')) raw = raw.split(/\s+/)[0];
  const defaultScheme = normalizeScheme(options.defaultScheme) || 'http';

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return canonicalProxyUrl({
        scheme: url.protocol,
        host: decodeURIComponent(url.hostname),
        port: url.port,
        username: decodeURIComponent(url.username || ''),
        password: decodeURIComponent(url.password || ''),
      }, options);
    } catch {
      return '';
    }
  }

  if (raw.includes('@')) {
    try {
      const url = new URL(`${defaultScheme}://${raw}`);
      return canonicalProxyUrl({
        scheme: defaultScheme,
        host: decodeURIComponent(url.hostname),
        port: url.port,
        username: decodeURIComponent(url.username || ''),
        password: decodeURIComponent(url.password || ''),
      }, options);
    } catch {
      return '';
    }
  }

  const parts = raw.includes(',') && !raw.startsWith('[')
    ? raw.split(',').map((p) => p.trim())
    : raw.split(':');
  if (parts.length === 1) {
    return canonicalProxyUrl({ scheme: defaultScheme, host: parts[0] }, options);
  }
  if (parts.length === 2) {
    return canonicalProxyUrl({ scheme: defaultScheme, host: parts[0], port: parts[1] }, options);
  }
  if (parts.length >= 4) {
    return canonicalProxyUrl({
      scheme: defaultScheme,
      host: parts[0],
      port: parts[1],
      username: parts[2],
      password: parts.slice(3).join(':'),
    }, options);
  }
  return '';
}

function dedupe(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function parseProxyList(value, options = {}) {
  if (!value) return [];
  if (Array.isArray(value)) return dedupe(value.map((entry) => parseProxyEntry(entry, options)));
  if (typeof value === 'object') return dedupe([parseProxyEntry(value, options)]);
  return dedupe(
    String(value)
      .split(/[\n;,]+/)
      .map((entry) => parseProxyEntry(entry, options))
  );
}

function collectEntries(data, depth = 0) {
  if (!data || depth > 3) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') return [data];
  if (typeof data !== 'object') return [];
  if (data.host || data.hostname || data.ip || data.server || data.url || data.proxy) return [data];
  for (const key of ['data', 'list', 'lists', 'ips', 'proxies', 'proxy_list', 'items', 'result', 'services']) {
    const nested = collectEntries(data[key], depth + 1);
    if (nested.length) return nested;
  }
  return [];
}

/**
 * Parsea la respuesta de /api/iplist/... de Proxy5 (json/csv/txt).
 * La documentación heredada no fija el esquema exacto ("ip list in
 * selected format"), así que se aceptan las formas habituales:
 * arrays de strings/objetos y líneas host:puerto[:user:pass].
 * Los endpoints que apunten a localhost/IPs privadas se descartan:
 * vienen de una respuesta externa, no de la configuración local.
 */
function parseProxy5ListBody(body, options = {}) {
  const listType = String(options.listType || PROXY5_LIST_TYPE || 'http-auth').toLowerCase();
  const format = String(options.format || PROXY5_LIST_FORMAT || '').toLowerCase();
  const parseOpts = {
    defaultScheme: listType.includes('socks') ? 'socks5' : 'http',
    allowPrivate: false,
  };
  const text = String(body || '').trim();
  if (!text) return [];
  if (format === 'json' || /^[{[]/.test(text)) {
    try {
      return dedupe(collectEntries(JSON.parse(text)).map((entry) => parseProxyEntry(entry, parseOpts)));
    } catch {
      /* cae a texto plano */
    }
  }
  return dedupe(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^(#|ip[,:\s]|host[,:\s])/i.test(line))
      .map((line) => parseProxyEntry(line, parseOpts))
  );
}

function buildProxy5ListUrl(options = {}) {
  const base = String(options.baseUrl || PROXY5_API_BASE_URL || '').replace(/\/+$/, '');
  const serviceId = String(options.serviceId || PROXY5_SERVICE_ID || '').trim();
  const listType = String(options.listType || PROXY5_LIST_TYPE || 'http-auth').toLowerCase();
  const listFormat = String(options.listFormat || options.format || PROXY5_LIST_FORMAT || 'json').toLowerCase();
  if (!/^https:\/\//i.test(base)) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(serviceId)) return '';
  if (!PROXY5_LIST_TYPES.has(listType) || !PROXY5_LIST_FORMATS.has(listFormat)) return '';
  return `${base}/api/iplist/${listType}/${listFormat}/${encodeURIComponent(serviceId)}`;
}

function proxy5Authorization(authKey) {
  const key = String(authKey || PROXY5_API_AUTH_KEY || '').trim().replace(/^Basic\s+/i, '');
  return key ? `Basic ${key}` : '';
}

function proxyKey(proxyUrl) {
  const normalized = parseProxyEntry(proxyUrl);
  return normalized
    ? crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)
    : '';
}

function redactProxyUrl(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    url.username = '';
    url.password = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

/** Quita credenciales de proxy de mensajes de error antes de enseñarlos. */
function sanitizeProxyError(message, proxyUrl) {
  let out = String(message || '');
  if (proxyUrl) {
    out = out.split(String(proxyUrl)).join('[proxy]');
    try {
      const url = new URL(proxyUrl);
      for (const secret of [url.username, url.password]) {
        if (secret) {
          out = out.split(decodeURIComponent(secret)).join('[secreto]');
          out = out.split(secret).join('[secreto]');
        }
      }
    } catch { /* nada que sanear */ }
  }
  return out.replace(/(Basic\s+)[A-Za-z0-9+/=_-]+/gi, '$1[secreto]');
}

function createProxyPool(options = {}) {
  const defaultScheme = normalizeScheme(options.defaultScheme || EMBED_PROXY_SCHEME) || 'http';
  const staticProxies = parseProxyList(
    options.staticProxies !== undefined ? options.staticProxies : EMBED_PROXY_URLS,
    { defaultScheme }
  );
  const proxy5 = {
    baseUrl: options.proxy5BaseUrl || PROXY5_API_BASE_URL,
    authKey: options.proxy5AuthKey !== undefined ? options.proxy5AuthKey : PROXY5_API_AUTH_KEY,
    serviceId: options.proxy5ServiceId !== undefined ? options.proxy5ServiceId : PROXY5_SERVICE_ID,
    listType: options.proxy5ListType || PROXY5_LIST_TYPE,
    listFormat: options.proxy5ListFormat || PROXY5_LIST_FORMAT,
    cacheMs: Number(options.proxy5CacheMs || PROXY5_LIST_CACHE_MS || 600000),
    timeoutMs: Number(options.proxy5TimeoutMs || PROXY5_API_TIMEOUT_MS || 8000),
  };
  const apiConfigured = Boolean(proxy5Authorization(proxy5.authKey) && buildProxy5ListUrl({
    baseUrl: proxy5.baseUrl,
    serviceId: proxy5.serviceId,
    listType: proxy5.listType,
    listFormat: proxy5.listFormat,
  }));
  const fetchImpl = options.fetchImpl || ((...args) => fetch(...args));

  let apiCache = { at: 0, list: [] };
  let inFlight = null;
  let lastError = '';
  let rotation = 0;

  async function loadApiProxies() {
    if (!apiConfigured) return [];
    if (apiCache.list.length && Date.now() - apiCache.at < proxy5.cacheMs) return apiCache.list;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const endpoint = buildProxy5ListUrl({
        baseUrl: proxy5.baseUrl,
        serviceId: proxy5.serviceId,
        listType: proxy5.listType,
        listFormat: proxy5.listFormat,
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), proxy5.timeoutMs);
      try {
        const res = await fetchImpl(endpoint, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Authorization: proxy5Authorization(proxy5.authKey),
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
        });
        const text = await res.text();
        const ok = typeof res.ok === 'boolean' ? res.ok : res.status >= 200 && res.status < 300;
        if (!ok) {
          lastError = `proxy5-http-${res.status || '?'}`;
          return apiCache.list; // lista anterior si la hay (stale ok)
        }
        const parsed = parseProxy5ListBody(text, { listType: proxy5.listType, format: proxy5.listFormat });
        if (!parsed.length) {
          lastError = 'proxy5-empty-list';
          return apiCache.list;
        }
        apiCache = { at: Date.now(), list: parsed };
        lastError = '';
        return parsed;
      } catch (err) {
        lastError = err && err.name === 'AbortError' ? 'proxy5-timeout' : 'proxy5-fetch-error';
        return apiCache.list;
      } finally {
        clearTimeout(timer);
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function getProxies() {
    const api = await loadApiProxies().catch(() => apiCache.list);
    return dedupe([...staticProxies, ...api]);
  }

  async function getCandidates(limit = 2) {
    const all = await getProxies();
    const max = Math.max(0, Math.min(all.length, Number(limit) || 0));
    if (!max) return [];
    if (all.length <= max) return [...all];
    const start = rotation % all.length;
    rotation += 1;
    return Array.from({ length: max }, (_, i) => all[(start + i) % all.length]);
  }

  function getStatus() {
    const count = dedupe([...staticProxies, ...apiCache.list]).length;
    return {
      enabled: Boolean(staticProxies.length || apiConfigured),
      source: staticProxies.length && apiConfigured
        ? 'static+proxy5-api'
        : apiConfigured ? 'proxy5-api' : staticProxies.length ? 'static' : 'none',
      count,
      proxy5Api: apiConfigured,
      lastError: lastError || null,
      lastFetchedAt: apiCache.at ? new Date(apiCache.at).toISOString() : null,
    };
  }

  function clearCache() {
    apiCache = { at: 0, list: [] };
    lastError = '';
    rotation = 0;
  }

  return { getProxies, getCandidates, getStatus, clearCache, loadApiProxies };
}

const embedProxyPool = createProxyPool();

async function getEmbedProxyCandidates(limit = 2, options = {}) {
  if (options.proxyPool && typeof options.proxyPool.getCandidates === 'function') {
    return options.proxyPool.getCandidates(limit);
  }
  const explicit = options.proxyUrls !== undefined ? options.proxyUrls : options.proxyUrl;
  if (explicit !== undefined) {
    return parseProxyList(explicit, { defaultScheme: options.proxyScheme || EMBED_PROXY_SCHEME }).slice(0, Math.max(0, Number(limit) || 0));
  }
  return embedProxyPool.getCandidates(limit);
}

function getEmbedProxyStatus(options = {}) {
  if (options.proxyPool && typeof options.proxyPool.getStatus === 'function') {
    return options.proxyPool.getStatus();
  }
  return embedProxyPool.getStatus();
}

module.exports = {
  PROXY5_LIST_TYPES,
  PROXY5_LIST_FORMATS,
  normalizeScheme,
  parseProxyEntry,
  parseProxyList,
  parseProxy5ListBody,
  buildProxy5ListUrl,
  proxy5Authorization,
  proxyKey,
  redactProxyUrl,
  sanitizeProxyError,
  createProxyPool,
  embedProxyPool,
  getEmbedProxyCandidates,
  getEmbedProxyStatus,
};
