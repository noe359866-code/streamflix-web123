/* ============================================================
   StreamFlix — persistencia local (favoritos, preferencias, servidores)
   ============================================================ */

const FAVORITES_KEY = 'streamflix.favorites.v1';
const PREFS_KEY = 'streamflix.prefs.v1';
const CUSTOM_PROVIDERS_KEY = 'streamflix.custom-providers.v1';
const CONTINUE_KEY = 'streamflix.continue.v1';

const DEFAULT_PREFS = {
  defaultServer: 'playlatinsrc',
  subsLang: 'es'
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento lleno o bloqueado: se ignora */
  }
}

/* ---------------- Favoritos ---------------- */

export function getFavorites() {
  const list = read(FAVORITES_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function isFavorite(id) {
  return getFavorites().some((item) => item.id === id);
}

export function toggleFavorite(item) {
  const favorites = getFavorites();
  const index = favorites.findIndex((entry) => entry.id === item.id);

  if (index >= 0) {
    favorites.splice(index, 1);
    write(FAVORITES_KEY, favorites);
    return false;
  }

  favorites.unshift({
    id: item.id,
    type: item.type,
    name: item.name,
    year: item.year || '',
    rating: Number(item.rating || 0),
    poster: item.poster || '',
    genres: Array.isArray(item.genres) ? item.genres : []
  });
  write(FAVORITES_KEY, favorites);
  return true;
}

/* ---------------- Continuar viendo ---------------- */

export function getContinueWatching() {
  const list = read(CONTINUE_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveContinueWatching(entry) {
  const list = getContinueWatching().filter(
    (item) => !(item.id === entry.id && item.type === entry.type)
  );
  list.unshift({ ...entry, updatedAt: Date.now() });
  write(CONTINUE_KEY, list.slice(0, 20));
  return list;
}

/* ---------------- Preferencias ---------------- */

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...read(PREFS_KEY, {}) };
}

export function savePrefs(patch = {}) {
  const next = { ...getPrefs(), ...patch };
  write(PREFS_KEY, next);
  return next;
}

/* ---------------- Servidores personalizados ---------------- */

export function getCustomProviders() {
  const list = read(CUSTOM_PROVIDERS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function addCustomProvider(provider) {
  const list = getCustomProviders();
  list.unshift(provider);
  write(CUSTOM_PROVIDERS_KEY, list);
  return list;
}

export function deleteCustomProvider(id) {
  const list = getCustomProviders().filter((provider) => provider.id !== id);
  write(CUSTOM_PROVIDERS_KEY, list);
  return list;
}
