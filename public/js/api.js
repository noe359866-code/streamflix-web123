/* ============================================================
   StreamFlix — catálogo (Cinemeta, sin API key) + datos demo
   ============================================================ */

const BASES = [
  'https://v3-cinemeta.strem.io',
  'https://cinemeta.strem.io',
  '/api/cinemeta'
];
const cache = new Map();
const TIMEOUT = 8000;

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function cinemeta(path) {
  if (cache.has(path)) return cache.get(path);
  let lastError;
  for (const base of BASES) {
    try {
      const data = await fetchJSON(base + path);
      cache.set(path, data);
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No se pudo conectar al catálogo');
}

function listFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.metas)) return data.metas;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function metaFrom(data) {
  if (data?.meta && typeof data.meta === 'object') return data.meta;
  if (data?.item && typeof data.item === 'object') return data.item;
  return data;
}

function normalize(item = {}, fallbackType = 'movie') {
  const releaseInfo = String(item.releaseInfo || item.year || '');
  return {
    id: item.id || item.imdb_id || '',
    type: item.type || fallbackType,
    name: item.name || item.title || 'Sin título',
    poster: item.poster || '',
    background: item.background || '',
    description: item.description || item.overview || '',
    releaseInfo,
    year: releaseInfo.split('–')[0].split('-')[0],
    rating: Number(item.imdbRating || item.rating || 0),
    tmdbId: Number(item.moviedb_id || item.tmdb_id || 0) || null,
    genres: Array.isArray(item.genres) ? item.genres : [],
    runtime: item.runtime || '',
    cast: Array.isArray(item.cast) ? item.cast.slice(0, 8) : [],
    country: item.country || '',
    videos: Array.isArray(item.videos) ? item.videos : [],
    trailers: Array.isArray(item.trailers) ? item.trailers : [],
    trailerStreams: Array.isArray(item.trailerStreams) ? item.trailerStreams : []
  };
}

/* ---------------- Catálogos ---------------- */

export async function getCatalog(type) {
  const list = listFrom(await cinemeta(`/catalog/${type}/top.json`));
  return list.map((item) => normalize(item, type));
}

export async function searchAll(query) {
  const q = encodeURIComponent(query);
  const results = await Promise.allSettled([
    cinemeta(`/catalog/search/movie/${q}.json`),
    cinemeta(`/catalog/search/series/${q}.json`)
  ]);
  const items = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const type = index === 0 ? 'movie' : 'series';
      items.push(...listFrom(result.value).map((item) => normalize(item, type)));
    }
  });
  if (!items.length) throw new Error('Sin resultados');
  return items;
}

export async function getMeta(type, id) {
  const raw = metaFrom(await cinemeta(`/meta/${type}/${id}.json`));
  return normalize(raw, type);
}

/* ---------------- Datos demo (sin conexión) ---------------- */

const demo = (id, tmdbId, type, name, year, rating, genres, description) => ({
  id,
  type,
  name,
  poster: '',
  background: '',
  description,
  releaseInfo: year,
  year,
  rating,
  tmdbId,
  genres,
  runtime: type === 'movie' ? '2h 0min' : '45min',
  cast: [],
  country: '',
  videos: []
});

