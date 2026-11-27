# 0015. Correlativo completo desde el número 1000

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

La regla del kit armaba el folio con `lpad(numero, 3, '0')`. En PostgreSQL `lpad` recorta el texto cuando es más largo que el ancho pedido, así que el registro 1000 quedaba como `R-2026-100` y chocaba con el índice único `registro_correlativo_key`. Con unos 100 registros al año no ocurre pronto, pero es un fallo latente en una regla protegida de la base.

## Decisión

- El folio lleva al menos tres dígitos y, desde el 1000, el número completo: `R-2026-999`, `R-2026-1000`. La expresión pasa a `lpad(numero, greatest(3, length(numero)), '0')`.
- Se corrige con una migración nueva (`20261127100000_correlativo_desde_mil`) que reemplaza `asignar_correlativo()`, y no editando la migración inicial, que ya está aplicada.
- El usuario aprobó tocar esta regla SQL protegida el 26-11-2026.

## Consecuencias

- Los folios ya emitidos no cambian. `CREATE OR REPLACE` conserva dueño, permisos y el trigger `registro_correlativo`.
- Ordenar por el texto del folio pondría `R-2026-1000` antes de `R-2026-999`. El listado ya ordena por columnas numéricas (`sesion.fecha`, `anio`, `numero` en `apps/api/src/registros/registros.service.ts`) y el detalle de una sesión por `anio, numero`; cualquier orden nuevo debe usar `anio, numero`, nunca `correlativo`.
- Las 26 pruebas de reglas de base siguen pasando y una prueba de Jest cubre el paso por 999, 1000 y 1001 dentro de una transacción que se revierte.
