# 🚀 Desplegar «Anime Español Multi · Streams» en Beamup

Este repositorio ya está preparado para **Beamup** (el hosting de addons de
Stremio basado en Dokku/Herokuish).

> ⚠️ Importante: Beamup despliega la **raíz del repositorio Git**. Como este
> repo también contiene la app Android, la raíz lleva un pequeño envoltorio
> Node (`package.json` + `Procfile`) que arranca el addon desde
> `stremio-addon-estrenosanime/src/index.js`. Por eso los comandos de Beamup
> se ejecutan **desde la raíz**, no desde la subcarpeta del addon. La app
> Android queda fuera del slug gracias a `.slugignore` y no se despliega.

El servidor ya cumple lo que pide Beamup: escucha en `process.env.PORT`
(obligatorio) sobre `0.0.0.0`, no escribe en disco ni necesita base de datos
(las cachés son en memoria), y fija **Node 22** en `engines`/`.nvmrc`.

---

## ✅ Requisitos

- Node.js instalado en tu PC (para el CLI).
- Una cuenta de GitHub con una **clave SSH añadida a tu cuenta**
  (GitHub → *Settings → SSH and GPG keys*). Beamup sincroniza esas claves
  para autorizar el `git push`.

## Opción 1 — Beamup CLI (recomendada)

Desde la **raíz de tu clon** de este repositorio:

```bash
npm install -g beamup-cli

# Solo la primera vez (y cuando cambies tus claves SSH de GitHub):
beamup config
#   Beamup Host:    a.baby-beamup.club
#   GitHub Username: <tu-usuario-de-github>

# Registra el proyecto y crea el remoto git "beamup"
# (el nombre ya viene fijado en beamup.json):
beamup init anime-espanol-multi

# Despliega
beamup deploy
# (`beamup` a secas hace lo mismo)
```

El CLI imprime la URL del proyecto, con este formato:

```
Project URL: <hash-de-tu-usuario>-anime-espanol-multi.baby-beamup.club
```

Tu manifiesto para Stremio será:

```
https://<esa-url>/manifest.json
```

Abre `https://<esa-url>/` y pulsa **🚀 Instalar addon** (recuerda: es un
addon **solo de streams**, sin catálogos, sin demos y sin configurador).

### Actualizar después

Haz commit de tus cambios y vuelve a ejecutar `beamup deploy` desde la raíz.
Otros comandos útiles:

```bash
beamup logs                         # ver logs en vivo
beamup secrets DEBUG 0              # producción: oculta /debug/*
beamup secrets EA_BASE_URL https://nuevo-dominio.example   # solo si una web se muda
beamup delete                       # borra el proyecto de Beamup
```

Variables opcionales: `EA_BASE_URL`, `INF_BASE_URL`, `JARA_BASE_URL`,
`LAT_BASE_URL`, `D23_BASE_URL`, `EA_TIMEOUT_MS`, `EA_EMBED_TIMEOUT_MS`,
`EA_USER_AGENT`, `DEBUG`. No hace falta ninguna para funcionar.

## Opción 2 — GitHub Actions (sin instalar el CLI)

Hay un workflow manual listo: `.github/workflows/deploy-beamup.yml`.

1. Crea un par de claves SSH dedicado para desplegar, por ejemplo:
   ```bash
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/beamup_deploy -C "beamup-deploy"
   ```
2. Añade la clave **pública** (`~/.ssh/beamup_deploy.pub`) a tu cuenta de
   GitHub (*Settings → SSH and GPG keys*). Debe ser de la cuenta, no basta
   una *deploy key* del repo: Beamup sincroniza las claves del usuario.
3. En este repo: *Settings → Secrets and variables → Actions → New repository
   secret*:
   - Nombre: `SSH_PRIVATE_KEY`
   - Valor: el contenido de la clave **privada** (`~/.ssh/beamup_deploy`).
   Nunca subas esa clave al repo ni la pegues en issues/chats.
4. Pestaña **Actions → “Desplegar addon en Beamup” → Run workflow**.
   Primero instala en raíz y ejecuta los tests; si pasan, despliega con la
   action oficial `Stremio/beamup-deploy-action`.

El host (`a.baby-beamup.club`), el proyecto (`anime-espanol-multi`) y el
usuario (dueño del repo) ya están fijados en el workflow.

---

## 🧯 Problemas típicos

- **Ejecutaste `beamup` dentro de `stremio-addon-estrenosanime/`** y pregunta
  si quieres crear un repo Git ahí: di **no**, sube a la raíz (`cd ..`) y
  repite. El CLI busca `.git` en la carpeta actual.
- **`Permission denied (publickey)`**: la clave pública de tu PC no está en
  la cuenta de GitHub indicada en `beamup config`, o tu agente SSH no la
  ofrece. Añádela y vuelve a ejecutar `beamup config` para resincronizar.
- **`remote beamup already exists`**: revisa `git remote -v`; si apunta a
  otro proyecto, cámbialo con `git remote remove beamup` y repite `init`.
- **Build sin buildpack / no arranca**: no renombres el `package.json` ni el
  `Procfile` de la raíz; Beamup usa el buildpack Herokuish de Node y arranca
  con `npm start` respetando `PORT`.
- **¿Por qué no usa el `Dockerfile` del addon?** Beamup solo soporta de
  forma estable el buildpack Herokuish; el Dockerfile sigue siendo válido
  para Docker, pero Beamup no lo usa en este monorepo.
- **Comprobar en producción**: `https://<tu-url>/health` debe listar las 5
  fuentes. Para depurar proveedores, deja `DEBUG` sin fijar al principio y
  usa `/debug/search`, `/debug/watch` y `/debug/map` (ver el README del addon).

Documentación oficial:
[Stremio Addon SDK — Deploying to Beamup](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/deploying/beamup.md) ·
[beamup-cli](https://github.com/Stremio/stremio-beamup-cli) ·
[beamup-deploy-action](https://github.com/Stremio/beamup-deploy-action).
