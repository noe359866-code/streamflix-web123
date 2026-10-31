# 🔎 Investigación de estrenosanime.net

> Fecha: **31 de octubre de 2026** · Método: navegación real de la web (portada, listados,
> fichas y reproductor en los 3 idiomas), `robots.txt`, `sw.js`, respuestas a través de
> proxy de solo lectura (para ver JSON-LD y blobs JS) y búsqueda web complementaria.
> Todo lo que usa el addon sale de esta evidencia; lo que no se pudo observar
> directamente está marcado como **[inferido]** y el código lo resuelve en tiempo
> de ejecución con varias estrategias + endpoints `/debug/*`.

## 1. Qué es la web

- Portal de anime online gratuito en HD, **sin registro**, en español:
  **Subtitulado**, **Español Latino** y **Castellano** (su propio `<title>`:
  «Ver Anime Sub en Español, Español Latino Online En HD Gratis»).
- Se define como agregador: *«Ningun video se encuentra alojado en nuestros
  servidores… todos los videos enlazados son tomados de internet»* (pie de página).
- Técnicamente: HTML renderizado en servidor detrás de **Cloudflare** (con
  Turnstile para el login, `window.TURNSTILE_SITE_KEY`), NProgress, PWA con
  service worker en `/sw.js`, imágenes en `/uploads/`. Las páginas públicas
  responden **HTTP 200** a peticiones normales de navegador (sin challenge).
- `robots.txt`: permite `/`, declara sitemap en `/sitemap.xml` y pide no
  indexar URLs con `?ep=` (dato clave, ver §5).

## 2. Modelo de idiomas (lo más importante)

La web **no** tiene selector de idioma por episodio: cada idioma es una
**ficha independiente** con su propio slug y su propio contador de episodios:

| Idioma | Slug | Título visible | Badge | Campo en ficha |
|---|---|---|---|---|
| Subtitulado | `one-piece` | «One Piece» | `SUB` | `Idioma:Subtitulado` |
| Latino | `one-piece-latino` | «One Piece (Latino)» | `LATINO` | `Idioma:Latino` |
| Castellano | `magic-knight-rayearth-2026-castellano` | «… (Castellano)» | `CASTELLANO` | `Idioma:Castellano` |

- En la ficha existe el bloque **«Idiomas Disponibles»** con enlaces
  «Cambiar a Idioma Latino/Subtitulado» hacia el slug equivalente.
- Los contadores difieren por idioma (ej. verificado: One Piece Sub = 1180 EP,
  Latino = 877/1168 EP).
- En el buscador avanzado el filtro de idioma se llama **Sub / Lat / Cast**.
- 👉 El addon conserva el título con sufijo (así el usuario distingue el
  idioma en Stremio), detecta el idioma por *campo → badge → título → slug*
  y enlaza las fichas hermanas en `meta.links`.

## 3. Mapa de rutas verificado

| Ruta | Uso en el addon |
|---|---|
| `/anime/{slug}` | Ficha (meta) |
| `/ver/{slug}/episodio-{n}` | Página de reproducción (streams). Redirige añadiendo `?ep={episode_id}` |
| `/search?keyword={texto}` | Buscador (acepta `&page=`) |
| `/popular` | Catálogo «Populares» |
| `/ultimo-anime` | «Últimos animes agregados» |
| `/ultimo-actualizado` | «Recién actualizados» |
| `/ultimo-episodios` | Últimos episodios (mixto) |
| `/ultimo-subtitulado` | Últimos episodios **Sub** |
| `/ultimo-latino` | Últimos episodios **Latino** |
| `/ultimo-castellano` | Últimos episodios **Castellano** — *existe aunque no aparece en el menú; verificado con contenido real* |
| `/tipo/{Pelicula\|TV\|OVA\|ONA\|Especial}` | Películas y catálogo «por formato» |
| `/estado/{Completado\|En+Emision\|Proximamente}` | «En emisión» |
| `/genero/{Genero}` | Catálogos por género (45 géneros, nombres sin tildes y con `+`: `/genero/Arte+Marciales`) |
| `/years/{aaaa}`, `/studios/{nombre}`, `/seasonal`, `/schedule`, `/random`, `/filter`, `/anime` (índice) | Existen; no usados en v1 (el calendario `/schedule` carga por AJAX: «Cargando…») |
| Paginación `?page={n}` | Verificada en listados (`/tipo/Pelicula?page=2`) |
| `/uploads/anime/{hash}.jpg` | Póster vertical de cada ficha |
| `/uploads/banners/{hash}.webp` | Banner 16:9 (destacados de portada) |
| `/uploads/LogoEstrenosanime.png` | Logo del sitio (usado como logo del addon) |
| `/images/poster-min.webp` | Imagen promocional (fondo del addon) |