export const DEMO = {
  movies: [
    demo('tt0111161', 278, 'movie', 'The Shawshank Redemption', '1994', 9.3, ['Drama'], 'Dos hombres encarcelados forjan una amistad duradera mientras buscan consuelo y redención.'),
    demo('tt0068646', 238, 'movie', 'The Godfather', '1972', 9.2, ['Crime', 'Drama'], 'La saga de una familia mafiosa italoamericana, centrada en la transformación de Michael Corleone.'),
    demo('tt0468569', 155, 'movie', 'The Dark Knight', '2008', 9.0, ['Action', 'Crime', 'Drama'], 'Batman enfrenta al Joker, un criminal que sume Gotham en el caos.'),
    demo('tt0137523', 550, 'movie', 'Fight Club', '1999', 8.8, ['Drama'], 'Un oficinista insomne y un vendedor de jabón forman un club de pelea clandestino.'),
    demo('tt1375666', 27205, 'movie', 'Inception', '2010', 8.8, ['Action', 'Sci-Fi'], 'Un ladrón que roba secretos a través de los sueños recibe una misión imposible.'),
    demo('tt0816692', 157336, 'movie', 'Interstellar', '2014', 8.7, ['Adventure', 'Drama', 'Sci-Fi'], 'Un equipo de exploradores viaja a través de un agujero de gusano en busca de un nuevo hogar.'),
    demo('tt0167260', 120, 'movie', 'The Lord of the Rings: The Fellowship of the Ring', '2001', 8.9, ['Adventure', 'Fantasy'], 'Un hobbit emprende un viaje para destruir un anillo de poder.'),
    demo('tt4154756', 299536, 'movie', 'Avengers: Infinity War', '2018', 8.4, ['Action', 'Sci-Fi'], 'Los Vengadores se unen para detener a Thanos, que busca las seis piedras del infinito.'),
    demo('tt2582802', 244786, 'movie', 'Whiplash', '2014', 8.5, ['Drama', 'Music'], 'Un joven baterista inscribe en un conservatorio donde un profesor lo lleva al límite.'),
    demo('tt1825683', 284053, 'movie', 'Black Panther', '2018', 7.3, ['Action', 'Sci-Fi'], 'T\'Challa regresa a Wakanda para asumir el trono y enfrentar un desafío al poder.')
  ],
  series: [
    demo('tt0944947', 1399, 'series', 'Game of Thrones', '2011', 9.2, ['Action', 'Adventure', 'Drama'], 'Noble familias luchan por el control de Westeros mientras un antiguo enemigo regresa.'),
    demo('tt0903747', 1396, 'series', 'Breaking Bad', '2008', 9.5, ['Crime', 'Drama', 'Thriller'], 'Un profesor de química con cáncer empieza a fabricar metanfetamina para asegurar el futuro de su familia.'),
    demo('tt1475582', 19885, 'series', 'Sherlock', '2010', 9.1, ['Crime', 'Drama', 'Mystery'], 'Un detective consultor y su compañero resuelven crímenes en el Londres actual.'),
    demo('tt2861424', 60625, 'series', 'Rick and Morty', '2013', 9.1, ['Animation', 'Adventure', 'Comedy'], 'Un científico loco y su nieto viajan por dimensiones y realidades alternativas.'),
    demo('tt4574334', 66732, 'series', 'Stranger Things', '2016', 8.6, ['Drama', 'Fantasy', 'Horror'], 'La desaparición de un niño desata eventos sobrenaturales en un pequeño pueblo.'),
    demo('tt3032476', 60059, 'series', 'Better Call Saul', '2015', 9.0, ['Crime', 'Drama'], 'Antes de conocer a Walter White, el abogado Jimmy McGill se transforma en Saul Goodman.'),
    demo('tt1520211', 1402, 'series', 'The Walking Dead', '2010', 8.1, ['Drama', 'Horror', 'Thriller'], 'Un grupo de sobrevivientes intenta mantenerse con vida en un mundo invadido por zombis.'),
    demo('tt11192306', 94605, 'series', 'Arcane', '2021', 8.7, ['Animation', 'Action', 'Adventure'], 'Dos hermanas enfrentadas luchan por sus ideales en las ciudades de Piltover y Zaun.')
  ]
};

export async function getTopMovies() {
  try {
    const items = await getCatalog('movie');
    return items.length ? items : DEMO.movies;
  } catch {
    return DEMO.movies;
  }
}

export async function getTopSeries() {
  try {
    const items = await getCatalog('series');
    return items.length ? items : DEMO.series;
  } catch {
    return DEMO.series;
  }
}

export async function searchDemo(query) {
  const q = query.toLowerCase();
  return [...DEMO.movies, ...DEMO.series].filter((item) => item.name.toLowerCase().includes(q));
}
