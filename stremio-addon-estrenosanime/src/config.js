'use strict';

/**
 * Configuración central del addon.
 * Todo lo descubierto de estrenosanime.net durante la investigación
 * (ver INVESTIGACION.md) vive aquí: rutas, géneros e idiomas.
 */

// Dominio principal. Si la web cambia de dominio/mirror, basta con
// definir la variable de entorno EA_BASE_URL (sin barra final).
const BASE_URL = (process.env.EA_BASE_URL || 'https://estrenosanime.net').replace(/\/+$/, '');

const USER_AGENT =
  process.env.EA_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Rutas reales verificadas en la web (oct-2026):
//  - Ficha:      /anime/{slug}
//  - Reproducir: /ver/{slug}/episodio-{n}   (redirige y añade ?ep={episode_id})
//  - Buscador:   /search?keyword={texto}&page={n}
//  - Listados con paginación ?page={n}
const ROUTES = {
  home: '/home',
  popular: '/popular',
  ultimoAnime: '/ultimo-anime',
  ultimoActualizado: '/ultimo-actualizado',
  ultimoEpisodios: '/ultimo-episodios',
  ultimoSubtitulado: '/ultimo-subtitulado',
  ultimoLatino: '/ultimo-latino',
  ultimoCastellano: '/ultimo-castellano', // existe aunque no sale en el menú
  enEmision: '/estado/En+Emision',
  completado: '/estado/Completado',
  peliculas: '/tipo/Pelicula',
  tipo: (t) => `/tipo/${encodeURIComponent(t)}`,
  genero: (g) => `/genero/${encodeURIComponent(g).replace(/%20/g, '+')}`,
  estado: (e) => `/estado/${encodeURIComponent(e).replace(/%20/g, '+')}`,
  year: (y) => `/years/${encodeURIComponent(y)}`,
  search: (q) => `/search?keyword=${encodeURIComponent(q)}`,
  anime: (slug) => `/anime/${slug}`,
  watch: (slug, ep) => `/ver/${slug}/episodio-${ep}`,
};

// Géneros tal y como aparecen en el menú/filtros de la web (sin tildes,
// así los usa la web en sus URL /genero/...).
const GENRES = [
  'Accion', 'Aventura', 'Carreras', 'Comedia', 'Demencia', 'Demonios',
  'Misterio', 'Drama', 'Ecchi', 'Fantasia', 'Juegos', 'Historico', 'Terror',
  'Infantil', 'Magia', 'Arte Marciales', 'Mecha', 'Musica', 'Parodia',
  'Samurai', 'Romance', 'Escuela', 'Ciencia Ficcion', 'Shoujo', 'Shoujo Ai',
  'Shounen', 'Espacial', 'Deporte', 'Super Poderes', 'Vampiros', 'Harem',
  'Recuentos de la vida', 'Sobrenatural', 'Militar', 'Policia',
  'Psicologico', 'Suspenso', 'Seinen', 'Josei', 'Isekai', 'Gore', 'Zombie',
  'Yaoi', 'Yuri', 'Adulto',
];

// La web separa cada idioma como una ficha distinta:
//  - Subtitulado: slug normal            -> one-piece
//  - Latino:      slug + "-latino"       -> one-piece-latino   "(Latino)"
//  - Castellano:  slug + "-castellano"   -> xyz-castellano    "(Castellano)"
const LANGS = {
  sub: { key: 'sub', label: 'Subtitulado', short: 'SUB', emoji: '💬', suffix: '' },
  lat: { key: 'lat', label: 'Latino', short: 'LATINO', emoji: '🌎', suffix: '-latino' },
  cast: { key: 'cast', label: 'Castellano', short: 'CASTELLANO', emoji: '🇪🇸', suffix: '-castellano' },
};

// Tipos de la web -> tipo Stremio. Solo "Pelicula" es movie; el resto series.
const SITE_TYPES = ['Pelicula', 'TV', 'OVA', 'ONA', 'Especial', 'Music'];

const TIMEOUT_MS = Number(process.env.EA_TIMEOUT_MS || 15000);
const EMBED_TIMEOUT_MS = Number(process.env.EA_EMBED_TIMEOUT_MS || 12000);
const DEMO_FALLBACK = process.env.DEMO_FALLBACK === '1';
const DEBUG_ENABLED = process.env.DEBUG !== '0';

// TTL de caché en segundos
const CACHE_TTL = {
  catalog: 15 * 60,
  meta: 6 * 60 * 60,
  stream: 10 * 60,
  page: 10 * 60,
  jsFile: 24 * 60 * 60,
};

module.exports = {
  BASE_URL,
  USER_AGENT,
  ROUTES,
  GENRES,
  LANGS,
  SITE_TYPES,
  TIMEOUT_MS,
  EMBED_TIMEOUT_MS,
  DEMO_FALLBACK,
  DEBUG_ENABLED,
  CACHE_TTL,
};
