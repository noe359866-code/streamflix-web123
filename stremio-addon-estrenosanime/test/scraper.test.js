'use strict';

/**
 * Pruebas sin red: HTML de ejemplo construido con la estructura REAL
 * observada en estrenosanime.net durante la investigación
 * (tarjetas /anime/{slug}, badges SUB/LATINO/CASTELLANO, ficha con
 * etiquetas "Resumen:/Idioma:/Episodios:", /ver/ con JSON episode_id,
 * botón "Multiserver" href="javascript:;" con la URL en data-*...).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const scraper = require('../src/scraper');
const util = require('../src/util');
const extractors = require('../src/extractors');

/* ------------------------------ util ------------------------------ */

test('detectLang: slug, título y campo Idioma', () => {
  assert.equal(util.detectLang({ slug: 'one-piece-latino' }).key, 'lat');
  assert.equal(util.detectLang({ slug: 'xyz-castellano' }).key, 'cast');
  assert.equal(util.detectLang({ slug: 'one-piece' }).key, 'sub');
  assert.equal(util.detectLang({ title: 'Naruto (Latino)' }).key, 'lat');
  assert.equal(util.detectLang({ idiomaField: 'Castellano' }).key, 'cast');
  assert.equal(util.baseSlug('one-piece-latino'), 'one-piece');
  assert.deepEqual(util.altSlugs('one-piece-latino'), {
    sub: 'one-piece',
    lat: 'one-piece-latino',
    cast: 'one-piece-castellano',
  });
});

test('parseStreamId: película y episodio', () => {
  assert.deepEqual(util.parseStreamId('ea:yeon-ui-pyeonji'), {
    slug: 'yeon-ui-pyeonji',
    episode: 1,
    isMovie: true,
  });
  assert.deepEqual(util.parseStreamId('ea:one-piece-latino:1:45'), {
    slug: 'one-piece-latino',
    episode: 45,
    isMovie: false,
  });
  assert.equal(util.parseStreamId('tt1234567'), null);
});

test('decodeBase64Url y findDirectMediaUrls', () => {
  const b64 = Buffer.from('https://voe.sx/e/abc123').toString('base64');
  assert.equal(util.decodeBase64Url(b64), 'https://voe.sx/e/abc123');
  assert.equal(util.decodeBase64Url('no-es-base64-url!!'), '');
  const media = util.findDirectMediaUrls(
    'var a="https://cdn.example.com/v/720p.m3u8?t=1"; var b=\'https://x.io/a.mp4\';'
  );
  assert.equal(media.length, 2);
  assert.ok(media[0].endsWith('.m3u8?t=1'));
});

/* ---------------------------- listados ---------------------------- */

const LISTING_HTML = `
<html><body>
<nav><a href="/genero/Accion">Accion</a><a href="/tipo/Pelicula">Peliculas</a></nav>
<main>
  <div class="grid">
    <div class="card">
      <span class="badge">SUB</span><span>EP 1180</span>
      <a href="https://estrenosanime.net/anime/one-piece" title="One Piece">
        <img data-src="https://estrenosanime.net/uploads/anime/aaa.jpg" alt="One Piece"></a>
      <h3><a href="https://estrenosanime.net/anime/one-piece" title="One Piece">One Piece</a></h3>
      <p>One Piece es una historia sobre Monkey D. Luffy, que quiere convertirse en el Rey de los Piratas navegando por el Grand Line.</p>
      <span>TV</span><span>En Emision</span><span>1999</span>
    </div>
    <div class="card">
      <span class="badge">LATINO</span><span>EP 220/220</span>
      <a href="/anime/naruto-latino" title="Naruto (Latino)">
        <img src="/uploads/anime/bbb.jpg" alt="Naruto (Latino)"></a>
      <h3><a href="/anime/naruto-latino" title="Naruto (Latino)">Naruto (Latino)</a></h3>
      <span>TV</span><span>Completado</span><span>2002</span>
    </div>
    <div class="card">
      <span class="badge">CASTELLANO</span><span>EP 1/1</span>
      <a href="/ver/tokyo-godfathers-castellano/episodio-1" title="Tokyo Godfathers (Castellano)">
        <img src="/uploads/anime/ccc.jpg" alt="Tokyo Godfathers (Castellano)"></a>
      <h3><a href="/ver/tokyo-godfathers-castellano/episodio-1" title="Tokyo Godfathers (Castellano)">Tokyo Godfathers (Castellano)</a></h3>
      <span>Pelicula</span><span>Completado</span><span>2003</span>
    </div>
  </div>
  <aside>
    <a href="/anime/one-piece">One Piece</a><span>TV EP 1180</span>
  </aside>
</main>
</body></html>`;

