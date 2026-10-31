'use strict';

/**
 * Pruebas del modo SOLO_STREAM:
 *  - el manifiesto solo expone el recurso "stream" (sin catalog/meta),
 *  - parseo de IDs externos IMDb / Kitsu / MAL,
 *  - mapeo temporada/episodio -> nº de episodio en estrenosanime.net
 *    (fichas por temporada vs. numeración absoluta),
 *  - elección de 1 candidato por idioma.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { LANGS } = require('../src/config');
const util = require('../src/util');
const idmap = require('../src/idmap');
const { manifest } = require('../src/addon');

test('manifiesto: SOLO recurso stream, sin catálogos', () => {
  assert.deepEqual(manifest.resources, ['stream']);
  assert.deepEqual(manifest.catalogs, []); // array vacío: no publica ningún catálogo
  assert.ok(manifest.idPrefixes.includes('tt'));
  assert.ok(manifest.idPrefixes.includes('kitsu:'));
  assert.ok(manifest.idPrefixes.includes('mal:'));
  assert.ok(manifest.idPrefixes.includes('ea:'));
  assert.ok(manifest.types.includes('anime'));
});

test('parseExternalStreamId: IMDb, Kitsu y MAL', () => {
  assert.deepEqual(idmap.parseExternalStreamId('tt0388629'), {
    source: 'imdb', sourceId: 'tt0388629', season: null, episode: 1,
  });
  assert.deepEqual(idmap.parseExternalStreamId('tt0388629:2:7'), {
    source: 'imdb', sourceId: 'tt0388629', season: 2, episode: 7,
  });
  assert.deepEqual(idmap.parseExternalStreamId('kitsu:7442:5'), {
    source: 'kitsu', sourceId: '7442', season: null, episode: 5, ignoreSeason: true,
  });
  assert.deepEqual(idmap.parseExternalStreamId('mal:21:1:12'), {
    source: 'mal', sourceId: '21', season: 1, episode: 12, ignoreSeason: true,
  });
  assert.equal(idmap.parseExternalStreamId('ea:one-piece:1:1'), null);
  assert.equal(idmap.parseExternalStreamId('otra-cosa'), null);
});

test('normalizeTitle / seasonOfTitle / absolutos', () => {
  assert.equal(util.normalizeTitle('Kimetsu no Yaiba: ¡Mugen! (Latino)'), 'kimetsu no yaiba mugen');
  assert.equal(util.seasonOfTitle('Jujutsu Kaisen Temporada 2 (Latino)'), 2);
  assert.equal(util.seasonOfTitle('Black Clover 2nd Season'), 2);
  assert.equal(util.seasonOfTitle('Mushoku Tensei III'), 3);
  assert.equal(util.seasonOfTitle('One Piece'), null);

  const videos = [
    { season: 0, episode: 1 }, // especial: no cuenta
    { season: 1, episode: 1 }, { season: 1, episode: 2 },
    { season: 2, episode: 1 }, { season: 2, episode: 2 },
  ];
  assert.equal(util.absoluteEpisodeFromVideos(videos, 2, 2), 4);
  assert.equal(util.absoluteEpisodeFromVideos(videos, 3, 1), null);
});

test('episodeForCandidate: por-temporada vs absoluto', () => {
  const ctx = { isMovie: false, season: 2, episode: 3, absoluteEpisode: 55 };
  // Ficha con temporada coincidente -> episodio dentro de la temporada
  assert.equal(idmap.episodeForCandidate({ title: 'X Temporada 2 (Latino)' }, ctx), 3);
  // Ficha de otra temporada -> descartada
  assert.equal(idmap.episodeForCandidate({ title: 'X Temporada 3 (Latino)' }, ctx), null);
  // Ficha sin temporada (serie completa) -> absoluto
  assert.equal(idmap.episodeForCandidate({ title: 'X' }, ctx), 55);
  // Sin absoluto conocido y temporada > 1 -> no inventamos número
  assert.equal(idmap.episodeForCandidate({ title: 'X' }, { ...ctx, absoluteEpisode: null }), null);
  // Temporada 1 sin absoluto -> el propio episodio
  assert.equal(idmap.episodeForCandidate({ title: 'X' }, { isMovie: false, season: 1, episode: 4 }), 4);
  // Película -> 1; Kitsu/MAL (ignoreSeason) -> episodio tal cual
  assert.equal(idmap.episodeForCandidate({ title: 'X Temporada 9' }, { isMovie: true }), 1);
  assert.equal(idmap.episodeForCandidate({ title: 'X Temporada 9' }, { isMovie: false, episode: 6, ignoreSeason: true }), 6);
});

test('pickJobsByLang: mejor ficha por idioma con episodio correcto', () => {
  const items = [
    { slug: 'black-clover', title: 'Black Clover', lang: LANGS.sub, siteType: 'TV', year: '2017' },
    { slug: 'black-clover-latino', title: 'Black Clover (Latino)', lang: LANGS.lat, siteType: 'TV', year: '2017' },
    { slug: 'black-clover-temporada-2-latino', title: 'Black Clover Temporada 2 (Latino)', lang: LANGS.lat, siteType: 'TV', year: '2026' },
    { slug: 'black-clover-temporada-3-castellano', title: 'Black Clover Temporada 3 (Castellano)', lang: LANGS.cast, siteType: 'TV', year: '2027' },
  ];
  const ctx = { titles: ['Black Clover'], isMovie: false, season: 2, episode: 3, absoluteEpisode: 55, year: 2017 };
  const jobs = idmap.pickJobsByLang(items, ctx, ['lat', 'cast', 'sub']);

  const byLang = Object.fromEntries(jobs.map((j) => [j.lang.key, j]));
  // Latino: gana la ficha "Temporada 2" con el episodio de la temporada
  assert.equal(byLang.lat.slug, 'black-clover-temporada-2-latino');
  assert.equal(byLang.lat.episode, 3);
  // Sub: ficha única completa -> número absoluto
  assert.equal(byLang.sub.slug, 'black-clover');
  assert.equal(byLang.sub.episode, 55);
  // Castellano: su única ficha es de otra temporada -> sin stream inventado
  assert.equal(byLang.cast, undefined);
});

test('pickJobsByLang: películas solo emparejan con Pelicula', () => {
  const items = [
    { slug: 'tu-nombre-serie', title: 'Tu Nombre la serie', lang: LANGS.sub, siteType: 'TV', year: '2016' },
    { slug: 'tu-nombre', title: 'Tu Nombre', lang: LANGS.sub, siteType: 'Pelicula', year: '2016' },
  ];
  const jobs = idmap.pickJobsByLang(items, { titles: ['Tu Nombre'], isMovie: true, year: 2016 }, ['sub']);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].slug, 'tu-nombre');
  assert.equal(jobs[0].episode, 1);
});
