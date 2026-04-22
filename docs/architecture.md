# Architecture

## Frontend
- React + Vite + TypeScript.
- Existing archetype reused for routing, i18n and theme.
- Pages: dashboard, tables, converter, settings.
- Frontend falls back to local mock data if backend or converter are not reachable.

## Backend
- Spring Boot 3.3 + AWS SDK v2.
- Generic endpoints to list tables, scan items, upsert items and delete items.
- `desa`, `pre` and `pro` are selected with the `environment` query parameter.
- API key protects mutating operations.

## Converter service
- Node.js + Express.
- Reuses parser, generator, reverser and validator from `ConvertidorReglasJson`.
- Endpoints: `/health`, `/parse`, `/reverse`, `/validate`.
