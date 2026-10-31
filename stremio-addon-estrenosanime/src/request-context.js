'use strict';

/**
 * Contexto por petición HTTP (IP pública de quien pide el stream).
 *
 * Ojo: esto NO cambia la IP de origen TCP del servidor —eso no se puede
 * "poner" desde Beamup/Render—. Solo permite, como intento extra cuando
 * un reproductor bloquea el datacenter, reintentar señalando la IP del
 * solicitante con cabeceras estándar de proxy (X-Forwarded-For).
 * La IP no se registra en logs ni se devuelve en diagnósticos; en caché
 * interna solo viaja su hash.
 */

const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');
const net = require('node:net');

const storage = new AsyncLocalStorage();

function normalizeIp(raw) {
  let value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end > 0) value = value.slice(1, end);
  } else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(':'));
  }
  value = value.replace(/%.*$/, '').replace(/^::ffff:/i, '');
  return net.isIP(value) ? value : '';
}

function isPrivateIp(raw) {
  const ip = normalizeIp(raw);
  const version = net.isIP(ip);
  if (!version) return false;
  if (version === 4) {
    const [a, b] = ip.split('.').map((n) => parseInt(n, 10));
    return a === 0 || a === 10 || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) // CGNAT compartido
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0)
      || a >= 224;
  }
  const h = ip.toLowerCase();
  if (h === '::' || h === '::1') return true;
  if (h.startsWith('::ffff:')) return isPrivateIp(h.slice('::ffff:'.length));
  return /^f[cd]/.test(h) // fc00::/7
    || /^fe[89ab]/.test(h) // fe80::/10
    || h.startsWith('ff') // multicast
    || h.startsWith('2001:db8:');
}

function isPublicIp(raw) {
  const ip = normalizeIp(raw);
  return Boolean(ip && !isPrivateIp(ip));
}

function hashIp(raw) {
  const ip = normalizeIp(raw);
  return ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12) : '';
}

function firstPublicIp(value) {
  const parts = String(value || '').split(',');
  for (const part of parts) {
    const ip = normalizeIp(part.replace(/^for=/i, '').replace(/^"|"$/g, ''));
    if (isPublicIp(ip)) return ip;
  }
  return '';
}

/**
 * IP pública del solicitante. Las cabeceras de reenvío solo se creen si
 * el despliegue declara confiar en su proxy (EA_TRUST_PROXY=1) o si la
 * conexión inmediata llega desde una IP privada/loopback (el nginx de
 * Dokku/Beamup dentro de Docker). Así un cliente directo no puede
 * suplantar la IP de otro solo inventándose un X-Forwarded-For.
 */
function parseClientIp(req, options = {}) {
  if (!req) return '';
  const headers = req.headers || {};
  const remote = normalizeIp(
    (req.socket && req.socket.remoteAddress)
    || (req.connection && req.connection.remoteAddress)
    || ''
  );
  const trustForwarded = Boolean(options.trustProxy) || (remote && isPrivateIp(remote));
  if (trustForwarded) {
    const forwarded = firstPublicIp(headers['x-forwarded-for'])
      || firstPublicIp(headers['x-real-ip'])
      || firstPublicIp(headers['cf-connecting-ip'])
      || firstPublicIp(headers.forwarded);
    if (forwarded) return forwarded;
  }
  const expressIp = normalizeIp(req.ip || '');
  if (isPublicIp(expressIp)) return expressIp;
  return isPublicIp(remote) ? remote : '';
}

function clientIpHeaders(raw) {
  const ip = normalizeIp(raw);
  if (!isPublicIp(ip)) return {};
  const forwardedFor = net.isIP(ip) === 6 ? `"[${ip}]"` : ip;
  return {
    'X-Forwarded-For': ip,
    'X-Real-IP': ip,
    Forwarded: `for=${forwardedFor}`,
  };
}

function runWithRequestContext(context, fn) {
  const clientIp = normalizeIp(context && context.clientIp);
  return storage.run({ clientIp: isPublicIp(clientIp) ? clientIp : '' }, fn);
}

function getRequestContext() {
  return storage.getStore() || {};
}

function getClientIp() {
  return getRequestContext().clientIp || '';
}

module.exports = {
  normalizeIp,
  isPrivateIp,
  isPublicIp,
  hashIp,
  parseClientIp,
  clientIpHeaders,
  runWithRequestContext,
  getRequestContext,
  getClientIp,
};
