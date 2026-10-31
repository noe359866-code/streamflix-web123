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
| 🏠 **Si bloquean el datacenter** | Detecta 403/captcha/geo-bloqueo a la IP de Beamup/Render/VPS, reintenta **señalando la IP pública de quien pide el stream** (`X-Forwarded-For`, best effort), opcionalmente resuelve saliendo por un **proxy del operador** (lista estática o Proxy5), abre circuito por host para no perder tiempo y puede delegar en un **resolver residencial** opcional (`EA_EXTERNAL_RESOLVER_URL`) |
| 🧰 **Diagnóstico** | `/debug/map`, `/debug/watch?provider=…`, `/debug/search?provider=…`, `/debug/hosts` y CLI `scripts/probe.js` |

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

### Si un reproductor bloquea la IP del hosting (datacenter)

Es habitual que VOE/Filemoon y similares respondan `403`, captcha o
geo-bloqueo a Beamup/Render/VPS aunque el mismo embed abra desde casa.
El addon ahora:

1. **Detecta el bloqueo** (401/403/407/429/451, Cloudflare/Turnstile,
   DDoS-Guard, mensajes de IP/país) y lo muestra en Stremio como
   «⛔ … bloquea la IP del servidor», ofreciendo abrir el embed con **tu**
   conexión.
2. **Reintenta señalando tu IP.** Un servidor no puede emitir TCP con la
   IP residencial del usuario (el tráfico de vuelta iría a su casa y su
   router/ISP lo descarta; no es un problema de permisos, es física de
   red). Lo que sí puede es reintentar una vez **señalando** la IP pública
   de quien pide el stream con cabeceras estándar de proxy
   (`X-Forwarded-For` / `X-Real-IP` / `Forwarded`). Los reproductores que
   deciden por esa cabecera pueden soltar el vídeo («Vídeo directo ·
   resuelto señalando tu IP»); los que miran la IP TCP real (p. ej.
   Cloudflare) seguirán bloqueando. La IP solo se señala **después** de
   un bloqueo y solo a ese reproductor; no se loguea ni se guarda (en
   memoria viaja su hash). Apágalo con `EA_FORWARD_CLIENT_IP=0`.
3. **Opcional: salida proxy del operador.** Si configuras proxies
   (`EA_EMBED_PROXY_URLS`, o la lista de Proxy5 con
   `EA_PROXY5_API_AUTH_KEY` + `EA_PROXY5_SERVICE_ID`), la resolución del
   embed se reintenta saliendo por esa otra IP («Vídeo directo · resuelto
   vía proxy de salida»). Solo se descarga el HTML del embed por el
   proxy; el vídeo lo reproduce Stremio desde tu conexión. **Ojo con
   Proxy5:** su propia FAQ dice que todos sus proxies son de
   **datacenter** y que **no vende residenciales**. Sirve si el
   reproductor bloquea la IP/ASN concretas de Beamup; si bloquea
   cualquier datacenter o pide un challenge de navegador, seguirá
   bloqueando. Además Proxy5 exige **amarrar la IP saliente de Beamup**
   (IP binding) en su panel. Consejo: prueba primero su trial y valida
   con `/debug/watch?…&resolve=1` antes de pagar un plan grande. La API
   enlazada está marcada como *legacy*: el addon solo hace el GET de
   lectura de la lista (`/api/iplist/…`), nunca compra ni modifica
   servicios, y `/health` solo enseña conteos (`embedProxy`), jamás
   endpoints ni credenciales.
4. **Abre un circuito por host** unos minutos (`/debug/hosts`) para no
   perder tiempo resolviendo el mismo player bloqueado en cada episodio;
   el reintento con tu IP tampoco se repite para el mismo usuario+host
   si ya falló, ni la misma salida proxy para el mismo host.
5. Si algún enlace directo parece firmado con la IP que resolvió
   (`get_video?...&ip=…`), deja también el embed externo como plan B.
