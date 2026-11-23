# StreamFlix

Web de streaming en español **sin anuncios** que indexa reproductores embebidos de terceros y permite cambiar de servidor sin salir del reproductor. No aloja ni distribuye archivos: solo construye y muestra iframes de proveedores externos a partir de los IDs de IMDb o TMDb. Los servidores se prueban uno a uno y se descartan los que muestran publicidad o bloquean el embed.

## Características

- Catálogo de películas y series sin clave de API (Cinemeta).
- Buscador combinado de películas y series.
- Fichas con sinopsis, reparto, géneros, tráiler y episodios por temporada.
- Reproductor con selector de servidores **sin anuncios**, recarga y apertura en pestaña nueva.
- Navegación de temporada/episodio con anterior y siguiente.
- Índice de servidores verificados y soporte de IDs IMDb y TMDb.
- Mi lista (favoritos) y configuración persistidas en `localStorage`.
- Servidores personalizados con plantillas `{imdb}`, `{s}` y `{e}`.
- Interfaz oscura responsive, sin dependencias ni build step.

## Servidores verificados (sin anuncios)

Solo se incluyen proveedores que pasaron la prueba del 23 de noviembre de 2026: **sin anuncios ni popups**, **iframe permitido** y **reproductor cargando**.

| Servidor | Idiomas | ID | Notas |
| --- | --- | --- | --- |
| **PlayLatinSRC** | Latino, Castellano, Subtitulado | IMDb | Selector de idioma y servidores (Dropload, Supervideo, Doodstream, Mixdrop). En series abre la lista de episodios |
| **EmbedWave** | Español, Latino, Subtitulado, VO | TMDb | API gratuita sin anuncios inyectados, multi-servidor con cambio en vivo |
| **BingeAPI** | Español, Latino, Subtitulado, VO | IMDb | +100.000 películas y +540.000 episodios, 12 servidores con conmutación automática |
| **VidCore** | Español, Subtitulado, VO | TMDb | Player 4K sin anuncios, subtítulos en 30+ idiomas y audio en español |

### Descartados en la prueba

- **UnLimPlay**: muestra prerroll ("Anuncio 1 de 1") a pesar de anunciar "sin publicidad".
- **Embed69, 2Embed, VidSrc (todos los dominios), Vidlink, Videasy, AutoEmbed, Embed.su**: anuncios, popups o popunders.
- **MultiEmbed Clean**: HTTP 500 en el momento de la prueba.
- **VidSrc.pm**: dominio caído (404).

Los dominios y la disponibilidad cambian con frecuencia; si un servidor deja de cargar, se puede probar otro desde el reproductor.

## Ejecutar

Requiere Node.js 22+.

```bash
npm start
# http://localhost:3000
```

También se puede servir la carpeta `public/` con cualquier servidor estático.

Variables de entorno: `PORT` (por defecto `3000`) y `HOST` (por defecto `0.0.0.0`).

## Estructura

```
public/
  index.html          Shell de la SPA
  css/styles.css      Diseño responsive
  js/api.js           Cliente Cinemeta + catálogo demo sin conexión
  js/providers.js     Índice de servidores y construcción de URLs
  js/store.js         Favoritos, preferencias y servidores personalizados
  js/ui.js            Utilidades de interfaz, toasts y modales
  js/app.js           Router (hash) y vistas
server.js             Servidor estático sin dependencias
```

## Agregar un servidor

Desde **Configuración → Servidores personalizados**:

- Nombre: `Mi servidor`
- URL películas: `https://ejemplo.com/embed/movie/{imdb}`
- URL series: `https://ejemplo.com/embed/tv/{imdb}/{s}/{e}`
- Idiomas: `Latino, Español, Subtitulado`

Las plantillas admiten `{imdb}`, `{s}` (temporada) y `{e}` (episodio). Embed69 usa episodios con dos dígitos; el reproductor los rellena automáticamente si el proveedor lo indica.

## Aviso legal

StreamFlix no aloja, sube ni distribuye contenido. Es un índice de reproductores embebidos de terceros y los enlaces se generan en el navegador del usuario. Verifica la legislación de tu país antes de reproducir contenido protegido por derechos de autor.
