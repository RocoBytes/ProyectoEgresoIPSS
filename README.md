# Plataforma de validación del perfil de egreso

Aplicación web interna del IPSS para registrar sesiones de retroalimentación curricular y los ajustes que resultan en cada carrera, con trazabilidad y un panel de indicadores.

**Stack:** monorepo npm; API NestJS 11 + Prisma 7 + PostgreSQL 16; web React 19 + Vite + Tailwind; Docker Compose con Caddy.

## Desarrollo

Requiere Node 26.13.1 (`.nvmrc`) y Docker en ejecución.

```sh
npm ci
npm run dev   # base, migraciones, datos de ejemplo, API en :3000 y web en http://127.0.0.1:5173
```

Usuarios de ejemplo (clave `Demo-2026`): `carla.fuentes@instituto.example`, `matias.sepulveda@instituto.example` y `paula.henriquez@instituto.example`.

## Pruebas

- `npm test`: las 26 reglas de base, Jest (API) y Vitest (web).
- `npm run e2e`: tres flujos con Playwright contra la pila completa en Compose.
- `npm run test:respaldo`: respalda, destruye, restaura y compara.

## Más información

- [Instalación en el servidor](docs/instalacion.md)
- [Contexto del proyecto](docs/contexto-proyecto.md)
- [Decisiones de arquitectura](docs/adr/)
- [Guía para quien programa (`CLAUDE.md`)](CLAUDE.md)
