# 🔎 Investigación — proveedores extra (v1.3.0)

Fecha: **31 de octubre de 2026**. Método: apertura de las webs (home, buscadores,
fichas, páginas de episodio, sitemaps y REST de WordPress) y contraste con
código abierto de referencia (`Pigamer37/animeflv-stremio-addon` —rutas
`animejara.js` y PR #66 de Latanime—). El sandbox de desarrollo no tiene salida
directa a estas webs, así que la validación en vivo se hace con
`scripts/probe.js` y `/debug/*` en una red normal / despliegue.

Reglas aplicadas a la implementación: **solo `stream`**, **sin datos demo** y
**sin configurador** (todos los proveedores siempre activos).

---

## 1) AnimeJara — https://animejara.com

- **Modelo**: UNA ficha por serie con **todas las temporadas agrupadas**;
  los idiomas viven como pestañas en la página del episodio.
- **Buscador**: `GET /catalogo?q={texto}` (el parámetro es `q`, no `s`).
  Tarjetas en `#anime-results > div.anime-card-wrapper`; el enlace
  `a.anime-card` puede traer `data-anime` (JSON con título/año/póster) y las
  banderas de idioma son imágenes (`latino.png`, `japones.png`, `castellano.png`).
- **Respaldo de búsqueda**: `/anime-sitemap.xml` lista todas las fichas.
- **Ficha**: `/anime/{slug}/`.
- **Ver episodio**: `/episode/{slug}-{temporada}x{episodio}/` → por eso el
  trabajo de `idmap` conserva temporada + episodio *dentro* de la temporada
  (`multiSeason: true`).
- **Película**: `/movie/{slug}`.
- **Servidores (2 pasos)**: la página del episodio trae botones de idioma
  `cambiarIdioma(i)` / `cambiarIdiomaMovie(i)` y un script con
  `const enlaces = [...]` (o `movieLinks`). Cada enlace abre una página
  intermedia cuyos botones `#logo-list > li` llaman `playVideo("URL")` con el
  nombre en `.nombre-server`. Algunos `playVideo` envuelven el destino en
  `go.php?v=...`; solo se desenrolla si el interior es una URL http.
- **Idiomas observados**: Latino, Japonés (= Subtitulado) y Castellano,
  también en filas de descarga por idioma.
- **Dead-end**: la REST de WordPress `/wp-json/wp/v2/search` devolvió `[]`:
  no sirve como buscador de series.

## 2) Latanime — https://latanime.org

- **Modelo**: **fichas separadas por idioma** (Latino / Castellano / Sub),
  pero con nombres inconsistentes: el sufijo del slug no siempre basta, así
  que el idioma se decide primero por el **título/tarjeta** y luego por el slug.
- **Buscador**: `GET /buscar?q={texto}` (confirmado en producción; los
  parámetros `?buscar=`, `?search=`, `?q=` sobre `/animes` se ignoran).
  Tarjetas: `a[href*='/anime/']` con `h3`, etiqueta `span.opacity-75`.
- **Ficha**: `/anime/{slug}` · **Ver**: `/ver/{slug}-episodio-{n}`.
- **Reproductores**: `a.play-video[data-player]` con la URL del embed **en
  base64**; servidores observados: Filemoon, Doodstream, OK(ru), EmbedV,
  MP4Upload, Lulustream. Descargas: 1fichier, Gofile, Mega, Mediafire.
- La extracción vía lector web oculta los destinos reales (devuelve la propia
  URL de `/ver/...`), así que el parser trabaja sobre el HTML crudo.

## 3) AnimeD23 — https://animed23.com (WordPress)

- **Modelo**: una ficha por serie **y por temporada** (p. ej. `black-clover`
  y `black-clover-temporada-2`); idioma indicado por episodio.
- **Buscador**: `GET /?s={texto}` devuelve **tarjetas de serie** a
  `/anime/{slug}/` con badges `Lat`, `Sub` o `Lat Sub`. Hay que filtrar el
  ruido (recomendados/populares) por relevancia de título.
- **Ficha**: `/anime/{slug}/` · **Ver capítulo**: `/capitulo/{slug}-ep-{n}/`.
- **Respaldo**: REST `/wp-json/wp/v2/search?search=...` devuelve posts de
  *capítulos*; se deriva la serie quitando `-ep-{n}`. La REST **no expone
  reproductores** (ni meta útil), así que los streams salen del HTML del
  capítulo (parser genérico: iframes, `data-*`, `playVideo(...)`, scripts).

## Mapeo común (idmap)

- Proveedores `perLang` (EstrenosAnime, Latanime): un trabajo por idioma.
- Proveedores `single` (InfinityAnime, AnimeJara, AnimeD23): un trabajo por
  título; el idioma de cada servidor sale de la página del episodio.
- AnimeJara conserva `season` + `episode` (SxE); el resto usan la numeración
  histórica: ficha con temporada → episodio dentro de temporada; ficha única
  → numeración absoluta calculada desde Cinemeta.

## Resolvers por reproductor (`src/extractors.js`)

Sí, compensa tener un módulo por host, **con red de seguridad**: cada
extractor específico es pequeño y, si no encuentra nada, se cae al genérico
(deofuscación Dean Edwards + búsqueda de `.m3u8`/`.mp4`, incl. base64) y, en
última instancia, la opción externa sigue disponible.

| Host(es) | Estrategia |
|---|---|
| **VOE** (+ mirrors) | HLS en JSON-LD `contentUrl` / `hls`, base64, normalización `/{id} → /e/{id}` |
| **Filemoon** (+ mirrors) | packer Dean Edwards, `/d/ → /e/` |
| **MP4Upload** («Upload») | `/{id}.html → /embed-{id}.html` + packer |
| **VidHide / StreamWish / FileLions / LuluStream…** | packer + fuentes `file:` |
| **DoodStream** | `pass_md5` + token (preexistente) |
| **StreamTape** | recomposición de `getElementById` (preexistente) |
| **OK.ru** | `flashvars` JSON (preexistente) |
| **MixDrop** | `MDCore.wurl`, `/f/ → /e/` |
| **Sibnet / YourUpload** | `file:` con base del reproductor / packer |
| **Otros / Multiserver** | genérico + 1 nivel de iframe anidado |
