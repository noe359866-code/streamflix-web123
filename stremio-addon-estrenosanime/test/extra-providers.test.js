'use strict';

/**
 * Tests offline v1.3.0:
 *  - Proveedores AnimeJara · Latanime · AnimeD23 (fixtures según
 *    INVESTIGACION-PROVEEDORES-EXTRA.md).
 *  - Mapeo SxE de AnimeJara en idmap.
 *  - Resolvers por host (VOE, Filemoon/MP4Upload empaquetados, MixDrop…).
 *  - Reglas del proyecto: sin demos y sin configurador.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const extra = require('../src/extra-providers');
const idmap = require('../src/idmap');
const extractors = require('../src/extractors');
const { LANGS } = require('../src/config');
const { PROVIDERS, PROVIDERS_BY_ID, activeProviders } = require('../src/providers');
const { manifest } = require('../src/addon');
const { renderLanding } = require('../src/landing');

/* ------------------------- Registro de proveedores ------------------------- */

test('registro: 5 proveedores en orden, modos y siempre activos', () => {
  assert.deepEqual(PROVIDERS.map((p) => p.id), ['estrenos', 'infinity', 'animejara', 'latanime', 'animed23']);
  assert.equal(PROVIDERS_BY_ID.estrenos.mode, 'perLang');
  assert.equal(PROVIDERS_BY_ID.latanime.mode, 'perLang');
  assert.equal(PROVIDERS_BY_ID.infinity.mode, 'single');
  assert.equal(PROVIDERS_BY_ID.animejara.mode, 'single');
  assert.equal(PROVIDERS_BY_ID.animed23.mode, 'single');
  assert.deepEqual(activeProviders(), PROVIDERS.map((p) => p.id));
  // URLs de ver correctas por proveedor
  assert.match(PROVIDERS_BY_ID.animejara.watchUrl('black-clover', 3, { season: 2 }), /\/episode\/black-clover-2x3\/$/);
  assert.match(PROVIDERS_BY_ID.animejara.watchUrl('kimi-no-na-wa', 1, { isMovie: true }), /\/movie\/kimi-no-na-wa$/);
  assert.match(PROVIDERS_BY_ID.latanime.watchUrl('one-piece', 5), /\/ver\/one-piece-episodio-5$/);
  assert.match(PROVIDERS_BY_ID.animed23.watchUrl('black-clover', 7), /\/capitulo\/black-clover-ep-7\/$/);
  // URLs de buscador reales (investigadas)
  assert.match(PROVIDERS_BY_ID.animejara.searchUrl('One Piece'), /\/catalogo\?q=One%20Piece$/);
  assert.match(PROVIDERS_BY_ID.latanime.searchUrl('One Piece'), /\/buscar\?q=One%20Piece$/);
  assert.match(PROVIDERS_BY_ID.animed23.searchUrl('One Piece'), /\?s=One%20Piece$/);
});

/* --------------------------------- Latanime -------------------------------- */

test('latSlugFromHref: ficha y episodio', () => {
  assert.deepEqual(extra.latSlugFromHref('https://latanime.org/anime/one-piece-latino'),
    { slug: 'one-piece-latino', kind: 'detail' });
  assert.deepEqual(extra.latSlugFromHref('/ver/one-piece-episodio-1100'),
    { slug: 'one-piece', kind: 'watch', episode: 1100 });
  assert.equal(extra.latSlugFromHref('https://example.com/anime/one-piece'), null);
});

test('parseLatListing: idioma por ficha y título limpio', () => {
  const html = `<div class="grid">
    <div class="card"><a href="/anime/one-piece-latino"><h3>One Piece Latino</h3><span class="opacity-75">Latino</span></a></div>
    <div class="card"><a href="/anime/nanatsu-castellano"><h3>Nanatsu no Taizai Castellano</h3></a></div>
    <div class="card"><a href="/anime/one-piece"><h3>One Piece</h3><span>Subtitulado</span></a></div>
  </div>`;
  const items = extra.parseLatListing(html);
  const bySlug = Object.fromEntries(items.map((i) => [i.slug, i]));
  assert.equal(bySlug['one-piece-latino'].lang.key, 'lat');
  assert.equal(bySlug['one-piece-latino'].title, 'One Piece');
  assert.equal(bySlug['nanatsu-castellano'].lang.key, 'cast');
  assert.equal(bySlug['one-piece'].lang.key, 'sub');
});

