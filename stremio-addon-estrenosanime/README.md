<div align="center">

# 🌸 Estrenos Anime ES — Addon para Stremio

**Anime en 💬 Sub Español · 🌎 Español Latino · 🇪🇸 Castellano**
desde [estrenosanime.net](https://estrenosanime.net), dentro de Stremio.

Catálogos, buscador, fichas completas con episodios y servidores — leído en vivo de la web.

</div>

---

## ✨ Qué hace

| | |
|---|---|
| 📚 **11 catálogos** | Populares · Últimos episodios **Sub / Latino / Castellano** (¡por separado!) · Agregados · Actualizados · En emisión · Por género · Por formato · Películas |
| 🔎 **Buscador** | Busca en toda la web y distingue el idioma de cada resultado |
| 🗣️ **Idiomas reales** | La web publica cada idioma como ficha aparte (`one-piece`, `one-piece-latino`, `…-castellano`): el addon las respeta, las marca con 💬/🌎/🇪🇸 y las enlaza entre sí |
| 📺 **Fichas completas** | Sinopsis, género, año, duración, estudio, estado, tráiler (PV) y lista de episodios |
| ▶️ **Reproducción** | Lee los servidores reales del episodio (Multiserver y compañía) e intenta darte el **vídeo directo dentro de Stremio**; si un servidor no lo permite, lo abre en el navegador. Siempre incluye la página oficial |
| ⚙️ **Configurable** | Idioma preferido, modo de reproducción y enlaces de descarga, desde la propia página del addon |
| 🧰 **Diagnóstico** | Endpoints `/debug/*` y script `probe.js` para ver qué está leyendo de la web |

> 📖 ¿Quieres saber cómo funciona la web por dentro? Lee
> **[INVESTIGACION.md](./INVESTIGACION.md)**: rutas, modelo de idiomas,
> reproductor «Multiserver», descargas, rangos de episodios y decisiones de diseño.

---

## 🚀 Instalación

Un addon de Stremio es un pequeño servidor web: primero lo **despliegas**
(gratis) y después instalas su URL en Stremio.

### Opción A — Render.com (gratis, recomendado)

1. Haz *fork* de este repositorio (o usa este mismo repo si es tuyo).
2. En [Render](https://render.com) → **New → Web Service** → conecta el repo.
3. Ajustes:
   - **Root Directory:** `stremio-addon-estrenosanime`
   - **Runtime:** Node · **Build:** `npm install` · **Start:** `npm start`
   - **Health Check Path:** `/health`
   *(o mueve el `render.yaml` de esta carpeta a la raíz del repo y usa **New → Blueprint**)*
4. Cuando termine el despliegue, abre la URL que te da Render
   (ej. `https://estrenosanime-stremio-addon.onrender.com`) y pulsa
   **🚀 Instalar addon**. ¡Listo!

### Opción B — Beamup (hosting de addons de la comunidad Stremio)

1. Entra en [beamup.dev](https://beamup.dev) y crea un proyecto desde este repositorio.
2. Detectará el `Dockerfile` de esta carpeta automáticamente.
3. Abre la URL pública del proyecto e instala desde ahí.

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
- Para verlo en la **TV/móvil de tu red**, usa la IP local del PC
  (ej. `http://192.168.1.50:7000/manifest.json`) con el addon abierto
  (escucha en `0.0.0.0`). Para usarlo fuera de casa necesitas una URL
  pública https (Opciones A/B o un túnel tipo Cloudflare Tunnel).

### Instalar la URL en Stremio (manual)

Copia la URL de tu manifiesto — `https://TU-DESPLIEGUE/manifest.json` — y en
Stremio ve a **Complementos (🧩) → pegar URL / instalar**. También puedes
abrir `https://TU-DESPLIEGUE/` en el navegador y usar los botones de instalación.

---

## ⚙️ Configuración

Abre `https://TU-DESPLIEGUE/configure` (o el ⚙️ del addon en Stremio):

| Opción | Qué hace |
|---|---|
| 🌐 **Idioma preferido** | `Todos / Subtitulado / Latino / Castellano`. Filtra los catálogos mixtos y la búsqueda. Los catálogos «Últimos episodios · …» ya son de un único idioma |
| ▶️ **Reproducción** | `Auto` (intenta vídeo directo dentro de Stremio + externa) o `Solo externo` (siempre navegador) |
| ⬇️ **Descargas** | Muestra también los enlaces de descarga del episodio (Krakenfiles, Gofile, 1fichier, vikingfile…) como opciones externas |

La configuración viaja codificada en la propia URL del manifiesto, como en
todos los addons de Stremio: sin cuentas ni nada guardado en el servidor.

---

## ▶️ Cómo funciona la reproducción

1. Al abrir un episodio, el addon lee su página real
   `/ver/{anime}/episodio-{n}` y extrae los servidores (normalmente
   **«Multiserver»**), buscando en iframes, botones con `data-*`, scripts y,
   si hiciera falta, endpoints AJAX del sitio (auto-descubiertos).
2. Cada embed pasa por un **resolvedor genérico** (desofusca el *packer*
   típico de Filemoon/VidHide/StreamWish/VOE/MixDrop, casos especiales de
   DoodStream/StreamTape/OK.ru) para obtener el `.m3u8`/`.mp4` directo con
   sus cabeceras (`Referer`/`User-Agent`) vía `proxyHeaders`.
3. Lo que no se puede resolver aparece como **«↗️ Abrir en el navegador»** y
   **siempre** se añade **«🌐 estrenosanime.net»** con la página oficial.

> Los servidores gratuitos cambian con frecuencia: si uno deja de dar vídeo
> directo, las opciones externas seguirán funcionando. Con
> `/debug/watch?slug=…&ep=…` verás qué encontró el addon en tu servidor.

---

## 🧑‍💻 Desarrollo

```bash
npm install
npm test            # 12 pruebas sin red (parsers con HTML de ejemplo realista)
npm start           # servidor en :7000

# Diagnóstico contra la web real (desde una máquina con internet normal):
node scripts/probe.js search "One Piece"
node scripts/probe.js detail one-piece-latino
node scripts/probe.js watch one-piece 1 --resolve
node scripts/probe.js catalog /ultimo-castellano
```

### Estructura

```
src/
├── index.js       # servidor Express: /, /configure, /health, /debug/* + router Stremio
├── addon.js       # manifiesto + handlers (catalog / meta / stream)
├── landing.js     # portada de instalación y página de configuración (ES)
├── scraper.js     # lee listados, fichas y /ver/ de estrenosanime.net (cheerio)
├── extractors.js  # resolvedor de embeds (packer, HLS, AJAX auto-discovery)
├── http.js        # fetch con cabeceras de navegador, timeouts, reintentos y caché
├── config.js      # rutas, géneros e idiomas verificados de la web
├── util.js        # idiomas por slug, IDs ea:, caché TTL, regex de medios
└── demo.js        # datos DEMO offline (solo con DEMO_FALLBACK=1)
test/scraper.test.js
scripts/probe.js   # CLI de diagnóstico
Dockerfile · docker-compose.yml · render.yaml · .env.example
```

### Variables de entorno

| Variable | Defecto | Uso |
|---|---|---|
| `PORT` | `7000` | Puerto del servidor |
| `EA_BASE_URL` | `https://estrenosanime.net` | Dominio fuente (por si la web se muda de dominio/mirror) |
| `EA_TIMEOUT_MS` / `EA_EMBED_TIMEOUT_MS` | `15000` / `12000` | Timeouts al leer la web y los servidores |
| `EA_USER_AGENT` | Chrome 126 | User-Agent de las peticiones |
| `DEMO_FALLBACK` | *(off)* | `1` = si la web no responde, sirve catálogos DEMO con datos reales de ejemplo (solo para desarrollo/preview sin internet) |
| `DEBUG` | *(on)* | `0` = desactiva los `/debug/*` públicos |

### Endpoints útiles

| Ruta | Para qué |
|---|---|
| `/` | Portada con botones de instalación |
| `/configure` | Generador de URL con tu configuración |
| `/health` | Estado del addon (para Render/Docker) |
| `/manifest.json` | Manifiesto (también `/{config}/manifest.json`) |
| `/debug/watch?slug=one-piece&ep=1` | Servidores/descargas/IDs que ve el scraper (`&resolve=1` prueba el primer embed) |
| `/debug/detail?slug=one-piece-latino` | Meta completa de una ficha |
| `/debug/search?q=naruto` | Resultados crudos del buscador con idioma detectado |

---

## ❓ Preguntas frecuentes

**El catálogo sale vacío en Stremio.**
Abre `/debug/search?q=naruto` en tu despliegue. Si ahí también falla, tu
servidor no está llegando a estrenosanime.net (revisa con `probe.js`) o la web
cambió: prueba a ajustar `EA_BASE_URL` si se mudó de dominio.

**Un episodio solo ofrece «Abrir en el navegador».**
Ese servidor no entregó vídeo directo en ese momento (pasa con algunos hosts
que exigen interacción). La opción 🌐 abre la página oficial con todos sus
servidores. En la web el servidor principal es «Multiserver», un agregador:
su comportamiento puede variar por episodio.

**¿One Piece tarda en abrir la ficha?**
Tiene 1180 episodios: la ficha genera las 1180 entradas (es un JSON más
grande de lo normal, pero entra dentro de lo que Stremio maneja). Queda en
caché del addon 6 h.

**¿Puedo buscar solo en Latino/Castellano?**
Sí: instala el addon desde `/configure` con tu idioma preferido, o usa los
catálogos «Últimos episodios · 🌎 Latino / 🇪🇸 Castellano».

**¿Se puede publicar en el catálogo oficial de addons de Stremio?**
Stremio pide que los addons del catálogo central vayan firmados
(`stremioAddonsConfig`). La instalación por URL (este método) no lo
necesita; la publicación oficial queda como posible mejora futura.

**Hoja de ruta posible:** soporte de IDs de IMDb (`tt…`) para ofrecer estos
streams también desde fichas de otros catálogos, calendario (`/schedule`),
y extractores dedicados adicionales según lo que revele `/debug/watch`.

---

## ⚖️ Aviso legal

Addon **no oficial** y sin ánimo de lucro. Este servidor **no aloja ningún
vídeo**: solo lee el catálogo público de estrenosanime.net y enlaza a los
servidores de terceros que la propia web enlaza (la web declara lo mismo).
Todos los títulos, imágenes y vídeos pertenecen a sus respectivos autores.
Úsalo únicamente donde sea legal en tu país y, si te gusta un anime,
apoya su lanzamiento oficial.

Hecho con 💙 para la comunidad hispanohablante · v1.0.0
