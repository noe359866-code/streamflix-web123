'use strict';

/**
 * Portada de instalación del addon (en español).
 * Sin demos y sin configurador: solo instalar y listo.
 */

const { PROVIDERS } = require('./providers');

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 80% -10%, #24365e 0%, transparent 60%),
                radial-gradient(900px 500px at -10% 110%, #3b1d5e 0%, transparent 55%),
                #0b0e17; color:#e8ecf4; min-height:100vh; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 48px 20px 64px; }
  h1 { font-size: clamp(30px, 6vw, 46px); margin: 6px 0 8px; line-height:1.1; }
  h1 .grad { background: linear-gradient(90deg,#7dd3fc,#c4b5fd,#fda4af);
    -webkit-background-clip:text; background-clip:text; color:transparent; }
  p.lead { color:#b9c2d5; font-size:17px; line-height:1.55; }
  .langs { display:flex; gap:10px; flex-wrap:wrap; margin:18px 0 6px; }
  .chip { background:#151b2d; border:1px solid #26304d; border-radius:999px;
    padding:8px 14px; font-weight:600; font-size:14px; }
  .card { background:rgba(21,27,45,.82); border:1px solid #26304d; border-radius:18px;
    padding:22px; margin:22px 0; backdrop-filter: blur(6px); }
  .btn { display:inline-block; background:linear-gradient(90deg,#2563eb,#7c3aed);
    color:#fff; text-decoration:none; font-weight:700; padding:14px 22px;
    border-radius:14px; border:0; cursor:pointer; font-size:16px; }
  .btn.secondary { background:#1c2745; border:1px solid #334273; }
  .btn:active { transform: translateY(1px); }
  code.url { display:block; background:#0a0f1e; border:1px dashed #334273; color:#93c5fd;
    padding:12px 14px; border-radius:12px; word-break:break-all; font-size:13.5px; margin:12px 0; }
  ul { color:#b9c2d5; line-height:1.7; padding-left:20px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:640px){ .grid{ grid-template-columns:1fr; } }
  .mini { background:#10162a; border:1px solid #22305a; border-radius:14px; padding:14px 16px; }
  .mini b{ color:#fff; }
  footer { color:#72809d; font-size:13px; margin-top:34px; line-height:1.6; }
  a { color:#93c5fd; }
`;

function renderLanding({ base, manifest }) {
  const manifestUrl = `${base}/manifest.json`;
  const installUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');
  const webInstall = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`;
  const sourceLinks = PROVIDERS
    .map((p) => `<a href="${p.baseUrl}" target="_blank" rel="noopener">${p.name}</a>`)
    .join(' · ');
  const sourceNames = PROVIDERS.map((p) => p.name).join(', ');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Anime Español Multi · Addon para Stremio</title><style>${STYLE}</style></head>
<body><div class="wrap">
    <div style="font-size:15px;color:#93c5fd;font-weight:700;letter-spacing:.08em">ADDON PARA STREMIO</div>
    <h1>🌸 Anime <span class="grad">en español</span></h1>
    <p class="lead">Addon <b>solo de streams</b> con <b>${PROVIDERS.length} proveedores</b> (${sourceNames}). Busca en las webs el anime que abras desde cualquier catálogo de Stremio (Cinemeta, Kitsu…) y te ofrece sus servidores en español, leídos en vivo. Sin catálogos propios y <b>sin nada que configurar</b>.</p>
    <div class="langs">
      <span class="chip">▶️ Solo streams</span>
      <span class="chip">🌐 ${PROVIDERS.length} proveedores</span>
      <span class="chip">💬 Sub Español</span>
      <span class="chip">🌎 Español Latino</span>
      <span class="chip">🇪🇸 Castellano</span>
      <span class="chip">🎬 IMDb · Kitsu · MAL</span>
      <span class="chip">🚫 Sin ajustes</span>
    </div>

    <div class="card">
      <h2 style="margin-top:0">📥 Instalar en Stremio</h2>
      <p style="color:#b9c2d5;line-height:1.6">Con Stremio instalado en este dispositivo, pulsa el botón. Si no funciona, copia la URL del manifiesto y pégala en <i>Stremio → Complementos → buscar/instalar por URL</i>.</p>
      <p style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn" href="${installUrl}">🚀 Instalar addon</a>
        <a class="btn secondary" href="${webInstall}" target="_blank" rel="noopener">🌐 Abrir en Stremio Web</a>
      </p>
      <code class="url" id="manifestUrl">${manifestUrl}</code>
      <button class="btn secondary" onclick="navigator.clipboard.writeText(document.getElementById('manifestUrl').textContent).then(()=>{this.textContent='✅ ¡Copiado!';setTimeout(()=>this.textContent='📋 Copiar URL del manifiesto',1800)})">📋 Copiar URL del manifiesto</button>
    </div>

    <div class="card">
      <h2 style="margin-top:0">▶️ Cómo se usa (solo streams)</h2>
      <div class="grid">
        <div class="mini"><b>En 3 pasos</b><ul>
          <li>1️⃣ Instala este addon (botón de arriba). Nada de ajustar opciones.</li>
          <li>2️⃣ Abre un anime desde <b>cualquier catálogo</b> que ya tengas en Stremio (el oficial Cinemeta, Kitsu, etc.).</li>
          <li>3️⃣ En la lista de fuentes del episodio elige proveedor e idioma: p. ej. <b>AnimeJara · 🌎 Latino</b>, <b>Latanime · 🇪🇸 Castellano</b> o <b>AnimeD23 · 💬 Sub</b>.</li>
        </ul>
        <p style="color:#72809d;font-size:13px;margin:0">IDs aceptados: IMDb <code>tt…</code> (Cinemeta), <code>kitsu:…</code> y <code>mal:…</code>. Se mapea temporada/episodio al formato real de cada web (absoluto, por temporada o SxE).</p></div>
        <div class="mini"><b>Proveedores e idiomas</b>
        <ul>
          <li><b>EstrenosAnime</b>: una ficha por idioma (Sub/Latino/Castellano).</li>
          <li><b>InfinityAnime</b>: una ficha, grupos Sub/Dub (latino).</li>
          <li><b>AnimeJara</b>: temporadas agrupadas, pestañas Latino · Japonés(Sub) · Castellano.</li>
          <li><b>Latanime</b>: fichas por idioma (Latino/Castellano/Sub).</li>
          <li><b>AnimeD23</b>: una ficha, idiomas por episodio (Lat/Sub…).</li>
        </ul>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">▶️ Reproducción</h2>
      <ul>
        <li>Se leen los servidores reales de cada web (Filemoon, Voe, MP4Upload, VidHide, StreamTape, DoodStream, OK.ru, MixDrop…).</li>
        <li>El resolvedor intenta extraer el <b>vídeo directo</b> (.m3u8/.mp4) con módulos por reproductor; si un host no lo permite, aparece como <i>«↗️ Abrir en el navegador»</i>.</li>
        <li>Siempre tendrás la página oficial del episodio en cada proveedor que lo tenga.</li>
      </ul>
      <p style="color:#72809d;font-size:14px">Diagnóstico: <a href="/health">/health</a> · <a href="/debug/map?id=tt0388629:1:1&amp;type=series">/debug/map</a> · <a href="/debug/search?q=One+Piece">/debug/search</a> · Fuentes: ${sourceLinks}</p>
    </div>

    <footer>Addon no oficial, sin ánimo de lucro. Ningún vídeo se aloja en este servidor: todo el contenido pertenece a sus respectivos autores y se enlaza desde las webs fuente, que a su vez enlazan contenido de terceros. Úsalo solo donde sea legal en tu país.<br><br>${manifest.name} v${manifest.version} · id: <code>${manifest.id}</code></footer>
</div></body></html>`;
}

module.exports = { renderLanding };
