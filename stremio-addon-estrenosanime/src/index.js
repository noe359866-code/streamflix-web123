'use strict';

/**
 * Servidor del addon.
 *  - Express con portada propia (/), configuración (/configure),
 *    salud (/health) y diagnóstico (/debug/*).
 *  - El router oficial de stremio-addon-sdk sirve /manifest.json y
 *    ÚNICAMENTE el recurso /stream/... (addon solo-stream, sin
 *    catálogos ni metas), también con prefijo de configuración
 *    /{config}/manifest.json.
 */

const express = require('express');
const { getRouter } = require('stremio-addon-sdk');
const { builder, manifest } = require('./addon');
const { renderLanding, renderConfigure } = require('./landing');
const scraper = require('./scraper');
const providers = require('./providers');
const idmap = require('./idmap');
const { resolveEmbed } = require('./extractors');
const { BASE_URL, INF_BASE_URL, DEBUG_ENABLED, DEMO_FALLBACK } = require('./config');

const PORT = Number(process.env.PORT || 7000);
const app = express();
app.disable('x-powered-by');

function requestBase(req) {
  const proto =
    req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host =
    req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${String(proto).split(',')[0]}://${String(host).split(',')[0]}`;
}

app.get('/favicon.ico', (_req, res) => res.status(204).end());

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    addon: manifest.name,
    version: manifest.version,
    resources: manifest.resources,
    sources: providers.PROVIDERS.map((p) => ({ id: p.id, name: p.name, url: p.baseUrl })),
    source: BASE_URL,
    demoFallback: DEMO_FALLBACK,
    time: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.type('html').send(renderLanding({ base: requestBase(req), manifest }));
});

app.get('/configure', (req, res) => {
  res.type('html').send(renderConfigure({ base: requestBase(req) }));
});

/* ------------------------- Diagnóstico ------------------------- */
/* Útil para comprobar qué está viendo el scraper en tu servidor.  */
/* Desactívalo en producción con DEBUG=0 si no lo quieres público. */
if (DEBUG_ENABLED) {
  const wrap = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  };

  // /debug/watch?slug=one-piece&ep=1[&provider=infinity][&resolve=1]
  app.get(
    '/debug/watch',
    wrap(async (req) => {
      const providerId = String(req.query.provider || 'estrenos').toLowerCase();
      const provider = providers.PROVIDERS_BY_ID[providerId];
      if (!provider) return { ok: false, error: `Proveedor desconocido: ${providerId} (usa estrenos o infinity)` };
      const slug = String(req.query.slug || (providerId === 'infinity' ? 'one-piece-tv' : 'one-piece'));
      const ep = parseInt(req.query.ep, 10) || 1;
      const watch = await provider.getWatchRaw(slug, ep);
      const out = { ok: true, provider: providerId, slug, ep, watch };
      if (req.query.resolve === '1' && watch.embeds && watch.embeds[0]) {
        out.resolvedFirstEmbed = await resolveEmbed(
          watch.embeds[0].url,
          watch.finalUrl || `${provider.baseUrl}/`
        ).catch((e) => ({ error: e.message }));
      }
      return out;
    })
  );

  // /debug/map?id=tt0388629:1:1&type=series — cómo se mapea un ID externo
  // (IMDb/Kitsu/MAL) a las fichas por idioma de estrenosanime.net
  app.get(
    '/debug/map',
    wrap(async (req) => {
      const id = String(req.query.id || 'tt0388629:1:1');
      const type = String(req.query.type || 'series');
      const parsed = idmap.parseExternalStreamId(id);
      if (!parsed) return { ok: false, error: `ID no soportado: ${id} (usa tt…, kitsu:… o mal:…)` };
      const resolved = await idmap.resolveExternal(parsed, type, {});
      return { ok: true, id, type, parsed, title: resolved.title, titles: resolved.titles, busquedas: resolved.queries, contexto: resolved.ctx, jobs: resolved.jobs };
    })
  );

  // /debug/detail?slug=one-piece-latino
  app.get(
    '/debug/detail',
    wrap(async (req) => {
      const slug = String(req.query.slug || 'one-piece');
      return { ok: true, meta: await scraper.getMetaDetail(slug) };
    })
  );

  // /debug/search?q=naruto[&provider=infinity|estrenos|all]
  app.get(
    '/debug/search',
    wrap(async (req) => {
      const q = String(req.query.q || 'naruto');
      const wanted = String(req.query.provider || 'all').toLowerCase();
      const ids = wanted === 'all'
        ? providers.PROVIDERS.map((p) => p.id)
        : [wanted].filter((id) => providers.PROVIDERS_BY_ID[id]);
      if (!ids.length) return { ok: false, error: `Proveedor desconocido: ${wanted}` };
      const perProvider = {};
      await Promise.all(ids.map(async (pid) => {
        try {
          const items = await providers.PROVIDERS_BY_ID[pid].search(q);
          perProvider[pid] = items.map((i) => ({
            slug: i.slug,
            title: i.title,
            idioma: i.lang ? i.lang.label : (i.hasLat ? 'Sub + Latino (ficha)' : 'Sub (ficha)'),
            tipo: i.siteType,
            year: i.year,
            ep: i.epCurrent,
            poster: i.poster,
            fuente: i.source || 'buscador',
          }));
        } catch (err) {
          perProvider[pid] = { error: err.message };
        }
      }));
      return { ok: true, q, providers: perProvider };
    })
  );
}

/* ------------------- Router oficial de Stremio ------------------- */
app.use(getRouter(builder.getInterface()));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌸 ${manifest.name} v${manifest.version}`);
  console.log(`📡 Fuentes: ${BASE_URL} · ${INF_BASE_URL}${DEMO_FALLBACK ? '  (DEMO_FALLBACK=1)' : ''}`);
  console.log(`🚀 Addon escuchando en http://0.0.0.0:${PORT}/`);
  console.log(`📥 Manifiesto: http://localhost:${PORT}/manifest.json`);
  console.log(`⚙️  Configurar: http://localhost:${PORT}/configure`);
});
