# 0003. Usuario en los historiales

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

La decisión abierta 4 de `docs/contexto-proyecto.md` preguntaba cómo identificar al autor de cada cambio. En el kit del 11-11-2026 las columnas `historial_estado.usuario`, `historial_cambio.usuario` y `registro.actualizado_por` eran texto libre, porque aún no existía la tabla de usuarios.

## Decisión

- Las tres columnas son `UUID` con clave foránea a `usuario(id)` y acción `RESTRICT`.
- Los usuarios no se borran, se desactivan (`usuario.activo`). Así el historial nunca queda con un autor inexistente.
- Las columnas conservan sus nombres. Con el mismo nombre y un tipo compatible, las funciones `auditar_registro` y `proteger_registro` del kit se copian sin cambios a la migración.

## Consecuencias

- Todo cambio queda atribuido a una persona real y el historial se puede cruzar con `usuario`.
- Un valor que no sea UUID falla con SQLSTATE 22P02 (uuid inválido) antes de que PostgreSQL compruebe privilegios. Las pruebas de la base que verifican el 42501 deben usar UUID válidos, o dejarían de probar el permiso.
- Las pruebas de reglas crean tres usuarios de prueba antes de escribir registros.
