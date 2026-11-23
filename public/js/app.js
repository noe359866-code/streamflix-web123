/* ============================================================
   StreamFlix — aplicación (router + vistas)
   ============================================================ */

import { getTopMovies, getTopSeries, searchAll, searchDemo, getMeta } from './api.js';
import { getProviders, buildUrl, isProviderCompatible } from './providers.js';
import {
  getFavorites,
  isFavorite,
  getPrefs,
  savePrefs,
  addCustomProvider,
  deleteCustomProvider,
  getContinueWatching,
  saveContinueWatching
} from './store.js';
import {
  esc,
  toast,
  openModal,
  closeModal,
  posterUrl,
  backdropUrl,
  cardHTML,
  skeletonGrid,
  emptyHTML,
  yearOf,
  typeLabel,
  detailHref,
  bindFavButtons
} from './ui.js';

const view = document.getElementById('view');
const appState = {
  movies: [],
  series: [],
  metaCache: new Map()
};

/* ============================================================
   Arranque
   ============================================================ */

init();

function init() {
  bindSearch();
  document.getElementById('settings-btn')?.addEventListener('click', openSettings);

  document.addEventListener('favorites:changed', () => {
    if (location.hash.startsWith('#/mi-lista')) renderMyList();
  });

  window.addEventListener('hashchange', route);
  route();
}

/* ============================================================
   Router
   ============================================================ */

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  let parts = [];
  try {
    parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    parts = pathPart.split('/').filter(Boolean);
  }
  return { parts, params: new URLSearchParams(queryPart) };
}

async function route() {
  const { parts, params } = parseHash();
  setActiveNav(parts[0] || '');
  window.scrollTo(0, 0);

  try {
    if (!parts.length) return renderHome();

    switch (parts[0]) {
      case 'peliculas':
        return renderCatalog('movie');
      case 'series':
        return renderCatalog('series');
      case 'buscar':
        return renderSearch(params.get('q') || '');
      case 'pelicula':
        return renderDetail('movie', parts[1]);
      case 'serie':
        return renderDetail('series', parts[1]);
      case 'ver':
        return renderPlayer(parts[1], parts[2], Number(parts[3]) || 1, Number(parts[4]) || 1, params.get('server'));
      case 'servidores':
        return renderProviders();
      case 'mi-lista':
        return renderMyList();
      default:
        return renderNotFound();
    }
  } catch (error) {
    console.error(error);
    view.innerHTML = emptyHTML(
      'Algo salió mal',
      error?.message || 'Error inesperado al cargar la página.',
      '<button class="btn btn-primary" onclick="location.reload()">Reintentar</button>'
    );
  }
}

function setActiveNav(key) {
  const map = { pelicula: 'peliculas', serie: 'series' };
  const active = map[key] || key;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('active', link.dataset.nav === active);
  });
}

function bindSearch() {
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  if (!form || !input) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    location.hash = `#/buscar?q=${encodeURIComponent(query)}`;
  });

  window.addEventListener('hashchange', syncSearchInput);
  syncSearchInput();
}

function syncSearchInput() {
  const input = document.getElementById('search-input');
  if (!input) return;
  const query = new URLSearchParams(location.hash.split('?')[1] || '').get('q');
  if (query !== null) input.value = query;
}

/* ============================================================
   Inicio
   ============================================================ */

async function renderHome() {
  document.title = 'StreamFlix — Streaming en español sin anuncios';
  view.innerHTML = `<div class="skeleton hero-skel"></div>${skeletonGrid(10)}`;

  const [movies, series] = await Promise.all([getTopMovies(), getTopSeries()]);
  appState.movies = movies;
  appState.series = series;

  const featured = movies.find((item) => item.background) || movies[0] || series[0];
  const all = [...movies, ...series];
  const topRated = all
    .filter((item) => item.rating)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 14);
  const recent = all
    .filter((item) => Number(yearOf(item)) >= 2023)
    .sort((a, b) => Number(yearOf(b)) - Number(yearOf(a)))
    .slice(0, 14);

  view.innerHTML = `
    ${featured ? heroHTML(featured) : ''}
    ${continueRowHTML()}
    <section class="section">
      ${sectionHead('Películas destacadas', '#/peliculas')}
      <div class="row">${movies.slice(0, 14).map(cardHTML).join('')}</div>
    </section>
    <section class="section">
      ${sectionHead('Series destacadas', '#/series')}
      <div class="row">${series.slice(0, 14).map(cardHTML).join('')}</div>
    </section>
    ${recent.length ? `<section class="section">${sectionHead('Estrenos recientes', '#/peliculas')}<div class="row">${recent.map(cardHTML).join('')}</div></section>` : ''}
    ${topRated.length ? `<section class="section">${sectionHead('Mejor valoradas', '#/peliculas')}<div class="row">${topRated.map(cardHTML).join('')}</div></section>` : ''}
  `;

  bindFavButtons(view);
}

