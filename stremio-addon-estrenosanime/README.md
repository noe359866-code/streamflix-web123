<div align="center">

# 🌸 Anime Español Multi · Streams — Addon para Stremio

**▶️ Addon SOLO de streams** — Anime en 💬 Sub Español · 🌎 Español Latino · 🇪🇸 Castellano
desde **[estrenosanime.net](https://estrenosanime.net)** e **[infinityanime.net](https://infinityanime.net)**,
sobre las fichas que ya tienes en Stremio.

Sin catálogos ni fichas propias: abre cualquier anime (Cinemeta, Kitsu…) y elige
proveedor + idioma entre sus servidores en español.

</div>

---

## ✨ Qué hace

| | |
|---|---|
| ▶️ **Solo streams** | El manifiesto expone **únicamente** el recurso `stream` (`resources: ["stream"]`, `catalogs: []`). Ni catálogos, ni metas |
| 🌐 **2 proveedores** | **EstrenosAnime** (Sub/Latino/Castellano, una ficha por idioma) e **InfinityAnime** (Sub + Latino «Dub» en la misma ficha). Elegibles en configuración: `Todos / EstrenosAnime / InfinityAnime` |
| 🎌 **IDs aceptados** | IMDb `tt…` y `tt…:T:E` (Cinemeta), `kitsu:{id}:{ep}` (Kitsu), `mal:{id}:{ep}` (MyAnimeList) y compat `ea:{slug}` / `ia:{slug}` |
| 🗣️ **3 idiomas** | Grupos por **proveedor + idioma** (orden: 🌎 Latino, 🇪🇸 Castellano, 💬 Sub). El Castellano lo aporta EstrenosAnime; InfinityAnime etiqueta Sub/Latino |
| 🔢 **Mapeo de episodios** | Traduce Temporada/Episodio al nº real en cada web: fichas de temporada con su numeración, series largas con numeración absoluta (desde la lista de Cinemeta) |
| 📺 **Servidores reales** | EstrenosAnime `/ver/…` (Multiserver…) e InfinityAnime (grupos Sub/Dub + descargas Filemoon/Vidara/MP4Upload/StreamTape convertidas a reproductor). Intenta el **vídeo directo dentro de Stremio**; si no, «↗️ Abrir en el navegador» + página oficial de cada web |
| ⚙️ **Configurable** | Proveedores, idiomas a devolver, directo/externo y enlaces de descarga |
| 🧰 **Diagnóstico** | `/debug/map` (mapeo con `provider` por trabajo), `/debug/watch?provider=…`, `/debug/search?provider=…`; CLI `probe.js` |

> 📖 Investigación completa de las webs: **[INVESTIGACION.md](./INVESTIGACION.md)**
> (EstrenosAnime) · **[INVESTIGACION-INFINITY.md](./INVESTIGACION-INFINITY.md)**
> (InfinityAnime: WordPress, REST, grupos Sub/Dub, descargas→embeds).

---

## 🎮 Cómo se usa

1. **Despliega** el addon (abajo) e **instálalo** en Stremio. No verás catálogos nuevos: es a propósito.
2. Abre un anime desde **cualquier catálogo que ya tengas**: el oficial **Cinemeta** (fichas `tt…` de IMDb) sirve para películas y series conocidas; para anime se recomienda también el addon **Kitsu**, cuyas fichas (`kitsu:…`) este addon entiende.
3. Entra en un episodio y, en la lista de fuentes, elige proveedor e idioma (p. ej. **InfinityAnime · 🌎 Latino** o **EstrenosAnime · 🇪🇸 Castellano**).

> 💡 Si un título no tiene coincidencia automática, el addon devuelve las opciones
> «🔎 Buscar en estrenosanime.net» / «🔎 Buscar en infinityanime.net» para abrirlo a mano.

---

## 🚀 Despliegue

Un addon de Stremio es un pequeño servidor web: primero se despliega (gratis) y luego se instala su URL.

### Opción A — Render.com (gratis, recomendado)

1. Haz *fork* de este repositorio (o usa este mismo repo si es tuyo).
2. En [Render](https://render.com) → **New → Web Service** → conecta el repo.
3. Ajustes:
   - **Root Directory:** `stremio-addon-estrenosanime`
   - **Runtime:** Node · **Build:** `npm install` · **Start:** `npm start`
   - **Health Check Path:** `/health`
   *(o mueve el `render.yaml` de esta carpeta a la raíz del repo y usa **New → Blueprint**)*
4. Abre la URL de Render y pulsa **🚀 Instalar addon**.

### Opción B — Beamup (hosting de addons de Stremio)

Crea un proyecto en [beamup.dev](https://beamup.dev) desde este repositorio: detectará el `Dockerfile` de esta carpeta automáticamente.

### Opción C — Docker (VPS, NAS, Raspberry Pi…)

```bash
cd stremio-addon-estrenosanime
docker compose up -d --build
# Addon en http://localhost:7000
```

### Opción D — En tu PC (Node.js ≥ 18)

```bash
cd stremio-addon-estrenosanime
npm install
npm start
# Addon en http://localhost:7000
```

- En el **mismo PC**, Stremio Desktop acepta `http://127.0.0.1:7000/manifest.json`.
- Para la **TV/móvil de tu red**, usa la IP local del PC (ej. `http://192.168.1.50:7000/manifest.json`); fuera de casa necesitas una URL pública https (Opciones A/B o un túnel tipo Cloudflare Tunnel).

---

## ⚙️ Configuración

`https://TU-DESPLIEGUE/configure` (o el ⚙️ del addon en Stremio):

| Opción | Qué hace |
|---|---|
| 🌐 **Proveedores** | `Todos / EstrenosAnime / InfinityAnime` — de qué webs quieres recibir streams |
| 🗣️ **Idiomas a devolver** | `Todos / Subtitulado / Latino / Castellano`. Con «Todos» recibes un grupo por proveedor+idioma (orden: 🌎, 🇪🇸, 💬). Si pides solo Latino y el episodio de InfinityAnime no tiene Dub, ese proveedor no devuelve nada (no etiqueta mal) |
| ▶️ **Reproducción** | `Auto` (vídeo directo dentro de Stremio cuando se puede + externo) o `Solo externo` |
| ⬇️ **Descargas** | Añade los enlaces de descarga del episodio (Mega, 1fichier, Krakenfiles, Gofile…) como opciones externas |

La configuración viaja codificada en la URL del manifiesto; no se guarda nada en el servidor.

---

## 🔧 Cómo encuentra los streams

```
Petición de Stremio (stream/series/tt0388629:1:5)
  -> título desde Cinemeta ("One Piece", año, lista de vídeos)
  -> búsqueda en CADA proveedor activo (+ variante "Temporada N" si T>1)
       · EstrenosAnime: 1 ficha por idioma (one-piece · one-piece-latino…)
       · InfinityAnime: directorio + REST WP -> mejor ficha única (one-piece-tv)
  -> nº de episodio en cada web:
       · ficha con temporada  -> episodio dentro de la temporada
       · ficha única completa -> posición absoluta (lista de Cinemeta)
  -> Estrenos:  /ver/{slug}/episodio-{n}      (idioma = el del slug)
     Infinity: /{slug}/episodio-{n}/         (idioma = grupo Sub:/Dub: y
                                               texto SUBTITULADO/DOBLADO)
  -> resolvedor de embeds -> directo (.m3u8/.mp4) o externo
  -> orden final: idioma (🌎>🇪🇸>💬) -> proveedor -> directo > externo
     > descarga > página oficial
```

En InfinityAnime, los enlaces de la sección «Descargas» se convierten a
reproductor (Filemoon `/d/→/e/`, Mp4Upload `embed-`, StreamTape `/e/`,
Vidara `/v/`); los hosts sin player (Mega, 1fichier…) quedan solo como
descarga opcional.

Kitsu/MAL: el título sale de la API de Kitsu / Jikan y el episodio se usa tal
cual (esas fichas ya son por temporada/título concreto).

**Resolvedor de embeds** (`src/extractors.js`): busca medios directos,
desofusca el *packer* de Dean Edwards (Filemoon/VidHide/StreamWish/VOE/
MixDrop…), casos especiales DoodStream/StreamTape/OK.ru, y si la página
carga servidores por AJAX los auto-descubre con el `episode_id`. Lo no
resuelto queda como enlace externo — nunca te quedas sin opción.

---

## 🧑‍💻 Desarrollo

```bash
npm install
npm test            # 27 pruebas sin red
npm start           # servidor en :7000

# Diagnóstico contra las webs reales (máquina con internet normal):
node scripts/probe.js map tt0388629:1:1 series     # mapeo multi-proveedor
node scripts/probe.js map kitsu:7442:5 anime
node scripts/probe.js search "One Piece"           # EstrenosAnime
node scripts/probe.js search-inf "One Piece"       # InfinityAnime
node scripts/probe.js watch one-piece-latino 1 --resolve
node scripts/probe.js watch one-piece-tv 1 --infinity --resolve
```

### Estructura

```
src/
├── index.js       # Express: /, /configure, /health, /debug/* + router (solo stream)
├── addon.js       # manifiesto SOLO-STREAM + handler (orden idioma→proveedor)
├── providers.js   # registro de proveedores + normalización de watches
├── idmap.js       # IMDb/Kitsu/MAL -> título -> trabajos por proveedor + nº ep.
├── landing.js     # portada de instalación y /configure (ES)
├── scraper.js     # proveedor EstrenosAnime (buscador, fichas, /ver/)
├── infinity.js    # proveedor InfinityAnime (directorio + REST WP + watch)
├── extractors.js  # resolvedor de embeds (packer, HLS, AJAX auto-discovery)
├── http.js        # fetch con cabeceras de navegador, timeouts y caché
├── config.js      # rutas/idiomas verificados de ambas webs
├── util.js        # idioma por slug, títulos/temporadas, IDs, caché TTL
└── demo.js        # datos DEMO offline de ambos proveedores (DEMO_FALLBACK=1)
test/ (scraper · idmap · infinity) · scripts/probe.js
Dockerfile · docker-compose.yml · render.yaml · .env.example
```

> Nota: `scraper.js` conserva funciones internas de listados/fichas porque el
> **mapeo y el diagnóstico** las reutilizan (buscar, verificar conteos EPS).
> Como recursos de **Stremio** el addon expone **solo `stream`**: `/catalog/…`
> y `/meta/…` responden 404.

### Variables de entorno

| Variable | Defecto | Uso |
|---|---|---|
| `PORT` | `7000` | Puerto del servidor |
| `EA_BASE_URL` | `https://estrenosanime.net` | Dominio de EstrenosAnime (por si se muda) |
| `INF_BASE_URL` | `https://infinityanime.net` | Dominio de InfinityAnime (espejo conocido: `animeonline.lat`) |
| `EA_TIMEOUT_MS` / `EA_EMBED_TIMEOUT_MS` | `15000` / `12000` | Timeouts a web y servidores |
| `EA_USER_AGENT` | Chrome 126 | User-Agent de las peticiones |
| `DEMO_FALLBACK` | *(off)* | `1` = datos DEMO si no hay salida a la web/Cinemeta (desarrollo/preview) |
| `DEBUG` | *(on)* | `0` = desactiva los `/debug/*` públicos |

### Endpoints útiles

| Ruta | Para qué |
|---|---|
| `/` · `/configure` | Instalar (con/sin configuración) |
| `/manifest.json` | Manifiesto solo-stream (también `/{config}/manifest.json`) |
| `/stream/{type}/{id}.json` | **El único recurso de Stremio** |
| `/health` | Estado + fuentes (Render/Docker) |
| `/debug/map?id=tt0388629:1:1&type=series` | Título, búsquedas y trabajos (`provider` + slug + episodio) |
| `/debug/watch?slug=one-piece&ep=1` | Servidores de Estrenos (`&resolve=1` prueba el 1º) |
| `/debug/watch?provider=infinity&slug=one-piece-tv&ep=1` | Servidores/descargas de Infinity por idioma |
| `/debug/search?q=One+Piece` | Resultados de **ambos** proveedores (`&provider=infinity` para uno) |

---

## ❓ Preguntas frecuentes

**No veo ningún catálogo nuevo en Stremio.**
Correcto: este addon es **solo de streams** por diseño. Busca el anime desde
Cinemeta, Kitsu u otro catálogo que ya tengas; los servidores
«EstrenosAnime»/«InfinityAnime» aparecen al elegir episodio.

**¿Por qué InfinityAnime no da Castellano?**
Porque esa web no lo etiqueta: su única etiqueta de doblaje es «Latino»
(«Dub»). El Castellano lo aporta EstrenosAnime; con proveedores en «Todos»
recibes el conjunto completo (ver INVESTIGACION-INFINITY.md §2).

**Un título de Cinemeta no devuelve streams en español.**
Puede que la web lo tenga con otro nombre (romaji vs inglés) o que no esté.
Prueba el mismo título desde el **addon Kitsu** (sus títulos suelen coincidir
mejor con los de la web) y revisa el mapeo en
`/debug/map?id=tt…:T:E&type=series`.

**Sale un episodio equivocado en series por temporadas.**
Repórtalo con la salida de `/debug/map` para ese ID: allí se ve la ficha y el
nº elegidos (temporada vs. absoluto) y se puede ajustar la heurística.

**Solo ofrece «Abrir en el navegador».**
Ese servidor no entregó vídeo directo en ese momento. La opción
«🌐 estrenosanime.net» abre la página oficial del episodio con todos sus servidores.

**¿Y si una web cambia de dominio?**
Define `EA_BASE_URL=` / `INF_BASE_URL=https://nuevo-dominio` y reinicia:
no hay que tocar código.

---

## ⚖️ Aviso legal

Addon **no oficial** y sin ánimo de lucro. Este servidor **no aloja ningún
vídeo**: solo lee las páginas públicas de estrenosanime.net e
infinityanime.net y enlaza a los servidores de terceros que esas webs
enlazan. Todos los títulos, imágenes y vídeos pertenecen a sus respectivos
autores. Úsalo solo donde sea legal en tu país.
Úsalo únicamente donde sea legal en tu país y, si te gusta un anime,
apoya su lanzamiento oficial.

Hecho con 💙 para la comunidad hispanohablante · v1.1.0 (solo-stream)
