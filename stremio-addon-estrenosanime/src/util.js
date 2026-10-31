'use strict';

const { LANGS } = require('./config');

/** Caché en memoria muy simple con TTL (segundos) y límite de entradas. */
class TtlCache {
  constructor(maxEntries = 600) {
    this.map = new Map();
    this.maxEntries = maxEntries;
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key, value, ttlSeconds) {
    if (this.map.size >= this.maxEntries) {
      // Evicta la entrada más antigua (orden de inserción del Map)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  clear() {
    this.map.clear();
  }
}

function normalizeSpaces(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** Detecta el idioma de una ficha por slug, título, badge o campo "Idioma:". */
function detectLang({ slug = '', title = '', badge = '', idiomaField = '' } = {}) {
  const field = String(idiomaField || '').toLowerCase();
  if (field.includes('castellano')) return LANGS.cast;
  if (field.includes('latino')) return LANGS.lat;
  if (field.includes('subtitulado')) return LANGS.sub;

  const b = String(badge || '').toUpperCase();
  if (b.includes('CASTELLANO')) return LANGS.cast;
  if (b.includes('LATINO')) return LANGS.lat;
  if (b === 'SUB' || b.includes('SUB')) {
    // seguimos comprobando slug/título por si el badge es genérico
  }

  const t = String(title || '');
  if (/\(castellano\)/i.test(t) || /-castellano$/i.test(slug)) return LANGS.cast;
  if (/\(latino\)/i.test(t) || /-latino$/i.test(slug)) return LANGS.lat;
  return LANGS.sub;
}

/** Quita el sufijo de idioma del slug: one-piece-latino -> one-piece */
function baseSlug(slug) {
  return String(slug || '').replace(/-(latino|castellano)$/i, '');
}

/** Slugs alternativos (otros idiomas) deducidos por sufijo. */
function altSlugs(slug) {
  const base = baseSlug(slug);
  return {
    sub: base,
    lat: `${base}-latino`,
    cast: `${base}-castellano`,
  };
}

/** ID de Stremio para una ficha y para cada episodio. */
function metaId(slug) {
  return `ea:${slug}`;
}
function videoId(slug, episode) {
  return `ea:${slug}:1:${episode}`;
}

/**
 * Parsea el id que llega al stream handler:
 *  - Película: ea:{slug}
 *  - Episodio: ea:{slug}:1:{episodio}
 */
function parseStreamId(id) {
  const raw = String(id || '');
  if (!raw.startsWith('ea:')) return null;
  const parts = raw.split(':');
  if (parts.length === 2) return { slug: parts[1], episode: 1, isMovie: true };
  if (parts.length >= 4) {
    const episode = parseInt(parts[3], 10);
    if (!Number.isFinite(episode)) return null;
    return { slug: parts[1], episode, isMovie: false };
  }
  return null;
}

function absoluteUrl(url, base) {
  if (!url) return '';
  const u = String(url).trim();
  if (!u || u.startsWith('javascript:') || u === '#') return '';
  try {
    return new URL(u, base).toString();
  } catch {
    return '';
  }
}

/** ¿El texto parece una URL en base64? Devuelve la URL decodificada o ''. */
function decodeBase64Url(value) {
  const v = String(value || '').trim();
  if (v.length < 16 || /\s/.test(v)) return '';
  if (!/^[A-Za-z0-9+/=_-]+$/.test(v)) return '';
  try {
    const decoded = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    if (/^https?:\/\//i.test(decoded)) return decoded.trim();
  } catch {
    /* no era base64 válido */
  }
  return '';
}

/** Extrae URLs directas de vídeo (.m3u8/.mp4/...) de un texto cualquiera. */
function findDirectMediaUrls(text) {
  if (!text) return [];
  const re = /https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4|mkv|webm|mpd)(?:\?[^\s"'<>\\]*)?/gi;
  const found = String(text).match(re) || [];
  // Limpia escapes típicos de JSON (\/, \u0026...)
  const cleaned = found.map((u) =>
    u.replace(/\\\//g, '/').replace(/\\u0026/gi, '&').replace(/&amp;/g, '&')
  );
  return [...new Set(cleaned)];
}

/** Extrae cualquier URL http(s) de un texto. */
function findAllUrls(text) {
  if (!text) return [];
  const re = /https?:\/\/[^\s"'<>\\]+/gi;
  const found = String(text).match(re) || [];
  return [...new Set(found.map((u) => u.replace(/[)\].,;]+$/, '')))];
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Nombre bonito de servidor a partir del dominio: filemoon.sx -> Filemoon */
function serverNameFromUrl(url, fallback = 'Servidor') {
  const host = hostOf(url);
  if (!host) return fallback;
  const main = host.split('.')[0] || host;
  return main.charAt(0).toUpperCase() + main.slice(1);
}

/** Calidad deducida de la URL si aparece (1080p, 720p...). */
function qualityFromUrl(url) {
  const m = String(url || '').match(/(2160|1440|1080|720|480|360)\s*p?/i);
  return m ? `${m[1]}p` : 'HD';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Envuelve una promesa con timeout duro. */
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    sleep(ms).then(() => {
      if (fallback !== undefined) return fallback;
      throw new Error(`Timeout tras ${ms}ms`);
    }),
  ]);
}

module.exports = {
  TtlCache,
  normalizeSpaces,
  detectLang,
  baseSlug,
  altSlugs,
  metaId,
  videoId,
  parseStreamId,
  absoluteUrl,
  decodeBase64Url,
  findDirectMediaUrls,
  findAllUrls,
  hostOf,
  serverNameFromUrl,
  qualityFromUrl,
  sleep,
  withTimeout,
};
