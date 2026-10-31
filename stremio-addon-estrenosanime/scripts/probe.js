'use strict';

/**
 * Herramienta de diagnóstico (requiere salida a internet normal).
 *
 *   node scripts/probe.js search "One Piece" [pagina]        (EstrenosAnime)
 *   node scripts/probe.js search-inf "One Piece"              (InfinityAnime)
 *   node scripts/probe.js detail <slug>
 *   node scripts/probe.js watch  <slug> <episodio> [--resolve] [--infinity]
 *   node scripts/probe.js map    <tt...|kitsu:...|mal:...> [series|movie|anime]
 *   node scripts/probe.js catalog <ruta-del-sitio> [pagina]   ej: /ultimo-castellano
 *
 * Imprime en JSON exactamente lo que cada proveedor ve en su web.
 * Ideal para depurar en tu máquina/servidor si las webs cambian algo.
 */

const scraper = require('../src/scraper');
const infinity = require('../src/infinity');
const idmap = require('../src/idmap');
const { resolveEmbed } = require('../src/extractors');
const { ROUTES, BASE_URL, INF_BASE_URL } = require('../src/config');

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const print = (obj) => console.log(JSON.stringify(obj, null, 2));

  switch (cmd) {
    case 'search': {
      const q = args[0] || 'naruto';
      const page = parseInt(args[1], 10) || 1;
      const items = await scraper.fetchListingPage(ROUTES.search(q), page);
      print({
        count: items.length,
        results: items.map((i) => ({
          slug: i.slug, title: i.title, idioma: i.lang.label,
          tipo: i.siteType, year: i.year, ep: i.epCurrent, poster: i.poster,
        })),
      });
      break;
    }
    case 'search-inf': {
      const q = args[0] || 'naruto';
      const items = await infinity.searchInf(q);
      print({
        count: items.length,
        results: items.map((i) => ({
          slug: i.slug, title: i.title, latino: i.hasLat,
          tipo: i.siteType, year: i.year, ep: i.epCurrent, fuente: i.source, poster: i.poster,
        })),
      });
      break;
    }
    case 'catalog': {
      const items = await scraper.fetchListingPage(args[0] || '/popular', parseInt(args[1], 10) || 1);
      print({
        count: items.length,
        results: items.map((i) => ({
          slug: i.slug, title: i.title, idioma: i.lang.label, tipo: i.siteType, year: i.year, ep: i.epCurrent,
        })),
      });
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
      const useInf = args.includes('--infinity') || args.includes('--provider=infinity');
      const slug = args[0] || (useInf ? 'one-piece-tv' : 'one-piece');
      const ep = parseInt(args[1], 10) || 1;
      const watch = useInf
        ? await infinity.getWatchInf(slug, ep)
        : await scraper.getWatch(slug, ep);
      const out = { provider: useInf ? 'infinity' : 'estrenos', ...watch };
      if (args.includes('--resolve') && watch.embeds[0]) {
        console.error(`Resolviendo primer embed: ${watch.embeds[0].url}`);
        out.resolvedFirstEmbed = await resolveEmbed(
          watch.embeds[0].url,
          watch.finalUrl || (useInf ? INF_BASE_URL : BASE_URL)
        ).catch((e) => ({ error: e.message }));
      }
      print(out);
      break;
    }
    default:
      console.error('Uso: node scripts/probe.js <search|search-inf|detail|watch|map|catalog> ...');
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exitCode = 1;
});
