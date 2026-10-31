# 🔎 Investigación: infinityanime.net (proveedor InfinityAnime)

> Evidencia recogida abriendo la web real (31-oct-2026) antes de integrar el
> proveedor. Complementa a [INVESTIGACION.md](./INVESTIGACION.md) (EstrenosAnime).

## 1. Qué es y cómo se organiza

- WordPress («Ver Animes Online Sub Español y Latino»). Tema propio con dos
  *custom post types* públicos: **`serie`** y **`episode`**
  (verificado en `/wp-json/wp/v2/types`).
- URLs limpias en la **raíz**:
  - Ficha: `/{slug}/` — ej. `/one-piece-tv/`, `/black-clover-2nd-season/`
  - Reproducir: `/{slug}/episodio-{n}/` — ej. `/one-piece-tv/episodio-1180/`
  - Las **películas** también usan `/episodio-1/` (ej. Tamako Love Story, 83 min).
- Buscador/índice: **`/directorio/?s_keyword={texto}`** con filtros
  (género, tipo, estado, año, temporada, etiqueta).
  - Listado de doblados oficial del menú:
    `/directorio/?s_keyword=&etiqueta[]=latino&orderby=date&order=DESC`
- Páginas de raíz que NO son fichas (a excluir al parsear): `directorio`,
  `calendario`, `genero/...`, etc. (lista `RESERVED_SLUGS` en `src/infinity.js`).
- Existe un dominio espejo/alterno que sirve el mismo contenido con la marca
  InfinityAnime: **animeonline.lat** (configurable con `INF_BASE_URL`).

## 2. Idiomas — modelo distinto a EstrenosAnime ⭐

- **Una sola ficha por título** (no hay sufijos `-latino`/`-castellano`).
- En la página del episodio los servidores se agrupan por idioma con rótulos
  **`Sub:`** y **`Dub:`** (puede haber solo uno de los dos).
- La taxonomía `etiqueta` tiene **un único término: `Latino`** (id 434,
  109 series) — verificado en `/wp-json/wp/v2/etiqueta`. El menú lo llama
  «Doblados». ➜ En esta web **Dub = doblaje latino**; **no hay Castellano
  etiquetado** (el Castellano del addon lo aporta EstrenosAnime).
- Las tarjetas del directorio incluyen la palabra *Latino* cuando la serie
  está etiquetada («2026 Anime Latino 12 eps») y la home marca episodios
  con insignia `LAT`. Es una **pista a nivel de serie**: el idioma real de
  cada episodio lo dicen los grupos Sub/Dub y las descargas de su página.

## 3. Ficha (`/{slug}/`)

- Títulos alternativos (romaji/inglés/japonés), tipo (`Anime`, `Película`,
  `OVA`, `ONA`, `Especial`), nº de episodios, estado, fecha/año/temporada,
  estudio, géneros en `/genero/{slug-en-inglés}/`.
- Temporadas/OVAs/películas de una franquicia = **fichas separadas**
  enlazadas entre sí (ej. Black Clover 2nd Season ↔ Black Clover ↔ su
  película), igual que el mapeo por temporadas de EstrenosAnime.
- Lista de episodios con nombre, fecha y miniaturas (TMDB).

## 4. Página de episodio (`/{slug}/episodio-{n}/`) ⭐

- Numeración **absoluta** en series largas (One Piece: hasta el 1180 en
  `/one-piece-tv/`, con barra que enlaza todos los episodios).
- Reproductor con grupos `Sub:`/`Dub:` y servidores conmutables
  (las URLs concretas del player no son visibles sin ejecutar la página;
  el parser las busca de forma genérica: iframes, `data-*`, base64, scripts).
- **Sección «Descargas» con enlaces directos por idioma y servidor**,
  en texto plano (sin JS) — la fuente más fiable:
  - `SUBTITULADO filemoon` → `https://byseraguci.com/d/{id}` (mirror Filemoon)
  - `DOBLADO vidara` → `https://vidara.so/v/{id}`
  - `SUBTITULADO mp4upload` → `https://www.mp4upload.com/{id}.html`
  - `SUBTITULADO streamtape` → `https://streamtape.com/v/{id}/`
  - En fichas antiguas: `mega`, `1fichier`, `zippyshare` (solo descarga).
- Conversión descarga → reproductor implementada en `toEmbedUrl()`:
  Filemoon `/d/`→`/e/`, Mp4Upload →`/embed-{id}.html`,
  StreamTape `/v/`→`/e/`, Vidara `/v/` se usa tal cual (la resuelve el
  extractor); hosts sin player (Mega/1fichier…) quedan como descarga.

## 5. REST de WordPress (abierta)

- `GET /wp-json/wp/v2/serie?search={q}` y `?slug={slug}`: devuelve slug,
  título, taxonomías por id y `class_list` (de ahí: `tipo-anime`,
  `tipo-pelicula`, `etiqueta-latino`). **Sin** episodios ni players.
- `GET /wp-json/wp/v2/episode?slug={serie-slug}-episodio-{n}`: existe y su
  `link` es la URL bonita, pero **no expone los players** (la meta no está
  registrada con `show_in_rest`). ➜ La REST se usa como **buscador rápido
  de apoyo**, fusionada con el directorio HTML; los streams salen del HTML
  de la página del episodio.

## 6. Cómo lo usa el addon (mapeo a `stream`)

| Paso | InfinityAnime | (EstrenosAnime, por contraste) |
|---|---|---|
| Buscar | `/directorio/?s_keyword=` **+** REST `serie?search=` fusionados | `/search?keyword=` |
| Elegir ficha | **la mejor única** (`pickSingleJob`), mismo ranking título/temporada/año | una por idioma (`pickJobsByLang`) |
| Episodio | `/{slug}/episodio-{n}/` (temporada propia si la ficha es «2nd Season…»; absoluta si no) | `/ver/{slug}/episodio-{n}` ídem |
| Idioma de cada stream | del **grupo** `Sub:`/`Dub:` que precede al servidor y del **texto** de la descarga | del **slug** de la ficha |
| Filtro «solo Latino» | si el episodio no tiene grupo Dub ni descargas DOBLADO, este proveedor no devuelve nada (no se etiqueta mal) | la ficha `-latino` no existe / no se elige |
| ID propio de compatibilidad | `ia:{slug}[:1:{ep}]` | `ea:{slug}[:1:{ep}]` |

## 7. Riesgos / a validar en el despliegue

- Las URLs internas del reproductor (botones) no pudieron observarse desde
  el entorno de investigación (los lectores web quitan iframes/atributos).
  Por eso el parser es **genérico** y las descargas garantizan servidores.
  Verificación real: `/debug/watch?provider=infinity&slug=one-piece-tv&ep=1`
  o `node scripts/probe.js watch one-piece-tv 1 --infinity --resolve`.
- `vidara.so/v/{id}`: se asume que la página `/v/` sirve el reproductor
  (patrón VidHide); el extractor desempaqueta el .m3u8/.mp4 si existe.
- Si la web desactiva la REST, el directorio HTML sigue funcionando solo
  (y viceversa).
