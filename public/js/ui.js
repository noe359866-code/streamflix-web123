/* ============================================================
   StreamFlix — utilidades de interfaz
   ============================================================ */

import { isFavorite, toggleFavorite } from './store.js';

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}

export function yearOf(item) {
  return String(item?.year || item?.releaseInfo || '').split('–')[0].split('-')[0];
}

export function typeLabel(type) {
  return type === 'series' ? 'Serie' : 'Película';
}

export function detailHref(item) {
  const kind = item?.type === 'series' ? 'serie' : 'pelicula';
  return `#/${kind}/${encodeURIComponent(item.id)}`;
}

export function posterUrl(item) {
  if (!item) return '';
  return item.poster || (item.id ? `https://images.metahub.space/poster/medium/${item.id}/img` : '');
}

export function backdropUrl(item) {
  if (!item) return '';
  return item.background || (item.id ? `https://images.metahub.space/background/medium/${item.id}/img` : '');
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/* ---------------- Tarjeta de título ---------------- */

export function cardHTML(item, options = {}) {
  const favorite = isFavorite(item.id);
  const image = posterUrl(item);
  const year = yearOf(item);
  const genres = (item.genres || []).slice(0, 2).join(', ');
  const href = options.href || detailHref(item);
  const badge = options.badge || typeLabel(item.type);

  return `
    <a class="card" href="${href}" aria-label="${esc(item.name)}">
      <div class="card-poster">
        ${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
        <div class="card-fallback" aria-hidden="true"><span>${esc(initials(item.name))}</span></div>
        <span class="card-type">${esc(badge)}</span>
        ${item.rating ? `<span class="card-rating">★ ${esc(item.rating.toFixed(1))}</span>` : ''}
        <button class="fav-btn ${favorite ? 'active' : ''}" type="button" data-fav
          data-id="${esc(item.id)}" data-type="${esc(item.type)}" data-name="${esc(item.name)}"
          data-poster="${esc(image)}" data-year="${esc(year)}" data-rating="${item.rating || ''}"
          aria-label="${favorite ? 'Quitar de Mi lista' : 'Agregar a Mi lista'}" aria-pressed="${favorite}">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M12 21s-7.5-4.7-9.5-9.2C1 8.3 3 5 6.3 5c1.9 0 3.4 1.1 4.2 2.4h3C14.3 6.1 15.8 5 17.7 5 21 5 23 8.3 21.5 11.8 19.5 16.3 12 21 12 21z"/>
          </svg>
        </button>
        <div class="card-hover" aria-hidden="true"><span class="play-badge">▶</span></div>
      </div>
      <div class="card-body">
        <h3>${esc(item.name)}</h3>
        <p>${esc(year || '—')}${genres ? ' · ' + esc(genres) : ''}</p>
      </div>
    </a>`;
}

/* ---------------- Favoritos ---------------- */

export function bindFavButtons(root = document) {
  root.querySelectorAll('[data-fav]').forEach((button) => {
    if (button.dataset.favBound) return;
    button.dataset.favBound = '1';

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const item = {
        id: button.dataset.id,
        type: button.dataset.type,
        name: button.dataset.name,
        poster: button.dataset.poster,
        year: button.dataset.year,
        rating: Number(button.dataset.rating || 0),
        genres: []
      };

      const added = toggleFavorite(item);
      button.classList.toggle('active', added);
      button.setAttribute('aria-pressed', String(added));
      button.setAttribute('aria-label', added ? 'Quitar de Mi lista' : 'Agregar a Mi lista');
      toast(added ? 'Agregado a Mi lista' : 'Eliminado de Mi lista', 'success');
      document.dispatchEvent(new CustomEvent('favorites:changed'));
    });
  });
}

/* ---------------- Toasts ---------------- */

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.innerHTML = `<span class="toast-dot"></span><span>${esc(message)}</span>`;
  root.appendChild(element);

  setTimeout(() => {
    element.classList.add('out');
    setTimeout(() => element.remove(), 250);
  }, 2600);
}

/* ---------------- Modal ---------------- */

let activeEscapeHandler = null;

export function openModal({ title = '', body = '', footer = '', onMount } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  closeModal();
  root.innerHTML = `
    <div class="modal-backdrop" data-close-modal>
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="icon-btn" type="button" data-close-modal aria-label="Cerrar">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;

  root.querySelectorAll('[data-close-modal]').forEach((element) => {
    element.addEventListener('click', (event) => {
      if (event.target === element) closeModal();
    });
  });

  activeEscapeHandler = (event) => {
    if (event.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', activeEscapeHandler);

  if (onMount) onMount(root.querySelector('.modal'));
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  if (activeEscapeHandler) {
    document.removeEventListener('keydown', activeEscapeHandler);
    activeEscapeHandler = null;
  }
}

/* ---------------- Skeletons y vacíos ---------------- */

export function skeletonGrid(count = 12) {
  return `<div class="grid">${Array.from({ length: count }, () => `
    <div class="skel-card">
      <div class="skeleton skel-poster"></div>
      <div class="skeleton skel-line"></div>
      <div class="skeleton skel-line short"></div>
    </div>`).join('')}</div>`;
}

export function emptyHTML(title, message, action = '') {
  return `<div class="empty">
    <h2>${esc(title)}</h2>
    <p>${esc(message)}</p>
    ${action}
  </div>`;
}