Filtros del buscador avanzado vistos en `/search`: Tipo (Pelicula/TV/OVA/ONA/
Especial/Music), Estado, Clasificación (G/PG/PG-13/R/R+/Rx), Temporada,
**Idioma (Sub/Lat/Cast)**, fechas, orden y género. El addon no depende de los
nombres de esos parámetros: busca por `keyword` y filtra idioma/tipo él mismo.

## 4. Ficha de anime (`/anime/{slug}`)

Bloques y etiquetas **literales** verificados (ej. reales: `one-piece`,
`one-piece-latino`, `magic-knight-rayearth-2026-castellano`, película
`yeon-ui-pyeonji`):

- Título (h2 + `og:title` = «Ver {Título} Online HD Gratis | Estrenos Anime»),
  clasificación («PG-13 - Adolescentes 13 o más»), badges `HD` + idioma, tipo,
  botón «Ver Ahora» → `/ver/{slug}/episodio-1`.
- `Resumen:` sinopsis larga (la corta va truncada con «…+ Más»).
- Pares etiqueta/valor: `Japonés:`, `English:`, `Sinónimos:`,
  `Temporada estacional:`, `Emisión:` (formato `Oct 20, 1999`), `Idioma:`,
  `Episodios:` (`1180 / 1180`, `877 / 1168`, `1 / 1` en películas),
  `Año de lanzamiento:`, `Duración:` (`24 Min`, `1 hr 36 min`),
  `Studios:`, `Tipo:`, `Estado:`, `Genero:`.
- `Idiomas Disponibles` con enlaces «Cambiar a…».
- miniaturas de PV de YouTube (`i.ytimg.com/vi/{id}/`) → se usan como tráiler.
- Secciones «Personajes y actores de voz» y «Recomendado para ti» (tarjetas
  que el parser de ficha ignora a propósito).
- ⚠️ La ficha **no muestra la lista de episodios**: está en la página `/ver/`
  (ver §5). Por eso el addon genera los episodios `1…N` desde `Episodios:` y,
  si el dato es sospechoso (p. ej. en el buscador *Naruto* Sub se veía
  «EP 1/1»), lo corrige con los rangos de la página de reproducción.

## 5. Página de reproducción (`/ver/{slug}/episodio-{n}`)

Verificado en los 3 idiomas (One Piece Sub EP1, One Piece Latino EP1,
Black Clover 2nd Season EP1-4 y Magic Knight Rayearth 2026 Castellano EP1):

- Redirige a `…/episodio-{n}?ep={episode_id}` — el `episode_id` es el id
  global del episodio en su BD (ej.: One Piece Sub EP1 → `ep=1`;
  One Piece Latino EP1 → `ep=29324` y los siguientes son correlativos
  29325, 29326…; Black Clover 2nd EP1 → `ep=71576`; Castellano → `ep=72088`).
  **Sin el parámetro también funciona** (la propia web lo añade).