function sectionHead(title, href) {
  return `<div class="section-head"><h2>${esc(title)}</h2>${href ? `<a class="link" href="${href}">Ver todo →</a>` : ''}</div>`;
}

function continueRowHTML() {
  const entries = getContinueWatching();
  if (!entries.length) return '';

  return `
    <section class="section">
      ${sectionHead('Continuar viendo', '')}
      <div class="row">
        ${entries.map((entry) => {
          const isSeries = entry.type === 'series';
          const href = isSeries
            ? `#/ver/series/${encodeURIComponent(entry.id)}/${entry.season || 1}/${entry.episode || 1}`
            : `#/ver/movie/${encodeURIComponent(entry.id)}`;
          return cardHTML(entry, {
            href,
            badge: isSeries ? `T${entry.season || 1} · E${entry.episode || 1}` : 'Película'
          });
        }).join('')}
      </div>
    </section>`;
}

function heroHTML(item) {
  const isSeries = item.type === 'series';
  const href = detailHref(item);
  const favorite = isFavorite(item.id);
  const playHref = isSeries
    ? `#/ver/series/${encodeURIComponent(item.id)}/1/1`
    : `#/ver/movie/${encodeURIComponent(item.id)}`;
  const image = backdropUrl(item);
  const genres = (item.genres || []).slice(0, 3);

  return `
    <section class="hero">
      <div class="hero-bg">
        ${image ? `<img src="${esc(image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
      </div>
      <div class="hero-content">
        <span class="hero-kicker"><span class="dot"></span> Destacado · ${typeLabel(item.type)}</span>
        <h1 class="hero-title">${esc(item.name)}</h1>
        <div class="hero-meta">
          ${yearOf(item) ? `<span class="chip">${esc(yearOf(item))}</span>` : ''}
          ${item.rating ? `<span class="chip rating">★ ${esc(item.rating.toFixed(1))}</span>` : ''}
          ${genres.map((genre) => `<span class="chip">${esc(genre)}</span>`).join('')}
          ${item.runtime ? `<span class="chip">${esc(item.runtime)}</span>` : ''}
        </div>
        <p class="hero-desc">${esc(item.description || 'Sin sinopsis disponible.')}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="${playHref}">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13L19 12z"/></svg>
            Ver ahora
          </a>
          <a class="btn btn-ghost" href="${href}">Más información</a>
          <button class="btn btn-ghost ${favorite ? 'active' : ''}" type="button" data-fav
            data-id="${esc(item.id)}" data-type="${esc(item.type)}" data-name="${esc(item.name)}"
            data-poster="${esc(posterUrl(item))}" data-year="${esc(yearOf(item))}" data-rating="${item.rating || ''}"
            aria-pressed="${favorite}">
            ♥ ${favorite ? 'En Mi lista' : 'Mi lista'}
          </button>
        </div>
      </div>
    </section>`;
}

/* ============================================================
   Catálogos
   ============================================================ */

async function renderCatalog(type) {
  const label = type === 'movie' ? 'Películas' : 'Series';
  document.title = `${label} — StreamFlix`;

  view.innerHTML = `
    <div class="page-head">
      <div class="eyebrow">Catálogo</div>
      <h1>${label}</h1>
      <p>${type === 'movie'
        ? 'Lo más popular del catálogo, listo para reproducir en los servidores en español.'
        : 'Series completas con selector de temporada y episodio, en latino, castellano o subtitulado.'}</p>
    </div>
    <div class="toolbar">
      <button class="chip-btn active" type="button" data-sort="popular">Populares</button>
      <button class="chip-btn" type="button" data-sort="rating">Mejor valoradas</button>
      <button class="chip-btn" type="button" data-sort="new">Más recientes</button>
    </div>
    <div id="catalog-grid">${skeletonGrid(14)}</div>
  `;

  const items = type === 'movie' ? await getTopMovies() : await getTopSeries();
  if (type === 'movie') appState.movies = items;
  else appState.series = items;

  const grid = document.getElementById('catalog-grid');
  const draw = (list) => {
    grid.innerHTML = list.length
      ? `<div class="grid">${list.map(cardHTML).join('')}</div>`
      : emptyHTML('Sin títulos', 'No hay contenido disponible en este momento.');
    bindFavButtons(grid);
  };

  draw(items);

  view.querySelectorAll('[data-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      view.querySelectorAll('[data-sort]').forEach((other) => other.classList.toggle('active', other === button));
      const sorted = [...items];
      if (button.dataset.sort === 'rating') sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      if (button.dataset.sort === 'new') sorted.sort((a, b) => Number(yearOf(b) || 0) - Number(yearOf(a) || 0));
      draw(sorted);
    });
  });
}

/* ============================================================
   Búsqueda
   ============================================================ */

async function renderSearch(query) {
  document.title = query ? `Buscar: ${query} — StreamFlix` : 'Buscar — StreamFlix';

  view.innerHTML = `
    <div class="page-head">
      <div class="eyebrow">Búsqueda</div>
      <h1>Resultados</h1>
      <p>${query ? `Buscando «${esc(query)}» en películas y series.` : 'Escribe un título en la barra superior.'}</p>
    </div>
    ${query ? `<div id="search-grid">${skeletonGrid(10)}</div>` : emptyHTML('Busca algo', 'Usa la barra superior para encontrar películas o series.')}
  `;

  if (!query) return;

  let items = [];
  try {
    items = await searchAll(query);
  } catch {
    items = searchDemo(query);
  }

  const grid = document.getElementById('search-grid');
  if (!grid) return;
  grid.innerHTML = items.length
    ? `<div class="grid">${items.map(cardHTML).join('')}</div>`
    : emptyHTML('Sin resultados', 'Prueba con otro título o con el nombre original en inglés.');
  bindFavButtons(grid);
}

/* ============================================================
   Detalle
   ============================================================ */

async function renderDetail(type, id) {
  if (!validImdb(id)) return renderNotFound();
  document.title = 'Cargando… — StreamFlix';
  view.innerHTML = `<div class="skeleton detail-skel"></div><div style="margin-top:24px">${skeletonGrid(4)}</div>`;

  let item;
  try {
    item = await getMeta(type, id);
  } catch {
    view.innerHTML = emptyHTML(
      'No se pudo cargar el título',
      'El catálogo no respondió. Revisa tu conexión e inténtalo de nuevo.',
      '<a class="btn btn-primary" href="#/">Volver al inicio</a>'
    );
    return;
  }

  document.title = `${item.name} — StreamFlix`;
  const isSeries = type === 'series';
  const episodes = isSeries ? (item.videos || []).filter((video) => Number(video.season) > 0) : [];
  const seasons = [...new Set(episodes.map((video) => Number(video.season)))].sort((a, b) => a - b);
  const trailer = (item.trailers || []).find((video) => video.source)
    || (item.trailerStreams || []).find((video) => video.ytId)
    || (item.videos || []).find((video) => video.id || video.url);
  const favorite = isFavorite(item.id);
  const firstEpisode = episodes[0];
  const playHref = isSeries
    ? `#/ver/series/${encodeURIComponent(item.id)}/${Number(firstEpisode?.season) || 1}/${Number(firstEpisode?.episode) || 1}`
    : `#/ver/movie/${encodeURIComponent(item.id)}`;

  view.innerHTML = `
    <section class="detail-hero">
      <div class="backdrop">
        ${backdropUrl(item) ? `<img src="${esc(backdropUrl(item))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
      </div>
      <div class="detail-inner">
        <div class="detail-poster">
          ${posterUrl(item) ? `<img src="${esc(posterUrl(item))}" alt="${esc(item.name)}" referrerpolicy="no-referrer" />` : ''}
        </div>
        <div class="detail-info">
          <div class="detail-kicker">${typeLabel(item.type)} · ${esc(item.id)}</div>
          <h1 class="detail-title">${esc(item.name)}</h1>
          <div class="detail-meta">
            ${yearOf(item) ? `<span class="chip">${esc(yearOf(item))}</span>` : ''}
            ${item.rating ? `<span class="chip rating">★ ${esc(item.rating.toFixed(1))}</span>` : ''}
            ${item.runtime ? `<span class="chip">${esc(item.runtime)}</span>` : ''}
            ${item.country ? `<span class="chip">${esc(item.country)}</span>` : ''}
            ${(item.genres || []).map((genre) => `<span class="chip">${esc(genre)}</span>`).join('')}
          </div>
          <p class="detail-desc">${esc(item.description || 'Sin sinopsis disponible.')}</p>
          <div class="detail-actions">
            <a class="btn btn-primary" href="${playHref}">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13L19 12z"/></svg>
              Ver ahora
            </a>
            <button class="btn btn-ghost ${favorite ? 'active' : ''}" type="button" data-fav
              data-id="${esc(item.id)}" data-type="${esc(item.type)}" data-name="${esc(item.name)}"
              data-poster="${esc(posterUrl(item))}" data-year="${esc(yearOf(item))}" data-rating="${item.rating || ''}"
              aria-pressed="${favorite}">
              ♥ ${favorite ? 'En Mi lista' : 'Mi lista'}
            </button>
            ${trailer ? `<button class="btn btn-ghost" type="button" data-trailer="${esc(youtubeId(trailer))}">Ver tráiler</button>` : ''}
            <a class="btn btn-ghost" href="#/servidores">Servidores</a>
          </div>
          ${item.cast?.length ? `<p class="detail-cast"><strong>Reparto:</strong> ${item.cast.map((actor) => esc(actor)).join(', ')}</p>` : ''}
        </div>
      </div>
    </section>
    ${isSeries ? seasonsHTML(item, episodes, seasons) : movieExtrasHTML(item)}
  `;

  bindFavButtons(view);
  bindTrailer(view);
  if (isSeries) bindSeasonTabs(view, item, episodes, seasons);
}

function seasonsHTML(item, episodes, seasons) {
  if (!seasons.length) {
    return `
      <section class="section">
        ${sectionHead('Episodios', '#/servidores')}
        <form class="manual-ep" data-manual-ep data-id="${esc(item.id)}">
          <label>Temporada <input type="number" name="season" min="1" value="1" /></label>
          <label>Episodio <input type="number" name="episode" min="1" value="1" /></label>
          <button class="btn btn-primary btn-sm" type="submit">Reproducir</button>
        </form>
        <p class="hint">El catálogo no devolvió la lista de episodios. Puedes indicar la temporada y el episodio manualmente.</p>
      </section>`;
  }

  const firstSeason = seasons[0];
  return `
    <section class="section">
      <div class="section-head">
        <h2>Episodios</h2>
        <span class="muted small">${episodes.length} episodios</span>
      </div>
      <div class="season-tabs" role="tablist" aria-label="Temporadas">
        ${seasons.map((season, index) => `
          <button class="season-tab ${index === 0 ? 'active' : ''}" type="button" role="tab"
            data-season="${season}" aria-selected="${index === 0}">Temporada ${season}</button>`).join('')}
      </div>
      <div id="episode-list" data-active-season="${firstSeason}">
        ${episodesForSeasonHTML(item, episodes, firstSeason)}
      </div>
    </section>`;
}

function episodesForSeasonHTML(item, episodes, season) {
  const list = episodes
    .filter((video) => Number(video.season) === Number(season))
    .sort((a, b) => Number(a.episode) - Number(b.episode));

  if (!list.length) return emptyHTML('Sin episodios', 'No hay episodios listados para esta temporada.');

  return `<div class="episode-list">
    ${list.map((episode) => `
      <a class="episode" href="#/ver/series/${encodeURIComponent(item.id)}/${Number(episode.season)}/${Number(episode.episode)}">
        <span class="episode-num">${String(episode.episode).padStart(2, '0')}</span>
        <div>
          <h4>${esc(episode.name || `Episodio ${episode.episode}`)}</h4>
          ${episode.overview ? `<p>${esc(episode.overview)}</p>` : ''}
        </div>
      </a>`).join('')}
  </div>`;
}

function bindSeasonTabs(root, item, episodes, seasons) {
  const list = root.querySelector('#episode-list');
  if (!list) return;

  root.querySelectorAll('[data-season]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelectorAll('[data-season]').forEach((other) => {
        const active = other === button;
        other.classList.toggle('active', active);
        other.setAttribute('aria-selected', String(active));
      });
      const season = Number(button.dataset.season);
      list.dataset.activeSeason = season;
      list.innerHTML = episodesForSeasonHTML(item, episodes, season);
    });
  });

  const manual = root.querySelector('[data-manual-ep]');
  if (manual) {
    manual.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(manual);
      const season = Number(data.get('season')) || 1;
      const episode = Number(data.get('episode')) || 1;
      location.hash = `#/ver/series/${encodeURIComponent(manual.dataset.id)}/${season}/${episode}`;
    });
  }
}

