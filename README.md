<div align="center">

# 🎬 StreamFlex

**v0.0.1 — misma versión, build mucho más estable**

App Android nativa · sin anuncios · sin permisos · sin telemetría

![version](https://img.shields.io/badge/version-0.0.1-4f8ef7?style=for-the-badge)
![platform](https://img.shields.io/badge/platform-Android%205.0%2B-3ddc84?style=for-the-badge&logo=android)
![package](https://img.shields.io/badge/package-com.noe.streamflex-8b5cf6?style=for-the-badge)
![deps](https://img.shields.io/badge/dependencies-0-22c55e?style=for-the-badge)

</div>

---

## 📥 Descargar el APK

**[Releases → StreamFlex v0.0.1](../../releases/tag/v0.0.1)** → `StreamFlex-0.0.1.apk`

1. Descarga `StreamFlex-0.0.1.apk` (o usa el artifact del run de Actions)
2. En el celular activa *"Instalar apps de origen desconocido"*
3. Abre el archivo → Instalar → listo
4. Si Play Protect muestra un aviso (pasa con cualquier app fuera de la Play Store),
   elige **"Instalar de todas formas"**

### Verificar la descarga (opcional)

El release incluye `apk.sha256`:

```bash
sha256sum -c apk.sha256
# StreamFlex-0.0.1.apk: OK
```

> La versión **no** cambia: sigue siendo `0.0.1` (versionCode 1). El Release se
> actualiza con cada build mejorado, así que si ya lo tenías, vuelve a descargarlo
> para quedarte con la build más reciente.

---

## ✨ Lo que se mejoró en esta build

### Estabilidad (lo importante)

| Antes | Ahora |
|---|---|
| Animaciones encadenadas sin control | Un único `Choreographer.FrameCallback` por vista animada, con auto-pausa |
| Animación seguía corriendo en segundo plano | Se detiene en `onDetachedFromWindow` / al ocultarse la ventana |
| Contenido tapado por notch o barra de estado | Insets aplicados por código (API 21 → 34), con `displayCutout` |
| Se cortaba en horizontal o pantallas chicas | Todo el contenido va en `ScrollView` con `fillViewport` |
| Animaciones ignoraban accesibilidad | Respeta *"Quitar animaciones"* del sistema (`ANIMATOR_DURATION_SCALE = 0`) |
| Posible pantalla en blanco si algo fallaba | Arranque con respaldo anti-crash (`try/catch` + vista mínima) |
| Cero verificación en CI | El build **falla** si la firma, el package o la versión no cuadran |
| Checksum del release podía quedar viejo | `apk.sha256` se regenera en cada build junto al APK |
| Builds podían pisarse entre sí | `concurrency` por rama + `timeout-minutes` |

### Diseño

- **Fondo vivo propio**: 3 auroras radiales en movimiento + 64 estrellas titilantes, dibujadas a mano en `Canvas` (cero librerías, cero asignaciones por frame).
- **Halos que laten** detrás del logo + logo con respuesta táctil (se hunde al tocar).
- **Título con shimmer**: degradado de luz que barre el nombre.
- **Tarjetas de vidrio** con las 3 garantías: sin anuncios · 100% offline · 0 permisos.
- **Chip de versión** que lee la versión real del paquete instalado (`v0.0.1 · BETA`).
- **Splash nativo** en Android 12+ con el icono de la app.
- **Entrada escalonada** de todos los bloques con `DecelerateInterpolator`.

### Funcionalidad nueva

- **Toca el logo** → háptica + diálogo "Acerca de StreamFlex" con datos reales del
  dispositivo: versión, package, Android/SDK, fabricante y modelo, arquitectura (ABI)
  y número de permisos realmente declarados en el manifiesto.
- **Toca el chip de versión** → repite la animación de entrada.
- **Rendimiento**: el fondo animado se limita a ~40 fps (las auroras son lentas) para
  no gastar batería ni calentar el teléfono.

---

## 📱 Ficha técnica

| Dato | Valor |
|---|---|
| Nombre | **StreamFlex** |
| Versión | **0.0.1** (versionCode 1) |
| Package | `com.noe.streamflex` |
| minSdk | 21 — Android 5.0 Lollipop |
| targetSdk | 34 — Android 14 |
| Lenguaje | Java (SDK puro) |
| Dependencias | **0** |
| Permisos | **0** |
| Red | **Ninguna** — funciona 100% offline |
| Tamaño | ~90 KB |

### Código

```
app/src/main/java/com/noe/streamflex/
├── MainActivity.java          # orquesta UI, insets, datos reales, diálogo
└── ui/
    ├── AuroraBackdropView.java  # auroras + campo de estrellas (Canvas)
    ├── PulseRingView.java       # halos que laten
    └── ShimmerTitleView.java    # título con barrido de luz
```

---

## 🛠️ Compilar

Requisitos: **JDK 17** + **Android SDK** con build-tools 34.

```bash
gradle assembleDebug     # APK de prueba
gradle assembleRelease   # APK release
```

Los APK salen en `app/build/outputs/apk/{debug,release}/`.
El CI (`.github/workflows/build-apk.yml`) compila, firma, verifica y publica el
Release automáticamente en cada push.

### Firma

```bash
export SIGNING_KEYSTORE=/ruta/mi.keystore
export SIGNING_STORE_PASSWORD=****
export SIGNING_KEY_ALIAS=****
export SIGNING_KEY_PASSWORD=****
gradle assembleRelease
```

Si no defines esas variables, el CI crea un keystore temporal para firmar el release.

---

## 🔒 Privacidad

- 0 permisos declarados en el manifiesto (verificado por CI con `aapt2`)
- 0 librerías de terceros
- 0 conexiones de red

---

## 🌸 Extra: Addon de Stremio «Estrenos Anime ES»

Este repo también incluye, en [`stremio-addon-estrenosanime/`](stremio-addon-estrenosanime/),
un **addon de Stremio solo de streams** (Node.js): sobre las fichas de
Cinemeta/IMDb, Kitsu o MAL devuelve los servidores de
[estrenosanime.net](https://estrenosanime.net) en español
💬 **Subtitulado** · 🌎 **Latino** · 🇪🇸 **Castellano**.
Sin catálogos ni fichas propias, únicamente el recurso `stream`.

> Es un proyecto **independiente** de la app Android (no comparte código ni
> afecta su compilación). Guía completa en
> [`stremio-addon-estrenosanime/README.md`](stremio-addon-estrenosanime/README.md)
> e investigación de la web en
> [`INVESTIGACION.md`](stremio-addon-estrenosanime/INVESTIGACION.md).

---

<div align="center">

Hecho con 💙 por **Noe** · StreamFlex 0.0.1

</div>