- La página incrusta dos JSON muy útiles:
  - **JSON-LD** `TVEpisode` con `episodeNumber`, serie (`partOfSeries.name`)
    e imagen.
  - Blob de estado: `{"page":"watch","name":"One Piece","anime_id":1,"episode_id":1,"episode_number":"1","slug":"one-piece","series_url":"/anime/one-piece"}`.
- Texto guía: *«Estás viendo el Episodio N. Si el servidor actual no
  funciona, por favor prueba con otros servidores disponibles. **SERVIDOR:** …»*.
- **Servidor de streaming observado: «Multiserver»** (en Sub, Latino y
  Castellano). Es un único botón/enlace `href="javascript:;"`: la URL del
  embed **no va en el `href`**, así que **[inferido]** vive en atributos
  `data-*` del botón (y/o en el iframe por defecto) y es un agregador que
  internamente reparte entre varios hosts de vídeo.
- **Descargas** por episodio según idioma (también `javascript:;`):
  Latino → Krakenfiles; Castellano → transfer, vikingfile, 1fichier, gofile.
  El addon puede mostrarlos como enlaces externos (opción de config).
- **Lista de episodios** con rangos de 100: «EPS: 001-100», «EPS: 801-877»,
  cada número enlaza a `/ver/{slug}/episodio-{n}?ep={id}` con título
  «{n} Capitulo {n}». De ahí salen conteos fiables.
- Extras: Anterior/Siguiente, Auto Play, modo «Luz», «Añadir como»
  (Viendo/En pausa/Planeo ver/Abandonado/Completado), estimación del
  próximo episodio (*«🚀Se estima que el próximo episodio llegará el…»*),
  voto («9.5 · Votar Ahora!») y formulario detallado de «Reportar un
  Problema» (categorías de vídeo/audio/subtítulos/servidor).

### Limitación de esta investigación (y cómo la cubre el código)

Desde el entorno de trabajo no se pudo descargar el HTML *crudo* de `/ver/`
para leer el `src` exacto del iframe de Multiserver (los lectores usados
eliminan iframes/atributos `data-*`). Por eso `parseWatch()` es
**multi-estrategia** y en un despliegue normal (con internet abierto) captura,
en orden: iframes `src/data-src` → **cualquier URL o base64 en cualquier
atributo** de botones/enlaces → URLs en scripts inline → medios directos
`.m3u8/.mp4` → y si nada aparece (carga por AJAX), `discoverViaAjax()` prueba
endpoints `/ajax/...` con el `episode_id` y escanea los `.js` del propio
sitio buscando rutas reales. Los endpoints **`/debug/watch?slug=…&ep=…`** y
`node scripts/probe.js watch <slug> <ep>` muestran en tu servidor exactamente
qué se encontró, para ajustar en minutos si la web cambia.

Los embeds que se obtienen se pasan por un resolvedor genérico
(`src/extractors.js`): descarga del embed, desofuscación del *packer* de
Dean Edwards (el que usan Filemoon, VidHide, StreamWish, FileLions, VOE,
MixDrop…), búsqueda de `file:"…"`, HLS y casos especiales (DoodStream,
StreamTape, OK.ru). Si un servidor no entrega vídeo directo, Stremio muestra
«↗️ Abrir en el navegador» y **siempre** se incluye la opción oficial
«🌐 estrenosanime.net» con la página del episodio.

## 6. Decisiones de diseño derivadas

1. **IDs propios** `ea:{slug}` y episodios `ea:{slug}:1:{n}`: el slug ya
   contiene el idioma, así que Sub/Latino/Castellano conviven sin colisiones.
2. **`Pelicula` → tipo `movie`**; TV/OVA/ONA/Especial/Music → `series`.
3. Catálogos de «últimos episodios» enlazan a `/ver/…`: el parser los
   convierte a la ficha correspondiente conservando el nº de episodio.
4. Sin selector de «temporada»: la web publica cada temporada como ficha
   aparte («… Temporada 2 (Latino)»), igual que hará Stremio aquí.
5. Cachés cortos y `EA_BASE_URL` configurable por si el dominio cambia.