6. **Opcional:** puede delegar solo los embeds bloqueados a un resolver en
   una IP residencial **real**. Ejecuta `scripts/home-resolver.js` en tu
   PC/Raspberry, exponlo con un túnel seguro y define en el despliegue:

   ```bash
   EA_EXTERNAL_RESOLVER_URL=https://tu-tunel.example
   EA_EXTERNAL_RESOLVER_TOKEN=un-secreto-largo
   ```

   En casa: `RESOLVER_TOKEN=un-secreto-largo npm run resolver:home`
   (escucha solo en `127.0.0.1:7199`; no es un proxy de vídeo).

> Un proxy de medios en el **mismo** Beamup no solucionaría el bloqueo:
> seguiría saliendo por la IP del datacenter y además consumiría su
> ancho de banda. Por eso la salida proxy de arriba es **externa** y
> solo resuelve el embed (KB de HTML), y el respaldo final sigue siendo
> el navegador del usuario o un resolver residencial real.

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
├── proxy-egress.js    # salida proxy opcional para embeds (estática/Proxy5)
├── request-context.js # IP pública del solicitante por petición (anti-bloqueo)
├── http.js            # fetch con cabeceras de navegador, timeouts y caché
├── config.js          # dominios y rutas verificadas de las 5 webs
└── util.js            # idiomas, títulos/temporadas, IDs, helpers
test/ (scraper · idmap · infinity · extra-providers · beamup · bloqueos)
scripts/probe.js · scripts/home-resolver.js (resolver residencial opcional)
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
| `EA_FORWARD_CLIENT_IP` | *(on)* | `0` = no reintentar señalando la IP del solicitante tras un bloqueo |
| `EA_CLIENT_IP_RETRY_TTL_MS` | `600000` | Enfriamiento del reintento con tu IP por host+usuario |
| `EA_TRUST_PROXY` | *(off)* | `1` = creer `X-Forwarded-*` aunque el salto inmediato no parezca privado |
| `EA_EMBED_PROXY_URLS` | *(vacío)* | Proxies de salida solo para resolver embeds bloqueados (URLs o `host:puerto[:user:clave]`, separados por comas) |
| `EA_EMBED_PROXY_MAX_ATTEMPTS` | `2` | Salidas proxy a probar por embed bloqueado (máx. 5) |
| `EA_PROXY5_API_AUTH_KEY` + `EA_PROXY5_SERVICE_ID` | *(vacío)* | Descarga la lista de un servicio Proxy5 ya comprado vía su API heredada (solo lectura). Proxy5 es datacenter, no residencial |
| `EA_PROXY5_LIST_TYPE` / `EA_PROXY5_LIST_FORMAT` | `http-auth` / `json` | Tipo/formato de la lista Proxy5 (`/api/iplist/{type}/{format}/{id}`) |
| `EA_EXTERNAL_RESOLVER_URL` | *(vacío)* | Resolver residencial opcional para embeds que bloquean el datacenter |
| `EA_EXTERNAL_RESOLVER_TOKEN` | *(vacío)* | Token compartido con `scripts/home-resolver.js` |
| `EA_HOST_BLOCK_TTL_MS` / `EA_HOST_FAILURE_COOLDOWN_MS` | `600000` / `60000` | Circuito por host ante bloqueos/fallos |
| `DEBUG` | *(on)* | `0` = desactiva los `/debug/*` públicos |

No hay interruptor de demo ni ajustes de usuario en Stremio: no existen.
Estas variables son solo del despliegue.

### Endpoints útiles

| Ruta | Para qué |
|---|---|
| `/` | Portada de instalación |
| `/manifest.json` | Manifiesto solo-stream |
| `/stream/{type}/{id}.json` | **El único recurso de Stremio** |
| `/health` | Estado + las 5 fuentes + si hay resolver externo/hosts bloqueados |
| `/debug/hosts` | Reproductores que están bloqueando/enfriando a este hosting |
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
Ese servidor no entregó vídeo directo en ese momento. Si la nota dice
«⛔ bloquea la IP del servidor», el player está rechazando el datacenter
(y, si ves «señalando tu IP pública» o «vía el proxy de salida», ni así
lo soltó): desde tu navegador/TV suele abrir, `/debug/hosts` muestra qué
host es y puedes activar una salida proxy o el resolver residencial
opcional (arriba). La opción
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

Hecho con 💙 para la comunidad hispanohablante · v1.4.0 (solo-stream, 5 proveedores, anti-bloqueo de datacenter)