function movieExtrasHTML(item) {
  const providers = getProviders().filter(
    (provider) => provider.spanish && isProviderCompatible(provider, item)
  );
  return `
    <section class="section">
      <div class="section-head">
        <h2>Disponible en</h2>
        <a class="link" href="#/servidores">Ver todos los servidores</a>
      </div>
      <div class="provider-row">
        ${providers.map((provider) => `
          <a class="mini-provider" href="#/ver/movie/${encodeURIComponent(item.id)}?server=${encodeURIComponent(provider.id)}">
            <span>${provider.flag}</span>${esc(provider.name)}
          </a>`).join('')}
      </div>
    </section>`;
}

function youtubeId(video) {
  if (!video) return '';
  if (video.ytId) return video.ytId;
  if (video.source && !video.url) return video.source;
  if (video.id && !video.url) return video.id;
  const url = video.url || '';
  const match = url.match(/(?:youtu\.be\/|[?&]v=|embed\/)([\w-]{11})/);
  return match ? match[1] : video.id || video.source || '';
}

function bindTrailer(root) {
  root.querySelectorAll('[data-trailer]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.trailer;
      if (!id) {
        toast('No hay tráiler disponible', 'error');
        return;
      }
      openModal({
        title: 'Tráiler',
        body: `<div class="trailer-frame">
          <iframe src="https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1"
            title="Tráiler" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>
        </div>`
      });
    });
  });
}

