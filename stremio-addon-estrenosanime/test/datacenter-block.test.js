'use strict';

/**
 * Soporte cuando un reproductor bloquea la IP del datacenter:
 * detección anti-bot/geo, circuito por host, dispatcher real,
 * resolver externo residencial y notas para Stremio.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const extractors = require('../src/extractors');
const { noteForResolution, playableNoteForResolution } = require('../src/addon');
const homeResolver = require('../scripts/home-resolver');

const originalFetch = global.fetch;

function fakeResponse(status, url, body, extra = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    text: async () => body,
    ...extra,
  };
}

function restoreFetch() {
  global.fetch = originalFetch;
  extractors.clearHostHealth();
}

test('looksBlocked: anti-bot, IP, geo y respuestas limpias', () => {
  assert.equal(extractors.looksBlocked({ status: 403, body: '<title>Just a moment...</title>' }).reason, 'antibot');
  assert.equal(extractors.looksBlocked({ status: 200, body: 'Your IP address has been blocked' }).reason, 'ip-block');
  assert.equal(extractors.looksBlocked({ status: 451, body: '' }).reason, 'geo');
  assert.equal(extractors.looksBlocked({ status: 429, body: '' }).reason, 'rate-limit');
  assert.equal(extractors.looksBlocked({ status: 200, body: 'sources:[{file:"https://cdn.example/video.mp4"}]' }), null);
  assert.equal(extractors.isIpBoundSuspected('https://streamtape.com/get_video?id=1&expires=2&ip=203.0.113.7&token=x'), true);
  assert.equal(extractors.isIpBoundSuspected('https://cdn.example/video.m3u8'), false);
});

test('resolveEmbedDetailed: 403 anti-bot abre circuito y no martilla al host', async () => {
  extractors.clearHostHealth();
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    return fakeResponse(403, String(url), '<title>Just a moment...</title> cf-chl');
  };
  try {
    const first = await extractors.resolveEmbedDetailed('https://voe.sx/e/bloqueado123', 'https://proveedor.example/ver', {});
    assert.equal(first.ok, false);
    assert.equal(first.blocked, true);
    assert.equal(first.reason, 'antibot');
    assert.equal(first.kind, 'voe');
    assert.ok(extractors.getHostBlock('https://voe.sx/e/otra'));

    const second = await extractors.resolveEmbedDetailed('https://voe.sx/e/segundo456', 'https://proveedor.example/ver', {});
    assert.equal(second.blocked, true);
    assert.equal(second.reason, 'circuit-open');
    assert.equal(calls, 1); // la segunda vez ni siquiera se hace fetch
    assert.match(noteForResolution(second, { url: 'https://voe.sx/e/segundo456' }), /bloquea la IP del servidor/);
  } finally {
    restoreFetch();
  }
});

test('resolveEmbedDetailed: el dispatcher VOE extrae el HLS y limpia la salud', async () => {
  extractors.clearHostHealth();
  global.fetch = async (url) => fakeResponse(
    200,
    String(url),
    '<script type="application/ld+json">{"@type":"VideoObject","contentUrl":"https://cdn.example/hls/master.m3u8"}</script>'
  );
  try {
    const outcome = await extractors.resolveEmbedDetailed('https://voe.sx/e/ok123456', 'https://proveedor.example/ver', {});
    assert.equal(outcome.ok, true);
    assert.equal(outcome.kind, 'voe');
    assert.equal(outcome.url, 'https://cdn.example/hls/master.m3u8');
    assert.equal(outcome.via, 'local');
    assert.equal(extractors.getHostBlock('https://voe.sx/'), null);
  } finally {
    restoreFetch();
  }
});

test('resolveEmbedDetailed: si el datacenter está bloqueado, delega al resolver externo', async () => {
  extractors.clearHostHealth();
  let resolverAuthorization = '';
  global.fetch = async (url, opts = {}) => {
    const target = String(url);
    if (target.startsWith('https://resolver.example/resolve')) {
      resolverAuthorization = (opts.headers && opts.headers.Authorization) || '';
      return fakeResponse(200, target, JSON.stringify({
        ok: true,
        url: 'https://cdn.example/desde-casa/video.m3u8',
        referer: 'https://voe.sx/e/casa123456',
      }));
    }
    return fakeResponse(403, target, 'Sorry, you have been blocked - Cloudflare');
  };
  try {
    const outcome = await extractors.resolveEmbedDetailed(
      'https://voe.sx/e/casa123456',
      'https://proveedor.example/ver',
      {
        externalResolverUrl: 'https://resolver.example',
        externalResolverToken: 'secreto-de-prueba',
      }
    );
    assert.equal(outcome.ok, true);
    assert.equal(outcome.via, 'external-resolver');
    assert.equal(outcome.localReason, 'antibot');
    assert.equal(outcome.url, 'https://cdn.example/desde-casa/video.m3u8');
    assert.equal(resolverAuthorization, 'Bearer secreto-de-prueba');
    assert.match(playableNoteForResolution(outcome), /fuera del datacenter/);
  } finally {
    restoreFetch();
  }
});

test('home-resolver: token, SSRF básico y contrato /resolve', async () => {
  restoreFetch();
  assert.equal(homeResolver.isPublicHttpUrl('https://voe.sx/e/abc'), true);
  assert.equal(homeResolver.isPublicHttpUrl('http://localhost:7000/admin'), false);
  assert.equal(homeResolver.isPublicHttpUrl('http://192.168.1.1/admin'), false);
  assert.equal(homeResolver.isPublicHttpUrl('https://user:pass@example.com/e/x'), false);

  const app = homeResolver.createHomeResolverApp({
    token: 'secreto-de-prueba',
    resolver: async (url, referer, opts) => ({
      ok: true,
      url: 'https://cdn.example/resuelto-en-casa.m3u8',
      referer,
      allowExternal: opts.allowExternal,
      inputUrl: url,
    }),
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const health = await fetch(`${base}/health`).then((r) => r.json());
    assert.equal(health.ok, true);

    const target = encodeURIComponent('https://voe.sx/e/abc');
    const noToken = await fetch(`${base}/resolve?url=${target}`);
    assert.equal(noToken.status, 401);

    const ssrf = await fetch(`${base}/resolve?url=${encodeURIComponent('http://127.0.0.1:7000/health')}`, {
      headers: { Authorization: 'Bearer secreto-de-prueba' },
    });
    assert.equal(ssrf.status, 400);

    const okRes = await fetch(`${base}/resolve?url=${target}`, {
      headers: { Authorization: 'Bearer secreto-de-prueba' },
    });
    const okJson = await okRes.json();
    assert.equal(okRes.status, 200);
    assert.equal(okJson.ok, true);
    assert.equal(okJson.allowExternal, false); // nunca se llama a sí mismo en bucle
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreFetch();
  }
});
