'use strict';

/**
 * Tests offline del proveedor InfinityAnime y de la integración
 * multi-proveedor (fixtures según lo observado en la web real, ver
 * INVESTIGACION-INFINITY.md).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  infSlugFromHref,
  parseDirectorio,
  parseSerieRest,
  toEmbedUrl,
  parseWatchInf,
} = require('../src/infinity');
const { pickSingleJob } = require('../src/idmap');
const { normalizeWatch, PROVIDERS_BY_ID } = require('../src/providers');
const { manifest, parseOwnStreamId } = require('../src/addon');
const { LANGS } = require('../src/config');

test('infSlugFromHref: ficha, episodio y slugs reservados', () => {
  assert.deepEqual(
    infSlugFromHref('https://infinityanime.net/one-piece-tv/episodio-1180/'),
    { slug: 'one-piece-tv', kind: 'watch', episode: 1180 }
  );
  assert.deepEqual(
    infSlugFromHref('/black-clover-2nd-season/'),
    { slug: 'black-clover-2nd-season', kind: 'detail' }
  );
  assert.equal(infSlugFromHref('/directorio/?s_keyword=x'), null);
  assert.equal(infSlugFromHref('/genero/action/'), null);
  assert.equal(infSlugFromHref('/calendario/'), null);
  assert.equal(infSlugFromHref('https://example.com/one-piece-tv/'), null);
});

test('parseDirectorio: tarjetas con año/tipo/eps/Latino', () => {
  const html = `
    <nav><a href="/directorio/">Directorio</a><a href="/genero/action/">Acción</a></nav>
    <div class="grid">
      <article>
        <a href="/one-piece-tv/"><img src="https://infinityanime.net/wp-content/uploads/2025/09/one-piece.webp"></a>
        <span>Pausado</span>
        <h3><a href="/one-piece-tv/">One Piece</a></h3>
        <div class="meta">1999 Anime <span>Latino</span> 1180 eps</div>
        <a href="/one-piece-tv/episodio-1/">▶ Ver ahora</a>
      </article>
      <article>
        <a href="/tamako-love-story/"><img src="https://infinityanime.net/wp-content/uploads/2024/05/tamako.webp"></a>
        <h3><a href="/tamako-love-story/">Tamako Love Story</a></h3>
        <div class="meta">2014 Película 1 eps</div>
      </article>
    </div>`;
  const items = parseDirectorio(html);
  assert.equal(items.length, 2);
  const op = items.find((i) => i.slug === 'one-piece-tv');
  assert.equal(op.title, 'One Piece');
  assert.equal(op.year, 1999);
  assert.equal(op.siteType, 'TV');
  assert.equal(op.epCurrent, 1180);
  assert.equal(op.hasLat, true);
  assert.match(op.poster, /wp-content\/uploads/);
  const tamako = items.find((i) => i.slug === 'tamako-love-story');
  assert.equal(tamako.siteType, 'Pelicula'); // «Película» → forma canónica
  assert.equal(tamako.hasLat, false);
});

test('parseSerieRest: class_list/etiqueta de la REST de WordPress', () => {
  const items = parseSerieRest([
    {
      slug: 'black-clover-2nd-season',
      title: { rendered: 'Black Clover 2nd Season' },
      class_list: ['post-1', 'serie', 'tipo-anime', 'estado-en-emision'],
      etiqueta: [],
    },
    {
      slug: 'sword-pelicula',
      title: { rendered: 'Sword &#8211; La Película' },
      class_list: ['tipo-pelicula', 'etiqueta-latino'],
      etiqueta: [434],
    },
  ]);
  assert.equal(items[0].siteType, 'TV');
  assert.equal(items[0].hasLat, false);
  assert.equal(items[1].siteType, 'Pelicula');
  assert.equal(items[1].hasLat, true);
  assert.equal(items[1].title, 'Sword – La Película'); // entidad HTML decodificada
});

test('toEmbedUrl convierte descargas a embeds (y rechaza hosts sin player)', () => {
  assert.equal(toEmbedUrl('https://byseraguci.com/d/abc123XYZ'), 'https://byseraguci.com/e/abc123XYZ'); // Filemoon
  assert.equal(toEmbedUrl('https://www.mp4upload.com/abcd1234.html'), 'https://www.mp4upload.com/embed-abcd1234.html');
  assert.equal(toEmbedUrl('https://streamtape.com/v/eDv92WBlYmtYaOp/'), 'https://streamtape.com/e/eDv92WBlYmtYaOp');
  assert.equal(toEmbedUrl('https://vidara.so/v/eljVdRQw3yjOpb'), 'https://vidara.so/v/eljVdRQw3yjOpb');
  assert.equal(toEmbedUrl('https://mega.nz/#!xyz!key'), null);
  assert.equal(toEmbedUrl('https://1fichier.com/?abc'), null);
  assert.equal(toEmbedUrl('https://www105.zippyshare.com/v/IoheKbXg/file.html'), null);
});

test('parseWatchInf: grupos Sub/Dub + descargas con idioma exacto', () => {
  const html = `<html><head><title>Test Show Episodio 1 – Infinity</title></head><body>
    <div class="player">
      <span>Sub:</span>
      <button data-url="https://vidara.so/v/AAA111">Vidara</button>
      <iframe src="https://streamtape.com/e/subTape1"></iframe>
      <span>Dub:</span>
      <button data-url="https://byseraguci.com/e/dubMoon9">Filemoon</button>
    </div>
    <h2>Descargas</h2>
    <a href="https://www.mp4upload.com/subMP411.html">SUBTITULADO mp4upload</a>
    <a href="https://mega.nz/#!xyz">SUBTITULADO mega · HD</a>
    <a href="https://vidara.so/v/dubVid22">DOBLADO vidara</a>
    <a href="/test-show/episodio-2/">Episodio 2</a>
  </body></html>`;
  const w = parseWatchInf(html, 'https://infinityanime.net/test-show/episodio-1/', 'test-show');

  // Descargas: 3, con idiomas del propio texto; Mega NO se convierte a embed
  assert.equal(w.downloads.length, 3);
  const mega = w.downloads.find((d) => d.name === 'MEGA');
  assert.ok(mega && mega.lang.key === 'sub');
  assert.ok(!w.embeds.some((e) => /mega/.test(e.name || '') || /mega/.test(e.url)));

  // Embed derivado de descarga convertido (mp4upload → embed-) con idioma Sub
  const mp4 = w.embeds.find((e) => /mp4upload/.test(e.url));
  assert.equal(mp4.url, 'https://www.mp4upload.com/embed-subMP411.html');
  assert.equal(mp4.lang.key, 'sub');
  assert.equal(mp4.origin, 'download');

  // Doblado → Latino (descarga DOBLADO vidara)
  const dubVid = w.embeds.find((e) => e.url.includes('dubVid22'));
  assert.equal(dubVid.lang.key, 'lat');

  // Botones del reproductor etiquetados por el grupo que los precede
  assert.equal(w.embeds.find((e) => e.url.includes('AAA111')).lang.key, 'sub');
  assert.equal(w.embeds.find((e) => e.url.includes('subTape1')).lang.key, 'sub');
  assert.equal(w.embeds.find((e) => e.url.includes('dubMoon9')).lang.key, 'lat');

  assert.deepEqual(w.langsAvailable.sort(), ['lat', 'sub']);
  assert.equal(w.maxEpisode, 2);
});

test('pickSingleJob: elige la temporada correcta en Infinity (Black Clover T2)', () => {
  const items = [
    { slug: 'black-clover', title: 'Black Clover', siteType: 'TV', year: 2017, epCurrent: 170, hasLat: false },
    { slug: 'black-clover-2nd-season', title: 'Black Clover 2nd Season', siteType: 'TV', year: 2026, epCurrent: 4, hasLat: false },
  ];
  const ctx = {
    titles: ['Black Clover'], year: null, isMovie: false,
    season: 2, episode: 3, ignoreSeason: false, absoluteEpisode: null,
  };
  const job = pickSingleJob(items, ctx);
  assert.equal(job.provider, 'infinity');
  assert.equal(job.slug, 'black-clover-2nd-season');
  assert.equal(job.episode, 3); // dentro de la temporada
  assert.equal(job.lang, null); // multi-idioma: se decide en el watch
});

test('normalizeWatch: Estrenos hereda el idioma de la ficha; Infinity conserva los suyos', () => {
  const rawEa = {
    finalUrl: 'https://estrenosanime.net/ver/x-latino/episodio-1',
    directMedia: ['https://cdn.example/v.m3u8'],
    embeds: [{ name: 'Multiserver', url: 'https://multi.example/e/1' }],
    downloads: [{ name: 'KrakenFiles', url: 'https://k.example/f' }],
  };
  const ea = normalizeWatch(PROVIDERS_BY_ID.estrenos, rawEa, LANGS.lat);
  assert.equal(ea.directMedia[0].lang.key, 'lat');
  assert.equal(ea.embeds[0].lang.key, 'lat');
  assert.equal(ea.downloads[0].lang.key, 'lat');

  const rawInf = {
    finalUrl: 'https://infinityanime.net/x/episodio-1/',
    directMedia: [{ url: 'https://cdn.example/v.mp4', lang: LANGS.sub }],
    embeds: [{ name: 'Vidara', url: 'https://vidara.so/v/1', lang: LANGS.lat }],
    downloads: [{ name: 'MEGA', url: 'https://mega.nz/x', lang: LANGS.sub }],
  };
  const inf = normalizeWatch(PROVIDERS_BY_ID.infinity, rawInf, LANGS.sub);
  assert.equal(inf.embeds[0].lang.key, 'lat');
  assert.equal(inf.directMedia[0].lang.key, 'sub');
});

test('manifest v1.3.0: SOLO stream, 5 proveedores, sin configurador', () => {
  assert.deepEqual(manifest.resources, ['stream']);
  assert.deepEqual(manifest.catalogs, []);
  for (const p of ['ea:', 'ia:', 'aj:', 'lt:', 'd23:']) {
    assert.ok(manifest.idPrefixes.includes(p), `falta prefijo ${p}`);
  }
  // Sin configurador: ni `config` ni behaviorHints.configurable
  assert.equal(manifest.config, undefined);
  assert.equal(manifest.behaviorHints.configurable, false);
  assert.equal(manifest.behaviorHints.configurationRequired, false);
  assert.ok(!('catalog' in manifest && manifest.catalog.length));
});

test('parseOwnStreamId: ea:/ia:/aj:/lt:/d23:', () => {
  assert.deepEqual(parseOwnStreamId('ia:one-piece-tv:1:1180'), {
    providerId: 'infinity', slug: 'one-piece-tv', season: 1, episode: 1180, isMovie: false,
  });
  assert.deepEqual(parseOwnStreamId('ea:one-piece-latino:1:5'), {
    providerId: 'estrenos', slug: 'one-piece-latino', season: 1, episode: 5, isMovie: false,
  });
  assert.deepEqual(parseOwnStreamId('aj:black-clover:2:3'), {
    providerId: 'animejara', slug: 'black-clover', season: 2, episode: 3, isMovie: false,
  });
  assert.deepEqual(parseOwnStreamId('lt:one-piece:5'), {
    providerId: 'latanime', slug: 'one-piece', season: 1, episode: 5, isMovie: false,
  });
  assert.deepEqual(parseOwnStreamId('d23:black-clover:7'), {
    providerId: 'animed23', slug: 'black-clover', season: 1, episode: 7, isMovie: false,
  });
  assert.deepEqual(parseOwnStreamId('ia:tamako-love-story'), {
    providerId: 'infinity', slug: 'tamako-love-story', season: 1, episode: 1, isMovie: true,
  });
  assert.equal(parseOwnStreamId('tt0388629'), null);
});