test('parseLatWatch: data-player en base64 + iframe + descarga (Latino)', () => {
  const b64 = Buffer.from('https://mivalyo.com/e/fmoon123abc').toString('base64');
  const html = `<html><head><title>One Piece Latino Episodio 1</title></head><body>
    <h2>One Piece Latino Episodio 1</h2>
    <a class="play-video" data-player="${b64}">Filemoon</a>
    <iframe src="https://dood.li/e/doodabc12345"></iframe>
    <h3>Descargas</h3>
    <a href="https://mega.nz/file/xyz#key">MEGA</a>
  </body></html>`;
  const w = extra.parseLatWatch(html, 'https://latanime.org/ver/one-piece-latino-episodio-1', 'one-piece-latino');
  const fm = w.embeds.find((e) => e.url.includes('fmoon123abc'));
  assert.ok(fm, 'el data-player base64 debe convertirse en embed');
  assert.equal(fm.lang.key, 'lat');
  assert.ok(w.embeds.some((e) => e.url.includes('doodabc12345')));
  assert.ok(w.downloads.some((d) => /mega/i.test(d.url)));
});

/* --------------------------------- AnimeD23 -------------------------------- */

test('d23SlugFromHref + parseD23Listing: badges Lat/Sub', () => {
  assert.deepEqual(extra.d23SlugFromHref('https://animed23.com/anime/black-clover/'),
    { slug: 'black-clover', kind: 'detail' });
  assert.deepEqual(extra.d23SlugFromHref('/capitulo/black-clover-ep-170/'),
    { slug: 'black-clover', kind: 'watch', episode: 170 });
  const html = `<div class="grid">
    <article><a href="/anime/black-clover/"><h3>Black Clover</h3><span>Lat Sub</span><span>170 episodios</span></a></article>
    <article><a href="/anime/black-clover-temporada-2/"><h3>Black Clover Temporada 2</h3><span>Sub</span></a></article>
  </div>`;
  const items = extra.parseD23Listing(html);
  const bc = items.find((i) => i.slug === 'black-clover');
  assert.equal(bc.hasLat, true);
  assert.equal(items.find((i) => i.slug === 'black-clover-temporada-2').title, 'Black Clover Temporada 2');
});

test('parseD23RestSearch: capítulos REST -> serie derivada', () => {
  const items = extra.parseD23RestSearch([
    { title: 'Black Clover Ep 170', url: 'https://animed23.com/capitulo/black-clover-ep-170/' },
    { title: 'Black Clover Ep 169', url: 'https://animed23.com/capitulo/black-clover-ep-169/' },
    { title: 'Otra cosa', url: 'https://example.com/x' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].slug, 'black-clover');
  assert.equal(items[0].title, 'Black Clover');
  assert.equal(items[0].source, 'rest');
});

test('parseD23Watch: badge «Lat» marca el idioma del episodio', () => {
  const html = `<html><body>
    <div class="head"><h1>Black Clover Ep 12</h1><span class="badge">Lat</span></div>
    <iframe src="https://hglink.to/e/vidhide999"></iframe>
  </body></html>`;
  const w = extra.parseD23Watch(html, 'https://animed23.com/capitulo/black-clover-ep-12/', 'black-clover');
  const emb = w.embeds.find((e) => e.url.includes('vidhide999'));
  assert.ok(emb);
  assert.equal(emb.lang.key, 'lat');
});

/* -------------------------------- AnimeJara -------------------------------- */

test('jaraSlugFromHref: detalle, SxE y película', () => {
  assert.deepEqual(extra.jaraSlugFromHref('https://animejara.com/anime/one-piece-tv/'),
    { slug: 'one-piece-tv', kind: 'detail' });
  assert.deepEqual(extra.jaraSlugFromHref('/episode/black-clover-2x3/'),
    { slug: 'black-clover', kind: 'watch', season: 2, episode: 3 });
  const movie = extra.jaraSlugFromHref('/movie/kimi-no-na-wa');
  assert.equal(movie.slug, 'kimi-no-na-wa');
  assert.equal(movie.movie, true);
});

test('parseJaraCatalogo: multiSeason + pistas de idioma por banderas', () => {
  const html = `<div id="anime-results">
    <div class="anime-card-wrapper">
      <a class="anime-card" href="/anime/black-clover/" data-anime='{"titulo":"Black Clover","anio":2017,"poster":"https://animejara.com/p.jpg"}'>
        <img src="/flags/latino.png" alt="Latino"><img src="/flags/japones.png" alt="Sub">
        <h3>Black Clover</h3><span>170 episodios</span>
      </a>
    </div>
  </div>`;
  const items = extra.parseJaraCatalogo(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].slug, 'black-clover');
  assert.equal(items[0].multiSeason, true);
  assert.ok(items[0].langsHint.includes('lat'));
  assert.ok(items[0].langsHint.includes('sub'));
});

