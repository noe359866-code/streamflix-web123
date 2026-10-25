<div align="center">

# 🎬 StreamFlex

**v0.0.1 — primera versión propia**

App Android nativa · sin anuncios · sin permisos · sin telemetría

![version](https://img.shields.io/badge/version-0.0.1-4f8ef7?style=for-the-badge)
![platform](https://img.shields.io/badge/platform-Android%205.0%2B-3ddc84?style=for-the-badge&logo=android)
![package](https://img.shields.io/badge/package-com.noe.streamflex-8b5cf6?style=for-the-badge)

</div>

---

## ¿Qué es esto?

**StreamFlex** es una app Android propia, hecha desde cero con Java + Android SDK puro (sin
librerías externas, sin AndroidX, sin dependencias descargadas). Esta `0.0.1` es la versión
inicial: pantalla de marca con logo animado, nombre y versión leída directamente del paquete
instalado.

| Dato | Valor |
|---|---|
| Nombre de la app | **StreamFlex** |
| Versión | **0.0.1** |
| versionCode | `1` |
| Package / applicationId | `com.noe.streamflex` |
| minSdk | 21 (Android 5.0 Lollipop) |
| targetSdk | 34 (Android 14) |
| Lenguaje | Java |
| Peso del APK | ~1 MB |

---

## 📥 Descargar el APK

El APK se compila automáticamente en **GitHub Actions** y se publica en
**[Releases](../../releases)** de este repo:

1. Abre **Releases** → `StreamFlex v0.0.1`
2. Descarga `StreamFlex-0.0.1.apk`
3. En el celular activa *"Instalar apps de origen desconocido"* y abre el archivo
4. Instalar → abrir → listo

> También puedes generarlo manualmente desde la pestaña **Actions → Build StreamFlex APK → Run workflow**.
> El APK queda como *artifact* de la ejecución y además en un Release.

---

## 🛠️ Compilar desde cero (local)

Requisitos: **JDK 17** y **Android SDK** (con build-tools 34).

```bash
git clone https://github.com/noe359866-code/streamflix-web123.git
cd streamflix-web123
gradle assembleDebug        # APK de prueba, firmado con la debug key
# o, para release firmado:
gradle assembleRelease
```

Los APK salen en `app/build/outputs/apk/{debug,release}/`.

### Firma (opcional)

Si defines estas variables de entorno, el build de release se firma con tu keystore:

```bash
export SIGNING_KEYSTORE=/ruta/mi.keystore
export SIGNING_STORE_PASSWORD=****
export SIGNING_KEY_ALIAS=****
export SIGNING_KEY_PASSWORD=****
gradle assembleRelease
```

Si no las defines, el CI crea un keystore temporal para firmar el APK de release.

---

## 📁 Estructura del proyecto

```
.
├── app/
│   ├── build.gradle                 # config de la app + versionName 0.0.1
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/noe/streamflex/
│       │   └── MainActivity.java    # pantalla de inicio (animaciones nativas)
│       └── res/
│           ├── drawable/            # degradados, glow, logo vectorial
│           ├── layout/activity_main.xml
│           ├── mipmap-*/            # iconos launcher (todas las densidades)
│           └── values/              # strings, colores, tema
├── .github/workflows/build-apk.yml  # CI: compila, firma y publica el APK
├── build.gradle
├── settings.gradle
└── gradle.properties
```

---

## 🔒 Privacidad

- **0 permisos** declarados en el manifest
- **0 librerías de terceros**
- **0 conexiones de red** — la app funciona totalmente offline
- No recopila, no envía ni comparte ningún dato

---

## 🗺️ Roadmap (próximas versiones)

- `0.1.0` — catálogo local con listas y búsqueda
- `0.2.0` — reproductor propio (MediaPlayer / ExoPlayer)
- `0.3.0` — favoritos y "continuar viendo" persistidos

---

<div align="center">

Hecho con 💙 por **Noe** · StreamFlex 0.0.1

</div>
