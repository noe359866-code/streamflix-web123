'use strict';

/**
 * Resolver residencial opcional (anti-bloqueo de datacenter).
 *
 * Ejecútalo en una conexión NO-datacenter (tu PC, una Raspberry, un NAS…)
 * y exponlo a tu despliegue de Beamup/Render con un túnel seguro
 * (Cloudflare Tunnel, Tailscale, etc.). El addon principal solo lo usa
 * cuando un reproductor bloquea la IP del hosting:
 *
 *   EA_EXTERNAL_RESOLVER_URL=https://tu-tunel.example
 *   EA_EXTERNAL_RESOLVER_TOKEN=un-secreto-largo
 *
 * Uso local:
 *   RESOLVER_TOKEN=un-secreto-largo npm run resolver:home
 *
 * Contrato:
 *   GET /health
 *   GET /resolve?url=<embed>&referer=<pagina>
 *       -> JSON de resolveEmbedDetailed ({ok,url,referer,blocked,...})
 *
 * Seguridad: por defecto escucha SOLO en 127.0.0.1. Si lo abres a otra
 * interfaz exige token. No es un proxy de vídeo: solo resuelve embeds.
 */

const crypto = require('node:crypto');
const net = require('node:net');
const express = require('express');
const { resolveEmbedDetailed } = require('../src/extractors');
const { EXTERNAL_RESOLVER_TOKEN } = require('../src/config');

function isPrivateIp(hostname) {
  const host = String(hostname || '').toLowerCase();
  const version = net.isIP(host);
  if (!version) return false;
  if (version === 4) {
    const parts = host.split('.').map((n) => parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0)
      || a >= 224;
  }
  const h = host.replace(/%.*$/, '');
  if (h === '::' || h === '::1') return true;
  if (h.startsWith('::ffff:')) return isPrivateIp(h.slice('::ffff:'.length));
  return /^f[cd]/.test(h) // fc00::/7
    || /^fe[89ab]/.test(h) // fe80::/10
    || h.startsWith('ff') // multicast
    || h.startsWith('2001:db8:');
}

function isPublicHttpUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return false; }
  if (!/^https?:$/i.test(u.protocol)) return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === 'localhost') return false;
  if (/\.(localhost|local|internal|intranet|lan|home)$/i.test(host)) return false;
  if (net.isIP(host)) return !isPrivateIp(host);
  // Los embeds públicos tienen dominio con punto; "router", "nas", etc. no.
  return host.includes('.');
}

function tokenFromRequest(req) {
  const auth = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return String(req.headers['x-resolver-token'] || '').trim();
}

function tokensMatch(actual, expected) {
  if (!expected) return true;
  const a = Buffer.from(String(actual || ''));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createHomeResolverApp(options = {}) {
  const token = options.token !== undefined ? options.token : EXTERNAL_RESOLVER_TOKEN;
  const resolver = options.resolver || resolveEmbedDetailed;
  const app = express();
  app.disable('x-powered-by');

  const hits = new Map();
  const rateLimit = (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const recent = (hits.get(key) || []).filter((t) => now - t < 60 * 1000);
    recent.push(now);
    hits.set(key, recent);
    if (recent.length > 120) return res.status(429).json({ ok: false, reason: 'rate-limit' });
    return next();
  };

  app.get('/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ ok: true, service: 'anime-espanol-home-resolver' });
  });

  app.get('/resolve', rateLimit, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!tokensMatch(tokenFromRequest(req), token)) {
      return res.status(401).json({ ok: false, reason: 'unauthorized' });
    }
    const target = String(req.query.url || req.query.u || '').trim();
    if (!isPublicHttpUrl(target)) {
      return res.status(400).json({ ok: false, reason: 'invalid-url' });
    }
    let referer = String(req.query.referer || req.headers.referer || '').trim();
    if (!isPublicHttpUrl(referer)) {
      try { referer = `${new URL(target).origin}/`; } catch { referer = ''; }
    }
    try {
      const outcome = await resolver(target, referer, { allowExternal: false });
      return res.json(outcome);
    } catch (err) {
      return res.status(500).json({ ok: false, reason: 'resolver-error', error: err.message });
    }
  });

  return app;
}

function isLoopbackHost(host) {
  return ['127.0.0.1', '::1', 'localhost'].includes(String(host || '').toLowerCase());
}

if (require.main === module) {
  const port = Number(process.env.RESOLVER_PORT || process.env.PORT || 7199);
  const host = process.env.RESOLVER_HOST || '127.0.0.1';
  const token = process.env.RESOLVER_TOKEN || EXTERNAL_RESOLVER_TOKEN || '';
  if (!isLoopbackHost(host) && !token) {
    console.error('❌ Para escuchar fuera de localhost define RESOLVER_TOKEN (o usa un túnel hacia 127.0.0.1).');
    process.exit(1);
  }
  createHomeResolverApp({ token }).listen(port, host, () => {
    console.log(`🏠 Resolver residencial en http://${host}:${port}/`);
    console.log(`❤️  Salud: http://${host}:${port}/health`);
    console.log(token ? '🔐 Token activado para /resolve' : '⚠️  Sin token (solo localhost)');
  });
}

module.exports = {
  createHomeResolverApp,
  isPublicHttpUrl,
  isPrivateIp,
  tokenFromRequest,
  tokensMatch,
  isLoopbackHost,
};
