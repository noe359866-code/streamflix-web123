'use strict';

/**
 * Salida proxy opcional para resolver embeds cuando bloquean la IP
 * del datacenter. Proxy5 es datacenter (no residencial): aquí solo
 * se verifica el mecanismo —parseo de listas, API heredada de solo
 * lectura, túnel CONNECT real y la cadena de reintentos— sin red
 * externa ni credenciales de verdad.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');

const proxyEgress = require('../src/proxy-egress');
const extractors = require('../src/extractors');
const httpClient = require('../src/http');
const { playableNoteForResolution } = require('../src/addon');

function fakeResponse(status, url, body) {
  return { status, ok: status >= 200 && status < 300, url, text: async () => body };
}

test('proxy-egress: parsea formatos habituales y nunca expone credenciales', () => {
  const list = proxyEgress.parseProxyList(
    '203.0.113.5:8085, usuario:clave@198.51.100.7:8080\nsocks5://192.0.2.9:1080; 8.8.8.8:8080:u:p'
  );
  assert.equal(list.length, 4);
  assert.ok(list[0].startsWith('http://203.0.113.5:8085'));
  assert.ok(list[1].startsWith('http://usuario:clave@198.51.100.7:8080'));
  assert.ok(list[2].startsWith('socks5://192.0.2.9:1080'));
  assert.equal(proxyEgress.redactProxyUrl(list[1]), 'http://198.51.100.7:8080');

  const dirty = 'falló http://usuario:clave-secreta@198.51.100.7:8080 con Basic abc123==';
  const clean = proxyEgress.sanitizeProxyError(dirty, list[1].replace('clave', 'clave-secreta'));
  assert.doesNotMatch(clean, /clave-secreta|abc123/);
  assert.match(clean, /\[proxy\]|\[secreto\]/);
});

test('proxy5: URL de lista heredada, auth Basic y parseo sin IPs privadas', () => {
  assert.equal(
    proxyEgress.buildProxy5ListUrl({ serviceId: '123', listType: 'http-auth', listFormat: 'json' }),
    'https://api.proxy5.net/api/iplist/http-auth/json/123'
  );
  assert.equal(proxyEgress.buildProxy5ListUrl({ serviceId: '../x' }), '');
  assert.equal(proxyEgress.proxy5Authorization('Basic abc123'), 'Basic abc123');

  const json = proxyEgress.parseProxy5ListBody(JSON.stringify({
    data: [
      { ip: '8.8.4.4', port: 8080, username: 'u', password: 'p' },
      { ip: '127.0.0.1', port: 8080, username: 'x', password: 'y' },
      '9.9.9.9:8085',
    ],
  }), { listType: 'http-auth', format: 'json' });
  assert.deepEqual(json, ['http://u:p@8.8.4.4:8080/', 'http://9.9.9.9:8085/']);

  const txt = proxyEgress.parseProxy5ListBody('1.1.1.1:1080:u:p\n10.0.0.8:1080\n', {
    listType: 'socks-ip',
    format: 'txt',
  });
  assert.deepEqual(txt, ['socks5://u:p@1.1.1.1:1080']);
});

test('proxy5 pool: descarga la lista una vez (caché) y reporta solo conteos', async () => {
  let calls = 0;
  const pool = proxyEgress.createProxyPool({
    staticProxies: '',
    proxy5AuthKey: 'abc123',
    proxy5ServiceId: '777',
    fetchImpl: async (url, opts = {}) => {
      calls += 1;
      assert.equal(String(url), 'https://api.proxy5.net/api/iplist/http-auth/json/777');
      assert.equal(opts.headers.Authorization, 'Basic abc123');
      assert.equal(opts.method, 'GET'); // solo lectura: jamás compra/modifica
      return fakeResponse(200, String(url), JSON.stringify(['8.8.8.8:8080:u:p', '9.9.9.9:8080:u:p']));
    },
  });

  const first = await pool.getCandidates(1);
  const second = await pool.getCandidates(1);
  assert.equal(calls, 1);
  assert.equal(first.length, 1);
  assert.notEqual(first[0], second[0]); // rota entre salidas
  const status = pool.getStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.source, 'proxy5-api');
  assert.equal(status.count, 2);
  assert.doesNotMatch(JSON.stringify(status), /abc123|u:p|8\.8\.8\.8/);
});

test('fetchText: la caché no mezcla salidas y los errores no filtran la clave', async () => {
  httpClient.pageCache.clear();
  let calls = 0;
  const fetchImpl = async (url, opts = {}) => {
    calls += 1;
    return fakeResponse(200, String(url), opts.dispatcher ? 'vía proxy' : 'directo');
  };
  const target = 'https://player.example/embed/cache';
  const proxyUrl = 'http://proxy-user:proxy-pass@203.0.113.20:8080';
  try {
    assert.equal((await httpClient.fetchText(target, { fetchImpl, useCache: true, retries: 0 })).text, 'directo');
    assert.equal((await httpClient.fetchText(target, { fetchImpl, useCache: true, retries: 0, proxyUrl })).text, 'vía proxy');
    assert.equal((await httpClient.fetchText(target, { fetchImpl, useCache: true, retries: 0, proxyUrl })).text, 'vía proxy');
    assert.equal(calls, 2); // la tercera sale de la caché de ESA salida

    await assert.rejects(
      httpClient.fetchText('https://player.example/embed/falla', {
        retries: 0,
        proxyUrl,
        fetchImpl: async () => { throw new Error(`sin ruta vía ${proxyUrl}`); },
      }),
      (err) => {
        assert.equal(err.proxyError, true);
        assert.doesNotMatch(err.message, /proxy-user|proxy-pass/);
        return true;
      }
    );
  } finally {
    httpClient.pageCache.clear();
    await httpClient.closeProxyDispatchers();
  }
});

test('fetchText: túnel CONNECT real a través de un proxy HTTP local', async () => {
  const origin = http.createServer((req, res) => res.end(`origen:${req.url}`));
  await new Promise((resolve) => origin.listen(0, '127.0.0.1', resolve));
  const originPort = origin.address().port;

  let connects = 0;
  const proxy = http.createServer();
  proxy.on('connect', (req, clientSocket, head) => {
    connects += 1;
    const splitAt = req.url.lastIndexOf(':');
    const host = req.url.slice(0, splitAt).replace(/^\[|\]$/g, '');
    const port = Number(req.url.slice(splitAt + 1));
    const upstream = net.connect(port, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const proxyPort = proxy.address().port;

  try {
    const result = await httpClient.fetchText(`http://127.0.0.1:${originPort}/hola`, {
      proxyUrl: `http://127.0.0.1:${proxyPort}`,
      retries: 0,
      timeoutMs: 5000,
    });
    assert.equal(result.text, 'origen:/hola');
    assert.equal(connects, 1);
  } finally {
    await httpClient.closeProxyDispatchers();
    proxy.closeAllConnections?.();
    origin.closeAllConnections?.();
    await Promise.all([
      new Promise((resolve) => proxy.close(resolve)),
      new Promise((resolve) => origin.close(resolve)),
    ]);
  }
});

test('resolveEmbedDetailed: tras el bloqueo reintenta vía proxy y lo reusa si funcionó', async () => {
  extractors.clearHostHealth();
  const viaProxy = [];
  const fetchImpl = async (url, opts = {}) => {
    viaProxy.push(Boolean(opts.dispatcher));
    if (opts.dispatcher) {
      return fakeResponse(
        200,
        String(url),
        '<script type="application/ld+json">{"@type":"VideoObject","contentUrl":"https://cdn.example/via-proxy/master.m3u8"}</script>'
      );
    }
    return fakeResponse(403, String(url), '<title>Just a moment...</title> cf-chl');
  };
  try {
    const outcome = await extractors.resolveEmbedDetailed(
      'https://voe.sx/e/proxy123456',
      'https://proveedor.example/ver',
      {
        fetchImpl,
        forwardClientIp: false,
        proxyUrls: ['http://proxy-user:proxy-pass@203.0.113.20:8080'],
      }
    );
    assert.equal(outcome.ok, true);
    assert.equal(outcome.via, 'proxy-egress');
    assert.equal(outcome.proxyTried, true);
    assert.equal(outcome.localReason, 'antibot');
    assert.deepEqual(viaProxy, [false, true]); // directo primero; proxy solo tras el bloqueo
    assert.match(playableNoteForResolution(outcome), /vía proxy de salida/);
    assert.doesNotMatch(JSON.stringify(outcome), /proxy-user|proxy-pass|203\.0\.113\.20/);
    // Beamup sigue bloqueado en directo: el circuito global no se "cura".
    assert.ok(extractors.getHostBlock('https://voe.sx/e/otro'));

    const second = await extractors.resolveEmbedDetailed(
      'https://voe.sx/e/proxy234567',
      'https://proveedor.example/ver',
      {
        fetchImpl,
        forwardClientIp: false,
        proxyUrls: ['http://proxy-user:proxy-pass@203.0.113.20:8080'],
      }
    );
    assert.equal(second.ok, true);
    assert.deepEqual(viaProxy, [false, true, true]); // sin fetch directo (circuito) y reutiliza la salida buena
  } finally {
    extractors.clearHostHealth();
    await httpClient.closeProxyDispatchers();
  }
});

test('resolveEmbedDetailed: una salida proxy fallida entra en enfriamiento por host', async () => {
  extractors.clearHostHealth();
  let calls = 0;
  const proxyUrl = 'http://proxy-user:proxy-pass@203.0.113.21:8080';
  const fetchImpl = async (url, opts = {}) => {
    calls += 1;
    if (opts.dispatcher) throw new Error(`CONNECT rechazado vía ${proxyUrl}`);
    return fakeResponse(403, String(url), '<title>Just a moment...</title> cf-chl');
  };
  try {
    const first = await extractors.resolveEmbedDetailed(
      'https://voe.sx/e/proxyfallo12',
      'https://proveedor.example/ver',
      { fetchImpl, forwardClientIp: false, proxyUrls: [proxyUrl] }
    );
    assert.equal(first.ok, false);
    assert.equal(first.blocked, true);
    assert.equal(first.proxyTried, true);
    assert.equal(first.proxyResult.reason, 'proxy-error');
    assert.equal(calls, 2);
    assert.doesNotMatch(JSON.stringify(first), /proxy-user|proxy-pass|203\.0\.113\.21/);

    const second = await extractors.resolveEmbedDetailed(
      'https://voe.sx/e/proxyfallo34',
      'https://proveedor.example/ver',
      { fetchImpl, forwardClientIp: false, proxyUrls: [proxyUrl] }
    );
    assert.equal(second.reason, 'circuit-open');
    assert.equal(second.proxyTried, false); // misma salida+host: ya falló, no se repite
    assert.equal(calls, 2);
  } finally {
    extractors.clearHostHealth();
    await httpClient.closeProxyDispatchers();
  }
});
