'use strict';

/**
 * Páginas HTML del addon: portada de instalación y /configure propio
 * (en español). El /configure genera la URL de manifiesto con la
 * configuración codificada, tal y como espera stremio-addon-sdk:
 *   https://host/{JSON-codificado}/manifest.json
 */

const { BASE_URL, DEMO_FALLBACK } = require('./config');

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 80% -10%, #24365e 0%, transparent 60%),
                radial-gradient(900px 500px at -10% 110%, #3b1d5e 0%, transparent 55%),
                #0b0e17; color:#e8ecf4; min-height:100vh; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 48px 20px 64px; }
  .badge-demo { background:#7c2d12; border:1px solid #ea580c; color:#ffedd5;
    padding:10px 14px; border-radius:12px; font-size:14px; margin-bottom:18px; }
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
  label { display:block; margin:16px 0 6px; font-weight:600; }
  select { width:100%; padding:12px; border-radius:12px; background:#0a0f1e; color:#fff;
    border:1px solid #334273; font-size:15px; }
  .check { display:flex; gap:10px; align-items:flex-start; margin-top:16px; color:#dbe2f0; }
  .check input { margin-top:3px; width:18px; height:18px; }
  footer { color:#72809d; font-size:13px; margin-top:34px; line-height:1.6; }
  a { color:#93c5fd; }
`;

function pageShell(title, body) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>${STYLE}</style></head>
<body><div class="wrap">${body}</div></body></html>`;
}

function renderLanding({ base, manifest }) {
  const manifestUrl = `${base}/manifest.json`;
  const installUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');
  const webInstall = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`;
  const demoBadge = DEMO_FALLBACK
    ? `<div class="badge-demo">⚠️ <b>Modo DEMO activado</b> en este servidor (sin salida directa a estrenosanime.net): los catálogos muestran datos reales de ejemplo. En un despliegue normal todo se lee en vivo de la web.</div>`
    : '';
  return pageShell(
    'Estrenos Anime ES · Addon para Stremio',
    `
    ${demoBadge}
    <div style="font-size:15px;color:#93c5fd;font-weight:700;letter-spacing:.08em">ADDON PARA STREMIO</div>
    <h1>🌸 Estrenos Anime <span class="grad">en español</span></h1>
    <p class="lead">Todo el catálogo de <b>estrenosanime.net</b> dentro de Stremio: series y películas con sus fichas, episodios y servidores, leído en vivo de la web.</p>
    <div class="langs">
      <span class="chip">💬 Sub Español</span>
      <span class="chip">🌎 Español Latino</span>
      <span class="chip">🇪🇸 Castellano</span>
      <span class="chip">🎬 Películas</span>
      <span class="chip">🔎 Buscador</span>
    </div>

    <div class="card">
      <h2 style="margin-top:0">📥 Instalar en Stremio</h2>
      <p style="color:#b9c2d5;line-height:1.6">Con Stremio instalado en este dispositivo, pulsa el botón. Si no funciona, copia la URL del manifiesto y pégala en <i>Stremio → Complementos → buscar/instalar por URL</i>.</p>
      <p style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn" href="${installUrl}">🚀 Instalar addon</a>
        <a class="btn secondary" href="${webInstall}" target="_blank" rel="noopener">🌐 Abrir en Stremio Web</a>
        <a class="btn secondary" href="/configure">⚙️ Configurar idioma</a>
      </p>
      <code class="url" id="manifestUrl">${manifestUrl}</code>
      <button class="btn secondary" onclick="navigator.clipboard.writeText(document.getElementById('manifestUrl').textContent).then(()=>{this.textContent='✅ ¡Copiado!';setTimeout(()=>this.textContent='📋 Copiar URL del manifiesto',1800)})">📋 Copiar URL del manifiesto</button>
    </div>

    <div class="card">
      <h2 style="margin-top:0">📚 Catálogos que añade</h2>
      <div class="grid">
        <div class="mini"><b>Series</b><ul>
          <li>🔥 Populares (+ buscador)</li>
          <li>💬 Últimos episodios · Sub Español</li>
          <li>🌎 Últimos episodios · Latino</li>
          <li>🇪🇸 Últimos episodios · Castellano</li>
          <li>🆕 Agregados · 🔄 Actualizados · 📺 En emisión</li>
          <li>🎭 Por género · 🎞️ Por formato (TV/OVA/ONA)</li>
        </ul></div>
        <div class="mini"><b>Películas</b><ul>
          <li>🎬 Películas de anime (+ buscador)</li>
          <li>🎭 Películas por género</li>
        </ul>
        <b>Cómo se ve el idioma</b>
        <ul><li>La web separa cada idioma como ficha distinta: «(Latino)», «(Castellano)» o sin sufijo = subtitulado. El addon conserva ese título y marca el idioma con 💬/🌎/🇪🇸 en cada stream.</li></ul>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">▶️ Reproducción</h2>
      <ul>
        <li>Para cada episodio se leen los servidores reales de la web (normalmente <b>Multiserver</b>).</li>
        <li>En modo <b>Auto</b> el addon intenta extraer el <b>vídeo directo</b> (.m3u8/.mp4) para reproducirlo dentro de Stremio; si un servidor no lo permite, aparece como <i>«↗️ Abrir en el navegador»</i>.</li>
        <li>Siempre tendrás la opción <b>«🌐 estrenosanime.net»</b> con la página oficial del episodio.</li>
      </ul>
      <p style="color:#72809d;font-size:14px">Diagnóstico: <a href="/health">/health</a> · <a href="/debug/watch?slug=one-piece&amp;ep=1">/debug/watch?slug=one-piece&amp;ep=1</a> · Fuente: <a href="${BASE_URL}" target="_blank" rel="noopener">estrenosanime.net</a></p>
    </div>

    <footer>Addon no oficial, sin ánimo de lucro. Ningún vídeo se aloja en este servidor: todo el contenido pertenece a sus respectivos autores y se enlaza desde estrenosanime.net (la propia web indica que tampoco aloja vídeos, solo enlaza contenido de terceros). Úsalo solo donde sea legal en tu país.<br><br>${manifest.name} v${manifest.version} · id: <code>${manifest.id}</code></footer>
    `
  );
}

function renderConfigure({ base }) {
  return pageShell(
    '⚙️ Configurar · Estrenos Anime ES',
    `
    <h1 style="font-size:34px">⚙️ Configurar <span class="grad">Estrenos Anime ES</span></h1>
    <p class="lead">Elige tus preferencias y genera tu URL de instalación personalizada. Puedes volver aquí cuando quieras y reinstalar con otros ajustes.</p>
    <div class="card">
      <label for="idioma">🌐 Idioma preferido</label>
      <select id="idioma">
        <option value="Todos">Todos (Sub + Latino + Castellano)</option>
        <option value="Subtitulado">💬 Solo Subtitulado</option>
        <option value="Latino">🌎 Solo Español Latino</option>
        <option value="Castellano">🇪🇸 Solo Castellano</option>
      </select>
      <p style="color:#72809d;font-size:13px;margin:6px 0 0">Filtra los catálogos mixtos y la búsqueda. Los catálogos «Últimos episodios · …» ya vienen separados por idioma.</p>

      <label for="resolver">▶️ Reproducción</label>
      <select id="resolver">
        <option value="Auto">Auto — vídeo directo dentro de Stremio cuando sea posible</option>
        <option value="Solo externo">Solo externo — abrir siempre el servidor en el navegador</option>
      </select>

      <div class="check">
        <input type="checkbox" id="descargas">
        <span>⬇️ Mostrar también los enlaces de <b>descarga</b> (Krakenfiles, Gofile, 1fichier…) como opciones externas</span>
      </div>

      <code class="url" id="out"></code>
      <p style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn" id="install" href="#">🚀 Instalar con esta configuración</a>
        <button class="btn secondary" id="copy">📋 Copiar URL</button>
        <a class="btn secondary" href="/">⬅️ Volver</a>
      </p>
    </div>
    <footer>La configuración viaja codificada en la URL del manifiesto (así funciona Stremio): no se crea ninguna cuenta ni se guarda nada en el servidor.</footer>
    <script>
      const base = ${JSON.stringify(base)};
      function build(){
        const cfg = {
          idioma: document.getElementById('idioma').value,
          resolver: document.getElementById('resolver').value
        };
        if (document.getElementById('descargas').checked) cfg.descargas = 'on';
        const enc = encodeURIComponent(JSON.stringify(cfg));
        const url = base + '/' + enc + '/manifest.json';
        document.getElementById('out').textContent = url;
        document.getElementById('install').href = url.replace(/^https?:\\/\\//, 'stremio://');
      }
      ['idioma','resolver','descargas'].forEach(id => document.getElementById(id).addEventListener('change', build));
      document.getElementById('copy').addEventListener('click', function(){
        navigator.clipboard.writeText(document.getElementById('out').textContent)
          .then(()=>{ this.textContent='✅ ¡Copiado!'; setTimeout(()=>this.textContent='📋 Copiar URL',1800); });
      });
      build();
    </script>
    `
  );
}

module.exports = { renderLanding, renderConfigure };