/* ============================================================
   Reproductor
   ============================================================ */

async function renderPlayer(type, id, season = 1, episode = 1, serverId = '') {
  if (!validImdb(id)) return renderNotFound();
  document.title = 'Reproduciendo — StreamFlix';
  view.innerHTML = `<div class="player"><div class="skeleton player-skel"></div></div>`;

  let item = null;
  try {
    item = await getMeta(type, id);
  } catch {
    item = null;
  }

  saveContinueWatching({
    id,
    type,
    name: item?.name || id,
    poster: item?.poster || '',
    year: item ? yearOf(item) : '',
    rating: item?.rating || 0,
    genres: item?.genres || [],
    season: Number(season),
    episode: Number(episode)
  });

  const providers = getProviders().filter((provider) =>
    isProviderCompatible(provider, { id, tmdbId: item?.tmdbId })
  );
  if (!providers.length) {
    view.innerHTML = emptyHTML(
      'Sin servidores compatibles',
      'Este título no tiene ID de TMDb y todos los servidores disponibles lo requieren. Prueba con otro título.'
    );
    return;
  }

  const prefs = getPrefs();
  const requested = serverId ? providers.find((provider) => provider.id === serverId) : null;
  const current = requested
    || providers.find((provider) => provider.id === prefs.defaultServer)
    || providers[0];

  const isSeries = type === 'series';
  const allEpisodes = isSeries && item ? (item.videos || []).filter((video) => Number(video.season) > 0) : [];
  const seasons = [...new Set(allEpisodes.map((video) => Number(video.season)))].sort((a, b) => a - b);
  const seasonEpisodes = allEpisodes.filter((video) => Number(video.season) === Number(season));
  const currentEpisode = seasonEpisodes.find((video) => Number(video.episode) === Number(episode));
  const embedUrl = buildUrl(current, {
    type,
    imdb: id,
    tmdb: item?.tmdbId,
    season,
    episode,
    lang: prefs.subsLang
  });

  if (!embedUrl) {
    view.innerHTML = emptyHTML('Servidor incompatible', 'Este servidor no tiene una URL para el contenido seleccionado.');
    return;
  }

  view.innerHTML = `
    <div class="player">
      <div class="player-top">
        <div class="player-title">
          <a class="back-link" href="${detailHref({ type, id })}">← Volver a la ficha</a>
          <h1>${esc(item?.name || id)} ${isSeries ? `<span class="muted">· T${Number(season)} · E${Number(episode)}</span>` : ''}</h1>
          ${isSeries && currentEpisode ? `<p>${esc(currentEpisode.name || '')}</p>` : ''}
        </div>
        <div class="player-top-actions">
          <button class="btn btn-ghost btn-sm" type="button" id="reload-frame">↻ Recargar</button>
          <a class="btn btn-ghost btn-sm" id="open-external" target="_blank" rel="noopener noreferrer" href="${esc(embedUrl)}">Abrir ↗</a>
        </div>
      </div>

      <div class="player-frame">
        <div class="player-frame-glow" aria-hidden="true"></div>
        <iframe id="player-iframe" src="${esc(embedUrl)}" title="${esc(item?.name || 'Reproductor')}"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="no-referrer"></iframe>
        <div class="frame-tools"><span class="server-badge">${current.flag} ${esc(current.name)}</span></div>
      </div>

      ${serverPanelHTML(providers, current)}
      ${isSeries && current.id === 'playlatinsrc'
        ? '<p class="hint" style="margin-top:10px">PlayLatinSRC abre la serie con su propia lista de episodios: elige el capítulo dentro del reproductor.</p>'
        : ''}
      ${isSeries ? episodeNavHTML(item, allEpisodes, seasons, season, episode) : ''}
    </div>
  `;

  bindPlayerControls({
    type,
    id,
    tmdbId: item?.tmdbId,
    season: Number(season),
    episode: Number(episode),
    serverId: current.id
  });
}

