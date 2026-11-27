# 0004. Módulos dentro de la tabla de asignaturas

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

La decisión abierta 5 de `docs/contexto-proyecto.md` preguntaba dónde viven los módulos, una unidad curricular distinta de la asignatura pero que un ajuste puede tener como nivel de impacto. El prototipo no maneja códigos de asignatura.

## Decisión

- Módulos y asignaturas comparten la tabla `asignatura`, distinguidos por `tipo` (`ASIGNATURA` o `MODULO`).
- Un registro con nivel de impacto `MODULO` apunta, por `asignatura_id`, a una fila de tipo `MODULO`; con nivel `ASIGNATURA`, a una de tipo `ASIGNATURA`.
- La coherencia entre nivel y tipo la valida la API. No se agrega un CHECK ni un trigger nuevo: el SQL de reglas es el del kit y cualquier cambio exige una petición explícita.
- `codigo` es opcional, porque el prototipo no tiene códigos. La unicidad es `(carrera_id, codigo)` y `(carrera_id, tipo, nombre)`.

## Consecuencias

- Una sola tabla y un solo catálogo para ambos niveles, sin una tabla casi idéntica.
- La base no impide hoy apuntar un registro de nivel `MODULO` a una asignatura; esa regla depende de la API y de sus pruebas.
- Si el cliente agrega códigos, la columna ya existe y la restricción de unicidad ya la cubre.
