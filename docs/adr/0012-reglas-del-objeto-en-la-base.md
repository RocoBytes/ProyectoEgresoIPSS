# 0012. Reglas del objeto de un registro en la base

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

Un registro apunta a un objeto distinto según su nivel de impacto: una asignatura, un módulo, una versión de malla, un recurso de una asignatura o nada (perfiles). Con tres columnas opcionales (`asignatura_id`, `version_malla_id`, `recurso`) es posible guardar combinaciones sin sentido o un objeto de otra carrera, y una clave foránea no puede expresar «misma carrera» porque compara una sola columna.

## Decisión

La migración `20261127090000_reglas_objeto` agrega, escritos a mano como el resto de las reglas:

- el CHECK `registro_objeto_segun_nivel`, que fija qué columnas lleva cada nivel (un recurso exige además al menos 3 caracteres);
- el trigger `registro_validar_objeto`, que exige que la asignatura o la malla pertenezcan a la carrera del registro y que el tipo (asignatura o módulo) corresponda al nivel; falla con SQLSTATE 23514.

La API valida lo mismo antes de escribir para devolver el campo exacto con un 400; la base es la última defensa y el filtro global traduce su 23514 a 409.

## Consecuencias

- Ninguna vía de acceso (API, script, consola SQL con el rol de la API) puede guardar un objeto incoherente.
- Las reglas se prueban directamente en la base (`reglas-objeto.e2e-spec.ts`) y cualquier cambio a ellas exige que sigan pasando las 26 pruebas de reglas.
- Cambiar los niveles o sus columnas requiere una migración nueva, no editar esta.