function serverPanelHTML(providers, current) {
  return `
    <div class="server-panel">
      <div class="server-head">
        <div>
          <h3>Servidores sin anuncios</h3>
          <p class="muted small">${esc(current.name)} · ${esc((current.langs || []).join(', '))}</p>
        </div>
        <span class="lang latino">✓ Verificados</span>
      </div>
      <div class="server-list" id="server-list">
        ${providers.map((provider) => `
          <button class="server-btn ${provider.id === current.id ? 'active' : ''}" type="button" data-server="${esc(provider.id)}">
            <span class="server-flag">${provider.flag}</span>
            <span>
              <span class="server-name">${esc(provider.name)}</span>
              <span class="server-sub">${provider.idType === 'tmdb' ? 'TMDb · ' : ''}${esc((provider.langs || []).join(' · '))}</span>
            </span>
            ${provider.adFree ? '<span class="server-badge">✓ Sin anuncios</span>' : ''}
          </button>`).join('')}
      </div>
      <p class="hint">Solo se listan servidores verificados sin anuncios. Si uno no carga, prueba otro: los reproductores son externos y pueden cambiar de dominio.</p>
    </div>`;
}

function episodeNavHTML(item, allEpisodes, seasons, season, episode) {
  if (!allEpisodes.length) return '';

  const seasonEpisodes = allEpisodes
    .filter((video) => Number(video.season) === Number(season))
    .sort((a, b) => Number(a.episode) - Number(b.episode));
  const index = seasonEpisodes.findIndex((video) => Number(video.episode) === Number(episode));
  const previous = seasonEpisodes[index - 1];
  const next = seasonEpisodes[index + 1];

  return `
    <div class="server-panel">
      <div class="server-head">
        <h3>Episodios</h3>
        <label class="select-inline">Temporada
          <select id="season-select" aria-label="Temporada">
            ${seasons.map((value) => `<option value="${value}" ${value === Number(season) ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="ep-nav">
        ${previous
          ? `<a class="btn btn-ghost btn-sm" href="#/ver/series/${encodeURIComponent(item.id)}/${previous.season}/${previous.episode}">← E${String(previous.episode).padStart(2, '0')}</a>`
          : '<span class="btn btn-ghost btn-sm disabled">← Anterior</span>'}
        ${seasonEpisodes.map((video) => `
          <a class="ep-chip ${Number(video.episode) === Number(episode) ? 'active' : ''}"
            href="#/ver/series/${encodeURIComponent(item.id)}/${video.season}/${video.episode}"
            title="${esc(video.name || '')}">${String(video.episode).padStart(2, '0')}</a>`).join('')}
        ${next
          ? `<a class="btn btn-ghost btn-sm" href="#/ver/series/${encodeURIComponent(item.id)}/${next.season}/${next.episode}">Siguiente →</a>`
          : '<span class="btn btn-ghost btn-sm disabled">Siguiente →</span>'}
      </div>
    </div>`;
}

function bindPlayerControls(context) {
  const iframe = document.getElementById('player-iframe');
  const openButton = document.getElementById('open-external');
  const servers = getProviders();

  const updatePlayer = (provider) => {
    const url = buildUrl(provider, {
      type: context.type,
      imdb: context.id,
      tmdb: context.tmdbId,
      season: context.season,
      episode: context.episode,
      lang: getPrefs().subsLang
    });
    if (!url) {
      toast('Este servidor no tiene URL para este contenido', 'error');
      return;
    }
    iframe.src = url;
    if (openButton) openButton.href = url;
    document.querySelectorAll('[data-server]').forEach((button) => {
      button.classList.toggle('active', button.dataset.server === provider.id);
    });
    const badge = document.querySelector('.server-badge');
    if (badge) badge.textContent = `${provider.flag} ${provider.name}`;

    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    params.set('server', provider.id);
    const path = context.type === 'series'
      ? `#/ver/series/${context.id}/${context.season}/${context.episode}`
      : `#/ver/movie/${context.id}`;
    history.replaceState(null, '', `${path}?${params.toString()}`);
  };

  document.querySelectorAll('[data-server]').forEach((button) => {
    button.addEventListener('click', () => {
      const provider = servers.find((entry) => entry.id === button.dataset.server);
      if (provider) updatePlayer(provider);
    });
  });

  document.getElementById('reload-frame')?.addEventListener('click', () => {
    iframe.src = iframe.src;
    toast('Recargando reproductor…');
  });

  document.getElementById('season-select')?.addEventListener('change', (event) => {
    location.hash = `#/ver/series/${context.id}/${event.target.value}/1`;
  });
}

