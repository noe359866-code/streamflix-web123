<div align="center">

# 🌸 Anime Español Multi · Streams — Addon para Stremio

**▶️ Addon SOLO de streams** — Anime en 💬 Sub Español · 🌎 Español Latino · 🇪🇸 Castellano
desde **[estrenosanime.net](https://estrenosanime.net)**, **[infinityanime.net](https://infinityanime.net)**,
**[animejara.com](https://animejara.com)**, **[latanime.org](https://latanime.org)** y
**[animed23.com](https://animed23.com)**, sobre las fichas que ya tienes en Stremio.

Sin catálogos ni fichas propias, **sin datos demo** y **sin nada que configurar**:
abre cualquier anime (Cinemeta, Kitsu…) y elige proveedor + idioma.

</div>

---

## ✨ Qué hace

| | |
|---|---|
| ▶️ **Solo streams** | El manifiesto expone **únicamente** el recurso `stream` (`resources: ["stream"]`, `catalogs: []`). Ni catálogos, ni metas: `/catalog/…` y `/meta/…` responden 404 |
| 🚫 **Sin configurador** | No hay `config` en el manifiesto (`configurable: false`) ni página `/configure`. Instalar y listo: se consultan **siempre los 5 proveedores** y todos los idiomas |
| 🎞️ **Sin demos** | Cero datos de ejemplo: todo se lee en vivo de las webs. Si una web no responde, queda la página oficial del episodio |
| 🌐 **5 proveedores** | **EstrenosAnime** · **InfinityAnime** · **AnimeJara** · **Latanime** · **AnimeD23** |
| 🎌 **IDs aceptados** | IMDb `tt…` y `tt…:T:E` (Cinemeta), `kitsu:{id}:{ep}`, `mal:{id}:{ep}` y compatibilidad `ea:` · `ia:` · `aj:` · `lt:` · `d23:{slug}[:T:E]` |
| 🗣️ **3 idiomas** | Grupos por **proveedor + idioma** (orden: 🌎 Latino, 🇪🇸 Castellano, 💬 Sub) según lo que cada web publique |
| 🔢 **Mapeo de episodios** | Traduce Temporada/Episodio al formato real de cada web: fichas por temporada, numeración absoluta (lista de Cinemeta) y **SxE** en AnimeJara |
| 📺 **Servidores reales** | Filemoon, Voe, MP4Upload, VidHide, StreamWish, StreamTape, DoodStream, OK.ru, MixDrop, Sibnet… con **resolvers por reproductor**; directo dentro de Stremio cuando se puede, si no «↗️ Abrir en el navegador» |
| 🧰 **Diagnóstico** | `/debug/map`, `/debug/watch?provider=…`, `/debug/search?provider=…` y CLI `scripts/probe.js` |

> 📖 Investigación de las webs: **[INVESTIGACION.md](./INVESTIGACION.md)** (EstrenosAnime) ·
> **[INVESTIGACION-INFINITY.md](./INVESTIGACION-INFINITY.md)** (InfinityAnime) ·
> **[INVESTIGACION-PROVEEDORES-EXTRA.md](./INVESTIGACION-PROVEEDORES-EXTRA.md)** (AnimeJara, Latanime y AnimeD23).

### Proveedores e idiomas

| Proveedor | Modelo | Idiomas |
|---|---|---|
| **EstrenosAnime** | 1 ficha por idioma (`one-piece` · `-latino` · `-castellano`) | 💬 Sub · 🌎 Latino · 🇪🇸 Castellano |
| **InfinityAnime** | 1 ficha; grupos Sub/Dub en el episodio | 💬 Sub · 🌎 Latino (Dub) |
| **AnimeJara** | 1 ficha, temporadas agrupadas; episodio `/episode/{slug}-{T}x{E}/`, película `/movie/{slug}` | 🌎 Latino · 💬 Japonés/Sub · 🇪🇸 Castellano |
| **Latanime** | Fichas por idioma; buscador `/buscar?q=`; embeds en `data-player` (base64) | 🌎 Latino · 🇪🇸 Castellano · 💬 Sub |
| **AnimeD23** | WordPress; ficha por temporada; capítulo `/capitulo/{slug}-ep-{n}/` | 🌎 Lat · 💬 Sub (badge por episodio) |

---

## 🎮 Cómo se usa

1. **Despliega** el addon (abajo) e **instálalo** en Stremio. No verás catálogos nuevos: es a propósito.
2. Abre un anime desde **cualquier catálogo que ya tengas**: el oficial **Cinemeta** (`tt…`) o el addon **Kitsu** (`kitsu:…`).
3. Entra en un episodio y elige proveedor e idioma (p. ej. **AnimeJara · 🌎 Latino** o **Latanime · 🇪🇸 Castellano**).

> 💡 Si un título no tiene coincidencia automática, el addon ofrece
> «🔎 Buscar en …» para cada proveedor y abrirlo a mano en su web.

---

## 🚀 Despliegue

Un addon de Stremio es un pequeño servidor web: primero se despliega (gratis) y luego se instala su URL.

### Opción A — Beamup (hosting oficial de addons de Stremio, recomendado)

Este repositorio ya viene listo para Beamup: la **raíz** incluye el
`package.json`/`Procfile` Herokuish y `beamup.json`, porque Beamup despliega
la raíz del repo Git (la app Android queda fuera con `.slugignore`).

```bash
# Desde la RAÍZ de tu clon (no desde esta subcarpeta)
npm install -g beamup-cli
beamup config        # host: a.baby-beamup.club + tu usuario de GitHub
beamup init anime-espanol-multi
beamup deploy
```

Guía completa (CLI o GitHub Actions, claves SSH, logs y solución de
problemas): **[`../BEAMUP.md`](../BEAMUP.md)**.

### Opción B — Render.com (gratis)

1. Haz *fork* de este repositorio (o usa este mismo repo si es tuyo).
2. En [Render](https://render.com) → **New → Web Service** → conecta el repo.
3. Ajustes:
   - **Root Directory:** `stremio-addon-estrenosanime`
   - **Runtime:** Node · **Build:** `npm install` · **Start:** `npm start`
   - **Health Check Path:** `/health`
   *(o mueve el `render.yaml` de esta carpeta a la raíz del repo y usa **New → Blueprint**)*
4. Abre la URL de Render y pulsa **🚀 Instalar addon**.

### Opción C — Docker (VPS, NAS, Raspberry Pi…)

```bash
cd stremio-addon-estrenosanime
docker compose up -d --build
# Addon en http://localhost:7000
```

### Opción D — En tu PC (Node.js 22)

```bash
cd stremio-addon-estrenosanime
npm install
npm start
# Addon en http://localhost:7000
```

- En el **mismo PC**, Stremio Desktop acepta `http://127.0.0.1:7000/manifest.json`.
- Para la **TV/móvil de tu red**, usa la IP local del PC; fuera de casa necesitas una URL pública https (Opciones A/B o un túnel tipo Cloudflare Tunnel).

---

## 🔧 Cómo encuentra los streams

```
Petición de Stremio (stream/series/tt0388629:1:5)
  -> título desde Cinemeta/Kitsu/Jikan (+ lista de vídeos si es Cinemeta)
  -> búsqueda en LOS 5 proveedores (+ variante "Temporada N" si T>1)
       · perLang (EstrenosAnime, Latanime): mejor ficha por idioma
       · single (InfinityAnime, AnimeJara, AnimeD23): mejor ficha única
  -> nº de episodio en cada web:
       · AnimeJara             -> {temporada}x{episodio-en-temporada}
       · ficha con temporada   -> episodio dentro de la temporada
       · ficha única completa  -> posición absoluta (lista de Cinemeta)
  -> página del episodio de cada proveedor -> servidores (+ idioma)
  -> resolvedor por host -> directo (.m3u8/.mp4) o externo
  -> orden final: idioma (🌎>🇪🇸>💬) -> proveedor -> directo > externo
     > descarga > página oficial   (máx. 60 opciones)
```

**Resolvers por reproductor** (`src/extractors.js`): dispatcher por host —
VOE (HLS en JSON-LD/base64), Filemoon y MP4Upload («Upload»), la familia
VidHide/StreamWish/FileLions/LuluStream (packer de Dean Edwards), DoodStream
(`pass_md5`), StreamTape, OK.ru (`flashvars`), MixDrop (`MDCore.wurl`),
Sibnet y YourUpload— **siempre con caída al extractor genérico** (packer +
búsqueda de medios, 1 nivel de iframe anidado, auto-descubrimiento AJAX).
Lo no resuelto queda como enlace externo: nunca te quedas sin opción.

---

## 🧑‍💻 Desarrollo

```bash
npm install
npm test            # pruebas sin red
npm start           # servidor en :7000

# Diagnóstico contra las webs reales (máquina con internet normal):
node scripts/probe.js map tt0388629:1:1 series
node scripts/probe.js search-all "One Piece"
node scripts/probe.js search-extra animejara "Black Clover"
node scripts/probe.js watch black-clover 3 --provider=animejara --season=2 --resolve
node scripts/probe.js watch black-clover-ep 12 --provider=animed23
node scripts/probe.js resolve "https://voe.sx/e/XXXX"
```

### Estructura

```
src/
├── index.js           # Express: /, /health, /debug/* + router (solo stream)
├── addon.js           # manifiesto SOLO-STREAM + handler (5 proveedores)
├── providers.js       # registro de proveedores + normalización
├── extra-providers.js # AnimeJara · Latanime · AnimeD23 (+ parsers genéricos)
├── idmap.js           # IMDb/Kitsu/MAL -> título -> trabajos + nº episodio
├── landing.js         # portada de instalación (ES), sin configurador
├── scraper.js         # proveedor EstrenosAnime (buscador, fichas, /ver/)
├── infinity.js        # proveedor InfinityAnime (directorio + REST WP + watch)
├── extractors.js      # resolvers por host + genérico (packer/HLS/AJAX)
├── http.js            # fetch con cabeceras de navegador, timeouts y caché
├── config.js          # dominios y rutas verificadas de las 5 webs
└── util.js            # idiomas, títulos/temporadas, IDs, helpers
test/ (scraper · idmap · infinity · extra-providers) · scripts/probe.js
Dockerfile · docker-compose.yml · render.yaml · .env.example
```

> Nota: internamente se leen listados y fichas para mapear y diagnosticar,
> pero como recursos de **Stremio** el addon expone **solo `stream`**.

### Variables de entorno

| Variable | Defecto | Uso |
|---|---|---|
| `PORT` | `7000` | Puerto del servidor |
| `EA_BASE_URL` | `https://estrenosanime.net` | Dominio de EstrenosAnime |
| `INF_BASE_URL` | `https://infinityanime.net` | Dominio de InfinityAnime |
| `JARA_BASE_URL` | `https://animejara.com` | Dominio de AnimeJara |
| `LAT_BASE_URL` | `https://latanime.org` | Dominio de Latanime |
| `D23_BASE_URL` | `https://animed23.com` | Dominio de AnimeD23 |
| `EA_TIMEOUT_MS` / `EA_EMBED_TIMEOUT_MS` | `15000` / `12000` | Timeouts a webs y servidores |
| `EA_USER_AGENT` | Chrome 126 | User-Agent de las peticiones |
| `DEBUG` | *(on)* | `0` = desactiva los `/debug/*` públicos |

No hay interruptor de demo ni ajustes de usuario: no existen.

### Endpoints útiles

| Ruta | Para qué |
|---|---|
| `/` | Portada de instalación |
| `/manifest.json` | Manifiesto solo-stream |
| `/stream/{type}/{id}.json` | **El único recurso de Stremio** |
| `/health` | Estado + las 5 fuentes (Render/Docker) |
| `/debug/map?id=tt0388629:1:1&type=series` | Título, búsquedas y trabajos por proveedor |
| `/debug/watch?provider=animejara&slug=black-clover&season=2&ep=3` | Servidores crudos (`&resolve=1` prueba el 1º) |
| `/debug/search?q=One+Piece` | Resultados de los 5 proveedores (`&provider=latanime` para uno) |

---

## ❓ Preguntas frecuentes

**No veo ningún catálogo nuevo en Stremio.**
Correcto: este addon es **solo de streams** por diseño. Busca el anime desde
Cinemeta, Kitsu u otro catálogo que ya tengas; los proveedores aparecen al
elegir episodio.

**No aparece ningún engranaje de ajustes.**
También correcto: **no hay configurador**. Siempre se consultan los 5
proveedores y todos los idiomas; tú eliges en la lista de fuentes.

**Un proveedor no devuelve Castellano/Latino.**
Cada web publica lo que publica: p. ej. InfinityAnime solo etiqueta
Sub/Latino y AnimeD23 marca Lat/Sub por episodio. El conjunto de los 5
cubre Sub + Latino + Castellano en la práctica totalidad de títulos.

**Un título no devuelve streams.**
Puede que las webs lo tengan con otro nombre (romaji vs inglés). Prueba el
mismo título desde el **addon Kitsu** y revisa `/debug/map?id=…&type=series`
en tu despliegue: verás los trabajos elegidos por proveedor.

**Sale un episodio equivocado en series por temporadas.**
Repórtalo con la salida de `/debug/map` para ese ID (se ve temporada vs.
absoluto vs. SxE de AnimeJara) y se ajusta la heurística.

**Solo ofrece «Abrir en el navegador».**
Ese servidor no entregó vídeo directo en ese momento; la opción
«🌐 {web}» abre la página oficial del episodio con todos sus servidores.

**¿Y si una web cambia de dominio?**
Define su variable (`EA_BASE_URL=`, `INF_BASE_URL=`, `JARA_BASE_URL=`,
`LAT_BASE_URL=` o `D23_BASE_URL=https://nuevo-dominio`) y reinicia.

---

## ⚖️ Aviso legal

Addon **no oficial** y sin ánimo de lucro. Este servidor **no aloja ningún
vídeo**: solo lee las páginas públicas de las webs fuente y enlaza a los
servidores de terceros que esas webs enlazan. Todos los títulos, imágenes y
vídeos pertenecen a sus respectivos autores. Úsalo solo donde sea legal en
tu país y, si te gusta un anime, apoya su lanzamiento oficial.

Hecho con 💙 para la comunidad hispanohablante · v1.3.0 (solo-stream, 5 proveedores)
