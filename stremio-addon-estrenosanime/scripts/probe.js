'use strict';

/**
 * Herramienta de diagnóstico (requiere salida a internet normal).
 *
 *   node scripts/probe.js search "One Piece" [pagina]            (EstrenosAnime)
 *   node scripts/probe.js search-inf "One Piece"                  (InfinityAnime)
 *   node scripts/probe.js search-extra <animejara|latanime|animed23> "One Piece"
 *   node scripts/probe.js search-all "One Piece"                  (los 5 proveedores)
 *   node scripts/probe.js detail <slug>                           (EstrenosAnime)
 *   node scripts/probe.js watch <slug> <ep> [--provider=<id>] [--season=<n>]
 *                                           [--movie] [--resolve] [--infinity]
 *   node scripts/probe.js resolve <url-embed> [referer]           (resolver por host)
 *   node scripts/probe.js map <tt...|kitsu:...|mal:...> [series|movie|anime]
 *   node scripts/probe.js catalog <ruta-del-sitio> [pagina]       ej: /ultimo-castellano
 *
 * Imprime en JSON exactamente lo que cada proveedor ve en su web.
 */

const scraper = require('../src/scraper');
const infinity = require('../src/infinity');
const idmap = require('../src/idmap');
const providers = require('../src/providers');
const { resolveEmbed, classifyHost } = require('../src/extractors');
const { ROUTES } = require('../src/config');

function itemRow(i) {
  return {
    slug: i.slug,
    title: i.title,
    idioma: i.lang ? i.lang.label : undefined,
    latino: i.hasLat,
    multiTemporada: i.multiSeason || undefined,
    tipo: i.siteType,
    year: i.year,
    ep: i.epCurrent,
    fuente: i.source,
    poster: i.poster,
  };
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const print = (obj) => console.log(JSON.stringify(obj, null, 2));
  const getOpt = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };

  switch (cmd) {
    case 'search': {
      const q = args[0] || 'naruto';
      const page = parseInt(args[1], 10) || 1;
      const items = await scraper.fetchListingPage(ROUTES.search(q), page);
      print({ provider: 'estrenos', count: items.length, results: items.map(itemRow) });
      break;
    }
    case 'search-inf': {
      const items = await infinity.searchInf(args[0] || 'naruto');
      print({ provider: 'infinity', count: items.length, results: items.map(itemRow) });
      break;
    }
    case 'search-extra': {
      const provider = providers.PROVIDERS_BY_ID[String(args[0] || '').toLowerCase()];
      if (!provider) throw new Error(`Proveedor desconocido: ${args[0]} (usa ${providers.PROVIDERS.map((p) => p.id).join(', ')})`);
      const items = await provider.search(args[1] || 'naruto');
      print({ provider: provider.id, count: items.length, results: items.map(itemRow) });
      break;
    }
    case 'search-all': {
      const q = args[0] || 'naruto';
      const out = {};
      await Promise.all(providers.PROVIDERS.map(async (p) => {
        try {
          const items = await p.search(q);
          out[p.id] = { count: items.length, results: items.map(itemRow) };
        } catch (err) {
          out[p.id] = { error: err.message };
        }
      }));
      print(out);
      break;
    }
    case 'catalog': {
      const items = await scraper.fetchListingPage(args[0] || '/popular', parseInt(args[1], 10) || 1);
      print({ provider: 'estrenos', count: items.length, results: items.map(itemRow) });
      break;
    }
    case 'detail': {
      print(await scraper.getMetaDetail(args[0] || 'one-piece'));
      break;
    }
    case 'map': {
      const id = args[0] || 'tt0388629:1:1';
      const type = args[1] || 'series';
      const parsed = idmap.parseExternalStreamId(id);
      if (!parsed) throw new Error(`ID no soportado: ${id}`);
      print({ parsed, ...(await idmap.resolveExternal(parsed, type, {})) });
      break;
    }
    case 'watch': {
      const providerId = (getOpt('provider') || (args.includes('--infinity') ? 'infinity' : 'estrenos')).toLowerCase();
      const provider = providers.PROVIDERS_BY_ID[providerId];
      if (!provider) throw new Error(`Proveedor desconocido: ${providerId}`);
      const defaults = { estrenos: 'one-piece', infinity: 'one-piece-tv', animejara: 'one-piece-tv', latanime: 'one-piece', animed23: 'black-clover' };
      const slug = args.find((a) => !a.startsWith('--')) || defaults[providerId] || 'one-piece';
      const epArg = args.filter((a) => !a.startsWith('--'))[1];
      const ep = parseInt(epArg, 10) || 1;
      const season = parseInt(getOpt('season') || '1', 10) || 1;
      const isMovie = args.includes('--movie');
      const watch = await provider.getWatchRaw(slug, ep, { season, isMovie });
      const out = { provider: providerId, slug, ep, season, isMovie, watchUrl: provider.watchUrl(slug, ep, { season, isMovie }), ...watch };
      if (args.includes('--resolve') && watch.embeds && watch.embeds[0]) {
        console.error(`Resolviendo primer embed (${classifyHost(watch.embeds[0].url)}): ${watch.embeds[0].url}`);
        out.resolvedFirstEmbed = await resolveEmbed(
          watch.embeds[0].url,
          watch.finalUrl || `${provider.baseUrl}/`
        ).catch((e) => ({ error: e.message }));
      }
      print(out);
      break;
    }
    case 'resolve': {
      const url = args[0];
      if (!url) throw new Error('Falta la URL del embed');
      const referer = args[1] || 'https://example.com/';
      print({ embed: url, hostKind: classifyHost(url), resolved: await resolveEmbed(url, referer) });
      break;
    }
    default:
      console.error('Uso: node scripts/probe.js <search|search-inf|search-extra|search-all|detail|watch|resolve|map|catalog> ...');
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exitCode = 1;
});
