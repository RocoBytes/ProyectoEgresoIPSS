# 0006. Cómo entrega Prisma 7 el error 23514

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

Las reglas de cierre y anulación viven en la base: CHECK (`registro_cierre_completo`) y el trigger `proteger_registro`, que rechaza cambios sobre registros cerrados o anulados con SQLSTATE 23514 (`check_violation`). La API debe traducirlos a 409 con el mensaje de la base. `CLAUDE.md` advertía que no estaba probado cómo los entrega Prisma 7 con el adaptador `pg`, así que se midió antes de escribir el filtro (Prisma 7.10.1, PostgreSQL 16, conectado como `ipss_api`).

## Decisión

Observado, igual para CHECK y trigger:

- Llega un `PrismaClientKnownRequestError`, nunca un `PrismaClientUnknownRequestError`.
- El código de Prisma depende de la vía: `P2039` con la API de modelos (`registro.update`) y `P2010` con SQL crudo (`$executeRaw`). No existe un código propio para 23514.
- El SQLSTATE y el mensaje están en `meta.driverAdapterError.cause`: `code` y `originalCode` valen `"23514"`, y `message` y `originalMessage` traen el texto de la base. Para el CHECK, `cause.detail` incluye la fila completa.
- Los errores que ya se traducían llegan como se esperaba: `P2025` (actualizar un id inexistente), `P2002` (causa `UniqueConstraintViolation`, SQLSTATE 23505) y `P2003` (causa `ForeignKeyConstraintViolation`, 23503).

El filtro global (`apps/api/src/comun/filtro-errores.ts`) detecta el 23514 por `meta.driverAdapterError.cause.code === '23514'`, sin mirar el código `P20xx`, y responde 409 con `cause.message`. Nunca usa `detail`, porque contiene datos de la fila. P2025 pasa a 404, P2002 y P2003 a 409 con un mensaje genérico, y lo demás a 500 sin detalle interno.

## Consecuencias

- El mensaje del CHECK es el técnico de PostgreSQL (en inglés, con el nombre de la restricción); el del trigger es el texto en español que escribe la migración. Si la interfaz necesita un texto propio para el CHECK, habrá que mapear el nombre de la restricción.
- Esta forma es un detalle interno del adaptador, no una API documentada. Antes de subir Prisma o `@prisma/adapter-pg` hay que correr `npm test`: `test/errores-bd.e2e-spec.ts` dispara los dos casos contra PostgreSQL real por ambas vías y falla si la forma cambia. Las pruebas unitarias del filtro usan la forma observada, pero solo el e2e la verifica contra la base.
- Un error de Prisma que no coincida con ninguna regla cae en 500 genérico, así que un cambio de forma falla de manera visible y no filtra datos.
