'use strict';

const { BASE_URL, USER_AGENT, TIMEOUT_MS, CACHE_TTL } = require('./config');
const { TtlCache, sleep } = require('./util');

const pageCache = new TtlCache(800);

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
  } = options;

  if (useCache) {
    const cached = pageCache.get(url);
    if (cached) return cached;
  }

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6',
          Referer: referer,
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
        pageCache.set(url, result, cacheTtl);
      }
      return result;
    } catch (err) {
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

module.exports = { fetchText, fetchSitePage, pageCache };
