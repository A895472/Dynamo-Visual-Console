# Dynamo Visual Console

Consola web para gestionar tablas de **AWS DynamoDB** en multiples entornos (desa, pre, pro) y convertir expresiones de reglas a JSON DynamoDB y viceversa.

Construida con **React 19 + Vite + TypeScript**.

---

## Requisitos previos

- Node.js >= 18
- Perfiles AWS configurados en `~/.aws/credentials` (para modo local)

---

## Instalacion

```bash
cd Dynamo-Visual-Console
npm install
```

---

## Scripts

```bash
npm run dev       # Modo local -- conecta a AWS con perfiles de ~/.aws/credentials
npm run desa      # Entorno desa -- credenciales manuales desde Ajustes
npm run pre       # Entorno pre  -- credenciales manuales desde Ajustes
npm run build     # Build de produccion
npm run preview   # Previsualiza la build
npm run lint      # ESLint
```

---

## Modos de arranque

| Modo | Credenciales AWS |
|---|---|
| `dev` (local) | Perfiles de `~/.aws/credentials` |
| `desa` / `pre` (remoto) | Se introducen en la pantalla de **Ajustes** |

Para credenciales personales en modo local que **no deben commitearse**, crea `.env.local` en la raiz del proyecto:

```dotenv
DYNAMO_PROFILE_DESA=miPerfilDesa
DYNAMO_PROFILE_PRE=miPerfilPre
DYNAMO_PROFILE_PRO=miPerfilPro
DYNAMO_REGION=eu-west-1
```

---

## Variables de entorno

Los `.env` se organizan en `enviroments/`:

```
enviroments/
├── .env          # Variables comunes a todos los entornos
├── dev/          # Variables especificas de dev
├── desa/         # Variables especificas de desa
├── pre/          # Variables especificas de pre
└── prod/         # Variables especificas de produccion
```

Las variables expuestas al navegador deben empezar por `VITE_`.

---

## Funcionalidades

- **Tablas** -- listar tablas, escanear items, insertar/actualizar y eliminar.
- **Converter** -- convierte expresiones de regla de texto a JSON DynamoDB y viceversa.
- **Entornos** -- selector de entorno (desa / pre / pro).
- **i18n** -- espanol e ingles, switchable en runtime.
- **Theme** -- modo claro / oscuro persistido en `localStorage`.

---

## Estructura

```
src/
├── components/     # UI por feature (Console, Converter, Settings, Home...)
├── layouts/        # MainLayout + MinimalLayout
├── services/       # Llamadas a API y storage
├── i18n/           # Traducciones ES / EN
├── models/         # Tipos TypeScript
├── navigation/     # Rutas con React Router
└── utils/          # Constantes y helpers
```