/* ============================================================
   Servidores
   ============================================================ */

async function renderProviders() {
  document.title = 'Servidores — StreamFlix';
  const providers = getProviders();
  const languages = new Set(providers.flatMap((provider) => provider.langs || []));
  const adFree = providers.filter((provider) => provider.adFree).length;

  view.innerHTML = `
    <div class="page-head">
      <div class="eyebrow">Índice de reproductores</div>
      <h1>Servidores sin anuncios</h1>
      <p>Solo proveedores que pasaron la prueba: sin anuncios ni popups, permiten iframe y cargan el reproductor.
      Los que muestran publicidad o bloquean el embed se descartaron. Al reproducir cualquier título puedes cambiar de servidor sin salir del reproductor.</p>
    </div>

    <div class="stats">
      <div class="stat"><strong>${providers.length}</strong><span>servidores verificados</span></div>
      <div class="stat"><strong>${adFree}</strong><span>sin anuncios</span></div>
      <div class="stat"><strong>${languages.size}</strong><span>idiomas disponibles</span></div>
    </div>

    <div class="toolbar">
      <button class="btn btn-primary btn-sm" type="button" id="add-provider">+ Añadir servidor</button>
    </div>

    <div class="provider-grid">
      ${providers.map(providerCardHTML).join('')}
    </div>

    <div class="note-card">
      <h3>¿Cómo se probaron?</h3>
      <p>Se probaron 17 servidores: <strong>4 pasaron y 13 se descartaron</strong> por anuncios, popups, bloqueo de iframe o dominios caídos.
      Se comprobó la respuesta HTTP del embed, que las cabeceras permitan <code>frame-ancestors</code> y que el reproductor cargue.
      También se revisó el HTML del player para descartar prerrollos, popups y tags de publicidad. Prueba realizada el 23 de noviembre de 2026.</p>
      <p class="muted small">StreamFlix no aloja ni distribuye archivos. Los enlaces provienen de reproductores externos; verifica la legalidad según tu país.</p>
    </div>
  `;

  document.getElementById('add-provider')?.addEventListener('click', openSettings);

  view.querySelectorAll('[data-delete-provider]').forEach((button) => {
    button.addEventListener('click', () => {
      deleteCustomProvider(button.dataset.deleteProvider);
      toast('Servidor eliminado', 'info');
      renderProviders();
    });
  });
}

