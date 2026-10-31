'use strict';

/**
 * Páginas HTML del addon: portada de instalación y /configure propio
 * (en español). El /configure genera la URL de manifiesto con la
 * configuración codificada, tal y como espera stremio-addon-sdk:
 *   https://host/{JSON-codificado}/manifest.json
 */

const { BASE_URL, INF_BASE_URL, DEMO_FALLBACK } = require('./config');

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
    ? `<div class="badge-demo">⚠️ <b>Modo DEMO activado</b> en este servidor (sin salida directa a las webs fuente): se usan datos reales de ejemplo. En un despliegue normal todo se lee en vivo de estrenosanime.net e infinityanime.net.</div>`
    : '';
  return pageShell(
    'Anime Español Multi · Addon para Stremio',
    `
    ${demoBadge}
    <div style="font-size:15px;color:#93c5fd;font-weight:700;letter-spacing:.08em">ADDON PARA STREMIO</div>
    <h1>🌸 Anime <span class="grad">en español</span></h1>
    <p class="lead">Addon <b>solo de streams</b> con <b>dos proveedores</b>: busca en <b>estrenosanime.net</b> e <b>infinityanime.net</b> el anime que abras desde cualquier otro catálogo de Stremio (Cinemeta, Kitsu…) y te ofrece sus servidores en español, leídos en vivo de las webs. No añade catálogos ni fichas propias.</p>
    <div class="langs">
      <span class="chip">▶️ Solo streams</span>
      <span class="chip">🌐 EstrenosAnime + InfinityAnime</span>
      <span class="chip">💬 Sub Español</span>
      <span class="chip">🌎 Español Latino</span>
      <span class="chip">🇪🇸 Castellano</span>
      <span class="chip">🎬 IMDb · Kitsu · MAL</span>
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
      <h2 style="margin-top:0">▶️ Cómo se usa (solo streams)</h2>
      <div class="grid">
        <div class="mini"><b>En 3 pasos</b><ul>
          <li>1️⃣ Instala este addon (botón de arriba).</li>
          <li>2️⃣ Abre un anime desde <b>cualquier catálogo</b> que ya tengas en Stremio (el oficial Cinemeta, Kitsu, etc.).</li>
          <li>3️⃣ En la lista de fuentes del episodio elige proveedor e idioma: <b>EstrenosAnime</b> o <b>InfinityAnime</b> · 💬 Sub · 🌎 Latino · 🇪🇸 Castellano.</li>
        </ul>
        <p style="color:#72809d;font-size:13px;margin:0">IDs aceptados: IMDb <code>tt…</code> (Cinemeta), <code>kitsu:…</code> y <code>mal:…</code>. El addon busca el título en ambas webs y mapea temporada/episodio a la ficha correcta de cada una.</p></div>
        <div class="mini"><b>Proveedores e idiomas</b>
        <ul>
          <li><b>EstrenosAnime</b>: separa cada idioma como ficha distinta («(Latino)», «(Castellano)» o sin sufijo = Sub) — es quien aporta el <b>Castellano</b>.</li>
          <li><b>InfinityAnime</b>: una ficha por título con grupos <i>Sub</i> y <i>Dub</i> (latino) en el mismo episodio.</li>
          <li>En <a href="/configure">⚙️ Configurar</a> puedes limitar proveedores y/o idioma.</li>
        </ul>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">▶️ Reproducción</h2>
      <ul>
        <li>Para cada episodio se leen los servidores reales de cada web (Multiserver, Filemoon, Vidara, MP4Upload, StreamTape…).</li>
        <li>En modo <b>Auto</b> el addon intenta extraer el <b>vídeo directo</b> (.m3u8/.mp4) para reproducirlo dentro de Stremio; si un servidor no lo permite, aparece como <i>«↗️ Abrir en el navegador»</i>.</li>
        <li>Siempre tendrás las páginas oficiales del episodio: <b>«🌐 estrenosanime.net»</b> y/o <b>«🌐 infinityanime.net»</b>.</li>
      </ul>
      <p style="color:#72809d;font-size:14px">Diagnóstico: <a href="/health">/health</a> · <a href="/debug/map?id=tt0388629:1:1&amp;type=series">/debug/map</a> · <a href="/debug/watch?slug=one-piece&amp;ep=1">/debug/watch (Estrenos)</a> · <a href="/debug/watch?provider=infinity&amp;slug=one-piece-tv&amp;ep=1">/debug/watch (Infinity)</a> · Fuentes: <a href="${BASE_URL}" target="_blank" rel="noopener">estrenosanime.net</a> · <a href="${INF_BASE_URL}" target="_blank" rel="noopener">infinityanime.net</a></p>
    </div>

    <footer>Addon no oficial, sin ánimo de lucro. Ningún vídeo se aloja en este servidor: todo el contenido pertenece a sus respectivos autores y se enlaza desde estrenosanime.net (la propia web indica que tampoco aloja vídeos, solo enlaza contenido de terceros). Úsalo solo donde sea legal en tu país.<br><br>${manifest.name} v${manifest.version} · id: <code>${manifest.id}</code></footer>
    `
  );
}

