'use strict';

/**
 * Beamup/Dokku despliega la RAÍZ del repositorio Git. Como este repo
 * también contiene la app Android, la raíz lleva un envoltorio Node
 * (package.json + Procfile) que arranca el addon desde su subcarpeta.
 * Estos tests fijan ese contrato sin tocar la red.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const addonRoot = path.join(__dirname, '..');
const repoRoot = path.join(addonRoot, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('Beamup: envoltorio Node en la raíz del repo', () => {
  const rootPkg = readJson(path.join(repoRoot, 'package.json'));
  const addonPkg = readJson(path.join(addonRoot, 'package.json'));

  assert.equal(rootPkg.private, true);
  assert.equal(rootPkg.version, addonPkg.version);
  assert.equal(rootPkg.scripts.start, 'node stremio-addon-estrenosanime/src/index.js');
  assert.equal(rootPkg.engines.node, '22.x');
  assert.equal(addonPkg.engines.node, '22.x');

  // Las dependencias de runtime deben coincidir: Dokku instala la raíz
  // y Node resuelve los módulos del addon subiendo directorios.
  assert.deepEqual(rootPkg.dependencies, addonPkg.dependencies);

  const lock = readJson(path.join(repoRoot, 'package-lock.json'));
  assert.equal(lock.name, rootPkg.name);
  assert.equal(lock.version, rootPkg.version);
  assert.equal(lock.packages[''].engines.node, '22.x');
});

test('Beamup: Procfile, proyecto y slug sin la app Android', () => {
  const procfile = fs.readFileSync(path.join(repoRoot, 'Procfile'), 'utf8').trim();
  assert.equal(procfile, 'web: npm start');

  const beamup = readJson(path.join(repoRoot, 'beamup.json'));
  assert.match(beamup.projectName, /^[a-z0-9][a-z0-9-]*$/);
  assert.equal(beamup.projectName, 'anime-espanol-multi');

  const slugignore = fs.readFileSync(path.join(repoRoot, '.slugignore'), 'utf8');
  assert.match(slugignore, /^app\/$/m);
  assert.doesNotMatch(slugignore, /stremio-addon-estrenosanime\/src\//);

  // Dokku define el puerto: el servidor debe obedecer PORT y 0.0.0.0.
  const server = fs.readFileSync(path.join(addonRoot, 'src', 'index.js'), 'utf8');
  assert.match(server, /Number\(process\.env\.PORT/);
  assert.match(server, /app\.listen\(PORT,\s*'0\.0\.0\.0'/);
});