test('parseListing: tarjetas, idiomas, tipos y sin duplicados del sidebar', () => {
  const items = scraper.parseListing(LISTING_HTML);
  assert.equal(items.length, 3);

  const op = items.find((i) => i.slug === 'one-piece');
  assert.equal(op.title, 'One Piece');
  assert.equal(op.lang.key, 'sub');
  assert.equal(op.siteType, 'TV');
  assert.equal(op.year, '1999');
  assert.equal(op.epCurrent, 1180);
  assert.ok(op.poster.endsWith('/uploads/anime/aaa.jpg'));
  assert.ok(op.snippet.includes('Rey de los Piratas'));

  const naruto = items.find((i) => i.slug === 'naruto-latino');
  assert.equal(naruto.lang.key, 'lat');
  assert.equal(naruto.epCurrent, 220);
  assert.equal(naruto.epTotal, 220);

  // Tarjeta de "últimos episodios": enlace /ver/... -> se convierte a la ficha
  const tg = items.find((i) => i.slug === 'tokyo-godfathers-castellano');
  assert.equal(tg.lang.key, 'cast');
  assert.equal(tg.siteType, 'Pelicula');
  assert.equal(tg.episodeFromCard, 1);

  const previews = items.map(scraper.itemToMetaPreview);
  assert.equal(previews.find((p) => p.id === 'ea:tokyo-godfathers-castellano').type, 'movie');
  assert.equal(previews.find((p) => p.id === 'ea:one-piece').type, 'series');
});

/* ------------------------------ ficha ------------------------------ */

const DETAIL_HTML = `
<html><head>
<meta property="og:title" content="Ver Dororo (Latino) Online HD Gratis | Estrenos Anime">
<meta property="og:image" content="https://estrenosanime.net/uploads/anime/dororo.jpg">
</head><body>
<nav><a href="/genero/Accion">Accion</a><a href="/genero/Comedia">Comedia</a>
     <a href="/genero/Romance">Romance</a><a href="/genero/Terror">Terror</a></nav>
<main>
  <h2>Dororo (Latino)</h2>
  <img src="/uploads/anime/dororo.jpg" alt="Dororo (Latino)">
  <div>Resumen: Un ronin llamado Hyakkimaru recupera las partes de su cuerpo robadas por demonios, acompañado de la pequeña ladrona Dororo.</div>
  <div>Japonés:どろろ</div>
  <div>English:Dororo</div>
  <div>Emisión:Jan 7, 2019</div>
  <div>Idioma:Latino</div>
  <div>Episodios:24 / 24</div>
  <div>Año de lanzamiento:2019</div>
  <div>Duración:24 Min</div>
  <div>Studios:<a href="/studios/MAPPA">MAPPA</a></div>
  <div>Tipo:<a href="/tipo/TV">TV</a></div>
  <div>Estado: <a href="/estado/Completado">Completado</a></div>
  <div>Genero: <a href="/genero/Accion">Accion</a> <a href="/genero/Aventura">Aventura</a> <a href="/genero/Demonios">Demonios</a></div>
  <div>Idiomas Disponibles</div>
  <div>Idioma Latino (Actual)<a href="/anime/dororo" title="Cambiar a Subtitulado">Cambiar a Idioma Subtitulado</a></div>
  <img src="https://i.ytimg.com/vi/ABCDEFGHIJK/hqdefault.jpg" alt="PV">
</main>
</body></html>`;

test('parseDetail: campos de la ficha sin contaminarse con el menú', () => {
  const detail = scraper.parseDetail(DETAIL_HTML, 'dororo-latino');
  assert.equal(detail.title, 'Dororo (Latino)');
  assert.equal(detail.lang.key, 'lat');
  assert.equal(detail.episodesAvailable, 24);
  assert.equal(detail.episodesTotal, 24);
  assert.equal(detail.year, '2019');
  assert.equal(detail.duration, '24 Min');
  assert.equal(detail.siteType, 'TV');
  assert.equal(detail.estado, 'Completado');
  assert.deepEqual(detail.genres, ['Accion', 'Aventura', 'Demonios']);
  assert.ok(detail.description.includes('Hyakkimaru'));
  assert.equal(detail.trailerYtId, 'ABCDEFGHIJK');
  assert.equal(detail.alternatives.length, 1);
  assert.equal(detail.alternatives[0].slug, 'dororo');

  const meta = scraper.detailToMeta(detail);
  assert.equal(meta.type, 'series');
  assert.equal(meta.videos.length, 24);
  assert.equal(meta.videos[0].id, 'ea:dororo-latino:1:1');
  assert.equal(meta.videos[23].episode, 24);
});

const MOVIE_HTML = DETAIL_HTML.replace('Episodios:24 / 24', 'Episodios:1 / 1')
  .replace('>TV<', '>Pelicula<')
  .replace(/dororo-latino/g, 'una-pelicula')
  .replace(/Dororo \(Latino\)/g, 'Una Pelicula')
  .replace('Idioma:Latino', 'Idioma:Subtitulado');