function renderConfigure({ base }) {
  return pageShell(
    '⚙️ Configurar · Anime Español Multi',
    `
    <h1 style="font-size:34px">⚙️ Configurar <span class="grad">Anime Español Multi</span></h1>
    <p class="lead">Elige tus preferencias y genera tu URL de instalación personalizada. Puedes volver aquí cuando quieras y reinstalar con otros ajustes.</p>
    <div class="card">
      <label for="proveedores">🌐 Proveedores</label>
      <select id="proveedores">
        <option value="Todos">Todos (EstrenosAnime + InfinityAnime)</option>
        <option value="EstrenosAnime">Solo EstrenosAnime</option>
        <option value="InfinityAnime">Solo InfinityAnime</option>
      </select>
      <p style="color:#72809d;font-size:13px;margin:6px 0 0">De qué webs quieres recibir streams. Con «Todos» verás un grupo por proveedor e idioma disponible.</p>

      <label for="idioma">🗣️ Idioma preferido</label>
      <select id="idioma">
        <option value="Todos">Todos (Sub + Latino + Castellano)</option>
        <option value="Subtitulado">💬 Solo Subtitulado</option>
        <option value="Latino">🌎 Solo Español Latino</option>
        <option value="Castellano">🇪🇸 Solo Castellano</option>
      </select>
      <p style="color:#72809d;font-size:13px;margin:6px 0 0">Limita qué idiomas se devuelven. Nota: InfinityAnime ofrece Sub y Latino (Dub); el Castellano lo aporta EstrenosAnime.</p>

      <label for="resolver">▶️ Reproducción</label>
      <select id="resolver">
        <option value="Auto">Auto — vídeo directo dentro de Stremio cuando sea posible</option>
        <option value="Solo externo">Solo externo — abrir siempre el servidor en el navegador</option>
      </select>

      <div class="check">
        <input type="checkbox" id="descargas">
        <span>⬇️ Mostrar también los enlaces de <b>descarga</b> (Mega, 1fichier, Krakenfiles, Gofile…) como opciones externas</span>
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
          proveedores: document.getElementById('proveedores').value,
          idioma: document.getElementById('idioma').value,
          resolver: document.getElementById('resolver').value
        };
        if (document.getElementById('descargas').checked) cfg.descargas = 'on';
        const enc = encodeURIComponent(JSON.stringify(cfg));
        const url = base + '/' + enc + '/manifest.json';
        document.getElementById('out').textContent = url;
        document.getElementById('install').href = url.replace(/^https?:\\/\\//, 'stremio://');
      }
      ['proveedores','idioma','resolver','descargas'].forEach(id => document.getElementById(id).addEventListener('change', build));
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
