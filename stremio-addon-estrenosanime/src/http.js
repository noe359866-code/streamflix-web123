'use strict';

const { fetch: undiciFetch, ProxyAgent, Socks5ProxyAgent } = require('undici');
const { BASE_URL, USER_AGENT, TIMEOUT_MS, CACHE_TTL } = require('./config');
const { TtlCache, sleep } = require('./util');
const { clientIpHeaders, hashIp } = require('./request-context');
const { parseProxyEntry, proxyKey, sanitizeProxyError } = require('./proxy-egress');

const pageCache = new TtlCache(800);
const proxyDispatchers = new Map();

/**
 * Dispatcher de Undici para salir por un proxy HTTP/SOCKS5 concreto.
 * Solo se usa cuando una resolución de embed lo pide (reintento tras
 * bloqueo del datacenter); el resto del tráfico va directo.
 */
function getProxyDispatcher(proxyUrl) {
  const normalized = parseProxyEntry(proxyUrl);
  if (!normalized) return null;
  if (!proxyDispatchers.has(normalized)) {
    const isSocks = normalized.startsWith('socks5://');
    proxyDispatchers.set(
      normalized,
      isSocks ? new Socks5ProxyAgent(normalized) : new ProxyAgent(normalized)
    );
  }
  return proxyDispatchers.get(normalized);
}

async function closeProxyDispatchers() {
  const agents = [...proxyDispatchers.values()];
  proxyDispatchers.clear();
  await Promise.allSettled(agents.map((agent) => agent.close()));
}

/**
 * Descarga una URL como texto con cabeceras de navegador real.
 * La web está detrás de Cloudflare, pero las páginas normales responden
 * 200 a peticiones con User-Agent de navegador (verificado en la
 * investigación: allorigins obtuvo HTTP 200 sin challenge).
 *
 * Devuelve { text, finalUrl, status } — finalUrl importa porque
 * /ver/{slug}/episodio-{n} redirige a la misma URL con ?ep={episode_id}.
 */
async function fetchText(url, options = {}) {
  const {
    timeoutMs = TIMEOUT_MS,
    referer = `${BASE_URL}/`,
    headers = {},
    retries = 1,
    useCache = false,
    cacheTtl = CACHE_TTL.page,
    // Solo para el reintento anti-bloqueo: señala la IP del solicitante.
    // No cambia la IP TCP saliente; ver request-context.js.
    clientIp = '',
    // Solo para el reintento anti-bloqueo: salir por este proxy.
    // Esto SÍ cambia la IP TCP que ve el reproductor (la del proxy).
    proxyUrl = '',
    fetchImpl = null,
  } = options;

  const normalizedProxy = proxyUrl ? parseProxyEntry(proxyUrl) : '';
  if (proxyUrl && !normalizedProxy) {
    const err = new Error('Proxy de resolución inválido');
    err.proxyError = true;
    throw err;
  }

  // Una respuesta obtenida señalando una IP o vía un proxy concreto no
  // debe reutilizarse para otra salida (puede venir firmada por IP).
  const cacheSuffix = [
    clientIp ? `xff:${hashIp(clientIp)}` : '',
    normalizedProxy ? `proxy:${proxyKey(normalizedProxy)}` : '',
  ].filter(Boolean).join('|');
  const cacheKey = cacheSuffix ? `${url}\n${cacheSuffix}` : url;
  if (useCache) {
    const cached = pageCache.get(cacheKey);
    if (cached) return cached;
  }

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const activeFetch = fetchImpl || (normalizedProxy ? undiciFetch : fetch);
      const res = await activeFetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        ...(normalizedProxy ? { dispatcher: getProxyDispatcher(normalizedProxy) } : {}),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6',
          Referer: referer,
          ...clientIpHeaders(clientIp),
          ...headers,
        },
      });
      const text = await res.text();
      const result = { text, finalUrl: res.url || url, status: res.status };
      if (res.status === 403 || res.status === 503) {
        // Posible challenge temporal de Cloudflare: lo tratamos como error
        // para que la capa superior pueda enseñar un mensaje útil.
        const err = new Error(`HTTP ${res.status} en ${url} (posible bloqueo anti-bots)`);
        err.status = res.status;
        err.bodySnippet = text.slice(0, 500);
        throw err;
      }
      if (useCache && res.status >= 200 && res.status < 300) {
        pageCache.set(cacheKey, result, cacheTtl);
      }
      return result;
    } catch (err) {
      if (normalizedProxy) {
        // Nunca dejes que un error enseñe usuario/clave del proxy.
        if (err && err.message) err.message = sanitizeProxyError(err.message, normalizedProxy);
        if (err && !err.status) err.proxyError = true;
      }
      lastError = err;
      if (attempt < retries) await sleep(700 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function fetchSitePage(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  return fetchText(url, { useCache: true, ...options });
}

module.exports = { fetchText, fetchSitePage, pageCache, getProxyDispatcher, closeProxyDispatchers };