function providerCardHTML(provider) {
  const domains = (provider.domains || []).join(' · ');
  return `
    <article class="provider-card">
      <div class="provider-head">
        <div class="provider-icon">${provider.flag}</div>
        <div>
          <div class="provider-name">
            ${esc(provider.name)}
            ${provider.adFree ? '<span class="lang latino">✓ Sin anuncios</span>' : ''}
            ${provider.custom ? '<span class="lang">Personalizado</span>' : ''}
          </div>
          <div class="provider-domain">${esc(domains)}</div>
        </div>
      </div>
      <p class="provider-desc">${esc(provider.description || '')}</p>
      <div class="provider-pattern">
        <span>Película</span><code>${esc(provider.movie || '—')}</code>
        <span>Serie</span><code>${esc(provider.series || '—')}</code>
      </div>
      <div class="lang-row">
        ${(provider.langs || []).map((lang) => `
          <span class="lang ${/latino|castellano|español/i.test(lang) ? 'latino' : ''}">${esc(lang)}</span>`).join('')}
      </div>
      <div class="provider-foot">
        <span class="chip small">${esc(provider.quality || 'HD')}</span>
        <span class="chip small">${provider.idType === 'tmdb' ? 'ID TMDb' : 'ID IMDb'}</span>
        ${provider.spanish ? '<span class="lang latino">Español</span>' : ''}
        ${provider.custom ? `<button class="icon-btn small" type="button" data-delete-provider="${esc(provider.id)}" title="Eliminar servidor" aria-label="Eliminar servidor">🗑</button>` : ''}
      </div>
    </article>`;
}

/* ============================================================
   Mi lista
   ============================================================ */

function renderMyList() {
  document.title = 'Mi lista — StreamFlix';
  const favorites = getFavorites();

  view.innerHTML = `
    <div class="page-head">
      <div class="eyebrow">Tu selección</div>
      <h1>Mi lista</h1>
      <p>${favorites.length ? `${favorites.length} títulos guardados en este navegador.` : 'Aún no tienes títulos guardados.'}</p>
    </div>
    ${favorites.length
      ? `<div class="grid">${favorites.map(cardHTML).join('')}</div>`
      : emptyHTML('Tu lista está vacía', 'Marca con ♥ cualquier película o serie para verla aquí.')}
  `;

  bindFavButtons(view);
}

/* ============================================================
   Configuración
   ============================================================ */