test('parseJaraSitemap: deriva fichas del sitemap filtrando por búsqueda', () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://animejara.com/anime/one-piece-tv/</loc></url>
    <url><loc>https://animejara.com/anime/naruto/</loc></url>
  </urlset>`;
  const items = extra.parseJaraSitemap(xml, 'One Piece');
  assert.equal(items.length, 1);
  assert.equal(items[0].slug, 'one-piece-tv');
  assert.equal(items[0].multiSeason, true);
});

test('parseJaraEnlaces + parseJaraServerPage: 2 pasos por idioma', () => {
  const html = `<div class="botones-idioma">
      <div class="boton-idioma" onclick="cambiarIdioma(0)"><span class="lang-name">Latino</span></div>
      <div class="boton-idioma" onclick="cambiarIdioma(1)"><span class="lang-name">Japonés</span></div>
    </div>
    <script>const enlaces = ["https://streamhj.example/lat", "https://streamhj.example/sub"];</script>`;
  const { buttons, enlaces } = extra.parseJaraEnlaces(html);
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].lang.key, 'lat');
  assert.equal(buttons[1].lang.key, 'sub');
  assert.deepEqual(enlaces, ['https://streamhj.example/lat', 'https://streamhj.example/sub']);

  const inner = 'https://filemoon.sx/e/realserver1';
  const serverHtml = `<ul id="logo-list">
    <li onclick='playVideo("https://voe.sx/e/abcvoe12345")'><span class="nombre-server">Voe</span></li>
    <li onclick='playVideo("https://streamhj.example/go.php?v=${encodeURIComponent(inner)}")'><span class="nombre-server">Filemoon</span></li>
  </ul>`;
  const servers = extra.parseJaraServerPage(serverHtml, LANGS.lat);
  assert.equal(servers.length, 2);
  assert.equal(servers[0].url, 'https://voe.sx/e/abcvoe12345');
  assert.equal(servers[0].lang.key, 'lat');
  assert.equal(servers[1].url, inner); // go.php desenrollado
});

/* ------------------------------ Mapeo en idmap ------------------------------ */

test('idmap: AnimeJara (multiSeason) usa episodio dentro de temporada (SxE)', () => {
  const item = { title: 'Black Clover', multiSeason: true, siteType: 'TV', year: 2017 };
  const ctx = { isMovie: false, season: 2, episode: 3, absoluteEpisode: 55 };
  // Aunque exista numeración absoluta, SxE exige el episodio de la temporada
  assert.equal(idmap.episodeForCandidate(item, ctx), 3);

  const job = idmap.pickSingleJob(
    [{ slug: 'black-clover', ...item }],
    { titles: ['Black Clover'], year: null, ...ctx },
    'animejara'
  );
  assert.equal(job.provider, 'animejara');
  assert.equal(job.episode, 3);
  assert.equal(job.season, 2);
  assert.equal(job.isMovie, false);
  assert.equal(job.multiSeason, true);
});

test('idmap: Latanime (perLang) hereda provider y campos de trabajo', () => {
  const items = [
    { slug: 'one-piece-latino', title: 'One Piece (Latino)', lang: LANGS.lat, siteType: 'TV', year: 1999 },
  ];
  const jobs = idmap.pickJobsByLang(
    items,
    { titles: ['One Piece'], isMovie: false, season: 1, episode: 5, year: 1999 },
    ['lat', 'cast', 'sub'],
    'latanime'
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].provider, 'latanime');
  assert.equal(jobs[0].episode, 5);
  assert.equal(jobs[0].season, 1);
  assert.equal(jobs[0].isMovie, false);
});

/* ---------------------------- Resolvers por host ---------------------------- */

test('extractors: classifyHost + normalizeEmbedUrl', () => {
  assert.equal(extractors.classifyHost('https://voe.sx/e/abc'), 'voe');
  assert.equal(extractors.classifyHost('https://jilliandescribecompany.com/e/abc'), 'voe'); // mirror VOE
  assert.equal(extractors.classifyHost('https://mivalyo.com/e/abc'), 'filemoon');
  assert.equal(extractors.classifyHost('https://www.mp4upload.com/abc.html'), 'mp4upload');
  assert.equal(extractors.classifyHost('https://hglink.to/e/abc'), 'vidhide');
  assert.equal(extractors.classifyHost('https://video.sibnet.ru/shell.php?videoid=1'), 'sibnet');
  assert.equal(extractors.classifyHost('https://example.com/e/abc'), 'generic');

  assert.equal(extractors.normalizeEmbedUrl('https://www.mp4upload.com/abcd1234.html'),
    'https://www.mp4upload.com/embed-abcd1234.html');
  assert.equal(extractors.normalizeEmbedUrl('https://voe.sx/abc123456789'),
    'https://voe.sx/e/abc123456789');
  assert.equal(extractors.normalizeEmbedUrl('https://mixdrop.co/f/xyz123'),
    'https://mixdrop.co/e/xyz123');
  assert.equal(extractors.normalizeEmbedUrl('https://byseraguci.com/d/abc123xyz'),
    'https://byseraguci.com/e/abc123xyz');
});

test('extractors: VOE expone HLS (contentUrl / base64)', () => {
  const html = `<script type="application/ld+json">
    {"@type":"VideoObject","contentUrl":"https://cdn.voe.example/hls/master.m3u8"}</script>`;
  assert.equal(extractors.extractVoeMedia(html, 'https://voe.sx/e/abc'),
    'https://cdn.voe.example/hls/master.m3u8');

  const b64 = Buffer.from('https://cdn.example.com/video/final.m3u8?token=xyz').toString('base64');
  const htmlB64 = `<script>var s = atob("${b64}"); jwplayer().setup({file: s});</script>`;
  assert.equal(extractors.extractVoeMedia(htmlB64, 'https://voe.sx/e/abc'),
    'https://cdn.example.com/video/final.m3u8?token=xyz');
});

test('extractors: MixDrop (wurl), Sibnet (relativo) y empaquetados', () => {
  const md = `<script>MDCore.wurl = "//cdn-mix.example/v/abc/720.mp4";</script>`;
  assert.equal(extractors.extractMixdropMedia(md), 'https://cdn-mix.example/v/abc/720.mp4');

  const sib = `<script>player.setup({file:"/v/1234567/abcdef.mp4"});</script>`;
  assert.equal(extractors.extractSibnetMedia(sib, 'https://video.sibnet.ru/shell.php?videoid=1'),
    'https://video.sibnet.ru/v/1234567/abcdef.mp4');

  // Filemoon/MP4Upload («Upload»)/VidHide comparten el extractor empaquetado:
  const plain = `<script>var sources=[{file:"https://cdn.pack.example/stream/index.m3u8",label:"HD"}];</script>`;
  assert.equal(extractors.extractPackedMedia(plain, 'https://filemoon.sx/e/x'),
    'https://cdn.pack.example/stream/index.m3u8');
});

/* ------------------------- Reglas: sin demo, sin cfg ------------------------ */

test('reglas: no existe modo demo ni configurador', () => {
  const config = require('../src/config');
  assert.equal('DEMO_FALLBACK' in config, false);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'src', 'demo.js')), false);

  assert.equal(manifest.config, undefined);
  assert.equal(manifest.behaviorHints.configurable, false);

  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.doesNotMatch(indexSrc, /app\.get\('\/configure'/);
  assert.doesNotMatch(indexSrc, /DEMO_FALLBACK|require\('\.\/demo'\)/);

  const scroll = renderLanding({ base: 'https://mi-addon.example', manifest });
  assert.doesNotMatch(scroll, /\/configure/);
  assert.match(scroll, /manifest\.json/);
});
