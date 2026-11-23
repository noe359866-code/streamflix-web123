/* ============================================================
   StreamFlix — índice de servidores embebidos
   Solo proveedores verificados: sin anuncios, iframe permitido
   y reproducción cargando (prueba: 2026-11-23).

   Plantillas: {imdb}, {tmdb}, {s} (temporada), {e} (episodio).
   ============================================================ */

import { getCustomProviders } from './store.js';

export const BUILTIN_PROVIDERS = [
  {
    id: 'playlatinsrc',
    name: 'PlayLatinSRC',
    flag: '🇪🇸',
    spanish: true,
    adFree: true,
    idType: 'imdb',
    langs: ['Latino', 'Castellano', 'Subtitulado'],
    quality: '1080p',
    description:
      'Reproductor en español con selector de idioma y varios servidores (Dropload, Supervideo, Doodstream, Mixdrop). Sin anuncios. En series abre la lista completa de episodios.',
    movie: 'https://playlatinsrc.co/movie/{imdb}',
    series: 'https://playlatinsrc.co/serial/{imdb}',
    domains: ['playlatinsrc.co']
  },
  {
    id: 'embedwave',
    name: 'EmbedWave',
    flag: '🌐',
    spanish: true,
    adFree: true,
    idType: 'tmdb',
    langs: ['Español', 'Latino', 'Subtitulado', 'VO'],
    quality: '4K',
    description:
      'API gratuita sin anuncios inyectados, multi-servidor con cambio en vivo y sin API key. Requiere el ID de TMDb (se obtiene solo del catálogo).',
    movie: 'https://embedwave.cc/embed/movie/{tmdb}',
    series: 'https://embedwave.cc/embed/tv/{tmdb}/{s}/{e}',
    domains: ['embedwave.cc']
  },
  {
    id: 'bingeapi',
    name: 'BingeAPI',
    flag: '🌐',
    spanish: true,
    adFree: true,
    idType: 'imdb',
    langs: ['Español', 'Latino', 'Subtitulado', 'VO'],
    quality: '1080p',
    description:
      'Más de 100.000 películas y 540.000 episodios con 12 servidores y conmutación automática. Sin anuncios ni API key. Acepta IMDb o TMDb.',
    movie: 'https://bingeapi.st/embed/movie/{imdb}',
    series: 'https://bingeapi.st/embed/tv/{imdb}/{s}/{e}',
    domains: ['bingeapi.st']
  },
  {
    id: 'vidcore',
    name: 'VidCore',
    flag: '🌐',
    spanish: true,
    adFree: true,
    idType: 'tmdb',
    langs: ['Español', 'Subtitulado', 'VO'],
    quality: '4K',
    description:
      'Player 4K sin anuncios, subtítulos en más de 30 idiomas y pista de audio en español. Requiere el ID de TMDb.',
    movie: 'https://vidcore.org/embed/movie/{tmdb}',
    series: 'https://vidcore.org/embed/tv/{tmdb}/{s}/{e}',
    langQuery: 'lang',
    domains: ['vidcore.org']
  }
];

export function getProviders() {
  return [...BUILTIN_PROVIDERS, ...getCustomProviders()];
}

export function getSpanishProviders() {
  return getProviders().filter((provider) => provider.spanish);
}

/**
 * Comprueba si un servidor puede reproducir un título según su tipo de ID.
 * @param {object} provider
 * @param {{id?: string, tmdbId?: number|null}} item
 */
export function isProviderCompatible(provider, item = {}) {
  if (provider.idType === 'tmdb') return Boolean(item.tmdbId);
  return /^tt\d{6,10}$/.test(item.id || '');
}

/**
 * Construye la URL de un embed.
 * @param {object} provider
 * @param {{type:'movie'|'series', imdb?:string, tmdb?:number, season?:number, episode?:number, lang?:string}} options
 */
export function buildUrl(provider, { type, imdb, tmdb, season = 1, episode = 1, lang = 'es' } = {}) {
  if (!provider) return null;

  const template = type === 'series' ? provider.series : provider.movie;
  if (!template) return null;

  const needsTmdb = provider.idType === 'tmdb';
  const needsImdb = provider.idType !== 'tmdb';

  if (needsTmdb && !tmdb) return null;
  if (needsImdb && !/^tt\d{6,10}$/.test(imdb || '')) return null;

  const pad = provider.padEpisode || 1;
  let url = template
    .replaceAll('{imdb}', imdb || '')
    .replaceAll('{tmdb}', tmdb || '')
    .replaceAll('{s}', String(season))
    .replaceAll('{e}', String(episode).padStart(pad, '0'));

  if (provider.langQuery && lang) {
    url += (url.includes('?') ? '&' : '?') + provider.langQuery + '=' + encodeURIComponent(lang);
  }
  return url;
}