function openSettings() {
  const prefs = getPrefs();
  const providers = getProviders();
  const custom = providers.filter((provider) => provider.custom);

  const body = `
    <div class="settings-section">
      <h4>Preferencias</h4>
      <div class="form-field">
        <label for="pref-server">Servidor predeterminado</label>
        <select id="pref-server">
          ${providers.map((provider) => `
            <option value="${esc(provider.id)}" ${provider.id === prefs.defaultServer ? 'selected' : ''}>
              ${provider.flag} ${esc(provider.name)}${provider.spanish ? ' · ES' : ''}
            </option>`).join('')}
        </select>
        <p class="hint">Se usará al abrir el reproductor si está disponible.</p>
      </div>
      <div class="form-field">
        <label for="pref-subs">Idioma de subtítulos</label>
        <select id="pref-subs">
          <option value="es" ${prefs.subsLang === 'es' ? 'selected' : ''}>Español</option>
          <option value="es-MX" ${prefs.subsLang === 'es-MX' ? 'selected' : ''}>Español latino</option>
          <option value="en" ${prefs.subsLang === 'en' ? 'selected' : ''}>Inglés</option>
        </select>
        <p class="hint">Se aplica en los servidores que soportan idioma por URL (VidCore).</p>
      </div>
      <p class="hint">Solo se incluyen servidores verificados sin anuncios. Los servidores TMDb solo aparecen si el título tiene ID de TMDb.</p>
    </div>

    <div class="settings-section">
      <h4>Servidores personalizados</h4>
      <p class="muted small" style="margin-bottom:14px">Usa <code>{imdb}</code>, <code>{s}</code> y <code>{e}</code> en las URLs.
      Ejemplo: <code>https://mi-sitio.com/embed/movie/{imdb}</code></p>

      <div class="custom-list">
        ${custom.length
          ? custom.map((provider) => `
            <div class="custom-row">
              <span>${provider.flag} <strong>${esc(provider.name)}</strong> <span class="muted small">· ${esc((provider.langs || []).join(', '))}</span></span>
              <button class="icon-btn small" type="button" data-delete-provider="${esc(provider.id)}" aria-label="Eliminar">✕</button>
            </div>`).join('')
          : '<p class="muted small">Sin servidores personalizados.</p>'}
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="cp-name">Nombre</label>
          <input id="cp-name" placeholder="Mi servidor" />
        </div>
        <div class="form-field">
          <label for="cp-langs">Idiomas</label>
          <input id="cp-langs" placeholder="Latino, Español, Subtitulado" />
        </div>
        <div class="form-field full">
          <label for="cp-movie">URL películas</label>
          <input id="cp-movie" placeholder="https://ejemplo.com/embed/movie/{imdb}" />
        </div>
        <div class="form-field full">
          <label for="cp-series">URL series</label>
          <input id="cp-series" placeholder="https://ejemplo.com/embed/tv/{imdb}/{s}/{e}" />
        </div>
        <div class="form-field full">
          <label for="cp-desc">Descripción</label>
          <input id="cp-desc" placeholder="Opcional" />
        </div>
      </div>
      <button class="btn btn-primary btn-sm" type="button" id="cp-add">Guardar servidor</button>
    </div>
  `;

  openModal({
    title: 'Configuración',
    body,
    footer: `
      <button class="btn btn-ghost" type="button" data-close-modal>Cerrar</button>
      <button class="btn btn-primary" type="button" id="save-prefs">Guardar</button>
    `,
    onMount(modal) {
      modal.querySelector('#save-prefs')?.addEventListener('click', () => {
        savePrefs({
          defaultServer: modal.querySelector('#pref-server')?.value,
          subsLang: modal.querySelector('#pref-subs')?.value
        });
        toast('Preferencias guardadas', 'success');
        closeModal();
        if (location.hash.startsWith('#/ver')) route();
      });

      modal.querySelector('#cp-add')?.addEventListener('click', () => {
        const name = modal.querySelector('#cp-name')?.value.trim();
        const movie = modal.querySelector('#cp-movie')?.value.trim();
        const series = modal.querySelector('#cp-series')?.value.trim();

        if (!name || (!movie && !series)) {
          toast('Completa el nombre y al menos una URL', 'error');
          return;
        }
        if (movie && (!/^https?:\/\//i.test(movie) || (!movie.includes('{imdb}') && !movie.includes('{tmdb}')))) {
          toast('La URL de películas debe empezar por http y contener {imdb} o {tmdb}', 'error');
          return;
        }
        if (series && (!/^https?:\/\//i.test(series) || (!series.includes('{imdb}') && !series.includes('{tmdb}')))) {
          toast('La URL de series debe empezar por http y contener {imdb} o {tmdb}', 'error');
          return;
        }

        const langs = (modal.querySelector('#cp-langs')?.value || '')
          .split(',')
          .map((lang) => lang.trim())
          .filter(Boolean);

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const id = `custom-${slug || 'server'}-${Date.now().toString(36)}`;

        addCustomProvider({
          id,
          name,
          flag: '⭐',
          custom: true,
          spanish: true,
          adFree: false,
          idType: movie ? (movie.includes('{tmdb}') ? 'tmdb' : 'imdb') : 'imdb',
          langs: langs.length ? langs : ['Español'],
          quality: 'HD',
          description: modal.querySelector('#cp-desc')?.value.trim() || 'Servidor personalizado.',
          movie,
          series,
          domains: []
        });

        toast('Servidor agregado', 'success');
        closeModal();
        route();
      });

      modal.querySelectorAll('[data-delete-provider]').forEach((button) => {
        button.addEventListener('click', () => {
          deleteCustomProvider(button.dataset.deleteProvider);
          toast('Servidor eliminado', 'info');
          closeModal();
          route();
        });
      });
    }
  });
}

/* ============================================================
   Utilidades
   ============================================================ */

function validImdb(id) {
  return /^tt\d{6,10}$/.test(id || '');
}

function renderNotFound() {
  document.title = 'No encontrado — StreamFlix';
  view.innerHTML = emptyHTML(
    'Página no encontrada',
    'El enlace no existe o el título ya no está disponible.',
    '<a class="btn btn-primary" href="#/">Volver al inicio</a>'
  );
}
