'use strict';

/**
 * Servidor del addon.
 *  - Express con portada propia (/), salud (/health) y diagnóstico
 *    (/debug/*). Sin página de configuración (no hay ajustes).
 *  - El router oficial de stremio-addon-sdk sirve /manifest.json y
 *    ÚNICAMENTE el recurso /stream/... (addon solo-stream).
 */

const express = require('express');
const { getRouter } = require('stremio-addon-sdk');
const { builder, manifest } = require('./addon');
const { renderLanding } = require('./landing');
const scraper = require('./scraper');
const providers = require('./providers');
const idmap = require('./idmap');
const { resolveEmbedDetailed, getHostBlockSnapshot } = require('./extractors');
const { parseClientIp, runWithRequestContext } = require('./request-context');
const { DEBUG_ENABLED, EXTERNAL_RESOLVER_URL, FORWARD_CLIENT_IP, TRUST_PROXY } = require('./config');

const PORT = Number(process.env.PORT || 7000);
const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY) app.set('trust proxy', true);

// Contexto efímero por petición: permite que, SOLO si un reproductor
// bloquea la IP del datacenter, el resolver reintente señalando la IP
// pública de quien pidió el stream (X-Forwarded-For). No se almacena
// en disco, no se loguea y desaparece al terminar la petición.
app.use((req, res, next) => runWithRequestContext(
  { clientIp: parseClientIp(req, { trustProxy: TRUST_PROXY }) },
  next
));

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
    externalResolver: Boolean(EXTERNAL_RESOLVER_URL),
    clientIpRetry: Boolean(FORWARD_CLIENT_IP),
    blockedHosts: getHostBlockSnapshot().length,
    time: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.type('html').send(renderLanding({ base: requestBase(req), manifest }));
});

/* ------------------------- Diagnóstico ------------------------- */
/* Útil para comprobar qué están viendo los proveedores en tu      */
/* servidor. Desactívalo en producción con DEBUG=0 si quieres.     */
if (DEBUG_ENABLED) {
  const wrap = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  };

  const DEFAULT_SLUGS = {
    estrenos: 'one-piece',
    infinity: 'one-piece-tv',
    animejara: 'one-piece-tv',
    latanime: 'one-piece',
    animed23: 'black-clover',
  };

  // /debug/watch?provider=animejara&slug=one-piece-tv&ep=1&season=1[&resolve=1]
  app.get(
    '/debug/watch',
    wrap(async (req) => {
      const providerId = String(req.query.provider || 'estrenos').toLowerCase();
      const provider = providers.PROVIDERS_BY_ID[providerId];
      if (!provider) {
        return {
          ok: false,
          error: `Proveedor desconocido: ${providerId} (usa ${providers.PROVIDERS.map((p) => p.id).join(', ')})`,
        };
      }
      const slug = String(req.query.slug || DEFAULT_SLUGS[providerId] || 'one-piece');
      const ep = parseInt(req.query.ep, 10) || 1;
      const season = parseInt(req.query.season, 10) || 1;
      const isMovie = String(req.query.type || '') === 'movie';
      const watch = await provider.getWatchRaw(slug, ep, { season, isMovie });
      const out = { ok: true, provider: providerId, slug, ep, season, watch };
      if (req.query.resolve === '1' && watch.embeds && watch.embeds[0]) {
        out.resolvedFirstEmbed = await resolveEmbedDetailed(
          watch.embeds[0].url,
          watch.finalUrl || `${provider.baseUrl}/`
        ).catch((e) => ({ ok: false, error: e.message }));
      }
      return out;
    })
  );

  // /debug/hosts — reproductores que están bloqueando/enfriando a este hosting
  app.get(
    '/debug/hosts',
    wrap(async () => ({
      ok: true,
      externalResolver: Boolean(EXTERNAL_RESOLVER_URL),
      clientIpRetry: Boolean(FORWARD_CLIENT_IP),
      hosts: getHostBlockSnapshot(),
    }))
  );

  // /debug/map?id=tt0388629:1:1&type=series — mapeo ID externo -> trabajos
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

  // /debug/detail?slug=one-piece-latino (solo EstrenosAnime, histórico)
  app.get(
    '/debug/detail',
    wrap(async (req) => {
      const slug = String(req.query.slug || 'one-piece');
      return { ok: true, meta: await scraper.getMetaDetail(slug) };
    })
  );

  // /debug/search?q=One+Piece[&provider=<id>|all]
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
            idioma: i.lang ? i.lang.label : 'multi (se resuelve en el episodio)',
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
  console.log(`📡 Fuentes: ${providers.PROVIDERS.map((p) => p.name).join(' · ')}`);
  console.log(`🚀 Addon escuchando en http://0.0.0.0:${PORT}/`);
  console.log(`📥 Manifiesto: http://localhost:${PORT}/manifest.json`);
});