test('parseDetail: película => meta movie sin videos y defaultVideoId', () => {
  const detail = scraper.parseDetail(MOVIE_HTML, 'una-pelicula');
  assert.equal(detail.siteType, 'Pelicula');
  const meta = scraper.detailToMeta(detail);
  assert.equal(meta.type, 'movie');
  assert.equal(meta.videos, undefined);
  assert.equal(meta.behaviorHints.defaultVideoId, 'ea:una-pelicula');
});

/* --------------------------- reproducción --------------------------- */

test('parseWatch: episode_id, iframe, data-* base64, descargas, rangos EPS', () => {
  const b64 = Buffer.from('https://voe.sx/e/xyz987').toString('base64');
  const html = `
  <html><head>
  <script type="application/ld+json">{"@type":"TVEpisode","name":"One Piece Episodio 1","episodeNumber":"1","partOfSeries":{"@type":"TVSeries","name":"One Piece"}}</script>
  </head><body>
  <script>window.__DATA__ = {"page":"watch","anime_id":1,"episode_id":29324,"slug":"one-piece"};</script>
  <div id="player"><iframe src="https://filemoon.sx/e/abc123" allowfullscreen></iframe></div>
  <div>SERVIDOR: <a href="javascript:;" data-video="${b64}" data-id="77">Multiserver</a></div>
  <div>DESCARGA: <a href="javascript:;" data-url="https://krakenfiles.com/view/abc/file.html">Krakenfiles</a></div>
  <div>Lista de episodios: EPS: 001-100 EPS: 801-877
    <a href="/ver/one-piece/episodio-1?ep=1">1</a>
    <a href="/ver/one-piece/episodio-2?ep=2">2</a>
  </div>
  <script src="/assets/js/player.min.js"></script>
  </body></html>`;

  const watch = scraper.parseWatch(html, 'https://estrenosanime.net/ver/one-piece/episodio-1?ep=1', 'one-piece');
  assert.equal(watch.episodeId, '29324');
  assert.equal(watch.animeId, '1');
  assert.equal(watch.seriesName, 'One Piece');
  assert.ok(watch.embeds.some((e) => e.url === 'https://filemoon.sx/e/abc123'));
  assert.ok(watch.embeds.some((e) => e.url === 'https://voe.sx/e/xyz987'));
  assert.ok(watch.downloads.some((d) => d.url.includes('krakenfiles.com')));
  assert.equal(watch.maxEpisode, 877);
  assert.ok(watch.scriptSrcs.some((s) => s.endsWith('/assets/js/player.min.js')));
  assert.ok(watch.serverButtons.some((b) => String(b.serverId) === '77'));
});

/* ---------------------------- extractores ---------------------------- */

test('packer de Dean Edwards: unpackPacked + extractPackedScripts', () => {
  assert.equal(extractors.unpackPacked('0 1, 0!', 36, 2, ['hola', 'mundo']), 'hola mundo, hola!');
  const html = `<script>eval(function(p,a,c,k,e,d){return p}('0 1',36,2,'hola|mundo'.split('|'),0,{}))</script>`;
  const out = extractors.extractPackedScripts(html);
  assert.deepEqual(out, ['hola mundo']);
});

test('collectMediaCandidates: prefiere .m3u8 sobre .mp4', () => {
  const candidates = extractors.collectMediaCandidates([
    'sources:[{file:"https://cdn.io/v.mp4"},{file:"https://cdn.io/v.m3u8"}]',
  ]);
  assert.ok(candidates[0].endsWith('.m3u8'));
});

test('extractEmbedsFromText: iframes y URLs de embed en respuestas AJAX', () => {
  const found = extractors.extractEmbedsFromText(
    '<iframe src="https://streamwish.to/e/aa11"></iframe> y {"embed":"https://filemoon.sx/e/bb22"}'
  );
  assert.ok(found.some((f) => f.url.includes('streamwish.to')));
  assert.ok(found.some((f) => f.url.includes('filemoon.sx')));
});

test('withPage: paginación ?page= de la web', () => {
  assert.equal(scraper.withPage('/popular', 1), '/popular');
  assert.equal(scraper.withPage('/popular', 2), '/popular?page=2');
  assert.equal(scraper.withPage('/search?keyword=naruto', 3), '/search?keyword=naruto&page=3');
});

test('slugFromHref: /anime/ y /ver/', () => {
  assert.deepEqual(scraper.slugFromHref('/anime/one-piece-latino'), {
    slug: 'one-piece-latino',
    kind: 'anime',
    episode: null,
  });
  assert.equal(scraper.slugFromHref('https://estrenosanime.net/ver/one-piece/episodio-12?ep=99').episode, 12);
  assert.equal(scraper.slugFromHref('/genero/Accion'), null);
});
