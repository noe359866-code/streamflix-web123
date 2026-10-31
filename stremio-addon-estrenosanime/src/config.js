'use strict';

/**
 * Configuración central del addon.
 * Todo lo descubierto de estrenosanime.net durante la investigación
 * (ver INVESTIGACION.md) vive aquí: rutas, géneros e idiomas.
 */

// Dominio principal. Si la web cambia de dominio/mirror, basta con
// definir la variable de entorno EA_BASE_URL (sin barra final).
const BASE_URL = (process.env.EA_BASE_URL || 'https://estrenosanime.net').replace(/\/+$/, '');

// Segundo proveedor: InfinityAnime (WordPress). Mirror conocido:
// animeonline.lat — si el principal cae, define INF_BASE_URL.
const INF_BASE_URL = (process.env.INF_BASE_URL || 'https://infinityanime.net').replace(/\/+$/, '');

// Proveedores extra (v1.3.0):
//  - AnimeJara : /catalogo?q= · ficha /anime/{slug}/ · episodio
//                /episode/{slug}-{T}x{E}/ · película /movie/{slug}
//  - Latanime  : /buscar?q= · ficha /anime/{slug} · ver /ver/{slug}-episodio-{n}
//  - AnimeD23  : /?s= · ficha /anime/{slug}/ · capítulo /capitulo/{slug}-ep-{n}/
const JARA_BASE_URL = (process.env.JARA_BASE_URL || 'https://animejara.com').replace(/\/+$/, '');
const LAT_BASE_URL = (process.env.LAT_BASE_URL || 'https://latanime.org').replace(/\/+$/, '');
const D23_BASE_URL = (process.env.D23_BASE_URL || 'https://animed23.com').replace(/\/+$/, '');

// Rutas verificadas de InfinityAnime (ver INVESTIGACION-INFINITY.md):
//  - Ficha:      /{slug}/
//  - Reproducir: /{slug}/episodio-{n}/
//  - Buscador:   /directorio/?s_keyword={texto}  (filtro etiqueta[]=latino)
//  - REST WP:    /wp-json/wp/v2/serie?search=  ·  /wp-json/wp/v2/episode
const INF_ROUTES = {
  directorioSearch: (q) => `/directorio/?s_keyword=${encodeURIComponent(q)}`,
  directorioLatino: '/directorio/?s_keyword=&etiqueta%5B%5D=latino&orderby=date&order=DESC',
  anime: (slug) => `/${slug}/`,
  watch: (slug, ep) => `/${slug}/episodio-${ep}/`,
  restSerieSearch: (q) =>
    `/wp-json/wp/v2/serie?search=${encodeURIComponent(q)}&per_page=20&_fields=slug,title,link,class_list,etiqueta,tipo`,
  restSerieBySlug: (slug) => `/wp-json/wp/v2/serie?slug=${encodeURIComponent(slug)}`,
  restEpisodeBySlug: (slug, ep) =>
    `/wp-json/wp/v2/episode?slug=${encodeURIComponent(`${slug}-episodio-${ep}`)}`,
};

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

// Respaldo si un reproductor (VOE, Filemoon, etc.) bloquea la IP del
// datacenter donde corre el addon (Beamup/Render/VPS). Sin configurador
// para el usuario de Stremio: son variables SOLO del despliegue.
//
// EA_EXTERNAL_RESOLVER_URL puede apuntar a `scripts/home-resolver.js`
// corriendo en una IP residencial (PC/Raspberry con Cloudflare Tunnel
// o Tailscale). Si el hosting recibe 403/captcha/geo-bloqueo al resolver
// un embed, se le pide a ese resolver externo que lo intente desde su IP.
const EXTERNAL_RESOLVER_URL = (
  process.env.EA_EXTERNAL_RESOLVER_URL || process.env.RESOLVER_URL || ''
).replace(/\/+$/, '');
const EXTERNAL_RESOLVER_TOKEN =
  process.env.EA_EXTERNAL_RESOLVER_TOKEN || process.env.RESOLVER_TOKEN || '';
const EXTERNAL_RESOLVER_TIMEOUT_MS = Number(
  process.env.EA_EXTERNAL_RESOLVER_TIMEOUT_MS || process.env.RESOLVER_TIMEOUT_MS || 15000
);
// Si un host nos bloquea, no lo martillamos en cada episodio: se abre un
// "circuito" por host durante este tiempo y se ofrece la vía externa.
const HOST_BLOCK_TTL_MS = Number(process.env.EA_HOST_BLOCK_TTL_MS || 10 * 60 * 1000);
const HOST_FAILURE_COOLDOWN_MS = Number(process.env.EA_HOST_FAILURE_COOLDOWN_MS || 60 * 1000);

// Reintento "best effort" con la IP pública de quien pide el stream:
// NO cambia la IP TCP del servidor (imposible), solo la señala con
// X-Forwarded-For/Forwarded cuando el datacenter ya fue bloqueado.
// Algunos reproductores lo aceptan; Cloudflare y los que miran la IP
// TCP real, no. Se puede apagar con EA_FORWARD_CLIENT_IP=0.
const FORWARD_CLIENT_IP = process.env.EA_FORWARD_CLIENT_IP !== '0';
const CLIENT_IP_RETRY_TTL_MS = Number(process.env.EA_CLIENT_IP_RETRY_TTL_MS || 10 * 60 * 1000);
// Actívalo si tu proxy inverso no se detecta como salto privado y
// necesitas creer sus cabeceras X-Forwarded-* para conocer al cliente.
const TRUST_PROXY = process.env.EA_TRUST_PROXY === '1' || process.env.TRUST_PROXY === '1';

// Reglas del proyecto: SIN datos demo y SIN configurador.
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
  INF_BASE_URL,
  JARA_BASE_URL,
  LAT_BASE_URL,
  D23_BASE_URL,
  USER_AGENT,
  ROUTES,
  INF_ROUTES,
  GENRES,
  LANGS,
  SITE_TYPES,
  TIMEOUT_MS,
  EMBED_TIMEOUT_MS,
  EXTERNAL_RESOLVER_URL,
  EXTERNAL_RESOLVER_TOKEN,
  EXTERNAL_RESOLVER_TIMEOUT_MS,
  HOST_BLOCK_TTL_MS,
  HOST_FAILURE_COOLDOWN_MS,
  FORWARD_CLIENT_IP,
  CLIENT_IP_RETRY_TTL_MS,
  TRUST_PROXY,
  DEBUG_ENABLED,
  CACHE_TTL,
};
