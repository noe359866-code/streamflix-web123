<div align="center">

# 🌸 Estrenos Anime ES · Streams — Addon para Stremio

**▶️ Addon SOLO de streams** — Anime en 💬 Sub Español · 🌎 Español Latino · 🇪🇸 Castellano
desde [estrenosanime.net](https://estrenosanime.net), sobre las fichas que ya tienes en Stremio.

Sin catálogos ni fichas propias: abre cualquier anime (Cinemeta, Kitsu…) y elige sus servidores en español.

</div>

---

## ✨ Qué hace

| | |
|---|---|
| ▶️ **Solo streams** | El manifiesto expone **únicamente** el recurso `stream` (`resources: ["stream"]`, `catalogs: []`). Ni catálogos, ni metas |
| 🎌 **IDs aceptados** | IMDb `tt…` y `tt…:T:E` (Cinemeta), `kitsu:{id}:{ep}` (Kitsu), `mal:{id}:{ep}` (MyAnimeList) y compat `ea:{slug}` |
| 🗣️ **3 idiomas** | Para cada título devuelve hasta **un grupo por idioma** disponible en la web (💬 Sub · 🌎 Latino · 🇪🇸 Castellano), que allí son fichas separadas |
| 🔢 **Mapeo de episodios** | Traduce Temporada/Episodio al nº real en la web: fichas «… Temporada N» con su numeración, series largas con numeración absoluta (desde la lista de Cinemeta) |
| 📺 **Servidores reales** | Lee los servidores del episodio en `/ver/…` (normalmente *Multiserver*) e intenta el **vídeo directo dentro de Stremio**; si no es posible, «↗️ Abrir en el navegador». Siempre incluye la página oficial |
| ⚙️ **Configurable** | Idiomas a devolver, directo/externo y enlaces de descarga |
| 🧰 **Diagnóstico** | `/debug/map` muestra cómo se mapea un ID; `/debug/watch` qué servidores ve; CLI `probe.js` |

> 📖 Investigación completa de la web (rutas, modelo de idiomas, reproductor,
> rangos EPS…): **[INVESTIGACION.md](./INVESTIGACION.md)**.

---

## 🎮 Cómo se usa

1. **Despliega** el addon (abajo) e **instálalo** en Stremio. No verás catálogos nuevos: es a propósito.
2. Abre un anime desde **cualquier catálogo que ya tengas**: el oficial **Cinemeta** (fichas `tt…` de IMDb) sirve para películas y series conocidas; para anime se recomienda también el addon **Kitsu**, cuyas fichas (`kitsu:…`) este addon entiende.
3. Entra en un episodio y, en la lista de fuentes, elige **EstrenosAnime** con tu idioma (🌎/🇪🇸/💬).

> 💡 Si un título no tiene coincidencia automática en la web, el addon devuelve
> una única opción «🔎 Buscar en estrenosanime.net» para abrirlo a mano.

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
| 🌐 **Idiomas a devolver** | `Todos / Subtitulado / Latino / Castellano`. Con «Todos» recibes un grupo por idioma disponible (orden: 🌎, 🇪🇸, 💬) |
| ▶️ **Reproducción** | `Auto` (vídeo directo dentro de Stremio cuando se puede + externo) o `Solo externo` |
| ⬇️ **Descargas** | Añade los enlaces de descarga del episodio (Krakenfiles, Gofile, 1fichier…) como opciones externas |

La configuración viaja codificada en la URL del manifiesto; no se guarda nada en el servidor.

---

## 🔧 Cómo encuentra los streams

```
Petición de Stremio (stream/series/tt0388629:1:5)
  -> título desde Cinemeta ("One Piece", año, lista de vídeos)
  -> búsqueda en estrenosanime.net (+ variante "Temporada N" si T>1)
  -> 1 ficha por idioma: one-piece (Sub) · one-piece-latino (Latino)
  -> nº de episodio en la web:
       · ficha con temporada  -> episodio dentro de la temporada
       · ficha única completa -> posición absoluta (lista de Cinemeta)
  -> /ver/{slug}/episodio-{n}: servidores (Multiserver, descargas...)
  -> resolvedor de embeds -> directo (.m3u8/.mp4) o externo
```

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
npm test            # 18 pruebas sin red
npm start           # servidor en :7000

# Diagnóstico contra la web real (máquina con internet normal):
node scripts/probe.js map tt0388629:1:1 series     # mapeo de un ID IMDb
node scripts/probe.js map kitsu:7442:5 anime
node scripts/probe.js search "One Piece"
node scripts/probe.js watch one-piece-latino 1 --resolve
```

### Estructura

```
src/
├── index.js       # Express: /, /configure, /health, /debug/* + router (solo stream)
├── addon.js       # manifiesto SOLO-STREAM + handler de streams
├── idmap.js       # IMDb/Kitsu/MAL -> título -> candidatos por idioma + nº episodio
├── landing.js     # portada de instalación y /configure (ES)
├── scraper.js     # lee buscador/listados, fichas y /ver/ de estrenosanime.net
├── extractors.js  # resolvedor de embeds (packer, HLS, AJAX auto-discovery)
├── http.js        # fetch con cabeceras de navegador, timeouts y caché
├── config.js      # rutas/géneros/idiomas verificados de la web
├── util.js        # idioma por slug, títulos/temporadas, IDs, caché TTL
└── demo.js        # datos DEMO offline (solo con DEMO_FALLBACK=1)
test/ (scraper.test.js · idmap.test.js) · scripts/probe.js
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
| `EA_BASE_URL` | `https://estrenosanime.net` | Dominio fuente (por si la web se muda) |
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
| `/health` | Estado (Render/Docker) |
| `/debug/map?id=tt0388629:1:1&type=series` | Título, búsquedas y fichas elegidas por idioma |
| `/debug/watch?slug=one-piece&ep=1` | Servidores/descargas/IDs (`&resolve=1` prueba el 1º embed) |
| `/debug/search?q=naruto` | Resultados crudos del buscador con idioma detectado |

---

## ❓ Preguntas frecuentes

**No veo ningún catálogo nuevo en Stremio.**
Correcto: este addon es **solo de streams** por diseño. Busca el anime desde
Cinemeta, Kitsu u otro catálogo que ya tengas; los servidores «EstrenosAnime»
aparecen al elegir episodio.

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

**¿Y si la web cambia de dominio?**
Define `EA_BASE_URL=https://nuevo-dominio` y reinicia: no hay que tocar código.

---

## ⚖️ Aviso legal

Addon **no oficial** y sin ánimo de lucro. Este servidor **no aloja ningún
vídeo**: solo lee el catálogo público de estrenosanime.net y enlaza a los
servidores de terceros que la propia web enlaza (la web declara lo mismo).
Todos los títulos, imágenes y vídeos pertenecen a sus respectivos autores.
Úsalo únicamente donde sea legal en tu país y, si te gusta un anime,
apoya su lanzamiento oficial.

Hecho con 💙 para la comunidad hispanohablante · v1.1.0 (solo-stream)
